import csv
import json
import mimetypes
import os
import textwrap
import time
import uuid
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
from urllib.parse import quote

import requests

from scripts.plan_data import (
    EXPENSE_ITEMS,
    ITINERARY_DAYS,
    PACKING_ITEMS,
    PLACE_QUERIES,
    JPY_PER_GBP,
)

BASE_DIR = Path('notion_export') / 'Japan Travel Planner 🌸 273042fae56c80149c0ded3ca759366a'
TRAVEL_DIR = BASE_DIR / 'Travel Itinerary 273042fae56c81f4b235f8b4a219d671'
PACKING_DIR = BASE_DIR / 'Packing List 273042fae56c8157b6cffb25550a7f53'
EXPENSE_DIR = BASE_DIR / 'Expenses 273042fae56c8184bec2d767d89c564d'

CACHE_PATH = Path('scripts') / 'google_places_cache.json'
API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
if not API_KEY:
    raise SystemExit('GOOGLE_MAPS_API_KEY environment variable is required.')

SESSION = requests.Session()
CACHE_TTL_SECONDS = 60 * 60 * 24 * 7


def _load_cache() -> Dict[str, Any]:
    if CACHE_PATH.exists():
        with CACHE_PATH.open('r', encoding='utf-8') as fh:
            return json.load(fh)
    return {}


def _save_cache(cache: Dict[str, Any]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_PATH.open('w', encoding='utf-8') as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=2)


def fetch_place_details(name: str, query: str) -> Dict[str, Any]:
    cache = _load_cache()
    cached = cache.get(name)
    if cached:
        fetched_at = cached.get('_fetched_at')
        has_photos = bool(cached.get('photos'))
        if fetched_at and time.time() - fetched_at < CACHE_TTL_SECONDS and has_photos:
            return cached

    params = {
        'query': query,
        'key': API_KEY,
        'language': 'en',
    }
    resp = SESSION.get('https://maps.googleapis.com/maps/api/place/textsearch/json', params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get('status') != 'OK' or not data.get('results'):
        raise RuntimeError(f'Text search failed for {name}: {data.get("status")}: {data.get("error_message")}')
    result = data['results'][0]
    place_id = result['place_id']

    details_params = {
        'place_id': place_id,
        'fields': 'name,formatted_address,international_phone_number,website,url,rating,user_ratings_total,opening_hours,geometry/location,photos',
        'language': 'en',
        'key': API_KEY,
    }
    time.sleep(0.15)
    details_resp = SESSION.get('https://maps.googleapis.com/maps/api/place/details/json', params=details_params, timeout=30)
    details_resp.raise_for_status()
    details_data = details_resp.json()
    if details_data.get('status') != 'OK':
        raise RuntimeError(f'Details fetch failed for {name}: {details_data.get("status")}: {details_data.get("error_message")}')
    place_details = details_data['result']
    place_details['_fetched_at'] = time.time()
    cache[name] = place_details
    _save_cache(cache)
    time.sleep(0.15)
    return place_details


class IdGenerator:
    def __init__(self):
        self.counts: Dict[str, int] = {}

    def generate(self, base: str) -> str:
        slug = ''.join(ch.lower() if ch.isalnum() else '' for ch in base) or 'entry'
        count = self.counts.get(slug, 0) + 1
        self.counts[slug] = count
        return f"{slug[:12]}{count:02d}{uuid.uuid4().hex[:8]}"


ID_GEN = IdGenerator()


def tidy_text(value: str) -> str:
    value = textwrap.dedent(value).strip()
    return ' '.join(value.split())


# Data definitions moved to scripts.plan_data

def safe_filename(name: str) -> str:
    keep = [ch if ch.isalnum() or ch in (' ', '-', '_') else '-' for ch in name]
    cleaned = ''.join(keep).strip()
    return ' '.join(cleaned.split())


def ensure_clean_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for item in path.iterdir():
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()


def gather_place_details() -> Dict[str, Dict[str, Any]]:
    details: Dict[str, Dict[str, Any]] = {}
    for day in ITINERARY_DAYS:
        for entry in day['entries']:
            place_name = entry['google_query']
            if place_name in details:
                continue
            query = PLACE_QUERIES.get(place_name, place_name)
            details[place_name] = fetch_place_details(place_name, query)
    return details


def format_currency_jpy(value: int) -> str:
    return f"¥{value:,}" if value else '¥0'


def jpy_to_gbp(value: int) -> float:
    return round(value / JPY_PER_GBP, 2)


def format_currency_gbp(value: float) -> str:
    return f"£{value:,.2f}"


def format_nice_date(value: str) -> str:
    try:
        dt = datetime.strptime(value, '%Y-%m-%d')
    except ValueError:
        return value
    return f"{dt.strftime('%B')} {dt.day}, {dt.year}"


def download_place_photo(place: Dict[str, Any], folder_path: Path, base_name: str) -> str:
    photos = place.get('photos') or []
    for photo in photos:
        reference = photo.get('photo_reference')
        if not reference:
            continue
        params = {
            'maxwidth': 1200,
            'photoreference': reference,
            'key': API_KEY,
        }
        try:
            response = SESSION.get(
                'https://maps.googleapis.com/maps/api/place/photo',
                params=params,
                timeout=60,
                stream=True,
            )
            response.raise_for_status()
        except requests.RequestException:
            return ''
        content_type = response.headers.get('Content-Type', '')
        mime_type = content_type.split(';')[0].strip() if content_type else 'image/jpeg'
        extension = mimetypes.guess_extension(mime_type) or '.jpg'
        image_name = f"{base_name}{extension}"
        image_path = folder_path / image_name
        with image_path.open('wb') as fh:
            for chunk in response.iter_content(8192):
                fh.write(chunk)
        time.sleep(0.15)
        return image_name
    return ''


def build_itinerary_markdown(
    day_index: int,
    entry: Dict[str, Any],
    place: Dict[str, Any],
    folder_name: str,
    image_name: str,
) -> str:
    address = place.get('formatted_address', '—')
    maps_url = place.get('url', '')
    rating = place.get('rating')
    reviews = place.get('user_ratings_total')
    phone = place.get('international_phone_number')
    website = place.get('website')
    loc = place.get('geometry', {}).get('location') or {}
    budget_jpy = int(entry.get('budget_jpy') or 0)
    budget_gbp = jpy_to_gbp(budget_jpy) if budget_jpy else 0.0
    description = tidy_text(entry['description'])
    notes_parts = [
        f"{entry['time']} — {description}",
        entry.get('logistics', ''),
        f"Booking: {entry['booking']}" if entry.get('booking') else '',
        f"With {entry['companions']}" if entry.get('companions') else '',
    ]
    if budget_jpy:
        notes_parts.append(f"Approx spend {format_currency_gbp(budget_gbp)}")
    if entry.get('notes'):
        notes_parts.append(entry['notes'])
    notes_text = tidy_text(' '.join(part for part in notes_parts if part)) or '—'

    lines = [
        f"# {entry['name']}",
        '',
        f"Group: {entry['region']}",
        f"Day: Day {day_index}",
        f"Type: {entry['category']}",
        f"Notes: {notes_text}",
        "Visited: No",
        '',
    ]

    if maps_url:
        lines.append(f"[Address: {address}]({maps_url})")
    else:
        lines.append(f"Address: {address}")

    if rating:
        rating_line = f"Rating: {rating}"
        if reviews:
            rating_line += f" ({reviews} reviews)"
        lines.append(rating_line)
    if phone:
        lines.append(f"Phone: {phone}")
    if website:
        lines.append(f"Website: {website}")
    if loc:
        lines.append(f"Coordinates: {loc.get('lat')}, {loc.get('lng')}")

    if image_name:
        lines.append('')
        encoded_folder = quote(folder_name)
        encoded_image = quote(image_name)
        lines.append(f"![{image_name}]({encoded_folder}/{encoded_image})")

    return "\n".join(lines).strip() + "\n"



def write_itinerary(place_details: Dict[str, Dict[str, Any]]) -> None:
    ensure_clean_directory(TRAVEL_DIR)
    headers = ['Name', 'Day', 'Friends', 'Description', 'Group', 'Notes', 'Type', 'URL', 'Visited']
    rows: List[List[str]] = []
    for idx, day in enumerate(ITINERARY_DAYS, start=1):
        day_label = f"Day {idx}"
        for entry in day['entries']:
            place_name = entry['google_query']
            place = place_details[place_name]
            entry_id = ID_GEN.generate(entry['name'] + day['date'])
            folder_name = f"{safe_filename(entry['name'])} {entry_id}"
            folder_path = TRAVEL_DIR / folder_name
            folder_path.mkdir(parents=True, exist_ok=True)
            image_base = ''.join(ch.lower() if ch.isalnum() else '_' for ch in entry['name']).strip('_') or 'photo'
            image_name = download_place_photo(place, folder_path, image_base)
            markdown_path = TRAVEL_DIR / f"{folder_name}.md"
            markdown_path.write_text(
                build_itinerary_markdown(idx, entry, place, folder_name, image_name),
                encoding='utf-8',
            )
            budget_jpy = int(entry.get('budget_jpy') or 0)
            budget_gbp = jpy_to_gbp(budget_jpy) if budget_jpy else 0.0
            description = tidy_text(f"{entry['time']} — {entry['description']}")
            notes_parts = []
            if entry.get('logistics'):
                notes_parts.append(entry['logistics'])
            if entry.get('booking'):
                notes_parts.append(f"Booking: {entry['booking']}")
            if entry.get('companions'):
                notes_parts.append(f"With {entry['companions']}")
            if budget_jpy:
                notes_parts.append(f"Budget around {format_currency_gbp(budget_gbp)}")
            if day['nanako_work']:
                notes_parts.append('Nanako working day')
            if entry.get('notes'):
                notes_parts.append(entry['notes'])
            notes = tidy_text(' '.join(notes_parts))
            rows.append([
                entry['name'],
                day_label,
                day.get('friends', ''),
                description,
                entry['region'],
                notes,
                entry['category'],
                place.get('url', ''),
                'No',
            ])
    csv_path = TRAVEL_DIR.with_suffix('.csv')
    with csv_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        writer.writerows(rows)
    all_path = TRAVEL_DIR.with_name(TRAVEL_DIR.name + '_all').with_suffix('.csv')
    with all_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        writer.writerows(rows)


def build_packing_markdown(item: Dict[str, Any]) -> str:
    notes_parts = [item.get('notes', '')]
    if item.get('linked_days'):
        notes_parts.append(f"Linked days: {item['linked_days']}")
    if item.get('owner'):
        notes_parts.append(f"Owner: {item['owner']}")
    notes_text = tidy_text(' '.join(part for part in notes_parts if part)) or '—'
    packed = 'Yes' if str(item.get('status', '')).lower().startswith('packed') else 'No'
    return (
        f"# {item['name']}\n\n"
        f"Type: {item['category']}\n"
        f"Notes: {notes_text}\n"
        f"Packed: {packed}\n"
        f"Quantity: {item['quantity']}\n"
    )



def write_packing_list() -> None:
    ensure_clean_directory(PACKING_DIR)
    headers = ['Name', 'Type', 'Quantity', 'Notes', 'Packed']
    rows: List[List[str]] = []
    for item in PACKING_ITEMS:
        item_id = ID_GEN.generate(item['name'])
        md_path = PACKING_DIR / f"{safe_filename(item['name'])} {item_id}.md"
        md_path.write_text(build_packing_markdown(item), encoding='utf-8')
        packed = 'Yes' if str(item.get('status', '')).lower().startswith('packed') else 'No'
        notes_parts = [item.get('notes', '')]
        if item.get('linked_days'):
            notes_parts.append(f"Linked days: {item['linked_days']}")
        if item.get('owner'):
            notes_parts.append(f"Owner: {item['owner']}")
        notes = tidy_text(' '.join(part for part in notes_parts if part))
        rows.append([
            item['name'],
            item['category'],
            item['quantity'],
            notes,
            packed,
        ])
    csv_path = PACKING_DIR.with_suffix('.csv')
    with csv_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        writer.writerows(rows)
    all_path = PACKING_DIR.with_name(PACKING_DIR.name + '_all').with_suffix('.csv')
    with all_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        writer.writerows(rows)


def build_expense_markdown(item: Dict[str, Any]) -> str:
    amount_gbp = format_currency_gbp(jpy_to_gbp(int(item.get('estimated_cost_jpy') or 0)))
    comment_parts = [item.get('notes', '')]
    if item.get('city'):
        comment_parts.append(f"City: {item['city']}")
    if item.get('type'):
        comment_parts.append(f"Type: {item['type']}")
    if item.get('status'):
        comment_parts.append(f"Status: {item['status']}")
    comment = tidy_text(' '.join(part for part in comment_parts if part)) or '—'
    date_text = format_nice_date(item.get('date', ''))
    return (
        f"# {item['name']}\n\n"
        f"Transaction Amount: {amount_gbp}\n"
        f"Category: {item['category']}\n"
        f"Comment: {comment}\n"
        f"Date: {date_text}\n"
    )



def write_expenses() -> None:
    ensure_clean_directory(EXPENSE_DIR)
    headers = ['Date', 'Expense', 'Transaction Amount', 'Paid By', 'Category', 'Comment', 'URL']
    rows: List[List[str]] = []
    for item in EXPENSE_ITEMS:
        expense_id = ID_GEN.generate(item['name'])
        md_path = EXPENSE_DIR / f"{safe_filename(item['name'])} {expense_id}.md"
        md_path.write_text(build_expense_markdown(item), encoding='utf-8')
        amount_gbp = format_currency_gbp(jpy_to_gbp(int(item.get('estimated_cost_jpy') or 0)))
        comment_parts = [item.get('notes', '')]
        if item.get('city'):
            comment_parts.append(f"City: {item['city']}")
        if item.get('type'):
            comment_parts.append(f"Type: {item['type']}")
        if item.get('status'):
            comment_parts.append(f"Status: {item['status']}")
        if item.get('linked_days'):
            comment_parts.append(f"Linked days: {item['linked_days']}")
        comment = tidy_text(' '.join(part for part in comment_parts if part))
        rows.append([
            format_nice_date(item.get('date', '')),
            item['name'],
            amount_gbp,
            '',
            item['category'],
            comment,
            item.get('url', ''),
        ])
    csv_path = EXPENSE_DIR.with_suffix('.csv')
    with csv_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        writer.writerows(rows)
    all_path = EXPENSE_DIR.with_name(EXPENSE_DIR.name + '_all').with_suffix('.csv')
    with all_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        writer.writerows(rows)


def build_daily_timeline() -> str:
    lines = []
    for idx, day in enumerate(ITINERARY_DAYS, start=1):
        lines.append(f"### Day {idx} — {day['date']} ({day['weekday']}) · {day['title']}")
        lines.append(f"- **Nanako work day:** {'Yes' if day['nanako_work'] else 'No'}")
        lines.append(f"- **Base / lodging:** {day['lodging']}")
        lines.append(f"- **Vibe:** {day['summary']}")
        lines.append("- **Highlights:**")
        for entry in day['entries']:
            budget = int(entry.get('budget_jpy') or 0)
            if budget:
                budget_text = f"{format_currency_jpy(budget)} (≈ {format_currency_gbp(jpy_to_gbp(budget))})"
            else:
                budget_text = 'Free'
            lines.append(
                f"  - {entry['time']} · **{entry['name']}** ({entry['category']}, {entry['region']}) — {entry['description']}"
                f" — Est. {budget_text}"
            )
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def summarize_budget() -> Dict[str, Any]:
    total_jpy = sum(item['estimated_cost_jpy'] for item in EXPENSE_ITEMS)
    category_totals: Dict[str, int] = {}
    for item in EXPENSE_ITEMS:
        category_totals[item['category']] = category_totals.get(item['category'], 0) + item['estimated_cost_jpy']
    return {
        'total_jpy': total_jpy,
        'total_gbp': jpy_to_gbp(total_jpy),
        'category_totals': {
            k: (v, jpy_to_gbp(v)) for k, v in sorted(category_totals.items(), key=lambda kv: kv[0])
        },
    }


def build_main_markdown(budget_summary: Dict[str, Any], timeline: str) -> str:
    total_jpy = budget_summary['total_jpy']
    total_gbp = budget_summary['total_gbp']
    lines = [
        '# Japan Travel Planner 🌸 — Notion import draft',
        '',
        '## Welcome ✨',
        'Mid-November 2025 is officially mapped! This document mirrors Japlan’s vibe while staying Notion-import ready.',
        '',
        '---',
        '',
        '## Priority To-Dos ✅',
        '',
        '- [ ] Reserve Nozomi shinkansen seats (Nov 22, 24, 28).',
        '- [ ] Book USJ Express 7 + Kinopio’s Café (opens ~3 months prior).',
        '- [ ] Secure Tokyo DisneySea tickets + Premier Access (60 days prior).',
        '- [ ] Reserve Camellia tea ceremony + Tsuen Tea tasting.',
        '- [ ] Confirm W Osaka suite + birthday amenities.',
        '- [ ] Pre-order Pokémon Café + Shibuya Sky slots.',
        '- [ ] Arrange travel insurance & upload policy to Notion.',
        '- [ ] Sync gift list + birthdays (you & Ken) with Nana, Nicole, Ken.',
        '',
        '---',
        '',
        '## Trip snapshot (14–30 Nov 2025)',
        '',
        '| Day | Date | Base | Focus | Friends |',
        '| --- | --- | --- | --- | --- |'
    ]
    for idx, day in enumerate(ITINERARY_DAYS, start=1):
        friend_callout = day.get('friends', '')
        lines.append(f"| {idx} | {day['date']} ({day['weekday']}) | {day['lodging']} | {day['title']} | {friend_callout} |")
    lines.extend([
        '',
        '---',
        '',
        '## Daily timeline',
        '',
        timeline,
        '---',
        '',
        '## Budget snapshot',
        '',
        f"- **Total plan:** {format_currency_jpy(total_jpy)} (≈ {format_currency_gbp(total_gbp)})",
        '- **Category breakdown:**',
    ])
    for category, (jpy_value, gbp_value) in budget_summary['category_totals'].items():
        lines.append(f"  - {category}: {format_currency_jpy(jpy_value)} (≈ {format_currency_gbp(gbp_value)})")
    lines.extend([
        '',
        '---',
        '',
        '## Nanako work rhythm',
        '',
        '| Weekday | Work? | Plan |',
        '| --- | --- | --- |'
    ])
    for day in ITINERARY_DAYS:
        if day['weekday'] in ('Tuesday', 'Friday'):
            lines.append(f"| {day['date']} ({day['weekday']}) | {'✅' if day['nanako_work'] else '☑️'} | {day['summary']} |")
    lines.extend([
        '',
        '---',
        '',
        '## Friend coordination',
        '',
        '- **Nicole & Ken:** Join Tokyo weekend (Nov 22–24) + Osaka birthday + Kyoto foliage (Nov 29).',
        '- **James:** Meets in Shibuya on Sat 22 Nov (Shibuya Sky + dinner).',
        '- **Phil:** Flex invite for Harajuku afternoon or Osaka birthday drinks.',
        '- **Nanako:** Works Tue/Fri; co-work together in Hirakata; celebratory leave not required.',
        '',
        '---',
        '',
        '## Packing themes',
        '',
        '- Layered streetwear for Osaka + Harajuku fashion hunts.',
        '- Warm Kyoto & Kobe evenings (scarves/gloves).',
        '- Spa/onsen-ready kits and birthday glam wardrobe.',
        '- Tech + creative gadgets for Japlan-style journaling.',
        '',
        '---',
        '',
        '## Next actions timeline',
        '',
        '| When | Action |',
        '| --- | --- |',
        '| Jul 2025 | Confirm annual leave + lock flights |',
        '| Aug 2025 | Reserve Hotel Agora + Kyoto machiya + W Osaka |',
        '| Sep 2025 | Book Disney/USJ/teamLab tickets; order birthday décor |',
        '| Oct 2025 | Finalise transport passes, travel insurance, and karaoke bookings |',
        '| Early Nov 2025 | Share final itinerary with friends, pack gifts, reconfirm reservations |',
        '',
        '---',
        '',
        '_All sections are formatted for smooth Notion CSV + Markdown import. Enjoy the adventure planning!_'
    ])
    return "\n".join(lines) + "\n"


def main() -> None:
    place_details = gather_place_details()
    write_itinerary(place_details)
    write_packing_list()
    write_expenses()
    timeline = build_daily_timeline()
    budget_summary = summarize_budget()
    main_md_path = BASE_DIR.with_suffix('.md')
    main_md_path.write_text(build_main_markdown(budget_summary, timeline), encoding='utf-8')


if __name__ == '__main__':
    main()
