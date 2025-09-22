import csv
import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import requests
from geopy.geocoders import Nominatim

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from scripts.itinerary_engine import (
    TIME_WINDOWS,
    Cluster,
    DAY_BLUEPRINTS,
    DaySummary,
    Place,
    BASE_DATE,
    apply_itinerary,
    describe_time_window,
    duration_for,
    haversine_km,
    save_compiled_csv,
    split_sentences,
    write_plan_artifacts,
)

RAW_PATH = Path('data/raw_places.csv')
OUTPUT_PATH = Path('data/japlan_mymaps.csv')
CACHE_DIR = Path('data/cache')
CACHE_DIR.mkdir(parents=True, exist_ok=True)
URL_CACHE_PATH = CACHE_DIR / 'maps_url_cache.json'
GEOCODE_CACHE_PATH = CACHE_DIR / 'nominatim_cache.json'
GOOGLE_CACHE_PATH = Path('google_places_cache.json')

USER_AGENT = 'Mozilla/5.0 (compatible; JaplanMyMapsBot/1.0; +https://example.com/mymaps)'

WINDOW_PRIORITY = {label: idx for idx, (_, label) in enumerate(TIME_WINDOWS)}

MANUAL_COORDS: Dict[str, Tuple[float, float]] = {
    'katsudonchiyomatsu': (34.6682661, 135.5052931),
    'cupnoodlesmuseum': (34.8178846, 135.4266442),
    'unagikushiyakiidumo': (34.7030603, 135.4955727),
    'tempozanmarketplace': (34.6558539, 135.4302050),
    'genshinimpactofficialshop': (35.6620484, 139.6987767),
    'arashiyamaitsukichaya': (35.014681, 135.677185),
    'arashiyamarilakkumateahouse': (35.014681, 135.677185),
    'arashiyamamiffysakurakitchen': (35.014681, 135.677185),
    'shinpachishokudō': (35.7120787, 139.79756),
    'shinpachishokudo': (35.7120787, 139.79756),
    'shinpachishokud': (35.7120787, 139.79756),
    'shabusen': (35.6730758, 139.7361736),
    'tofucuisinesorano': (35.6548265, 139.7038692),
    'shunsaiimari': (35.0073959, 135.7560267),
    'wakakimonorental': (34.9969553, 135.7807934),
    'udonmaruka': (35.696698, 139.760132),
    'shinsekai': (34.6520901, 135.5061908),
    'togoshiya': (35.6579009, 139.6967827),
    'aburasobakirinji': (35.035602, 135.7320227),
    "rikuro's": (34.6661133, 135.5016421),
    'rikuro': (34.6661133, 135.5016421),
    'rikuros': (34.6661133, 135.5016421),
    'gu': (35.6709105, 139.7642385),
    'thisisshizen': (35.0093167, 135.7599616),
}

CLUSTER_KEEP_MAP: Dict[str, Set[str]] = {
    'KIX Arrival': {'Kansai International Airport DXB → KIX (EK316) 13:30'},
    'Agora Riverside Base': {'Hotel Agora Osaka Moriguchi'},
    'Hirakata Welcome Dinner': {'Torisei Hirakata'},
    'Osaka Castle Morning': {'Osaka Castle'},
    'Brooklyn Roasting Break': set(),
    'Umeda Skylines': {'Umeda Sky Building', 'Grand Front Osaka'},
    'Osaka Minami Street Food': {"Rikuro's", 'Dotonbori', 'Tombori River Cruise', 'Okonomiyaki Mizuno', 'Hozenji Yokocho'},
    'Universal Studios Japan Adventure': {'Universal Studios Japan'},
    'Himeji Heritage Walk': {'Himeji Castle'},
    'Kobe Herb View': {'Kobe Nunobiki Herb Gardens'},
    'Steakland Kobe Lunch': {'Steakland Kobe'},
    'Arima Onsen Retreat': {'Arima Onsen Taiko-no-yu'},
    'Kobe Harbor Nights': {'Kobe Harborland'},
    'Hirakata Local Day': {'Café & Meal MUJI', 'Kushikatsu Tanaka'},
    'Hirakata Wellness Break': {'Gokurakuyu Hirakata'},
    'Bear Paw Cafe Break': set(),
    'Kuzuha Mall Late Run': set(),
    'Kyoto Higashiyama Morning': {'Kiyomizu-dera', 'Sannenzaka & Ninenzaka'},
    'Kyoto Downtown Bites': {'Nishiki Market', 'Honke Owariya'},
    'Pontocho Alley': {'Hanamikoji Street', 'Kyoto Yakiniku Hiro'},
    'Fushimi Sunset Gates': {'Fushimi Inari Taisha'},
    'Fushimi Sake Cellar': {'Gekkeikan Okura Sake Museum'},
    'Kyomachiya Stay': {'Kyomachiya Ryokan Sakura Urushitei'},
    'Arashiyama Day Circuit': {'Arashiyama Bamboo Forest', 'Tenryu-ji', 'Arashiyama Yoshimura', 'Kimono Forest'},
    'Uji Tea Pilgrimage': {'Byōdō-in', 'Tsuen Tea'},
    'Kyoto Zen North': {'Kinkaku-ji'},
    'Meiji Forest Walk': {'Meiji Jingu', 'Afuri'},
    'Harajuku Street Mix': {'Takeshita Street', 'Cat Street'},
    'Daikanyama Stroll': {'Shibuya Sky', 'Shibuya Crossing'},
    'Shibuya Night Circuit': {'Gonpachi Shibuya', 'Karaoke Kan Shibuya'},
    'Toyosu Morning & teamLab': {'Toyosu Market', 'teamLab Planets'},
    'Pokémon Cafe': {'Pokémon Café'},
    'Odaiba Seaside': {'Odaiba Seaside Park'},
    'MIMARU Tokyo Base': {'MIMARU Tokyo Shinjuku WEST'},
    'Tokyo DisneySea Day': {'Tokyo DisneySea'},
    'Disney Hotel Tea': {'Disney Hotel'},
    'Asakusa Sunrise': {'Senso-ji', 'Asakusaimahan'},
    'Tokyo Skytree Deck': {'Tokyo Skytree'},
    'Tokyo Character Street': {'Tokyo Character Street', 'Nozomi Express'},
    'Nara Deer Route': {'Tōdai-ji', 'Nara Park'},
    'Nakatanidou Mochi': {'Nakatanidou'},
    'Kuromon Market Crawl': {'Kuromon Market'},
    'Kaiyukan Twilight Wander': {'Osaka Aquarium Kaiyukan', 'Tempozan Marketplace'},
    'Nozomi Northbound': {'Nozomi Express'},
    'Sequence Miyashita Park': {'sequence MIYASHITA PARK'},
    'Koyasan Ropeway Ascent': {'Namba to Koyasan'},
    'Koyasan Temple Tour': {'Kongobu-ji'},
    'Eko-in Temple Stay': {'Eko-in Temple'},
    'Okunoin Night Walk': {'Okunoin'},
    'W Osaka Birthday Core': {'W Osaka'},
    'Afternoon Glam & Restock': {'Afternoon Glam & Restock'},
    'MYDO Teppanyaki Feast': {'MYDO Teppanyaki'},
    'Bar Nayuta Rooftop': {'Bar Nayuta'},
    "Philosopher's Path": {"Philosopher's Path"},
    'Okutan Nanzenji Lunch': {'Eikan-dō Zenrin-ji', 'Okutan Nanzenji'},
    'Tōfuku-ji Canopies': {'Tōfuku-ji'},
    'Kyoto Zen Gardens': {'Ryōan-ji'},
    'Takamura Farewell Brunch': {'Takamura Wine & Coffee'},
    'Rinku Premium Outlets': {'Rinku Premium Outlets'},
    'KIX Departure': {'Kansai International Airport 23:10 KIX → DXB (EK317)'},
    # Clusters intentionally left unassigned
    'Shinsaibashi-Suji Stroll': set(),
    'Namba Yasaka Jinja': set(),
    'OMO7 Osaka Stay': set(),
    'Torame Yokocho Night Bites': set(),
    'Osaka Late-Night Donki': set(),
    'Osaka Onigiri Snack': set(),
    'Osaka Museum of Housing': set(),
    'Suga Shrine Steps': set(),
    'Shibuya Loft Dash': set(),
    'Tsukiji Uni Bowls': set(),
    'Shabusen Shabu': set(),
    'Shiba Park Morning': set(),
    'Udon Maruka Queue': set(),
    'Heian Shrine': set(),
    'Ikeda Cup Noodles': set(),
    'Kyushu Ramen Kio': set(),
    'Kura Sushi Conveyor': set(),
    '2D Latte Stop': set(),
    'Hello Donuts Treats': set(),
    'Shinsekai Retro Stroll': set(),
    'Kyoto Station Sky Garden': set(),
    'Hirakata Park': set(),
    'Tempozan Marketplace Stroll': set(),
    'Takoume Late Dinner': set(),
    'Nakazakicho Ramen': set(),
    'Nagai Night Lights': set(),
    'Animate Ikebukuro': set(),
    'Imperial Palace Gardens': set(),
    'Maidreamin Akihabara': set(),
}

MANUAL_DAY_ORDER: Dict[int, List[str]] = {
    1: [
        'Kansai International Airport DXB → KIX (EK316) 13:30',
        'Hotel Agora Osaka Moriguchi',
        'Torisei Hirakata',
    ],
    2: [
        'Osaka Castle',
        'Umeda Sky Building',
        'Grand Front Osaka',
        "Rikuro's",
        'Dotonbori',
        'Tombori River Cruise',
        'Okonomiyaki Mizuno',
        'Hozenji Yokocho',
    ],
    4: [
        'Himeji Castle',
        'Kobe Nunobiki Herb Gardens',
        'Steakland Kobe',
        'Arima Onsen Taiko-no-yu',
        'Kobe Harborland',
    ],
    5: [
        'Café & Meal MUJI',
        'Gokurakuyu Hirakata',
        'Kushikatsu Tanaka',
    ],
    6: [
        'Kiyomizu-dera',
        'Sannenzaka & Ninenzaka',
        'Nishiki Market',
        'Honke Owariya',
        'Kyomachiya Ryokan Sakura Urushitei',
        'Fushimi Inari Taisha',
        'Gekkeikan Okura Sake Museum',
        'Hanamikoji Street',
        'Kyoto Yakiniku Hiro',
    ],
    7: [
        'Arashiyama Bamboo Forest',
        'Tenryu-ji',
        'Arashiyama Yoshimura',
        'Kimono Forest',
        'Kinkaku-ji',
        'Byōdō-in',
        'Tsuen Tea',
    ],
    8: [
        'Nozomi Express',
        'sequence MIYASHITA PARK',
    ],
    9: [
        'Meiji Jingu',
        'Afuri',
        'Takeshita Street',
        'Cat Street',
        'Shibuya Crossing',
        'Shibuya Sky',
        'Gonpachi Shibuya',
        'Karaoke Kan Shibuya',
    ],
    10: [
        'Toyosu Market',
        'teamLab Planets',
        'Pokémon Café',
        'Odaiba Seaside Park',
        'MIMARU Tokyo Shinjuku WEST',
        'Ichiran Ramen',
    ],
    11: [
        'Tokyo DisneySea',
        'Disney Hotel',
    ],
    12: [
        'Senso-ji',
        'Asakusaimahan',
        'Tokyo Skytree',
        'Tokyo Character Street',
        'Nozomi Express',
    ],
    13: [
        'Tōdai-ji',
        'Nara Park',
        'Nakatanidou',
        'Kuromon Market',
        'Osaka Aquarium Kaiyukan',
        'Tempozan Marketplace',
    ],
    14: [
        'Namba to Koyasan',
        'Kongobu-ji',
        'Eko-in Temple',
        'Okunoin',
    ],
    15: [
        'W Osaka',
        'Afternoon Glam & Restock',
        'MYDO Teppanyaki',
        'Karaoke Kan Shinsaibashi',
        'Bar Nayuta',
    ],
    16: [
        "Philosopher's Path",
        'Eikan-dō Zenrin-ji',
        'Okutan Nanzenji',
        'Tōfuku-ji',
        'Ryōan-ji',
    ],
    17: [
        'Takamura Wine & Coffee',
        'Rinku Premium Outlets',
        'Kansai International Airport 23:10 KIX → DXB (EK317)',
    ],
}


def prune_schedule(
    rows: List[Dict[str, str]],
    clusters: List[Cluster],
    day_summaries: List[DaySummary],
) -> Tuple[List[Dict[str, str]], List[Cluster], List[DaySummary], Set[str]]:
    row_lookup: Dict[int, Place] = {}
    for cluster in clusters:
        for place in cluster.members:
            row_lookup[id(place.row)] = place

    removed_rows: Set[int] = set()
    removed_names: Set[str] = set()

    def mark_as_flex(row: Dict[str, str]) -> None:
        row_id = id(row)
        if row_id in removed_rows:
            return
        removed_rows.add(row_id)
        name = row.get('Name', '')
        if name:
            removed_names.add(name)
        for key in ('Date', 'Day', 'Time', 'Friends', 'Weekday', 'Cluster'):
            row[key] = ''
        row['_order'] = ''
        if row.get('Notes') and 'Flex stop' not in row['Notes']:
            row['Notes'] = (row['Notes'].rstrip('.') + '. Flex stop if energy allows.').strip()
        place = row_lookup.get(row_id)
        if place:
            place.day_index = None
            place.cluster_label = ''
            place.assigned_time = None
            place.is_flex = True

    for row in rows:
        cluster_label = row.get('Cluster', '')
        keep_names = CLUSTER_KEEP_MAP.get(cluster_label)
        if keep_names is None:
            continue
        name = row.get('Name', '')
        keep = True
        if not keep_names:
            keep = False
        elif name not in keep_names:
            keep = False
        if not keep:
            mark_as_flex(row)

    if removed_rows:
        print(f"Pruned {len(removed_rows)} rows from scheduled days.")

    trimmed_clusters: List[Cluster] = []
    for cluster in clusters:
        keep_names = CLUSTER_KEEP_MAP.get(cluster.label)

        def should_keep(place: Place) -> bool:
            if id(place.row) in removed_rows:
                return False
            if keep_names is None:
                return True
            if not keep_names:
                return False
            return place.name in keep_names

        cluster.members = [place for place in cluster.members if should_keep(place)]
        if cluster.members:
            trimmed_clusters.append(cluster)
    clusters = trimmed_clusters

    blueprint_lookup = {blueprint.day: blueprint for blueprint in DAY_BLUEPRINTS}
    day_rows: Dict[int, List[Dict[str, str]]] = defaultdict(list)
    for row in rows:
        day_field = row.get('Day', '')
        if not day_field.startswith('Day '):
            continue
        try:
            day_index = int(day_field.split()[1])
        except ValueError:
            continue
        day_rows[day_index].append(row)

    summary_lookup = {summary.day_index: list(summary.stops) for summary in day_summaries}

    for day_index, items in day_rows.items():
        blueprint = blueprint_lookup.get(day_index)
        if not blueprint:
            continue
        day_date = BASE_DATE + timedelta(days=day_index - 1)
        rows_by_name: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        for row in items:
            rows_by_name[row.get('Name', '')].append(row)
        ordered_rows: List[Dict[str, str]] = []
        for name in summary_lookup.get(day_index, []):
            bucket = rows_by_name.get(name)
            if not bucket:
                continue
            primary = bucket.pop(0)
            ordered_rows.append(primary)
            for extra in bucket:
                mark_as_flex(extra)
        leftovers: List[Dict[str, str]] = []
        for remaining in rows_by_name.values():
            for candidate in remaining:
                if candidate.get('Day'):
                    leftovers.append(candidate)
        leftovers.sort(key=lambda row: row.get('_order', ''))
        ordered_rows.extend(leftovers)

        manual_order = MANUAL_DAY_ORDER.get(day_index)
        if manual_order:
            priorities = {name: idx for idx, name in enumerate(manual_order)}
            ordered_rows.sort(
                key=lambda row: (
                    priorities.get(row.get('Name', ''), len(priorities)),
                    row.get('_order', ''),
                )
            )
            allowed = set(manual_order)
            filtered_rows: List[Dict[str, str]] = []
            for row in ordered_rows:
                if row.get('Name') in allowed:
                    filtered_rows.append(row)
                else:
                    mark_as_flex(row)
            ordered_rows = filtered_rows

        current_time = datetime.combine(day_date, blueprint.start_time)
        for row in ordered_rows:
            name = row.get('Name', '')
            place = row_lookup.get(id(row))
            row['Date'] = current_time.strftime('%B %d, %Y')
            row['Weekday'] = current_time.strftime('%A')
            row['Time'] = describe_time_window(current_time)
            row['_order'] = current_time.isoformat()
            if place:
                duration = duration_for(place)
            else:
                duration = timedelta(minutes=60)
            current_time += duration
            if current_time.date() != day_date:
                current_time = datetime.combine(day_date, current_time.time())

    valid_labels = {cluster.label for cluster in clusters}

    day_lookup: Dict[int, List[Dict[str, str]]] = defaultdict(list)
    for row in rows:
        day_field = row.get('Day', '')
        if not day_field.startswith('Day '):
            continue
        try:
            day_idx = int(day_field.split()[1])
        except ValueError:
            continue
        day_lookup[day_idx].append(row)

    for summary in day_summaries:
        summary_rows = sorted(
            [row for row in day_lookup.get(summary.day_index, []) if row.get('Name')],
            key=lambda row: row.get('_order', ''),
        )
        summary.stops = [row['Name'] for row in summary_rows]
        summary.clusters = [
            row['Cluster']
            for row in summary_rows
            if row.get('Cluster') and row['Cluster'] in valid_labels
        ]

    return rows, clusters, day_summaries, removed_names


def enforce_note_length(rows: List[Dict[str, str]]) -> None:
    for row in rows:
        note = (row.get('Notes') or '').strip()
        if not note:
            continue
        sentences = split_sentences(note)
        if not sentences:
            continue
        is_flex = not row.get('Day')
        if is_flex:
            trimmed = sentences[:1]
            if not trimmed or 'Flex stop if energy allows' not in trimmed[-1]:
                trimmed.append('Flex stop if energy allows.')
        else:
            trimmed = sentences[:2]
            trimmed = [sentence for sentence in trimmed if 'Flex stop if energy allows' not in sentence]
        cleaned = ' '.join(sentence.strip() for sentence in trimmed if sentence.strip())
        if cleaned and not cleaned.endswith('.'):
            cleaned = cleaned + '.'
        row['Notes'] = cleaned


def load_cache(path: Path) -> Dict[str, Tuple[float, float]]:
    if path.exists():
        try:
            with path.open('r', encoding='utf-8') as fh:
                data = json.load(fh)
            return {k: tuple(v) for k, v in data.items()}
        except json.JSONDecodeError:
            pass
    return {}


def save_cache(path: Path, data: Dict[str, Tuple[float, float]]) -> None:
    with path.open('w', encoding='utf-8') as fh:
        json.dump({k: list(v) for k, v in data.items()}, fh, indent=2, sort_keys=True)


def extract_links(raw: str) -> Tuple[str, str]:
    if not raw:
        return '', ''
    website_parts = []
    maps_parts = []
    current_label = None
    for line in raw.replace('\r', '').split('\n'):
        line = line.strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith('website:'):
            value = line.split(':', 1)[1].strip()
            if value:
                website_parts.append(value)
                current_label = None
            else:
                current_label = 'website'
            continue
        if lower.startswith('maps:'):
            value = line.split(':', 1)[1].strip()
            if value:
                maps_parts.append(value)
                current_label = None
            else:
                current_label = 'maps'
            continue
        if current_label == 'website':
            website_parts.append(line)
        elif current_label == 'maps':
            maps_parts.append(line)
    website = ' '.join(website_parts).strip()
    maps_url = ' '.join(maps_parts).strip()
    return website, maps_url


def canonical_name(name: str) -> str:
    return re.sub(r'[^a-z0-9]', '', name.lower())


def load_google_cache() -> Dict[str, Tuple[float, float]]:
    if not GOOGLE_CACHE_PATH.exists():
        return {}
    with GOOGLE_CACHE_PATH.open('r', encoding='utf-8') as fh:
        raw = json.load(fh)
    cache: Dict[str, Tuple[float, float]] = {}
    for key, value in raw.items():
        location = value.get('geometry', {}).get('location')
        if not location:
            continue
        lat = location.get('lat') or location.get('latitude')
        lon = location.get('lng') or location.get('longitude')
        if lat is None or lon is None:
            continue
        canonical = canonical_name(key)
        if canonical:
            cache[canonical] = (lat, lon)
    return cache


GOOGLE_CACHE = load_google_cache()

SESSION = requests.Session()
SESSION.headers.update({'User-Agent': USER_AGENT})


def parse_coords_from_text(text: str) -> Optional[Tuple[float, float]]:
    if not text:
        return None
    patterns = [
        r'@(-?\d+\.\d+),(-?\d+\.\d+),',
        r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)',
        r'"latitude"\s*:\s*(-?\d+\.\d+).*?"longitude"\s*:\s*(-?\d+\.\d+)',
        r'\\"latitude\\"\s*:\s*(-?\d+\.\d+).*?\\"longitude\\"\s*:\s*(-?\d+\.\d+)',
        r'center"\s*:\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]'
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                lat = float(match.group(1))
                lon = float(match.group(2))
            except (IndexError, ValueError):
                continue
            if abs(lat) <= 90 and abs(lon) <= 180:
                return lat, lon
    return None


class CoordinateFetcher:
    def __init__(self) -> None:
        self.url_cache: Dict[str, Tuple[float, float]] = load_cache(URL_CACHE_PATH)

    def _fetch_once(self, url: str) -> Tuple[Optional[str], Optional[Tuple[float, float]]]:
        try:
            response = SESSION.get(url, timeout=30, stream=True, allow_redirects=False)
        except requests.RequestException:
            return None, None
        location = response.headers.get('Location')
        coords = parse_coords_from_text(location)
        if coords:
            response.close()
            return location, coords
        content_pieces = []
        try:
            for chunk in response.iter_content(chunk_size=8192, decode_unicode=True):
                content_pieces.append(chunk)
                if any(token in chunk for token in ('@', '!3d', 'latitude', 'center')):
                    break
        finally:
            response.close()
        coords = parse_coords_from_text(''.join(content_pieces))
        return location, coords

    def get(self, url: str) -> Optional[Tuple[float, float]]:
        if not url:
            return None
        normalized = url.strip()
        if not normalized or not normalized.lower().startswith('http'):
            return None
        if normalized in self.url_cache:
            return self.url_cache[normalized]
        queue = [normalized]
        seen = set()
        while queue:
            current = queue.pop(0)
            if current in seen:
                continue
            seen.add(current)
            location, coords = self._fetch_once(current)
            if coords:
                self.url_cache[normalized] = coords
                return coords
            if location and location not in seen:
                queue.append(location)
        return None

    def save(self) -> None:
        save_cache(URL_CACHE_PATH, self.url_cache)


class NominatimHelper:
    def __init__(self) -> None:
        self.cache: Dict[str, Tuple[float, float]] = load_cache(GEOCODE_CACHE_PATH)
        self.geocoder = Nominatim(user_agent=USER_AGENT, timeout=30)

    def geocode(self, query: str) -> Optional[Tuple[float, float]]:
        query = query.strip()
        if not query:
            return None
        if query in self.cache:
            return self.cache[query]
        time.sleep(1)
        try:
            location = self.geocoder.geocode(query)
        except Exception:
            return None
        if location:
            coords = (location.latitude, location.longitude)
            self.cache[query] = coords
            return coords
        return None

    def save(self) -> None:
        save_cache(GEOCODE_CACHE_PATH, self.cache)


fetcher = CoordinateFetcher()
geocoder = NominatimHelper()


with RAW_PATH.open('r', encoding='utf-8') as fh:
    reader = csv.DictReader(fh)
    records = list(reader)

total = len(records)
output_rows = []
missing_coords = []

for idx, record in enumerate(records, start=1):
    website, maps_url = extract_links(record['URL'])
    record['Website'] = website
    record['Map URL'] = maps_url

    coords: Optional[Tuple[float, float]] = None
    source = 'unresolved'

    canon_name = canonical_name(record['Name'])
    if canon_name in MANUAL_COORDS:
        coords = MANUAL_COORDS[canon_name]
        source = 'manual'
    elif canon_name in GOOGLE_CACHE:
        coords = GOOGLE_CACHE[canon_name]
        source = 'google cache (exact)'
    else:
        for key, value in GOOGLE_CACHE.items():
            if canon_name and (canon_name in key or key in canon_name):
                coords = value
                source = 'google cache (fuzzy)'
                break

    if not coords:
        coords = fetcher.get(maps_url)
        if coords:
            source = 'map url'

    if not coords:
        query_parts = [record['Name'], record['Group'] or '', 'Japan']
        query = ', '.join([part for part in query_parts if part])
        coords = geocoder.geocode(query)
        if coords:
            source = 'nominatim'

    if coords:
        record['Latitude'], record['Longitude'] = coords
        if not record['Map URL'] or not record['Map URL'].lower().startswith('http'):
            record['Map URL'] = f'https://www.google.com/maps?q={coords[0]},{coords[1]}'
        if source == 'nominatim' and not maps_url:
            record['Map URL'] = f'https://www.google.com/maps?q={coords[0]},{coords[1]}'
    else:
        record['Latitude'] = ''
        record['Longitude'] = ''
        missing_coords.append(record['Name'])
        source = 'missing'

    output_rows.append({
        'Name': record['Name'],
        'Date': record['Date'],
        'Day': record['Day'],
        'Time': record.get('Time', ''),
        'Friends': record['Friends'],
        'Group': record['Group'],
        'Notes': record['Notes'],
        'Rating': record['Rating'],
        'Type': record['Type'],
        'Website': record['Website'],
        'Map URL': record['Map URL'],
        'Weekday': record['Weekday'],
        'Latitude': record['Latitude'],
        'Longitude': record['Longitude'],
        'Cluster': record.get('Cluster', ''),
    })

    print(f"[{idx}/{total}] {record['Name']} -> {source}", flush=True)

if missing_coords:
    print('WARNING: Missing coordinates for:', ', '.join(missing_coords))

output_rows, clusters, day_summaries = apply_itinerary(output_rows)
output_rows, clusters, day_summaries, _removed = prune_schedule(output_rows, clusters, day_summaries)
enforce_note_length(output_rows)

# Sort chronologically, keeping flex entries at the end for easier review.
def sort_key(row: Dict[str, str]) -> Tuple[int, str]:
    day_field = row.get('Day', '')
    if day_field.startswith('Day '):
        try:
            day_index = int(day_field.split()[1])
        except ValueError:
            day_index = 99
        order_value = row.get('_order') or ''
        return (day_index, order_value)
    return (999, row.get('Name', ''))


def summarize_metrics(rows: List[Dict[str, str]]) -> None:
    day_buckets: Dict[int, List[Dict[str, str]]] = defaultdict(list)
    for row in rows:
        day_field = row.get('Day', '')
        if not day_field.startswith('Day '):
            continue
        try:
            day_index = int(day_field.split()[1])
        except ValueError:
            continue
        day_buckets[day_index].append(row)

    if not day_buckets:
        return

    print('\nItinerary metrics:')
    for day_index in sorted(day_buckets):
        items = day_buckets[day_index]
        items.sort(key=lambda record: record.get('_order', ''))
        stop_count = len(items)
        activity_distance = 0.0
        transit_distance = 0.0
        max_activity_jump = 0.0
        prev_coords: Optional[Tuple[float, float]] = None
        prev_type = ''
        for entry in items:
            try:
                coords = (float(entry['Latitude']), float(entry['Longitude']))
            except (KeyError, TypeError, ValueError):
                coords = None
            entry_type = entry.get('Type', '')
            if prev_coords and coords:
                jump = haversine_km(prev_coords[0], prev_coords[1], coords[0], coords[1])
                is_transit = any(token in (entry_type or '') for token in ('Travel', 'Accommodation')) or any(
                    token in (prev_type or '') for token in ('Travel', 'Accommodation')
                )
                if is_transit:
                    transit_distance += jump
                else:
                    activity_distance += jump
                    max_activity_jump = max(max_activity_jump, jump)
            if coords:
                prev_coords = coords
            else:
                prev_coords = None
            prev_type = entry_type

        windows = [entry.get('Time', '') for entry in items if entry.get('Time')]
        ordered_windows = sorted({window for window in windows}, key=lambda label: WINDOW_PRIORITY.get(label, 99))
        window_summary = ' / '.join(ordered_windows) if ordered_windows else 'Unscheduled'
        print(
            f"- Day {day_index:02d}: {stop_count} stops, activity hops {activity_distance:.1f} km (max {max_activity_jump:.1f} km), "
            f"transit hops {transit_distance:.1f} km, windows: {window_summary}"
        )


output_rows.sort(key=sort_key)

summarize_metrics(output_rows)

for row in output_rows:
    row.pop('_order', None)

fieldnames = ['Name', 'Date', 'Day', 'Time', 'Friends', 'Group', 'Notes', 'Rating', 'Type', 'Website', 'Map URL', 'Weekday', 'Latitude', 'Longitude', 'Cluster']
save_compiled_csv(output_rows, OUTPUT_PATH, fieldnames)
write_plan_artifacts(clusters, day_summaries)

fetcher.save()
geocoder.save()
