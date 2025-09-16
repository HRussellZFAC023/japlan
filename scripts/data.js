export const STORAGE_VERSION = 'v2';
export const STORAGE_KEY = 'jp-canvas6-' + STORAGE_VERSION;

export const TRIP_RANGE = {
  start: '2025-11-14',
  end: '2025-11-30',
};

export const FRIENDS = ['Nana', 'Nicole', 'Ken', 'James', 'Phil'];

export const LOCATION_META = {
  osaka: { label: 'Osaka/Hirakata', color: '#2D3A64' },
  kyoto: { label: 'Kyoto/Nara/Kōyasan', color: '#C84E4E' },
  kobe: { label: 'Kobe/Arima/Himeji', color: '#7FAFAE' },
  tokyo: { label: 'Tokyo/Chiba', color: '#EECAD0' },
  work: { label: 'Work/Travel', color: '#9A948C' },
};

export const LOCATION_ORDER = ['osaka', 'kyoto', 'kobe', 'tokyo', 'work'];

export const DEFAULT_THEMES = {
  osaka: 'Osaka base day',
  kyoto: 'Old streets & leaves',
  kobe: 'Onsen & castles',
  tokyo: 'Friends & arcades',
  work: 'Travel / admin',
};

export const MAP_COORDINATES = {
  dotonbori: [34.6687, 135.5013],
  umedaSky: [34.7051, 135.4899],
  abenoHarukas: [34.6464, 135.5134],
  midosujiIllumination: [34.6865, 135.4983],
  kuromonMarket: [34.6667, 135.5071],
  nambaYasaka: [34.6615, 135.4967],
  cupnoodlesIkeda: [34.8181, 135.4267],
  arashiyama: [35.0136, 135.6736],
  kiyomizudera: [34.9948, 135.785],
  fushimiInari: [34.9671, 135.7727],
  uji: [34.8846, 135.8033],
  naraPark: [34.6851, 135.843],
  okunoin: [34.215, 135.5858],
  eikando: [35.0156, 135.7967],
  rurikoin: [35.0866, 135.7869],
  philosophersPath: [35.027, 135.7954],
  sanzenin: [35.1196, 135.8349],
  kuramaDera: [35.1179, 135.7707],
  tojiTemple: [34.9806, 135.7477],
  arimaOnsen: [34.7968, 135.2495],
  harborland: [34.6785, 135.1787],
  himejiCastle: [34.8393, 134.6939],
  kitanoIjinkan: [34.701, 135.1913],
  nunobikiGardens: [34.7151, 135.1923],
  higashiYuenchi: [34.6875, 135.1976],
  disneyResort: [35.6339, 139.8864],
  teamlabPlanets: [35.6496, 139.7916],
  ghibliMuseum: [35.6962, 139.5704],
  shibuyaParco: [35.6605, 139.6983],
  takeshitaStreet: [35.6717, 139.7029],
  sunshine60: [35.7296, 139.7178],
  animateIkebukuro: [35.7317, 139.7153],
  akihabara: [35.6987, 139.7714],
  harajukuVintage: [35.6695, 139.7058],
  roppongiMidtown: [35.6665, 139.7316],
  sensoji: [35.7134, 139.7955],
  kappabashi: [35.7128, 139.7885],
  meguroRiver: [35.6237, 139.7266],
  tsukijiMarket: [35.6654, 139.7705],
  kix: [34.4338, 135.2263],
  hirakatashi: [34.8165, 135.6477],
  usj: [34.6654, 135.4323],
};

export const CATALOG = {
  activity: [
    // Work / travel
    { id: 'act-flight-dxb-arrival', city: 'work', label: '00:40 Arrive DXB (transit)', locked: true },
    { id: 'act-flight-dxb-kix', city: 'work', label: '03:05 DXB → KIX (EK316)', coord: 'kix', locked: true },
    { id: 'act-arrive-kix', city: 'work', label: '17:05 Arrive KIX', coord: 'kix', locked: true },
    { id: 'act-transfer-kix-hirakata', city: 'osaka', label: 'KIX → Hirakata (~90m)', coord: 'hirakatashi' },
    { id: 'act-dinner-nana', city: 'osaka', label: 'Dinner with Nana (Hirakata)', coord: 'hirakatashi' },
    { id: 'act-transfer-hirakata-kix', city: 'work', label: 'Hirakata → KIX', coord: 'kix' },
    { id: 'act-flight-kix-dxb', city: 'work', label: '23:10 KIX → DXB (EK317)', coord: 'kix', locked: true },

    // Osaka / Hirakata
    { id: 'act-dotonbori-walk', city: 'osaka', label: 'Dōtonbori walk + street food', coord: 'dotonbori' },
    { id: 'act-umeda-sky', city: 'osaka', label: 'Umeda Sky Building sunset', coord: 'umedaSky' },
    { id: 'act-abeno-harukas', city: 'osaka', label: 'Abeno HARUKAS 300 view', coord: 'abenoHarukas' },
    { id: 'act-kuromon-market', city: 'osaka', label: 'Kuromon Ichiba morning bites', coord: 'kuromonMarket' },
    { id: 'act-namba-yasaka', city: 'osaka', label: 'Namba Yasaka Shrine photo stop', coord: 'nambaYasaka' },
    { id: 'act-karaoke-namba', city: 'osaka', label: 'Namba karaoke & late izakaya', coord: 'dotonbori' },
    { id: 'guide-donki-night-run', city: 'osaka', label: 'Donki night run (Dōtonbori)', coord: 'dotonbori' },
    { id: 'event-midosuji-lights', city: 'osaka', label: 'Osaka Festival of the Lights — Midosuji', coord: 'midosujiIllumination' },
    { id: 'event-osaka-christmas-market', city: 'osaka', label: 'Osaka German Christmas Market (Umeda)', coord: 'umedaSky' },
    { id: 'act-cupnoodles-ikeda', city: 'osaka', label: 'CupNoodles Museum Ikeda DIY ramen', coord: 'cupnoodlesIkeda' },
    { id: 'act-usj-day', city: 'osaka', label: 'Universal Studios Japan day', coord: 'usj' },

    // Kyoto / Nara / Kōyasan
    { id: 'act-arashiyama', city: 'kyoto', label: 'Arashiyama bamboo grove & river', coord: 'arashiyama' },
    { id: 'act-kiyomizudera', city: 'kyoto', label: 'Kiyomizu-dera & Sannenzaka', coord: 'kiyomizudera' },
    { id: 'act-fushimi-inari', city: 'kyoto', label: 'Fushimi Inari at dusk', coord: 'fushimiInari' },
    { id: 'act-uji-tea', city: 'kyoto', label: 'Uji tea tastings & Byōdō-in stroll', coord: 'uji' },
    { id: 'act-philosophers-path', city: 'kyoto', label: 'Philosopher’s Path slow walk', coord: 'philosophersPath' },
    { id: 'act-nara-park', city: 'kyoto', label: 'Nara Park deer + Tōdai-ji', coord: 'naraPark' },
    { id: 'act-koyasan-okunoin', city: 'kyoto', label: 'Kōyasan Okunoin night walk', coord: 'okunoin' },
    { id: 'act-sanzenin-ohara', city: 'kyoto', label: 'Ohara Sanzen-in moss gardens', coord: 'sanzenin' },
    { id: 'act-kurama-kibune', city: 'kyoto', label: 'Kurama to Kibune hike & onsen', coord: 'kuramaDera' },
    { id: 'guide-kimono-stroll', city: 'kyoto', label: 'Kimono stroll photo spot', coord: 'kiyomizudera' },
    { id: 'event-kiyomizu-lightup', city: 'kyoto', label: 'Kiyomizu-dera autumn night illumination', coord: 'kiyomizudera' },
    { id: 'event-eikando-lightup', city: 'kyoto', label: 'Eikando Zenrinji maple light-up', coord: 'eikando' },
    { id: 'event-rurikoin-autumn', city: 'kyoto', label: 'Rurikō-in autumn garden visit', coord: 'rurikoin' },
    { id: 'event-arashiyama-hanatouro', city: 'kyoto', label: 'Arashiyama Hanatōro lantern walk', coord: 'arashiyama' },
    { id: 'event-toji-flea', city: 'kyoto', label: 'Tō-ji Kobo-ichi flea market (21st)', coord: 'tojiTemple' },

    // Kobe / Himeji
    { id: 'act-arima-onsen', city: 'kobe', label: 'Arima Onsen golden & silver baths', coord: 'arimaOnsen' },
    { id: 'act-himeji-castle', city: 'kobe', label: 'Himeji Castle + Kōko-en', coord: 'himejiCastle' },
    { id: 'act-harborland-night', city: 'kobe', label: 'Kobe Harborland evening lights', coord: 'harborland' },
    { id: 'act-kitano-ijinkan', city: 'kobe', label: 'Kitano Ijinkan heritage houses', coord: 'kitanoIjinkan' },
    { id: 'act-nunobiki-herb', city: 'kobe', label: 'Nunobiki Herb Gardens ropeway', coord: 'nunobikiGardens' },
    { id: 'event-kobe-luminarie', city: 'kobe', label: 'Kobe Luminarie light festival', coord: 'higashiYuenchi' },

    // Tokyo / Chiba
    { id: 'act-disney-day', city: 'tokyo', label: 'Tokyo Disney day (Sea/Land)', coord: 'disneyResort' },
    { id: 'act-teamlab-planets', city: 'tokyo', label: 'teamLab Planets experience', coord: 'teamlabPlanets' },
    { id: 'act-ghibli-museum', city: 'tokyo', label: 'Ghibli Museum (Mitaka)', coord: 'ghibliMuseum' },
    { id: 'act-collab-cafe', city: 'tokyo', label: 'Collab café crawl (Animate/SQEX)', coord: 'sunshine60' },
    { id: 'act-shibuya-scramble', city: 'tokyo', label: 'Shibuya scramble + PARCO run', coord: 'shibuyaParco' },
    { id: 'act-harajuku-fashion', city: 'tokyo', label: 'Harajuku fashion lanes', coord: 'takeshitaStreet' },
    { id: 'act-ikebukuro-day', city: 'tokyo', label: 'Ikebukuro Sunshine & otaku stops', coord: 'sunshine60' },
    { id: 'act-karaoke-friends', city: 'tokyo', label: 'Late karaoke & izakaya with crew', coord: 'shibuyaParco' },
    { id: 'guide-shibuya-sky', city: 'tokyo', label: 'Shibuya SKY (observation deck)', coord: 'shibuyaParco' },
    { id: 'guide-omotesando-cafes', city: 'tokyo', label: 'Omotesandō cafés & boutiques', coord: 'takeshitaStreet' },
    { id: 'guide-nintendo-parco', city: 'tokyo', label: 'Nintendo Tokyo & Pokémon Center', coord: 'shibuyaParco' },
    { id: 'guide-animate-ikebukuro', city: 'tokyo', label: 'Animate Ikebukuro flagship', coord: 'animateIkebukuro' },
    { id: 'guide-akihabara-arcades', city: 'tokyo', label: 'Akihabara retro arcades crawl', coord: 'akihabara' },
    { id: 'guide-harajuku-vintage', city: 'tokyo', label: 'Harajuku thrift & vintage run', coord: 'harajukuVintage' },
    { id: 'event-roppongi-illumination', city: 'tokyo', label: 'Tokyo Midtown Roppongi illuminations', coord: 'roppongiMidtown' },
    { id: 'event-blue-cave', city: 'tokyo', label: 'Shibuya Ao no Dokutsu (Blue Cave)', coord: 'shibuyaParco' },
    { id: 'act-sensoji-asakusa', city: 'tokyo', label: 'Asakusa Sensō-ji & Nakamise stroll', coord: 'sensoji' },
    { id: 'act-kappabashi-hunt', city: 'tokyo', label: 'Kappabashi kitchenware treasure hunt', coord: 'kappabashi' },
    { id: 'act-tsukiji-breakfast', city: 'tokyo', label: 'Tsukiji Outer Market sushi breakfast', coord: 'tsukijiMarket' },
    { id: 'event-meguro-river-illumination', city: 'tokyo', label: 'Meguro River winter illumination', coord: 'meguroRiver' },
  ],
  stay: [
    // Osaka / Hirakata
    { id: 'stay-candeo-hirakata', city: 'osaka', label: 'Candeo Hotels Osaka Hirakata', url: 'https://www.candeohotels.com/en/osaka-hirakata/' },
    { id: 'stay-sunplaza-hirakata', city: 'osaka', label: 'Hirakata SunPlaza Hotel', url: 'https://sunplazahotel.co.jp/en/' },
    { id: 'stay-cross-hotel-osaka', city: 'osaka', label: 'Cross Hotel Osaka', url: 'https://www.crosshotel.com/osaka/en/' },
    { id: 'stay-hotel-vischio-osaka', city: 'osaka', label: 'Hotel Vischio Osaka by Granvia', url: 'https://www.hotelvischio-osaka.com/en/' },
    { id: 'stay-lively-osaka', city: 'osaka', label: 'THE LIVELY Osaka Honmachi', url: 'https://www.livelyhotels.com/en/thelivelyosaka/' },

    // Kyoto / Kōyasan
    { id: 'stay-the-thousand-kyoto', city: 'kyoto', label: 'THE THOUSAND KYOTO', url: 'https://www.keihanhotels-resorts.co.jp/the-thousand-kyoto/en/' },
    { id: 'stay-hotel-granvia-kyoto', city: 'kyoto', label: 'Hotel Granvia Kyoto', url: 'https://www.granviakyoto.com/' },
    { id: 'stay-ekoin-koyasan', city: 'kyoto', label: 'Kōyasan Eko-in temple stay', url: 'https://www.ekoin.jp/en/' },
    { id: 'stay-gate-hotel-kyoto', city: 'kyoto', label: 'THE GATE HOTEL Kyoto Takasegawa', url: 'https://www.gate-hotel.jp/kyoto/en/' },
    { id: 'stay-sowaka-kyoto', city: 'kyoto', label: 'Luxury ryokan SOWAKA (Gion)', url: 'https://sowaka.com/en/' },

    // Kobe / Himeji
    { id: 'stay-arima-grand', city: 'kobe', label: 'Arima Grand Hotel', url: 'https://www.arima-gh.jp/en/' },
    { id: 'stay-la-suite-kobe', city: 'kobe', label: 'Hotel La Suite Kobe Harborland', url: 'https://www.l-s.jp/english/' },
    { id: 'stay-hotel-okura-kobe', city: 'kobe', label: 'Hotel Okura Kobe', url: 'https://www.okura-nikko.com/japan/kobe/hotel-okura-kobe/' },

    // Tokyo / Chiba
    { id: 'stay-mitsui-garden-otemachi', city: 'tokyo', label: 'Mitsui Garden Hotel Otemachi', url: 'https://www.gardenhotels.co.jp/otemachi/eng/' },
    { id: 'stay-hotel-niwa-tokyo', city: 'tokyo', label: 'Hotel Niwa Tokyo', url: 'https://www.hotelniwa.jp/en/' },
    { id: 'stay-airbnb-tokyo', city: 'tokyo', label: 'Airbnb — central Tokyo flat', url: 'https://www.airbnb.com/s/Tokyo--Japan/homes' },
    { id: 'stay-disney-ambassador', city: 'tokyo', label: 'Disney Ambassador Hotel', url: 'https://www.tokyodisneyresort.jp/en/hotel/dh/' },
    { id: 'stay-disneyland-hotel', city: 'tokyo', label: 'Tokyo Disneyland Hotel', url: 'https://www.tokyodisneyresort.jp/en/hotel/tdh/' },
    { id: 'stay-disney-celebration', city: 'tokyo', label: 'Tokyo Disney Celebration Hotel', url: 'https://www.tokyodisneyresort.jp/en/hotel/dch/' },
    { id: 'stay-muji-hotel-ginza', city: 'tokyo', label: 'MUJI HOTEL GINZA', url: 'https://hotel.muji.com/en/ginza/' },
    { id: 'stay-millennials-shibuya', city: 'tokyo', label: 'The Millennials Shibuya (capsule)', url: 'https://www.livelyhotels.com/en/themillennialsshibuya/' },
  ],
  booking: [
    // Osaka / Hirakata
    { id: 'book-usj', city: 'osaka', label: 'USJ + Super Nintendo World tickets', url: 'https://www.usj.co.jp/e/ticket/' },
    { id: 'book-umeda-sky', city: 'osaka', label: 'Umeda Sky Building tickets', url: 'https://www.skybldg.co.jp/en/' },
    { id: 'book-harukas', city: 'osaka', label: 'Abeno HARUKAS 300 observatory', url: 'https://www.abenoharukas-300.jp/en/' },
    { id: 'book-midosuji-lights', city: 'osaka', label: 'Osaka Festival of the Lights info', url: 'https://www.hikari-kyoen.com/en/' },
    { id: 'book-mizuno', city: 'osaka', label: 'Okonomiyaki Mizuno reservations', url: 'https://www.gltjp.com/en/directory/item/12081/' },
    { id: 'book-daruma', city: 'osaka', label: 'Kushikatsu Daruma (Shinsekai)', url: 'https://www.dotonbori.or.jp/en/shops/68' },

    // Kyoto / Kōyasan
    { id: 'book-sagano', city: 'kyoto', label: 'Sagano Romantic Train tickets', url: 'https://www.sagano-kanko.co.jp/en/ticket/' },
    { id: 'book-kimono', city: 'kyoto', label: 'Kyoto kimono rental (Yumeyakata)', url: 'https://www.yumeyakata.com/' },
    { id: 'book-tea-ceremony', city: 'kyoto', label: 'Camellia tea ceremony booking', url: 'https://www.tea-kyoto.com/' },
    { id: 'book-kiyomizu-night', city: 'kyoto', label: 'Kiyomizu-dera night illumination', url: 'https://www.kiyomizudera.or.jp/en/event/' },
    { id: 'book-eikando-night', city: 'kyoto', label: 'Eikando maple light-up details', url: 'https://eikando.or.jp/' },
    { id: 'book-rurikoin', city: 'kyoto', label: 'Rurikō-in autumn visit info', url: 'https://rurikoin.komyoji.com/en/' },

    // Kobe / Himeji
    { id: 'book-himeji', city: 'kobe', label: 'Himeji Castle timed tickets', url: 'https://himejicastle.ntaticketing.com/' },
    { id: 'book-kobe-ropeway', city: 'kobe', label: 'Kobe Nunobiki Ropeway', url: 'https://www.kobeherb.com/en/ropeway/' },

    // Tokyo / Chiba
    { id: 'book-teamlab-planets', city: 'tokyo', label: 'teamLab Planets tickets', url: 'https://teamlabplanets.dmm.com/en' },
    { id: 'book-teamlab-borderless', city: 'tokyo', label: 'teamLab Borderless (Azabudai Hills)', url: 'https://www.teamlab.art/e/borderless/' },
    { id: 'book-tokyo-disney', city: 'tokyo', label: 'Tokyo Disney Resort tickets', url: 'https://www.tokyodisneyresort.jp/en/ticket/' },
    { id: 'book-ghibli', city: 'tokyo', label: 'Ghibli Museum via Lawson', url: 'https://l-tike.com/st1/ghibli-en/' },
    { id: 'book-shibuya-sky', city: 'tokyo', label: 'Shibuya SKY admission', url: 'https://www.shibuya-scramble-square.com/en/sky/' },
    { id: 'book-blue-cave', city: 'tokyo', label: 'Ao no Dokutsu (Blue Cave) info', url: 'https://bluecavetokyo.com/' },
    { id: 'book-midtown-christmas', city: 'tokyo', label: 'Tokyo Midtown Christmas lights', url: 'https://www.tokyo-midtown.com/en/event/xmas/' },
    { id: 'book-uogashi', city: 'tokyo', label: 'Standing sushi Uogashi (Shibuya)', url: 'https://www.timeout.com/tokyo/restaurants/uogashi-nihon-ichi-shibuya-dogenzaka' },
    { id: 'book-gyukatsu', city: 'tokyo', label: 'Gyukatsu Motomura Harajuku', url: 'https://s.tabelog.com/en/tokyo/A1306/A130601/13208866/' },
  ],
};

export const PREFILL = {
  '2025-11-14': {
    loc: 'work',
    theme: 'Flights → Osaka',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: ['act-flight-dxb-arrival'],
      afternoon: ['act-flight-dxb-kix'],
      evening: ['act-arrive-kix', 'act-transfer-kix-hirakata', 'act-dinner-nana'],
    },
    locks: {
      'act-flight-dxb-arrival': 1,
      'act-flight-dxb-kix': 1,
      'act-arrive-kix': 1,
    },
  },
  '2025-11-15': {
    loc: 'kyoto',
    theme: 'Kyoto sights',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: ['act-arashiyama'],
      afternoon: ['act-kiyomizudera'],
      evening: ['act-fushimi-inari'],
    },
    locks: {},
  },
  '2025-11-16': {
    loc: 'kyoto',
    theme: 'Nara or Uji',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: ['act-nara-park'],
      afternoon: ['act-uji-tea'],
      evening: [],
    },
    locks: {},
  },
  '2025-11-17': {
    loc: 'kyoto',
    theme: 'Kōyasan overnight',
    friends: ['Nana'],
    stay: 'stay-ekoin-koyasan',
    slots: {
      morning: [],
      afternoon: ['act-koyasan-okunoin'],
      evening: ['act-koyasan-okunoin'],
    },
    locks: {},
  },
  '2025-11-18': {
    loc: 'work',
    theme: 'Tue — Nana work',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: [],
      afternoon: [],
      evening: ['act-dotonbori-walk'],
    },
    locks: {},
  },
  '2025-11-19': {
    loc: 'kobe',
    theme: 'Arima Onsen + Kobe night',
    friends: ['Nana'],
    stay: 'stay-arima-grand',
    slots: {
      morning: ['act-arima-onsen'],
      afternoon: ['act-harborland-night'],
      evening: [],
    },
    locks: {},
  },
  '2025-11-20': {
    loc: 'osaka',
    theme: 'Umeda sunset + karaoke',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: [],
      afternoon: ['act-umeda-sky'],
      evening: ['act-karaoke-namba'],
    },
    locks: {},
  },
  '2025-11-21': {
    loc: 'work',
    theme: 'Fri — Nana work',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: [],
      afternoon: [],
      evening: ['act-abeno-harukas'],
    },
    locks: {},
  },
  '2025-11-22': {
    loc: 'tokyo',
    theme: 'Disney or teamLab',
    friends: ['Nana'],
    stay: 'stay-disneyland-hotel',
    slots: {
      morning: ['act-disney-day'],
      afternoon: ['act-disney-day'],
      evening: ['act-disney-day'],
    },
    locks: {},
  },
  '2025-11-23': {
    loc: 'tokyo',
    theme: 'Nicole + Ken day',
    friends: ['Nicole', 'Ken', 'James'],
    stay: 'stay-airbnb-tokyo',
    slots: {
      morning: ['act-teamlab-planets'],
      afternoon: ['act-collab-cafe'],
      evening: ['act-karaoke-friends'],
    },
    locks: {},
  },
  '2025-11-24': {
    loc: 'tokyo',
    theme: 'Shibuya / Harajuku',
    friends: ['Nicole', 'Ken', 'James', 'Phil'],
    stay: 'stay-airbnb-tokyo',
    slots: {
      morning: ['act-shibuya-scramble'],
      afternoon: ['act-harajuku-fashion'],
      evening: ['act-ikebukuro-day'],
    },
    locks: {},
  },
  '2025-11-25': {
    loc: 'work',
    theme: 'Tue — Travel/admin',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: [],
      afternoon: [],
      evening: [],
    },
    locks: {},
  },
  '2025-11-26': {
    loc: 'kobe',
    theme: 'Himeji Castle day',
    friends: [],
    stay: null,
    slots: {
      morning: ['act-himeji-castle'],
      afternoon: [],
      evening: [],
    },
    locks: {},
  },
  '2025-11-27': {
    loc: 'kobe',
    theme: 'Easy Kansai',
    friends: [],
    stay: null,
    slots: {
      morning: ['act-harborland-night'],
      afternoon: [],
      evening: [],
    },
    locks: {},
  },
  '2025-11-28': {
    loc: 'osaka',
    theme: 'Birthday in Osaka',
    friends: ['Nana', 'Nicole', 'Ken', 'James'],
    stay: null,
    slots: {
      morning: [],
      afternoon: [],
      evening: ['act-karaoke-namba'],
    },
    locks: {},
  },
  '2025-11-29': {
    loc: 'kyoto',
    theme: 'Leaves & tea',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: ['act-uji-tea'],
      afternoon: ['act-arashiyama'],
      evening: [],
    },
    locks: {},
  },
  '2025-11-30': {
    loc: 'work',
    theme: 'Fly home',
    friends: ['Nana'],
    stay: null,
    slots: {
      morning: ['act-transfer-hirakata-kix'],
      afternoon: [],
      evening: ['act-flight-kix-dxb'],
    },
    locks: {
      'act-flight-kix-dxb': 1,
    },
  },
};
