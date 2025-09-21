import csv
import json
import re
import time
from pathlib import Path
from typing import Dict, Optional, Tuple

import requests
from geopy.geocoders import Nominatim

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
}


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
    })

    print(f"[{idx}/{total}] {record['Name']} -> {source}", flush=True)

if missing_coords:
    print('WARNING: Missing coordinates for:', ', '.join(missing_coords))

with OUTPUT_PATH.open('w', encoding='utf-8', newline='') as fh:
    fieldnames = ['Name', 'Date', 'Day', 'Friends', 'Group', 'Notes', 'Rating', 'Type', 'Website', 'Map URL', 'Weekday', 'Latitude', 'Longitude']
    writer = csv.DictWriter(fh, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(output_rows)

fetcher.save()
geocoder.save()
