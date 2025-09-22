import csv
import json
import re
import sys
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import requests
from geopy.geocoders import Nominatim

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from scripts.itinerary_engine import (
    apply_itinerary,
    save_compiled_csv,
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
    'tofuscuisinesorano': (35.6547999, 139.7038608),
    'tofucuisinesorano': (35.6547999, 139.7038608),
    'shunsaiimari': (35.0073959, 135.7560267),
    'wakakimonorental': (34.9969553, 135.7807934),
    'udonmaruka': (35.696698, 139.760132),
    'shinsekai': (34.6520901, 135.5061908),
    'togoshiya': (35.6579009, 139.6967827),
    'aburasobakirinji': (35.035602, 135.7320227),
    "rikuro's": (34.666127, 135.501566),
    'rikuro': (34.666127, 135.501566),
    'rikuros': (34.666127, 135.501566),
    'gu': (35.6707997, 139.7643713),
    'thisisshizen': (35.009357, 135.7599419),
}

BASE_DATE = date(2025, 11, 14)

TIME_WINDOWS_ORDER: Sequence[str] = [
    'Early Morning (05:00-08:00)',
    'Morning (08:00-11:00)',
    'Late Morning (10:00-12:00)',
    'Midday (11:00-14:00)',
    'Early Afternoon (13:00-15:00)',
    'Afternoon (14:00-17:00)',
    'Late Afternoon (16:00-18:00)',
    'Sunset (17:00-19:00)',
    'Evening (18:00-21:00)',
    'Night (21:00-late)',
    'Late Night (after 23:00)',
]

TIME_WINDOW_INDEX = {label: idx for idx, label in enumerate(TIME_WINDOWS_ORDER)}

ManualEntry = Tuple[str, str, Optional[Dict[str, str]]]

DAY_FRIENDS: Dict[int, Sequence[str]] = {
    1: ['Henry', 'Nanako'],
    2: ['Henry', 'Nanako'],
    3: ['Henry', 'Nanako'],
    4: ['Henry', 'Nanako'],
    5: ['Henry', 'Nanako'],
    6: ['Henry', 'Nanako'],
    7: ['Henry', 'Nanako'],
    8: ['Henry', 'Nanako'],
    9: ['Henry', 'Nanako', 'Nicole', 'Ken'],
    10: ['Henry', 'Nanako', 'Nicole', 'Ken'],
    11: ['Henry', 'Nanako', 'Nicole', 'Ken', 'James', 'Phil'],
    12: ['Henry', 'Nanako'],
    13: ['Henry', 'Nanako'],
    14: ['Henry', 'Nanako'],
    15: ['Henry', 'Nanako', 'Nicole', 'Ken'],
    16: ['Henry', 'Nanako', 'Nicole', 'Ken'],
    17: ['Henry', 'Nanako'],
}

RAW_MANUAL_PLAN: Dict[int, Sequence[Tuple[str, ...]]] = {
    1: [
        ('kansaiinternationalairportdxbkixek3161330', 'Early Afternoon (13:00-15:00)'),
        ('hotelagoraosakamoriguchi', 'Late Afternoon (16:00-18:00)'),
        ('toriseihirakata', 'Evening (18:00-21:00)'),
    ],
    2: [
        ('shinsaibashisujishoppingstreet', 'Morning (08:00-11:00)'),
        ('kuromonmarket', 'Midday (11:00-14:00)'),
        ('nambayasakajinja', 'Early Afternoon (13:00-15:00)'),
        ('rikuros', 'Afternoon (14:00-17:00)'),
        ('dotonbori', 'Late Afternoon (16:00-18:00)'),
        ('tomboririvercruise', 'Sunset (17:00-19:00)'),
        ('okonomiyakimizuno', 'Evening (18:00-21:00)'),
        ('hozenjiyokocho', 'Night (21:00-late)'),
    ],
    3: [
        ('osakacastle', 'Morning (08:00-11:00)'),
        ('coffeemaison', 'Late Morning (10:00-12:00)'),
        ('osakamuseumofhousingandliving', 'Midday (11:00-14:00)'),
        ('osakastationcity', 'Early Afternoon (13:00-15:00)'),
        ('grandfrontosaka', 'Afternoon (14:00-17:00)'),
        ('umedaskybuilding', 'Sunset (17:00-19:00)'),
        ('hepfiveferriswheel', 'Evening (18:00-21:00)'),
        ('humanbeingseverybodynoodles', 'Night (21:00-late)'),
    ],
    4: [
        ('arashiyamabambooforest', 'Early Morning (05:00-08:00)'),
        ('tenryuji', 'Morning (08:00-11:00)'),
        ('kimonoforest', 'Late Morning (10:00-12:00)'),
        ('arashiyamayoshimura', 'Midday (11:00-14:00)'),
        ('fushimiinaritaisha', 'Early Afternoon (13:00-15:00)'),
        ('gekkeikanokurasakemuseum', 'Afternoon (14:00-17:00)'),
        ('tsuentea', 'Late Afternoon (16:00-18:00)'),
        ('kyotoyakinikuhiro', 'Evening (18:00-21:00)'),
    ],
    5: [
        ('cafmealmuji', 'Morning (08:00-11:00)'),
        ('bearpawcafe', 'Early Afternoon (13:00-15:00)'),
        ('hirakatapark', 'Afternoon (14:00-17:00)'),
        ('gokurakuyuhirakata', 'Late Afternoon (16:00-18:00)'),
        ('kushikatsutanaka', 'Evening (18:00-21:00)'),
        ('kuzuhamall', 'Night (21:00-late)'),
    ],
    6: [
        ('nambatokoyasan', 'Morning (08:00-11:00)'),
        ('kongobuji', 'Late Morning (10:00-12:00)'),
        ('ekointemple', 'Afternoon (14:00-17:00)'),
        ('okunoin', 'Night (21:00-late)'),
    ],
    7: [
        ('masahikoozumiparis', 'Morning (08:00-11:00)'),
        ('omo7osaka', 'Afternoon (14:00-17:00)'),
        ('osakaaquariumkaiyukan', 'Sunset (17:00-19:00)'),
        ('tempozanmarketplace', 'Evening (18:00-21:00)'),
    ],
    8: [
        ('nozomiexpress', 'Midday (11:00-14:00)', {'notes': 'Shin-Osaka to Shinagawa'}),
        ('sequencemiyashitapark', 'Late Afternoon (16:00-18:00)'),
        ('shibuyacrossing', 'Sunset (17:00-19:00)'),
        ('kaikayabythesea', 'Evening (18:00-21:00)'),
    ],
    9: [
        ('tokyodisneysea', 'Morning (08:00-11:00)'),
        ('disneyhotel', 'Afternoon (14:00-17:00)'),
        ('mimarutokyoshinjukuwest', 'Night (21:00-late)'),
    ],
    10: [
        ('toyosumarket', 'Early Morning (05:00-08:00)'),
        ('teamlabplanets', 'Morning (08:00-11:00)'),
        ('pokmoncaf', 'Midday (11:00-14:00)'),
        ('odaibaseasidepark', 'Afternoon (14:00-17:00)'),
        ('karaokekanshibuya', 'Evening (18:00-21:00)'),
        ('ichiranramen', 'Night (21:00-late)'),
    ],
    11: [
        ('meijijingu', 'Morning (08:00-11:00)'),
        ('takeshitastreet', 'Late Morning (10:00-12:00)'),
        ('afuri', 'Midday (11:00-14:00)'),
        ('shibuya109', 'Early Afternoon (13:00-15:00)'),
        ('catstreet', 'Afternoon (14:00-17:00)'),
        ('daikanyamatsite', 'Late Afternoon (16:00-18:00)'),
        ('nakameguro', 'Sunset (17:00-19:00)'),
        ('shibuyasky', 'Evening (18:00-21:00)'),
        ('gonpachishibuya', 'Night (21:00-late)'),
    ],
    12: [
        ('sensoji', 'Early Morning (05:00-08:00)'),
        ('tokyoskytree', 'Morning (08:00-11:00)'),
        ('asakusaimahan', 'Midday (11:00-14:00)'),
        ('tokyocharacterstreet', 'Early Afternoon (13:00-15:00)'),
        ('nozomiexpress', 'Afternoon (14:00-17:00)', {'notes': 'matcha sweets and digital journaling'}),
        ('torameyokocho', 'Evening (18:00-21:00)'),
    ],
    13: [
        ('shinsekai', 'Afternoon (14:00-17:00)'),
        ('riceballgorichan', 'Late Afternoon (16:00-18:00)'),
        ('kurasushi', 'Evening (18:00-21:00)'),
        ('teamlabbotanicalgarden', 'Night (21:00-late)'),
        ('donquijote', 'Late Night (after 23:00)'),
    ],
    14: [
        ('himejicastle', 'Early Morning (05:00-08:00)'),
        ('kobenunobikiherbgardens', 'Late Morning (10:00-12:00)'),
        ('steaklandkobe', 'Midday (11:00-14:00)'),
        ('arimaonsentaikonoyu', 'Afternoon (14:00-17:00)'),
        ('kobeharborland', 'Evening (18:00-21:00)'),
    ],
    15: [
        ('dongurirepublic', 'Late Morning (10:00-12:00)'),
        ('wosaka', 'Early Afternoon (13:00-15:00)'),
        ('afternoonglamrestock', 'Afternoon (14:00-17:00)'),
        ('mydoteppanyaki', 'Evening (18:00-21:00)'),
        ('karaokekanshinsaibashi', 'Night (21:00-late)'),
        ('barnayuta', 'Late Night (after 23:00)'),
    ],
    16: [
        ('eikandzenrinji', 'Morning (08:00-11:00)'),
        ('philosopherspath', 'Late Morning (10:00-12:00)'),
        ('okutannanzenji', 'Midday (11:00-14:00)'),
        ('tfukuji', 'Afternoon (14:00-17:00)'),
        ('kdaiji', 'Sunset (17:00-19:00)'),
        ('aburasobakirinji', 'Evening (18:00-21:00)'),
    ],
    17: [
        ('takamurawinecoffee', 'Morning (08:00-11:00)'),
        ('rinkupremiumoutlets', 'Afternoon (14:00-17:00)'),
        ('kansaiinternationalairport2310kixdxbek317', 'Evening (18:00-21:00)'),
    ],
}

MANUAL_DAY_PLAN: Dict[int, Sequence[ManualEntry]] = {}
for day, entries in RAW_MANUAL_PLAN.items():
    normalized: List[ManualEntry] = []
    for entry in entries:
        if len(entry) == 2:
            canon, window = entry
            filters = None
        elif len(entry) == 3:
            canon, window, filters = entry  # type: ignore[misc]
        else:
            raise ValueError(f'Unexpected manual plan entry format for day {day}: {entry}')
        normalized.append((canon, window, filters))
    MANUAL_DAY_PLAN[day] = normalized


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


def apply_manual_schedule(rows: List[Dict[str, str]]) -> None:
    usage: Dict[str, int] = defaultdict(int)
    lookup: Dict[str, List[Dict[str, str]]] = defaultdict(list)

    for row in rows:
        canon = canonical_name(row['Name'])
        lookup[canon].append(row)
        row['_original_date'] = row.get('Date', '')
        row['_original_group'] = row.get('Group', '')
        row['_original_notes'] = row.get('Notes', '')
        row['Date'] = ''
        row['Day'] = ''
        row['Weekday'] = ''
        row['Friends'] = ''
        row['Time Window'] = ''
        row['_order'] = 999

    for day in sorted(MANUAL_DAY_PLAN.keys()):
        entries = MANUAL_DAY_PLAN[day]
        day_date = BASE_DATE + timedelta(days=day - 1)
        weekday = day_date.strftime('%A')
        friends = ', '.join(DAY_FRIENDS.get(day, ['Henry']))
        for order, (canon, window, filters) in enumerate(entries, start=1):
            bucket = lookup.get(canon)
            if not bucket:
                raise KeyError(f'No place found matching manual key "{canon}"')
            start_index = usage[canon]
            selected_index = None
            if filters:
                for idx in range(start_index, len(bucket)):
                    candidate = bucket[idx]
                    original_date = candidate.get('_original_date', '')
                    original_group = candidate.get('_original_group', '')
                    original_notes = candidate.get('_original_notes', '')
                    if 'date' in filters and filters['date'] != original_date:
                        continue
                    if 'group' in filters and filters['group'] != original_group:
                        continue
                    if 'notes' in filters and filters['notes'].lower() not in original_notes.lower():
                        continue
                    selected_index = idx
                    break
                if selected_index is None:
                    raise ValueError(f'Could not match manual filters {filters} for key "{canon}"')
            else:
                if start_index >= len(bucket):
                    raise ValueError(f'Manual schedule requested "{canon}" more times than available rows')
                selected_index = start_index

            row = bucket[selected_index]
            usage[canon] = selected_index + 1
            row['Day'] = f'Day {day}'
            row['Date'] = day_date.isoformat()
            row['Weekday'] = weekday
            row['Friends'] = friends
            row['Time Window'] = window
            row['_order'] = order


apply_manual_schedule(output_rows)


# Sort chronologically, keeping flex entries at the end for easier review.
def sort_key(row: Dict[str, str]) -> Tuple[int, int, int, str]:
    day_field = row.get('Day', '')
    if day_field.startswith('Day '):
        try:
            day_index = int(day_field.split()[1])
        except ValueError:
            day_index = 99
        window = row.get('Time Window', '')
        window_index = TIME_WINDOW_INDEX.get(window, 99)
        manual_order = row.get('_order', 999)
        return (day_index, window_index, manual_order, row.get('Name', ''))
    return (999, 999, 999, row.get('Name', ''))


output_rows.sort(key=sort_key)

for row in output_rows:
    row.pop('_order', None)
    row.pop('_original_date', None)
    row.pop('_original_group', None)
    row.pop('_original_notes', None)

fieldnames = ['Name', 'Date', 'Day', 'Time Window', 'Friends', 'Group', 'Notes', 'Rating', 'Type', 'Website', 'Map URL', 'Weekday', 'Latitude', 'Longitude', 'Cluster']
save_compiled_csv(output_rows, OUTPUT_PATH, fieldnames)
write_plan_artifacts(clusters, day_summaries)

fetcher.save()
geocoder.save()
