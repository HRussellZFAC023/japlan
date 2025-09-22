"""Itinerary planning utilities for Japlan.

This module builds min-max (k-center) geographic clusters for all places,
then assigns those clusters to daily routes that respect commuting flow,
friend availability, and the desire to avoid revisiting the same cluster.

The resulting plan updates each place with a day/date, rewritten concise
notes, and cluster labels that are suitable for Google My Maps and Notion
imports.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
import json
import math
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class Place:
    """Represents a single stop from the raw spreadsheet."""

    index: int
    row: Dict[str, str]
    lat: float
    lon: float
    cluster_id: Optional[int] = None
    cluster_label: str = ""
    day_index: Optional[int] = None
    assigned_time: Optional[datetime] = None
    is_flex: bool = False
    time_window: Optional[str] = None

    @property
    def name(self) -> str:
        return self.row.get("Name", "").strip()

    @property
    def raw_note(self) -> str:
        return self.row.get("Notes", "")

    @property
    def type_tokens(self) -> List[str]:
        raw = self.row.get("Type", "")
        return [token.strip() for token in raw.split(",") if token.strip()]

    @property
    def primary_type(self) -> str:
        tokens = self.type_tokens
        if not tokens:
            return "Other"
        mapping = {
            "Food": "Food",
            "Attractions": "Attractions",
            "Shopping": "Shopping",
            "Accommodation": "Accommodation",
            "Travel": "Travel",
            "Needs Booking": "Other",
            "Other": "Other",
        }
        for token in tokens:
            if token in mapping:
                return mapping[token]
        first = tokens[0].lower()
        for key, value in mapping.items():
            if key.lower() in first:
                return value
        return "Other"


@dataclass
class Cluster:
    id: int
    members: List[Place]
    centroid_lat: float
    centroid_lon: float
    label: str = ""
    region: str = ""

    def to_dict(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "label": self.label,
            "region": self.region,
            "centroid": [self.centroid_lat, self.centroid_lon],
            "members": [p.name for p in self.members],
        }


@dataclass
class DaySummary:
    day_index: int
    title: str
    date: date
    clusters: List[str]
    stops: List[str]

    def to_dict(self) -> Dict[str, object]:
        return {
            "day": self.day_index,
            "title": self.title,
            "date": self.date.isoformat(),
            "clusters": self.clusters,
            "stops": self.stops,
        }


@dataclass
class DayBlueprint:
    day: int
    title: str
    regions: Sequence[str]
    required_labels: Sequence[str]
    optional_labels: Sequence[str]
    max_clusters: int
    start_time: time
    friends: Sequence[str]
    flex_labels: Sequence[str] = field(default_factory=list)
    allow_fill: bool = True
    start_label: Optional[str] = None


# ---------------------------------------------------------------------------
# Constants & configuration
# ---------------------------------------------------------------------------

BASE_DATE = date(2025, 11, 14)
MAX_CLUSTER_RADIUS_KM = 0.85
OUTPUT_CLUSTER_JSON = Path("data/cache/cluster_plan.json")
OUTPUT_DAY_JSON = Path("data/cache/day_plan.json")

FORCE_SOLO_NAMES = {
    "kansaiinternationalairportdxbkixek3161330",
    "kansaiinternationalairport2310kixdxbek317",
    "hotelagoraosakamoriguchi",
    "wosaka",
    "omo7osaka",
    "sequencemiyashitapark",
    "mimarutokyoshinjukuwest",
    "kyomachiyaryokansakuraurushitei",
    "ekointemple",
    "kuromonmarket",
    "nambayasakajinja",
    "torameyokocho",
    "karaokekanshinsaibashi",
    "donquijote",
    "riceballgorichan",
    "shinsaibashisujishoppingstreet",
    "afternoonglamrestock",
}

REGION_RULES: List[Tuple[str, Tuple[float, float, float, float]]] = [
    ("Kansai Airport", (34.5, 34.0, 135.5, 135.1)),
    ("Koyasan", (34.25, 34.15, 135.65, 135.50)),
    ("Himeji", (34.85, 34.70, 134.80, 134.60)),
    ("Kobe", (34.80, 34.60, 135.30, 135.05)),
    ("Osaka", (34.85, 34.55, 135.60, 135.35)),
    ("Hirakata", (34.90, 34.70, 135.75, 135.55)),
    ("Kyoto", (35.10, 34.90, 135.85, 135.60)),
    ("Nara", (34.75, 34.60, 135.90, 135.70)),
    ("Uji", (35.00, 34.80, 135.85, 135.70)),
    ("Tokyo", (35.80, 35.55, 139.90, 139.60)),
    ("Odaiba", (35.70, 35.60, 139.85, 139.75)),
    ("Toyosu", (35.68, 35.60, 139.83, 139.75)),
]

# Keywords mapped to human-friendly cluster labels.
LABEL_RULES: List[Tuple[Sequence[str], str]] = [
    (["→ dxb"], "KIX Departure"),
    (["→ kix"], "KIX Arrival"),
    (["hotel agora"], "Agora Riverside Base"),
    (["dotonbori", "tombori", "hozenji"], "Osaka Minami Street Food"),
    (["torame yokocho"], "Torame Yokocho Night Bites"),
    (["afternoon glam"], "Afternoon Glam & Restock"),
    (["shinsaibashi-suji"], "Shinsaibashi-Suji Stroll"),
    (["don quijote"], "Osaka Late-Night Donki"),
    (["shinsaibashi", "donguri republic", "afternoon glam"], "Shinsaibashi Party Prep"),
    (["kuromon"], "Kuromon Market Crawl"),
    (["rikuro", "takamura", "masahiko", "cafe annon"], "Osaka Sweet Cravings"),
    (["riceball gori"], "Osaka Onigiri Snack"),
    (["osaka castle", "brooklyn roasting", "& coffee"], "Osaka Castle Morning"),
    (["grand front", "umeda sky", "osaka museum", "hep five", "osaka station"], "Umeda Skylines"),
    (["cup noodles"], "Ikeda Cup Noodles"),
    (["universal studios"], "Universal Studios Japan Adventure"),
    (["kaiyukan"], "Kaiyukan Twilight Wander"),
    (["tempozan"], "Tempozan Marketplace Stroll"),
    (["takoume"], "Takoume Late Dinner"),
    (["kyushu ramen kio"], "Kyushu Ramen Kio"),
    (["tsite", "bear paw", "hirakata park", "kushikatsu tanaka", "torisei", "kuzuha"], "Hirakata Local Day"),
    (["gokurakuyu"], "Hirakata Wellness Break"),
    (["himeji"], "Himeji Heritage Walk"),
    (["kobe nunobiki", "steakland"], "Kobe Herb View"),
    (["arima onsen"], "Arima Onsen Retreat"),
    (["kobe harborland"], "Kobe Harbor Nights"),
    (["nishiki market", "pontocho", "gion", "kyoto yakiniku"], "Kyoto Downtown Bites"),
    (["kyomachiya"], "Kyomachiya Stay"),
    (["kiyomizu", "sannenzaka", "kodaiji", "camellia"], "Kyoto Higashiyama Morning"),
    (["fushimi inari"], "Fushimi Sunset Gates"),
    (["gekkeikan"], "Fushimi Sake Cellar"),
    (["arashiyama bamboo"], "Arashiyama Sunrise Trail"),
    (["tenryu-ji", "arashiyama yoshimura"], "Arashiyama Riverside Lunch"),
    (["itsukichaya", "rilakkuma", "miffy", "namu cafe", "cafe reissue"], "Arashiyama Cute Cafes"),
    (["kinkaku", "ryoan", "heian", "eikan"], "Kyoto Zen North"),
    (["tsuen tea", "byōdō"], "Uji Tea Pilgrimage"),
    (["eikan-dō", "eikando"], "Eikan-dō Autumn Walk"),
    (["philosopher"], "Philosopher's Path"),
    (["okutan"], "Okutan Nanzenji Lunch"),
    (["tōfuku", "tofuku"], "Tōfuku-ji Canopies"),
    (["nara park", "tōdai-ji", "nakatanidou"], "Nara Deer Route"),
    (["teamlab botanical"], "Nagai Night Lights"),
    (["namba to koyasan"], "Koyasan Ropeway Ascent"),
    (["kongobu"], "Koyasan Temple Tour"),
    (["eko-in"], "Eko-in Temple Stay"),
    (["okunoin"], "Okunoin Night Walk"),
    (["meiji jingu"], "Meiji Forest Walk"),
    (["takeshita", "cat street", "daikanyama", "nakameguro", "soosh", "cinnamoroll"], "Harajuku Street Mix"),
    (["afuri"], "Harajuku Ramen Stop"),
    (["shibuya sky", "shibuya crossing", "shibuya 109", "sequence miyashita", "karaoke kan shibuya"], "Shibuya Arrival Loop"),
    (["gonpachi"], "Gonpachi Dinner"),
    (["kaikaya"], "Shibuya Seafood Welcome"),
    (["teamlab planets"], "teamLab Planets"),
    (["pokemon café"], "Pokémon Cafe"),
    (["toyosu"], "Toyosu Morning Feast"),
    (["odaiba"], "Odaiba Seaside"),
    (["karaoke kan shinsaibashi"], "Karaoke Kan Shinsaibashi"),
    (["karaoke kan shibuya"], "Karaoke Night Shibuya"),
    (["ichiran"], "Ichiran Late Ramen"),
    (["tokyo disneysea"], "Tokyo DisneySea Day"),
    (["disney hotel"], "Disney Hotel Tea"),
    (["mimaru"], "MIMARU Tokyo Base"),
    (["sequence miyashita"], "Sequence Miyashita Park"),
    (["nozomi", "shin-osaka"], "Nozomi Northbound"),
    (["tokyo station", "nozomi express"], "Nozomi Southbound"),
    (["tokyo skytree"], "Tokyo Skytree Deck"),
    (["senso-ji"], "Asakusa Sunrise"),
    (["tokyo character street"], "Tokyo Character Street"),
    (["animate"], "Animate Ikebukuro"),
    (["gigo"], "GiGO Shibuya"),
    (["genshin impact"], "Shibuya Anime Arcades"),
    (["nhk studio"], "NHK Studio Park"),
    (["imperial palace"], "Imperial Palace Gardens"),
    (["teamlab botanical"], "Nagai Night Lights"),
    (["loft"], "Shibuya Loft Dash"),
    (["pontocho"], "Pontocho Alley"),
    (["hepfive"], "HEP Five Wheel"),
    (["rinku premium"], "Rinku Premium Outlets"),
    (["takamura"], "Takamura Farewell Brunch"),
    (["bar nayuta"], "Bar Nayuta Rooftop"),
    (["mydo"], "MYDO Teppanyaki Feast"),
    (["w osaka"], "W Osaka Birthday Core"),
]

MANUAL_LABEL_MAP: List[Tuple[str, str]] = [
    ("Kansai International Airport DXB → KIX (EK316) 13:30", "KIX Arrival"),
    ("Kansai International Airport 23:10 KIX → DXB (EK317)", "KIX Departure"),
    ("Hotel Agora Osaka Moriguchi", "Agora Riverside Base"),
    ("Torame Yokocho", "Torame Yokocho Night Bites"),
    ("W Osaka", "W Osaka Birthday Core"),
    ("Karaoke Kan Shinsaibashi", "Karaoke Kan Shinsaibashi"),
    ("Eko-in Temple", "Eko-in Temple Stay"),
    ("Afternoon Glam & Restock", "Afternoon Glam & Restock"),
    ("Don Quijote", "Osaka Late-Night Donki"),
    ("Riceball Gori-chan", "Osaka Onigiri Snack"),
    ("Dotonbori", "Osaka Minami Street Food"),
    ("Rikuro's", "Osaka Sweet Cravings"),
    ("Osaka Castle", "Osaka Castle Morning"),
    ("Umeda Sky Building", "Umeda Skylines"),
    ("Osaka Museum of Housing and Living", "Osaka Museum of Housing"),
    ("HEP FIVE Ferris Wheel", "HEP Five Wheel"),
    ("Cup Noodles Museum", "Ikeda Cup Noodles"),
    ("Universal Studios Japan", "Universal Studios Japan Adventure"),
    ("Osaka Aquarium Kaiyukan", "Kaiyukan Twilight Wander"),
    ("Tempozan Marketplace", "Tempozan Marketplace Stroll"),
    ("Kyushu Ramen Kio", "Kyushu Ramen Kio"),
    ("Takoume Honten", "Takoume Late Dinner"),
    ("Café & Meal MUJI", "Hirakata Local Day"),
    ("Kushikatsu Tanaka", "Hirakata Local Day"),
    ("Torisei Hirakata", "Hirakata Local Day"),
    ("Gokurakuyu Hirakata", "Hirakata Wellness Break"),
    ("Hirakata Park", "Hirakata Park"),
    ("Kuzuha Mall", "Kuzuha Mall Late Run"),
    ("Bear Paw Cafe", "Bear Paw Cafe Break"),
    ("OMO7 Osaka", "OMO7 Osaka Stay"),
    ("Himeji Castle", "Himeji Heritage Walk"),
    ("Kobe Nunobiki Herb Gardens", "Kobe Herb View"),
    ("Steakland Kobe", "Steakland Kobe Lunch"),
    ("Arima Onsen Taiko-no-yu", "Arima Onsen Retreat"),
    ("Kobe Harborland", "Kobe Harbor Nights"),
    ("Kyomachiya Ryokan Sakura Urushitei", "Kyomachiya Stay"),
    ("Nishiki Market", "Kyoto Downtown Bites"),
    ("Pontocho Alley", "Pontocho Alley"),
    ("Kiyomizu-dera", "Kyoto Higashiyama Morning"),
    ("Sannenzaka & Ninenzaka", "Kyoto Higashiyama Morning"),
    ("Kōdai-ji", "Kyoto Higashiyama Morning"),
    ("Gekkeikan Okura Sake Museum", "Fushimi Sake Cellar"),
    ("Fushimi Inari Taisha", "Fushimi Sunset Gates"),
    ("Arashiyama Bamboo Forest", "Arashiyama Day Circuit"),
    ("Tenryu-ji", "Arashiyama Day Circuit"),
    ("Arashiyama Yoshimura", "Arashiyama Day Circuit"),
    ("Kimono Forest", "Arashiyama Day Circuit"),
    ("Byōdō-in", "Uji Tea Pilgrimage"),
    ("Tsuen Tea", "Uji Tea Pilgrimage"),
    ("Kinkaku-ji", "Kyoto Zen North"),
    ("Ryōan-ji", "Kyoto Zen Gardens"),
    ("Camellia Tea Ceremony", "Kyoto Zen Gardens"),
    ("Honke Owariya", "Kyoto Soba Lunch"),
    ("Heian Shrine", "Heian Shrine"),
    ("Kyoto Station Sky Garden", "Kyoto Station Sky Garden"),
    ("teamLab Botanical Garden", "Nagai Night Lights"),
    ("Sequence MIYASHITA PARK", "Sequence Miyashita Park"),
    ("MIMARU Tokyo Shinjuku WEST", "MIMARU Tokyo Base"),
    ("Meiji Jingu", "Meiji Forest Walk"),
    ("Takeshita Street", "Harajuku Street Mix"),
    ("Cat Street", "Harajuku Street Mix"),
    ("Daikanyama T-Site", "Daikanyama Stroll"),
    ("Nakameguro", "Daikanyama Stroll"),
    ("Shibuya Sky", "Shibuya Night Circuit"),
    ("Shibuya Crossing", "Shibuya Night Circuit"),
    ("Shibuya 109", "Shibuya Night Circuit"),
    ("Suga Jinja", "Suga Shrine Steps"),
    ("Loft", "Shibuya Loft Dash"),
    ("Ikeda-ya TeaStore", "Shibuya Loft Dash"),
    ("Cinnamoroll Cafe", "Shibuya Loft Dash"),
    ("Unitora Nakadori", "Tsukiji Uni Bowls"),
    ("Uniqlo Ginza", "Uniqlo Ginza Flagship"),
    ("Shiba Park", "Shiba Park Morning"),
    ("Tokyo Tower", "Tokyo Tower View"),
    ("Pokémon Café", "Pokémon Cafe"),
    ("teamLab Planets", "Toyosu Morning & teamLab"),
    ("Toyosu Market", "Toyosu Morning & teamLab"),
    ("Odaiba Seaside Park", "Odaiba Seaside"),
    ("Tokyo DisneySea", "Tokyo DisneySea Day"),
    ("Disney Hotel", "Disney Hotel Tea"),
    ("Senso-ji", "Asakusa Sunrise"),
    ("Asakusaimahan", "Asakusa Sunrise"),
    ("Tokyo Skytree", "Tokyo Skytree Deck"),
    ("Tokyo Character Street", "Tokyo Character Street"),
    ("Tokyo Ramen Yokocho", "Tokyo Character Street"),
    ("2D Cafe", "2D Latte Stop"),
    ("Hello Donuts", "Hello Donuts Treats"),
    ("Animate Ikebukuro", "Animate Ikebukuro"),
    ("Imperial Palace East Gardens", "Imperial Palace Gardens"),
    ("Maidreamin Akihabara", "Maidreamin Akihabara"),
    ("NHK Studio Park", "NHK Studio Park"),
    ("Takamura Wine & Coffee", "Takamura Farewell Brunch"),
    ("Rinku Premium Outlets", "Rinku Premium Outlets"),
    ("Philosopher's Path", "Philosopher's Path"),
    ("Eikan-dō Zenrin-ji", "Okutan Nanzenji Lunch"),
    ("Okutan Nanzenji", "Okutan Nanzenji Lunch"),
    ("Tōfuku-ji", "Tōfuku-ji Canopies"),
    ("Torame Yokocho", "Torame Yokocho Night Bites"),
    ("Shinpachi Shokudō", "Shinpachi Shinjuku Breakfast"),
    ("Tofu Cuisine Sorano", "Shibuya Tofu Dinner"),
    ("Shunsai Imari", "Kyoto Morning Eats"),
    ("Shabusen", "Shabusen Shabu"),
    ("Waka Kimono Rental", "Waka Kimono Rental"),
    ("Kura Sushi", "Kura Sushi Conveyor"),
    ("GU", "GU Flagship Osaka"),
    ("(THISIS)SHIZEN", "Shizen Flower Ice Cream"),
    ("Udon Maruka", "Udon Maruka Queue"),
    ("Shinsekai", "Shinsekai Retro Stroll"),
    ("MYDO Teppanyaki", "MYDO Teppanyaki Feast"),
    ("Bar Nayuta", "Bar Nayuta Rooftop"),
    ("Gonpachi Shibuya", "Gonpachi Dinner"),
    ("Karaoke Kan Shibuya", "Karaoke Night Shibuya"),
    ("Ichiran Ramen", "Ichiran Late Ramen"),
    ("Brooklyn Roasting Company", "Brooklyn Roasting Break"),
    ("Human Beings Everybody Noodles", "Nakazakicho Ramen"),
    ("Tōdai-ji", "Nara Deer Route"),
    ("Nara Park", "Nara Deer Route"),
    ("Nakatanidou", "Nakatanidou Mochi"),
    ("Kuromon Market", "Kuromon Market Crawl"),
    ("Shinsaibashi-Suji Shopping Street", "Shinsaibashi-Suji Stroll"),
    ("Namba Yasaka Jinja", "Namba Yasaka Jinja"),
]

LABEL_ALIASES: Dict[str, str] = {
    "Eikan-dō Autumn Walk": "Okutan Nanzenji Lunch",
    "Harajuku Ramen Stop": "Meiji Forest Walk",
    "Karaoke Night Shibuya": "Shibuya Night Circuit",
    "Shibuya Seafood Welcome": "Shibuya Night Circuit",
    "Nozomi Southbound": "Tokyo Character Street",
    "Toyosu Morning Feast": "Toyosu Morning & teamLab",
    "Shinsaibashi Party Prep": "Afternoon Glam & Restock",
}

FLEX_LABELS = {
    "Osaka Late-Night Donki",
    "Osaka Sweet Cravings",
    "Osaka Onigiri Snack",
    "Ikeda Cup Noodles",
    "Takoume Late Dinner",
    "Kuzuha Mall Late Run",
    "Bear Paw Cafe Break",
    "Nagai Night Lights",
    "Shibuya Loft Dash",
    "Animate Ikebukuro",
    "Maidreamin Akihabara",
    "Imperial Palace Gardens",
    "Nakatanidou Mochi",
    "Kyoto Soba Lunch",
    "Kyoto Station Sky Garden",
    "Daikanyama Stroll",
    "Brooklyn Roasting Break",
    "Nakazakicho Ramen",
    "Kura Sushi Conveyor",
    "GU Flagship Osaka",
    "Shinsekai Retro Stroll",
    "Udon Maruka Queue",
    "Tsukiji Uni Bowls",
    "Uniqlo Ginza Flagship",
    "Tokyo Tower View",
    "Shiba Park Morning",
    "2D Latte Stop",
    "Hello Donuts Treats",
    "Suga Shrine Steps",
    "Shabusen Shabu",
    "Shinpachi Shinjuku Breakfast",
    "Shibuya Tofu Dinner",
    "Shizen Flower Ice Cream",
}

DAY_BLUEPRINTS: List[DayBlueprint] = [
    DayBlueprint(
        day=1,
        title="Arrival & Minami Night",
        regions=["Kansai Airport", "Osaka"],
        required_labels=["KIX Arrival", "Agora Riverside Base", "Osaka Minami Street Food"],
        optional_labels=["Osaka Late-Night Donki", "Osaka Sweet Cravings"],
        max_clusters=7,
        start_time=time(13, 0),
        friends=["Henry", "Nanako"],
        flex_labels=["Osaka Late-Night Donki", "Osaka Sweet Cravings"],
        start_label="KIX Arrival",
        allow_fill=False,
    ),
    DayBlueprint(
        day=2,
        title="Osaka Icons & Umeda",
        regions=["Osaka"],
        required_labels=["Osaka Castle Morning", "Umeda Skylines"],
        optional_labels=[
            "Osaka Museum of Housing",
            "HEP Five Wheel",
            "Osaka Sweet Cravings",
            "Osaka Onigiri Snack",
            "Brooklyn Roasting Break",
            "Nakazakicho Ramen",
        ],
        max_clusters=7,
        start_time=time(9, 0),
        friends=["Henry", "Nanako"],
        flex_labels=["Osaka Sweet Cravings", "Osaka Onigiri Snack"],
        start_label="Osaka Castle Morning",
        allow_fill=True,
    ),
    DayBlueprint(
        day=3,
        title="Osaka Bay Adventure",
        regions=["Osaka"],
        required_labels=["Universal Studios Japan Adventure", "Kaiyukan Twilight Wander"],
        optional_labels=["Tempozan Marketplace Stroll", "Ikeda Cup Noodles", "Kyushu Ramen Kio", "Takoume Late Dinner"],
        max_clusters=5,
        start_time=time(8, 30),
        friends=["Henry", "Nanako"],
        flex_labels=["Ikeda Cup Noodles", "Takoume Late Dinner"],
        start_label="Universal Studios Japan Adventure",
        allow_fill=False,
    ),
    DayBlueprint(
        day=4,
        title="Himeji & Kobe Day Trip",
        regions=["Himeji", "Kobe"],
        required_labels=["Himeji Heritage Walk", "Kobe Herb View", "Arima Onsen Retreat", "Kobe Harbor Nights"],
        optional_labels=["Steakland Kobe Lunch"],
        max_clusters=5,
        start_time=time(7, 30),
        friends=["Henry", "Nanako"],
        start_label="Himeji Heritage Walk",
        allow_fill=False,
    ),
    DayBlueprint(
        day=5,
        title="Hirakata Work Rhythm",
        regions=["Hirakata", "Osaka"],
        required_labels=["Hirakata Local Day", "Hirakata Wellness Break"],
        optional_labels=["Hirakata Park", "Kuzuha Mall Late Run", "Bear Paw Cafe Break", "Osaka Sweet Cravings"],
        max_clusters=5,
        start_time=time(8, 0),
        friends=["Henry", "Nanako"],
        flex_labels=["Hirakata Local Day", "Kuzuha Mall Late Run", "Bear Paw Cafe Break", "Osaka Sweet Cravings"],
        start_label="Hirakata Local Day",
        allow_fill=True,
    ),
    DayBlueprint(
        day=6,
        title="Kyoto Higashiyama & Fushimi",
        regions=["Kyoto", "Uji"],
        required_labels=["Kyoto Higashiyama Morning", "Kyoto Downtown Bites", "Pontocho Alley", "Fushimi Sunset Gates", "Fushimi Sake Cellar"],
        optional_labels=["Kyomachiya Stay", "Kyoto Soba Lunch", "Kyoto Station Sky Garden", "Waka Kimono Rental"],
        max_clusters=8,
        start_time=time(6, 0),
        friends=["Henry", "Nanako"],
        start_label="Kyoto Higashiyama Morning",
        allow_fill=True,
    ),
    DayBlueprint(
        day=7,
        title="Arashiyama Dawn & Tea",
        regions=["Kyoto", "Uji"],
        required_labels=["Arashiyama Day Circuit", "Uji Tea Pilgrimage", "Kyoto Zen North"],
        optional_labels=["OMO7 Osaka Stay", "Kyoto Zen Gardens", "Kyoto Station Sky Garden", "Shizen Flower Ice Cream"],
        max_clusters=6,
        start_time=time(5, 30),
        friends=["Henry", "Nanako"],
        start_label="Arashiyama Day Circuit",
        allow_fill=True,
    ),
    DayBlueprint(
        day=8,
        title="Work Sprint & Shibuya Arrival",
        regions=["Osaka", "Tokyo"],
        required_labels=["Nozomi Northbound", "Sequence Miyashita Park"],
        optional_labels=[],
        max_clusters=3,
        start_time=time(8, 0),
        friends=["Henry", "Nanako"],
        start_label="Nozomi Northbound",
        allow_fill=False,
    ),
    DayBlueprint(
        day=9,
        title="Harajuku & Shibuya With Friends",
        regions=["Tokyo"],
        required_labels=["Meiji Forest Walk", "Harajuku Street Mix", "Shibuya Night Circuit"],
        optional_labels=[
            "Shibuya Loft Dash",
            "Karaoke Night Shibuya",
            "Ichiran Late Ramen",
            "Suga Shrine Steps",
            "Shibuya Tofu Dinner",
        ],
        max_clusters=8,
        start_time=time(9, 0),
        friends=["Henry", "Nanako", "Nicole", "Ken", "James", "Phil"],
        start_label="Meiji Forest Walk",
        allow_fill=False,
    ),
    DayBlueprint(
        day=10,
        title="Toyosu Morning & Odaiba Glow",
        regions=["Tokyo", "Odaiba", "Toyosu"],
        required_labels=["Toyosu Morning & teamLab", "Odaiba Seaside", "MIMARU Tokyo Base"],
        optional_labels=[
            "Pokémon Cafe",
            "Tsukiji Uni Bowls",
            "Uniqlo Ginza Flagship",
            "Daikanyama Stroll",
            "Animate Ikebukuro",
        ],
        max_clusters=8,
        start_time=time(7, 0),
        friends=["Henry", "Nanako", "Nicole", "Ken"],
        start_label="Toyosu Morning & teamLab",
        allow_fill=False,
    ),
    DayBlueprint(
        day=11,
        title="DisneySea Celebration",
        regions=["Tokyo"],
        required_labels=["Tokyo DisneySea Day", "Disney Hotel Tea"],
        optional_labels=[],
        max_clusters=3,
        start_time=time(7, 30),
        friends=["Henry", "Nanako", "Nicole", "Ken"],
        start_label="Tokyo DisneySea Day",
        allow_fill=False,
    ),
    DayBlueprint(
        day=12,
        title="Asakusa Sunrise & Return South",
        regions=["Tokyo"],
        required_labels=["Asakusa Sunrise", "Tokyo Skytree Deck", "Tokyo Character Street"],
        optional_labels=[
            "Shabusen Shabu",
            "Shinpachi Shinjuku Breakfast",
            "Udon Maruka Queue",
            "Imperial Palace Gardens",
            "2D Latte Stop",
            "Tokyo Tower View",
            "Shiba Park Morning",
            "Uniqlo Ginza Flagship",
            "Animate Ikebukuro",
            "Tsukiji Uni Bowls",
            "Shibuya Tofu Dinner",
        ],
        max_clusters=9,
        start_time=time(6, 0),
        friends=["Henry", "Nanako"],
        start_label="Asakusa Sunrise",
        allow_fill=True,
    ),
    DayBlueprint(
        day=13,
        title="Nara Morning & Osaka Evening",
        regions=["Nara", "Osaka"],
        required_labels=["Nara Deer Route", "Kuromon Market Crawl", "Nagai Night Lights"],
        optional_labels=[
            "Namba Yasaka Jinja",
            "Shinsaibashi-Suji Stroll",
            "Afternoon Glam & Restock",
            "Shinsekai Retro Stroll",
            "Torame Yokocho Night Bites",
            "Kura Sushi Conveyor",
            "GU Flagship Osaka",
            "Nakatanidou Mochi",
            "Osaka Sweet Cravings",
            "Osaka Onigiri Snack",
            "OMO7 Osaka Stay",
            "Brooklyn Roasting Break",
            "Nakazakicho Ramen",
        ],
        max_clusters=11,
        start_time=time(7, 30),
        friends=["Henry", "Nanako"],
        start_label="Nara Deer Route",
        allow_fill=True,
    ),
    DayBlueprint(
        day=14,
        title="Koyasan Pilgrimage",
        regions=["Koyasan"],
        required_labels=["Koyasan Ropeway Ascent", "Koyasan Temple Tour", "Eko-in Temple Stay", "Okunoin Night Walk"],
        optional_labels=[],
        max_clusters=4,
        start_time=time(8, 0),
        friends=["Henry", "Nanako"],
        start_label="Koyasan Ropeway Ascent",
        allow_fill=False,
    ),
    DayBlueprint(
        day=15,
        title="W Osaka Birthday",
        regions=["Osaka"],
        required_labels=["W Osaka Birthday Core", "MYDO Teppanyaki Feast", "Karaoke Kan Shinsaibashi", "Bar Nayuta Rooftop"],
        optional_labels=["Afternoon Glam & Restock", "Osaka Sweet Cravings"],
        max_clusters=6,
        start_time=time(11, 0),
        friends=["Henry", "Nanako", "Nicole", "Ken", "Phil"],
        start_label="W Osaka Birthday Core",
        allow_fill=False,
    ),
    DayBlueprint(
        day=16,
        title="Kyoto Autumn Encore",
        regions=["Kyoto"],
        required_labels=["Philosopher's Path", "Okutan Nanzenji Lunch", "Tōfuku-ji Canopies", "Kyoto Zen Gardens"],
        optional_labels=["Kyoto Zen North", "Kyoto Downtown Bites", "Kyoto Soba Lunch", "Waka Kimono Rental", "Shizen Flower Ice Cream"],
        max_clusters=6,
        start_time=time(8, 0),
        friends=["Henry", "Nanako", "Nicole", "Ken"],
        start_label="Philosopher's Path",
        allow_fill=True,
    ),
    DayBlueprint(
        day=17,
        title="Farewell Kansai",
        regions=["Osaka", "Kansai Airport"],
        required_labels=["Takamura Farewell Brunch", "Rinku Premium Outlets", "KIX Departure"],
        optional_labels=["Osaka Onigiri Snack", "Osaka Sweet Cravings"],
        max_clusters=5,
        start_time=time(9, 0),
        friends=["Henry", "Nanako"],
        start_label="Takamura Farewell Brunch",
        allow_fill=False,
    ),
]

# ---------------------------------------------------------------------------
# Manual schedule (logistics-aware pass)
# ---------------------------------------------------------------------------

MANUAL_DAY_TITLES: Dict[int, str] = {
    1: "Arrival & Hirakata Welcome",
    2: "Osaka Minami Food Crawl",
    3: "Osaka Castle & Umeda Lights",
    4: "Kyoto Higashiyama & Fushimi",
    5: "Hirakata Workday Wind-down",
    6: "Koyasan Temple Stay",
    7: "Osaka Bay Twilight",
    8: "Shinkansen to Shibuya",
    9: "Tokyo DisneySea Day",
    10: "Toyosu Morning & Odaiba Glow",
    11: "Harajuku & Shibuya Crew Day",
    12: "Asakusa Dawn & Osaka Return",
    13: "Nara Morning & Osaka Night",
    14: "Himeji Heritage & Kobe Night",
    15: "W Osaka Birthday Bash",
    16: "Kyoto Maple Finale",
    17: "Farewell Kansai",
}

MANUAL_DAY_FRIENDS: Dict[int, List[str]] = {
    1: ["Henry", "Nanako"],
    2: ["Henry", "Nanako"],
    3: ["Henry", "Nanako"],
    4: ["Henry", "Nanako"],
    5: ["Henry", "Nanako"],
    6: ["Henry", "Nanako"],
    7: ["Henry", "Nanako"],
    8: ["Henry", "Nanako", "Nicole", "Ken"],
    9: ["Henry", "Nanako", "Nicole", "Ken"],
    10: ["Henry", "Nanako", "Nicole", "Ken"],
    11: ["Henry", "Nanako", "Nicole", "Ken", "James", "Phil"],
    12: ["Henry", "Nanako"],
    13: ["Henry", "Nanako"],
    14: ["Henry", "Nanako"],
    15: ["Henry", "Nanako", "Nicole", "Ken", "Phil"],
    16: ["Henry", "Nanako", "Nicole", "Ken"],
    17: ["Henry", "Nanako"],
}

MANUAL_DAY_SCHEDULE: Dict[int, List[Dict[str, object]]] = {
    1: [
        {
            "name": "Kansai International Airport DXB → KIX (EK316) 13:30",
            "start": time(13, 30),
            "window": "Arrival (13:00-15:00)",
        },
        {
            "name": "Hotel Agora Osaka Moriguchi",
            "start": time(16, 30),
            "window": "Check-in (16:00-17:00)",
        },
        {
            "name": "Torisei Hirakata",
            "start": time(19, 0),
            "window": "Dinner with Nana (19:00-21:00)",
        },
    ],
    2: [
        {
            "name": "CAFE ANNON",
            "start": time(9, 30),
            "window": "Brunch pancakes (09:30-10:30)",
        },
        {
            "name": "Shinsaibashi-Suji Shopping Street",
            "start": time(10, 45),
            "window": "Streetwear hunt (10:45-12:15)",
        },
        {
            "name": "Kuromon Market",
            "start": time(12, 30),
            "window": "Seafood lunch (12:30-13:45)",
        },
        {
            "name": "Namba Yasaka Jinja",
            "start": time(14, 0),
            "window": "Shrine photos (14:00-14:30)",
        },
        {
            "name": "Dotonbori",
            "start": time(15, 15),
            "window": "Neon stroll (15:15-16:45)",
        },
        {
            "name": "Tombori River Cruise",
            "start": time(17, 0),
            "window": "River cruise (17:00-17:45)",
        },
        {
            "name": "Okonomiyaki Mizuno",
            "start": time(18, 15),
            "window": "Okonomiyaki dinner (18:15-19:30)",
        },
        {
            "name": "Hozenji Yokocho",
            "start": time(19, 45),
            "window": "Lantern lane (19:45-20:30)",
        },
        {
            "name": "Don Quijote",
            "start": time(20, 45),
            "window": "Late-night shop (20:45-21:30)",
            "flex": True,
        },
    ],
    3: [
        {
            "name": "Osaka Castle",
            "start": time(8, 30),
            "window": "Castle tour (08:30-10:00)",
        },
        {
            "name": "& COFFEE MAISON",
            "start": time(10, 5),
            "window": "Soufflé break (10:05-11:00)",
        },
        {
            "name": "Brooklyn Roasting Company",
            "start": time(11, 20),
            "window": "Coffee pause (11:20-12:00)",
        },
        {
            "name": "Osaka Station City",
            "start": time(12, 20),
            "window": "Depachika lunch (12:20-13:30)",
        },
        {
            "name": "Osaka Museum of Housing and Living",
            "start": time(14, 0),
            "window": "Edo alley walk (14:00-15:15)",
        },
        {
            "name": "Grand Front Osaka",
            "start": time(15, 30),
            "window": "Dessert scouting (15:30-16:15)",
        },
        {
            "name": "Umeda Sky Building",
            "start": time(16, 30),
            "window": "Sunset observatory (16:30-18:00)",
        },
        {
            "name": "HEP FIVE Ferris Wheel",
            "start": time(18, 15),
            "window": "Ferris wheel (18:15-18:45)",
        },
        {
            "name": "Human Beings Everybody Noodles",
            "start": time(19, 15),
            "window": "Creative ramen (19:15-20:15)",
        },
    ],
    4: [
        {
            "name": "Kiyomizu-dera",
            "start": time(6, 0),
            "window": "Sunrise stage (06:00-07:15)",
        },
        {
            "name": "Sannenzaka & Ninenzaka",
            "start": time(7, 20),
            "window": "Old Kyoto lanes (07:20-08:15)",
        },
        {
            "name": "Waka Kimono Rental",
            "start": time(8, 20),
            "window": "Kimono styling (08:20-09:00)",
            "flex": True,
        },
        {
            "name": "Camellia Tea Ceremony",
            "start": time(9, 30),
            "window": "Tea lesson (09:30-10:15)",
        },
        {
            "name": "Honke Owariya",
            "start": time(10, 45),
            "window": "Soba brunch (10:45-11:45)",
        },
        {
            "name": "Fushimi Inari Taisha",
            "start": time(12, 30),
            "window": "Torii hike (12:30-14:00)",
        },
        {
            "name": "Gekkeikan Okura Sake Museum",
            "start": time(14, 10),
            "window": "Sake tasting (14:10-15:00)",
        },
        {
            "name": "Tsuen Tea",
            "start": time(15, 30),
            "window": "Matcha flight (15:30-16:15)",
        },
        {
            "name": "Byōdō-in",
            "start": time(16, 20),
            "window": "Phoenix Hall (16:20-17:30)",
        },
    ],
    5: [
        {
            "name": "Café & Meal MUJI",
            "start": time(12, 0),
            "window": "Workday lunch (12:00-13:00)",
        },
        {
            "name": "Bear Paw Cafe",
            "start": time(15, 30),
            "window": "Coffee break (15:30-16:00)",
        },
        {
            "name": "Gokurakuyu Hirakata",
            "start": time(18, 0),
            "window": "Onsen soak (18:00-19:30)",
        },
        {
            "name": "Kushikatsu Tanaka",
            "start": time(19, 45),
            "window": "Skewers dinner (19:45-21:00)",
        },
        {
            "name": "Kuzuha Mall",
            "start": time(21, 0),
            "window": "Late errands (21:00-22:00)",
            "flex": True,
        },
    ],
    6: [
        {
            "name": "Namba to Koyasan",
            "start": time(8, 0),
            "window": "Limited Express ascent (08:00-10:30)",
        },
        {
            "name": "Kongobu-ji",
            "start": time(11, 0),
            "window": "Head temple tour (11:00-12:00)",
        },
        {
            "name": "Eko-in Temple",
            "start": time(15, 0),
            "window": "Shukubo stay (15:00-21:00)",
        },
        {
            "name": "Okunoin",
            "start": time(20, 0),
            "window": "Lantern night walk (20:00-21:30)",
        },
    ],
    7: [
        {
            "name": "OMO7 Osaka",
            "start": time(15, 0),
            "window": "Check-in & relax (15:00-16:00)",
        },
        {
            "name": "Osaka Aquarium Kaiyukan",
            "start": time(17, 0),
            "window": "Aquarium twilight (17:00-18:30)",
        },
        {
            "name": "Tempozan Marketplace",
            "start": time(18, 45),
            "window": "Harbor dinner (18:45-20:00)",
        },
    ],
    8: [
        {
            "name": "Masahiko Ozumi Paris",
            "start": time(9, 0),
            "window": "Morning pastry run (09:00-09:45)",
        },
        {
            "name": "Nozomi Express",
            "start": time(12, 0),
            "window": "Shinkansen to Tokyo (12:00-14:30)",
            "match_original_date": "November 21, 2025 7:00 PM (GMT)",
        },
        {
            "name": "sequence MIYASHITA PARK",
            "start": time(15, 0),
            "window": "Shibuya check-in (15:00-16:00)",
        },
        {
            "name": "Shibuya Crossing",
            "start": time(16, 30),
            "window": "Scramble photos (16:30-17:00)",
        },
        {
            "name": "Kaikaya by the Sea",
            "start": time(19, 0),
            "window": "Seafood reunion (19:00-21:00)",
        },
    ],
    9: [
        {
            "name": "Tokyo DisneySea",
            "start": time(8, 0),
            "window": "Park day (08:00-19:30)",
        },
        {
            "name": "Disney Hotel",
            "start": time(14, 30),
            "window": "Hyperion tea (14:30-15:30)",
        },
        {
            "name": "MIMARU Tokyo Shinjuku WEST",
            "start": time(21, 0),
            "window": "Pajama base (21:00-22:00)",
        },
    ],
    10: [
        {
            "name": "Toyosu Market",
            "start": time(7, 0),
            "window": "Sushi breakfast (07:00-08:30)",
        },
        {
            "name": "teamLab Planets",
            "start": time(9, 0),
            "window": "Immersive art (09:00-10:30)",
        },
        {
            "name": "Pokémon Café",
            "start": time(12, 0),
            "window": "Character lunch (12:00-13:30)",
        },
        {
            "name": "Odaiba Seaside Park",
            "start": time(15, 0),
            "window": "Bay sunset (15:00-17:00)",
        },
        {
            "name": "Maidreamin Akihabara",
            "start": time(18, 0),
            "window": "Kawaii break (18:00-19:00)",
            "flex": True,
        },
        {
            "name": "Ichiran Ramen",
            "start": time(21, 0),
            "window": "Late ramen (21:00-22:00)",
            "flex": True,
        },
    ],
    11: [
        {
            "name": "Meiji Jingu",
            "start": time(9, 0),
            "window": "Forest blessing (09:00-10:00)",
        },
        {
            "name": "Takeshita Street",
            "start": time(10, 15),
            "window": "Harajuku walk (10:15-11:30)",
        },
        {
            "name": "Shibuya 109",
            "start": time(11, 45),
            "window": "Pop fashion dash (11:45-12:15)",
            "flex": True,
        },
        {
            "name": "Afuri",
            "start": time(12, 20),
            "window": "Yuzu ramen (12:20-13:15)",
        },
        {
            "name": "Cat Street",
            "start": time(13, 20),
            "window": "Boutique crawl (13:20-14:30)",
        },
        {
            "name": "Daikanyama T-Site",
            "start": time(15, 0),
            "window": "Tsutaya coffee (15:00-16:00)",
        },
        {
            "name": "Nakameguro",
            "start": time(16, 15),
            "window": "Canal stroll (16:15-17:00)",
        },
        {
            "name": "Shibuya Sky",
            "start": time(17, 30),
            "window": "Sunset views (17:30-18:30)",
        },
        {
            "name": "Gonpachi Shibuya",
            "start": time(19, 0),
            "window": "Crew dinner (19:00-21:00)",
        },
        {
            "name": "Karaoke Kan Shibuya",
            "start": time(21, 15),
            "window": "Neon karaoke (21:15-23:15)",
        },
    ],
    12: [
        {
            "name": "Senso-ji",
            "start": time(6, 30),
            "window": "Sunrise rituals (06:30-07:30)",
        },
        {
            "name": "Tokyo Skytree",
            "start": time(8, 0),
            "window": "Tembo deck (08:00-09:00)",
        },
        {
            "name": "Asakusaimahan",
            "start": time(10, 30),
            "window": "Sukiyaki lunch (10:30-11:45)",
        },
        {
            "name": "Tokyo Character Street",
            "start": time(12, 30),
            "window": "Souvenir dash (12:30-13:15)",
        },
        {
            "name": "Nozomi Express",
            "start": time(15, 0),
            "window": "Return to Kansai (15:00-17:30)",
            "match_original_date": "November 25, 2025 4:00 PM (GMT)",
        },
        {
            "name": "Torame Yokocho",
            "start": time(19, 0),
            "window": "Night market dinner (19:00-20:30)",
        },
    ],
    13: [
        {
            "name": "Tōdai-ji",
            "start": time(9, 0),
            "window": "Great Buddha (09:00-10:30)",
        },
        {
            "name": "Nara Park",
            "start": time(10, 30),
            "window": "Deer stroll (10:30-11:30)",
        },
        {
            "name": "Nakatanidou",
            "start": time(11, 30),
            "window": "Mochi show (11:30-12:00)",
        },
        {
            "name": "Shinsekai",
            "start": time(16, 0),
            "window": "Retro stroll (16:00-17:30)",
            "flex": True,
        },
        {
            "name": "teamLab Botanical Garden",
            "start": time(19, 0),
            "window": "Night art (19:00-20:30)",
        },
        {
            "name": "Kyushu Ramen Kio",
            "start": time(21, 0),
            "window": "Late ramen (21:00-22:00)",
            "flex": True,
        },
    ],
    14: [
        {
            "name": "Himeji Castle",
            "start": time(8, 0),
            "window": "Castle climb (08:00-10:00)",
        },
        {
            "name": "Kobe Nunobiki Herb Gardens",
            "start": time(11, 0),
            "window": "Ropeway views (11:00-13:00)",
        },
        {
            "name": "Steakland Kobe",
            "start": time(13, 15),
            "window": "Teppan lunch (13:15-14:15)",
        },
        {
            "name": "Arima Onsen Taiko-no-yu",
            "start": time(15, 30),
            "window": "Onsen retreat (15:30-17:30)",
        },
        {
            "name": "Kobe Harborland",
            "start": time(19, 0),
            "window": "Harbor lights (19:00-20:30)",
        },
    ],
    15: [
        {
            "name": "Rikuro's",
            "start": time(11, 0),
            "window": "Cheesecake pickup (11:00-11:30)",
        },
        {
            "name": "W Osaka",
            "start": time(13, 0),
            "window": "Suite check-in (13:00-14:00)",
        },
        {
            "name": "Afternoon Glam & Restock",
            "start": time(15, 0),
            "window": "Decor prep (15:00-16:30)",
        },
        {
            "name": "MYDO Teppanyaki",
            "start": time(18, 30),
            "window": "Birthday teppan (18:30-20:30)",
        },
        {
            "name": "Karaoke Kan Shinsaibashi",
            "start": time(21, 0),
            "window": "Party karaoke (21:00-23:00)",
        },
        {
            "name": "Bar Nayuta",
            "start": time(23, 30),
            "window": "Sky cocktails (23:30-00:30)",
        },
    ],
    16: [
        {
            "name": "Eikan-dō Zenrin-ji",
            "start": time(9, 0),
            "window": "Maple glow (09:00-10:00)",
        },
        {
            "name": "Philosopher's Path",
            "start": time(10, 15),
            "window": "Canal stroll (10:15-11:30)",
        },
        {
            "name": "Okutan Nanzenji",
            "start": time(12, 0),
            "window": "Yudofu lunch (12:00-13:30)",
        },
        {
            "name": "Tōfuku-ji",
            "start": time(14, 0),
            "window": "Autumn canopies (14:00-15:30)",
        },
        {
            "name": "(THISIS)SHIZEN",
            "start": time(16, 0),
            "window": "Flower gelato (16:00-16:30)",
            "flex": True,
        },
        {
            "name": "Kōdai-ji",
            "start": time(18, 0),
            "window": "Night illumination (18:00-19:00)",
        },
        {
            "name": "Kyoto Yakiniku Hiro",
            "start": time(19, 30),
            "window": "Wagyu dinner (19:30-21:00)",
        },
    ],
    17: [
        {
            "name": "Takamura Wine & Coffee",
            "start": time(10, 0),
            "window": "Farewell cupping (10:00-11:00)",
        },
        {
            "name": "Rinku Premium Outlets",
            "start": time(13, 0),
            "window": "Outlet spree (13:00-16:00)",
        },
        {
            "name": "Kansai International Airport 23:10 KIX → DXB (EK317)",
            "start": time(18, 0),
            "window": "Departure prep (18:00-22:00)",
        },
    ],
}

# Map fallback label fragments for regions.
REGION_FALLBACK = {
    "Osaka": "Osaka Cluster",
    "Kyoto": "Kyoto Cluster",
    "Nara": "Nara Cluster",
    "Koyasan": "Koyasan Cluster",
    "Kobe": "Kobe Cluster",
    "Hirakata": "Hirakata Cluster",
    "Himeji": "Himeji Cluster",
    "Tokyo": "Tokyo Cluster",
    "Odaiba": "Tokyo Bay Cluster",
    "Toyosu": "Tokyo Bay Cluster",
    "Kansai Airport": "KIX Cluster",
    "Uji": "Kyoto Cluster",
}

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def canonical(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""

    r = 6371.0
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def infer_region(place: Place) -> str:
    for region, (lat_max, lat_min, lon_max, lon_min) in REGION_RULES:
        if lat_min <= place.lat <= lat_max and lon_min <= place.lon <= lon_max:
            return region
    if place.lon > 138:
        if place.lat < 35.6:
            return "Odaiba"
        return "Tokyo"
    if place.lon > 135.8:
        if place.lat < 34.8:
            return "Hirakata"
        return "Kyoto"
    if place.lon > 135.4:
        return "Osaka"
    if place.lon > 135.0:
        return "Kobe"
    if place.lon > 134.4:
        return "Himeji"
    return "Kansai Airport"


def centroid(coords: Iterable[Tuple[float, float]]) -> Tuple[float, float]:
    total_lat = 0.0
    total_lon = 0.0
    count = 0
    for lat, lon in coords:
        total_lat += lat
        total_lon += lon
        count += 1
    if count == 0:
        return 0.0, 0.0
    return total_lat / count, total_lon / count


def match_label_from_rules(cluster: Cluster) -> str:
    joined_names = " ".join(p.name.lower() for p in cluster.members)
    joined_canonical = " ".join(canonical(p.name) for p in cluster.members)
    for keywords, label in LABEL_RULES:
        normalized = [canonical(keyword) for keyword in keywords]
        if normalized and all(term in joined_canonical for term in normalized):
            return label
        if all(keyword.lower() in joined_names for keyword in keywords):
            return label
    region_label = REGION_FALLBACK.get(cluster.region)
    if region_label:
        return f"{region_label} {cluster.id:02d}"
    return f"Cluster {cluster.id:02d}"


def apply_manual_labels(clusters: List[Cluster]) -> None:
    for cluster in clusters:
        canonical_names = {canonical(place.name) for place in cluster.members}
        for raw_name, label in MANUAL_LABEL_MAP:
            if canonical(raw_name) in canonical_names:
                cluster.label = label
                break
        if "nozomiexpress" in canonical_names:
            if cluster.region == "Osaka":
                cluster.label = "Nozomi Northbound"
            elif cluster.label.startswith("Tokyo Cluster") or cluster.label.startswith("Cluster "):
                cluster.label = "Tokyo Character Street"


def split_sentences(text: str) -> List[str]:
    if not text:
        return []
    raw = re.split(r"(?<=[.!?])\s+", text.strip())
    sentences = [sentence.strip() for sentence in raw if sentence.strip()]
    return sentences


def duration_for(place: Place) -> timedelta:
    type_to_minutes = {
        "Accommodation": 60,
        "Travel": 60,
        "Attractions": 90,
        "Shopping": 75,
        "Food": 75,
        "Other": 60,
    }
    minutes = type_to_minutes.get(place.primary_type, 60)
    if place.name.lower().startswith("tokyo disneysea"):
        minutes = 540
    if "nozomi" in place.name.lower():
        minutes = 150
    if "kansai international airport" in place.name.lower():
        minutes = 120
    return timedelta(minutes=minutes)


def rewrite_note(raw: str, place: Place, cluster_label: str, is_flex: bool) -> str:
    text = raw.replace("\n", " ") if raw else ""
    text = re.sub(r"\s+", " ", text).strip()
    sentences = split_sentences(text)
    if not sentences:
        base_desc = {
            "Food": "Relax over regional comfort food.",
            "Attractions": "Explore the sights and soak in the atmosphere.",
            "Shopping": "Browse for keepsakes and limited finds.",
            "Accommodation": "Check in and settle before the next adventure.",
            "Travel": "Transit segment—plan buffer for tickets and queues.",
        }.get(place.primary_type, "Enjoy this stop at your own pace.")
        sentences = [base_desc]
    if len(sentences) > 2:
        sentences = sentences[:2]
    if is_flex:
        if len(sentences) == 1:
            sentences.append("Flex stop if energy allows.")
        else:
            sentences[-1] = "Flex stop if energy allows."
    cleaned = " ".join(sentences)
    cleaned = cleaned.replace("..", ".").strip()
    if len(cleaned.split(".")) > 3:
        parts = [part.strip() for part in cleaned.split(".") if part.strip()]
        cleaned = ". ".join(parts[:2]) + "."
    return cleaned


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------


def build_places(rows: List[Dict[str, str]]) -> List[Place]:
    places: List[Place] = []
    for idx, row in enumerate(rows):
        try:
            lat = float(row.get("Latitude", ""))
            lon = float(row.get("Longitude", ""))
        except ValueError:
            continue
        places.append(Place(index=idx, row=row, lat=lat, lon=lon))
    return places


def cluster_places(places: List[Place]) -> List[Cluster]:
    forced: List[Place] = []
    remaining: List[Place] = []
    for place in places:
        if canonical(place.name) in FORCE_SOLO_NAMES:
            forced.append(place)
        else:
            remaining.append(place)

    clusters: List[Cluster] = []
    # Forced solos first
    for place in forced:
        cluster = Cluster(
            id=len(clusters),
            members=[place],
            centroid_lat=place.lat,
            centroid_lon=place.lon,
        )
        place.cluster_id = cluster.id
        cluster.region = infer_region(place)
        cluster.label = match_label_from_rules(cluster)
        clusters.append(cluster)

    if remaining:
        centers: List[Place] = []
        unassigned = remaining[:]
        centers.append(unassigned[0])
        while True:
            farthest_place: Optional[Place] = None
            farthest_distance = -1.0
            for place in unassigned:
                nearest = min(
                    haversine_km(place.lat, place.lon, center.lat, center.lon) for center in centers
                )
                if nearest > farthest_distance:
                    farthest_distance = nearest
                    farthest_place = place
            if farthest_place is None or farthest_distance <= MAX_CLUSTER_RADIUS_KM:
                break
            centers.append(farthest_place)
            unassigned.remove(farthest_place)
        # Assign each remaining place to nearest center
        center_members: Dict[int, List[Place]] = {}
        for place in remaining:
            distances = [haversine_km(place.lat, place.lon, center.lat, center.lon) for center in centers]
            best_idx = distances.index(min(distances))
            center_members.setdefault(best_idx, []).append(place)
        for local_idx, members in center_members.items():
            centroid_lat, centroid_lon = centroid((p.lat, p.lon) for p in members)
            cluster = Cluster(
                id=len(clusters),
                members=members,
                centroid_lat=centroid_lat,
                centroid_lon=centroid_lon,
            )
            for place in members:
                place.cluster_id = cluster.id
            cluster.region = infer_region(members[0])
            cluster.label = match_label_from_rules(cluster)
            clusters.append(cluster)

    # Ensure deterministic order by cluster id
    clusters.sort(key=lambda c: c.id)
    # Re-assign ids sequentially
    for new_id, cluster in enumerate(clusters):
        cluster.id = new_id
        for place in cluster.members:
            place.cluster_id = new_id
        if not cluster.label:
            cluster.label = match_label_from_rules(cluster)
        if not cluster.region:
            cluster.region = infer_region(cluster.members[0])
    apply_manual_labels(clusters)
    return clusters


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


def order_clusters(clusters: List[Cluster], start_label: Optional[str]) -> List[Cluster]:
    if not clusters:
        return []
    remaining = clusters[:]
    ordered: List[Cluster] = []
    if start_label:
        for cluster in clusters:
            if cluster.label == start_label:
                ordered.append(cluster)
                remaining.remove(cluster)
                break
    if not ordered:
        ordered.append(remaining.pop(0))
    while remaining:
        last = ordered[-1]
        next_cluster = min(
            remaining,
            key=lambda cluster: haversine_km(last.centroid_lat, last.centroid_lon, cluster.centroid_lat, cluster.centroid_lon),
        )
        ordered.append(next_cluster)
        remaining.remove(next_cluster)
    return ordered


def ensure_cluster(cluster_label: str, pool: Dict[str, Cluster]) -> Optional[Cluster]:
    target_label = LABEL_ALIASES.get(cluster_label, cluster_label)
    if target_label in pool:
        return pool.pop(target_label)
    for key in list(pool.keys()):
        if target_label.lower() in key.lower():
            return pool.pop(key)
    target_canonical = canonical(target_label)
    if target_canonical:
        for key in list(pool.keys()):
            if canonical(key) == target_canonical:
                return pool.pop(key)
    return None


def schedule_places(places: List[Place], clusters: List[Cluster]) -> List[DaySummary]:
    pool: Dict[str, Cluster] = {cluster.label: cluster for cluster in clusters}
    day_summaries: List[DaySummary] = []

    for blueprint in DAY_BLUEPRINTS:
        selected: List[Cluster] = []
        for required in blueprint.required_labels:
            cluster = ensure_cluster(required, pool)
            if cluster:
                selected.append(cluster)
        for optional in blueprint.optional_labels:
            if len(selected) >= blueprint.max_clusters:
                break
            cluster = ensure_cluster(optional, pool)
            if cluster:
                selected.append(cluster)

        if blueprint.allow_fill and len(selected) < blueprint.max_clusters:
            candidates: List[Tuple[float, Cluster]] = []
            for label, cluster in list(pool.items()):
                if cluster in selected:
                    continue
                if cluster.region in blueprint.regions:
                    priority = -len(cluster.members)
                    candidates.append((priority, cluster))
            candidates.sort(key=lambda item: (item[0], item[1].label))
            while candidates and len(selected) < blueprint.max_clusters:
                _, cluster = candidates.pop(0)
                selected.append(cluster)
                pool.pop(cluster.label, None)
        else:
            for label in list(pool.keys()):
                if label in blueprint.required_labels:
                    pool.pop(label, None)

        ordered = order_clusters(selected, blueprint.start_label)
        day_date = BASE_DATE + timedelta(days=blueprint.day - 1)
        current_time = datetime.combine(day_date, blueprint.start_time)
        stops_for_summary: List[str] = []
        for cluster in ordered:
            for place in cluster.members:
                place.day_index = blueprint.day
                place.cluster_label = cluster.label
                place.assigned_time = datetime.combine(day_date, current_time.time())
                place.is_flex = cluster.label in blueprint.flex_labels or cluster.label in FLEX_LABELS
                current_time += duration_for(place)
                if current_time.date() != day_date:
                    current_time = datetime.combine(day_date, current_time.time())
                stops_for_summary.append(place.name)
        day_summary = DaySummary(
            day_index=blueprint.day,
            title=blueprint.title,
            date=day_date,
            clusters=[cluster.label for cluster in ordered],
            stops=stops_for_summary,
        )
        day_summaries.append(day_summary)

    # Assign leftover clusters to the final day if any remain
    if pool:
        final_blueprint = DAY_BLUEPRINTS[-1]
        day_date = BASE_DATE + timedelta(days=final_blueprint.day - 1)
        current_time = datetime.combine(day_date, final_blueprint.start_time)
        summary = next(item for item in day_summaries if item.day_index == final_blueprint.day)
        for cluster in list(pool.values()):
            for place in cluster.members:
                place.day_index = final_blueprint.day
                place.cluster_label = cluster.label
                place.assigned_time = datetime.combine(day_date, current_time.time())
                place.is_flex = True
                current_time += duration_for(place)
                if current_time.date() != day_date:
                    current_time = datetime.combine(day_date, current_time.time())
                summary.stops.append(place.name)
                summary.clusters.append(cluster.label)
        pool.clear()

    return sorted(day_summaries, key=lambda day: day.day_index)


# ---------------------------------------------------------------------------
# Manual override scheduling
# ---------------------------------------------------------------------------


def _resolve_manual_entry(
    entry: Dict[str, object],
    name_lookup: Dict[str, List[Place]],
    canonical_lookup: Dict[str, List[Place]],
    assigned_ids: Set[int],
) -> Optional[Place]:
    raw_name = entry.get("name", "")
    if not raw_name:
        return None
    candidates: List[Place] = []
    if raw_name in name_lookup:
        candidates.extend(name_lookup[raw_name])
    canon_key = canonical(raw_name)
    if canon_key in canonical_lookup:
        for item in canonical_lookup[canon_key]:
            if item not in candidates:
                candidates.append(item)
    match_date = entry.get("match_original_date")
    if match_date:
        candidates = [place for place in candidates if (place.row.get("Date") or "").strip() == str(match_date).strip()]
    match_group = entry.get("match_group")
    if match_group:
        expected = str(match_group).strip().lower()
        candidates = [place for place in candidates if (place.row.get("Group") or "").strip().lower() == expected]
    for candidate in candidates:
        if candidate.index not in assigned_ids:
            return candidate
    return candidates[0] if candidates else None


def apply_manual_plan(places: List[Place]) -> List[DaySummary]:
    name_lookup: Dict[str, List[Place]] = {}
    canonical_lookup: Dict[str, List[Place]] = {}
    for place in places:
        name_lookup.setdefault(place.name, []).append(place)
        canonical_lookup.setdefault(canonical(place.name), []).append(place)

    assigned_ids: Set[int] = set()
    day_summaries: List[DaySummary] = []

    for day in sorted(MANUAL_DAY_SCHEDULE):
        entries = MANUAL_DAY_SCHEDULE[day]
        day_date = BASE_DATE + timedelta(days=day - 1)
        stops_for_summary: List[str] = []
        clusters_for_summary: List[str] = []
        for entry in entries:
            place = _resolve_manual_entry(entry, name_lookup, canonical_lookup, assigned_ids)
            if place is None:
                print(f"Warning: manual schedule entry not found -> {entry.get('name')}")
                continue
            assigned_ids.add(place.index)
            start_time: time = entry.get("start")  # type: ignore[assignment]
            if not isinstance(start_time, time):
                continue
            place.day_index = day
            place.assigned_time = datetime.combine(day_date, start_time)
            place.time_window = str(entry.get("window") or "")
            place.is_flex = bool(entry.get("flex"))
            if place.cluster_label and place.cluster_label not in clusters_for_summary:
                clusters_for_summary.append(place.cluster_label)
            stops_for_summary.append(place.name)
        title = MANUAL_DAY_TITLES.get(day, f"Day {day}")
        day_summaries.append(
            DaySummary(
                day_index=day,
                title=title,
                date=day_date,
                clusters=clusters_for_summary,
                stops=stops_for_summary,
            )
        )

    for place in places:
        if place.day_index is None:
            place.is_flex = True

    return sorted(day_summaries, key=lambda item: item.day_index)


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------


def apply_itinerary(rows: List[Dict[str, str]]) -> Tuple[List[Dict[str, str]], List[Cluster], List[DaySummary]]:
    places = build_places(rows)
    clusters = cluster_places(places)
    for cluster in clusters:
        for member in cluster.members:
            member.cluster_label = cluster.label
    day_summaries = apply_manual_plan(places)

    day_to_friends: Dict[int, List[str]] = {day: friends[:] for day, friends in MANUAL_DAY_FRIENDS.items()}

    for place in places:
        row = place.row
        if place.day_index is None or place.assigned_time is None:
            row["Day"] = "Flex"
            row["Date"] = ""
            row["Weekday"] = ""
            row["Friends"] = "Henry"
            row["Time"] = place.time_window or "Flexible"
            row["Cluster"] = place.cluster_label
            row["Notes"] = rewrite_note(place.raw_note, place, place.cluster_label, True)
            continue
        row = place.row
        timestamp = place.assigned_time
        row["Date"] = timestamp.strftime("%B %d, %Y %I:%M %p (GMT)")
        row["Day"] = f"Day {place.day_index}"
        row["Weekday"] = timestamp.strftime("%A")
        friends = day_to_friends.get(place.day_index, ["Henry"])
        if "Henry" not in friends:
            friends = ["Henry"] + friends
        row["Friends"] = ", ".join(dict.fromkeys(friends))
        row["Cluster"] = place.cluster_label
        row["Time"] = place.time_window or ""
        row["Notes"] = rewrite_note(place.raw_note, place, place.cluster_label, place.is_flex)
    return rows, clusters, day_summaries


def save_compiled_csv(
    rows: List[Dict[str, str]], output_path: Path, fieldnames: Optional[Sequence[str]] = None
) -> None:
    if not rows:
        return
    if fieldnames is None:
        fieldnames = list(rows[0].keys())
    with output_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_plan_artifacts(clusters: List[Cluster], day_summaries: List[DaySummary]) -> None:
    OUTPUT_CLUSTER_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CLUSTER_JSON.open("w", encoding="utf-8") as fh:
        json.dump([cluster.to_dict() for cluster in clusters], fh, indent=2, ensure_ascii=False)
    with OUTPUT_DAY_JSON.open("w", encoding="utf-8") as fh:
        json.dump([summary.to_dict() for summary in day_summaries], fh, indent=2, ensure_ascii=False)

