import { STORAGE_KEY, DEFAULT_TRIP_TEMPLATE, COLOR_PALETTES } from './data.js';

const calendarEl = document.getElementById('calendar');
const tripTitleEl = document.getElementById('tripTitle');
const friendFiltersEl = document.getElementById('friendFilters');
const locationFiltersEl = document.getElementById('locationFilters');
const locationLegendEl = document.getElementById('locationLegend');
const editBtn = document.querySelector('[data-action="toggle-edit"]');
const settingsBtn = document.querySelector('[data-action="trip-settings"]');
const newTripBtn = document.querySelector('[data-action="new-trip"]');
const icsBtn = document.querySelector('[data-action="export-ics"]');
const allFilterBtn = document.querySelector('[data-filter="all"]');
const sheetEl = document.getElementById('sheet');
const sheetBackdrop = document.getElementById('sheetBackdrop');
const sheetTitle = document.getElementById('sheetTitle');
const sheetSubtitle = document.getElementById('sheetSubtitle');
const sheetBody = document.getElementById('sheetBody');
const mapOverlay = document.getElementById('mapOverlay');
const mapSummaryEl = document.getElementById('mapSummary');
const closeSheetBtn = sheetEl.querySelector('[data-action="close-sheet"]');
const closeMapBtn = mapOverlay.querySelector('[data-action="close-map"]');


let planState = initializeState();
let dateSequence = buildDateSequence(planState.config.range.start, planState.config.range.end);
let ACTIVITY_MAP = new Map();
let STAY_MAP = new Map();
refreshCatalogLookups();
const ICS_TIMEZONE_ID = 'Asia/Tokyo';
const ICS_VTIMEZONE_BLOCK = [
  'BEGIN:VTIMEZONE',
  `TZID:${ICS_TIMEZONE_ID}`,
  `X-LIC-LOCATION:${ICS_TIMEZONE_ID}`,
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0900',
  'TZOFFSETTO:+0900',
  'TZNAME:JST',
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
];
let editing = false;
let filterState = { friend: null, location: null };
let sheetState = { open: false, day: null, slot: 'morning', tab: 'activity' };
let cardDragSource = null;
let chipDragData = null;
let mapInstance = null;
let mapMarkersLayer = null;
let mapRouteLayer = null;
let activeMapDate = null;
const travelRequests = new Map();
let routingKeyPromptActive = false;

renderChrome();
renderCalendar();
updateFilterChips();
attachToolbarEvents();
attachGlobalShortcuts();

function buildDateSequence(start, end) {
  const results = [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    results.push(iso);
  }
  return results;
}

function renderChrome() {
  updateTripTitle();
  renderFilterChips();
  renderLegend();
}

function updateTripTitle() {
  const title = planState.config.tripName || 'Trip Planner';
  if (tripTitleEl) {
    tripTitleEl.textContent = title;
  }
  document.title = title;
}

function renderFilterChips() {
  if (filterState.friend && !planState.config.friends.includes(filterState.friend)) {
    filterState.friend = null;
  }
  if (filterState.location && !planState.config.locations[filterState.location]) {
    filterState.location = null;
  }

  if (friendFiltersEl) {
    friendFiltersEl.innerHTML = '';
    planState.config.friends.forEach((friend) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--friend';
      chip.dataset.friend = friend;
      chip.textContent = friend;
      chip.addEventListener('click', () => {
        filterState.friend = filterState.friend === friend ? null : friend;
        applyFilters();
        updateFilterChips();
      });
      friendFiltersEl.appendChild(chip);
    });
  }

  if (locationFiltersEl) {
    locationFiltersEl.innerHTML = '';
    planState.config.locationOrder.forEach((loc) => {
      const meta = planState.config.locations[loc];
      if (!meta) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--location';
      chip.dataset.location = loc;
      chip.textContent = meta.label || loc;
      chip.addEventListener('click', () => {
        filterState.location = filterState.location === loc ? null : loc;
        applyFilters();
        updateFilterChips();
      });
      locationFiltersEl.appendChild(chip);
    });
  }

  updateFilterChips();
}

function renderLegend() {
  if (!locationLegendEl) return;
  locationLegendEl.innerHTML = '';
  planState.config.locationOrder.forEach((loc) => {
    const meta = planState.config.locations[loc];
    if (!meta) return;
    const item = document.createElement('div');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = meta.color || '#d1d5db';
    const label = document.createElement('span');
    label.textContent = meta.label || loc;
    item.append(swatch, label);
    locationLegendEl.appendChild(item);
  });
}

function applyFilterChipStyles() {
  document.querySelectorAll('.chip[data-friend]').forEach((chip) => {
    const friend = chip.dataset.friend;
    const active = chip.getAttribute('aria-pressed') === 'true';
    if (active) {
      const color = planState.config.friendColors?.[friend];
      chip.style.background = color || 'rgba(45, 58, 100, 0.08)';
    } else {
      chip.style.background = '';
    }
  });
  document.querySelectorAll('.chip[data-location]').forEach((chip) => {
    const loc = chip.dataset.location;
    const active = chip.getAttribute('aria-pressed') === 'true';
    if (active) {
      const color = planState.config.locations[loc]?.color;
      chip.style.background = color ? lightenColor(color, 0.6) : 'rgba(45, 58, 100, 0.08)';
    } else {
      chip.style.background = '';
    }
  });
}

function createEmptyDay(config = planState.config, locationId) {
  const targetLocation = locationId || getDefaultLocationId(config);
  return {
    loc: targetLocation,
    theme: '',
    friends: [],
    stay: null,
    slots: { morning: [], afternoon: [], evening: [] },
    locks: {},
    travel: null,
  };
}

function cloneDay(day, config = planState.config) {
  const base = day || createEmptyDay(config);
  return {
    loc: config.locations?.[base.loc] ? base.loc : getDefaultLocationId(config),
    theme: base.theme || '',
    friends: Array.isArray(base.friends) ? [...base.friends] : [],
    stay: base.stay || null,
    slots: {
      morning: Array.isArray(base.slots?.morning) ? [...base.slots.morning] : [],
      afternoon: Array.isArray(base.slots?.afternoon) ? [...base.slots.afternoon] : [],
      evening: Array.isArray(base.slots?.evening) ? [...base.slots.evening] : [],
    },
    locks: { ...(base.locks || {}) },
    travel: base.travel ? deepClone(base.travel) : null,
  };
}

function initializeState() {
  const saved = loadSavedState();
  if (saved) return saved;
  return createStateFromTemplate(DEFAULT_TRIP_TEMPLATE);
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.warn('Unable to load saved trip, using default template.', error);
    return null;
  }
}

function createStateFromTemplate(template) {
  const config = createConfigFromTemplate(template);
  const days = {};
  const sequence = buildDateSequence(config.range.start, config.range.end);
  sequence.forEach((dateKey) => {
    const prefillDay = template.prefill?.[dateKey];
    days[dateKey] = cloneDay(prefillDay, config);
  });
  return { config, days };
}

function createConfigFromTemplate(template) {
  const locations = deepClone(template.locations || {});
  let locationOrder = Array.isArray(template.locationOrder) && template.locationOrder.length
    ? [...template.locationOrder]
    : Object.keys(locations);
  if (!locationOrder.length) {
    locations.general = { label: 'General', color: '#1f2937' };
    locationOrder = ['general'];
  }
  const rangeStart = template.range?.start || new Date().toISOString().slice(0, 10);
  const rangeEnd = template.range?.end || rangeStart;
  const config = {
    tripName: template.tripName || 'Trip Planner',
    range: { start: rangeStart, end: rangeEnd },
    friends: Array.isArray(template.friends) ? template.friends.filter(Boolean) : [],
    friendColors: assignFriendColors(
      Array.isArray(template.friends) ? template.friends.filter(Boolean) : [],
      template.friendColors || {}
    ),
    locations,
    locationOrder,
    defaultThemes: { ...(template.defaultThemes || {}) },
    mapDefaults: template.mapDefaults ? { ...template.mapDefaults } : null,
    mapCoordinates: deepClone(template.mapCoordinates || {}),
    routing: {
      provider: template.routing?.provider || 'openrouteservice',
      openRouteApiKey: template.routing?.openRouteApiKey || '',
    },
    catalog: {
      activity: Array.isArray(template.catalog?.activity)
        ? template.catalog.activity.map((item) => ({ ...item }))
        : [],
      stay: Array.isArray(template.catalog?.stay)
        ? template.catalog.stay.map((item) => ({ ...item }))
        : [],
      booking: Array.isArray(template.catalog?.booking)
        ? template.catalog.booking.map((item) => ({ ...item }))
        : [],
    },
  };
  config.locationOrder.forEach((loc) => {
    if (!config.defaultThemes[loc]) {
      config.defaultThemes[loc] = config.locations[loc]?.label || '';
    }
  });
  return config;
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const config = normalizeConfig(raw.config || {});
  const sequence = buildDateSequence(config.range.start, config.range.end);
  const days = {};
  sequence.forEach((dateKey) => {
    const savedDay = raw.days?.[dateKey];
    days[dateKey] = cloneDay(savedDay, config);
  });
  return { config, days };
}

function normalizeConfig(rawConfig) {
  const template = DEFAULT_TRIP_TEMPLATE;
  const fallbackStart = rawConfig.range?.start || template.range.start;
  const fallbackEnd = rawConfig.range?.end || rawConfig.range?.start || template.range.end;
  const locations = deepClone(rawConfig.locations || template.locations || {});
  let locationOrder = Array.isArray(rawConfig.locationOrder) && rawConfig.locationOrder.length
    ? [...rawConfig.locationOrder]
    : Object.keys(locations);
  if (!locationOrder.length) {
    locations.general = { label: 'General', color: '#1f2937' };
    locationOrder = ['general'];
  }
  const friends = Array.isArray(rawConfig.friends)
    ? rawConfig.friends.filter(Boolean)
    : [];
  const config = {
    tripName: rawConfig.tripName || template.tripName || 'Trip Planner',
    range: { start: fallbackStart, end: fallbackEnd },
    friends,
    friendColors: assignFriendColors(friends, rawConfig.friendColors || {}),
    locations,
    locationOrder,
    defaultThemes: { ...(rawConfig.defaultThemes || {}) },
    mapDefaults: rawConfig.mapDefaults ? { ...rawConfig.mapDefaults } : template.mapDefaults || null,
    mapCoordinates: deepClone(rawConfig.mapCoordinates || template.mapCoordinates || {}),
    routing: {
      provider: rawConfig.routing?.provider || template.routing?.provider || 'openrouteservice',
      openRouteApiKey: rawConfig.routing?.openRouteApiKey || template.routing?.openRouteApiKey || '',
    },
    catalog: {
      activity: Array.isArray(rawConfig.catalog?.activity)
        ? rawConfig.catalog.activity.map((item) => ({ ...item }))
        : [],
      stay: Array.isArray(rawConfig.catalog?.stay)
        ? rawConfig.catalog.stay.map((item) => ({ ...item }))
        : [],
      booking: Array.isArray(rawConfig.catalog?.booking)
        ? rawConfig.catalog.booking.map((item) => ({ ...item }))
        : [],
    },
  };
  config.locationOrder.forEach((loc) => {
    if (!config.defaultThemes[loc]) {
      const label = config.locations[loc]?.label || template.defaultThemes?.[loc] || '';
      config.defaultThemes[loc] = label;
    }
  });
  return config;
}

function refreshCatalogLookups() {
  ACTIVITY_MAP = new Map((planState.config.catalog.activity || []).map((item) => [item.id, item]));
  STAY_MAP = new Map((planState.config.catalog.stay || []).map((item) => [item.id, item]));
}

function deepClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function assignFriendColors(friends, existing = {}) {
  const colors = { ...existing };
  let paletteIndex = 0;
  friends.forEach((friend) => {
    if (!colors[friend]) {
      colors[friend] = COLOR_PALETTES.friends[paletteIndex % COLOR_PALETTES.friends.length];
      paletteIndex += 1;
    }
  });
  Object.keys(colors).forEach((friend) => {
    if (!friends.includes(friend)) {
      delete colors[friend];
    }
  });
  return colors;
}

function buildLocationsFromList(names, previousConfig) {
  const locations = {};
  const order = [];
  const usedIds = new Set();
  const palette = COLOR_PALETTES.locations;
  let paletteIndex = 0;
  const entries = Array.isArray(names) && names.length ? names : ['General'];
  entries.forEach((labelRaw, index) => {
    const label = labelRaw.trim();
    if (!label) return;
    let id;
    let color;
    let match = null;
    if (previousConfig) {
      match = Object.entries(previousConfig.locations || {}).find(
        ([key, meta]) => meta?.label?.trim()?.toLowerCase() === label.toLowerCase() && !usedIds.has(key)
      );
    }
    if (match) {
      [id, { color }] = match;
    } else {
      const baseSlug = slugify(label, `loc-${index + 1}`);
      id = baseSlug;
      let counter = 2;
      while (usedIds.has(id)) {
        id = `${baseSlug}-${counter++}`;
      }
      color = palette[paletteIndex % palette.length];
      paletteIndex += 1;
    }
    usedIds.add(id);
    locations[id] = {
      label,
      color: color || palette[paletteIndex++ % palette.length] || '#1f2937',
    };
    order.push(id);
  });
  if (!order.length) {
    locations.general = { label: 'General', color: '#1f2937' };
    order.push('general');
  }
  return { locations, order };
}

function buildDefaultThemes(order, locations, previousThemes = {}) {
  const themes = {};
  order.forEach((id) => {
    themes[id] = previousThemes[id] || locations[id]?.label || '';
  });
  return themes;
}

function remapCatalogItems(items, fallbackLocation, locations) {
  if (!Array.isArray(items) || !items.length) return [];
  return items.map((item) => {
    const city = locations[item.city] ? item.city : fallbackLocation;
    return { ...item, city };
  });
}

function getDefaultLocationId(config = planState.config) {
  return config.locationOrder[0] || Object.keys(config.locations || {})[0] || 'general';
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(planState));
  } catch (error) {
    console.warn('Unable to save trip.', error);
  }
}

function ensureDay(dateKey) {
  if (!planState.days[dateKey]) {
    planState.days[dateKey] = createEmptyDay();
  }
  const day = planState.days[dateKey];
  day.slots = {
    morning: Array.isArray(day.slots?.morning) ? day.slots.morning : [],
    afternoon: Array.isArray(day.slots?.afternoon) ? day.slots.afternoon : [],
    evening: Array.isArray(day.slots?.evening) ? day.slots.evening : [],
  };
  day.locks = day.locks || {};
  day.friends = Array.isArray(day.friends)
    ? day.friends.filter((friend) => planState.config.friends.includes(friend))
    : [];
  if (!planState.config.locations[day.loc]) {
    day.loc = getDefaultLocationId(planState.config);
  }
  day.theme = day.theme ?? '';
  day.stay = day.stay || null;
  if (!day.travel || typeof day.travel !== 'object') {
    day.travel = null;
  }
  return day;
}

function getCoordinateValue(coordRef) {
  if (!coordRef) return null;
  if (Array.isArray(coordRef) && coordRef.length === 2 && Number.isFinite(coordRef[0]) && Number.isFinite(coordRef[1])) {
    return [Number(coordRef[0]), Number(coordRef[1])];
  }
  if (typeof coordRef === 'string') {
    const lookup = planState.config.mapCoordinates?.[coordRef];
    if (Array.isArray(lookup) && lookup.length === 2) {
      return [Number(lookup[0]), Number(lookup[1])];
    }
  }
  return null;
}

function getStayInfo(day) {
  if (!day?.stay) return null;
  const stay = STAY_MAP.get(day.stay);
  if (!stay) return null;
  const coords = getCoordinateValue(stay.coord);
  if (!coords) return null;
  return {
    id: stay.id,
    label: stay.label || stay.id,
    coords,
  };
}

function buildItineraryForDay(day) {
  const stay = getStayInfo(day);
  if (!stay) {
    return { status: 'missing-stay', stay: null, activities: [], skipped: [], routePoints: [], signature: '' };
  }

  const activities = [];
  const skipped = [];
  ['morning', 'afternoon', 'evening'].forEach((slot) => {
    (day.slots?.[slot] || []).forEach((itemId) => {
      const activity = ACTIVITY_MAP.get(itemId);
      if (!activity) return;
      const coords = getCoordinateValue(activity.coord);
      if (!coords) {
        skipped.push(activity.label || itemId);
        return;
      }
      activities.push({ id: itemId, label: activity.label || itemId, coords });
    });
  });

  const routePoints = [stay.coords];
  activities.forEach((activity) => {
    routePoints.push(activity.coords);
  });
  routePoints.push(stay.coords);

  const status = activities.length > 0 ? 'ok' : 'no-activities';
  const signature = buildRouteSignature(routePoints);

  return { status, stay, activities, skipped, routePoints, signature };
}

function buildRouteSignature(points) {
  if (!Array.isArray(points) || !points.length) {
    return '';
  }
  return points
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length !== 2) return 'na';
      const [lat, lon] = coord;
      return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
    })
    .join('|');
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return '';
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.max(0, totalMinutes - hours * 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters >= 1000) {
    const km = meters / 1000;
    const precision = km >= 10 ? 0 : 1;
    return `${km.toFixed(precision)} km`;
  }
  return `${Math.round(meters)} m`;
}

function buildTravelDisplay(plan) {
  const travel = plan.travel;
  if (!plan.stay) {
    return { text: 'Travel: add stay', state: 'warning', title: 'Pick a stay with map coordinates to calculate travel time.' };
  }
  if (!travel) {
    return { text: 'Travel: calculating…', state: 'pending', title: 'Travel time will be calculated soon.' };
  }

  const skippedCount = Array.isArray(travel.skipped) ? travel.skipped.length : 0;
  const skippedTitle = skippedCount
    ? `${skippedCount} stop${skippedCount === 1 ? '' : 's'} missing map pins`
    : '';

  switch (travel.status) {
    case 'ready': {
      const durationText = formatDuration(Number(travel.durationSeconds));
      const distanceText = formatDistance(Number(travel.distanceMeters));
      const parts = [];
      if (durationText) parts.push(`Time ${durationText}`);
      if (distanceText) parts.push(`Distance ${distanceText}`);
      if (skippedTitle) parts.push(skippedTitle);
      return {
        text: `Travel: ${durationText || '—'}`,
        state: skippedCount ? 'warning' : 'ready',
        title: parts.join(' · '),
      };
    }
    case 'pending':
      return { text: 'Travel: calculating…', state: 'pending', title: 'Travel time is being calculated.' };
    case 'missing-key':
      return {
        text: 'Travel: add API key',
        state: 'warning',
        title: 'Add your OpenRouteService API key to calculate travel time.',
      };
    case 'missing-stay':
      return {
        text: 'Travel: add stay',
        state: 'warning',
        title: 'Pick a stay with map coordinates to calculate travel time.',
      };
    case 'no-activities':
      return {
        text: 'Travel: 0m',
        state: skippedCount ? 'warning' : 'ready',
        title: skippedTitle || 'No mapped stops scheduled for this day.',
      };
    case 'insufficient-data':
      return {
        text: 'Travel: add map pins',
        state: 'warning',
        title: 'Add coordinates for all stops to calculate travel time.',
      };
    case 'error':
      return {
        text: 'Travel: unavailable',
        state: 'error',
        title: travel.error || 'Routing request failed.',
      };
    default:
      return { text: 'Travel: —', state: 'pending', title: '' };
  }
}

function applyTravelChipState(chip, plan) {
  const display = buildTravelDisplay(plan);
  chip.textContent = display.text;
  if (display.state) {
    chip.dataset.state = display.state;
  } else {
    delete chip.dataset.state;
  }
  if (display.title) {
    chip.title = display.title;
  } else {
    chip.removeAttribute('title');
  }
}

function refreshTravelChip(dateKey) {
  if (!calendarEl) return false;
  const card = calendarEl.querySelector(`.day-card[data-date="${dateKey}"]`);
  if (!card) return false;
  const chip = card.querySelector('.theme-chip--travel');
  if (!chip) return false;
  const day = ensureDay(dateKey);
  applyTravelChipState(chip, day);
  return true;
}

function scheduleTravelChipRefresh(dateKey) {
  const updated = refreshTravelChip(dateKey);
  const schedule = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? (fn) => window.requestAnimationFrame(fn)
        : (fn) => setTimeout(fn, 0));
  schedule(() => {
    refreshTravelChip(dateKey);
  });
  return updated;
}

function setDayTravel(dateKey, travel, { persist = true, updateCard = true } = {}) {
  const day = ensureDay(dateKey);
  day.travel = travel;
  if (persist) {
    persistState();
  }
  if (updateCard) {
    scheduleTravelChipRefresh(dateKey);
  }
  if (activeMapDate === dateKey) {
    renderMapRoute(dateKey);
    updateMapSummary(dateKey);
  }
}

function invalidateTravel(dateKey, { persist = true, updateCard = true } = {}) {
  const day = ensureDay(dateKey);
  if (!day.travel) return;
  setDayTravel(dateKey, null, { persist, updateCard });
}

function scheduleTravelCalculation(dateKey, { interactive = false } = {}) {
  if (travelRequests.has(dateKey)) {
    return travelRequests.get(dateKey);
  }
  const request = computeTravelForDay(dateKey, { interactive });
  travelRequests.set(dateKey, request);
  request.finally(() => {
    travelRequests.delete(dateKey);
  });
  return request;
}

async function computeTravelForDay(dateKey, { interactive = false } = {}) {
  const provider = 'openrouteservice';
  const profile = 'driving-car';
  const day = ensureDay(dateKey);
  const itinerary = buildItineraryForDay(day);

  const skipped = Array.isArray(itinerary.skipped) ? itinerary.skipped : [];
  const signatureBase = itinerary.signature || '';
  const signature = `${provider}:${profile}:${signatureBase}`;

  if (itinerary.status === 'missing-stay') {
    setDayTravel(
      dateKey,
      { status: 'missing-stay', provider, profile, signature, skipped },
      { persist: false }
    );
    return null;
  }

  const existing = day.travel;
  if (existing && existing.signature === signature && existing.status === 'ready') {
    return existing;
  }

  if (itinerary.status === 'no-activities') {
    const travelData = {
      status: 'ready',
      provider,
      profile,
      signature,
      durationSeconds: 0,
      distanceMeters: 0,
      fetchedAt: Date.now(),
      skipped,
      geometry: null,
    };
    setDayTravel(dateKey, travelData);
    return travelData;
  }

  if (!Array.isArray(itinerary.routePoints) || itinerary.routePoints.length < 2) {
    setDayTravel(
      dateKey,
      { status: 'insufficient-data', provider, profile, signature, skipped },
      { persist: false }
    );
    return null;
  }

  const apiKey = getRoutingApiKey({ interactive });
  if (!apiKey) {
    setDayTravel(
      dateKey,
      { status: 'missing-key', provider, profile, signature, skipped },
      { persist: false }
    );
    return null;
  }

  setDayTravel(
    dateKey,
    { status: 'pending', provider, profile, signature, requestedAt: Date.now(), skipped },
    { persist: false }
  );

  try {
    const route = await requestOpenRouteRoute(itinerary.routePoints, apiKey, profile);
    const travelData = {
      status: 'ready',
      provider,
      profile,
      signature,
      durationSeconds: Number(route.summary?.duration ?? 0),
      distanceMeters: Number(route.summary?.distance ?? 0),
      fetchedAt: Date.now(),
      skipped,
      geometry: route.geometry || null,
    };
    setDayTravel(dateKey, travelData);
    return travelData;
  } catch (error) {
    console.error('Routing request failed', error);
    setDayTravel(
      dateKey,
      {
        status: 'error',
        provider,
        profile,
        signature,
        error: error?.message || 'Routing request failed',
        fetchedAt: Date.now(),
        skipped,
      },
      { persist: false }
    );
    return null;
  }
}

function getRoutingApiKey({ interactive = false } = {}) {
  const current = planState.config.routing?.openRouteApiKey;
  if (current && typeof current === 'string' && current.trim()) {
    return current.trim();
  }
  if (!interactive || routingKeyPromptActive) {
    return null;
  }

  routingKeyPromptActive = true;
  try {
    const input = window.prompt('Enter your OpenRouteService API key to enable travel time calculations');
    if (!input) {
      return null;
    }
    const normalized = input.trim();
    if (!normalized) {
      return null;
    }
    const nextRouting = { ...(planState.config.routing || {}), openRouteApiKey: normalized };
    planState.config.routing = nextRouting;
    persistState();
    return normalized;
  } finally {
    routingKeyPromptActive = false;
  }
}

async function requestOpenRouteRoute(points, apiKey, profile = 'driving-car') {
  const coordinates = points.map((coord) => {
    if (!Array.isArray(coord) || coord.length !== 2) {
      throw new Error('Invalid coordinate provided to routing request.');
    }
    const [lat, lon] = coord;
    return [Number(lon), Number(lat)];
  });

  const response = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ coordinates }),
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error?.message) {
        message = errorBody.error.message;
      }
    } catch (parseError) {
      const text = await response.text();
      if (text) {
        message = text.slice(0, 200);
      }
    }
    throw new Error(message || 'Routing request failed.');
  }

  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature) {
    throw new Error('No route found for the selected stops.');
  }
  return {
    geometry: feature.geometry,
    summary: feature.properties?.summary || {},
  };
}

function updateMapSummary(dateKey) {
  if (!mapSummaryEl) return;
  const day = ensureDay(dateKey);
  const travel = day.travel;
  const skippedCount = Array.isArray(travel?.skipped) ? travel.skipped.length : 0;

  let message = '';
  if (!day.stay) {
    message = 'Pick a stay with map coordinates to calculate travel time.';
  } else if (!travel) {
    message = 'Travel time will be calculated shortly.';
  } else if (travel.status === 'pending') {
    message = 'Calculating travel time…';
  } else if (travel.status === 'ready') {
    const durationText = formatDuration(Number(travel.durationSeconds));
    const distanceText = formatDistance(Number(travel.distanceMeters));
    const parts = [];
    if (durationText) parts.push(`Total travel time: ${durationText}`);
    if (distanceText) parts.push(`Distance: ${distanceText}`);
    if (skippedCount) {
      parts.push(`${skippedCount} stop${skippedCount === 1 ? '' : 's'} missing map pins`);
    }
    message = parts.join(' · ') || 'Route ready.';
  } else if (travel.status === 'missing-key') {
    message = 'Add your OpenRouteService API key to calculate travel time.';
  } else if (travel.status === 'missing-stay') {
    message = 'Pick a stay with map coordinates to calculate travel time.';
  } else if (travel.status === 'no-activities') {
    message = skippedCount
      ? `${skippedCount} stop${skippedCount === 1 ? '' : 's'} missing map pins.`
      : 'No mapped stops scheduled for this day.';
  } else if (travel.status === 'insufficient-data') {
    message = 'Add coordinates for all stops to calculate travel time.';
  } else if (travel.status === 'error') {
    message = `Unable to calculate travel time. ${travel.error || ''}`.trim();
  } else {
    message = 'Travel time is not available for this day.';
  }

  mapSummaryEl.textContent = message;
}

function renderMapMarkers(dateKey) {
  if (!mapInstance || !mapMarkersLayer) return;
  mapMarkersLayer.clearLayers();
  clearMapRoute();

  const day = ensureDay(dateKey);
  const itinerary = buildItineraryForDay(day);
  const bounds = window.L.latLngBounds([]);

  if (itinerary.stay) {
    const stayMarker = window.L.circleMarker(itinerary.stay.coords, {
      radius: 8,
      color: '#2563eb',
      fillColor: '#2563eb',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(mapMarkersLayer);
    stayMarker.bindPopup(`Stay: ${itinerary.stay.label}`);
    bounds.extend(itinerary.stay.coords);
  }

  itinerary.activities.forEach((activity, index) => {
    const marker = window.L.marker(activity.coords, { riseOnHover: true }).addTo(mapMarkersLayer);
    marker.bindPopup(`${index + 1}. ${activity.label}`);
    bounds.extend(activity.coords);
  });

  if (bounds.isValid()) {
    mapInstance.fitBounds(bounds, { padding: [32, 32] });
  } else if (planState.config.mapDefaults?.center) {
    mapInstance.setView(planState.config.mapDefaults.center, planState.config.mapDefaults.zoom || 5);
  } else {
    mapInstance.setView([20, 0], 2);
  }
}

function renderMapRoute(dateKey) {
  if (!mapInstance || activeMapDate !== dateKey) {
    return;
  }
  clearMapRoute();
  const day = ensureDay(dateKey);
  const travel = day.travel;
  if (!travel || travel.status !== 'ready' || !travel.geometry) {
    return;
  }
  mapRouteLayer = window.L.geoJSON(travel.geometry, {
    style: { color: '#2563eb', weight: 4, opacity: 0.85 },
  }).addTo(mapInstance);
  try {
    const bounds = mapRouteLayer.getBounds();
    if (bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: [48, 48] });
    }
  } catch (error) {
    console.warn('Unable to fit map to route', error);
  }
}

function clearMapRoute() {
  if (mapRouteLayer && mapInstance) {
    mapInstance.removeLayer(mapRouteLayer);
  }
  mapRouteLayer = null;
}

function renderCalendar() {
  calendarEl.innerHTML = '';
  dateSequence.forEach((dateKey) => {
    const card = renderDayCard(dateKey);
    calendarEl.appendChild(card);
  });
  applyFilters();
  updateEditButton();
}

function renderTravelChip(dateKey, plan) {
  const chip = document.createElement('span');
  chip.className = 'theme-chip theme-chip--travel';
  chip.dataset.travelDate = dateKey;
  applyTravelChipState(chip, plan);
  return chip;
}

function renderDayCard(dateKey) {
  const plan = ensureDay(dateKey);
  const card = document.createElement('article');
  card.className = 'day-card';
  card.dataset.date = dateKey;
  card.dataset.location = plan.loc;
  card.draggable = editing;

  const stripe = document.createElement('span');
  stripe.className = 'day-card__stripe';
  stripe.style.background = planState.config.locations[plan.loc]?.color || '#d1d5db';
  card.appendChild(stripe);

  const header = document.createElement('div');
  header.className = 'day-card__header';

  const dateBox = document.createElement('div');
  dateBox.className = 'day-card__date';
  const date = new Date(`${dateKey}T00:00:00`);
  const dayNumber = document.createElement('span');
  dayNumber.className = 'day-card__day-number';
  dayNumber.textContent = String(date.getDate());
  const dateText = document.createElement('div');
  dateText.className = 'day-card__date-text';
  const monthText = document.createElement('span');
  monthText.textContent = date.toLocaleDateString(undefined, { month: 'short' });
  const weekdayText = document.createElement('span');
  weekdayText.textContent = date.toLocaleDateString(undefined, { weekday: 'short' });
  dateText.append(monthText, weekdayText);
  dateBox.append(dayNumber, dateText);

  header.appendChild(dateBox);

  const badges = document.createElement('div');
  badges.className = 'day-card__badges';

  const locationLabel = getLocationLabel(plan.loc);
  const locationChip = document.createElement(editing ? 'button' : 'span');
  locationChip.className = editing ? 'theme-chip theme-chip--link' : 'theme-chip';
  locationChip.textContent = locationLabel;
  if (editing) {
    locationChip.type = 'button';
    locationChip.addEventListener('click', () => editLocation(dateKey));
  }
  badges.appendChild(locationChip);

  const themeLabel = plan.theme || getDefaultTheme(plan.loc) || '';
  const themeChip = document.createElement(editing ? 'button' : 'span');
  themeChip.className = editing ? 'theme-chip theme-chip--link' : 'theme-chip';
  themeChip.textContent = themeLabel || 'Set theme';
  if (editing) {
    themeChip.type = 'button';
    themeChip.addEventListener('click', () => editTheme(dateKey));
  }
  badges.appendChild(themeChip);

  const stayButton = document.createElement('button');
  stayButton.type = 'button';
  stayButton.className = 'theme-chip theme-chip--link';
  stayButton.textContent = plan.stay ? getStayLabel(plan.stay) : 'Pick stay';
  stayButton.addEventListener('click', () => openSheet(dateKey, 'stay'));
  badges.appendChild(stayButton);

  const mapButton = document.createElement('button');
  mapButton.type = 'button';
  mapButton.className = 'theme-chip theme-chip--map';
  mapButton.textContent = 'Map';
  mapButton.addEventListener('click', () => openMap(dateKey));
  badges.appendChild(mapButton);

  const travelChip = renderTravelChip(dateKey, plan);
  badges.appendChild(travelChip);

  header.appendChild(badges);
  card.appendChild(header);

  const slotsWrap = document.createElement('div');
  slotsWrap.className = 'slots';
  ['morning', 'afternoon', 'evening'].forEach((slotName) => {
    const slotSection = document.createElement('section');
    slotSection.className = 'slot';
    slotSection.dataset.slot = slotName;
    slotSection.dataset.date = dateKey;

    const slotHeader = document.createElement('div');
    slotHeader.className = 'slot__header';
    const slotTitle = document.createElement('span');
    slotTitle.className = 'slot__title';
    slotTitle.textContent = slotName.toUpperCase();
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn slot__add';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => openSheet(dateKey, 'activity', slotName));
    slotHeader.append(slotTitle, addBtn);
    slotSection.appendChild(slotHeader);

    const items = plan.slots?.[slotName] || [];
    items.forEach((itemId, index) => {
      const chip = renderChip(dateKey, slotName, itemId, index);
      slotSection.appendChild(chip);
    });

    slotSection.addEventListener('dragover', handleSlotDragOver);
    slotSection.addEventListener('dragleave', handleSlotDragLeave);
    slotSection.addEventListener('drop', handleSlotDrop);

    slotsWrap.appendChild(slotSection);
  });
  card.appendChild(slotsWrap);

  const friendRow = document.createElement('div');
  friendRow.className = 'day-card__friends';
  planState.config.friends.forEach((friend) => {
    const isActive = plan.friends.includes(friend);
    const friendBtn = document.createElement('button');
    friendBtn.type = 'button';
    friendBtn.className = 'friend-chip' + (isActive ? ' friend-chip--on' : '');
    friendBtn.dataset.friend = friend;
    friendBtn.textContent = isActive ? friend : `+ ${friend}`;
    if (isActive) {
      const color = planState.config.friendColors?.[friend];
      if (color) {
        friendBtn.style.background = color;
      }
    } else {
      friendBtn.style.background = '';
    }
    friendBtn.addEventListener('click', () => toggleFriend(dateKey, friend));
    friendRow.appendChild(friendBtn);
  });
  card.appendChild(friendRow);

  card.addEventListener('dragstart', handleCardDragStart);
  card.addEventListener('dragend', () => {
    cardDragSource = null;
  });
  card.addEventListener('dragover', (event) => {
    if (!editing) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  card.addEventListener('drop', handleCardDrop);

  scheduleTravelCalculation(dateKey, { interactive: false });

  return card;
}

function renderChip(dateKey, slotName, itemId, index) {
  const chip = document.createElement('span');
  chip.className = 'chiplet';
  chip.dataset.date = dateKey;
  chip.dataset.slot = slotName;
  chip.dataset.index = String(index);
  chip.dataset.id = itemId;

  const label = getActivityLabel(itemId);
  const content = buildChipContent(label);
  chip.appendChild(content);

  const locked = isChipLocked(dateKey, itemId);
  if (locked) {
    chip.classList.add('locked');
  }

  chip.draggable = editing && !locked;
  if (chip.draggable) {
    chip.addEventListener('dragstart', handleChipDragStart);
    chip.addEventListener('dragend', handleChipDragEnd);
  }

  if (editing) {
    const actions = document.createElement('span');
    actions.className = 'chiplet__actions';

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'chiplet__btn';
    lockBtn.title = locked ? 'Unlock' : 'Lock';
    lockBtn.textContent = locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleLock(dateKey, itemId);
    });
    actions.appendChild(lockBtn);

    if (!locked) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'chiplet__btn';
      removeBtn.title = 'Remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        removeChip(dateKey, slotName, index);
      });
      actions.appendChild(removeBtn);
    }

    chip.appendChild(actions);
  }

  return chip;
}

function buildChipContent(label) {
  const fragment = document.createDocumentFragment();
  const match = /^([0-2]?\d:[0-5]\d)\s+(.*)$/.exec(label);
  if (match) {
    const time = document.createElement('span');
    time.className = 'chiplet__time';
    time.textContent = match[1];
    fragment.appendChild(time);
    fragment.appendChild(document.createTextNode(` ${match[2]}`));
  } else {
    fragment.appendChild(document.createTextNode(label));
  }
  return fragment;
}

function isChipLocked(dateKey, itemId) {
  const day = ensureDay(dateKey);
  const override = day.locks?.[itemId];
  if (override === 1) return true;
  if (override === 0) return false;
  const activity = ACTIVITY_MAP.get(itemId);
  return Boolean(activity?.locked);
}

function toggleLock(dateKey, itemId) {
  const day = ensureDay(dateKey);
  if (!day.locks) day.locks = {};
  const currentlyLocked = isChipLocked(dateKey, itemId);
  if (currentlyLocked) {
    day.locks[itemId] = 0;
  } else {
    day.locks[itemId] = 1;
  }
  persistState();
  updateDayCard(dateKey);
}

function removeChip(dateKey, slotName, index) {
  const day = ensureDay(dateKey);
  const list = day.slots?.[slotName];
  if (!Array.isArray(list)) return;
  const itemId = list[index];
  if (isChipLocked(dateKey, itemId)) return;
  list.splice(index, 1);
  invalidateTravel(dateKey, { persist: false, updateCard: false });
  persistState();
  updateDayCard(dateKey);
}

function handleChipDragStart(event) {
  const chip = event.currentTarget;
  chipDragData = {
    date: chip.dataset.date,
    slot: chip.dataset.slot,
    index: Number(chip.dataset.index),
    id: chip.dataset.id,
  };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'chip', id: chip.dataset.id }));
}

function handleChipDragEnd() {
  chipDragData = null;
  document.querySelectorAll('.slot').forEach((slot) => {
    slot.removeAttribute('data-drop-hover');
    clearSlotDropIndicator(slot);
  });
}

function computeSlotDropIndex(slotElement, event) {
  const chips = Array.from(slotElement.querySelectorAll('.chiplet'));
  if (!chips.length) {
    return { index: 0 };
  }
  const pointerY = event.clientY ?? event.pageY ?? 0;
  for (let i = 0; i < chips.length; i += 1) {
    const rect = chips[i].getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) {
      return { index: i };
    }
  }
  return { index: chips.length };
}

function updateSlotDropIndicator(slotElement, index) {
  clearSlotDropIndicator(slotElement);
  const chips = Array.from(slotElement.querySelectorAll('.chiplet'));
  if (!chips.length) return;
  if (index <= 0) {
    chips[0].dataset.dropIndicator = 'before';
  } else if (index >= chips.length) {
    chips[chips.length - 1].dataset.dropIndicator = 'after';
  } else {
    chips[index].dataset.dropIndicator = 'before';
  }
}

function clearSlotDropIndicator(slotElement) {
  if (!slotElement) return;
  slotElement
    .querySelectorAll('.chiplet[data-drop-indicator]')
    .forEach((chip) => chip.removeAttribute('data-drop-indicator'));
}

function handleSlotDragOver(event) {
  if (!editing || !chipDragData) return;
  event.preventDefault();
  const slotElement = event.currentTarget;
  slotElement.dataset.dropHover = 'true';
  const { index } = computeSlotDropIndex(slotElement, event);
  updateSlotDropIndicator(slotElement, index);
  event.dataTransfer.dropEffect = 'move';
}

function handleSlotDragLeave(event) {
  if (!editing || !chipDragData) return;
  const slotElement = event.currentTarget;
  const nextTarget = event.relatedTarget;
  if (nextTarget && slotElement.contains(nextTarget)) {
    return;
  }
  slotElement.removeAttribute('data-drop-hover');
  clearSlotDropIndicator(slotElement);
}

function handleSlotDrop(event) {
  const slotElement = event.currentTarget;
  slotElement.removeAttribute('data-drop-hover');
  clearSlotDropIndicator(slotElement);
  if (!editing || !chipDragData) return;
  event.preventDefault();
  const { index: targetIndex } = computeSlotDropIndex(slotElement, event);
  const targetDate = slotElement.dataset.date;
  const targetSlot = slotElement.dataset.slot;
  moveChip(chipDragData, targetDate, targetSlot, targetIndex);
  chipDragData = null;
}

function moveChip(dragData, targetDate, targetSlot, targetIndex) {
  const { date: sourceDate, slot: sourceSlot, index, id } = dragData;
  if (!id) return;
  const sourceDay = ensureDay(sourceDate);
  const targetDay = ensureDay(targetDate);
  if (isChipLocked(sourceDate, id)) return;

  const sourceList = sourceDay.slots?.[sourceSlot];
  if (!Array.isArray(sourceList)) return;
  targetDay.slots[targetSlot] = targetDay.slots[targetSlot] || [];
  const targetList = targetDay.slots[targetSlot];
  const [removed] = sourceList.splice(index, 1);
  if (removed !== id) {
    const fallbackIndex = sourceList.indexOf(id);
    if (fallbackIndex >= 0) {
      sourceList.splice(fallbackIndex, 1);
    }
  }

  let insertIndex = Number.isInteger(targetIndex) ? targetIndex : targetList.length;
  if (sourceDate === targetDate && sourceSlot === targetSlot && index < insertIndex) {
    insertIndex -= 1;
  }
  insertIndex = Math.max(0, Math.min(insertIndex, targetList.length));
  targetList.splice(insertIndex, 0, id);
  invalidateTravel(sourceDate, { persist: false, updateCard: false });
  if (sourceDate !== targetDate) {
    invalidateTravel(targetDate, { persist: false, updateCard: false });
  }
  persistState();
  updateDayCard(sourceDate);
  if (sourceDate !== targetDate) {
    updateDayCard(targetDate);
  }
}

function handleCardDragStart(event) {
  if (!editing) {
    event.preventDefault();
    return;
  }
  cardDragSource = event.currentTarget.dataset.date;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', 'day-card');
}

function handleCardDrop(event) {
  if (!editing) return;
  event.preventDefault();
  const targetDate = event.currentTarget.dataset.date;
  if (!cardDragSource || !targetDate || cardDragSource === targetDate) return;
  const sourcePlan = planState.days[cardDragSource];
  planState.days[cardDragSource] = planState.days[targetDate];
  planState.days[targetDate] = sourcePlan;
  persistState();
  renderCalendar();
  cardDragSource = null;
}

function updateDayCard(dateKey) {
  const existing = calendarEl.querySelector(`.day-card[data-date="${dateKey}"]`);
  if (!existing) return;
  const replacement = renderDayCard(dateKey);
  const parent = existing.parentNode;
  if (parent) {
    parent.replaceChild(replacement, existing);
  } else {
    calendarEl.appendChild(replacement);
  }
  applyFilters();
}

function toggleFriend(dateKey, friend) {
  const day = ensureDay(dateKey);
  const index = day.friends.indexOf(friend);
  if (index >= 0) {
    day.friends.splice(index, 1);
  } else {
    day.friends.push(friend);
  }
  persistState();
  updateDayCard(dateKey);
}

function editTheme(dateKey) {
  if (!editing) return;
  const day = ensureDay(dateKey);
  const current = day.theme || '';
  const next = window.prompt('Update theme for this day', current);
  if (next === null) return;
  day.theme = next.trim();
  persistState();
  updateDayCard(dateKey);
}

function addActivity(dateKey, slotName, activityId) {
  const day = ensureDay(dateKey);
  day.slots[slotName] = day.slots[slotName] || [];
  day.slots[slotName].push(activityId);
  invalidateTravel(dateKey, { persist: false, updateCard: false });
  persistState();
  updateDayCard(dateKey);
}

function setStay(dateKey, stayId) {
  const day = ensureDay(dateKey);
  day.stay = stayId;
  invalidateTravel(dateKey, { persist: false, updateCard: false });
  persistState();
  updateDayCard(dateKey);
  if (sheetState.open && sheetState.tab === 'stay') {
    renderSheet();
  }
}

function openSheet(dateKey, tab = 'activity', slot = 'morning') {
  sheetState = { open: true, day: dateKey, tab, slot };
  sheetEl.classList.add('sheet--open');
  sheetEl.setAttribute('aria-hidden', 'false');
  sheetBackdrop.classList.add('is-visible');
  document.body.classList.add('sheet-open');
  renderSheet();
}

function closeSheet() {
  sheetState.open = false;
  sheetEl.classList.remove('sheet--open');
  sheetEl.setAttribute('aria-hidden', 'true');
  sheetBackdrop.classList.remove('is-visible');
  document.body.classList.remove('sheet-open');
}

function renderSheet() {
  if (!sheetState.open) return;
  const { day, tab, slot } = sheetState;
  const dayLabel = formatLongDate(day);
  sheetTitle.textContent = dayLabel;
  if (tab === 'activity') {
    sheetSubtitle.textContent = `${slot.toUpperCase()} SLOT`;
  } else if (tab === 'stay') {
    sheetSubtitle.textContent = 'Choose stay';
  } else {
    sheetSubtitle.textContent = 'Bookings & tickets';
  }

  sheetBody.innerHTML = '';
  sheetEl.querySelectorAll('.tab').forEach((tabBtn) => {
    tabBtn.setAttribute('aria-selected', tabBtn.dataset.tab === tab ? 'true' : 'false');
  });

  const locationOrder = planState.config.locationOrder;
  const catalog = planState.config.catalog;

  if (tab === 'activity') {
    let hasOptions = false;
    locationOrder.forEach((loc) => {
      const options = catalog.activity.filter((item) => item.city === loc);
      if (!options.length) return;
      hasOptions = true;
      sheetBody.appendChild(
        renderSheetGroup(loc, options, (item) => {
          addActivity(day, slot, item.id);
        })
      );
    });
    if (!hasOptions) {
      sheetBody.appendChild(renderEmptyState('No saved activities yet. Add one below.'));
    }
    sheetBody.appendChild(renderCustomCreator('activity', day, slot));
  } else if (tab === 'stay') {
    const dayPlan = ensureDay(day);
    let hasOptions = false;
    locationOrder.forEach((loc) => {
      const options = catalog.stay.filter((item) => item.city === loc);
      if (!options.length) return;
      hasOptions = true;
      sheetBody.appendChild(
        renderSheetGroup(
          loc,
          options,
          (item) => {
            setStay(day, item.id);
          },
          dayPlan.stay
        )
      );
    });
    if (!hasOptions) {
      sheetBody.appendChild(renderEmptyState('No stays saved yet. Add one below.'));
    }
    sheetBody.appendChild(renderCustomCreator('stay', day));
  } else if (tab === 'booking') {
    let hasOptions = false;
    locationOrder.forEach((loc) => {
      const options = catalog.booking.filter((item) => item.city === loc);
      if (!options.length) return;
      hasOptions = true;
      sheetBody.appendChild(
        renderSheetGroup(loc, options, (item) => {
          if (item.url) {
            window.open(item.url, '_blank', 'noopener');
          }
        })
      );
    });
    if (!hasOptions) {
      sheetBody.appendChild(renderEmptyState('No bookings saved yet. Add one below.'));
    }
    sheetBody.appendChild(renderCustomCreator('booking'));
  }
}

function renderSheetGroup(locationId, items, onSelect, selectedId) {
  const group = document.createElement('section');
  group.className = 'sheet-group';

  const header = document.createElement('div');
  header.className = 'sheet-group__header';
  const swatch = document.createElement('span');
  swatch.className = 'sheet-group__swatch';
  swatch.style.background = planState.config.locations[locationId]?.color || '#d1d5db';
  const title = document.createElement('span');
  title.textContent = getLocationLabel(locationId);
  header.append(swatch, title);
  group.appendChild(header);

  const list = document.createElement('div');
  list.className = 'sheet-group__list';
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sheet-card';
    if (selectedId && item.id === selectedId) {
      button.classList.add('sheet-card--selected');
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    button.appendChild(label);
    if (selectedId && item.id === selectedId) {
      const meta = document.createElement('span');
      meta.className = 'sheet-card__meta';
      meta.textContent = 'Selected';
      button.appendChild(meta);
    }
    button.addEventListener('click', () => onSelect(item));
    list.appendChild(button);
  });
  group.appendChild(list);
  return group;
}

function renderEmptyState(message) {
  const note = document.createElement('p');
  note.className = 'empty-state';
  note.textContent = message;
  return note;
}

function renderCustomCreator(tab, dayKey, slotName) {
  const section = document.createElement('section');
  section.className = 'sheet-custom';

  const title = document.createElement('p');
  title.className = 'sheet-custom__title';
  const text = document.createElement('p');
  text.className = 'sheet-custom__text';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn sheet-custom__btn';

  if (tab === 'activity') {
    title.textContent = 'Add custom activity';
    text.textContent = 'Create a one-off activity and drop it into this time slot.';
    button.textContent = 'Add activity';
    button.addEventListener('click', () => handleCustomActivity(dayKey, slotName));
  } else if (tab === 'stay') {
    title.textContent = 'Add custom stay';
    text.textContent = 'Track a stay even if it is not already in your catalog.';
    button.textContent = 'Add stay';
    button.addEventListener('click', () => handleCustomStay(dayKey));
  } else {
    title.textContent = 'Add custom booking';
    text.textContent = 'Save a booking or ticket link for quick access later.';
    button.textContent = 'Add booking';
    button.addEventListener('click', handleCustomBooking);
  }

  section.append(title, text, button);
  return section;
}

function attachToolbarEvents() {
  editBtn?.addEventListener('click', () => {
    editing = !editing;
    updateEditButton();
    renderCalendar();
  });

  settingsBtn?.addEventListener('click', openTripSettings);
  newTripBtn?.addEventListener('click', startNewTrip);
  icsBtn?.addEventListener('click', exportIcs);

  sheetBackdrop.addEventListener('click', () => {
    if (sheetState.open) closeSheet();
  });
  closeSheetBtn?.addEventListener('click', closeSheet);

  document.querySelectorAll('.sheet__tabs .tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      if (!sheetState.open) return;
      sheetState.tab = tabBtn.dataset.tab;
      renderSheet();
    });
  });

  closeMapBtn?.addEventListener('click', closeMap);
  mapOverlay.addEventListener('click', (event) => {
    if (event.target === mapOverlay) {
      closeMap();
    }
  });

  allFilterBtn?.addEventListener('click', () => {
    filterState = { friend: null, location: null };
    applyFilters();
    updateFilterChips();
  });
}

function attachGlobalShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (sheetState.open) closeSheet();
      if (mapOverlay.classList.contains('is-open')) closeMap();
    }
  });
}

function applyFilters() {
  const cards = calendarEl.querySelectorAll('.day-card');
  cards.forEach((card) => {
    const dateKey = card.dataset.date;
    const plan = ensureDay(dateKey);
    const matchesFriend = !filterState.friend || plan.friends.includes(filterState.friend);
    const matchesLocation = !filterState.location || plan.loc === filterState.location;
    card.style.display = matchesFriend && matchesLocation ? '' : 'none';
  });
}

function updateFilterChips() {
  document.querySelectorAll('.chip[data-friend]').forEach((chip) => {
    chip.setAttribute('aria-pressed', chip.dataset.friend === filterState.friend ? 'true' : 'false');
  });
  document.querySelectorAll('.chip[data-location]').forEach((chip) => {
    chip.setAttribute('aria-pressed', chip.dataset.location === filterState.location ? 'true' : 'false');
  });
  const allOn = !filterState.friend && !filterState.location;
  allFilterBtn?.setAttribute('aria-pressed', allOn ? 'true' : 'false');
  applyFilterChipStyles();
}

function updateEditButton() {
  if (editBtn) {
    editBtn.textContent = editing ? 'Done' : 'Edit plan';
  }
}

function getLocationLabel(id) {
  return planState.config.locations[id]?.label || id;
}

function getDefaultTheme(locationId) {
  return planState.config.defaultThemes?.[locationId] || '';
}

function getActivityLabel(id) {
  return ACTIVITY_MAP.get(id)?.label || id;
}

function getStayLabel(id) {
  return STAY_MAP.get(id)?.label || id;
}

function formatLongDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday}, ${month} ${date.getDate()}`;
}

function openMap(dateKey) {
  const plan = ensureDay(dateKey);
  activeMapDate = dateKey;
  mapOverlay.classList.add('is-open');
  mapOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('map-open');
  const mapTitle = document.getElementById('mapTitle');
  mapTitle.textContent = `${formatLongDate(dateKey)} — ${plan.theme || getDefaultTheme(plan.loc) || ''}`;
  updateMapSummary(dateKey);

  setTimeout(() => {
    if (!mapInstance) {
      mapInstance = window.L.map('map');
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapInstance);
      mapMarkersLayer = window.L.layerGroup().addTo(mapInstance);
    }
    mapInstance.invalidateSize();
    renderMapMarkers(dateKey);
    renderMapRoute(dateKey);
  }, 50);

  scheduleTravelCalculation(dateKey, { interactive: true }).finally(() => {
    if (activeMapDate === dateKey) {
      updateMapSummary(dateKey);
      renderMapRoute(dateKey);
    }
  });
}

function closeMap() {
  mapOverlay.classList.remove('is-open');
  mapOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('map-open');
  activeMapDate = null;
  clearMapRoute();
  if (mapMarkersLayer) {
    mapMarkersLayer.clearLayers();
  }
  if (mapSummaryEl) {
    mapSummaryEl.textContent = '';
  }
}

function exportIcs() {
  const now = new Date();
  const dtstamp = formatIcsDateTime(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Canvas6 Trip Planner//EN',
    ...ICS_VTIMEZONE_BLOCK
  ];

  dateSequence.forEach((dateKey) => {
    const day = ensureDay(dateKey);
    const dateValue = dateKey.replace(/-/g, '');
    const summaryDate = formatSummaryDate(dateKey);
    const title = day.theme || getDefaultTheme(day.loc) || 'Trip day';
    const slotDescriptions = [];
    const slotTitles = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
    ['morning', 'afternoon', 'evening'].forEach((slot) => {
      const labels = (day.slots[slot] || []).map(getActivityLabel).filter(Boolean);
      if (labels.length) {
        slotDescriptions.push(`${slotTitles[slot]}: ${labels.join(' • ')}`);
      }
    });
    if (day.stay) {
      slotDescriptions.push(`Stay: ${getStayLabel(day.stay)}`);
    }
    if (day.friends?.length) {
      slotDescriptions.push(`Friends: ${day.friends.join(', ')}`);
    }
    const description = slotDescriptions.join(' / ');
    const locationLabel = getLocationLabel(day.loc);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${dateKey}@canvas6`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`SUMMARY:${escapeIcsText(`${summaryDate} — ${title}`)}`);
    lines.push(`DTSTART;TZID=${ICS_TIMEZONE_ID}:${dateValue}T090000`);
    lines.push(`DTEND;TZID=${ICS_TIMEZONE_ID}:${dateValue}T210000`);
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push(`LOCATION:${escapeIcsText(locationLabel)}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const fileName = `${slugify(planState.config.tripName || 'trip-planner', 'trip-planner')}.ics`;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function handleCustomActivity(dayKey, slotName) {
  if (!dayKey || !slotName) return;
  const labelInput = window.prompt('Describe the activity');
  if (!labelInput) return;
  const day = ensureDay(dayKey);
  let locationId = day.loc;
  if (planState.config.locationOrder.length > 1) {
    const options = planState.config.locationOrder.map(getLocationLabel).join(', ');
    const response = window.prompt(`Which location should this activity belong to? (${options})`, getLocationLabel(locationId));
    if (response === null) return;
    locationId = resolveLocationId(response, locationId);
  }
  const activityId = generateCustomId('activity');
  planState.config.catalog.activity.push({ id: activityId, city: locationId, label: labelInput.trim() });
  refreshCatalogLookups();
  addActivity(dayKey, slotName, activityId);
  renderSheet();
}

function handleCustomStay(dayKey) {
  if (!dayKey) return;
  const labelInput = window.prompt('Stay name');
  if (!labelInput) return;
  const urlInput = window.prompt('Link (optional)');
  const day = ensureDay(dayKey);
  let locationId = day.loc;
  if (planState.config.locationOrder.length > 1) {
    const options = planState.config.locationOrder.map(getLocationLabel).join(', ');
    const response = window.prompt(`Which location is this stay in? (${options})`, getLocationLabel(locationId));
    if (response === null) return;
    locationId = resolveLocationId(response, locationId);
  }
  const stayId = generateCustomId('stay');
  const payload = { id: stayId, city: locationId, label: labelInput.trim() };
  if (urlInput && urlInput.trim()) {
    payload.url = urlInput.trim();
  }
  planState.config.catalog.stay.push(payload);
  refreshCatalogLookups();
  setStay(dayKey, stayId);
}

function handleCustomBooking() {
  const labelInput = window.prompt('Booking or ticket name');
  if (!labelInput) return;
  const urlInput = window.prompt('Link (optional)');
  let locationId = planState.config.locationOrder[0];
  if (planState.config.locationOrder.length > 1) {
    const options = planState.config.locationOrder.map(getLocationLabel).join(', ');
    const response = window.prompt(`Which location should this booking be grouped under? (${options})`, getLocationLabel(locationId));
    if (response === null) return;
    locationId = resolveLocationId(response, locationId);
  }
  const bookingId = generateCustomId('booking');
  const payload = { id: bookingId, city: locationId, label: labelInput.trim() };
  if (urlInput && urlInput.trim()) {
    payload.url = urlInput.trim();
  }
  planState.config.catalog.booking.push(payload);
  refreshCatalogLookups();
  persistState();
  renderSheet();
}

function startNewTrip() {
  const today = new Date().toISOString().slice(0, 10);
  const details = promptTripDetails({
    name: 'New trip',
    start: today,
    end: today,
    friends: '',
    locations: '',
  });
  if (!details) return;
  applyTripDetails(details, { resetDays: true });
  closeSheet();
  closeMap();
}

function openTripSettings() {
  const current = planState.config;
  const details = promptTripDetails({
    name: current.tripName,
    start: current.range.start,
    end: current.range.end,
    friends: current.friends.join(', '),
    locations: current.locationOrder.map((id) => getLocationLabel(id)).join(', '),
  });
  if (!details) return;
  applyTripDetails(details, { resetDays: false });
}

function promptTripDetails(initial) {
  const nameInput = window.prompt('Trip name', initial.name || '');
  if (nameInput === null) return null;
  const startInput = window.prompt('Trip start date (YYYY-MM-DD)', initial.start || '');
  if (startInput === null) return null;
  if (!isValidDate(startInput)) {
    window.alert('Please enter a valid start date in the format YYYY-MM-DD.');
    return null;
  }
  const endInput = window.prompt('Trip end date (YYYY-MM-DD)', initial.end || startInput);
  if (endInput === null) return null;
  if (!isValidDate(endInput)) {
    window.alert('Please enter a valid end date in the format YYYY-MM-DD.');
    return null;
  }
  const startDate = new Date(`${startInput}T00:00:00`);
  const endDate = new Date(`${endInput}T00:00:00`);
  if (endDate < startDate) {
    window.alert('End date must be on or after the start date.');
    return null;
  }
  const friendsInput = window.prompt('Friends (comma separated, optional)', initial.friends || '');
  if (friendsInput === null) return null;
  const locationsInput = window.prompt('Locations or regions (comma separated)', initial.locations || '');
  if (locationsInput === null) return null;
  return {
    name: nameInput.trim() || 'Trip Planner',
    start: startInput,
    end: endInput,
    friends: parseList(friendsInput),
    locations: parseList(locationsInput),
  };
}

function applyTripDetails(details, { resetDays = false } = {}) {
  const previousConfig = resetDays ? null : planState.config;
  const locationData = buildLocationsFromList(details.locations, previousConfig);
  const friendColors = assignFriendColors(details.friends, previousConfig?.friendColors || {});
  const defaultThemes = buildDefaultThemes(locationData.order, locationData.locations, previousConfig?.defaultThemes || {});
  const fallbackLocation = locationData.order[0];
  const catalog = resetDays
    ? { activity: [], stay: [], booking: [] }
    : {
        activity: remapCatalogItems(previousConfig.catalog?.activity || [], fallbackLocation, locationData.locations),
        stay: remapCatalogItems(previousConfig.catalog?.stay || [], fallbackLocation, locationData.locations),
        booking: remapCatalogItems(previousConfig.catalog?.booking || [], fallbackLocation, locationData.locations),
      };

  const config = {
    tripName: details.name,
    range: { start: details.start, end: details.end },
    friends: details.friends,
    friendColors,
    locations: locationData.locations,
    locationOrder: locationData.order,
    defaultThemes,
    mapDefaults: resetDays ? null : previousConfig?.mapDefaults || null,
    mapCoordinates: resetDays ? {} : previousConfig?.mapCoordinates || {},
    routing: previousConfig?.routing
      ? { ...previousConfig.routing }
      : { provider: 'openrouteservice', openRouteApiKey: '' },
    catalog,
  };

  const newSequence = buildDateSequence(details.start, details.end);
  const newDays = {};
  if (resetDays) {
    newSequence.forEach((dateKey) => {
      newDays[dateKey] = createEmptyDay(config);
    });
  } else {
    const friendSet = new Set(details.friends);
    newSequence.forEach((dateKey) => {
      const existing = planState.days?.[dateKey];
      const cloned = cloneDay(existing, config);
      cloned.friends = cloned.friends.filter((friend) => friendSet.has(friend));
      if (!config.locations[cloned.loc]) {
        cloned.loc = getDefaultLocationId(config);
      }
      newDays[dateKey] = cloned;
    });
  }

  planState = { config, days: newDays };
  dateSequence = newSequence;
  filterState.friend = config.friends.includes(filterState.friend) ? filterState.friend : null;
  filterState.location = config.locations[filterState.location] ? filterState.location : null;
  refreshCatalogLookups();
  renderChrome();
  renderCalendar();
  applyFilters();
  updateFilterChips();
  closeSheet();
  closeMap();
  persistState();
}

function formatIcsDateTime(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatSummaryDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  return `${month} ${date.getDate()}`;
}

function resolveLocationId(input, fallback) {
  if (!input) return fallback;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return fallback;
  const byId = planState.config.locationOrder.find((id) => id.toLowerCase() === normalized);
  if (byId) return byId;
  const byLabel = planState.config.locationOrder.find((id) =>
    (planState.config.locations[id]?.label || '').toLowerCase() === normalized
  );
  return byLabel || fallback;
}

function generateCustomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function slugify(value, fallback = 'trip') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug || fallback;
}

function lightenColor(color, strength = 0.5) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const mix = (component) => Math.round(component + (255 - component) * strength);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

function hexToRgb(color) {
  if (!color || typeof color !== 'string') return null;
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { r, g, b };
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function parseList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isValidDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(timestamp);
}

