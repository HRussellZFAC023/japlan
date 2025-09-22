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
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

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
# Output helpers
# ---------------------------------------------------------------------------


def apply_itinerary(rows: List[Dict[str, str]]) -> Tuple[List[Dict[str, str]], List[Cluster], List[DaySummary]]:
    places = build_places(rows)
    clusters = cluster_places(places)
    day_summaries = schedule_places(places, clusters)

    day_to_friends: Dict[int, List[str]] = {blueprint.day: list(blueprint.friends) for blueprint in DAY_BLUEPRINTS}

    for place in places:
        if place.day_index is None or place.assigned_time is None:
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

