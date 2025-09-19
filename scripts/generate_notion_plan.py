import csv
import json
import os
import textwrap
import time
import uuid
import shutil
from pathlib import Path
from typing import Dict, List, Any

import requests

BASE_DIR = Path('notion_export') / 'Japan Travel Planner 🌸 273042fae56c80149c0ded3ca759366a'
TRAVEL_DIR = BASE_DIR / 'Travel Itinerary 273042fae56c81f4b235f8b4a219d671'
PACKING_DIR = BASE_DIR / 'Packing List 273042fae56c8157b6cffb25550a7f53'
EXPENSE_DIR = BASE_DIR / 'Expenses 273042fae56c8184bec2d767d89c564d'

CACHE_PATH = Path('scripts') / 'google_places_cache.json'
API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
if not API_KEY:
    raise SystemExit('GOOGLE_MAPS_API_KEY environment variable is required.')

SESSION = requests.Session()


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
    if name in cache:
        return cache[name]

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
        'fields': 'name,formatted_address,international_phone_number,website,url,rating,user_ratings_total,opening_hours,geometry/location',
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


# Data definitions appended below
ITINERARY_DAYS: List[Dict[str, Any]] = [
    {
        'date': '2025-11-14',
        'weekday': 'Friday',
        'title': 'Arrival glow-up in Osaka',
        'nanako_work': True,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Land at KIX, set up Kansai transport cards, ease into Osaka nights with river lights and comfort food near Dōtonbori.',
        'entries': [
            {
                'name': 'Kansai International Airport',
                'time': '10:30-12:00',
                'category': 'Arrival',
                'region': 'Osaka',
                'description': 'Touch down, breeze through Smart Immigration, and pick up ICOCA & Haruka passes for the fortnight of Kansai adventures.',
                'logistics': 'Follow signage to JR Ticket Office (Level 2) for the ICOCA & HARUKA bundle; allow 45 minutes for immigration & luggage.',
                'booking': 'Pre-fill Visit Japan Web QR codes; seat reservations optional on Haruka Express (green car recommended with luggage).',
                'companions': 'You + Nana (evening meet-up)',
                'google_query': 'Kansai International Airport Terminal 1',
                'budget_jpy': 0,
                'notes': 'Flight arrival planned for 10:30 JST — adjust if airline changes schedule.',
            },
            {
                'name': 'Hotel Agora Osaka Moriguchi',
                'time': '12:45-13:30',
                'category': 'Lodging',
                'region': 'Osaka (Keihan Line)',
                'description': 'Check into a sleek Keihan-line base so Nana can commute easily on work days while you explore nearby neighbourhood cafés.',
                'logistics': 'Haruka to Tennoji (45 min) → Osaka Loop to Kyobashi → Keihan express to Moriguchishi (total ~75 min). Request corner room with river view.',
                'booking': 'Reserve flexible twin (Nov 14–18, 20–22, 25–26) on official site with breakfast add-on; note late check-in if flights delay.',
                'companions': 'You + Nana',
                'google_query': 'Hotel Agora Osaka Moriguchi',
                'budget_jpy': 24000,
                'notes': 'Use luggage forwarding desk to send Kyoto overnight bag on 19 Nov.',
            },
            {
                'name': 'Dōtonbori promenade',
                'time': '17:00-18:00',
                'category': 'Neighbourhood Stroll',
                'region': 'Osaka',
                'description': 'Ease into the neon with a golden-hour stroll beneath the Glico sign, sampling street snacks and capturing the first couple snaps.',
                'logistics': 'Keihan line to Yodoyabashi → Midosuji subway to Namba (30 min). Hit Don Quijote for Suica/ICOCA top-ups and trip mascot souvenirs.',
                'booking': 'None; aim for 17:00 for dusk reflections.',
                'companions': 'You + Nana',
                'google_query': 'Dotonbori',
                'budget_jpy': 2000,
                'notes': 'Pick up matching gachapon keychains as kick-off ritual.',
            },
            {
                'name': 'Tonbori River Cruise',
                'time': '18:15-18:45',
                'category': 'Experience',
                'region': 'Osaka',
                'description': 'Sail past Osaka’s LED canyon; perfect for first-night wow shots and a quick rest for jet-lagged feet.',
                'logistics': 'Board at Tazaemon-bashi Dock. Arrive 15 minutes early to swap QR voucher for tickets.',
                'booking': 'Reserve online (¥1,200 pp); choose front-row seats for unobstructed photos.',
                'companions': 'You + Nana',
                'google_query': 'Tombori River Cruise',
                'budget_jpy': 2400,
                'notes': 'Pack light jacket — November breezes over the canal can be crisp.',
            },
            {
                'name': 'Mizuno Okonomiyaki',
                'time': '19:00-20:30',
                'category': 'Food',
                'region': 'Osaka',
                'description': 'Celebrate night one with caramelised okonomiyaki on a teppan counter, pairing yuzu highballs with the flagship yam batter.',
                'logistics': 'Queue likely ~30 minutes; add name at 18:30 then explore Hozenji Yokocho until called. Order “Yamaimo-yaki” and seasonal special.',
                'booking': 'No reservations; cash-focused (¥2,500 pp).',
                'companions': 'You + Nana',
                'google_query': 'Mizuno',
                'budget_jpy': 5000,
                'notes': 'Request English menu for limited-time toppings.',
            },
            {
                'name': 'Hozenji Yokocho lantern walk',
                'time': '20:30-21:15',
                'category': 'Night Stroll',
                'region': 'Osaka',
                'description': 'Wind down along the mossy alley, wash the Fudō-myōō statue for blessings, and grab warabi-mochi to-go for the train ride home.',
                'logistics': '2-minute walk from Mizuno. Keihan trains run until after midnight back to Moriguchishi (last rapid ~23:50).',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Hozenji Yokocho',
                'budget_jpy': 1200,
                'notes': 'Collect omamori for safe travels + relationship luck.',
            },
        ],
    },
    {
        'date': '2025-11-15',
        'weekday': 'Saturday',
        'title': 'Osaka street style & illuminated nights',
        'nanako_work': False,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Dive into Osaka fashion districts, nibble market bites, and close with immersive art in the botanical gardens.',
        'entries': [
            {
                'name': 'Brooklyn Roasting Company Kitahama',
                'time': '09:00-10:00',
                'category': 'Coffee',
                'region': 'Osaka',
                'description': 'Fuel up riverside with Kyoto-sourced beans and plan the day over almond croissants in the airy loft.',
                'logistics': 'Keihan express to Kitahama (20 min). Grab window seats upstairs for canal views.',
                'booking': 'None; arrive before 09:30 to beat the weekend crowd.',
                'companions': 'You + Nana',
                'google_query': 'Brooklyn Roasting Company Kitahama',
                'budget_jpy': 1800,
                'notes': 'Bring reusable tumbler for iced seasonal blends.',
            },
            {
                'name': 'Shinsaibashi-suji & Amerikamura treasure hunt',
                'time': '10:15-13:00',
                'category': 'Shopping',
                'region': 'Osaka',
                'description': 'Blend Shinsaibashi flagship finds with Amerikamura thrift gems—hunt vintage Harajuku vibes, refill skincare at @cosme, and hit Kinji for statement pieces.',
                'logistics': 'Walk from Kitahama via Midosuji (15 min). Use lockers at Shinsaibashi Station to store purchases before lunch.',
                'booking': 'None; map favourite boutiques in advance on shared Google Map.',
                'companions': 'You + Nana',
                'google_query': 'Shinsaibashi-suji Shopping Street',
                'budget_jpy': 15000,
                'notes': 'Drop by WEGO, BAPE, and vinyl at Timebomb Records.',
            },
            {
                'name': 'Kuromon Ichiba Market tasting lunch',
                'time': '13:15-14:30',
                'category': 'Food',
                'region': 'Osaka',
                'description': 'Grazing lunch of toro nigiri, charcoal-grilled scallops, and strawberry daifuku while chatting with fishmongers.',
                'logistics': '5-minute walk to Kuromon. Bring cash for stall snacks; aim for 6-8 bites (~¥3,000 pp).',
                'booking': 'Optional: pre-book Kuromon tasting tour for insider stalls.',
                'companions': 'You + Nana',
                'google_query': 'Kuromon Ichiba Market',
                'budget_jpy': 6000,
                'notes': 'Pick up fruit gift for Nana’s parents.',
            },
            {
                'name': 'Namba Yasaka Shrine guardian photos',
                'time': '15:00-15:40',
                'category': 'Culture',
                'region': 'Osaka',
                'description': 'Snap surreal shots in front of the iconic lion-head stage and leave ema wishes for the journey.',
                'logistics': '10-minute stroll from Kuromon via backstreets; best lighting mid-afternoon.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Namba Yasaka Shrine',
                'budget_jpy': 500,
                'notes': 'Collect goshuin stamp for the travel shrine book.',
            },
            {
                'name': 'teamLab Botanical Garden Osaka',
                'time': '18:00-20:00',
                'category': 'Immersive Art',
                'region': 'Osaka',
                'description': 'Nighttime digital art woven through Nagai Botanical Garden—glowing eggs, mirrored ponds, and luminous bamboo groves.',
                'logistics': 'Subway Midosuji Line to Nagai (20 min from Shinsaibashi). Allow 90 minutes to wander loops; bring lightweight tripod alternative.',
                'booking': 'Secure 18:00 entry slot (¥1,800 pp) through teamLab website two months ahead.',
                'companions': 'You + Nana',
                'google_query': 'teamLab Botanical Garden Osaka',
                'budget_jpy': 3600,
                'notes': 'Check weather—open-air event; reschedule option needed if heavy rain.',
            },
        ],
    },
    {
        'date': '2025-11-16',
        'weekday': 'Sunday',
        'title': 'Kyoto Arashiyama & Fushimi fairytale',
        'nanako_work': False,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Sunrise bamboo, riverside soba, and torii-lined twilight to balance nature and iconic Kyoto culture.',
        'entries': [
            {
                'name': 'Arashiyama Bamboo Grove',
                'time': '06:30-07:30',
                'category': 'Nature',
                'region': 'Kyoto',
                'description': 'Catch the bamboo groves before crowds arrive, capturing misty light beams and atmospheric morning sounds.',
                'logistics': 'Keihan to Demachiyanagi → Hankyu to Arashiyama (~60 min). Ride first Hankyu departure 05:30 to arrive pre-dawn.',
                'booking': 'None; pack tripod and optional kimono rental from 8:00 onwards.',
                'companions': 'You + Nana',
                'google_query': 'Arashiyama Bamboo Grove',
                'budget_jpy': 0,
                'notes': 'Consider hiring local photographer for 07:00 mini-shoot.',
            },
            {
                'name': 'Tenryu-ji Temple & Sogenchi Garden',
                'time': '07:45-09:15',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Explore UNESCO Zen gardens glowing with momiji, and sip matcha overlooking the koi pond.',
                'logistics': 'Entrance ¥500 + ¥300 for garden. Use north gate to exit directly into bamboo grove.',
                'booking': 'Reserve shojin-ryori breakfast at Shigetsu for 8:00 seating if desired.',
                'companions': 'You + Nana',
                'google_query': 'Tenryu-ji Temple',
                'budget_jpy': 1600,
                'notes': 'Check foliage reports for peak colour adjustments.',
            },
            {
                'name': 'Riverside soba at Arashiyama Yoshimura',
                'time': '11:00-12:00',
                'category': 'Food',
                'region': 'Kyoto',
                'description': 'Warm up with handmade soba and tempura while overlooking Togetsukyo Bridge from tatami seating.',
                'logistics': 'Add name to queue by 10:30; ask for second-floor window seat. Average spend ¥2,000 pp.',
                'booking': 'No reservations; request English menu for seasonal soba.',
                'companions': 'You + Nana',
                'google_query': 'Arashiyama Yoshimura',
                'budget_jpy': 4000,
                'notes': 'Order yuba sashimi sampler to share.',
            },
            {
                'name': 'Kimono Forest at Randen Arashiyama',
                'time': '12:10-12:40',
                'category': 'Photo Spot',
                'region': 'Kyoto',
                'description': 'Wander through 600 illuminated kimono poles—perfect midday photo op before heading south.',
                'logistics': 'Free entry beside Randen tram station. Capture boomerang videos under the sky projection well.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Kimono Forest',
                'budget_jpy': 0,
                'notes': 'Pick favourite pattern for future custom yukata order.',
            },
            {
                'name': 'Fushimi Inari Taisha golden hour climb',
                'time': '16:00-18:00',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Trace thousands of vermilion torii, pausing at Yotsutsuji for Kyoto panorama as lanterns begin to glow.',
                'logistics': 'JR Nara Line to Inari (30 min). Climb to summit (~90 min round trip) with kitsune snack stops.',
                'booking': 'None; consider renting kimono early morning for evening return photos.',
                'companions': 'You + Nana',
                'google_query': 'Fushimi Inari Taisha',
                'budget_jpy': 0,
                'notes': 'Write shared wish on torii ema for upcoming Tokyo meet-ups.',
            },
            {
                'name': 'Gekkeikan Okura Sake Museum tasting flight',
                'time': '18:15-19:30',
                'category': 'Food & Drink',
                'region': 'Kyoto',
                'description': 'Sample aged sake in the heart of Fushimi, blending history with guided tasting notes perfect for gifting.',
                'logistics': 'Walk 12 minutes from Inari to Chushojima area (or quick Keihan ride). Last tasting entry 19:00.',
                'booking': 'Reserve premium tasting course (¥1,000) for English guide availability.',
                'companions': 'You + Nana',
                'google_query': 'Gekkeikan Okura Sake Museum',
                'budget_jpy': 2000,
                'notes': 'Ship bottle set to Nana’s apartment to avoid luggage weight.',
            },
        ],
    },
    {
        'date': '2025-11-17',
        'weekday': 'Monday',
        'title': 'Nara deer magic & Uji tea whispers',
        'nanako_work': False,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Gentle day mixing heritage, playful deer, and refined matcha before a quiet evening back in Hirakata.',
        'entries': [
            {
                'name': 'Tōdai-ji Daibutsuden',
                'time': '09:00-10:30',
                'category': 'Culture',
                'region': 'Nara',
                'description': 'Stand beneath the 15-meter bronze Buddha and enjoy the morning chanting echoing through the ancient hall.',
                'logistics': 'Kintetsu rapid to Nara (55 min). Buy combo ticket (¥1,000) covering museum if interested.',
                'booking': 'Arrive at opening to avoid school groups.',
                'companions': 'You + Nana',
                'google_query': 'Todai-ji',
                'budget_jpy': 2000,
                'notes': 'Carry deer senbei in tote pocket for surprise cameos.',
            },
            {
                'name': 'Nara Park deer moments',
                'time': '10:30-11:30',
                'category': 'Nature',
                'region': 'Nara',
                'description': 'Stroll tree-lined paths feeding polite deer, capturing playful bows and autumn leaves.',
                'logistics': 'Deer crackers ¥200; sanitize hands frequently. Stay near central lawn to keep timeline on track.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Nara Park',
                'budget_jpy': 600,
                'notes': 'Watch for deer nibbling maps—store paper items securely.',
            },
            {
                'name': 'Nakatanidou mochi theatrics',
                'time': '11:40-12:10',
                'category': 'Food',
                'region': 'Nara',
                'description': 'Catch the famous high-speed mochi pounding show and snack on warm yomogi mochi dusted in kinako.',
                'logistics': '5-minute walk from Kintetsu Nara Station. Shows roughly every 30 minutes—arrive just before noon.',
                'booking': 'None; cash only (¥130 per mochi).',
                'companions': 'You + Nana',
                'google_query': 'Nakatanidou',
                'budget_jpy': 500,
                'notes': 'Record slow-mo video for Instagram reel.',
            },
            {
                'name': 'Byōdō-in Phoenix Hall',
                'time': '13:30-15:00',
                'category': 'Culture',
                'region': 'Uji',
                'description': 'Admire the iconic Phoenix Hall mirrored in the reflecting pond, stepping inside for the gold-leaf interior tour.',
                'logistics': 'JR Nara Line to Uji (30 min). Entry ¥700 + ¥300 museum; interior tour timed—collect tickets upon arrival.',
                'booking': 'Optional: pre-book English audio guide.',
                'companions': 'You + Nana',
                'google_query': 'Byodoin',
                'budget_jpy': 2000,
                'notes': 'Pick up commemorative ¥10 coin reproduction from gift shop.',
            },
            {
                'name': 'Tsuen Tea master tasting',
                'time': '15:00-16:00',
                'category': 'Food & Drink',
                'region': 'Uji',
                'description': 'Sip hand-whisked matcha and gyokuro flight at the world’s oldest tea shop, learning whisk techniques from tea masters.',
                'logistics': 'Located beside Uji Bridge; reserve tea experience (¥2,500 pp). Allow extra time to browse teaware.',
                'booking': 'Book tasting counter 2 weeks ahead; request English notes.',
                'companions': 'You + Nana',
                'google_query': 'Tsuen Tea',
                'budget_jpy': 5000,
                'notes': 'Buy travel-friendly canisters for Tokyo friend gifts.',
            },
        ],
    },
    {
        'date': '2025-11-18',
        'weekday': 'Tuesday',
        'title': 'Hirakata work-play balance',
        'nanako_work': True,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Anchor near Nana’s office—productive morning, cosy lunch, evening soak, and izakaya skewers.',
        'entries': [
            {
                'name': 'Hirakata T-SITE coworking lounge',
                'time': '08:30-12:00',
                'category': 'Work Base',
                'region': 'Hirakata',
                'description': 'Settle into T-SITE’s airy 4F coworking zone with killer library aesthetics while Nana logs into the office nearby.',
                'logistics': '5-minute walk from Hirakatashi Station. Day pass ¥1,650 with unlimited drip coffee.',
                'booking': 'Reserve desk via Kansai Cowork app; request window seats.',
                'companions': 'You + Nana (working)',
                'google_query': 'Hirakata T-SITE',
                'budget_jpy': 1650,
                'notes': 'Print Disney/USJ booking confirmations using onsite printers.',
            },
            {
                'name': 'Café & Meal MUJI Hirakata T-SITE',
                'time': '12:15-13:00',
                'category': 'Food',
                'region': 'Hirakata',
                'description': 'Healthy tray lunch of seasonal deli picks, miso soup, and yuzu soda to keep energy up mid-workday.',
                'logistics': 'Order 4-item plate (~¥1,100). Grab take-home snacks for train rides later in the week.',
                'booking': 'No reservations; self-service ordering kiosk.',
                'companions': 'You + Nana',
                'google_query': 'Café & Meal MUJI Hirakata T-SITE',
                'budget_jpy': 2200,
                'notes': 'Check MUJI travel section for packing cubes before Tokyo.',
            },
            {
                'name': 'Gokurakuyu Hirakata evening soak',
                'time': '18:30-20:00',
                'category': 'Wellness',
                'region': 'Hirakata',
                'description': 'Reward the workday with rotenburo and carbonated baths at the local sentō/spa complex.',
                'logistics': 'Short taxi from station (~¥700). Bring onsen kit; tattoos require cover stickers (available at front desk).',
                'booking': 'No booking needed; entry ¥850 + ¥220 towel rental.',
                'companions': 'You + Nana',
                'google_query': 'Gokurakuyu Hirakata',
                'budget_jpy': 2140,
                'notes': 'Try the salt sauna and schedule shoulder massage (+¥2,000).',
            },
            {
                'name': 'Kushikatsu Tanaka Hirakata',
                'time': '20:15-21:30',
                'category': 'Food',
                'region': 'Hirakata',
                'description': 'Late-night skewers, DIY sauce, and highball towers steps from Nana’s station—casual, comforting, delicious.',
                'logistics': 'Book corner booth; share kushi-katsu set + cheese fondue skewers. Average spend ¥3,000 for two with drinks.',
                'booking': 'Use Tabelog to secure 20:15 slot (English-friendly).',
                'companions': 'You + Nana',
                'google_query': 'Kushikatsu Tanaka Hirakata',
                'budget_jpy': 6000,
                'notes': 'Ask staff about November limited-time skewers for birthday week inspiration.',
            },
        ],
    },
    {
        'date': '2025-11-19',
        'weekday': 'Wednesday',
        'title': 'Kyoto zen, tea, and machiya stay',
        'nanako_work': False,
        'lodging': 'Kyomachiya Ryokan Sakura Urushitei',
        'summary': 'Northwest Kyoto temples, tea ceremony, and a boutique machiya stay tucked in the backstreets of central Kyoto.',
        'entries': [
            {
                'name': 'Kinkaku-ji (Golden Pavilion)',
                'time': '08:30-09:30',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Glimpse the shimmering pavilion mirrored in Kyōko-chi pond just as the sun illuminates autumn leaves.',
                'logistics': 'Keihan to Demachiyanagi → bus 204 (35 min). Purchase ¥500 tickets at gate; follow one-way path.',
                'booking': 'No reservations; arrive before tour buses.',
                'companions': 'You + Nana',
                'google_query': 'Kinkaku-ji',
                'budget_jpy': 1000,
                'notes': 'Pick up matcha soft serve at exit if lines are short.',
            },
            {
                'name': 'Ryōan-ji Zen rock garden',
                'time': '09:45-10:30',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Contemplate the famed 15-stone karesansui garden in a serene morning setting.',
                'logistics': 'Walk 15 minutes from Kinkaku-ji. Entry ¥500; remove shoes when entering the temple hall.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Ryoan-ji Temple',
                'budget_jpy': 1000,
                'notes': 'Pair with nearby yudofu shop if craving a warm snack.',
            },
            {
                'name': 'Camellia GARDEN tea ceremony',
                'time': '11:30-12:30',
                'category': 'Experience',
                'region': 'Kyoto',
                'description': 'Hands-on tea ceremony in a hidden garden near Ninenzaka, blending cultural insight with meditative calm.',
                'logistics': 'Taxi from Ryōan-ji to Ninenzaka (20 min). Arrive 10 minutes early for optional kimono dressing.',
                'booking': 'Book private session (¥6,000 pp) via camellia-tea-ceremony.com; request English host Nozomi.',
                'companions': 'You + Nana',
                'google_query': 'Camellia GARDEN',
                'budget_jpy': 12000,
                'notes': 'Bring socks for tatami; photography allowed after ceremony.',
            },
            {
                'name': 'Honke Owariya main store lunch',
                'time': '13:00-14:00',
                'category': 'Food',
                'region': 'Kyoto',
                'description': 'Taste Kyoto’s oldest soba paired with tempura and seasonal sweets in a 550-year-old merchant house.',
                'logistics': '10-minute walk from Camellia. Try Hourai soba set (~¥1,600).',
                'booking': 'Call to reserve upstairs tatami seating; mention dietary notes.',
                'companions': 'You + Nana',
                'google_query': 'Honke Owariya Main Branch',
                'budget_jpy': 3500,
                'notes': 'Purchase soba cookies for tea-time gifts.',
            },
            {
                'name': 'Kyomachiya Ryokan Sakura Urushitei',
                'time': '15:00 check-in',
                'category': 'Lodging',
                'region': 'Kyoto',
                'description': 'Check into an artisan machiya with hinoki baths, yukata sets, and traditional breakfast service.',
                'logistics': 'Walk 12 minutes from Karasuma Station. Request luggage forwarding from Osaka using Yamato (~¥1,500).',
                'booking': 'Book courtyard suite for 19 Nov; include breakfast and kaiseki dinner upgrade.',
                'companions': 'You + Nana',
                'google_query': 'Kyomachiya Ryokan Sakura Urushitei',
                'budget_jpy': 40000,
                'notes': 'Arrange tatami tea-time photos before dinner.',
            },
            {
                'name': 'Hanamikoji twilight stroll',
                'time': '17:30-18:30',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Evening walk through Gion’s lantern-lit lanes hoping for a glimpse of maiko en route to engagements.',
                'logistics': '10-minute walk from ryokan. Stay respectful—no flash photography or blocking paths.',
                'booking': 'Optional: book Gion cultural guide for deeper insights.',
                'companions': 'You + Nana',
                'google_query': 'Hanamikoji Street',
                'budget_jpy': 0,
                'notes': 'Stop by Tatsumi Bridge for couple portraits.',
            },
        ],
    },
    {
        'date': '2025-11-20',
        'weekday': 'Thursday',
        'title': 'Kyoto dawn to Osaka skyline',
        'nanako_work': False,
        'lodging': 'OMO7 Osaka by Hoshino Resorts',
        'summary': 'Higashiyama sunrise, Kyoto foodie stops, and a dramatic Osaka skyline sunset before prepping for Friday work mode.',
        'entries': [
            {
                'name': 'Kiyomizu-dera sunrise blessings',
                'time': '06:00-07:15',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Beat the crowds to watch sunlight spill over Kyoto from the wooden stage while bells echo.',
                'logistics': 'Stay near temple overnight; gates open 06:00. Carry ¥400 entry fee in coins.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Kiyomizu-dera',
                'budget_jpy': 800,
                'notes': 'Collect omikuji for upcoming Tokyo luck.',
            },
            {
                'name': 'Sannenzaka & Ninenzaka slow stroll',
                'time': '07:15-08:00',
                'category': 'Shopping',
                'region': 'Kyoto',
                'description': 'Browse early-opening ceramics and craft shops before day-trippers flood the slopes.',
                'logistics': 'Start at Kiyomizu exit; stop at Starbucks Ninenzaka for Kyoto-only merch at 08:00.',
                'booking': 'None; pre-list must-visit boutiques.',
                'companions': 'You + Nana',
                'google_query': 'Sannenzaka',
                'budget_jpy': 4000,
                'notes': 'Buy engraved chopsticks for birthday dinner table settings.',
            },
            {
                'name': 'Kyoto Yakiniku Hiro (Shijo Kiyamachi)',
                'time': '12:00-13:30',
                'category': 'Food',
                'region': 'Kyoto',
                'description': 'Indulge in wagyu lunch set with river views before heading back to Osaka.',
                'logistics': 'Reserve tatami booth; lunch set ~¥3,500 pp. Use luggage storage at ryokan until departure.',
                'booking': 'Book via TableCheck; note allergy preferences.',
                'companions': 'You + Nana',
                'google_query': 'Kyoto Yakiniku Hiro Shijo Kiyamachi',
                'budget_jpy': 7000,
                'notes': 'Split premium platter to sample A5 cuts.',
            },
            {
                'name': 'Kyoto Station Sky Garden',
                'time': '14:00-14:45',
                'category': 'Viewpoint',
                'region': 'Kyoto',
                'description': 'Catch futuristic architecture and secret rooftop garden before boarding the train south.',
                'logistics': 'Take escalators to 11F; free entry. Grab Kyoto-style ekiben for train.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Kyoto Station',
                'budget_jpy': 0,
                'notes': 'Film time-lapse of escalator axis for trip vlog.',
            },
            {
                'name': 'OMO7 Osaka by Hoshino Resorts check-in',
                'time': '16:00-16:30',
                'category': 'Lodging',
                'region': 'Osaka',
                'description': 'Shift to a design-forward stay with tatami lounges, onsen-style baths, and Osaka-focused concierge tours.',
                'logistics': 'JR Kyoto Line to Tennoji (~45 min). Request skyline view room; enjoy welcome sweets.',
                'booking': 'Stay Nov 20 only; add breakfast buffet and sauna package.',
                'companions': 'You + Nana',
                'google_query': 'OMO7 Osaka by Hoshino Resorts',
                'budget_jpy': 32000,
                'notes': 'Ask concierge to arrange Friday morning shuttle to Hirakata.',
            },
            {
                'name': 'Umeda Sky Building sunset cocktails',
                'time': '17:30-19:00',
                'category': 'Viewpoint',
                'region': 'Osaka',
                'description': 'Toast with sky-high cocktails as Osaka transitions from gold to neon at the Floating Garden Observatory.',
                'logistics': 'JR Loop to Osaka Station; elevator + escalator to 39F. Entry ¥1,500 pp; bar menu extra.',
                'booking': 'Pre-book sunset slot; bring smartphone gimbal for skyline shots.',
                'companions': 'You + Nana',
                'google_query': 'Umeda Sky Building',
                'budget_jpy': 6000,
                'notes': 'Scout vantage points for birthday sparkler photos.',
            },
        ],
    },
    {
        'date': '2025-11-21',
        'weekday': 'Friday',
        'title': 'Focused Friday & gentle Hirakata evening',
        'nanako_work': True,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Keep Nana close to work, wrap gifts, and explore local hangouts ahead of the Tokyo sprint.',
        'entries': [
            {
                'name': 'Hirakata T-SITE cowork reset',
                'time': '08:30-11:30',
                'category': 'Work Base',
                'region': 'Hirakata',
                'description': 'Return to favourite desks for focus time, finalise Tokyo to-do lists, and sync with friends online.',
                'logistics': 'Grab corner booths with power outlets; schedule midday break at 11:30.',
                'booking': 'Reuse multi-day pass for coworking discount.',
                'companions': 'You + Nana',
                'google_query': 'Hirakata T-SITE',
                'budget_jpy': 1650,
                'notes': 'Ship Kyoto purchases via Yamato counter downstairs.',
            },
            {
                'name': 'Hirakata Park retro amusements',
                'time': '15:30-17:30',
                'category': 'Experience',
                'region': 'Hirakata',
                'description': 'Celebrate end of workweek with gentle coasters, Ferris wheel selfies, and warm crepes in the vintage amusement park.',
                'logistics': 'Discount twilight tickets from 15:00 (~¥1,500). Keep ride choices mild ahead of shinkansen weekend.',
                'booking': 'Check seasonal illumination schedule; pre-book if limited.',
                'companions': 'You + Nana',
                'google_query': 'Hirakata Park',
                'budget_jpy': 3000,
                'notes': 'Ride Sky Walker for panoramic sunset over Osaka riverways.',
            },
            {
                'name': 'Torisei Hirakata sake dinner',
                'time': '18:30-20:00',
                'category': 'Food',
                'region': 'Hirakata',
                'description': 'Charcoal yakitori matched with Fushimi sake flights before packing for Tokyo.',
                'logistics': 'Book counter seats; budget ¥3,500 for shared platters. Order seasonal hotpot special.',
                'booking': 'Reserve by phone; mention celebratory trip for omakase extras.',
                'companions': 'You + Nana',
                'google_query': 'Torisei Hirakata',
                'budget_jpy': 7000,
                'notes': 'Gift staff sake from Gekkeikan visit.',
            },
            {
                'name': 'Kuzuha Mall late-night prep run',
                'time': '20:15-21:30',
                'category': 'Shopping',
                'region': 'Hirakata',
                'description': 'Final stop for Heattech, birthday décor, and Shinkansen snacks.',
                'logistics': 'Keihan line 3 minutes from Hirakatashi. Visit Loft + Kaldi Coffee Farm for treats.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Kuzuha Mall',
                'budget_jpy': 12000,
                'notes': 'Print Tokyo itinerary at Aeon copy station if needed.',
            },
        ],
    },
    {
        'date': '2025-11-22',
        'weekday': 'Saturday',
        'title': 'Tokyo fashion convergence',
        'nanako_work': False,
        'lodging': 'sequence MIYASHITA PARK / MIMARU Tokyo Shinjuku WEST',
        'summary': 'Ride the Nozomi north, meet Nicole & Ken, and revel in Harajuku style before a rooftop sunset with James.',
        'entries': [
            {
                'name': 'sequence MIYASHITA PARK check-in',
                'time': '11:30-12:00',
                'category': 'Lodging',
                'region': 'Tokyo',
                'description': 'Drop bags at the design hotel hugging Miyashita Park—perfect base between Shibuya and Harajuku.',
                'logistics': 'Nozomi 16 from Shin-Osaka (08:00-10:30). Early baggage drop available; request high-floor park view.',
                'booking': 'Reserve 1 night (Nov 22) double room; ask for late checkout 12:00.',
                'companions': 'You + Nana',
                'google_query': 'sequence MIYASHITA PARK',
                'budget_jpy': 26000,
                'notes': 'Use hotel lockers for Nicole & Ken’s bags if they arrive early.',
            },
            {
                'name': 'Afuri Harajuku yuzu ramen lunch',
                'time': '12:30-13:30',
                'category': 'Food',
                'region': 'Tokyo',
                'description': 'Freshen up with light yuzu shio ramen and vegan seasonal bowls before diving into Takeshita chaos.',
                'logistics': 'Order via vending machine; share karaage side. Seating limited—arrive before peak rush.',
                'booking': 'No reservations; have Suica ready for quick payment.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Afuri Harajuku',
                'budget_jpy': 5000,
                'notes': 'Nicole loves spicy—grab the tsukemen option for her.',
            },
            {
                'name': 'Takeshita Street & Harajuku ateliers',
                'time': '13:30-16:30',
                'category': 'Shopping',
                'region': 'Tokyo',
                'description': 'Hop between Laforet pop-ups, 6%DOKIDOKI, and vintage sneaker shops while trying crepes and purikura booths.',
                'logistics': 'Create shared AirDrop album for haul photos. Visit Moshi Moshi Box for free Wi-Fi & maps.',
                'booking': 'Book 15:00 purikura slot at NOA Café for group shots.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Takeshita Street',
                'budget_jpy': 20000,
                'notes': 'Pick matching accessories for birthday party outfits.',
            },
            {
                'name': 'Shibuya Sky golden hour meet-up',
                'time': '17:00-18:30',
                'category': 'Viewpoint',
                'region': 'Tokyo',
                'description': 'Meet James for panoramic city views as the scramble lights up below—capture drone-like shots from the helipad deck.',
                'logistics': 'Pre-book 17:00 entry (¥2,200). Lockers for bags; no tripods allowed but smartphone gimbals ok.',
                'booking': 'Purchase tickets 2 months ahead; reserve Sky Gallery café seating.',
                'companions': 'You + Nana + Nicole + Ken + James',
                'google_query': 'SHIBUYA SKY',
                'budget_jpy': 11000,
                'notes': 'Coordinate surprise mini cake for James via café staff.',
            },
            {
                'name': 'Gonpachi Shibuya dinner',
                'time': '19:00-21:00',
                'category': 'Food',
                'region': 'Tokyo',
                'description': 'Izakaya feast with yakitori, sushi rolls, and sake flights inspired by Kill Bill vibes to cap the day.',
                'logistics': '10-minute walk from Shibuya Crossing. Order set menu (~¥5,000 pp) plus vegetarian sides for Ken.',
                'booking': 'Reserve private tatami room for 6; mention birthdays for dessert sparklers.',
                'companions': 'You + Nana + Nicole + Ken + James',
                'google_query': 'Gonpachi Shibuya',
                'budget_jpy': 30000,
                'notes': 'Pay via credit card; split bill later using shared tracker.',
            },
        ],
    },
    {
        'date': '2025-11-23',
        'weekday': 'Sunday',
        'title': 'Digital daydreams & Tokyo sleepover',
        'nanako_work': False,
        'lodging': 'MIMARU Tokyo Shinjuku WEST',
        'summary': 'Immerse in art-tech, indulge at Pokémon Café, and host a cosy game-night suite with Nicole & Ken.',
        'entries': [
            {
                'name': 'teamLab Planets TOKYO DMM',
                'time': '09:00-11:00',
                'category': 'Immersive Art',
                'region': 'Tokyo',
                'description': 'Barefoot, multi-sensory art spaces with mirrored water rooms—perfect for collaborative photos.',
                'logistics': 'Yurikamome to Shin-Toyosu. Bring small towel for water installations.',
                'booking': 'Book 09:00 slot (¥3,800 pp). Add photo plan for digital downloads.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'teamLab Planets TOKYO',
                'budget_jpy': 15200,
                'notes': 'Coordinate matching monochrome outfits for reflective shots.',
            },
            {
                'name': 'Pokémon Café Nihonbashi',
                'time': '12:00-13:30',
                'category': 'Food',
                'region': 'Tokyo',
                'description': 'Adorable character plates, latte art, and special edition merch with tableside Pikachu show.',
                'logistics': '5F Takashimaya annex; arrive 15 minutes early to check in. Average spend ¥3,000 pp.',
                'booking': 'Reservations open exactly 31 days in advance at 18:00 JST—set reminder.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Pokémon Café Nihonbashi',
                'budget_jpy': 12000,
                'notes': 'Order seasonal dessert for Ken’s birthday shout-out.',
            },
            {
                'name': 'MIMARU Tokyo Shinjuku WEST pajama party',
                'time': '15:00 check-in',
                'category': 'Lodging',
                'region': 'Tokyo',
                'description': 'Apartment-style suite with tatami bunk beds, kitchen for snacks, and board games for a nostalgic sleepover.',
                'logistics': 'Taxi from Nihonbashi (~25 min). Request Pokémon-themed room if available.',
                'booking': 'Book 2-bedroom suite for Nov 23; add breakfast basket.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'MIMARU Tokyo Shinjuku West',
                'budget_jpy': 36000,
                'notes': 'Set up projector for Mario Kart tournament.',
            },
            {
                'name': 'Karaoke Kan Shibuya all-out session',
                'time': '20:00-22:30',
                'category': 'Nightlife',
                'region': 'Tokyo',
                'description': 'Sing through anime themes, K-pop, and nostalgic hits with drink package and custom cake delivery.',
                'logistics': 'Reserve party room with neon lighting; bring Polaroid for instant keepsakes.',
                'booking': 'Book 3-hour plan with unlimited soft drinks + two cocktails per person.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Karaoke Kan Shibuya',
                'budget_jpy': 18000,
                'notes': 'Queue duet playlist curated earlier in Spotify.',
            },
        ],
    },
    {
        'date': '2025-11-24',
        'weekday': 'Monday',
        'title': 'Disney dreams & return to Kansai',
        'nanako_work': False,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Spend a sparkling day at Tokyo DisneySea before gliding back to Osaka with ekiben in tow.',
        'entries': [
            {
                'name': 'Tokyo DisneySea adventure',
                'time': '08:00-19:00',
                'category': 'Theme Park',
                'region': 'Tokyo',
                'description': 'Soar on Soaring, dive into Journey to the Center, and catch the evening Harbor of Dreams show with Christmas overlays.',
                'logistics': 'Resort line from Maihama Station; use Premier Access for Soaring + Journey to shorten queues.',
                'booking': 'Buy 1-day passports (¥10,900 pp) + 2 Premier Access per headline attraction.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Tokyo DisneySea',
                'budget_jpy': 43600,
                'notes': 'Coordinate group outfits (earth-tone Disney-bounding).',
            },
            {
                'name': 'Disney Ambassador Hotel lounge reset',
                'time': '13:30-15:00',
                'category': 'Lodging',
                'region': 'Tokyo',
                'description': 'Afternoon tea at Hyperion Lounge to recharge mid-park with seasonal desserts and photo ops.',
                'logistics': '5-minute walk from park entrance; deposit bags with bell desk before lounge visit.',
                'booking': 'Reserve 14:00 seating via official app; note birthday celebration.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Disney Ambassador Hotel',
                'budget_jpy': 16000,
                'notes': 'Collect exclusive hotel pin for keepsake board.',
            },
            {
                'name': 'Nozomi ride home with ekiben',
                'time': '19:40-22:30',
                'category': 'Transport',
                'region': 'Tokyo → Osaka',
                'description': 'Board Nozomi 273 back to Shin-Osaka with Tokyo Station bento feast and birthday countdown playlist planning.',
                'logistics': 'Depart Tokyo Station 19:40 (arrive 22:13). Reserve seats in car 13 for luggage space.',
                'booking': 'Use smartEX app to book seats; pick up at ticket machine.',
                'companions': 'You + Nana',
                'google_query': 'Tokyo Station',
                'budget_jpy': 30000,
                'notes': 'Wave goodbye to Nicole & Ken as they head back to Chiba.',
            },
        ],
    },
    {
        'date': '2025-11-25',
        'weekday': 'Tuesday',
        'title': 'Osaka regroup & culture night',
        'nanako_work': True,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Remote-friendly morning, museum wander post-work, and neon food-hall dinner for a relaxed reset.',
        'entries': [
            {
                'name': 'Hirakata T-SITE cowork catch-up',
                'time': '08:30-11:30',
                'category': 'Work Base',
                'region': 'Hirakata',
                'description': 'Dial back into work mode, archive Tokyo photos, and prep Osaka birthday logistics alongside Nana.',
                'logistics': 'Book day desk again; bring souvenirs for Nana’s colleagues.',
                'booking': 'Consider 5-day pass if returning later.',
                'companions': 'You + Nana (working)',
                'google_query': 'Hirakata T-SITE',
                'budget_jpy': 1650,
                'notes': 'Ship Nicole & Ken’s leftover gifts via Yamato.',
            },
            {
                'name': 'Osaka Museum of Housing and Living',
                'time': '15:30-17:00',
                'category': 'Culture',
                'region': 'Osaka',
                'description': 'Wander Edo-period Osaka streets recreated indoors—rent yukata for photos and learn urban history.',
                'logistics': 'Subway to Tenjinbashisuji 6-chome; lockers available for bags. Entry ¥600.',
                'booking': 'Reserve time slot online (English site) to skip queue.',
                'companions': 'You + Nana',
                'google_query': 'Osaka Museum of Housing and Living',
                'budget_jpy': 2000,
                'notes': 'Add optional kimono rental (~¥500) for photos.',
            },
            {
                'name': 'Torame Yokocho night market dinner',
                'time': '19:00-21:00',
                'category': 'Food',
                'region': 'Osaka',
                'description': 'Graze across Osaka comfort classics—takoyaki, kushikatsu, craft beer—under a retro neon arcade.',
                'logistics': 'Located in Namba. Reload ICOCA before arrival; mix-and-match small plates (~¥4,000 total).',
                'booking': 'No bookings; arrive early to secure communal table.',
                'companions': 'You + Nana',
                'google_query': 'Torame Yokocho',
                'budget_jpy': 8000,
                'notes': 'Scout dessert at adjoining “Electric Cafe” for matcha parfaits.',
            },
        ],
    },
    {
        'date': '2025-11-26',
        'weekday': 'Wednesday',
        'title': 'Kobe herb breezes & onsen glow',
        'nanako_work': False,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Aromatherapy at Nunobiki Herb Gardens, Kobe steak indulgence, and soothing Arima onsen before harbor lights.',
        'entries': [
            {
                'name': 'Kobe Nunobiki Herb Gardens & Ropeway',
                'time': '09:30-12:00',
                'category': 'Nature',
                'region': 'Kobe',
                'description': 'Glide up the ropeway for panoramic views and wander fragrant greenhouses with seasonal blooms.',
                'logistics': 'JR rapid to Shin-Kobe (30 min). Ropeway combo ticket ¥1,800; arrive early for crowd-free photos.',
                'booking': 'Purchase e-tickets online for express entry.',
                'companions': 'You + Nana',
                'google_query': 'Kobe Nunobiki Herb Gardens',
                'budget_jpy': 3600,
                'notes': 'Try herb soft serve at summit café.',
            },
            {
                'name': 'Steakland Kobe lunch set',
                'time': '12:30-14:00',
                'category': 'Food',
                'region': 'Kobe',
                'description': 'Classic teppan Kobe beef lunch with live chef performance—best value wagyu feast.',
                'logistics': '10-minute walk from Sannomiya. Lunch set ¥3,480 pp includes soup, salad, rice, dessert.',
                'booking': 'Call morning-of to secure counter seats; note medium-rare preference.',
                'companions': 'You + Nana',
                'google_query': 'Steakland Kobe',
                'budget_jpy': 8000,
                'notes': 'Add garlic chips and sparkling sake pairing.',
            },
            {
                'name': 'Arima Onsen Taiko-no-yu',
                'time': '15:00-18:00',
                'category': 'Wellness',
                'region': 'Arima',
                'description': 'Soak in gold and silver springs, explore cave baths, and book a private relaxation room.',
                'logistics': 'Hankyu Bus from Sannomiya (35 min). Entry ¥2,750; rent yukata + towel set.',
                'booking': 'Reserve private tatami lounge for two hours (+¥3,000).',
                'companions': 'You + Nana',
                'google_query': 'Arima Onsen Taiko-no-yu',
                'budget_jpy': 8000,
                'notes': 'Hydrate with locally bottled carbonated Arima water.',
            },
            {
                'name': 'Kobe Harborland night stroll',
                'time': '19:00-20:30',
                'category': 'Night Stroll',
                'region': 'Kobe',
                'description': 'Capture mosaic lights, ride the Ferris wheel if energy allows, and share harbourfront desserts.',
                'logistics': 'JR to Kobe Station; 5-minute walk. Check Luminarie schedule for possible early displays.',
                'booking': 'None.',
                'companions': 'You + Nana',
                'google_query': 'Kobe Harborland',
                'budget_jpy': 2000,
                'notes': 'Try Godiva hot chocolate for warm hands.',
            },
        ],
    },
    {
        'date': '2025-11-27',
        'weekday': 'Thursday',
        'title': 'Super Nintendo World power-up',
        'nanako_work': False,
        'lodging': 'Hotel Agora Osaka Moriguchi',
        'summary': 'Full USJ adventure with Express passes, character dining, and merch runs ahead of birthday eve.',
        'entries': [
            {
                'name': 'Universal Studios Japan flagship day',
                'time': '08:00-21:00',
                'category': 'Theme Park',
                'region': 'Osaka',
                'description': 'Hit Super Nintendo World at rope drop, chase Jujutsu Kaisen XR ride, and close with Night Parade.',
                'logistics': 'JR Yumesaki Line to Universal City. Enter park 07:30 with early-entry Express Pass 7.',
                'booking': 'Purchase USJ tickets + Express Pass (type 7) three months out; reserve Kinopio’s Café lunch.',
                'companions': 'You + Nana',
                'google_query': 'Universal Studios Japan',
                'budget_jpy': 52000,
                'notes': 'Bring power bank & wearable wristband for Power-Up Band challenges.',
            },
        ],
    },
    {
        'date': '2025-11-28',
        'weekday': 'Friday',
        'title': 'Osaka birthday supernova',
        'nanako_work': True,
        'lodging': 'W Osaka',
        'summary': 'Nana works by day while you prep, then Nicole & Ken arrive for a neon dinner, karaoke blowout, and craft cocktails.',
        'entries': [
            {
                'name': 'W Osaka check-in & suite styling',
                'time': '14:00-15:00',
                'category': 'Lodging',
                'region': 'Osaka',
                'description': 'Secure a Marvelous Suite for party-ready lighting, stash decorations, and arrange welcome amenities.',
                'logistics': 'Check-in early via Marriott Bonvoy elite chat; request high-floor city view and extra vanity mirrors.',
                'booking': 'Stay Nov 28-30; add birthday amenity + late checkout on 30 Nov.',
                'companions': 'You (setup) + Nana after work + Nicole & Ken (guest access)',
                'google_query': 'W Osaka',
                'budget_jpy': 95000,
                'notes': 'Set up Polaroid guest book & confetti balloons before guests arrive.',
            },
            {
                'name': 'MYDO Teppanyaki birthday dinner',
                'time': '18:30-20:30',
                'category': 'Food',
                'region': 'Osaka',
                'description': 'Table-side wagyu, flambéed seafood, and custom dessert with dual birthday shout-outs for you and Ken.',
                'logistics': 'Located inside W Osaka. Request private teppan counter with six seats.',
                'booking': 'Pre-order cake + champagne tower; confirm shellfish allergies.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'MYDO Teppanyaki',
                'budget_jpy': 60000,
                'notes': 'Play curated playlist through restaurant’s sound system (share via Spotify link).',
            },
            {
                'name': 'Karaoke Kan Shinsaibashi takeover',
                'time': '21:00-23:30',
                'category': 'Nightlife',
                'region': 'Osaka',
                'description': 'Private neon room with unlimited drinks, photobooth props, and birthday slideshow during choruses.',
                'logistics': 'Reserve VIP room; bring HDMI cable for slideshow. Order sparkling sake tower.',
                'booking': 'Book 3-hour premium plan with open bar via Jalan Net.',
                'companions': 'You + Nana + Nicole + Ken + Osaka friends (optional)',
                'google_query': 'Karaoke Kan Shinsaibashi 2-chome',
                'budget_jpy': 24000,
                'notes': 'Surprise Ken with co-birthday montage at 22:00.',
            },
            {
                'name': 'Bar Nayuta sky cocktails',
                'time': '23:45-01:00',
                'category': 'Nightlife',
                'region': 'Osaka',
                'description': 'Wind down with rooftop mixology featuring yuzu gin fizzes and dessert cocktails overlooking Osaka Castle lights.',
                'logistics': '5-minute taxi from karaoke. Dress smart-casual; limited seating at counter.',
                'booking': 'Reserve 23:45 slot; request custom drink named “Japlan Nova”.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Bar Nayuta',
                'budget_jpy': 16000,
                'notes': 'Bring small thank-you gifts for bartenders (Aussie chocolate).',
            },
        ],
    },
    {
        'date': '2025-11-29',
        'weekday': 'Saturday',
        'title': 'Kyoto foliage finale with friends',
        'nanako_work': False,
        'lodging': 'W Osaka',
        'summary': 'Day trip with Nicole & Ken for Kyoto’s peak foliage, tofu feast, and illuminated temple stroll.',
        'entries': [
            {
                'name': 'Eikan-dō Zenrin-ji morning glow',
                'time': '09:30-11:00',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Marvel at fiery maple reflections in the Hojo Pond and climb the Tahoto pagoda for sweeping views.',
                'logistics': 'Keihan from Yodoyabashi to Jingū-Marutamachi then taxi (15 min). Entry ¥1,000; illumination tickets separate.',
                'booking': 'Buy advance tickets online to skip queue; bring printed QR codes.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Eikan-do Zenrin-ji',
                'budget_jpy': 4000,
                'notes': 'Shoot birthday-week group photo on the Hojo Bridge.',
            },
            {
                'name': 'Philosopher’s Path stroll',
                'time': '11:00-12:00',
                'category': 'Nature',
                'region': 'Kyoto',
                'description': 'Leisurely walk along the canal beneath amber leaves, stopping for craft boutiques and gelato.',
                'logistics': 'Start near Eikan-dō and head north; peek into artisanal shops like Ginkaku-ji Seseragi.',
                'booking': 'None.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Philosopher’s Path',
                'budget_jpy': 2000,
                'notes': 'Grab seasonal gelato at Sfera Bar Satén en route.',
            },
            {
                'name': 'Okutan Nanzenji yudofu lunch',
                'time': '12:30-13:45',
                'category': 'Food',
                'region': 'Kyoto',
                'description': 'Traditional tofu kaiseki in a tatami room overlooking a moss garden—warming and serene.',
                'logistics': 'Reserve tatami room; lunch course ¥3,800 pp. Remove shoes at entry.',
                'booking': 'Call ahead; mention vegetarian-friendly preferences.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Okutan Nanzenji',
                'budget_jpy': 16000,
                'notes': 'Pre-order sansho pepper tofu for take-home treat.',
            },
            {
                'name': 'Tōfuku-ji autumn canopies',
                'time': '14:30-16:00',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Stroll across Tsutenkyo Bridge for jaw-dropping maple valley views and temple gardens.',
                'logistics': 'Keihan to Tofukuji Station; timed entry queue moves quickly (~20 min).',
                'booking': 'Purchase timed tickets online if available; otherwise buy on arrival (¥1,000).',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Tofuku-ji Temple',
                'budget_jpy': 4000,
                'notes': 'Visit Kaisando for quieter contemplation.',
            },
            {
                'name': 'Kōdai-ji night illumination',
                'time': '18:00-19:30',
                'category': 'Culture',
                'region': 'Kyoto',
                'description': 'Nighttime light-up across Zen gardens and bamboo grove, culminating in mirror pond projections.',
                'logistics': 'Taxi from Tofuku-ji (15 min). Evening entry ¥1,000; ends 21:30.',
                'booking': 'Buy combo ticket with Entoku-in for extra installations.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Kodaiji Temple',
                'budget_jpy': 4000,
                'notes': 'Return to Osaka via Keihan Gion-Shijo after illumination.',
            },
        ],
    },
    {
        'date': '2025-11-30',
        'weekday': 'Sunday',
        'title': 'Chill finale & departure',
        'nanako_work': False,
        'lodging': 'W Osaka (checkout)',
        'summary': 'Slow brunch, last-minute outlet splurge, soak in final skyline before evening flight home.',
        'entries': [
            {
                'name': 'Takamura Wine & Coffee Roasters brunch',
                'time': '10:00-11:30',
                'category': 'Food',
                'region': 'Osaka',
                'description': 'Celebrate the journey with artisanal coffee cupping and light brunch in a lofted roastery.',
                'logistics': 'Taxi from W Osaka (10 min). Reserve tasting flight with seasonal beans.',
                'booking': 'Book cupping session for two; pick up beans for home brewing.',
                'companions': 'You + Nana + Nicole + Ken',
                'google_query': 'Takamura Wine & Coffee Roasters',
                'budget_jpy': 8000,
                'notes': 'Purchase natural wine for holiday gifting (ship via EMS).',
            },
            {
                'name': 'Rinku Premium Outlets spree',
                'time': '13:00-16:00',
                'category': 'Shopping',
                'region': 'Izumisano',
                'description': 'Outlet hop for last-minute gifts—Onitsuka Tiger, Coach, Nintendo Tokyo satellite—and sunset pier views.',
                'logistics': 'JR rapid or Nankai to Rinku-Town (40 min). Use hands-free delivery counter for extra bags.',
                'booking': 'Download coupon QR via official site for extra 10% savings.',
                'companions': 'You + Nana',
                'google_query': 'Rinku Premium Outlets',
                'budget_jpy': 30000,
                'notes': 'Ride Rinku OOTD Ferris wheel if time allows.',
            },
            {
                'name': 'Kansai International Airport departure',
                'time': '18:00-23:00',
                'category': 'Departure',
                'region': 'Osaka',
                'description': 'Check in early, enjoy KIX Lounge showers, and savour final takoyaki before overnight flight home.',
                'logistics': 'Hotel limo or Nankai Rapi:t to KIX (~45 min). Arrive 3 hours pre-flight for tax-free refund pickup.',
                'booking': 'Confirm airline upgrade waitlist; pre-book KIX lounge seats via Priority Pass.',
                'companions': 'You + Nana',
                'google_query': 'Kansai International Airport',
                'budget_jpy': 0,
                'notes': 'Hand-carry matcha and sake; ensure liquids follow allowance.',
            },
        ],
    },
]
PLACE_QUERIES: Dict[str, str] = {
    'Kansai International Airport': 'Kansai International Airport Terminal 1',
    'Hotel Agora Osaka Moriguchi': 'Hotel Agora Osaka Moriguchi',
    'Dotonbori': 'Dotonbori Osaka',
    'Tombori River Cruise': 'Tombori River Cruise Osaka',
    'Mizuno': 'Mizuno Okonomiyaki Osaka',
    'Hozenji Yokocho': 'Hozenji Yokocho Osaka',
    'Brooklyn Roasting Company Kitahama': 'Brooklyn Roasting Company Kitahama',
    'Shinsaibashi-suji Shopping Street': 'Shinsaibashi-suji Shopping Street',
    'Kuromon Ichiba Market': 'Kuromon Ichiba Market',
    'Namba Yasaka Shrine': 'Namba Yasaka Shrine',
    'teamLab Botanical Garden Osaka': 'teamLab Botanical Garden Osaka',
    'Arashiyama Bamboo Grove': 'Arashiyama Bamboo Grove',
    'Tenryu-ji Temple': 'Tenryu-ji Temple Kyoto',
    'Arashiyama Yoshimura': 'Arashiyama Yoshimura Kyoto',
    'Kimono Forest': 'Kimono Forest Kyoto',
    'Fushimi Inari Taisha': 'Fushimi Inari Taisha',
    'Gekkeikan Okura Sake Museum': 'Gekkeikan Okura Sake Museum',
    'Todai-ji': 'Todai-ji Temple',
    'Nara Park': 'Nara Park',
    'Nakatanidou': 'Nakatanidou Mochi',
    'Byodoin': 'Byodoin Temple',
    'Tsuen Tea': 'Tsuen Tea Uji',
    'Hirakata T-SITE': 'Hirakata T-SITE',
    'Café & Meal MUJI Hirakata T-SITE': 'Cafe & Meal MUJI Hirakata T-SITE',
    'Gokurakuyu Hirakata': 'Gokurakuyu Hirakata',
    'Kushikatsu Tanaka Hirakata': 'Kushikatsu Tanaka Hirakata',
    'Kinkaku-ji': 'Kinkaku-ji Temple',
    'Ryoan-ji Temple': 'Ryoan-ji Temple',
    'Camellia GARDEN': 'Camellia Garden Tea Ceremony Kyoto',
    'Honke Owariya Main Branch': 'Honke Owariya Main Branch Kyoto',
    'Kyomachiya Ryokan Sakura Urushitei': 'Kyomachiya Ryokan Sakura Urushitei',
    'Hanamikoji Street': 'Hanamikoji Street Kyoto',
    'Kiyomizu-dera': 'Kiyomizu-dera Temple',
    'Sannenzaka': 'Sannenzaka Kyoto',
    'Kyoto Yakiniku Hiro Shijo Kiyamachi': 'Kyoto Yakiniku Hiro Shijo Kiyamachi',
    'Kyoto Station': 'Kyoto Station',
    'OMO7 Osaka by Hoshino Resorts': 'OMO7 Osaka by Hoshino Resorts',
    'Umeda Sky Building': 'Umeda Sky Building',
    'Hirakata Park': 'Hirakata Park',
    'Torisei Hirakata': 'Torisei Hirakata',
    'Kuzuha Mall': 'Kuzuha Mall',
    'sequence MIYASHITA PARK': 'sequence MIYASHITA PARK hotel',
    'Afuri Harajuku': 'Afuri Harajuku',
    'Takeshita Street': 'Takeshita Street',
    'SHIBUYA SKY': 'Shibuya Sky',
    'Gonpachi Shibuya': 'Gonpachi Shibuya',
    'teamLab Planets TOKYO': 'teamLab Planets TOKYO',
    'Pokémon Café Nihonbashi': 'Pokemon Cafe Nihonbashi',
    'MIMARU Tokyo Shinjuku West': 'MIMARU Tokyo Shinjuku WEST',
    'Karaoke Kan Shibuya': 'Karaoke Kan Shibuya',
    'Tokyo DisneySea': 'Tokyo DisneySea',
    'Disney Ambassador Hotel': 'Disney Ambassador Hotel',
    'Tokyo Station': 'Tokyo Station',
    'Osaka Museum of Housing and Living': 'Osaka Museum of Housing and Living',
    'Torame Yokocho': 'Torame Yokocho Osaka',
    'Kobe Nunobiki Herb Gardens': 'Kobe Nunobiki Herb Gardens & Ropeway',
    'Steakland Kobe': 'Steakland Kobe',
    'Arima Onsen Taiko-no-yu': 'Arima Onsen Taiko no Yu',
    'Kobe Harborland': 'Kobe Harborland',
    'Universal Studios Japan': 'Universal Studios Japan',
    'W Osaka': 'W Osaka',
    'MYDO Teppanyaki': 'Mydo Teppanyaki W Osaka',
    'Karaoke Kan Shinsaibashi 2-chome': 'Karaoke Kan Shinsaibashi',
    'Bar Nayuta': 'Bar Nayuta Osaka',
    'Eikan-do Zenrin-ji': 'Eikando Temple Kyoto',
    'Philosopher’s Path': "Philosopher's Path Kyoto",
    'Okutan Nanzenji': 'Okutan Nanzenji',
    'Tofuku-ji Temple': 'Tofuku-ji Temple',
    'Kodaiji Temple': 'Kodaiji Temple',
    'Takamura Wine & Coffee Roasters': 'Takamura Wine and Coffee Roasters',
    'Rinku Premium Outlets': 'Rinku Premium Outlets',
}

JPY_PER_AUD = 105
PACKING_ITEMS: List[Dict[str, Any]] = [
    {
        'name': 'Passports + Visit Japan Web QR',
        'category': 'Travel Essentials',
        'owner': 'Shared',
        'quantity': '2',
        'status': 'To Pack',
        'notes': 'Keep in RFID pouch with Visit Japan Web screenshots for KIX arrival (Day 1).',
        'linked_days': 'Day 1 & Day 17',
    },
    {
        'name': 'Flight e-tickets & insurance docs',
        'category': 'Travel Essentials',
        'owner': 'You',
        'quantity': 'Digital + 1 printed set',
        'status': 'To Print',
        'notes': 'Store PDFs in Notion + Apple Wallet; print extra copy for Disney/USJ verification.',
        'linked_days': 'All travel days',
    },
    {
        'name': 'Multi-currency wallet (¥ cash + IC cards)',
        'category': 'Money & Access',
        'owner': 'Shared',
        'quantity': '¥120,000 + 2 IC cards',
        'status': 'Prep',
        'notes': 'Preload ICOCA with ¥5,000 each; stash emergency AUD notes.',
        'linked_days': 'Daily transit',
    },
    {
        'name': 'Shinkansen & limited express reservations',
        'category': 'Travel Essentials',
        'owner': 'You',
        'quantity': 'smartEX reservations + QR',
        'status': 'Book',
        'notes': 'Reserve Nozomi (Nov 22 & 24) + return seats for Nicole & Ken (Nov 28).',
        'linked_days': 'Days 9, 11, 15',
    },
    {
        'name': 'JR/Keihan rail pass kit',
        'category': 'Travel Essentials',
        'owner': 'Shared',
        'quantity': '1 Kansai-Thru Pass + 1 Keihan card sleeve',
        'status': 'To Buy',
        'notes': 'Purchase Kansai Thru Pass at KIX; load Hirakata/Osaka itinerary inside.',
        'linked_days': 'Days 1-8, 12-17',
    },
    {
        'name': 'Layering wardrobe (Heattech sets)',
        'category': 'Clothing',
        'owner': 'Shared',
        'quantity': '4 base sets each',
        'status': 'Pack',
        'notes': 'Mix neutrals for Osaka city looks + Kyoto temple modesty.',
        'linked_days': 'All outdoor days',
    },
    {
        'name': 'Outerwear duo (wool coat + packable down)',
        'category': 'Clothing',
        'owner': 'You',
        'quantity': '2 jackets',
        'status': 'Pack',
        'notes': 'Down jacket compresses for Tokyo Disney nights; wool coat for birthday dinner.',
        'linked_days': 'Days 9-16',
    },
    {
        'name': 'Footwear rotation',
        'category': 'Clothing',
        'owner': 'Shared',
        'quantity': 'Waterproof sneakers + dress boots + indoor slippers',
        'status': 'Pack',
        'notes': 'Break-in sneakers beforehand; pack foldable slippers for ryokan + Airbnb.',
        'linked_days': 'Kyoto stay, Tokyo Airbnb, W Osaka',
    },
    {
        'name': 'Onsen & sentō kit',
        'category': 'Wellness',
        'owner': 'Shared',
        'quantity': 'Mesh bag with towels, toiletries, tattoo covers',
        'status': 'Pack',
        'notes': 'Include modest swimwear for spa zones + waterproof phone pouch.',
        'linked_days': 'Days 5, 8, 13',
    },
    {
        'name': 'Sleepwear & loungewear',
        'category': 'Clothing',
        'owner': 'Shared',
        'quantity': 'Lightweight set + cosy set each',
        'status': 'Pack',
        'notes': 'Mix-match for ryokan tatami nights and Tokyo sleepover aesthetic.',
        'linked_days': 'Days 6, 10, 11',
    },
    {
        'name': 'Birthday outfits & accessories',
        'category': 'Style',
        'owner': 'Shared',
        'quantity': 'Neon glam look + backup smart casual',
        'status': 'Prep',
        'notes': 'Coordinate colour palette with Nicole & Ken; pack LED hair clips.',
        'linked_days': 'Day 15',
    },
    {
        'name': 'Camera & content kit',
        'category': 'Tech',
        'owner': 'You',
        'quantity': 'Mirrorless body, 24mm + 50mm primes, DJI Pocket, mini tripod',
        'status': 'Charge',
        'notes': 'Pack extra SD cards + ND filter for teamLab and Shibuya Sky.',
        'linked_days': 'Days 2-16',
    },
    {
        'name': 'Power & charging hub',
        'category': 'Tech',
        'owner': 'Shared',
        'quantity': '2 multi-USB bricks, 4 Type-A cables, 2 USB-C cables, 1 power board',
        'status': 'Pack',
        'notes': 'Add spare adapter for Nicole & Ken during Osaka stay.',
        'linked_days': 'All days',
    },
    {
        'name': 'Connectivity pack',
        'category': 'Tech',
        'owner': 'You',
        'quantity': 'eSIM QR + pocket Wi-Fi + SIM ejector',
        'status': 'Activate',
        'notes': 'Activate Ubigi eSIM 24h before departure; charge pocket Wi-Fi nightly.',
        'linked_days': 'Days 1-17',
    },
    {
        'name': 'Nintendo Switch party set',
        'category': 'Entertainment',
        'owner': 'You',
        'quantity': 'Switch OLED + Joy-Cons + Just Dance + Mario Kart',
        'status': 'Pack',
        'notes': 'Preload party playlist + update software before Nov 22 sleepover.',
        'linked_days': 'Day 10',
    },
    {
        'name': 'Wellness & med pouch',
        'category': 'Health',
        'owner': 'Shared',
        'quantity': 'Travel meds, motion sickness bands, pain relief patches',
        'status': 'Restock',
        'notes': 'Include allergy meds for autumn pollen; keep duplicates in day bag.',
        'linked_days': 'All',
    },
    {
        'name': 'Skincare + sheet mask caddy',
        'category': 'Health',
        'owner': 'Nana',
        'quantity': 'Routine minis + hydrating masks',
        'status': 'Pack',
        'notes': 'Share brightening masks with Nicole & Ken during Tokyo sleepover.',
        'linked_days': 'Days 10-15',
    },
    {
        'name': 'Hair & styling toolkit',
        'category': 'Style',
        'owner': 'Shared',
        'quantity': 'Dual-voltage straightener, curl wand, styling clips',
        'status': 'Pack',
        'notes': 'Essential for birthday glam + Harajuku looks.',
        'linked_days': 'Days 9 & 15',
    },
    {
        'name': 'Aussie gift stash',
        'category': 'Gifts',
        'owner': 'You',
        'quantity': 'Tim Tams, Indigenous art tea towels, mini boomerangs',
        'status': 'Pack',
        'notes': 'Wrap individually for friends + Nana’s coworkers; include handwritten notes.',
        'linked_days': 'Days 9, 15',
    },
    {
        'name': 'Tea & sake carrier tube',
        'category': 'Shopping Support',
        'owner': 'Shared',
        'quantity': 'Protective tube for bottles & tea canisters',
        'status': 'Pack',
        'notes': 'Use for Uji purchases + Gekkeikan tasting souvenirs.',
        'linked_days': 'Days 4, 5, 16',
    },
    {
        'name': 'Birthday décor & confetti kit',
        'category': 'Celebration',
        'owner': 'You',
        'quantity': 'LED candles, tassel garland, sparkler candles',
        'status': 'Pack',
        'notes': 'Pack in hard case; set up at W Osaka before dinner.',
        'linked_days': 'Day 15',
    },
    {
        'name': 'Travel journal & Instax mini',
        'category': 'Memories',
        'owner': 'Shared',
        'quantity': 'Dot-grid notebook + Instax camera + 40 films',
        'status': 'Pack',
        'notes': 'Collect stamps and Polaroids for Notion scrapbook import.',
        'linked_days': 'Daily reflection',
    },
    {
        'name': 'Reusable shopping bags & compression cubes',
        'category': 'Logistics',
        'owner': 'Shared',
        'quantity': '3 foldable totes + 4 packing cubes + vacuum bag',
        'status': 'Pack',
        'notes': 'Needed for Tokyo shopping haul + Kyoto leaf souvenirs.',
        'linked_days': 'Days 9, 16, 17',
    },
    {
        'name': 'Laundry + steamer pouch',
        'category': 'Logistics',
        'owner': 'Shared',
        'quantity': 'Travel steamer, detergent sheets, collapsible hamper',
        'status': 'Pack',
        'notes': 'Use in Kyoto machiya & Tokyo apartment for mid-trip refresh.',
        'linked_days': 'Days 6, 10',
    },
    {
        'name': 'Emergency snack pack',
        'category': 'Food',
        'owner': 'You',
        'quantity': 'Protein bars, Berocca, electrolytes',
        'status': 'Pack',
        'notes': 'Great for long park days (USJ, Disney) and early train mornings.',
        'linked_days': 'Days 11, 14',
    },
]
EXPENSE_ITEMS: List[Dict[str, Any]] = [
    {
        'name': 'Return flights (AUS → KIX)',
        'category': 'Transport',
        'date': '2025-11-14',
        'city': 'International',
        'type': 'Flight',
        'estimated_cost_jpy': 240000,
        'payment_method': 'Credit Card (Qantas FF)',
        'status': 'Booked',
        'notes': 'Redeemed partial points; cash component to be settled in Oct 2025.',
        'linked_days': 'Days 1 & 17',
    },
    {
        'name': 'Hotel Agora Osaka Moriguchi (8 nights)',
        'category': 'Lodging',
        'date': '2025-11-14',
        'city': 'Osaka',
        'type': 'Hotel',
        'estimated_cost_jpy': 192000,
        'payment_method': 'Credit Card',
        'status': 'Reserve in Aug',
        'notes': 'Bundle breakfast on work days; flexible cancellation until Nov 1.',
        'linked_days': 'Days 1-5, 8, 12-14',
    },
    {
        'name': 'Kyomachiya Ryokan Sakura Urushitei',
        'category': 'Lodging',
        'date': '2025-11-19',
        'city': 'Kyoto',
        'type': 'Ryokan',
        'estimated_cost_jpy': 40000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': 'Includes kaiseki dinner + breakfast.',
        'linked_days': 'Day 6',
    },
    {
        'name': 'OMO7 Osaka by Hoshino Resorts',
        'category': 'Lodging',
        'date': '2025-11-20',
        'city': 'Osaka',
        'type': 'Hotel',
        'estimated_cost_jpy': 32000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': 'Add onsen access + late checkout request.',
        'linked_days': 'Day 7',
    },
    {
        'name': 'sequence MIYASHITA PARK',
        'category': 'Lodging',
        'date': '2025-11-22',
        'city': 'Tokyo',
        'type': 'Hotel',
        'estimated_cost_jpy': 26000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': 'Ask for park-view room; deposit refundable until Nov 15.',
        'linked_days': 'Day 9',
    },
    {
        'name': 'MIMARU Tokyo Shinjuku WEST',
        'category': 'Lodging',
        'date': '2025-11-23',
        'city': 'Tokyo',
        'type': 'Apartment Hotel',
        'estimated_cost_jpy': 36000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': 'Sleepover suite for 4 with breakfast hamper.',
        'linked_days': 'Day 10',
    },
    {
        'name': 'W Osaka (Marvelous Suite, 2 nights)',
        'category': 'Lodging',
        'date': '2025-11-28',
        'city': 'Osaka',
        'type': 'Hotel',
        'estimated_cost_jpy': 190000,
        'payment_method': 'Bonvoy Points + Cash',
        'status': 'To Book',
        'notes': 'Use Suite Night Awards; request late checkout Nov 30.',
        'linked_days': 'Days 15-17',
    },
    {
        'name': 'Haruka Express + ICOCA bundle (2 pax)',
        'category': 'Transport',
        'date': '2025-11-14',
        'city': 'Osaka',
        'type': 'Rail',
        'estimated_cost_jpy': 10400,
        'payment_method': 'Cash',
        'status': 'To Buy',
        'notes': 'Purchase at KIX JR desk on arrival.',
        'linked_days': 'Day 1',
    },
    {
        'name': 'Kansai Thru Pass (3-day) + Keihan upgrades',
        'category': 'Transport',
        'date': '2025-11-15',
        'city': 'Osaka/Kyoto',
        'type': 'Rail',
        'estimated_cost_jpy': 10000,
        'payment_method': 'Cash',
        'status': 'To Buy',
        'notes': 'Covers Kyoto/Nara/Kobe days; add limited express seats as needed.',
        'linked_days': 'Days 3-4, 6, 13, 16',
    },
    {
        'name': 'Nozomi Shinkansen (Osaka↔Tokyo, 2 round trips)',
        'category': 'Transport',
        'date': '2025-11-22',
        'city': 'Tokyo',
        'type': 'Rail',
        'estimated_cost_jpy': 56000,
        'payment_method': 'smartEX',
        'status': 'To Book',
        'notes': 'Outbound Nov 22, return Nov 24; Nicole & Ken return leg Nov 28.',
        'linked_days': 'Days 9, 11, 15',
    },
    {
        'name': 'Urban transport top-ups (Tokyo/Osaka)',
        'category': 'Transport',
        'date': '2025-11-22',
        'city': 'Tokyo/Osaka',
        'type': 'Transit',
        'estimated_cost_jpy': 12000,
        'payment_method': 'IC Card',
        'status': 'Budget',
        'notes': 'Daily subway spend across Shibuya, Harajuku, Osaka loops.',
        'linked_days': 'All city days',
    },
    {
        'name': 'Taxi & rideshare buffer',
        'category': 'Transport',
        'date': '2025-11-19',
        'city': 'Kyoto/Osaka/Tokyo',
        'type': 'Transport',
        'estimated_cost_jpy': 15000,
        'payment_method': 'Cash',
        'status': 'Budget',
        'notes': 'Kyoto tea ceremony transfers, late-night Osaka rides.',
        'linked_days': 'Days 6, 7, 15',
    },
    {
        'name': 'teamLab Botanical Garden Osaka tickets',
        'category': 'Experiences',
        'date': '2025-11-15',
        'city': 'Osaka',
        'type': 'Art Installation',
        'estimated_cost_jpy': 3600,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': '18:00 slot for two.',
        'linked_days': 'Day 2',
    },
    {
        'name': 'Camellia Garden private tea ceremony',
        'category': 'Experiences',
        'date': '2025-11-19',
        'city': 'Kyoto',
        'type': 'Workshop',
        'estimated_cost_jpy': 12000,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': 'Private session for two with English host.',
        'linked_days': 'Day 6',
    },
    {
        'name': 'Tsuen Tea master tasting',
        'category': 'Experiences',
        'date': '2025-11-17',
        'city': 'Uji',
        'type': 'Workshop',
        'estimated_cost_jpy': 5000,
        'payment_method': 'Cash',
        'status': 'To Book',
        'notes': 'Reserve counter seats; includes souvenirs.',
        'linked_days': 'Day 4',
    },
    {
        'name': 'Gekkeikan Sake tasting flight',
        'category': 'Experiences',
        'date': '2025-11-16',
        'city': 'Kyoto',
        'type': 'Tasting',
        'estimated_cost_jpy': 2000,
        'payment_method': 'Cash',
        'status': 'To Pay',
        'notes': 'Add museum entry + bottle shipping.',
        'linked_days': 'Day 3',
    },
    {
        'name': 'Tonbori River Cruise',
        'category': 'Experiences',
        'date': '2025-11-14',
        'city': 'Osaka',
        'type': 'Tour',
        'estimated_cost_jpy': 2400,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': 'Reserve sunset sailing with QR voucher.',
        'linked_days': 'Day 1',
    },
    {
        'name': 'Umeda Sky Building Observatory',
        'category': 'Experiences',
        'date': '2025-11-20',
        'city': 'Osaka',
        'type': 'Viewpoint',
        'estimated_cost_jpy': 6000,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': 'Includes cocktails at Sky 40 bar.',
        'linked_days': 'Day 7',
    },
    {
        'name': 'Hirakata Park twilight tickets',
        'category': 'Experiences',
        'date': '2025-11-21',
        'city': 'Hirakata',
        'type': 'Theme Park',
        'estimated_cost_jpy': 3000,
        'payment_method': 'Cash',
        'status': 'Budget',
        'notes': 'Purchase at gate with twilight discount.',
        'linked_days': 'Day 8',
    },
    {
        'name': 'teamLab Planets TOKYO tickets',
        'category': 'Experiences',
        'date': '2025-11-23',
        'city': 'Tokyo',
        'type': 'Art Installation',
        'estimated_cost_jpy': 15200,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': '09:00 slot for four.',
        'linked_days': 'Day 10',
    },
    {
        'name': 'Pokémon Café prepayment',
        'category': 'Experiences',
        'date': '2025-11-23',
        'city': 'Tokyo',
        'type': 'Character Dining',
        'estimated_cost_jpy': 12000,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': 'Reservation deposit for four + souvenir mugs.',
        'linked_days': 'Day 10',
    },
    {
        'name': 'Shibuya Sky tickets',
        'category': 'Experiences',
        'date': '2025-11-22',
        'city': 'Tokyo',
        'type': 'Viewpoint',
        'estimated_cost_jpy': 11000,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': '17:00 sunset slot for 5 (including James).',
        'linked_days': 'Day 9',
    },
    {
        'name': 'Tokyo DisneySea + Premier Access',
        'category': 'Experiences',
        'date': '2025-11-24',
        'city': 'Tokyo',
        'type': 'Theme Park',
        'estimated_cost_jpy': 60000,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': 'Two passports + Premier Access for Soaring & Journey + Toy Story Mania.',
        'linked_days': 'Day 11',
    },
    {
        'name': 'Disney Ambassador Hyperion Lounge tea',
        'category': 'Food & Drink',
        'date': '2025-11-24',
        'city': 'Tokyo',
        'type': 'Tea Service',
        'estimated_cost_jpy': 16000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': 'Afternoon tea for four with birthday plating.',
        'linked_days': 'Day 11',
    },
    {
        'name': 'Universal Studios Japan tickets + Express 7',
        'category': 'Experiences',
        'date': '2025-11-27',
        'city': 'Osaka',
        'type': 'Theme Park',
        'estimated_cost_jpy': 104000,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': 'Pair with Super Nintendo timed entry + Kinopio’s Café lunch.',
        'linked_days': 'Day 14',
    },
    {
        'name': 'Arima Onsen Taiko-no-yu passes',
        'category': 'Experiences',
        'date': '2025-11-26',
        'city': 'Kobe',
        'type': 'Wellness',
        'estimated_cost_jpy': 8000,
        'payment_method': 'Cash',
        'status': 'To Pay',
        'notes': 'Includes private tatami lounge upgrade.',
        'linked_days': 'Day 13',
    },
    {
        'name': 'Karaoke Kan Shibuya session',
        'category': 'Nightlife',
        'date': '2025-11-23',
        'city': 'Tokyo',
        'type': 'Entertainment',
        'estimated_cost_jpy': 18000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': '3-hour all-you-can-drink plan for four.',
        'linked_days': 'Day 10',
    },
    {
        'name': 'Karaoke Kan Shinsaibashi VIP',
        'category': 'Nightlife',
        'date': '2025-11-28',
        'city': 'Osaka',
        'type': 'Entertainment',
        'estimated_cost_jpy': 24000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': '3-hour premium room with open bar + props.',
        'linked_days': 'Day 15',
    },
    {
        'name': 'MYDO Teppanyaki birthday dinner',
        'category': 'Food & Drink',
        'date': '2025-11-28',
        'city': 'Osaka',
        'type': 'Fine Dining',
        'estimated_cost_jpy': 60000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': 'Set menu for four + dessert sparkler.',
        'linked_days': 'Day 15',
    },
    {
        'name': 'Bar Nayuta celebration cocktails',
        'category': 'Nightlife',
        'date': '2025-11-28',
        'city': 'Osaka',
        'type': 'Cocktail Bar',
        'estimated_cost_jpy': 16000,
        'payment_method': 'Credit Card',
        'status': 'Budget',
        'notes': 'Custom drink “Japlan Nova” + round of yuzu fizzes.',
        'linked_days': 'Day 15',
    },
    {
        'name': 'Eikan-dō & Kōdai-ji illumination tickets',
        'category': 'Experiences',
        'date': '2025-11-29',
        'city': 'Kyoto',
        'type': 'Night Illumination',
        'estimated_cost_jpy': 8000,
        'payment_method': 'Online',
        'status': 'To Book',
        'notes': 'Includes combo ticket for Entoku-in.',
        'linked_days': 'Day 16',
    },
    {
        'name': 'Foodie highlights fund (markets & street eats)',
        'category': 'Food & Drink',
        'date': '2025-11-15',
        'city': 'Osaka/Kyoto/Tokyo',
        'type': 'Daily Meals',
        'estimated_cost_jpy': 60000,
        'payment_method': 'Cash/IC',
        'status': 'Budget',
        'notes': 'Kuromon, Nishiki, Tsukiji outer market, Harajuku snacks.',
        'linked_days': 'Days 2-16',
    },
    {
        'name': 'Gifts & birthday décor budget',
        'category': 'Shopping',
        'date': '2025-11-10',
        'city': 'Pre-trip',
        'type': 'Supplies',
        'estimated_cost_jpy': 45000,
        'payment_method': 'Credit Card',
        'status': 'In Progress',
        'notes': 'Aussie gifts, confetti kit, custom cake topper, Polaroid film.',
        'linked_days': 'Days 9, 15',
    },
    {
        'name': 'Travel insurance (Comprehensive duo)',
        'category': 'Admin',
        'date': '2025-10-15',
        'city': 'Pre-trip',
        'type': 'Insurance',
        'estimated_cost_jpy': 28000,
        'payment_method': 'Credit Card',
        'status': 'Booked',
        'notes': 'Covers winter sports/onsen, electronics, cancellations.',
        'linked_days': 'Trip coverage',
    },
    {
        'name': 'Connectivity (eSIM + pocket Wi-Fi rental)',
        'category': 'Tech',
        'date': '2025-11-12',
        'city': 'Pre-trip',
        'type': 'Data',
        'estimated_cost_jpy': 8000,
        'payment_method': 'Credit Card',
        'status': 'To Book',
        'notes': 'Ubigi 30-day eSIM + Ninja Wi-Fi rental for backup.',
        'linked_days': 'All days',
    },
]

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


def format_currency_aud(value: float) -> str:
    return f"A${value:,.2f}"


def build_itinerary_markdown(day: Dict[str, Any], entry: Dict[str, Any], place: Dict[str, Any], entry_id: str) -> str:
    rating = place.get('rating')
    reviews = place.get('user_ratings_total')
    address = place.get('formatted_address', '—')
    phone = place.get('international_phone_number', '—')
    website = place.get('website', '—')
    maps_url = place.get('url', '—')
    loc = place.get('geometry', {}).get('location', {})
    coords = f"{loc.get('lat')}, {loc.get('lng')}" if loc else '—'
    budget = entry.get('budget_jpy', 0)
    markdown = (
        f"# {entry['name']} — {day['date']} ({day['weekday']})\n\n"
        f"**Day theme:** {day['title']}\n\n"
        f"**Time block:** {entry['time']}\n\n"
        f"**Region:** {entry['region']} — **Category:** {entry['category']}\n\n"
        f"**Companions:** {entry['companions']}\n\n"
        f"**Nanako work day?** {'Yes' if day['nanako_work'] else 'No'}\n\n"
        "## Why it’s magical\n"
        f"{entry['description']}\n\n"
        "## Logistics\n"
        f"{entry['logistics']}\n\n"
        "## Booking & budget\n"
        f"- Booking: {entry['booking']}\n"
        f"- Estimated spend: {format_currency_jpy(budget)} (≈ {format_currency_aud(budget / JPY_PER_AUD)})\n\n"
        "## Google intel\n"
        f"- Address: {address}\n"
        f"- Rating: {rating or '—'} ({reviews or 0} reviews)\n"
        f"- Maps: [{maps_url}]({maps_url})\n"
        f"- Phone: {phone}\n"
        f"- Website: {website}\n"
        f"- Coordinates: {coords}\n\n"
        "## Notes & prep\n"
        f"{entry.get('notes', '—')}\n"
    )
    return markdown



def write_itinerary(place_details: Dict[str, Dict[str, Any]]) -> None:
    ensure_clean_directory(TRAVEL_DIR)
    headers = [
        'Day #', 'Date', 'Weekday', 'Day Title', 'Name', 'Time', 'Category', 'Region', 'Description',
        'Logistics', 'Booking', 'Companions', 'Nanako Work Day', 'Friends Highlight',
        'Budget (JPY)', 'Budget (AUD)', 'Notes', 'Google Place', 'Google Address', 'Google Rating',
        'Google Reviews', 'Google Maps URL', 'Google Phone', 'Google Website'
    ]
    rows: List[List[str]] = []
    for idx, day in enumerate(ITINERARY_DAYS, start=1):
        for entry in day['entries']:
            place_name = entry['google_query']
            place = place_details[place_name]
            entry_id = ID_GEN.generate(entry['name'] + day['date'])
            folder_name = f"{safe_filename(entry['name'])} {entry_id}"
            folder_path = TRAVEL_DIR / folder_name
            folder_path.mkdir(parents=True, exist_ok=True)
            markdown_path = folder_path / f"{safe_filename(entry['name'])} {entry_id}.md"
            markdown_path.write_text(build_itinerary_markdown(day, entry, place, entry_id), encoding='utf-8')
            budget = int(entry.get('budget_jpy', 0) or 0)
            budget_aud = budget / JPY_PER_AUD
            rows.append([
                str(idx),
                day['date'],
                day['weekday'],
                day['title'],
                entry['name'],
                entry['time'],
                entry['category'],
                entry['region'],
                entry['description'],
                entry['logistics'],
                entry['booking'],
                entry['companions'],
                'Yes' if day['nanako_work'] else 'No',
                entry['companions'],
                format_currency_jpy(budget),
                format_currency_aud(budget_aud),
                entry.get('notes', ''),
                place.get('name', place_name),
                place.get('formatted_address', ''),
                str(place.get('rating', '')),
                str(place.get('user_ratings_total', '')),
                place.get('url', ''),
                place.get('international_phone_number', ''),
                place.get('website', ''),
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


def build_packing_markdown(item: Dict[str, Any], item_id: str) -> str:
    return (
        f"# {item['name']}\n\n"
        f"**Category:** {item['category']}\n\n"
        f"**Owner:** {item['owner']}\n\n"
        f"**Quantity:** {item['quantity']}\n\n"
        f"**Status:** {item['status']}\n\n"
        f"**Linked days:** {item['linked_days']}\n\n"
        "## Notes\n"
        f"{item['notes']}\n"
    )



def write_packing_list() -> None:
    ensure_clean_directory(PACKING_DIR)
    headers = ['Item', 'Category', 'Owner', 'Quantity', 'Status', 'Linked Days', 'Notes']
    rows: List[List[str]] = []
    for item in PACKING_ITEMS:
        item_id = ID_GEN.generate(item['name'])
        folder_name = f"{safe_filename(item['name'])} {item_id}"
        folder = PACKING_DIR / folder_name
        folder.mkdir(parents=True, exist_ok=True)
        md_path = folder / f"{safe_filename(item['name'])} {item_id}.md"
        md_path.write_text(build_packing_markdown(item, item_id), encoding='utf-8')
        rows.append([
            item['name'],
            item['category'],
            item['owner'],
            item['quantity'],
            item['status'],
            item['linked_days'],
            item['notes'],
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


def build_expense_markdown(item: Dict[str, Any], expense_id: str) -> str:
    aud = item['estimated_cost_jpy'] / JPY_PER_AUD
    return (
        f"# {item['name']}\n\n"
        f"**Category:** {item['category']}\n\n"
        f"**City:** {item['city']}\n\n"
        f"**Type:** {item['type']}\n\n"
        f"**Date:** {item['date']}\n\n"
        f"**Estimated cost:** {format_currency_jpy(item['estimated_cost_jpy'])} (≈ {format_currency_aud(aud)})\n\n"
        f"**Payment method:** {item['payment_method']}\n\n"
        f"**Status:** {item['status']}\n\n"
        f"**Linked days:** {item['linked_days']}\n\n"
        "## Notes\n"
        f"{item['notes']}\n"
    )



def write_expenses() -> None:
    ensure_clean_directory(EXPENSE_DIR)
    headers = [
        'Name', 'Category', 'Date', 'City', 'Type', 'Estimated Cost (JPY)', 'Estimated Cost (AUD)',
        'Payment Method', 'Status', 'Linked Days', 'Notes'
    ]
    rows: List[List[str]] = []
    for item in EXPENSE_ITEMS:
        expense_id = ID_GEN.generate(item['name'])
        folder_name = f"{safe_filename(item['name'])} {expense_id}"
        folder = EXPENSE_DIR / folder_name
        folder.mkdir(parents=True, exist_ok=True)
        md_path = folder / f"{safe_filename(item['name'])} {expense_id}.md"
        md_path.write_text(build_expense_markdown(item, expense_id), encoding='utf-8')
        aud_value = item['estimated_cost_jpy'] / JPY_PER_AUD
        rows.append([
            item['name'],
            item['category'],
            item['date'],
            item['city'],
            item['type'],
            format_currency_jpy(item['estimated_cost_jpy']),
            format_currency_aud(aud_value),
            item['payment_method'],
            item['status'],
            item['linked_days'],
            item['notes'],
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
            budget = entry.get('budget_jpy', 0)
            lines.append(
                f"  - {entry['time']} · **{entry['name']}** ({entry['category']}, {entry['region']}) — {entry['description']}"
                f" — Est. {format_currency_jpy(budget)}"
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
        'total_aud': total_jpy / JPY_PER_AUD,
        'category_totals': {k: (v, v / JPY_PER_AUD) for k, v in sorted(category_totals.items(), key=lambda kv: kv[0])},
    }


def build_main_markdown(budget_summary: Dict[str, Any], timeline: str) -> str:
    total_jpy = budget_summary['total_jpy']
    total_aud = budget_summary['total_aud']
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
        friend_callout = ', '.join(sorted({name.strip() for name in day['entries'][0]['companions'].split('+')}))
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
        f"- **Total plan:** {format_currency_jpy(total_jpy)} (≈ {format_currency_aud(total_aud)})",
        '- **Category breakdown:**',
    ])
    for category, (jpy_value, aud_value) in budget_summary['category_totals'].items():
        lines.append(f"  - {category}: {format_currency_jpy(jpy_value)} (≈ {format_currency_aud(aud_value)})")
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
