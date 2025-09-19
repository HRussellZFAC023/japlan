import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_PATH = path.resolve('./scripts/data.js');
const replacements = {
  'act-flight-dxb-arrival': 'https://www.dubaiairports.ae/images/passengerslibraries/home-page/hero-slider/hero-slider-02.png',
  'act-flight-dxb-kix': 'https://c.ekstatic.net/shared/images/destination/v1/airports/KIX/1920x480.jpg',
  'act-arrive-kix': 'https://www.kansai-airport.or.jp/sites/default/files/images/2025-02/1_1040_1040_EN.jpg',
  'act-transfer-kix-hirakata': 'https://www.kansai-airport.or.jp/static/images/access/map_train_2f_en.png',
  'act-dinner-nana': 'https://www.osaka-info.jp/common/img/gnav/gnav_osaka_basic.jpg',
  'act-transfer-hirakata-kix': 'https://www.kansai-airport.or.jp/static/images/banner/kixguide/concierge_en.jpg',
  'act-flight-kix-dxb': 'https://c.ekstatic.net/ecl/aircraft-interior/economy-class/economy-class-cabin-seats-w1280x960.jpg',
  'act-dotonbori-walk': 'https://www.osaka-info.jp/common/img/gnav/gnav_osaka_basic.jpg',
  'act-umeda-sky': 'https://www.skybldg.co.jp/cmn/img/ogp.jpg',
  'act-abeno-harukas': 'https://www.abenoharukas-300.jp/en/images/mv01.jpg',
  'act-karaoke-namba': 'https://www.japan-guide.com/g24/4009_01.jpg',
  'guide-donki-night-run': 'https://www.donki.com/shared/img/store/st_store/154/2025071117522059070.jpg',
  'event-midosuji-lights': 'https://www.hikari-kyoen.com/img/common/ogp.png',
  'act-usj-day': 'https://www.usj.co.jp/company/assets/img/common/ogp.png',
  'act-arashiyama': 'https://www.japan-guide.com/g18/3912_top.jpg',
  'act-kiyomizudera': 'https://www.kiyomizudera.or.jp/en/img/common/ogp/ogp.jpg',
  'act-fushimi-inari': 'https://inari.jp/en/wp-content/uploads/2021/10/index_about.jpg',
  'act-uji-tea': 'https://resources.matcha-jp.com/original/2018/11/30-67134.png',
  'act-nara-park': 'https://images.contentful.com/9uvqwr58loxx/2Nc75AbOM8S6muQM2iAEOS/424eef0184a4b37f48d67cfdd22df286/PMH_160814_194534_1319.jpg?fit=thumb&w=1300&h=800&q=70',
  'act-koyasan-okunoin': 'https://www.koyasan.or.jp/images/og_image.jpg',
  'guide-kimono-stroll': 'https://www.yumeyakata.com/common/img/top/yukata4.jpg',
  'event-kiyomizu-lightup': 'https://www.kiyomizudera.or.jp/en/img/common/ogp/ogp.jpg',
  'event-eikando-lightup': 'https://eikando.or.jp/image/850nen.jpg',
  'event-rurikoin-autumn': 'https://rurikoin.komyoji.com/assets/images/top_Img04.jpg',
  'act-arima-onsen': 'https://visit.arima-onsen.com/shared/images/common/ogimage.png',
  'act-himeji-castle': 'https://www.himejicastle.jp/ogp.png',
  'act-harborland-night': 'https://www.feel-kobe.jp/en/wp-content/themes/feel-kobe-plus/common/img/common/things_nature_pic01.jpg',
  'act-disney-day': 'https://www.tokyodisneyresort.jp/tdl/images/ogp.png',
  'act-teamlab-planets': 'https://teamlabplanets.dmm.com/img/seo/thumbnail.jpg',
  'act-ghibli-museum': 'https://www.ghibli-museum.jp/en/img/ghibli-museum.png',
  'act-collab-cafe': 'https://cafe.animate.co.jp/images/ogp.png',
  'act-shibuya-scramble': 'https://www.japan-guide.com/g18/3007_01.jpg',
  'act-harajuku-fashion': 'https://www.gotokyo.org/shared/site_gotokyo_rn/images/ogp/ogp.png',
  'act-ikebukuro-day': 'https://sunshinecity.jp/themes/sunshine/resource/common/images/ogp_koushiki.png',
  'act-karaoke-friends': 'https://www.pasela.co.jp/images_2024r/shop/shibuya/room/img_room_premium01.webp',
  'guide-shibuya-sky': 'https://www.shibuya-scramble-square.com/assets/img/og-img.jpg',
  'guide-omotesando-cafes': 'https://media.timeout.com/images/106307650/750/422/image.jpg',
  'guide-nintendo-parco': 'https://www.nintendo.com/jp/img/og_nintendo.png',
  'guide-animate-ikebukuro': 'https://www.animate.co.jp/assets/img/ogp/ikebukuro.jpg?2024-06-10',
  'guide-akihabara-arcades': 'https://www.gotokyo.org/shared/site_gotokyo_rn/images/ogp/ogp.png',
  'guide-harajuku-vintage': 'https://media.timeout.com/images/106307650/750/422/image.jpg',
  'event-roppongi-illumination': 'https://en.tokyo-midtown.com/assets/images/ogp.png',
  'event-blue-cave': 'https://bluecave.jp/wp-content/uploads/2025/09/buluecave1200_630.png',
  'stay-candeo-hirakata': 'https://www.candeohotels.com/en/assets_c/2024/01/hirakata_main_kv-thumb-2560x1774-18748.jpg',
  'stay-sunplaza-hirakata': 'https://sunplazahotel.co.jp/en/img/top/topimg1.jpg',
  'stay-cross-hotel-osaka': 'https://cross-osaka.orixhotelsandresorts.com/_assets/images/common/ogp.jpg',
  'stay-the-thousand-kyoto': 'https://www.keihanhotels-resorts.co.jp/the-thousand-kyoto/assets/images/ogp.png',
  'stay-hotel-granvia-kyoto': 'https://www.granviakyoto.com/img/index/img_geisya.jpg',
  'stay-ekoin-koyasan': 'https://www.ekoin.jp/wp-content/uploads/2021/11/twitter_card.jpg',
  'stay-arima-grand': 'https://www.arima-gh.jp/wp-content/themes/arimagh/images/common/ogp.jpg',
  'stay-la-suite-kobe': 'https://www.l-s.jp/common/img/review_img.jpg',
  'stay-mitsui-garden-otemachi': 'https://www.gardenhotels.co.jp/assets/images/common/banner-rc-eng-pc.jpg',
  'stay-hotel-niwa-tokyo': 'https://www.hotelniwa.jp/assets/img/common/ogp.png',
  'stay-airbnb-tokyo': 'https://a0.muscache.com/im/pictures/fe7217ff-0b24-438d-880d-b94722c75bf5.jpg',
  'stay-disney-ambassador': 'https://www.tokyodisneyresort.jp/dh/images/ogp.png',
  'stay-disneyland-hotel': 'https://www.tokyodisneyresort.jp/tdh/images/ogp.png',
  'stay-disney-celebration': 'https://www.tokyodisneyresort.jp/dch/images/ogp.png',
};

let data = await fs.readFile(DATA_PATH, 'utf8');
for (const [id, image] of Object.entries(replacements)) {
  const pattern = new RegExp(`(id: '${id}'[\\s\\S]*?image: )['\"][^'\"]+['\"]`);
  if (!pattern.test(data)) {
    console.warn(`Could not locate image for ${id}`);
    continue;
  }
  data = data.replace(pattern, `$1'${image}'`);
}
await fs.writeFile(DATA_PATH, data, 'utf8');
