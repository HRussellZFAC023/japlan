import { STORAGE_KEY, DEFAULT_TRIP_TEMPLATE, COLOR_PALETTES } from "./data.js";

const calendarEl = document.getElementById("calendar");
const tripTitleEl = document.getElementById("tripTitle");
const friendFiltersEl = document.getElementById("friendFilters");
const locationFiltersEl = document.getElementById("locationFilters");
const locationLegendEl = document.getElementById("locationLegend");
const editBtn = document.querySelector('[data-action="toggle-edit"]');
const manageTripsBtn = document.querySelector('[data-action="manage-trips"]');
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
const configOverlay = document.getElementById("configOverlay");
const configContent = document.getElementById("configContent");
const configTitle = document.getElementById("configTitle");
const configSubtitle = document.getElementById("configSubtitle");
const closeConfigBtn = document.querySelector('[data-action="close-config"]');

let storageBucket = loadStorageBucket();
let activeTripId = storageBucket.activeTripId || null;
let planState = initializeState();
let dateSequence = buildDateSequence(
  planState.config.range.start,
  planState.config.range.end
);
let ACTIVITY_MAP = new Map();
let STAY_MAP = new Map();
refreshCatalogLookups();
let editing = false;
let filterState = { friend: null, location: null };
let sheetState = { open: false, day: null, slot: "morning", tab: "activity" };
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
  const title = planState.config.tripName || "Trip Planner";
  if (tripTitleEl) {
    tripTitleEl.textContent = title;
  }
  document.title = title;
}

function renderFilterChips() {
  if (
    filterState.friend &&
    !planState.config.friends.includes(filterState.friend)
  ) {
    filterState.friend = null;
  }
  if (
    filterState.location &&
    !planState.config.locations[filterState.location]
  ) {
    filterState.location = null;
  }

  if (friendFiltersEl) {
    friendFiltersEl.innerHTML = "";
    planState.config.friends.forEach((friend) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip chip--friend";
      chip.dataset.friend = friend;
      chip.textContent = friend;
      chip.addEventListener("click", () => {
        filterState.friend = filterState.friend === friend ? null : friend;
        applyFilters();
        updateFilterChips();
      });
      friendFiltersEl.appendChild(chip);
    });
  }

  if (locationFiltersEl) {
    locationFiltersEl.innerHTML = "";
    planState.config.locationOrder.forEach((loc) => {
      const meta = planState.config.locations[loc];
      if (!meta) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip chip--location";
      chip.dataset.location = loc;
      chip.textContent = meta.label || loc;
      chip.addEventListener("click", () => {
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
  locationLegendEl.innerHTML = "";
  planState.config.locationOrder.forEach((loc) => {
    const meta = planState.config.locations[loc];
    if (!meta) return;
    const item = document.createElement("div");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = meta.color || "#d1d5db";
    const label = document.createElement("span");
    label.textContent = meta.label || loc;
    item.append(swatch, label);
    locationLegendEl.appendChild(item);
  });
}

function applyFilterChipStyles() {
  document.querySelectorAll(".chip[data-friend]").forEach((chip) => {
    const friend = chip.dataset.friend;
    const active = chip.getAttribute("aria-pressed") === "true";
    if (active) {
      const color = planState.config.friendColors?.[friend];
      chip.style.background = color || "rgba(45, 58, 100, 0.08)";
    } else {
      chip.style.background = "";
    }
  });
  document.querySelectorAll(".chip[data-location]").forEach((chip) => {
    const loc = chip.dataset.location;
    const active = chip.getAttribute("aria-pressed") === "true";
    if (active) {
      const color = planState.config.locations[loc]?.color;
      chip.style.background = color
        ? lightenColor(color, 0.6)
        : "rgba(45, 58, 100, 0.08)";
    } else {
      chip.style.background = "";
    }
  });
}

function createEmptyDay(config = planState.config, locationId) {
  const targetLocation = locationId || getDefaultLocationId(config);
  return {
    loc: targetLocation,
    theme: "",
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
    theme: base.theme || "",
    friends: Array.isArray(base.friends) ? [...base.friends] : [],
    stay: base.stay || null,
    slots: {
      morning: Array.isArray(base.slots?.morning)
        ? [...base.slots.morning]
        : [],
      afternoon: Array.isArray(base.slots?.afternoon)
        ? [...base.slots.afternoon]
        : [],
      evening: Array.isArray(base.slots?.evening)
        ? [...base.slots.evening]
        : [],
    },
    locks: { ...(base.locks || {}) },
    travel: base.travel ? deepClone(base.travel) : null,
  };
}

function initializeState() {
  if (!storageBucket || typeof storageBucket !== "object") {
    storageBucket = createEmptyBucket();
  }
  if (
    !Array.isArray(storageBucket.order) ||
    !storageBucket.order.length ||
    !storageBucket.activeTripId ||
    !storageBucket.trips?.[storageBucket.activeTripId]
  ) {
    const { id, state } = createNewTripState(DEFAULT_TRIP_TEMPLATE);
    storageBucket.trips[id] = state;
    storageBucket.activeTripId = id;
    storageBucket.order = storageBucket.order?.includes(id)
      ? storageBucket.order
      : [id];
    saveStorageBucket(storageBucket);
  }
  activeTripId = storageBucket.activeTripId;
  const activeState = storageBucket.trips[activeTripId];
  const normalized =
    normalizeState(activeState) ||
    createStateFromTemplate(DEFAULT_TRIP_TEMPLATE);
  storageBucket.trips[activeTripId] = normalized;
  if (!storageBucket.order.includes(activeTripId)) {
    storageBucket.order.push(activeTripId);
  }
  return normalized;
}

function loadStorageBucket() {
  const bucket = createEmptyBucket();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return bucket;
    const parsed = JSON.parse(raw);
    if (parsed?.config && parsed?.days) {
      const legacyState = normalizeState(parsed);
      if (legacyState) {
        const legacyId = generateTripId();
        bucket.trips[legacyId] = legacyState;
        bucket.order.push(legacyId);
        bucket.activeTripId = legacyId;
        saveStorageBucket(bucket);
      }
      return bucket;
    }
    if (parsed?.trips) {
      const entries = Object.entries(parsed.trips);
      entries.forEach(([id, state]) => {
        const normalized = normalizeState(state);
        if (normalized) {
          bucket.trips[id] = normalized;
          if (!bucket.order.includes(id)) {
            bucket.order.push(id);
          }
        }
      });
      if (Array.isArray(parsed.order)) {
        const unique = parsed.order.filter((id) => bucket.trips[id]);
        const missing = bucket.order.filter((id) => !unique.includes(id));
        bucket.order = [...unique, ...missing];
      }
      const proposedActive = parsed.activeTripId;
      bucket.activeTripId = bucket.trips[proposedActive]
        ? proposedActive
        : bucket.order[0] || null;
      return bucket;
    }
  } catch (error) {
    console.warn("Unable to load stored trips, starting fresh.", error);
  }
  return bucket;
}

function createEmptyBucket() {
  return { version: 1, activeTripId: null, order: [], trips: {} };
}

function saveStorageBucket(bucket) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bucket));
  } catch (error) {
    console.warn("Unable to save trip library.", error);
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

function createNewTripState(template = DEFAULT_TRIP_TEMPLATE) {
  return { id: generateTripId(), state: createStateFromTemplate(template) };
}

function createConfigFromTemplate(template) {
  const locations = deepClone(template.locations || {});
  let locationOrder =
    Array.isArray(template.locationOrder) && template.locationOrder.length
      ? [...template.locationOrder]
      : Object.keys(locations);
  if (!locationOrder.length) {
    locations.general = { label: "General", color: "#1f2937" };
    locationOrder = ["general"];
  }
  const rangeStart =
    template.range?.start || new Date().toISOString().slice(0, 10);
  const rangeEnd = template.range?.end || rangeStart;
  const config = {
    tripName: template.tripName || "Trip Planner",
    range: { start: rangeStart, end: rangeEnd },
    friends: Array.isArray(template.friends)
      ? template.friends.filter(Boolean)
      : [],
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
      config.defaultThemes[loc] = config.locations[loc]?.label || "";
    }
  });
  return config;
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return null;
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
  const fallbackEnd =
    rawConfig.range?.end || rawConfig.range?.start || template.range.end;
  const locations = deepClone(rawConfig.locations || template.locations || {});
  let locationOrder =
    Array.isArray(rawConfig.locationOrder) && rawConfig.locationOrder.length
      ? [...rawConfig.locationOrder]
      : Object.keys(locations);
  if (!locationOrder.length) {
    locations.general = { label: "General", color: "#1f2937" };
    locationOrder = ["general"];
  }
  const friends = Array.isArray(rawConfig.friends)
    ? rawConfig.friends.filter(Boolean)
    : [];
  const config = {
    tripName: rawConfig.tripName || template.tripName || "Trip Planner",
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
      const label =
        config.locations[loc]?.label || template.defaultThemes?.[loc] || "";
      config.defaultThemes[loc] = label;
    }
  });
  return config;
}

function refreshCatalogLookups() {
  ACTIVITY_MAP = new Map(
    (planState.config.catalog.activity || []).map((item) => [item.id, item])
  );
  STAY_MAP = new Map(
    (planState.config.catalog.stay || []).map((item) => [item.id, item])
  );
}

function deepClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function assignFriendColors(friends, existing = {}) {
  const colors = { ...existing };
  let paletteIndex = 0;
  friends.forEach((friend) => {
    if (!colors[friend]) {
      colors[friend] =
        COLOR_PALETTES.friends[paletteIndex % COLOR_PALETTES.friends.length];
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

function getDefaultLocationId(config = planState.config) {
  return (
    config.locationOrder[0] ||
    Object.keys(config.locations || {})[0] ||
    "general"
  );
}

function persistState() {
  try {
    if (!storageBucket || typeof storageBucket !== "object") {
      storageBucket = createEmptyBucket();
    }
    if (!Array.isArray(storageBucket.order)) {
      storageBucket.order = [];
    }
    storageBucket.trips = storageBucket.trips || {};
    storageBucket.trips[activeTripId] = planState;
    storageBucket.activeTripId = activeTripId;
    if (!storageBucket.order.includes(activeTripId)) {
      storageBucket.order.push(activeTripId);
    }
    saveStorageBucket(storageBucket);
  } catch (error) {
    console.warn("Unable to save trip.", error);
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
  if (typeof day.stay === 'string') {
    const trimmedStay = day.stay.trim();
    day.stay = trimmedStay || null;
  } else {
    day.stay = day.stay || null;
  }
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
  const stayRef = day?.stay;
  if (!stayRef) return null;

  let stayId = null;
  let label = '';
  let coordRef = null;

  if (typeof stayRef === 'string') {
    stayId = stayRef.trim();
  } else if (typeof stayRef === 'object') {
    if (typeof stayRef.id === 'string' && stayRef.id.trim()) {
      stayId = stayRef.id.trim();
    }
    if (!label && typeof stayRef.label === 'string' && stayRef.label.trim()) {
      label = stayRef.label.trim();
    } else if (!label && typeof stayRef.name === 'string' && stayRef.name.trim()) {
      label = stayRef.name.trim();
    }
    coordRef = stayRef.coord || stayRef.coords || stayRef.location || null;
    if (!coordRef && Number.isFinite(stayRef.lat) && Number.isFinite(stayRef.lng)) {
      coordRef = [Number(stayRef.lat), Number(stayRef.lng)];
    } else if (!coordRef && Number.isFinite(stayRef.latitude) && Number.isFinite(stayRef.longitude)) {
      coordRef = [Number(stayRef.latitude), Number(stayRef.longitude)];
    }
  }

  const catalogStay = stayId ? STAY_MAP.get(stayId) : null;
  if (catalogStay) {
    if (!label) {
      label = catalogStay.label || catalogStay.id;
    }
    coordRef = coordRef ?? catalogStay.coord ?? null;
  } else if (!label && stayId) {
    label = stayId;
  }

  if (!coordRef && stayId && planState.config.mapCoordinates?.[stayId]) {
    coordRef = stayId;
  }

  const coords = getCoordinateValue(coordRef);

  return {
    id: stayId || null,
    label: label || stayId || 'Stay',
    coords: coords || null,
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

  if (!stay.coords) {
    skipped.unshift(stay.label || 'Stay location');
    return { status: 'insufficient-data', stay, activities, skipped, routePoints: [], signature: '' };
  }

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
        title: buildMissingPinsTitle(travel.skipped),
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

function buildMissingPinsTitle(skipped) {
  const names = Array.isArray(skipped)
    ? skipped
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter(Boolean)
    : [];
  if (!names.length) {
    return 'Add coordinates for all stops to calculate travel time.';
  }
  const preview = names.slice(0, 3).join(', ');
  const extra = names.length > 3 ? `, +${names.length - 3} more` : '';
  return `Missing pins: ${preview}${extra}. Add coordinates for all stops to calculate travel time.`;
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
    message = buildMissingPinsTitle(travel.skipped);
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

  if (itinerary.stay?.coords) {
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
  calendarEl.innerHTML = "";
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
  const card = document.createElement("article");
  card.className = "day-card";
  card.dataset.date = dateKey;
  card.dataset.location = plan.loc;
  card.draggable = editing;

  const stripe = document.createElement("span");
  stripe.className = "day-card__stripe";
  stripe.style.background =
    planState.config.locations[plan.loc]?.color || "#d1d5db";
  card.appendChild(stripe);

  const header = document.createElement("div");
  header.className = "day-card__header";

  const dateBox = document.createElement("div");
  dateBox.className = "day-card__date";
  const date = new Date(`${dateKey}T00:00:00`);
  const dayNumber = document.createElement("span");
  dayNumber.className = "day-card__day-number";
  dayNumber.textContent = String(date.getDate());
  const dateText = document.createElement("div");
  dateText.className = "day-card__date-text";
  const monthText = document.createElement("span");
  monthText.textContent = date.toLocaleDateString(undefined, {
    month: "short",
  });
  const weekdayText = document.createElement("span");
  weekdayText.textContent = date.toLocaleDateString(undefined, {
    weekday: "short",
  });
  dateText.append(monthText, weekdayText);
  dateBox.append(dayNumber, dateText);

  header.appendChild(dateBox);

  const badges = document.createElement("div");
  badges.className = "day-card__badges";

  if (editing) {
    const locationSelect = document.createElement("select");
    locationSelect.className = "theme-select";
    planState.config.locationOrder.forEach((locId) => {
      const option = document.createElement("option");
      option.value = locId;
      option.textContent = getLocationLabel(locId);
      locationSelect.appendChild(option);
    });
    locationSelect.value = plan.loc;
    locationSelect.addEventListener("change", (event) =>
      setDayLocation(dateKey, event.target.value)
    );
    badges.appendChild(locationSelect);

    const themeInput = document.createElement("input");
    themeInput.type = "text";
    themeInput.className = "theme-input";
    themeInput.placeholder = "Set theme";
    themeInput.value = plan.theme || "";
    const commitTheme = (value) => setDayTheme(dateKey, value);
    themeInput.addEventListener("change", (event) =>
      commitTheme(event.target.value)
    );
    themeInput.addEventListener("blur", (event) =>
      commitTheme(event.target.value)
    );
    badges.appendChild(themeInput);
  } else {
    const locationChip = document.createElement("span");
    locationChip.className = "theme-chip";
    locationChip.textContent = getLocationLabel(plan.loc);
    badges.appendChild(locationChip);

    const themeLabel = plan.theme || getDefaultTheme(plan.loc) || "";
    const themeChip = document.createElement("span");
    themeChip.className = "theme-chip";
    themeChip.textContent = themeLabel || "Set theme";
    badges.appendChild(themeChip);
  }

  const stayButton = document.createElement("button");
  stayButton.type = "button";
  stayButton.className = "theme-chip theme-chip--link";
  stayButton.textContent = plan.stay ? getStayLabel(plan.stay) : "Pick stay";
  stayButton.addEventListener("click", () => openSheet(dateKey, "stay"));
  badges.appendChild(stayButton);

  const mapButton = document.createElement("button");
  mapButton.type = "button";
  mapButton.className = "theme-chip theme-chip--map";
  mapButton.textContent = "Map";
  mapButton.addEventListener("click", () => openMap(dateKey));
  badges.appendChild(mapButton);

  const travelChip = renderTravelChip(dateKey, plan);
  badges.appendChild(travelChip);

  header.appendChild(badges);
  card.appendChild(header);

  const slotsWrap = document.createElement("div");
  slotsWrap.className = "slots";
  ["morning", "afternoon", "evening"].forEach((slotName) => {
    const slotSection = document.createElement("section");
    slotSection.className = "slot";
    slotSection.dataset.slot = slotName;
    slotSection.dataset.date = dateKey;

    const slotHeader = document.createElement("div");
    slotHeader.className = "slot__header";
    const slotTitle = document.createElement("span");
    slotTitle.className = "slot__title";
    slotTitle.textContent = slotName.toUpperCase();
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn slot__add";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", () =>
      openSheet(dateKey, "activity", slotName)
    );
    slotHeader.append(slotTitle, addBtn);
    slotSection.appendChild(slotHeader);

    const items = plan.slots?.[slotName] || [];
    items.forEach((itemId, index) => {
      const chip = renderChip(dateKey, slotName, itemId, index);
      slotSection.appendChild(chip);
    });

    slotSection.addEventListener("dragover", handleSlotDragOver);
    slotSection.addEventListener("dragleave", handleSlotDragLeave);
    slotSection.addEventListener("drop", handleSlotDrop);

    slotsWrap.appendChild(slotSection);
  });
  card.appendChild(slotsWrap);

  const friendRow = document.createElement("div");
  friendRow.className = "day-card__friends";
  planState.config.friends.forEach((friend) => {
    const isActive = plan.friends.includes(friend);
    const friendBtn = document.createElement("button");
    friendBtn.type = "button";
    friendBtn.className = "friend-chip" + (isActive ? " friend-chip--on" : "");
    friendBtn.dataset.friend = friend;
    friendBtn.textContent = isActive ? friend : `+ ${friend}`;
    if (isActive) {
      const color = planState.config.friendColors?.[friend];
      if (color) {
        friendBtn.style.background = color;
      }
    } else {
      friendBtn.style.background = "";
    }
    friendBtn.addEventListener("click", () => toggleFriend(dateKey, friend));
    friendRow.appendChild(friendBtn);
  });
  card.appendChild(friendRow);

  card.addEventListener("dragstart", handleCardDragStart);
  card.addEventListener("dragend", () => {
    cardDragSource = null;
  });
  card.addEventListener("dragover", (event) => {
    if (!editing) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  card.addEventListener("drop", handleCardDrop);

  scheduleTravelCalculation(dateKey, { interactive: false });

  scheduleTravelCalculation(dateKey, { interactive: false });

  scheduleTravelCalculation(dateKey, { interactive: false });

  return card;
}

function renderChip(dateKey, slotName, itemId, index) {
  const chip = document.createElement("span");
  chip.className = "chiplet";
  chip.dataset.date = dateKey;
  chip.dataset.slot = slotName;
  chip.dataset.index = String(index);
  chip.dataset.id = itemId;

  const label = getActivityLabel(itemId);
  const content = buildChipContent(label);
  chip.appendChild(content);

  const locked = isChipLocked(dateKey, itemId);
  if (locked) {
    chip.classList.add("locked");
  }

  chip.draggable = editing && !locked;
  if (chip.draggable) {
    chip.addEventListener("dragstart", handleChipDragStart);
    chip.addEventListener("dragend", handleChipDragEnd);
  }

  if (editing) {
    const actions = document.createElement("span");
    actions.className = "chiplet__actions";

    const lockBtn = document.createElement("button");
    lockBtn.type = "button";
    lockBtn.className = "chiplet__btn";
    lockBtn.title = locked ? "Unlock" : "Lock";
    lockBtn.textContent = locked ? "🔒" : "🔓";
    lockBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLock(dateKey, itemId);
    });
    actions.appendChild(lockBtn);

    if (!locked) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "chiplet__btn";
      removeBtn.title = "Remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", (event) => {
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
    const time = document.createElement("span");
    time.className = "chiplet__time";
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
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(
    "text/plain",
    JSON.stringify({ type: "chip", id: chip.dataset.id })
  );
}

function handleChipDragEnd() {
  chipDragData = null;
  document.querySelectorAll(".slot[data-drop-hover]").forEach((slot) => {
    slot.removeAttribute("data-drop-hover");
  });
}

function handleSlotDragOver(event) {
  if (!editing) return;
  event.preventDefault();
  event.currentTarget.dataset.dropHover = "true";
  event.dataTransfer.dropEffect = "move";
}

function handleSlotDragLeave(event) {
  event.currentTarget.removeAttribute("data-drop-hover");
}

function handleSlotDrop(event) {
  if (!editing) return;
  event.preventDefault();
  event.currentTarget.removeAttribute("data-drop-hover");
  if (!chipDragData) return;
  const targetDate = event.currentTarget.dataset.date;
  const targetSlot = event.currentTarget.dataset.slot;
  moveChip(chipDragData, targetDate, targetSlot);
  chipDragData = null;
}

function moveChip(dragData, targetDate, targetSlot) {
  const { date: sourceDate, slot: sourceSlot, index, id } = dragData;
  if (!id) return;
  const sourceDay = ensureDay(sourceDate);
  const targetDay = ensureDay(targetDate);
  if (isChipLocked(sourceDate, id)) return;

  const sourceList = sourceDay.slots?.[sourceSlot];
  if (!Array.isArray(sourceList)) return;
  const [removed] = sourceList.splice(index, 1);
  if (removed !== id) {
    const fallbackIndex = sourceList.indexOf(id);
    if (fallbackIndex >= 0) {
      sourceList.splice(fallbackIndex, 1);
    }
  }

  targetDay.slots[targetSlot] = targetDay.slots[targetSlot] || [];
  targetDay.slots[targetSlot].push(id);
  invalidateTravel(sourceDate, { persist: false, updateCard: false });
  if (sourceDate !== targetDate) {
    invalidateTravel(targetDate, { persist: false, updateCard: false });
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
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "day-card");
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
  const existing = calendarEl.querySelector(
    `.day-card[data-date="${dateKey}"]`
  );
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

function setDayLocation(dateKey, locationId) {
  if (!editing) return;
  const day = ensureDay(dateKey);
  const next = planState.config.locations[locationId]
    ? locationId
    : getDefaultLocationId(planState.config);
  if (day.loc !== next) {
    day.loc = next;
    persistState();
    updateDayCard(dateKey);
  }
}

function setDayTheme(dateKey, value) {
  if (!editing) return;
  const day = ensureDay(dateKey);
  const next = (value || "").trim();
  if (day.theme !== next) {
    day.theme = next;
    persistState();
    updateDayCard(dateKey);
  }
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
  if (sheetState.open && sheetState.tab === "stay") {
    renderSheet();
  }
}

function openSheet(dateKey, tab = "activity", slot = "morning") {
  sheetState = { open: true, day: dateKey, tab, slot };
  sheetEl.classList.add("sheet--open");
  sheetEl.setAttribute("aria-hidden", "false");
  sheetBackdrop.classList.add("is-visible");
  document.body.classList.add("sheet-open");
  renderSheet();
}

function closeSheet() {
  sheetState.open = false;
  sheetEl.classList.remove("sheet--open");
  sheetEl.setAttribute("aria-hidden", "true");
  sheetBackdrop.classList.remove("is-visible");
  document.body.classList.remove("sheet-open");
}

function renderSheet() {
  if (!sheetState.open) return;
  const { day, tab, slot } = sheetState;
  const dayLabel = formatLongDate(day);
  sheetTitle.textContent = dayLabel;
  if (tab === "activity") {
    sheetSubtitle.textContent = `${slot.toUpperCase()} SLOT`;
  } else if (tab === "stay") {
    sheetSubtitle.textContent = "Choose stay";
  } else {
    sheetSubtitle.textContent = "Bookings & tickets";
  }

  sheetBody.innerHTML = "";
  sheetEl.querySelectorAll(".tab").forEach((tabBtn) => {
    tabBtn.setAttribute(
      "aria-selected",
      tabBtn.dataset.tab === tab ? "true" : "false"
    );
  });

  const locationOrder = planState.config.locationOrder;
  const catalog = planState.config.catalog;

  if (tab === "activity") {
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
      sheetBody.appendChild(
        renderEmptyState("No saved activities yet. Add one below.")
      );
    }
    sheetBody.appendChild(renderCustomCreator("activity", day, slot));
  } else if (tab === "stay") {
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
      sheetBody.appendChild(
        renderEmptyState("No stays saved yet. Add one below.")
      );
    }
    sheetBody.appendChild(renderCustomCreator("stay", day));
  } else if (tab === "booking") {
    let hasOptions = false;
    locationOrder.forEach((loc) => {
      const options = catalog.booking.filter((item) => item.city === loc);
      if (!options.length) return;
      hasOptions = true;
      sheetBody.appendChild(
        renderSheetGroup(loc, options, (item) => {
          if (item.url) {
            window.open(item.url, "_blank", "noopener");
          }
        })
      );
    });
    if (!hasOptions) {
      sheetBody.appendChild(
        renderEmptyState("No bookings saved yet. Add one below.")
      );
    }
    sheetBody.appendChild(renderCustomCreator("booking"));
  }
}

function renderSheetGroup(locationId, items, onSelect, selectedId) {
  const group = document.createElement("section");
  group.className = "sheet-group";

  const header = document.createElement("div");
  header.className = "sheet-group__header";
  const swatch = document.createElement("span");
  swatch.className = "sheet-group__swatch";
  swatch.style.background =
    planState.config.locations[locationId]?.color || "#d1d5db";
  const title = document.createElement("span");
  title.textContent = getLocationLabel(locationId);
  header.append(swatch, title);
  group.appendChild(header);

  const list = document.createElement("div");
  list.className = "sheet-group__list";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-card";
    if (selectedId && item.id === selectedId) {
      button.classList.add("sheet-card--selected");
    }
    const label = document.createElement("span");
    label.textContent = item.label;
    button.appendChild(label);
    if (selectedId && item.id === selectedId) {
      const meta = document.createElement("span");
      meta.className = "sheet-card__meta";
      meta.textContent = "Selected";
      button.appendChild(meta);
    }
    button.addEventListener("click", () => onSelect(item));
    list.appendChild(button);
  });
  group.appendChild(list);
  return group;
}

function renderEmptyState(message) {
  const note = document.createElement("p");
  note.className = "empty-state";
  note.textContent = message;
  return note;
}

function renderCustomCreator(tab, dayKey, slotName) {
  const section = document.createElement("section");
  section.className = "sheet-custom";

  const title = document.createElement("p");
  title.className = "sheet-custom__title";
  const text = document.createElement("p");
  text.className = "sheet-custom__text";

  if (tab === "activity") {
    title.textContent = "Add custom activity";
    text.textContent = "Create a one-off activity with an optional map pin.";
  } else if (tab === "stay") {
    title.textContent = "Add custom stay";
    text.textContent =
      "Track a stay even if it is not already in your catalog.";
  } else {
    title.textContent = "Add custom booking";
    text.textContent = "Save a booking or ticket link for quick access later.";
  }

  const form = document.createElement("form");
  form.className = "custom-form";
  form.noValidate = true;

  const fields = document.createElement("div");
  fields.className = "custom-form__grid";

  const errorEl = document.createElement("p");
  errorEl.className = "form-error";
  errorEl.hidden = true;

  const dayPlan = ensureDay(dayKey);
  const defaultLocation = planState.config.locations[dayPlan.loc]
    ? dayPlan.loc
    : getDefaultLocationId();
  const locationOptions = planState.config.locationOrder.map((locId) => ({
    value: locId,
    label: getLocationLabel(locId),
  }));
  if (!locationOptions.length) {
    locationOptions.push({
      value: defaultLocation,
      label: getLocationLabel(defaultLocation),
    });
  }

  const { wrapper: labelField, input: labelInput } = createLabeledInput({
    label: tab === "booking" ? "Booking name" : "Name",
    placeholder:
      tab === "activity"
        ? "Morning walk, museum visit..."
        : "Add a description",
  });
  fields.appendChild(labelField);

  const { wrapper: locationField, select: locationSelect } =
    createLabeledSelect({
      label: "Location",
      value: defaultLocation,
      options: locationOptions,
    });
  fields.appendChild(locationField);

  let coordSelect;
  let coordFields;
  let coordLabelInput;
  let coordLatInput;
  let coordLngInput;
  let urlInput;

  if (tab === "activity") {
    const coordinateOptions = [
      { value: "", label: "No map pin" },
      ...Object.entries(planState.config.mapCoordinates || {}).map(
        ([id, coords]) => {
          const pair = Array.isArray(coords)
            ? coords
            : [coords?.[0], coords?.[1]];
          const label =
            planState.config.mapCoordinateLabels?.[id] || humanizeId(id);
          const suffix = pair.every((num) => Number.isFinite(Number(num)))
            ? ` (${Number(pair[0]).toFixed(3)}, ${Number(pair[1]).toFixed(3)})`
            : "";
          return { value: id, label: `${label}${suffix}` };
        }
      ),
      { value: "__new__", label: "Create new pin…" },
    ];
    const coordinateField = createLabeledSelect({
      label: "Map pin",
      options: coordinateOptions,
      value: "",
    });
    coordSelect = coordinateField.select;
    fields.appendChild(coordinateField.wrapper);

    coordFields = document.createElement("div");
    coordFields.className = "custom-form__grid custom-form__grid--coords";
    coordFields.hidden = true;
    const coordLabelField = createLabeledInput({
      label: "Pin label",
      placeholder: "Shown on the map",
      value: "",
    });
    coordLabelInput = coordLabelField.input;
    const coordLatField = createLabeledInput({
      label: "Latitude",
      type: "number",
      step: "0.0001",
      placeholder: "34.6937",
    });
    coordLatInput = coordLatField.input;
    const coordLngField = createLabeledInput({
      label: "Longitude",
      type: "number",
      step: "0.0001",
      placeholder: "135.5023",
    });
    coordLngInput = coordLngField.input;
    coordFields.append(
      coordLabelField.wrapper,
      coordLatField.wrapper,
      coordLngField.wrapper
    );

    coordSelect.addEventListener("change", () => {
      coordFields.hidden = coordSelect.value !== "__new__";
    });
  } else {
    const labelText =
      tab === "stay" ? "Link (optional)" : "Booking link (optional)";
    const urlField = createLabeledInput({
      label: labelText,
      type: "url",
      placeholder: "https://…",
    });
    urlInput = urlField.input;
    fields.appendChild(urlField.wrapper);
  }

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn sheet-custom__btn";
  submitBtn.textContent =
    tab === "activity"
      ? "Add activity"
      : tab === "stay"
      ? "Add stay"
      : "Add booking";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    errorEl.hidden = true;

    const name = labelInput.value.trim();
    if (!name) {
      errorEl.textContent = "Please enter a name before saving.";
      errorEl.hidden = false;
      labelInput.focus();
      return;
    }

    const selectedLocation = planState.config.locations[locationSelect.value]
      ? locationSelect.value
      : getDefaultLocationId();

    if (tab === "activity") {
      let coordId = coordSelect?.value || "";
      if (coordId === "__new__") {
        const lat = Number(coordLatInput.value.trim());
        const lng = Number(coordLngInput.value.trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          errorEl.textContent =
            "Enter a valid latitude and longitude to create a map pin.";
          errorEl.hidden = false;
          coordLatInput.focus();
          return;
        }
        const pinLabel = coordLabelInput.value.trim() || name;
        if (!planState.config.mapCoordinates) {
          planState.config.mapCoordinates = {};
        }
        if (!planState.config.mapCoordinateLabels) {
          planState.config.mapCoordinateLabels = {};
        }
        coordId = generateCoordinateIdFromLabel(
          pinLabel,
          planState.config.mapCoordinates
        );
        planState.config.mapCoordinates[coordId] = [lat, lng];
        planState.config.mapCoordinateLabels[coordId] = pinLabel;
      } else if (coordId && !planState.config.mapCoordinates[coordId]) {
        coordId = "";
      }

      const activityId = generateCustomId("activity");
      const payload = { id: activityId, city: selectedLocation, label: name };
      if (coordId) {
        payload.coord = coordId;
      }
      planState.config.catalog.activity.push(payload);
      refreshCatalogLookups();
      addActivity(dayKey, slotName, activityId);
      renderSheet();
      form.reset();
      coordFields && (coordFields.hidden = true);
      locationSelect.value = selectedLocation;
    } else if (tab === "stay") {
      const stayId = generateCustomId("stay");
      const payload = { id: stayId, city: selectedLocation, label: name };
      const link = urlInput.value.trim();
      if (link) {
        payload.url = link;
      }
      planState.config.catalog.stay.push(payload);
      refreshCatalogLookups();
      setStay(dayKey, stayId);
      form.reset();
      locationSelect.value = selectedLocation;
    } else {
      const bookingId = generateCustomId("booking");
      const payload = { id: bookingId, city: selectedLocation, label: name };
      const link = urlInput.value.trim();
      if (link) {
        payload.url = link;
      }
      planState.config.catalog.booking.push(payload);
      refreshCatalogLookups();
      persistState();
      renderSheet();
      form.reset();
      locationSelect.value = selectedLocation;
    }
  });

  form.append(fields);
  if (coordFields) {
    form.appendChild(coordFields);
  }
  form.append(errorEl, submitBtn);

  section.append(title, text, form);
  return section;
}

function attachToolbarEvents() {
  editBtn?.addEventListener("click", () => {
    editing = !editing;
    updateEditButton();
    renderCalendar();
  });

  manageTripsBtn?.addEventListener("click", openTripLibrary);
  settingsBtn?.addEventListener("click", () =>
    openTripWizard({ mode: "edit" })
  );
  newTripBtn?.addEventListener("click", () => openTripWizard({ mode: "new" }));
  icsBtn?.addEventListener("click", exportIcs);

  sheetBackdrop.addEventListener("click", () => {
    if (sheetState.open) closeSheet();
  });
  closeSheetBtn?.addEventListener("click", closeSheet);

  document.querySelectorAll(".sheet__tabs .tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      if (!sheetState.open) return;
      sheetState.tab = tabBtn.dataset.tab;
      renderSheet();
    });
  });

  closeMapBtn?.addEventListener("click", closeMap);
  mapOverlay.addEventListener("click", (event) => {
    if (event.target === mapOverlay) {
      closeMap();
    }
  });

  closeConfigBtn?.addEventListener("click", closeConfigOverlay);
  configOverlay?.addEventListener("click", (event) => {
    if (event.target === configOverlay) {
      closeConfigOverlay();
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    handleConfigAction(actionTarget);
  });

  allFilterBtn?.addEventListener("click", () => {
    filterState = { friend: null, location: null };
    applyFilters();
    updateFilterChips();
  });
}

function attachGlobalShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (sheetState.open) closeSheet();
      if (mapOverlay.classList.contains("is-open")) closeMap();
      if (configOverlay.classList.contains("is-open")) closeConfigOverlay();
    }
  });
}

function applyFilters() {
  const cards = calendarEl.querySelectorAll(".day-card");
  cards.forEach((card) => {
    const dateKey = card.dataset.date;
    const plan = ensureDay(dateKey);
    const matchesFriend =
      !filterState.friend || plan.friends.includes(filterState.friend);
    const matchesLocation =
      !filterState.location || plan.loc === filterState.location;
    card.style.display = matchesFriend && matchesLocation ? "" : "none";
  });
}

function updateFilterChips() {
  document.querySelectorAll(".chip[data-friend]").forEach((chip) => {
    chip.setAttribute(
      "aria-pressed",
      chip.dataset.friend === filterState.friend ? "true" : "false"
    );
  });
  document.querySelectorAll(".chip[data-location]").forEach((chip) => {
    chip.setAttribute(
      "aria-pressed",
      chip.dataset.location === filterState.location ? "true" : "false"
    );
  });
  const allOn = !filterState.friend && !filterState.location;
  allFilterBtn?.setAttribute("aria-pressed", allOn ? "true" : "false");
  applyFilterChipStyles();
}

function updateEditButton() {
  if (editBtn) {
    editBtn.textContent = editing ? "Done" : "Edit plan";
  }
}

function getLocationLabel(id) {
  return planState.config.locations[id]?.label || id;
}

function getDefaultTheme(locationId) {
  return planState.config.defaultThemes?.[locationId] || "";
}

function getActivityLabel(id) {
  return ACTIVITY_MAP.get(id)?.label || id;
}

function getStayLabel(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') {
    const trimmed = ref.trim();
    return STAY_MAP.get(trimmed)?.label || trimmed;
  }
  if (typeof ref === 'object') {
    if (typeof ref.label === 'string' && ref.label.trim()) {
      return ref.label.trim();
    }
    if (typeof ref.name === 'string' && ref.name.trim()) {
      return ref.name.trim();
    }
    if (typeof ref.id === 'string' && ref.id.trim()) {
      return getStayLabel(ref.id);
    }
  }
  return String(ref);
}

function formatLongDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = date.toLocaleDateString(undefined, { month: "short" });
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
      mapInstance = window.L.map("map");
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
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
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//Canvas6 Trip Planner//EN",
  ];

  dateSequence.forEach((dateKey) => {
    const day = ensureDay(dateKey);
    const dateValue = dateKey.replace(/-/g, "");
    const summaryDate = formatSummaryDate(dateKey);
    const title = day.theme || getDefaultTheme(day.loc) || "Trip day";
    const slotDescriptions = [];
    const slotTitles = {
      morning: "Morning",
      afternoon: "Afternoon",
      evening: "Evening",
    };
    ["morning", "afternoon", "evening"].forEach((slot) => {
      const labels = (day.slots[slot] || [])
        .map(getActivityLabel)
        .filter(Boolean);
      if (labels.length) {
        slotDescriptions.push(`${slotTitles[slot]}: ${labels.join(" • ")}`);
      }
    });
    if (day.stay) {
      slotDescriptions.push(`Stay: ${getStayLabel(day.stay)}`);
    }
    if (day.friends?.length) {
      slotDescriptions.push(`Friends: ${day.friends.join(", ")}`);
    }
    const description = slotDescriptions.join(" / ");
    const locationLabel = getLocationLabel(day.loc);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${dateKey}@canvas6`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`SUMMARY:${escapeIcsText(`${summaryDate} — ${title}`)}`);
    lines.push(`DTSTART:${dateValue}T090000`);
    lines.push(`DTEND:${dateValue}T210000`);
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push(`LOCATION:${escapeIcsText(locationLabel)}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const fileName = `${slugify(
    planState.config.tripName || "trip-planner",
    "trip-planner"
  )}.ics`;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function openTripLibrary() {
  overlayMode = "library";
  wizardState = null;
  tripLibraryConfirm = null;
  configTitle.textContent = "Trip library";
  configSubtitle.textContent = "Load, duplicate, or remove saved trips.";
  configOverlay.classList.add("is-open");
  configOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("config-open");
  renderTripLibrary();
}

function renderTripLibrary() {
  if (overlayMode !== "library") return;
  configContent.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "library";

  const actions = document.createElement("div");
  actions.className = "library__actions";
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "btn btn--primary";
  newBtn.dataset.action = "library-new";
  newBtn.textContent = "Create new trip";
  actions.appendChild(newBtn);
  wrapper.appendChild(actions);

  const list = document.createElement("div");
  list.className = "library__list";
  if (!storageBucket.order.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No trips saved yet. Create a new trip to get started.";
    list.appendChild(empty);
  } else {
    storageBucket.order.forEach((id) => {
      const state = storageBucket.trips[id];
      if (!state) return;
      list.appendChild(createLibraryCard(id, state));
    });
  }
  wrapper.appendChild(list);
  configContent.appendChild(wrapper);
}

function createLibraryCard(tripId, state) {
  const card = document.createElement("article");
  card.className = "library-card";
  if (tripId === activeTripId) {
    card.classList.add("library-card--active");
  }

  const title = document.createElement("h3");
  title.className = "library-card__title";
  title.textContent = state?.config?.tripName || "Untitled trip";
  card.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "library-card__meta";
  const start = state?.config?.range?.start || "—";
  const end = state?.config?.range?.end || start;
  const placeCount = state?.config?.locationOrder?.length || 0;
  meta.textContent = `${start} → ${end} • ${placeCount} place${
    placeCount === 1 ? "" : "s"
  }`;
  card.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "library-card__actions";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "btn btn--subtle";
  loadBtn.dataset.action = "library-load";
  loadBtn.dataset.tripId = tripId;
  loadBtn.textContent = tripId === activeTripId ? "Active" : "Load";
  if (tripId === activeTripId) {
    loadBtn.disabled = true;
  }
  actions.appendChild(loadBtn);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn--subtle";
  editBtn.dataset.action = "library-edit";
  editBtn.dataset.tripId = tripId;
  editBtn.textContent = "Edit settings";
  actions.appendChild(editBtn);

  const duplicateBtn = document.createElement("button");
  duplicateBtn.type = "button";
  duplicateBtn.className = "btn btn--subtle";
  duplicateBtn.dataset.action = "library-duplicate";
  duplicateBtn.dataset.tripId = tripId;
  duplicateBtn.textContent = "Duplicate";
  actions.appendChild(duplicateBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn--danger btn--subtle";
  deleteBtn.dataset.action = "library-delete";
  deleteBtn.dataset.tripId = tripId;
  deleteBtn.textContent =
    tripLibraryConfirm === tripId ? "Confirm delete" : "Delete";
  actions.appendChild(deleteBtn);

  card.appendChild(actions);
  return card;
}

function openTripWizard({ mode = "edit", tripId = activeTripId } = {}) {
  overlayMode = "wizard";
  tripLibraryConfirm = null;
  if (mode === "edit" && tripId && tripId !== activeTripId) {
    setActiveTrip(tripId);
  }
  configTitle.textContent = mode === "new" ? "Create a trip" : "Trip settings";
  configSubtitle.textContent =
    mode === "new"
      ? "Set up the basics before planning."
      : "Update people, places, and your saved catalog.";
  configOverlay.classList.add("is-open");
  configOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("config-open");

  const baseState =
    mode === "new" ? createStateFromTemplate(DEFAULT_TRIP_TEMPLATE) : planState;
  wizardState = {
    mode,
    stepIndex: 0,
    data: extractWizardData(baseState),
    sourceId: mode === "new" ? "default" : activeTripId,
  };
  if (mode === "new") {
    wizardState.sources = buildWizardSources();
  }
  renderWizard();
}

function renderWizard() {
  if (overlayMode !== "wizard" || !wizardState) return;
  configContent.innerHTML = "";
  const container = document.createElement("div");
  container.className = "wizard";
  container.appendChild(renderWizardNav());
  const body = document.createElement("div");
  body.className = "wizard__body";
  body.appendChild(renderWizardStep());
  container.appendChild(body);
  container.appendChild(renderWizardFooter());
  configContent.appendChild(container);
}

function renderWizardNav() {
  const list = document.createElement("ol");
  list.className = "wizard__steps";
  WIZARD_STEPS.forEach((step, index) => {
    const item = document.createElement("li");
    item.className = "wizard__steps-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wizard__step";
    button.textContent = `${index + 1}. ${step.label}`;
    if (index === wizardState.stepIndex) {
      button.classList.add("is-active");
    } else if (index < wizardState.stepIndex) {
      button.dataset.action = "wizard-jump";
      button.dataset.stepIndex = String(index);
    } else {
      button.disabled = true;
    }
    item.appendChild(button);
    list.appendChild(item);
  });
  return list;
}

function renderWizardStep() {
  const step = WIZARD_STEPS[wizardState.stepIndex];
  const section = document.createElement("div");
  section.className = "wizard-step";
  if (!step) return section;
  if (step.id === "basics") {
    section.appendChild(renderWizardBasicsStep());
  } else if (step.id === "friends") {
    section.appendChild(renderWizardFriendsStep());
  } else if (step.id === "places") {
    section.appendChild(renderWizardPlacesStep());
  } else if (step.id === "catalog") {
    section.appendChild(renderWizardCatalogStep());
  }
  return section;
}

function renderWizardFooter() {
  const footer = document.createElement("div");
  footer.className = "wizard__footer";
  const progress = document.createElement("div");
  progress.className = "wizard__progress";
  progress.textContent = `Step ${wizardState.stepIndex + 1} of ${
    WIZARD_STEPS.length
  }`;
  footer.appendChild(progress);

  const actions = document.createElement("div");
  actions.className = "wizard__actions";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "btn btn--subtle";
  backBtn.dataset.action = "wizard-prev";
  backBtn.textContent = "Back";
  if (wizardState.stepIndex === 0) {
    backBtn.disabled = true;
  }
  actions.appendChild(backBtn);

  if (wizardState.stepIndex < WIZARD_STEPS.length - 1) {
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn--primary";
    nextBtn.dataset.action = "wizard-next";
    nextBtn.textContent = "Next";
    actions.appendChild(nextBtn);
  } else {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn--primary";
    saveBtn.dataset.action = "wizard-save";
    saveBtn.textContent =
      wizardState.mode === "new" ? "Create trip" : "Save changes";
    actions.appendChild(saveBtn);
  }
  footer.appendChild(actions);
  return footer;
}

function renderWizardBasicsStep() {
  const grid = document.createElement("div");
  grid.className = "wizard-grid";

  const { wrapper: nameField, input: nameInput } = createLabeledInput({
    label: "Trip name",
    value: wizardState.data.tripName || "",
    placeholder: "e.g., Summer in Italy",
  });
  nameInput.addEventListener("input", (event) => {
    wizardState.data.tripName = event.target.value;
  });
  grid.appendChild(nameField);

  const { wrapper: startField, input: startInput } = createLabeledInput({
    label: "Start date",
    type: "date",
    value: wizardState.data.startDate || "",
  });
  startInput.addEventListener("change", (event) => {
    wizardState.data.startDate = event.target.value;
  });
  grid.appendChild(startField);

  const { wrapper: endField, input: endInput } = createLabeledInput({
    label: "End date",
    type: "date",
    value: wizardState.data.endDate || "",
  });
  endInput.addEventListener("change", (event) => {
    wizardState.data.endDate = event.target.value;
  });
  grid.appendChild(endField);

  if (wizardState.mode === "new") {
    const sources = wizardState.sources || buildWizardSources();
    const { wrapper: sourceField, select: sourceSelect } = createLabeledSelect({
      label: "Start from",
      value: wizardState.sourceId || "default",
      options: sources.map((entry) => ({
        value: entry.id,
        label: entry.label,
      })),
    });
    sourceSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      wizardState.sourceId = value;
      const base =
        value === "default"
          ? createStateFromTemplate(DEFAULT_TRIP_TEMPLATE)
          : getStoredTripState(value);
      if (base) {
        wizardState.data = extractWizardData(base);
        wizardState.stepIndex = 0;
        renderWizard();
      }
    });
    grid.appendChild(sourceField);
  }

  return grid;
}

function renderWizardFriendsStep() {
  const container = document.createElement("div");
  container.className = "wizard-stack";

  const list = document.createElement("div");
  list.className = "wizard-list";
  wizardState.data.friends.forEach((friend, index) => {
    const row = document.createElement("div");
    row.className = "wizard-row";

    const { wrapper: nameField, input: nameInput } = createLabeledInput({
      label: "Name",
      value: friend.name || "",
      placeholder: "Friend name",
    });
    nameInput.addEventListener("input", (event) => {
      wizardState.data.friends[index].name = event.target.value;
    });
    row.appendChild(nameField);

    const palette = COLOR_PALETTES.friends;
    const fallbackColor = palette[index % palette.length];
    const { wrapper: colorField, input: colorInput } = createLabeledInput({
      label: "Color",
      type: "color",
      value: sanitizeHexColor(friend.color, fallbackColor),
    });
    colorInput.addEventListener("input", (event) => {
      wizardState.data.friends[index].color = event.target.value;
    });
    row.appendChild(colorField);

    const actions = document.createElement("div");
    actions.className = "wizard-row__actions";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "btn btn--subtle";
    upBtn.dataset.action = "friends-move-up";
    upBtn.dataset.index = index;
    upBtn.textContent = "Move up";
    upBtn.disabled = index === 0;
    actions.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "btn btn--subtle";
    downBtn.dataset.action = "friends-move-down";
    downBtn.dataset.index = index;
    downBtn.textContent = "Move down";
    downBtn.disabled = index === wizardState.data.friends.length - 1;
    actions.appendChild(downBtn);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--danger btn--subtle";
    removeBtn.dataset.action = "friends-remove";
    removeBtn.dataset.index = index;
    removeBtn.textContent = "Remove";
    actions.appendChild(removeBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
  container.appendChild(list);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--primary";
  addBtn.dataset.action = "friends-add";
  addBtn.textContent = "Add friend";
  container.appendChild(addBtn);

  return container;
}

function renderWizardPlacesStep() {
  const stack = document.createElement("div");
  stack.className = "wizard-stack";
  stack.appendChild(renderLocationsEditor());
  stack.appendChild(renderMapDefaultsEditor());
  stack.appendChild(renderCoordinateEditor());
  return stack;
}

function renderLocationsEditor() {
  const section = document.createElement("section");
  section.className = "wizard-section";
  const heading = document.createElement("h3");
  heading.textContent = "Places";
  section.appendChild(heading);

  const list = document.createElement("div");
  list.className = "wizard-list";
  wizardState.data.locations.forEach((loc, index) => {
    const row = document.createElement("div");
    row.className = "wizard-row";

    const { wrapper: labelField, input: labelInput } = createLabeledInput({
      label: "Label",
      value: loc.label || "",
      placeholder: "City or region name",
    });
    labelInput.addEventListener("input", (event) => {
      wizardState.data.locations[index].label = event.target.value;
    });
    row.appendChild(labelField);

    const { wrapper: themeField, input: themeInput } = createLabeledInput({
      label: "Default theme",
      value: loc.theme || "",
      placeholder: "Optional default theme",
    });
    themeInput.addEventListener("input", (event) => {
      wizardState.data.locations[index].theme = event.target.value;
    });
    row.appendChild(themeField);

    const palette = COLOR_PALETTES.locations;
    const { wrapper: colorField, input: colorInput } = createLabeledInput({
      label: "Color",
      type: "color",
      value: sanitizeHexColor(loc.color, palette[index % palette.length]),
    });
    colorInput.addEventListener("input", (event) => {
      wizardState.data.locations[index].color = event.target.value;
    });
    row.appendChild(colorField);

    const actions = document.createElement("div");
    actions.className = "wizard-row__actions";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "btn btn--subtle";
    upBtn.dataset.action = "locations-move-up";
    upBtn.dataset.index = index;
    upBtn.textContent = "Move up";
    upBtn.disabled = index === 0;
    actions.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "btn btn--subtle";
    downBtn.dataset.action = "locations-move-down";
    downBtn.dataset.index = index;
    downBtn.textContent = "Move down";
    downBtn.disabled = index === wizardState.data.locations.length - 1;
    actions.appendChild(downBtn);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--danger btn--subtle";
    removeBtn.dataset.action = "locations-remove";
    removeBtn.dataset.index = index;
    removeBtn.textContent = "Remove";
    removeBtn.disabled = wizardState.data.locations.length <= 1;
    actions.appendChild(removeBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
  section.appendChild(list);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--primary";
  addBtn.dataset.action = "locations-add";
  addBtn.textContent = "Add place";
  section.appendChild(addBtn);

  return section;
}

function renderMapDefaultsEditor() {
  const section = document.createElement("section");
  section.className = "wizard-section";
  const heading = document.createElement("h3");
  heading.textContent = "Map defaults";
  section.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "wizard-grid";

  const { wrapper: latField, input: latInput } = createLabeledInput({
    label: "Center latitude",
    type: "number",
    step: "0.0001",
    value: wizardState.data.mapDefaults.centerLat || "",
  });
  latInput.addEventListener("input", (event) => {
    wizardState.data.mapDefaults.centerLat = event.target.value;
  });
  grid.appendChild(latField);

  const { wrapper: lngField, input: lngInput } = createLabeledInput({
    label: "Center longitude",
    type: "number",
    step: "0.0001",
    value: wizardState.data.mapDefaults.centerLng || "",
  });
  lngInput.addEventListener("input", (event) => {
    wizardState.data.mapDefaults.centerLng = event.target.value;
  });
  grid.appendChild(lngField);

  const { wrapper: zoomField, input: zoomInput } = createLabeledInput({
    label: "Default zoom",
    type: "number",
    step: "1",
    value: wizardState.data.mapDefaults.zoom || "",
  });
  zoomInput.addEventListener("input", (event) => {
    wizardState.data.mapDefaults.zoom = event.target.value;
  });
  grid.appendChild(zoomField);

  section.appendChild(grid);
  return section;
}

function renderCoordinateEditor() {
  const section = document.createElement("section");
  section.className = "wizard-section";
  const heading = document.createElement("h3");
  heading.textContent = "Map pins";
  section.appendChild(heading);

  const list = document.createElement("div");
  list.className = "wizard-list";
  wizardState.data.mapCoordinates.forEach((pin, index) => {
    const row = document.createElement("div");
    row.className = "wizard-row";

    const idLabel = document.createElement("div");
    idLabel.className = "form-field form-field--readonly";
    const idTitle = document.createElement("span");
    idTitle.className = "form-label";
    idTitle.textContent = "Key";
    const idValue = document.createElement("code");
    idValue.textContent = pin.id;
    idLabel.append(idTitle, idValue);
    row.appendChild(idLabel);

    const { wrapper: nameField, input: nameInput } = createLabeledInput({
      label: "Label",
      value: pin.label || "",
      placeholder: "Display name",
    });
    nameInput.addEventListener("input", (event) => {
      wizardState.data.mapCoordinates[index].label = event.target.value;
    });
    row.appendChild(nameField);

    const { wrapper: latField, input: latInput } = createLabeledInput({
      label: "Latitude",
      type: "number",
      step: "0.0001",
      value: pin.lat || "",
    });
    latInput.addEventListener("input", (event) => {
      wizardState.data.mapCoordinates[index].lat = event.target.value;
    });
    row.appendChild(latField);

    const { wrapper: lngField, input: lngInput } = createLabeledInput({
      label: "Longitude",
      type: "number",
      step: "0.0001",
      value: pin.lng || "",
    });
    lngInput.addEventListener("input", (event) => {
      wizardState.data.mapCoordinates[index].lng = event.target.value;
    });
    row.appendChild(lngField);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--danger btn--subtle";
    removeBtn.dataset.action = "coords-remove";
    removeBtn.dataset.index = index;
    removeBtn.textContent = "Remove";
    const actions = document.createElement("div");
    actions.className = "wizard-row__actions";
    actions.appendChild(removeBtn);
    row.appendChild(actions);

    list.appendChild(row);
  });
  section.appendChild(list);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--primary";
  addBtn.dataset.action = "coords-add";
  addBtn.textContent = "Add map pin";
  section.appendChild(addBtn);

  return section;
}

function renderWizardCatalogStep() {
  const container = document.createElement("div");
  container.className = "wizard-stack";
  container.appendChild(renderCatalogSection("activity", "Activities"));
  container.appendChild(renderCatalogSection("stay", "Stays"));
  container.appendChild(renderCatalogSection("booking", "Bookings"));
  return container;
}

function renderCatalogSection(type, headingText) {
  const section = document.createElement("section");
  section.className = "wizard-section";
  const heading = document.createElement("h3");
  heading.textContent = headingText;
  section.appendChild(heading);

  const list = document.createElement("div");
  list.className = "wizard-list";
  const items = wizardState.data.catalog[type] || [];
  const locationOptions = wizardState.data.locations.map((loc) => ({
    value: loc.id,
    label: loc.label || loc.id,
  }));
  const coordinateOptions = wizardState.data.mapCoordinates.map((pin) => ({
    value: pin.id,
    label: pin.label || pin.id,
  }));

  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "wizard-row";

    const placeholder =
      type === "activity"
        ? "Activity name"
        : type === "stay"
        ? "Stay name"
        : "Booking name";
    const { wrapper: nameField, input: nameInput } = createLabeledInput({
      label: "Label",
      value: item.label || "",
      placeholder,
    });
    nameInput.addEventListener("input", (event) => {
      wizardState.data.catalog[type][index].label = event.target.value;
    });
    row.appendChild(nameField);

    const { wrapper: locationField, select: locationSelect } =
      createLabeledSelect({
        label: "Location",
        value: item.city || locationOptions[0]?.value || "",
        options: locationOptions,
      });
    locationSelect.addEventListener("change", (event) => {
      wizardState.data.catalog[type][index].city = event.target.value;
    });
    row.appendChild(locationField);

    if (type === "activity") {
      const coordField = createLabeledSelect({
        label: "Map pin",
        value: item.coord || "",
        options: [{ value: "", label: "None" }, ...coordinateOptions],
      });
      coordField.select.addEventListener("change", (event) => {
        wizardState.data.catalog[type][index].coord = event.target.value || "";
      });
      row.appendChild(coordField.wrapper);

      const lockField = createToggleField({
        label: "Lock",
        checked: Boolean(item.locked),
      });
      lockField.input.addEventListener("change", (event) => {
        wizardState.data.catalog[type][index].locked = event.target.checked;
      });
      row.appendChild(lockField.wrapper);
    } else {
      const { wrapper: urlField, input: urlInput } = createLabeledInput({
        label: "Link (optional)",
        type: "url",
        value: item.url || "",
        placeholder: "https://…",
      });
      urlInput.addEventListener("input", (event) => {
        wizardState.data.catalog[type][index].url = event.target.value;
      });
      row.appendChild(urlField);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--danger btn--subtle";
    removeBtn.dataset.action = "catalog-remove";
    removeBtn.dataset.type = type;
    removeBtn.dataset.index = index;
    removeBtn.textContent = "Remove";
    const actions = document.createElement("div");
    actions.className = "wizard-row__actions";
    actions.appendChild(removeBtn);
    row.appendChild(actions);

    list.appendChild(row);
  });
  section.appendChild(list);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--primary";
  addBtn.dataset.action = "catalog-add";
  addBtn.dataset.type = type;
  addBtn.textContent = `Add ${type}`;
  section.appendChild(addBtn);

  return section;
}

function handleConfigAction(target) {
  const action = target.dataset.action;
  if (!action) return;
  switch (action) {
    case "close-config":
      closeConfigOverlay();
      break;
    case "wizard-prev":
      if (wizardState && wizardState.stepIndex > 0) {
        wizardState.stepIndex -= 1;
        renderWizard();
      }
      break;
    case "wizard-next":
      if (wizardState && wizardState.stepIndex < WIZARD_STEPS.length - 1) {
        wizardState.stepIndex += 1;
        renderWizard();
      }
      break;
    case "wizard-jump": {
      if (!wizardState) break;
      const index = Number(target.dataset.stepIndex);
      if (!Number.isNaN(index) && index <= wizardState.stepIndex) {
        wizardState.stepIndex = index;
        renderWizard();
      }
      break;
    }
    case "wizard-save":
      submitWizard();
      break;
    case "friends-add":
      if (wizardState) {
        const palette = COLOR_PALETTES.friends;
        wizardState.data.friends.push({
          name: "",
          color: palette[wizardState.data.friends.length % palette.length],
        });
        renderWizard();
      }
      break;
    case "friends-remove": {
      if (!wizardState) break;
      const index = Number(target.dataset.index);
      wizardState.data.friends.splice(index, 1);
      renderWizard();
      break;
    }
    case "friends-move-up":
    case "friends-move-down": {
      if (!wizardState) break;
      const index = Number(target.dataset.index);
      const offset = action === "friends-move-up" ? -1 : 1;
      const swap = index + offset;
      if (swap >= 0 && swap < wizardState.data.friends.length) {
        const [item] = wizardState.data.friends.splice(index, 1);
        wizardState.data.friends.splice(swap, 0, item);
        renderWizard();
      }
      break;
    }
    case "locations-add":
      if (wizardState) {
        const palette = COLOR_PALETTES.locations;
        const baseLabel = `New place ${wizardState.data.locations.length + 1}`;
        const id = generateUniqueLocationId(baseLabel);
        wizardState.data.locations.push({
          id,
          label: baseLabel,
          theme: baseLabel,
          color: palette[wizardState.data.locations.length % palette.length],
        });
        renderWizard();
      }
      break;
    case "locations-remove": {
      if (!wizardState || wizardState.data.locations.length <= 1) break;
      const index = Number(target.dataset.index);
      wizardState.data.locations.splice(index, 1);
      renderWizard();
      break;
    }
    case "locations-move-up":
    case "locations-move-down": {
      if (!wizardState) break;
      const index = Number(target.dataset.index);
      const offset = action === "locations-move-up" ? -1 : 1;
      const swap = index + offset;
      if (swap >= 0 && swap < wizardState.data.locations.length) {
        const [item] = wizardState.data.locations.splice(index, 1);
        wizardState.data.locations.splice(swap, 0, item);
        renderWizard();
      }
      break;
    }
    case "coords-add":
      if (wizardState) {
        const existing = Object.fromEntries(
          wizardState.data.mapCoordinates.map((entry) => [entry.id, true])
        );
        const id = generateCoordinateIdFromLabel(
          `pin-${wizardState.data.mapCoordinates.length + 1}`,
          existing
        );
        wizardState.data.mapCoordinates.push({
          id,
          label: "",
          lat: "",
          lng: "",
        });
        renderWizard();
      }
      break;
    case "coords-remove": {
      if (!wizardState) break;
      const index = Number(target.dataset.index);
      wizardState.data.mapCoordinates.splice(index, 1);
      renderWizard();
      break;
    }
    case "catalog-add": {
      if (!wizardState) break;
      const type = target.dataset.type;
      const defaultLoc = wizardState.data.locations[0]?.id || "general";
      const entry = { id: generateCustomId(type), label: "", city: defaultLoc };
      if (type === "activity") {
        entry.coord = "";
      } else {
        entry.url = "";
      }
      wizardState.data.catalog[type].push(entry);
      renderWizard();
      break;
    }
    case "catalog-remove": {
      if (!wizardState) break;
      const type = target.dataset.type;
      const index = Number(target.dataset.index);
      wizardState.data.catalog[type].splice(index, 1);
      renderWizard();
      break;
    }
    case "library-new":
      closeConfigOverlay();
      openTripWizard({ mode: "new" });
      break;
    case "library-load":
      setActiveTrip(target.dataset.tripId);
      closeConfigOverlay();
      break;
    case "library-edit":
      closeConfigOverlay();
      openTripWizard({ mode: "edit", tripId: target.dataset.tripId });
      break;
    case "library-duplicate":
      duplicateTrip(target.dataset.tripId);
      if (overlayMode === "library") renderTripLibrary();
      break;
    case "library-delete": {
      const tripId = target.dataset.tripId;
      if (tripLibraryConfirm === tripId) {
        deleteTrip(tripId);
        tripLibraryConfirm = null;
        if (overlayMode === "library") renderTripLibrary();
      } else {
        tripLibraryConfirm = tripId;
        renderTripLibrary();
      }
      break;
    }
    default:
      break;
  }
}

function submitWizard() {
  if (!wizardState) return;
  const start = wizardState.data.startDate || "";
  const end = wizardState.data.endDate || start;
  if (!isValidDate(start) || !isValidDate(end)) {
    configSubtitle.textContent = "Enter valid start and end dates to continue.";
    return;
  }
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (endDate < startDate) {
    configSubtitle.textContent = "End date must be on or after the start date.";
    return;
  }

  configSubtitle.textContent =
    wizardState.mode === "new"
      ? "Set up the basics before planning."
      : "Update people, places, and your saved catalog.";

  if (wizardState.mode === "new") {
    const newState = buildStateFromWizardData(wizardState.data);
    const newId = generateTripId();
    storageBucket.trips[newId] = newState;
    storageBucket.order = storageBucket.order || [];
    if (!storageBucket.order.includes(newId)) {
      storageBucket.order.push(newId);
    }
    storageBucket.activeTripId = newId;
    activeTripId = newId;
    planState = newState;
    dateSequence = buildDateSequence(
      planState.config.range.start,
      planState.config.range.end
    );
    filterState.friend = null;
    filterState.location = null;
    refreshCatalogLookups();
    renderChrome();
    renderCalendar();
    updateFilterChips();
    closeSheet();
    closeMap();
    persistState();
    closeConfigOverlay();
  } else {
    const nextConfig = buildConfigFromWizardData(wizardState.data);
    applyConfigUpdate(nextConfig, { resetDays: false });
    closeSheet();
    closeMap();
    closeConfigOverlay();
  }
}

function buildWizardSources() {
  const sources = [{ id: "default", label: "Default template" }];
  (storageBucket.order || []).forEach((id) => {
    const state = storageBucket.trips[id];
    if (!state) return;
    sources.push({ id, label: state.config?.tripName || "Saved trip" });
  });
  return sources;
}

function getStoredTripState(tripId) {
  const raw = storageBucket.trips?.[tripId];
  if (!raw) return null;
  return normalizeState(deepClone(raw));
}

function extractWizardData(state) {
  const config = state.config || {};
  return {
    tripName: config.tripName || "Trip planner",
    startDate: config.range?.start || new Date().toISOString().slice(0, 10),
    endDate:
      config.range?.end ||
      config.range?.start ||
      new Date().toISOString().slice(0, 10),
    friends: (config.friends || []).map((name) => ({
      name,
      color: config.friendColors?.[name] || "",
    })),
    locations: (config.locationOrder || []).map((id) => ({
      id,
      label: config.locations?.[id]?.label || id,
      color: config.locations?.[id]?.color || "#1f2937",
      theme: config.defaultThemes?.[id] || config.locations?.[id]?.label || "",
    })),
    mapDefaults: {
      centerLat:
        config.mapDefaults?.center?.[0] != null
          ? String(config.mapDefaults.center[0])
          : "",
      centerLng:
        config.mapDefaults?.center?.[1] != null
          ? String(config.mapDefaults.center[1])
          : "",
      zoom:
        config.mapDefaults?.zoom != null ? String(config.mapDefaults.zoom) : "",
    },
    mapCoordinates: Object.entries(config.mapCoordinates || {}).map(
      ([id, coords]) => {
        const pair = Array.isArray(coords)
          ? coords
          : [coords?.[0], coords?.[1]];
        return {
          id,
          label: config.mapCoordinateLabels?.[id] || humanizeId(id),
          lat: pair?.[0] != null ? String(pair[0]) : "",
          lng: pair?.[1] != null ? String(pair[1]) : "",
        };
      }
    ),
    catalog: {
      activity: (config.catalog?.activity || []).map((item) => ({ ...item })),
      stay: (config.catalog?.stay || []).map((item) => ({ ...item })),
      booking: (config.catalog?.booking || []).map((item) => ({ ...item })),
    },
  };
}

function buildConfigFromWizardData(data) {
  const start = data.startDate || new Date().toISOString().slice(0, 10);
  const end = data.endDate || start;
  const friends = data.friends
    .map((entry) => entry.name.trim())
    .filter(Boolean);
  const friendColors = {};
  const palette = COLOR_PALETTES.friends;
  friends.forEach((name, index) => {
    const color = sanitizeHexColor(
      data.friends[index]?.color,
      palette[index % palette.length]
    );
    friendColors[name] = color;
  });

  const locations = {};
  const locationOrder = [];
  const defaultThemes = {};
  data.locations.forEach((entry, index) => {
    if (!entry || !entry.id) return;
    const id = entry.id;
    const label = entry.label?.trim() || id;
    locationOrder.push(id);
    locations[id] = {
      label,
      color: sanitizeHexColor(
        entry.color,
        COLOR_PALETTES.locations[index % COLOR_PALETTES.locations.length]
      ),
    };
    defaultThemes[id] = entry.theme?.trim() || label;
  });
  if (!locationOrder.length) {
    locations.general = { label: "General", color: "#1f2937" };
    locationOrder.push("general");
    defaultThemes.general = "General";
  }

  const mapCoordinates = {};
  const mapCoordinateLabels = {};
  data.mapCoordinates.forEach((entry) => {
    if (!entry.id) return;
    const lat = Number(entry.lat);
    const lng = Number(entry.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapCoordinates[entry.id] = [lat, lng];
    if (entry.label) {
      mapCoordinateLabels[entry.id] = entry.label;
    }
  });

  const catalog = { activity: [], stay: [], booking: [] };
  const locationSet = new Set(locationOrder);
  const coordinateSet = new Set(Object.keys(mapCoordinates));

  data.catalog.activity.forEach((item, index) => {
    if (!item.label) return;
    const id = item.id || generateCustomId("activity");
    const city = locationSet.has(item.city) ? item.city : locationOrder[0];
    const payload = { id, label: item.label, city };
    if (item.coord && coordinateSet.has(item.coord)) {
      payload.coord = item.coord;
    }
    if (item.locked) {
      payload.locked = true;
    }
    catalog.activity.push(payload);
  });

  ["stay", "booking"].forEach((type) => {
    data.catalog[type].forEach((item) => {
      if (!item.label) return;
      const id = item.id || generateCustomId(type);
      const city = locationSet.has(item.city) ? item.city : locationOrder[0];
      const payload = { id, label: item.label, city };
      if (item.url) {
        payload.url = item.url;
      }
      catalog[type].push(payload);
    });
  });

  return {
    tripName: (data.tripName || "").trim() || "Trip planner",
    range: { start, end },
    friends,
    friendColors,
    locations,
    locationOrder,
    defaultThemes,
    mapDefaults: resetDays ? null : previousConfig?.mapDefaults || null,
    mapCoordinates: resetDays ? {} : previousConfig?.mapCoordinates || {},
    routing: previousConfig?.routing
      ? { ...previousConfig.routing }
      : { provider: 'openrouteservice', openRouteApiKey: '' },
    catalog,
  };
}

function buildStateFromWizardData(data) {
  const config = buildConfigFromWizardData(data);
  const sequence = buildDateSequence(config.range.start, config.range.end);
  const days = {};
  sequence.forEach((dateKey) => {
    days[dateKey] = createEmptyDay(config);
  });
  return { config, days };
}

function buildMapDefaultsObject(raw) {
  if (!raw) return null;
  if (raw.centerLat === "" || raw.centerLng === "") return null;
  const lat = Number(raw.centerLat);
  const lng = Number(raw.centerLng);
  const zoom = Number(raw.zoom);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const result = { center: [lat, lng] };
  if (Number.isFinite(zoom)) {
    result.zoom = zoom;
  }
  return result;
}

function applyConfigUpdate(nextConfig, { resetDays = false } = {}) {
  const config = {
    tripName: nextConfig.tripName || "Trip planner",
    range: { ...nextConfig.range },
    friends: Array.isArray(nextConfig.friends) ? nextConfig.friends : [],
    friendColors: assignFriendColors(
      nextConfig.friends || [],
      nextConfig.friendColors || {}
    ),
    locations: nextConfig.locations || {},
    locationOrder: Array.isArray(nextConfig.locationOrder)
      ? nextConfig.locationOrder
      : Object.keys(nextConfig.locations || {}),
    defaultThemes: { ...(nextConfig.defaultThemes || {}) },
    mapDefaults: nextConfig.mapDefaults ? { ...nextConfig.mapDefaults } : null,
    mapCoordinates: deepClone(nextConfig.mapCoordinates || {}),
    mapCoordinateLabels: { ...(nextConfig.mapCoordinateLabels || {}) },
    catalog: {
      activity: Array.isArray(nextConfig.catalog?.activity)
        ? nextConfig.catalog.activity.map((item) => ({ ...item }))
        : [],
      stay: Array.isArray(nextConfig.catalog?.stay)
        ? nextConfig.catalog.stay.map((item) => ({ ...item }))
        : [],
      booking: Array.isArray(nextConfig.catalog?.booking)
        ? nextConfig.catalog.booking.map((item) => ({ ...item }))
        : [],
    },
  };

  const sequence = buildDateSequence(config.range.start, config.range.end);
  const newDays = {};
  if (resetDays) {
    sequence.forEach((dateKey) => {
      newDays[dateKey] = createEmptyDay(config);
    });
  } else {
    const friendSet = new Set(config.friends);
    const activitySet = new Set(config.catalog.activity.map((item) => item.id));
    const staySet = new Set(config.catalog.stay.map((item) => item.id));
    sequence.forEach((dateKey) => {
      const existing = planState.days?.[dateKey];
      const cloned = cloneDay(existing, config);
      cloned.friends = cloned.friends.filter((friend) => friendSet.has(friend));
      ["morning", "afternoon", "evening"].forEach((slot) => {
        cloned.slots[slot] = (cloned.slots[slot] || []).filter((id) =>
          activitySet.has(id)
        );
      });
      cloned.stay =
        cloned.stay && staySet.has(cloned.stay) ? cloned.stay : null;
      if (!config.locations[cloned.loc]) {
        cloned.loc = getDefaultLocationId(config);
      }
      if (cloned.locks) {
        Object.keys(cloned.locks).forEach((key) => {
          if (!activitySet.has(key)) {
            delete cloned.locks[key];
          }
        });
      }
      newDays[dateKey] = cloned;
    });
  }

  planState = { config, days: newDays };
  dateSequence = sequence;
  filterState.friend = config.friends.includes(filterState.friend)
    ? filterState.friend
    : null;
  filterState.location = config.locations[filterState.location]
    ? filterState.location
    : null;
  refreshCatalogLookups();
  renderChrome();
  renderCalendar();
  updateFilterChips();
  persistState();
}

function setActiveTrip(tripId) {
  if (!tripId || !storageBucket.trips?.[tripId]) return;
  activeTripId = tripId;
  storageBucket.activeTripId = tripId;
  planState = normalizeState(storageBucket.trips[tripId]) || planState;
  storageBucket.trips[tripId] = planState;
  dateSequence = buildDateSequence(
    planState.config.range.start,
    planState.config.range.end
  );
  filterState.friend = planState.config.friends.includes(filterState.friend)
    ? filterState.friend
    : null;
  filterState.location = planState.config.locations[filterState.location]
    ? filterState.location
    : null;
  refreshCatalogLookups();
  renderChrome();
  renderCalendar();
  updateFilterChips();
  persistState();
}

function duplicateTrip(tripId) {
  const source = storageBucket.trips?.[tripId];
  if (!source) return;
  const clone = normalizeState(deepClone(source));
  clone.config.tripName = `${clone.config.tripName || "Trip"} copy`;
  const newId = generateTripId();
  storageBucket.trips[newId] = clone;
  storageBucket.order = storageBucket.order || [];
  storageBucket.order.push(newId);
  storageBucket.activeTripId = newId;
  activeTripId = newId;
  planState = clone;
  dateSequence = buildDateSequence(
    planState.config.range.start,
    planState.config.range.end
  );
  filterState.friend = null;
  filterState.location = null;
  refreshCatalogLookups();
  renderChrome();
  renderCalendar();
  updateFilterChips();
  persistState();
}

function deleteTrip(tripId) {
  if (!storageBucket.trips?.[tripId]) return;
  delete storageBucket.trips[tripId];
  storageBucket.order = (storageBucket.order || []).filter(
    (id) => id !== tripId
  );
  if (!storageBucket.order.length) {
    const { id, state } = createNewTripState(DEFAULT_TRIP_TEMPLATE);
    storageBucket.trips[id] = state;
    storageBucket.order.push(id);
    activeTripId = id;
    storageBucket.activeTripId = id;
    planState = state;
  } else if (activeTripId === tripId) {
    const nextId = storageBucket.order[0];
    storageBucket.activeTripId = nextId;
    activeTripId = nextId;
    planState = normalizeState(storageBucket.trips[nextId]);
  }
  dateSequence = buildDateSequence(
    planState.config.range.start,
    planState.config.range.end
  );
  filterState.friend = planState.config.friends.includes(filterState.friend)
    ? filterState.friend
    : null;
  filterState.location = planState.config.locations[filterState.location]
    ? filterState.location
    : null;
  refreshCatalogLookups();
  renderChrome();
  renderCalendar();
  updateFilterChips();
  persistState();
}

function closeConfigOverlay() {
  overlayMode = null;
  wizardState = null;
  tripLibraryConfirm = null;
  configOverlay.classList.remove("is-open");
  configOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("config-open");
  configSubtitle.textContent = "";
}

function formatIcsDateTime(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatSummaryDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return `${month} ${date.getDate()}`;
}

function generateCustomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function generateTripId() {
  return generateCustomId("trip");
}

let uniqueIdCounter = 0;

function nextId(prefix = "field") {
  uniqueIdCounter += 1;
  return `${prefix}-${uniqueIdCounter}`;
}

function sanitizeHexColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const hex = value.trim();
  return /^#([0-9a-fA-F]{6})$/.test(hex) ? hex : fallback;
}

function humanizeId(value) {
  if (!value) return "";
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function generateCoordinateIdFromLabel(
  label,
  existing = planState?.config?.mapCoordinates || {}
) {
  const base = slugify(label || "pin", "pin");
  let candidate = base;
  let counter = 2;
  while (existing[candidate]) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

function generateUniqueLocationId(label) {
  const existing = new Set(
    (wizardState?.data.locations || []).map((loc) => loc.id)
  );
  const base = slugify(label || "place", "place");
  let candidate = base;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

function createLabeledInput({
  label,
  type = "text",
  value = "",
  placeholder = "",
  required = false,
  step,
  min,
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-field";
  const labelEl = document.createElement("label");
  labelEl.className = "form-label";
  const inputId = nextId("input");
  labelEl.setAttribute("for", inputId);
  labelEl.textContent = label;
  const input = document.createElement("input");
  input.id = inputId;
  input.className = "form-input";
  input.type = type;
  if (value !== null && value !== undefined) {
    input.value = value;
  }
  if (placeholder) {
    input.placeholder = placeholder;
  }
  if (required) {
    input.required = true;
  }
  if (step !== undefined) {
    input.step = step;
  }
  if (min !== undefined) {
    input.min = min;
  }
  wrapper.append(labelEl, input);
  return { wrapper, input };
}

function createLabeledSelect({ label, value = "", options = [] }) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-field";
  const labelEl = document.createElement("label");
  labelEl.className = "form-label";
  const selectId = nextId("select");
  labelEl.setAttribute("for", selectId);
  labelEl.textContent = label;
  const select = document.createElement("select");
  select.id = selectId;
  select.className = "form-select";
  options.forEach((option) => {
    const optEl = document.createElement("option");
    optEl.value = option.value;
    optEl.textContent = option.label;
    select.appendChild(optEl);
  });
  if (value !== undefined && value !== null) {
    select.value = value;
  }
  wrapper.append(labelEl, select);
  return { wrapper, select };
}

function createToggleField({ label, checked = false }) {
  const wrapper = document.createElement("label");
  wrapper.className = "form-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const span = document.createElement("span");
  span.textContent = label;
  wrapper.append(input, span);
  return { wrapper, input };
}

function slugify(value, fallback = "trip") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}

function lightenColor(color, strength = 0.5) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const mix = (component) =>
    Math.round(component + (255 - component) * strength);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

function hexToRgb(color) {
  if (!color || typeof color !== "string") return null;
  const hex = color.replace("#", "");
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

function isValidDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(timestamp);
}
