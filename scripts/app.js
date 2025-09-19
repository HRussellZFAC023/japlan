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
const sheetEl = document.getElementById("sheet");
const sheetBackdrop = document.getElementById("sheetBackdrop");
const sheetTitle = document.getElementById("sheetTitle");
const sheetSubtitle = document.getElementById("sheetSubtitle");
const sheetBody = document.getElementById("sheetBody");
const itemOverlay = document.getElementById("itemOverlay");
const itemDetailTitle = document.getElementById("itemDetailTitle");
const itemDetailSubtitle = document.getElementById("itemDetailSubtitle");
const itemDetailDescription = document.getElementById("itemDetailDescription");
const itemDetailMedia = document.getElementById("itemDetailMedia");
const itemDetailImage = document.getElementById("itemDetailImage");
const itemDetailMeta = document.getElementById("itemDetailMeta");
const itemDetailLinks = document.getElementById("itemDetailLinks");
const mapOverlay = document.getElementById("mapOverlay");
const mapSummaryEl = document.getElementById("mapSummary");
const mapDirectionsEl = document.getElementById("mapDirections");
const closeSheetBtn = sheetEl.querySelector('[data-action="close-sheet"]');
const closeItemBtn = itemOverlay?.querySelector('[data-action="close-item"]');
const closeMapBtn = mapOverlay.querySelector('[data-action="close-map"]');
const configOverlay = document.getElementById("configOverlay");
const configContent = document.getElementById("configContent");
const configTitle = document.getElementById("configTitle");
const configSubtitle = document.getElementById("configSubtitle");
const closeConfigBtn = document.querySelector('[data-action="close-config"]');
const mapModeControls = mapOverlay
  ? mapOverlay.querySelector(".overlay__controls")
  : null;
const mapModeToggle =
  mapModeControls?.querySelector('[data-role="mode-toggle"]') || null;
const mapModeButtons = mapModeToggle
  ? Array.from(mapModeToggle.querySelectorAll("[data-map-mode]"))
  : [];

let storageBucket = loadStorageBucket();
let activeTripId = storageBucket.activeTripId || null;
let planState = initializeState();
let dateSequence = buildDateSequence(
  planState.config.range.start,
  planState.config.range.end
);
let ACTIVITY_MAP = new Map();
let STAY_MAP = new Map();
let BOOKING_MAP = new Map();
refreshCatalogLookups();
let editing = false;
let filterState = { friend: null, location: null };
let sheetState = { open: false, day: null, slot: "morning", tab: "activity" };
let cardDragSource = null;
let chipDragData = null;
let mapInstance = null;
let mapMarkersLayer = null;
let mapRouteLayer = null;
let mapStepHighlightLayer = null;
let mapOverlayMode = "transit";
let overlayMode = null;
let activeMapDate = null;
let activeItemDetail = null;
const travelRequests = new Map();
const travelExpansionState = new Map();
const mapModeState = new Map();
let mapDirectionsData = null;
const DEFAULT_DEPARTURE_MINUTES = 9 * 60;
let routingKeyPromptActive = false;
let googleRoutingKeyPromptActive = false;
let wizardState = null;
let tripLibraryConfirm = null;
let uniqueIdCounter = 0;

const MODE_TO_PROFILE = {
  transit: "public-transport",
  walking: "foot-walking",
  driving: "driving-car",
};

const PROFILE_TO_MODE = Object.entries(MODE_TO_PROFILE).reduce(
  (acc, [mode, profile]) => {
    acc[profile] = mode;
    return acc;
  },
  {}
);

const MODE_COLORS = {
  transit: "#2563eb",
  walking: "#0f766e",
  driving: "#f97316",
};

const VALID_ROUTING_PROFILES = new Set(Object.values(MODE_TO_PROFILE));

const DEFAULT_ROUTING_PROVIDER = "openrouteservice";
const HYBRID_ROUTING_PROVIDER = "hybrid-routing";

const ROUTING_PROVIDER_LABELS = {
  "openrouteservice": "OpenRouteService",
  "google-directions": "Google Directions",
};

const SUPPORTED_ROUTING_PROVIDERS = new Set([
  "openrouteservice",
  "google-directions",
  "auto",
]);

const EMBEDDED_KEY_PREFIXES = {
  google: "gapi:",
};

function getGlobalScope() {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof self !== "undefined") {
    return self;
  }
  if (typeof global !== "undefined") {
    return global;
  }
  return null;
}

function decodeBase64Value(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const scope = getGlobalScope();
    if (scope) {
      if (typeof scope.atob === "function") {
        return scope.atob(trimmed);
      }
      if (
        typeof scope.Buffer === "function" &&
        typeof scope.Buffer.from === "function"
      ) {
        return scope.Buffer.from(trimmed, "base64").toString("utf-8");
      }
    }
  } catch (error) {
    console.warn("Failed to decode base64 value.", error);
  }
  return "";
}

function encodeBase64Value(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const scope = getGlobalScope();
    if (scope) {
      if (typeof scope.btoa === "function") {
        return scope.btoa(trimmed);
      }
      if (
        typeof scope.Buffer === "function" &&
        typeof scope.Buffer.from === "function"
      ) {
        return scope.Buffer.from(trimmed, "utf-8").toString("base64");
      }
    }
  } catch (error) {
    console.warn("Failed to encode base64 value.", error);
  }
  return "";
}

function revealEmbeddedApiKey(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const googlePrefix = EMBEDDED_KEY_PREFIXES.google;
  if (googlePrefix && trimmed.startsWith(googlePrefix)) {
    const payload = trimmed
      .slice(googlePrefix.length)
      .replace(/[^A-Za-z0-9+/=]/g, "");
    if (!payload) {
      return "";
    }
    const decoded = decodeBase64Value(payload);
    return decoded || "";
  }
  return trimmed;
}

function encodeGoogleApiKeyForStorage(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const googlePrefix = EMBEDDED_KEY_PREFIXES.google;
  if (googlePrefix && trimmed.startsWith(googlePrefix)) {
    return trimmed;
  }
  const encoded = encodeBase64Value(trimmed);
  if (!encoded) {
    return trimmed;
  }
  const chunkSize = 12;
  const chunks = [];
  for (let index = 0; index < encoded.length; index += chunkSize) {
    chunks.push(encoded.slice(index, index + chunkSize));
  }
  return `${googlePrefix}${chunks.join(".")}`;
}

function normalizeRoutingProvider(value, { allowAuto = false } = {}) {
  if (typeof value !== "string") {
    return allowAuto ? "auto" : DEFAULT_ROUTING_PROVIDER;
  }
  const normalized = value.trim().toLowerCase();
  if (allowAuto) {
    if (!normalized || normalized === "auto" || normalized === "hybrid") {
      return "auto";
    }
  } else if (!normalized) {
    return DEFAULT_ROUTING_PROVIDER;
  }
  switch (normalized) {
    case "ors":
    case "openroute":
    case "openrouteservice":
      return "openrouteservice";
    case "google":
    case "google_directions":
    case "googledirections":
    case "google-directions":
      return "google-directions";
    case "auto":
      return allowAuto ? "auto" : DEFAULT_ROUTING_PROVIDER;
    default:
      return SUPPORTED_ROUTING_PROVIDERS.has(normalized)
        ? normalized
        : DEFAULT_ROUTING_PROVIDER;
  }
}

function resolveRoutingProviders(routing = {}) {
  const baseRaw = normalizeRoutingProvider(routing.provider, { allowAuto: true });
  const base = baseRaw === "auto" ? DEFAULT_ROUTING_PROVIDER : baseRaw;
  const drivingRaw = normalizeRoutingProvider(routing.drivingProvider, {
    allowAuto: true,
  });
  const walkingRaw = normalizeRoutingProvider(routing.walkingProvider, {
    allowAuto: true,
  });
  let transit = normalizeRoutingProvider(routing.transitProvider, {
    allowAuto: true,
  });
  const driving = drivingRaw === "auto" ? base : drivingRaw || base;
  const walking = walkingRaw === "auto" ? base : walkingRaw || base;
  if (transit === "auto") {
    const googleKey = revealEmbeddedApiKey(routing.googleApiKey);
    if (googleKey) {
      transit = "google-directions";
    } else if (baseRaw !== "auto") {
      transit = base;
    } else {
      transit = DEFAULT_ROUTING_PROVIDER;
    }
  }
  return { base, driving, walking, transit };
}

function providerNeedsOpenRoute(provider) {
  return normalizeRoutingProvider(provider) === "openrouteservice";
}

function providerNeedsGoogle(provider) {
  return normalizeRoutingProvider(provider) === "google-directions";
}

function getRoutingProviderDisplayName(provider) {
  const key = normalizeRoutingProvider(provider, { allowAuto: true });
  if (key === "auto") {
    return "routing";
  }
  return ROUTING_PROVIDER_LABELS[key] || key;
}

const JAPAN_RAIL_REFERENCE = [
  {
    route: "Kansai Airport → Shin-Osaka",
    services: "JR Haruka Limited Express",
    keyStops: "Tennoji, Osaka",
    duration: "50 min",
    cost: "1,800 JPY",
    pass: "Fully covered",
  },
  {
    route: "Kansai Airport → Kyoto",
    services: "JR Haruka Limited Express",
    keyStops: "Tennoji, Osaka, Shin-Osaka",
    duration: "80 min",
    cost: "2,200 JPY",
    pass: "Fully covered",
  },
  {
    route: "Shin-Osaka → Kyoto",
    services: "JR Special Rapid / Shinkansen",
    keyStops: "Direct",
    duration: "25 min / 15 min",
    cost: "580 JPY / 1,450 JPY",
    pass: "Fully covered",
  },
  {
    route: "Osaka → Nara",
    services: "JR Yamatoji Rapid Service",
    keyStops: "Tennoji",
    duration: "50 min",
    cost: "810 JPY",
    pass: "Fully covered",
  },
  {
    route: "Osaka → Himeji",
    services: "JR Special Rapid / Shinkansen",
    keyStops: "Kobe, Akashi",
    duration: "65 min / 30 min",
    cost: "1,520 JPY / 3,280 JPY",
    pass: "Fully covered",
  },
  {
    route: "Osaka → Kobe (Sannomiya)",
    services: "JR Special Rapid Service",
    keyStops: "Amagasaki, Ashiya",
    duration: "25 min",
    cost: "420 JPY",
    pass: "Fully covered",
  },
];

function getModeLabel(mode) {
  switch (mode) {
    case "transit":
      return "Transit";
    case "walking":
      return "Walking";
    case "driving":
      return "Driving";
    default:
      return "Travel";
  }
}

function isModeReady(details) {
  return details && details.status === "ready";
}

function getActiveTravelMode(travel) {
  if (!travel) return null;
  if (typeof travel.mode === "string" && travel.mode) {
    return travel.mode;
  }
  return PROFILE_TO_MODE[travel.profile] || null;
}

function getModeDetails(travel, mode) {
  if (!travel || !mode) return null;
  if (travel.modes && travel.modes[mode]) {
    return travel.modes[mode];
  }
  switch (mode) {
    case "transit":
      return travel.transit || null;
    case "walking":
      return travel.walking || null;
    case "driving":
      return travel.driving || null;
    default:
      return null;
  }
}

function getDefaultMapMode(travel) {
  if (!travel || travel.status !== "ready") {
    return "transit";
  }
  if (isModeReady(getModeDetails(travel, "transit"))) return "transit";
  if (isModeReady(getModeDetails(travel, "walking"))) return "walking";
  if (isModeReady(getModeDetails(travel, "driving"))) return "driving";
  return getActiveTravelMode(travel) || "transit";
}

function getMapModeForDate(dateKey) {
  if (!dateKey) return "transit";
  if (mapModeState.has(dateKey)) {
    return mapModeState.get(dateKey);
  }
  const day = ensureDay(dateKey);
  const travel = day.travel;
  const mode = getDefaultMapMode(travel);
  mapModeState.set(dateKey, mode);
  return mode;
}

function setMapModeForDate(dateKey, mode) {
  if (!dateKey || !mode) return;
  mapModeState.set(dateKey, mode);
}

function updateMapModeUI(dateKey) {
  if (!mapModeControls) return;
  const day = ensureDay(dateKey);
  const travel = day.travel;
  if (!travel || travel.status !== "ready") {
    mapModeControls.style.display = "none";
    mapModeButtons.forEach((btn) => {
      btn.classList.remove("mode-toggle__btn--active");
      btn.setAttribute("aria-pressed", "false");
      btn.disabled = true;
    });
    return;
  }

  mapModeControls.style.display = "";
  const currentMode = getMapModeForDate(dateKey);
  mapModeButtons.forEach((btn) => {
    const mode = btn.dataset.mapMode;
    const details = getModeDetails(travel, mode);
    const ready = isModeReady(details);
    const color = MODE_COLORS[mode] || "#64748b";
    btn.style.setProperty("--mode-color", color);
    btn.classList.add(`mode-toggle__btn--${mode}`);
    btn.disabled = !ready;
    const isActive = mode === currentMode;
    if (isActive) {
      btn.classList.add("mode-toggle__btn--active");
    } else {
      btn.classList.remove("mode-toggle__btn--active");
    }
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

renderChrome();
renderCalendar();
updateFilterChips();
attachToolbarEvents();
attachGlobalShortcuts();
if (mapDirectionsEl) {
  mapDirectionsEl.addEventListener("click", handleDirectionsInteraction);
  mapDirectionsEl.addEventListener("keydown", handleDirectionsKeydown);
}
if (mapModeToggle) {
  mapModeToggle.addEventListener("click", handleMapModeClick);
}
if (mapModeControls) {
  mapModeControls.style.display = "none";
}

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

function getDateIndex(dateKey) {
  if (!dateKey) return -1;
  return dateSequence.indexOf(dateKey);
}

function getAdjacentDateKey(dateKey, offset) {
  if (!Number.isInteger(offset) || !offset) return null;
  const index = getDateIndex(dateKey);
  if (index < 0) return null;
  return dateSequence[index + offset] || null;
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
      provider: template.routing?.provider || "openrouteservice",
      openRouteApiKey: template.routing?.openRouteApiKey || "",
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
  const mergedCoordinates = {
    ...(template.mapCoordinates || {}),
    ...(rawConfig.mapCoordinates || {}),
  };

  const rawRouting = rawConfig.routing || {};
  const templateRouting = template.routing || {};
  const baseProviderRaw =
    rawRouting.provider ||
    templateRouting.provider ||
    DEFAULT_ROUTING_PROVIDER;
  const normalizedBase = normalizeRoutingProvider(baseProviderRaw, {
    allowAuto: true,
  });
  const fallbackBase =
    normalizedBase === "auto" ? DEFAULT_ROUTING_PROVIDER : normalizedBase;
  const drivingProviderRaw =
    rawRouting.drivingProvider ||
    templateRouting.drivingProvider ||
    baseProviderRaw;
  const walkingProviderRaw =
    rawRouting.walkingProvider ||
    templateRouting.walkingProvider ||
    baseProviderRaw;
  const transitProviderRaw =
    rawRouting.transitProvider ||
    templateRouting.transitProvider ||
    "auto";
  const normalizedDriving = normalizeRoutingProvider(drivingProviderRaw, {
    allowAuto: true,
  });
  const normalizedWalking = normalizeRoutingProvider(walkingProviderRaw, {
    allowAuto: true,
  });
  const normalizedTransit = normalizeRoutingProvider(transitProviderRaw, {
    allowAuto: true,
  });
  const config = {
    tripName: rawConfig.tripName || template.tripName || "Trip Planner",
    range: { start: fallbackStart, end: fallbackEnd },
    friends,
    friendColors: assignFriendColors(friends, rawConfig.friendColors || {}),
    locations,
    locationOrder,
    defaultThemes: { ...(rawConfig.defaultThemes || {}) },
    mapDefaults: rawConfig.mapDefaults
      ? { ...rawConfig.mapDefaults }
      : template.mapDefaults || null,
    mapCoordinates: deepClone(mergedCoordinates),
    routing: {
      provider: normalizedBase,
      drivingProvider:
        normalizedDriving === "auto" ? fallbackBase : normalizedDriving,
      walkingProvider:
        normalizedWalking === "auto" ? fallbackBase : normalizedWalking,
      transitProvider: normalizedTransit,
      openRouteApiKey:
        typeof rawRouting.openRouteApiKey === "string"
          ? rawRouting.openRouteApiKey.trim()
          : typeof templateRouting.openRouteApiKey === "string"
          ? templateRouting.openRouteApiKey.trim()
          : "",
      googleApiKey:
        typeof rawRouting.googleApiKey === "string"
          ? rawRouting.googleApiKey.trim()
          : typeof templateRouting.googleApiKey === "string"
          ? templateRouting.googleApiKey.trim()
          : "",
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
  BOOKING_MAP = new Map(
    (planState.config.catalog.booking || []).map((item) => [item.id, item])
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
  day.theme = day.theme ?? "";
  if (typeof day.stay === "string") {
    const trimmedStay = day.stay.trim();
    day.stay = trimmedStay || null;
  } else {
    day.stay = day.stay || null;
  }
  if (!day.travel || typeof day.travel !== "object") {
    day.travel = null;
  }
  return day;
}

function getCoordinateValue(coordRef) {
  if (!coordRef) return null;
  if (
    Array.isArray(coordRef) &&
    coordRef.length === 2 &&
    Number.isFinite(coordRef[0]) &&
    Number.isFinite(coordRef[1])
  ) {
    return [Number(coordRef[0]), Number(coordRef[1])];
  }
  if (typeof coordRef === "string") {
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
  let label = "";
  let coordRef = null;

  if (typeof stayRef === "string") {
    stayId = stayRef.trim();
  } else if (typeof stayRef === "object") {
    if (typeof stayRef.id === "string" && stayRef.id.trim()) {
      stayId = stayRef.id.trim();
    }
    if (!label && typeof stayRef.label === "string" && stayRef.label.trim()) {
      label = stayRef.label.trim();
    } else if (
      !label &&
      typeof stayRef.name === "string" &&
      stayRef.name.trim()
    ) {
      label = stayRef.name.trim();
    }
    coordRef = stayRef.coord || stayRef.coords || stayRef.location || null;
    if (
      !coordRef &&
      Number.isFinite(stayRef.lat) &&
      Number.isFinite(stayRef.lng)
    ) {
      coordRef = [Number(stayRef.lat), Number(stayRef.lng)];
    } else if (
      !coordRef &&
      Number.isFinite(stayRef.latitude) &&
      Number.isFinite(stayRef.longitude)
    ) {
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
    label: label || stayId || "Stay",
    coords: coords || null,
  };
}

function buildItineraryForDay(day, dateKey) {
  const stay = getStayInfo(day);
  if (!stay) {
    return {
      status: "missing-stay",
      stay: null,
      activities: [],
      skipped: [],
      routePoints: [],
      signature: "",
    };
  }

  const activities = [];
  const skipped = [];
  const previousDateKey = dateKey ? getAdjacentDateKey(dateKey, -1) : null;
  const previousDay = previousDateKey
    ? planState.days?.[previousDateKey]
    : null;
  const previousStay = previousDay ? getStayInfo(previousDay) : null;
  const originFromPrevious = previousStay?.coords ? previousStay : null;
  let originActivityId = null;

  ["morning", "afternoon", "evening"].forEach((slot) => {
    (day.slots?.[slot] || []).forEach((itemId) => {
      const activity = ACTIVITY_MAP.get(itemId);
      if (!activity) return;
      if (activity.skipRoute) return;
      const coords = getCoordinateValue(activity.coord);
      if (!coords) {
        skipped.push(activity.label || itemId);
        return;
      }
      activities.push({ id: itemId, label: activity.label || itemId, coords });
    });
  });

  if (!stay.coords) {
    skipped.unshift(stay.label || "Stay location");
    return {
      status: "insufficient-data",
      stay,
      originStay: previousStay || stay,
      activities,
      skipped,
      routePoints: [],
      signature: "",
    };
  }

  let originStay = originFromPrevious || null;
  if (!originStay && activities.length) {
    const firstDistinct = activities.find(
      (activity) => !coordsEqual(activity.coords, stay.coords)
    );
    if (firstDistinct) {
      originActivityId = firstDistinct.id || null;
      originStay = {
        id: originActivityId ? `activity-origin-${originActivityId}` : null,
        label: firstDistinct.label || "Start location",
        coords: firstDistinct.coords,
      };
    }
  }
  if (!originStay) {
    originStay = stay;
  }

  if (previousStay && !previousStay.coords) {
    skipped.unshift(previousStay.label || "Previous stay");
  }

  const routePoints = [originStay.coords];
  if (!originActivityId && !coordsEqual(originStay.coords, stay.coords)) {
    routePoints.push(stay.coords);
  }
  activities.forEach((activity) => {
    if (originActivityId && activity.id === originActivityId) {
      return;
    }
    if (originActivityId && coordsEqual(activity.coords, originStay.coords)) {
      return;
    }
    routePoints.push(activity.coords);
  });
  if (!coordsEqual(routePoints[routePoints.length - 1] || [], stay.coords)) {
    routePoints.push(stay.coords);
  }

  const normalizedRoutePoints = normalizeRoutePoints(routePoints);
  const status = normalizedRoutePoints.length > 1 ? "ok" : "no-activities";
  const signature = buildRouteSignature(normalizedRoutePoints);

  return {
    status,
    stay,
    originStay,
    activities,
    skipped,
    routePoints: normalizedRoutePoints,
    signature,
  };
}

function buildRouteSignature(points) {
  if (!Array.isArray(points) || !points.length) {
    return "";
  }
  return points
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length !== 2) return "na";
      const [lat, lon] = coord;
      return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
    })
    .join("|");
}

function normalizeRoutePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }
  const normalized = [];
  let previousKey = null;

  points.forEach((coord, index) => {
    if (!Array.isArray(coord) || coord.length !== 2) {
      return;
    }
    const lat = Number(coord[0]);
    const lon = Number(coord[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    const isLast = index === points.length - 1;

    if (!normalized.length || key !== previousKey) {
      normalized.push([lat, lon]);
      previousKey = key;
      return;
    }

    if (isLast) {
      normalized.push([lat, lon]);
      previousKey = key;
    }
  });

  return normalized;
}

function coordsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== 2 || b.length !== 2) return false;
  return (
    Number(a[0]).toFixed(6) === Number(b[0]).toFixed(6) &&
    Number(a[1]).toFixed(6) === Number(b[1]).toFixed(6)
  );
}

function serializeCoords(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const lat = Number(coords[0]);
  const lon = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function toLatLng(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const lon = Number(point[0]);
  const lat = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function geometryToLatLngs(geometry) {
  if (!geometry || typeof geometry !== "object") return [];
  const { type, coordinates } = geometry;
  if (type === "LineString" && Array.isArray(coordinates)) {
    return coordinates.map(toLatLng).filter(Boolean);
  }
  if (type === "MultiLineString" && Array.isArray(coordinates)) {
    const flattened = [];
    coordinates.forEach((segment) => {
      if (!Array.isArray(segment)) return;
      segment.forEach((point) => {
        const latLng = toLatLng(point);
        if (latLng) flattened.push(latLng);
      });
    });
    return flattened;
  }
  return [];
}

function extractLegPath(geometry, wayPoints) {
  if (!geometry || typeof geometry !== "object") return null;
  if (!Array.isArray(wayPoints) || wayPoints.length !== 2) return null;
  const [startRaw, endRaw] = wayPoints;
  if (!Number.isInteger(startRaw) || !Number.isInteger(endRaw)) return null;

  let coordinates = null;
  if (geometry.type === "MultiLineString") {
    const flat = Array.isArray(geometry.coordinates)
      ? geometry.coordinates.flat().filter(Array.isArray)
      : null;
    coordinates = Array.isArray(flat) ? flat : null;
  } else if (geometry.type === "LineString") {
    coordinates = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : null;
  }
  if (!coordinates || coordinates.length < 2) return null;

  const startIndex = Math.max(0, Math.min(startRaw, endRaw));
  const endIndex = Math.min(coordinates.length - 1, Math.max(startRaw, endRaw));
  if (endIndex <= startIndex) {
    const point = toLatLng(coordinates[startIndex]);
    return point ? [point] : null;
  }
  const slice = coordinates.slice(startIndex, endIndex + 1);
  const latLngs = slice.map(toLatLng).filter(Boolean);
  return latLngs.length ? latLngs : null;
}

function computeBoundsFromPath(path) {
  if (!Array.isArray(path) || !path.length) return null;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  path.forEach((point) => {
    if (!Array.isArray(point) || point.length !== 2) return;
    const [lat, lon] = point.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  });
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLon) ||
    !Number.isFinite(maxLon)
  ) {
    return null;
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function buildLineStringFromPoints(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const coords = points
    .map((coord) =>
      Array.isArray(coord) && coord.length === 2
        ? [Number(coord[1]), Number(coord[0])]
        : null
    )
    .filter(Boolean);
  if (coords.length < 2) return null;
  return {
    type: "LineString",
    coordinates: coords,
  };
}

function decodePolyline(encoded) {
  if (typeof encoded !== "string" || !encoded.length) return [];
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
}

function appendPath(target, segment) {
  if (!Array.isArray(target) || !Array.isArray(segment)) return;
  segment.forEach((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) return;
    const lat = Number(point[0]);
    const lon = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (target.length) {
      const last = target[target.length - 1];
      if (coordsEqual(last, [lat, lon]) && index === 0) {
        return;
      }
    }
    target.push([lat, lon]);
  });
}

function stripHtml(input) {
  if (typeof input !== "string") return "";
  if (typeof window !== "undefined" && window.document) {
    const div = window.document.createElement("div");
    div.innerHTML = input;
    const text = div.textContent || div.innerText || "";
    return text.replace(/\s+/g, " ").trim();
  }
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function haversineDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const toRad = (value) => (value * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sLat1 = toRad(lat1);
  const sLat2 = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(sLat1) * Math.cos(sLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function estimateRouteDistance(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineDistance(points[i - 1], points[i]);
  }
  return total;
}

function serializeStay(stay) {
  if (!stay) return null;
  return {
    id: stay.id || null,
    label: stay.label || "",
    coords: serializeCoords(stay.coords) || null,
  };
}

function serializeActivities(list) {
  if (!Array.isArray(list)) return [];
  return list.map((activity) => ({
    id: activity.id || null,
    label: activity.label || "",
    coords: serializeCoords(activity.coords) || null,
  }));
}

function staysMatch(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.id && b.id) {
    return a.id === b.id;
  }
  if (Array.isArray(a.coords) && Array.isArray(b.coords)) {
    return coordsEqual(a.coords, b.coords);
  }
  return (a.label || "").trim() === (b.label || "").trim();
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "";
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.max(0, totalMinutes - hours * 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters >= 1000) {
    const km = meters / 1000;
    const precision = km >= 10 ? 0 : 1;
    return `${km.toFixed(precision)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatTimeLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseLabelTimeMinutes(label) {
  if (typeof label !== "string") return null;
  const match = label.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    minutes > 59 ||
    hours > 47
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function getPreferredDepartureMinutes(day) {
  if (!day) return DEFAULT_DEPARTURE_MINUTES;
  const minutes = [];
  ["morning", "afternoon", "evening"].forEach((slot) => {
    (day.slots?.[slot] || []).forEach((itemId) => {
      const label = getActivityLabel(itemId);
      const value = parseLabelTimeMinutes(label);
      if (value !== null) {
        minutes.push(value);
      }
    });
  });
  if (minutes.length) {
    return Math.min(...minutes);
  }
  return DEFAULT_DEPARTURE_MINUTES;
}

function formatMissingRoutingKeyMessage(travel, fallback = "Add routing API keys to calculate travel time.") {
  const providers = Array.isArray(travel?.missingProviders)
    ? travel.missingProviders
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
    : [];
  if (!providers.length) {
    return fallback;
  }
  if (providers.length === 1) {
    return `Add your ${providers[0]} API key to calculate travel time.`;
  }
  if (providers.length === 2) {
    return `Add your ${providers[0]} and ${providers[1]} API keys to calculate travel time.`;
  }
  const leading = providers.slice(0, -1).join(", ");
  const last = providers[providers.length - 1];
  return `Add your ${leading}, and ${last} API keys to calculate travel time.`;
}

function buildTravelDisplay(plan) {
  const travel = plan.travel;
  if (!plan.stay) {
    return {
      text: "Travel: add stay",
      state: "warning",
      title: "Pick a stay with map coordinates to calculate travel time.",
    };
  }
  if (!travel) {
    return {
      text: "Travel: calculating…",
      state: "pending",
      title: "Travel time will be calculated soon.",
    };
  }

  const skippedCount = Array.isArray(travel.skipped)
    ? travel.skipped.length
    : 0;
  const skippedTitle = skippedCount
    ? `${skippedCount} stop${skippedCount === 1 ? "" : "s"} missing map pins`
    : "";
  const originLabel =
    typeof travel.originStay?.label === "string"
      ? travel.originStay.label.trim()
      : "";
  const destinationLabel =
    typeof travel.destinationStay?.label === "string"
      ? travel.destinationStay.label.trim()
      : plan.stay
      ? getStayLabel(plan.stay)
      : "";
  const routeLabel =
    originLabel && destinationLabel
      ? `${originLabel} → ${destinationLabel}`
      : "";
  const activeMode = getActiveTravelMode(travel) || "driving";
  const primaryLabel = getModeLabel(activeMode);
  const transitInfo = getModeDetails(travel, "transit");
  const walkingInfo = getModeDetails(travel, "walking");
  const drivingInfo = getModeDetails(travel, "driving");

  switch (travel.status) {
    case "ready": {
      const durationText = formatDuration(Number(travel.durationSeconds));
      const distanceText = formatDistance(Number(travel.distanceMeters));
      const parts = [];
      if (routeLabel) parts.push(`Route ${routeLabel}`);
      if (durationText) parts.push(`Time ${durationText}`);
      if (distanceText) parts.push(`Distance ${distanceText}`);
      parts.push(`Mode ${primaryLabel}`);
      const transitSummary = formatTransitSummary(transitInfo || null, {
        includeLines: true,
      });
      if (transitSummary && activeMode !== "transit") {
        parts.push(transitSummary);
      } else if (transitSummary) {
        parts.push(transitSummary);
      }
      if (isModeReady(walkingInfo) && activeMode !== "walking") {
        const walkDuration = formatDuration(
          Number(walkingInfo.durationSeconds)
        );
        const walkDistance = formatDistance(Number(walkingInfo.distanceMeters));
        parts.push(
          ["Walking", walkDuration, walkDistance].filter(Boolean).join(" ")
        );
      }
      if (isModeReady(drivingInfo) && activeMode !== "driving") {
        const driveDuration = formatDuration(
          Number(drivingInfo.durationSeconds)
        );
        const driveDistance = formatDistance(
          Number(drivingInfo.distanceMeters)
        );
        parts.push(
          ["Driving", driveDuration, driveDistance].filter(Boolean).join(" ")
        );
      }
      if (skippedTitle) parts.push(skippedTitle);
      return {
        text: `${primaryLabel}: ${durationText || "—"}`,
        state: skippedCount ? "warning" : "ready",
        title: parts.join(" · "),
      };
    }
    case "pending":
      return {
        text: "Travel: calculating…",
        state: "pending",
        title: routeLabel
          ? `Calculating travel time for ${routeLabel}.`
          : "Travel time is being calculated.",
      };
    case "missing-key":
      return {
        text: "Travel: add API key",
        state: "warning",
        title: formatMissingRoutingKeyMessage(travel),
      };
    case "missing-stay":
      return {
        text: "Travel: add stay",
        state: "warning",
        title: "Pick a stay with map coordinates to calculate travel time.",
      };
    case "no-activities":
      return {
        text: "Travel: 0m",
        state: skippedCount ? "warning" : "ready",
        title: [
          routeLabel ? `Route ${routeLabel}` : "",
          skippedTitle || "No mapped stops scheduled for this day.",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "insufficient-data":
      return {
        text: "Travel: add map pins",
        state: "warning",
        title: [
          routeLabel ? `Route ${routeLabel}` : "",
          buildMissingPinsTitle(travel.skipped),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "error":
      return {
        text: "Travel: unavailable",
        state: "error",
        title: [
          routeLabel ? `Route ${routeLabel}` : "",
          travel.error || "Routing request failed.",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    default:
      return { text: "Travel: —", state: "pending", title: "" };
  }
}

function buildMissingPinsTitle(skipped) {
  const names = Array.isArray(skipped)
    ? skipped
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
    : [];
  if (!names.length) {
    return "Add coordinates for all stops to calculate travel time.";
  }
  const preview = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? `, +${names.length - 3} more` : "";
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
    chip.removeAttribute("title");
  }
}

function refreshTravelChip(dateKey) {
  if (!calendarEl) return false;
  const card = calendarEl.querySelector(`.day-card[data-date="${dateKey}"]`);
  if (!card) return false;
  const chip = card.querySelector(".theme-chip--travel");
  if (!chip) return false;
  const day = ensureDay(dateKey);
  applyTravelChipState(chip, day);
  return true;
}

function scheduleTravelChipRefresh(dateKey) {
  const updated = refreshTravelChip(dateKey);
  refreshTravelSummary(dateKey);
  if (activeMapDate === dateKey) {
    updateMapDirections(dateKey);
  }
  const schedule =
    typeof queueMicrotask === "function"
      ? queueMicrotask
      : typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ? (fn) => window.requestAnimationFrame(fn)
      : (fn) => setTimeout(fn, 0);
  schedule(() => {
    refreshTravelChip(dateKey);
    refreshTravelSummary(dateKey);
    if (activeMapDate === dateKey) {
      updateMapDirections(dateKey);
    }
  });
  return updated;
}

function applyTravelSummary(summaryEl, plan, dateKey) {
  if (!summaryEl) return;
  summaryEl.innerHTML = "";
  const itinerary = buildItineraryForDay(plan, dateKey);
  const travel = plan.travel;
  const expanded = travelExpansionState.get(dateKey) ?? false;
  summaryEl.dataset.expanded = expanded ? "true" : "false";

  const originLabel =
    typeof travel?.originStay?.label === "string"
      ? travel.originStay.label.trim()
      : (itinerary.originStay?.label || "").trim();
  const destinationLabel =
    typeof travel?.destinationStay?.label === "string"
      ? travel.destinationStay.label.trim()
      : (itinerary.stay?.label || "").trim();
  const routeLabel =
    originLabel && destinationLabel
      ? `${originLabel} → ${destinationLabel}`
      : "";

  const skippedCount = Array.isArray(travel?.skipped)
    ? travel.skipped.length
    : 0;
  const skippedTitle = skippedCount
    ? buildMissingPinsTitle(travel.skipped)
    : "";
  const activeMode = getActiveTravelMode(travel) || "driving";
  const modeLabel = getModeLabel(activeMode);
  const transitInfo = getModeDetails(travel, "transit");
  const walkingInfo = getModeDetails(travel, "walking");
  const drivingInfo = getModeDetails(travel, "driving");
  const transitSummary = formatTransitSummary(transitInfo || null, {
    includeLines: true,
  });

  let state = "pending";
  let headerTime = "—";
  let caption = "";
  let detailMessage = "";

  function appendRouteRow(target) {
    if (!routeLabel || !target) return;
    const routeRow = document.createElement("div");
    routeRow.className = "travel-summary__route";

    const startBlock = document.createElement("div");
    startBlock.className = "travel-summary__point";
    const startLabelEl = document.createElement("span");
    startLabelEl.className = "travel-summary__point-label";
    startLabelEl.textContent = "Start";
    const startNameEl = document.createElement("span");
    startNameEl.className = "travel-summary__point-name";
    startNameEl.textContent = originLabel || "—";
    startBlock.append(startLabelEl, startNameEl);

    const arrowEl = document.createElement("span");
    arrowEl.className = "travel-summary__arrow";
    arrowEl.textContent = "→";

    const endBlock = document.createElement("div");
    endBlock.className = "travel-summary__point";
    const endLabelEl = document.createElement("span");
    endLabelEl.className = "travel-summary__point-label";
    endLabelEl.textContent = "Finish";
    const endNameEl = document.createElement("span");
    endNameEl.className = "travel-summary__point-name";
    endNameEl.textContent = destinationLabel || "—";
    endBlock.append(endLabelEl, endNameEl);

    routeRow.append(startBlock, arrowEl, endBlock);
    target.appendChild(routeRow);
  }

  if (!plan.stay) {
    state = "warning";
    caption = "Add a stay to calculate travel time.";
    detailMessage = caption;
  } else if (!travel) {
    state = "pending";
    caption = routeLabel
      ? `Calculating travel time for ${routeLabel}…`
      : "Travel time will be calculated soon.";
    detailMessage = caption;
  } else if (travel.status !== "ready") {
    switch (travel.status) {
      case "pending":
        state = "pending";
        caption = routeLabel
          ? `Calculating travel time for ${routeLabel}…`
          : "Calculating travel time…";
        break;
      case "missing-key":
        state = "warning";
        caption = formatMissingRoutingKeyMessage(travel);
        break;
      case "missing-stay":
        state = "warning";
        caption = "Select a stay with coordinates to calculate travel time.";
        break;
      case "insufficient-data":
        state = "warning";
        caption =
          skippedTitle ||
          "Add coordinates for all stops to calculate travel time.";
        break;
      case "error":
        state = "error";
        caption = travel.error || "Unable to calculate travel time.";
        break;
      default:
        state = "pending";
        caption = "Travel time is not available for this day.";
        break;
    }
    detailMessage = caption || "Travel time is not available for this day.";
  } else {
    state = skippedCount ? "warning" : "ready";
    headerTime = formatDuration(Number(travel.durationSeconds)) || "—";
    const distanceText = formatDistance(Number(travel.distanceMeters));
    const captionParts = [routeLabel || "", distanceText || "", modeLabel];
    if (skippedCount) {
      captionParts.push(
        `${skippedCount} stop${skippedCount === 1 ? "" : "s"} missing pins`
      );
    }
    caption =
      captionParts.filter(Boolean).join(" · ") || "Travel details ready.";
  }

  summaryEl.dataset.state = state;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "travel-summary__toggle";
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggle.addEventListener("click", () => {
    travelExpansionState.set(dateKey, !expanded);
    applyTravelSummary(summaryEl, plan, dateKey);
  });

  const meta = document.createElement("div");
  meta.className = "travel-summary__meta";

  const titleEl = document.createElement("span");
  titleEl.className = "travel-summary__title";
  titleEl.textContent = "Travel time";
  meta.appendChild(titleEl);

  const timeEl = document.createElement("span");
  timeEl.className = "travel-summary__time";
  timeEl.textContent = headerTime || "—";
  meta.appendChild(timeEl);

  const captionEl = document.createElement("span");
  captionEl.className = "travel-summary__caption";
  captionEl.textContent = caption || "Expand for route details.";
  meta.appendChild(captionEl);

  const chevron = document.createElement("span");
  chevron.className = "travel-summary__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▾";

  toggle.append(meta, chevron);
  summaryEl.appendChild(toggle);

  const body = document.createElement("div");
  body.className = "travel-summary__body";
  summaryEl.appendChild(body);

  if (!expanded) {
    return;
  }

  if (!plan.stay) {
    const notice = document.createElement("div");
    notice.className = "travel-summary__notice";
    notice.textContent = detailMessage;
    body.appendChild(notice);
    return;
  }

  if (!travel || travel.status !== "ready") {
    const notice = document.createElement("div");
    notice.className = "travel-summary__notice";
    notice.textContent =
      detailMessage || "Travel time is not available for this day.";
    body.appendChild(notice);
    appendRouteRow(body);
    return;
  }

  const distanceText = formatDistance(Number(travel.distanceMeters));
  const metrics = document.createElement("div");
  metrics.className = "travel-summary__headline";
  if (distanceText) {
    const distanceEl = document.createElement("span");
    distanceEl.className = "travel-summary__metric";
    distanceEl.textContent = distanceText;
    metrics.appendChild(distanceEl);
  }
  const modeEl = document.createElement("span");
  modeEl.className = "travel-summary__mode";
  modeEl.textContent = modeLabel;
  metrics.appendChild(modeEl);
  body.appendChild(metrics);

  appendRouteRow(body);

  const stops = Array.isArray(travel.stops) ? travel.stops : [];
  if (stops.length) {
    const stopsList = document.createElement("ol");
    stopsList.className = "travel-summary__stops";
    stops.slice(0, 6).forEach((stop, index) => {
      const item = document.createElement("li");
      item.textContent = stop.label || `Stop ${index + 1}`;
      stopsList.appendChild(item);
    });
    if (stops.length > 6) {
      const moreItem = document.createElement("li");
      moreItem.className = "travel-summary__more";
      moreItem.textContent = `+${stops.length - 6} more stops`;
      stopsList.appendChild(moreItem);
    }
    body.appendChild(stopsList);
  } else {
    const noStops = document.createElement("div");
    noStops.className = "travel-summary__note";
    noStops.textContent =
      Number(travel.durationSeconds) > 0
        ? "Travel between stays with no mapped stops."
        : "No mapped stops scheduled for this day.";
    body.appendChild(noStops);
  }

  if (transitSummary) {
    const transitRow = document.createElement("div");
    transitRow.className = "travel-summary__transit";
    transitRow.textContent = transitSummary;
    body.appendChild(transitRow);

    const legs = Array.isArray(transitInfo?.legs)
      ? transitInfo.legs.filter(
          (leg) => leg && (leg.kind === "transit" || leg.kind === "walk")
        )
      : [];
    if (legs.length) {
      const legList = document.createElement("ol");
      legList.className = "travel-summary__legs";
      legs.slice(0, 5).forEach((leg) => {
        const legItem = document.createElement("li");
        legItem.className = `travel-summary__leg travel-summary__leg--${leg.kind}`;
        const legDuration = formatDuration(Number(leg.durationSeconds));
        const details = [
          leg.kind === "transit"
            ? leg.line || leg.mode || "Transit"
            : leg.info || "Walk",
          leg.kind === "transit" ? leg.info || "" : "",
          legDuration ? `(${legDuration})` : "",
        ]
          .filter(Boolean)
          .join(" ");
        legItem.textContent = details;
        legList.appendChild(legItem);
      });
      body.appendChild(legList);
    }
  }

  if (isModeReady(walkingInfo)) {
    const walkingRow = document.createElement("div");
    walkingRow.className = "travel-summary__transit";
    const walkDuration = formatDuration(Number(walkingInfo.durationSeconds));
    const walkDistance = formatDistance(Number(walkingInfo.distanceMeters));
    walkingRow.textContent = ["Walking route", walkDuration, walkDistance]
      .filter(Boolean)
      .join(" · ");
    body.appendChild(walkingRow);
  }

  if (isModeReady(drivingInfo) && activeMode === "transit") {
    const drivingRow = document.createElement("div");
    drivingRow.className = "travel-summary__transit";
    const drivingDuration = formatDuration(Number(drivingInfo.durationSeconds));
    const drivingDistance = formatDistance(Number(drivingInfo.distanceMeters));
    drivingRow.textContent = [
      "Driving alternative",
      drivingDuration,
      drivingDistance,
    ]
      .filter(Boolean)
      .join(" · ");
    body.appendChild(drivingRow);
  }

  if (skippedTitle) {
    const notice = document.createElement("div");
    notice.className = "travel-summary__notice";
    notice.textContent = skippedTitle;
    body.appendChild(notice);
  }
}

function refreshTravelSummary(dateKey) {
  if (!calendarEl) return false;
  const summaryEl = calendarEl.querySelector(
    `.travel-summary[data-travel-summary="${dateKey}"]`
  );
  if (!summaryEl) return false;
  const day = ensureDay(dateKey);
  applyTravelSummary(summaryEl, day, dateKey);
  return true;
}

function setDayTravel(
  dateKey,
  travel,
  { persist = true, updateCard = true } = {}
) {
  const day = ensureDay(dateKey);
  day.travel = travel;
  if (travel && travel.status === "ready") {
    const currentMode = getMapModeForDate(dateKey);
    const currentDetails = getModeDetails(travel, currentMode);
    if (!isModeReady(currentDetails)) {
      const fallbackMode = getDefaultMapMode(travel);
      setMapModeForDate(dateKey, fallbackMode);
    }
  }
  if (persist) {
    persistState();
  }
  if (updateCard) {
    scheduleTravelChipRefresh(dateKey);
  }
  if (activeMapDate === dateKey) {
    mapOverlayMode = getMapModeForDate(dateKey);
    updateMapModeUI(dateKey);
    renderMapRoute(dateKey, { mode: mapOverlayMode });
    updateMapSummary(dateKey);
    updateMapDirections(dateKey, { mode: mapOverlayMode });
  } else if (mapOverlayMode && mapModeControls) {
    updateMapModeUI(dateKey);
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
  const routingConfig = planState.config.routing || {};
  const providers = resolveRoutingProviders(routingConfig);
  const drivingProfile = MODE_TO_PROFILE.driving;
  const transitProfile = MODE_TO_PROFILE.transit;
  const walkingProfile = MODE_TO_PROFILE.walking;
  const day = ensureDay(dateKey);
  const itinerary = buildItineraryForDay(day, dateKey);

  const skipped = Array.isArray(itinerary.skipped) ? itinerary.skipped : [];
  const signatureBase = itinerary.signature || "";
  const providerSignature = `${providers.driving}:${providers.walking}:${providers.transit}`;
  const signature = `${HYBRID_ROUTING_PROVIDER}:${providerSignature}:${signatureBase}`;
  const originSnapshot = serializeStay(itinerary.originStay);
  const destinationSnapshot = serializeStay(itinerary.stay);
  const stopSnapshots = serializeActivities(itinerary.activities);
  const defaultMode = PROFILE_TO_MODE[drivingProfile] || "driving";

  const composeTravel = (status, extra = {}) => ({
    status,
    provider: HYBRID_ROUTING_PROVIDER,
    profile: transitProfile,
    mode: "transit",
    signature,
    skipped,
    originStay: originSnapshot,
    destinationStay: destinationSnapshot,
    stops: stopSnapshots,
    providers,
    ...extra,
  });

  if (itinerary.status === "missing-stay") {
    setDayTravel(dateKey, composeTravel("missing-stay"), { persist: false });
    return null;
  }

  const existing = day.travel;
  if (
    existing &&
    existing.signature === signature &&
    existing.status === "ready" &&
    staysMatch(existing.originStay, originSnapshot) &&
    staysMatch(existing.destinationStay, destinationSnapshot)
  ) {
    return existing;
  }

  if (itinerary.status === "no-activities") {
    const travelData = composeTravel("ready", {
      durationSeconds: 0,
      distanceMeters: 0,
      fetchedAt: Date.now(),
      geometry: null,
      modes: {
        driving: {
          status: "ready",
          profile: drivingProfile,
          mode: "driving",
          durationSeconds: 0,
          distanceMeters: 0,
          geometry: null,
          legs: [],
          path: [],
          provider: providers.driving,
        },
        walking: { status: "unavailable", provider: providers.walking },
        transit: { status: "unavailable", provider: providers.transit },
      },
      driving: {
        status: "ready",
        profile: drivingProfile,
        mode: "driving",
        durationSeconds: 0,
        distanceMeters: 0,
        geometry: null,
        legs: [],
        path: [],
        provider: providers.driving,
      },
      walking: { status: "unavailable", provider: providers.walking },
      transit: { status: "unavailable", provider: providers.transit },
    });
    setDayTravel(dateKey, travelData);
    return travelData;
  }

  if (
    !Array.isArray(itinerary.routePoints) ||
    itinerary.routePoints.length < 2
  ) {
    setDayTravel(dateKey, composeTravel("insufficient-data"), { persist: false });
    return null;
  }

  const needsOpenRoute = [
    providers.driving,
    providers.walking,
    providers.transit,
  ].some(providerNeedsOpenRoute);
  const needsGoogle = [
    providers.driving,
    providers.walking,
    providers.transit,
  ].some(providerNeedsGoogle);

  let openRouteApiKey = null;
  let googleApiKey = null;

  if (needsOpenRoute) {
    openRouteApiKey = getRoutingApiKey({ interactive });
  }
  if (needsGoogle) {
    googleApiKey = getGoogleRoutingApiKey({ interactive });
  }

  const missingProviders = [];
  if (needsOpenRoute && !openRouteApiKey) {
    missingProviders.push(getRoutingProviderDisplayName("openrouteservice"));
  }
  if (needsGoogle && !googleApiKey) {
    missingProviders.push(getRoutingProviderDisplayName("google-directions"));
  }

  if (missingProviders.length) {
    setDayTravel(
      dateKey,
      composeTravel("missing-key", {
        missingProviders,
        fetchedAt: Date.now(),
      }),
      { persist: false }
    );
    return null;
  }

  setDayTravel(
    dateKey,
    composeTravel("pending", {
      requestedAt: Date.now(),
    }),
    { persist: false }
  );

  try {
    const departureMinutes = getPreferredDepartureMinutes(day);
    const baseDate = dateKey ? new Date(`${dateKey}T00:00:00`) : new Date();
    const departureTimestamp = baseDate.getTime() + departureMinutes * 60000;
    const routeDistanceEstimate = estimateRouteDistance(itinerary.routePoints);

    let drivingDetails;
    try {
      drivingDetails = await fetchDrivingRouteDetails(itinerary.routePoints, {
        provider: providers.driving,
        openRouteApiKey,
        googleApiKey,
        departureTime: departureTimestamp,
      });
    } catch (drivingError) {
      console.warn("Driving routing unavailable", drivingError);
      drivingDetails = {
        status: "error",
        error: drivingError?.message || "Driving route unavailable.",
      };
    }
    drivingDetails =
      drivingDetails && typeof drivingDetails === "object"
        ? { ...drivingDetails, provider: providers.driving }
        : { status: "unavailable", provider: providers.driving };

    let walkingDetails = null;
    if (routeDistanceEstimate <= 30000) {
      try {
        walkingDetails = await fetchWalkingRouteDetails(itinerary.routePoints, {
          provider: providers.walking,
          openRouteApiKey,
          googleApiKey,
        });
      } catch (walkingError) {
        console.warn("Walking routing unavailable", walkingError);
        walkingDetails = {
          status: "error",
          error: walkingError?.message || "Walking route unavailable.",
        };
      }
    } else {
      walkingDetails = { status: "unavailable" };
    }
    walkingDetails =
      walkingDetails && typeof walkingDetails === "object"
        ? { ...walkingDetails, provider: providers.walking }
        : { status: "unavailable", provider: providers.walking };

    let transitDetails;
    try {
      transitDetails = await fetchTransitRouteDetails(itinerary.routePoints, {
        provider: providers.transit,
        openRouteApiKey,
        googleApiKey,
        departureTime: departureTimestamp,
      });
    } catch (transitError) {
      console.warn("Transit routing unavailable", transitError);
      transitDetails = {
        status: "error",
        error: transitError?.message || "Transit route unavailable.",
      };
    }
    transitDetails =
      transitDetails && typeof transitDetails === "object"
        ? { ...transitDetails, provider: providers.transit }
        : {
            status: "error",
            error: "Transit route unavailable.",
            provider: providers.transit,
          };

    const transitReady = isModeReady(transitDetails);
    const walkingReady = isModeReady(walkingDetails);
    const drivingReady = isModeReady(drivingDetails);

    let primaryMode = transitReady
      ? "transit"
      : walkingReady
      ? "walking"
      : drivingReady
      ? "driving"
      : defaultMode;
    const primaryProfile = MODE_TO_PROFILE[primaryMode] || transitProfile;
    const primaryDetails =
      primaryMode === "transit"
        ? transitDetails
        : primaryMode === "walking"
        ? walkingDetails
        : drivingDetails;

    const primaryDuration = Number(primaryDetails?.durationSeconds) || 0;
    const primaryDistance = Number(primaryDetails?.distanceMeters) || 0;
    const geometry =
      primaryDetails?.geometry ||
      transitDetails?.geometry ||
      walkingDetails?.geometry ||
      drivingDetails?.geometry ||
      buildLineStringFromPoints(itinerary.routePoints) ||
      null;

    const modes = {
      driving: drivingDetails || { status: "unavailable", provider: providers.driving },
      walking: walkingDetails || { status: "unavailable", provider: providers.walking },
      transit: transitDetails || { status: "unavailable", provider: providers.transit },
    };

    const travelData = composeTravel("ready", {
      profile: primaryProfile,
      mode: primaryMode,
      durationSeconds: primaryDuration,
      distanceMeters: primaryDistance,
      fetchedAt: Date.now(),
      geometry,
      modes,
      driving: modes.driving,
      walking: modes.walking,
      transit: modes.transit,
    });
    setDayTravel(dateKey, travelData);
    return travelData;
  } catch (error) {
    console.error("Routing request failed", error);
    setDayTravel(
      dateKey,
      composeTravel("error", {
        error: error?.message || "Routing request failed",
        fetchedAt: Date.now(),
      }),
      { persist: false }
    );
    return null;
  }
}

function getRoutingApiKey({ interactive = false } = {}) {
  const current = planState.config.routing?.openRouteApiKey;
  if (current && typeof current === "string" && current.trim()) {
    return current.trim();
  }
  if (!interactive || routingKeyPromptActive) {
    return null;
  }

  routingKeyPromptActive = true;
  try {
    const input = window.prompt(
      "Enter your OpenRouteService API key to enable travel time calculations"
    );
    if (!input) {
      return null;
    }
    const normalized = input.trim();
    if (!normalized) {
      return null;
    }
    const nextRouting = {
      ...(planState.config.routing || {}),
      openRouteApiKey: normalized,
    };
    planState.config.routing = nextRouting;
    persistState();
    return normalized;
  } finally {
    routingKeyPromptActive = false;
  }
}

function getGoogleRoutingApiKey({ interactive = false } = {}) {
  const current = planState.config.routing?.googleApiKey;
  const revealed = revealEmbeddedApiKey(current);
  if (revealed) {
    return revealed;
  }
  if (!interactive || googleRoutingKeyPromptActive) {
    return null;
  }

  googleRoutingKeyPromptActive = true;
  try {
    const input = window.prompt(
      "Enter your Google Maps Directions API key to enable public transit routing"
    );
    if (!input) {
      return null;
    }
    const normalized = input.trim();
    if (!normalized) {
      return null;
    }
    const storedValue = encodeGoogleApiKeyForStorage(normalized);
    const nextRouting = {
      ...(planState.config.routing || {}),
      googleApiKey: storedValue,
    };
    if (!nextRouting.transitProvider) {
      nextRouting.transitProvider = "auto";
    }
    planState.config.routing = nextRouting;
    persistState();
    return storedValue.startsWith(EMBEDDED_KEY_PREFIXES.google)
      ? revealEmbeddedApiKey(storedValue)
      : storedValue;
  } finally {
    googleRoutingKeyPromptActive = false;
  }
}

async function requestOpenRouteRoute(
  points,
  apiKey,
  profile = "driving-car",
  options = {}
) {
  const coordinates = points.map((coord) => {
    if (!Array.isArray(coord) || coord.length !== 2) {
      throw new Error("Invalid coordinate provided to routing request.");
    }
    const [lat, lon] = coord;
    return [Number(lon), Number(lat)];
  });

  const extraBody =
    options?.body && typeof options.body === "object" ? options.body : null;
  const payload = extraBody ? { coordinates, ...extraBody } : { coordinates };

  const response = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(payload),
    }
  );

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
    throw new Error(message || "Routing request failed.");
  }

  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature) {
    throw new Error("No route found for the selected stops.");
  }
  const properties = feature.properties || {};
  return {
    geometry: feature.geometry,
    summary: properties.summary || {},
    segments: Array.isArray(properties.segments) ? properties.segments : [],
    wayPoints: Array.isArray(properties.way_points)
      ? properties.way_points
      : [],
    bbox: Array.isArray(feature.bbox) ? [...feature.bbox] : null,
    metadata: {
      transfers: properties.transfers,
      fare: properties.fare,
      warnings: properties.warnings,
    },
  };
}

async function requestGoogleDirectionsRoute({
  points,
  apiKey,
  mode = "driving",
  departureTime = null,
  transitMode = "rail|subway|train|tram|bus",
  language = "en",
  region = "jp",
  avoid = null,
  alternatives = false,
} = {}) {
  if (!apiKey) {
    throw new Error("Google Directions API key is required for this request.");
  }
  const coords = normalizeRoutePoints(points);
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error("At least two coordinates are required for routing.");
  }
  const origin = coords[0];
  const destination = coords[coords.length - 1];
  const waypointList = coords.slice(1, -1);
  const params = new URLSearchParams();
  params.set("origin", `${origin[0]},${origin[1]}`);
  params.set("destination", `${destination[0]},${destination[1]}`);
  params.set("mode", mode);
  params.set("units", "metric");
  params.set("key", apiKey);
  if (language) params.set("language", language);
  if (region) params.set("region", region);
  if (waypointList.length) {
    const encoded = waypointList
      .map((coord) => `via:${coord[0]},${coord[1]}`)
      .join("|");
    params.set("waypoints", encoded);
  }
  if (typeof departureTime === "number" && Number.isFinite(departureTime)) {
    params.set("departure_time", Math.floor(departureTime / 1000).toString());
  } else if (mode === "transit") {
    params.set("departure_time", Math.floor(Date.now() / 1000).toString());
  }
  if (mode === "transit" && transitMode) {
    params.set("transit_mode", transitMode);
  }
  if (alternatives) {
    params.set("alternatives", "true");
  }
  if (Array.isArray(avoid) && avoid.length) {
    params.set("avoid", avoid.join("|"));
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!data || data.status !== "OK") {
    const message = data?.error_message || data?.status || "Directions request failed.";
    throw new Error(message);
  }
  const route = Array.isArray(data.routes) && data.routes.length ? data.routes[0] : null;
  if (!route) {
    throw new Error("No route found for the selected stops.");
  }
  return route;
}

function convertGoogleStepsToLegs(steps, { defaultKind = "drive", modeKey = "driving" } = {}) {
  if (!Array.isArray(steps)) return [];
  const results = [];
  steps.forEach((step) => {
    results.push(...convertGoogleStep(step, { defaultKind, modeKey }));
  });
  return results;
}

function convertGoogleStep(step, { defaultKind = "drive", modeKey = "driving" } = {}) {
  if (!step) return [];
  const travelMode = (step.travel_mode || step.travelMode || "").toUpperCase();
  let kind = defaultKind;
  if (travelMode === "WALKING") {
    kind = "walk";
  } else if (travelMode === "BICYCLING") {
    kind = "cycle";
  } else if (travelMode === "TRANSIT") {
    kind = "transit";
  } else if (travelMode === "DRIVING") {
    kind = "drive";
  }

  if (travelMode !== "TRANSIT" && Array.isArray(step.steps) && step.steps.length) {
    const nested = [];
    step.steps.forEach((sub) => {
      nested.push(...convertGoogleStep(sub, { defaultKind: kind, modeKey }));
    });
    if (nested.length) {
      return nested;
    }
  }

  const durationSeconds = Number(
    step.duration?.value || step.duration_in_traffic?.value || 0
  ) || 0;
  const distanceMeters = Number(step.distance?.value || 0) || 0;
  const path = decodePolyline(step.polyline?.points || "");
  let modeLabel = step.travel_mode || step.mode || "";
  if (!modeLabel) {
    modeLabel =
      kind === "walk"
        ? "Walk"
        : kind === "drive"
        ? "Drive"
        : kind === "cycle"
        ? "Cycle"
        : modeKey;
  }
  let info = stripHtml(step.html_instructions || step.instruction || "");
  if (!info && step.maneuver) {
    info = step.maneuver.replace(/_/g, " ");
  }
  const leg = {
    kind,
    mode: modeLabel,
    info,
    durationSeconds,
    distanceMeters,
    path,
  };
  if (!info) {
    if (kind === "walk") {
      leg.info = "Walk";
    } else if (kind === "drive") {
      leg.info = "Drive";
    } else if (kind === "cycle") {
      leg.info = "Cycle";
    } else {
      leg.info = modeLabel || "Move";
    }
  }

  if (travelMode === "TRANSIT") {
    const details = step.transit_details || {};
    const line = details.line || {};
    const agencies = Array.isArray(line.agencies) ? line.agencies : [];
    const agency = agencies.find((item) => typeof item?.name === "string")?.name;
    const vehicleName =
      (line.vehicle && (line.vehicle.name || line.vehicle.type)) ||
      modeLabel ||
      "Transit";
    const lineName =
      line.short_name ||
      line.name ||
      vehicleName ||
      agency ||
      "Transit";
    const headsign = details.headsign || "";
    const stopsText = Number.isInteger(details.num_stops)
      ? `${details.num_stops} stop${details.num_stops === 1 ? "" : "s"}`
      : "";
    const infoParts = [
      lineName,
      headsign ? `to ${headsign}` : "",
      agency ? `(${agency})` : "",
      stopsText,
    ].filter(Boolean);
    leg.kind = "transit";
    leg.mode = vehicleName;
    leg.line = lineName;
    leg.from = details.departure_stop?.name || null;
    leg.to = details.arrival_stop?.name || null;
    leg.info = infoParts.join(" ") || leg.info || "Transit";
    if (line.color && typeof line.color === "string") {
      const color = line.color.startsWith("#") ? line.color : `#${line.color}`;
      leg.color = color;
    }
    if (details.departure_time?.value) {
      leg.departureTimestamp = Number(details.departure_time.value) * 1000;
    }
    if (details.arrival_time?.value) {
      leg.arrivalTimestamp = Number(details.arrival_time.value) * 1000;
    }
  }

  return [leg];
}

function buildGoogleRouteDetails(
  route,
  { modeKey = "driving", defaultKind = "drive", includeTransitMetadata = false } = {}
) {
  if (!route) return null;
  const legs = Array.isArray(route.legs) ? route.legs : [];
  if (!legs.length) return null;

  const detailLegs = [];
  const path = [];
  let totalDuration = 0;
  let totalDistance = 0;
  let earliestDeparture = null;
  let latestArrival = null;

  legs.forEach((leg) => {
    totalDuration += Number(leg.duration?.value || 0) || 0;
    totalDistance += Number(leg.distance?.value || 0) || 0;
    if (leg.departure_time?.value && !earliestDeparture) {
      earliestDeparture = Number(leg.departure_time.value) * 1000;
    }
    if (leg.arrival_time?.value) {
      latestArrival = Number(leg.arrival_time.value) * 1000;
    }
    const segments = convertGoogleStepsToLegs(leg.steps || [], {
      defaultKind,
      modeKey,
    });
    segments.forEach((segment) => {
      detailLegs.push(segment);
      if (Array.isArray(segment.path)) {
        appendPath(path, segment.path);
      }
    });
  });

  if (!path.length) {
    const overview = decodePolyline(route.overview_polyline?.points || "");
    if (overview.length) {
      appendPath(path, overview);
    }
  }

  const geometry = path.length >= 2 ? buildLineStringFromPoints(path) : null;

  const result = {
    status: "ready",
    profile: MODE_TO_PROFILE[modeKey] || null,
    mode: modeKey,
    durationSeconds: totalDuration,
    distanceMeters: totalDistance,
    geometry,
    legs: detailLegs,
    path: path.slice(),
  };

  if (includeTransitMetadata) {
    const transitLegs = detailLegs.filter((leg) => leg.kind === "transit");
    result.transfers = Math.max(0, transitLegs.length - 1);
    result.lines = uniqueOrdered(
      transitLegs.map((leg) => leg.line || leg.mode).filter(Boolean)
    );
    result.departureTimestamp = earliestDeparture || null;
    result.arrivalTimestamp = latestArrival || null;
  }

  return result;
}

async function requestGoogleTransitItinerary(points, { apiKey, departureTime = null } = {}) {
  const coords = normalizeRoutePoints(points);
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error("At least two coordinates are required for transit routing.");
  }
  let currentDeparture =
    typeof departureTime === "number" && Number.isFinite(departureTime)
      ? departureTime
      : Date.now();
  const legs = [];
  const path = [];
  let totalDuration = 0;
  let totalDistance = 0;
  let earliestDeparture = null;
  let latestArrival = null;

  for (let i = 1; i < coords.length; i += 1) {
    const origin = coords[i - 1];
    const destination = coords[i];
    if (coordsEqual(origin, destination)) {
      continue;
    }
    const route = await requestGoogleDirectionsRoute({
      points: [origin, destination],
      apiKey,
      mode: "transit",
      departureTime: currentDeparture,
    });
    const details = buildGoogleRouteDetails(route, {
      modeKey: "transit",
      defaultKind: "transit",
      includeTransitMetadata: true,
    });
    if (!details) {
      throw new Error("Transit route unavailable.");
    }
    totalDuration += Number(details.durationSeconds) || 0;
    totalDistance += Number(details.distanceMeters) || 0;
    details.legs.forEach((segment) => {
      legs.push(segment);
      if (Array.isArray(segment.path)) {
        appendPath(path, segment.path);
      }
    });
    if (details.departureTimestamp && !earliestDeparture) {
      earliestDeparture = details.departureTimestamp;
    }
    if (details.arrivalTimestamp) {
      latestArrival = details.arrivalTimestamp;
      currentDeparture = details.arrivalTimestamp + 60000;
    } else {
      currentDeparture += Number(details.durationSeconds || 0) * 1000;
    }
  }

  if (!legs.length) {
    throw new Error("Transit route unavailable.");
  }

  const transitLegs = legs.filter((leg) => leg.kind === "transit");
  const lines = uniqueOrdered(
    transitLegs.map((leg) => leg.line || leg.mode).filter(Boolean)
  );
  const transfers = Math.max(0, transitLegs.length - 1);

  const geometry =
    path.length >= 2
      ? buildLineStringFromPoints(path)
      : buildLineStringFromPoints(coords);

  return {
    status: "ready",
    profile: MODE_TO_PROFILE.transit,
    mode: "transit",
    durationSeconds: totalDuration,
    distanceMeters: totalDistance,
    legs,
    lines,
    transfers,
    geometry,
    path: path.length ? path : coords,
    provider: "google-directions",
    departureTimestamp: earliestDeparture || null,
    arrivalTimestamp: latestArrival || null,
  };
}

async function fetchDrivingRouteDetails(
  routePoints,
  { provider, openRouteApiKey, googleApiKey, departureTime = null } = {}
) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    return { status: "unavailable" };
  }
  const providerKey = normalizeRoutingProvider(provider);
  if (providerKey === "google-directions") {
    if (!googleApiKey) {
      throw new Error("Google Directions API key required for driving routes.");
    }
    const route = await requestGoogleDirectionsRoute({
      points: routePoints,
      apiKey: googleApiKey,
      mode: "driving",
      departureTime,
    });
    const details = buildGoogleRouteDetails(route, {
      modeKey: "driving",
      defaultKind: "drive",
    });
    if (!details) {
      throw new Error("Driving route unavailable.");
    }
    return details;
  }
  if (!openRouteApiKey) {
    throw new Error("OpenRouteService API key required for driving routes.");
  }
  const route = await requestOpenRouteRoute(
    routePoints,
    openRouteApiKey,
    MODE_TO_PROFILE.driving
  );
  return (
    buildRouteDetails(route, MODE_TO_PROFILE.driving, { defaultKind: "drive" }) || {
      status: "ready",
      profile: MODE_TO_PROFILE.driving,
      mode: "driving",
      durationSeconds: Number(route?.summary?.duration ?? 0) || 0,
      distanceMeters: Number(route?.summary?.distance ?? 0) || 0,
      geometry: route?.geometry || null,
      legs: [],
      path: geometryToLatLngs(route?.geometry),
    }
  );
}

async function fetchWalkingRouteDetails(
  routePoints,
  { provider, openRouteApiKey, googleApiKey } = {}
) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    return { status: "unavailable" };
  }
  const providerKey = normalizeRoutingProvider(provider);
  if (providerKey === "google-directions") {
    if (!googleApiKey) {
      throw new Error("Google Directions API key required for walking routes.");
    }
    const route = await requestGoogleDirectionsRoute({
      points: routePoints,
      apiKey: googleApiKey,
      mode: "walking",
    });
    const details = buildGoogleRouteDetails(route, {
      modeKey: "walking",
      defaultKind: "walk",
    });
    if (!details) {
      throw new Error("Walking route unavailable.");
    }
    return details;
  }
  if (!openRouteApiKey) {
    throw new Error("OpenRouteService API key required for walking routes.");
  }
  const route = await requestOpenRouteRoute(
    routePoints,
    openRouteApiKey,
    MODE_TO_PROFILE.walking
  );
  return (
    buildRouteDetails(route, MODE_TO_PROFILE.walking, { defaultKind: "walk" }) || {
      status: "ready",
      profile: MODE_TO_PROFILE.walking,
      mode: "walking",
      durationSeconds: Number(route?.summary?.duration ?? 0) || 0,
      distanceMeters: Number(route?.summary?.distance ?? 0) || 0,
      geometry: route?.geometry || null,
      legs: [],
      path: geometryToLatLngs(route?.geometry),
    }
  );
}

async function fetchTransitRouteDetails(
  routePoints,
  { provider, openRouteApiKey, googleApiKey, departureTime = null } = {}
) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    return { status: "unavailable" };
  }
  const providerKey = normalizeRoutingProvider(provider);
  if (providerKey === "google-directions") {
    if (!googleApiKey) {
      throw new Error("Google Directions API key required for transit routes.");
    }
    return requestGoogleTransitItinerary(routePoints, {
      apiKey: googleApiKey,
      departureTime,
    });
  }
  if (!openRouteApiKey) {
    throw new Error("OpenRouteService API key required for transit routes.");
  }
  const route = await requestOpenRouteRoute(
    routePoints,
    openRouteApiKey,
    MODE_TO_PROFILE.transit
  );
  return (
    buildTransitDetails(route) || {
      status: "error",
      error: "Transit route unavailable.",
    }
  );
}

function uniqueOrdered(values) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const key = typeof value === "string" ? value.trim() : value;
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(key);
  });
  return result;
}

function buildRouteDetails(
  route,
  profile = "driving-car",
  { defaultKind = "drive" } = {}
) {
  if (!route) return null;
  const segments = Array.isArray(route.segments) ? route.segments : [];
  const legs = [];
  segments.forEach((segment) => {
    const steps = Array.isArray(segment.steps) ? segment.steps : [];
    steps.forEach((step) => {
      if (typeof step.instruction !== "string" || !step.instruction.trim()) {
        return;
      }
      const rawMode = typeof step.mode === "string" ? step.mode : "";
      const modeLower = rawMode.toLowerCase();
      let kind = defaultKind;
      if (
        modeLower.includes("foot") ||
        modeLower.includes("walk") ||
        modeLower.includes("pedestrian")
      ) {
        kind = "walk";
      } else if (modeLower.includes("bike") || modeLower.includes("bicycle")) {
        kind = "cycle";
      } else if (
        modeLower.includes("bus") ||
        modeLower.includes("train") ||
        modeLower.includes("metro")
      ) {
        kind = "transit";
      }
      const modeLabel =
        rawMode ||
        (kind === "walk" ? "Walk" : kind === "drive" ? "Drive" : "Move");
      const path = extractLegPath(route.geometry, step.way_points);
      legs.push({
        kind,
        mode: modeLabel,
        info: step.instruction.trim(),
        durationSeconds: Number(step.duration ?? segment.duration ?? 0) || 0,
        distanceMeters: Number(step.distance ?? segment.distance ?? 0) || 0,
        path,
        wayPoints: Array.isArray(step.way_points) ? [...step.way_points] : null,
      });
    });
  });

  return {
    status: "ready",
    profile,
    mode: PROFILE_TO_MODE[profile] || null,
    durationSeconds: Number(route.summary?.duration ?? 0) || 0,
    distanceMeters: Number(route.summary?.distance ?? 0) || 0,
    geometry: route.geometry || null,
    legs,
    path: geometryToLatLngs(route.geometry),
  };
}

function buildTransitDetails(route) {
  if (!route) return null;
  const segments = Array.isArray(route.segments) ? route.segments : [];
  if (!segments.length) return null;

  const legs = [];
  segments.forEach((segment) => {
    const steps = Array.isArray(segment.steps) ? segment.steps : [];
    steps.forEach((step) => {
      const transit = step?.transit || segment?.transit;
      if (transit) {
        const lineName = [
          transit.route_short_name,
          transit.route_long_name,
          transit.name,
          transit.line,
          transit.code,
        ].find((value) => typeof value === "string" && value.trim());
        const mode =
          transit.mode || transit.type || transit.vehicle_type || "Transit";
        const from =
          transit.from?.name ||
          transit.departure_stop?.name ||
          step.departure?.name ||
          "";
        const to =
          transit.to?.name ||
          transit.arrival_stop?.name ||
          step.arrival?.name ||
          "";
        const headsign = transit.headsign || transit.direction || "";
        const agency = transit.agency || transit.agency_name || "";
        const infoParts = [
          lineName,
          headsign ? `to ${headsign}` : "",
          agency ? `(${agency})` : "",
        ].filter(Boolean);
        const path = extractLegPath(
          route.geometry,
          step.way_points || segment.way_points
        );
        legs.push({
          kind: "transit",
          mode,
          line: lineName || mode,
          from: from || null,
          to: to || null,
          info: infoParts.join(" "),
          durationSeconds: Number(step.duration ?? segment.duration ?? 0) || 0,
          distanceMeters: Number(step.distance ?? segment.distance ?? 0) || 0,
          path,
          wayPoints: Array.isArray(step.way_points)
            ? [...step.way_points]
            : Array.isArray(segment.way_points)
            ? [...segment.way_points]
            : null,
        });
      } else if (
        step &&
        typeof step.instruction === "string" &&
        step.instruction.trim()
      ) {
        const moveType = step.mode || (step.type === 11 ? "Walk" : "Move");
        const path = extractLegPath(
          route.geometry,
          step.way_points || segment.way_points
        );
        legs.push({
          kind: "walk",
          mode: moveType,
          info: step.instruction.trim(),
          durationSeconds: Number(step.duration ?? 0) || 0,
          distanceMeters: Number(step.distance ?? 0) || 0,
          path,
          wayPoints: Array.isArray(step.way_points)
            ? [...step.way_points]
            : Array.isArray(segment.way_points)
            ? [...segment.way_points]
            : null,
        });
      }
    });
  });

  if (!legs.length) {
    return null;
  }

  const transitLegs = legs.filter((leg) => leg.kind === "transit");
  const transfers = Math.max(0, transitLegs.length - 1);
  const lines = uniqueOrdered(
    transitLegs.map((leg) => leg.line || leg.mode).filter(Boolean)
  );

  return {
    status: "ready",
    mode: "transit",
    durationSeconds: Number(route.summary?.duration ?? 0) || 0,
    distanceMeters: Number(route.summary?.distance ?? 0) || 0,
    transfers,
    lines,
    legs,
    geometry: route.geometry || null,
    path: geometryToLatLngs(route.geometry),
    metadata: route.metadata || {},
  };
}

function formatTransitSummary(transit, { includeLines = true } = {}) {
  if (!transit) return "";
  if (transit.status === "ready") {
    const durationText = formatDuration(Number(transit.durationSeconds));
    let transferText = "";
    if (Number.isInteger(transit.transfers) && transit.transfers >= 0) {
      transferText =
        transit.transfers === 0
          ? "Direct"
          : `${transit.transfers} transfer${
              transit.transfers === 1 ? "" : "s"
            }`;
    }
    const linesText =
      includeLines && Array.isArray(transit.lines) && transit.lines.length
        ? transit.lines.slice(0, 3).join(" → ")
        : "";
    return ["Transit", durationText, transferText, linesText]
      .filter(Boolean)
      .join(" · ");
  }
  if (transit.status === "error") {
    return transit.error
      ? `Transit unavailable: ${transit.error}`
      : "Transit unavailable";
  }
  if (transit.status === "unavailable") {
    return "";
  }
  return "";
}

function buildDirectionSteps(
  dateKey,
  day,
  itinerary,
  travel,
  { routeLabel = "", modeKey = null } = {}
) {
  if (!travel || travel.status !== "ready") {
    return [];
  }

  const steps = [];
  const departureMinutes = getPreferredDepartureMinutes(day);
  const baseDate = dateKey ? new Date(`${dateKey}T00:00:00`) : new Date();
  const startTimestamp = baseDate.getTime() + departureMinutes * 60000;
  let cursor = startTimestamp;

  const requestedMode = modeKey || getActiveTravelMode(travel) || "driving";
  const fallbackOrder = ["transit", "walking", "driving"];
  const candidateModes = [
    requestedMode,
    ...fallbackOrder.filter((mode) => mode !== requestedMode),
  ];
  let activeMode =
    candidateModes.find((mode) => isModeReady(getModeDetails(travel, mode))) ||
    requestedMode;
  let activeDetails = getModeDetails(travel, activeMode);
  if (!isModeReady(activeDetails)) {
    activeDetails = null;
  }

  const transit = getModeDetails(travel, "transit");
  const driving = getModeDetails(travel, "driving");

  const startStep = {
    kind: "milestone",
    role: "start",
    title: itinerary.originStay?.label
      ? `Depart ${itinerary.originStay.label}`
      : "Depart stay",
    detail: itinerary.originStay?.label || "",
    start: new Date(startTimestamp),
    end: new Date(startTimestamp),
    durationSeconds: 0,
    distanceMeters: 0,
  };
  steps.push(startStep);

  const legSource = Array.isArray(activeDetails?.legs)
    ? activeDetails.legs
    : [];

  if (legSource.length) {
    legSource.forEach((leg, legIndex) => {
      const legDuration = Number(leg.durationSeconds) || 0;
      const legStart = new Date(cursor);
      cursor += legDuration * 1000;
      const legEnd = new Date(cursor);
      const kind =
        leg.kind === "walk"
          ? "walk"
          : activeMode === "transit"
          ? "transit"
          : leg.kind === "transit"
          ? "transit"
          : "drive";
      const lineName =
        leg.line ||
        leg.mode ||
        (kind === "drive" ? "Drive" : kind === "walk" ? "Walk" : "Transit");
      const title =
        kind === "transit"
          ? `Take ${lineName}`
          : kind === "walk"
          ? leg.info || "Walk"
          : leg.info && leg.info.length < 120
          ? leg.info
          : "Drive";
      const detailParts = [];
      if (leg.from || leg.to) {
        detailParts.push(`${leg.from || "Start"} → ${leg.to || "Destination"}`);
      }
      if (kind === "transit" && leg.info) {
        detailParts.push(leg.info);
      }
      steps.push({
        kind,
        role: null,
        mode: leg.mode || lineName,
        line: leg.line || "",
        from: leg.from || "",
        to: leg.to || "",
        info: leg.info || "",
        title,
        detail: detailParts.filter(Boolean).join(" · "),
        start: legStart,
        end: legEnd,
        durationSeconds: legDuration,
        distanceMeters: Number(leg.distanceMeters) || 0,
        path: Array.isArray(leg.path) && leg.path.length ? leg.path : null,
        modeKey: activeMode,
        legIndex,
      });
    });
  } else {
    const durationSeconds = Number(travel.durationSeconds) || 0;
    const segmentStart = new Date(cursor);
    cursor += durationSeconds * 1000;
    const segmentEnd = new Date(cursor);
    const fallbackTitle =
      activeMode === "transit"
        ? "Use public transport between stops"
        : activeMode === "walking"
        ? "Walk between stops"
        : "Drive between stops";
    const detailParts = [];
    if (itinerary.activities.length) {
      detailParts.push(
        itinerary.activities.map((activity) => activity.label).join(" → ")
      );
    } else if (routeLabel) {
      detailParts.push(routeLabel);
    }
    steps.push({
      kind:
        activeMode === "transit"
          ? "transit"
          : activeMode === "walking"
          ? "walk"
          : "drive",
      role: null,
      mode: getModeLabel(activeMode),
      line: "",
      from: "",
      to: "",
      info: routeLabel,
      title: fallbackTitle,
      detail: detailParts.filter(Boolean).join(" · "),
      start: segmentStart,
      end: segmentEnd,
      durationSeconds,
      distanceMeters: Number(travel.distanceMeters) || 0,
      path:
        Array.isArray(activeDetails?.path) && activeDetails.path.length
          ? activeDetails.path
          : geometryToLatLngs(travel.geometry),
      modeKey: activeMode,
      legIndex: null,
    });
  }

  const arrivalStep = {
    kind: "milestone",
    role: "arrive",
    title: itinerary.stay?.label
      ? `Arrive at ${itinerary.stay.label}`
      : "Arrive at stay",
    detail: itinerary.stay?.label || "",
    start: new Date(cursor),
    end: new Date(cursor),
    durationSeconds: 0,
    distanceMeters: 0,
    path: null,
    modeKey: activeMode,
    legIndex: null,
  };
  steps.push(arrivalStep);

  return steps;
}

function getDirectionIcon(step) {
  if (!step) return "•";
  if (step.kind === "milestone") {
    return step.role === "arrive" ? "🏁" : "🚩";
  }
  if (step.kind === "walk") return "🚶";
  if (step.kind === "drive") return "🚗";
  if (step.kind === "transit") {
    const mode = (step.mode || "").toLowerCase();
    if (mode.includes("bus")) return "🚌";
    if (
      mode.includes("ferry") ||
      mode.includes("boat") ||
      mode.includes("ship")
    )
      return "⛴️";
    if (mode.includes("subway") || mode.includes("metro")) return "🚇";
    if (mode.includes("tram")) return "🚊";
    if (
      mode.includes("air") ||
      mode.includes("flight") ||
      mode.includes("plane")
    )
      return "✈️";
    if (mode.includes("shinkansen") || mode.includes("bullet")) return "🚄";
    return "🚆";
  }
  return "➡️";
}

function updateMapDirections(
  dateKey,
  { mode: modeOverride, focus = false } = {}
) {
  if (!mapDirectionsEl) return;
  mapDirectionsEl.innerHTML = "";
  mapDirectionsEl.dataset.mode = "";
  clearStepHighlight();

  const day = ensureDay(dateKey);
  const itinerary = buildItineraryForDay(day, dateKey);
  const travel = day.travel;
  const originLabel = itinerary.originStay?.label || "";
  const destinationLabel = itinerary.stay?.label || "";
  const routeLabel =
    originLabel && destinationLabel
      ? `${originLabel} → ${destinationLabel}`
      : "";
  const skippedTitle =
    Array.isArray(travel?.skipped) && travel.skipped.length
      ? buildMissingPinsTitle(travel.skipped)
      : "";

  if (!day.stay) {
    mapDirectionsEl.dataset.state = "empty";
    mapDirectionsEl.textContent =
      "Add a stay with map coordinates to see travel instructions.";
    mapDirectionsData = null;
    return;
  }

  if (!travel) {
    mapDirectionsEl.dataset.state = "pending";
    mapDirectionsEl.textContent = routeLabel
      ? `Calculating travel time for ${routeLabel}…`
      : "Travel time will be calculated soon.";
    mapDirectionsData = null;
    return;
  }

  if (travel.status !== "ready") {
    let message = "";
    let state = "pending";
    switch (travel.status) {
      case "pending":
        message = routeLabel
          ? `Calculating travel time for ${routeLabel}…`
          : "Calculating travel time…";
        break;
      case "missing-key":
        message = formatMissingRoutingKeyMessage(travel);
        break;
      case "missing-stay":
        message = "Select a stay with coordinates to calculate travel time.";
        break;
      case "insufficient-data":
        message =
          skippedTitle ||
          "Add coordinates for all stops to calculate travel time.";
        break;
      case "error":
        message = travel.error || "Unable to calculate travel time.";
        state = "error";
        break;
      default:
        message = "Travel time is not available for this day.";
        break;
    }
    mapDirectionsEl.dataset.state = state;
    mapDirectionsEl.textContent = message;
    mapDirectionsData = null;
    return;
  }

  const mode = modeOverride || getMapModeForDate(dateKey);
  const steps = buildDirectionSteps(dateKey, day, itinerary, travel, {
    routeLabel,
    modeKey: mode,
  });
  if (!steps.length) {
    mapDirectionsEl.dataset.state = "pending";
    mapDirectionsEl.textContent =
      "Travel directions are not available for this route yet.";
    mapDirectionsData = null;
    return;
  }

  mapDirectionsEl.dataset.state = "ready";
  mapDirectionsEl.dataset.mode = mode;
  const list = document.createElement("ol");
  list.className = "directions__list";

  steps.forEach((step, index) => {
    const item = document.createElement("li");
    item.className = "directions__item";
    if (step.kind === "milestone") {
      item.classList.add("directions__item--milestone");
    } else {
      item.classList.add(`directions__item--${step.kind}`);
    }
    item.dataset.stepIndex = String(index);
    const interactive = step.kind !== "milestone";
    item.tabIndex = interactive ? 0 : -1;
    const stepColor =
      step.color || (step.modeKey ? MODE_COLORS[step.modeKey] : null);
    if (stepColor) {
      item.style.setProperty("--direction-color", stepColor);
    }

    const timeColumn = document.createElement("div");
    timeColumn.className = "directions__time";
    const startLabel = formatTimeLabel(step.start);
    if (startLabel) {
      const startEl = document.createElement("span");
      startEl.textContent = startLabel;
      timeColumn.appendChild(startEl);
    }
    const endLabel = formatTimeLabel(step.end);
    if (endLabel && step.end && step.end.getTime() !== step.start?.getTime()) {
      const endEl = document.createElement("span");
      endEl.textContent = endLabel;
      timeColumn.appendChild(endEl);
    }
    item.appendChild(timeColumn);

    const content = document.createElement("div");
    content.className = "directions__content";

    const titleRow = document.createElement("div");
    titleRow.className = "directions__title";
    const iconEl = document.createElement("span");
    iconEl.className = "directions__icon";
    iconEl.textContent = getDirectionIcon(step);
    titleRow.appendChild(iconEl);
    const titleText = document.createElement("span");
    titleText.textContent =
      step.title ||
      (step.kind === "milestone" ? "Route milestone" : "Route step");
    titleRow.appendChild(titleText);
    content.appendChild(titleRow);

    if (step.kind !== "milestone") {
      const metaParts = [];
      if (startLabel) {
        metaParts.push(`Dep ${startLabel}`);
      }
      if (
        endLabel &&
        step.end &&
        step.end.getTime() !== step.start?.getTime()
      ) {
        metaParts.push(`Arr ${endLabel}`);
      }
      if (Number(step.durationSeconds) > 0) {
        metaParts.push(formatDuration(Number(step.durationSeconds)));
      }
      if (Number(step.distanceMeters) > 0) {
        metaParts.push(formatDistance(Number(step.distanceMeters)));
      }
      if (metaParts.length) {
        const meta = document.createElement("div");
        meta.className = "directions__meta";
        meta.textContent = metaParts.join(" · ");
        content.appendChild(meta);
      }
    }

    const detailText = step.detail || "";
    if (detailText) {
      const detailEl = document.createElement("div");
      detailEl.className = "directions__detail";
      detailEl.textContent = detailText;
      content.appendChild(detailEl);
    }
    if (stepColor && step.kind !== "milestone") {
      const indicator = document.createElement("span");
      indicator.className = "directions__line";
      indicator.style.background = stepColor;
      content.appendChild(indicator);
    }

    item.appendChild(content);
    list.appendChild(item);
  });

  mapDirectionsEl.appendChild(list);

  if (skippedTitle) {
    const note = document.createElement("div");
    note.className = "directions__note";
    note.textContent = skippedTitle;
    mapDirectionsEl.appendChild(note);
  }

  if (travel.meta) {
    const summary = document.createElement("div");
    summary.className = "rail-summary";
    const title = document.createElement("h4");
    title.textContent = travel.meta.route || "Transit summary";
    summary.appendChild(title);
    const listEl = document.createElement("dl");
    listEl.className = "rail-summary__grid";

    const addRow = (label, value) => {
      if (!value) return;
      const term = document.createElement("dt");
      term.textContent = label;
      const desc = document.createElement("dd");
      desc.textContent = value;
      listEl.append(term, desc);
    };

    addRow("Services", travel.meta.services);
    addRow("Key stops", travel.meta.keyStops);
    addRow("Approx. travel time", travel.meta.duration);
    addRow("Cost", travel.meta.cost);
    addRow("Pass coverage", travel.meta.pass);

    summary.appendChild(listEl);
    mapDirectionsEl.appendChild(summary);
  }

  const reference = renderRailReference();
  if (reference) {
    mapDirectionsEl.appendChild(reference);
  }

  mapDirectionsData = {
    dateKey,
    mode,
    steps,
    travelSignature: travel.signature || null,
    activeIndex: null,
    meta: travel.meta || null,
  };

  if (focus) {
    const firstInteractive = steps.findIndex(
      (step) => step.kind !== "milestone"
    );
    if (firstInteractive >= 0) {
      activateDirectionStep(firstInteractive, { flyTo: true });
    }
  }
}

function renderRailReference() {
  if (!Array.isArray(JAPAN_RAIL_REFERENCE) || !JAPAN_RAIL_REFERENCE.length) {
    return null;
  }
  const wrapper = document.createElement("section");
  wrapper.className = "rail-guide";
  const title = document.createElement("h4");
  title.className = "rail-guide__title";
  title.textContent = "JR Kansai express cheat-sheet";
  wrapper.appendChild(title);
  const table = document.createElement("table");
  table.className = "rail-guide__table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  [
    "Route",
    "Train service(s)",
    "Key stops",
    "Approx. travel time",
    "Cost",
    "JR Pass coverage",
  ].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  JAPAN_RAIL_REFERENCE.forEach((entry) => {
    const row = document.createElement("tr");
    const addCell = (value) => {
      const td = document.createElement("td");
      td.textContent = value || "—";
      row.appendChild(td);
    };
    addCell(entry.route);
    addCell(entry.services);
    addCell(entry.keyStops);
    addCell(entry.duration);
    addCell(entry.cost);
    addCell(entry.pass);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function updateMapSummary(dateKey) {
  if (!mapSummaryEl) return;
  const day = ensureDay(dateKey);
  const travel = day.travel;
  const itinerary = buildItineraryForDay(day, dateKey);
  const skippedCount = Array.isArray(travel?.skipped)
    ? travel.skipped.length
    : 0;
  const originLabel =
    typeof travel?.originStay?.label === "string"
      ? travel.originStay.label.trim()
      : (itinerary.originStay?.label || "").trim();
  const destinationLabel =
    typeof travel?.destinationStay?.label === "string"
      ? travel.destinationStay.label.trim()
      : (itinerary.stay?.label || "").trim();
  const routeLabel =
    originLabel && destinationLabel
      ? `${originLabel} → ${destinationLabel}`
      : "";
  const activeMode = getActiveTravelMode(travel) || "driving";
  const transitInfo = getModeDetails(travel, "transit");
  const walkingInfo = getModeDetails(travel, "walking");
  const drivingInfo = getModeDetails(travel, "driving");

  let message = "";
  if (!day.stay) {
    message = "Pick a stay with map coordinates to calculate travel time.";
  } else if (!travel) {
    message = routeLabel
      ? `Calculating travel time for ${routeLabel}…`
      : "Travel time will be calculated shortly.";
  } else if (travel.status === "pending") {
    message = routeLabel
      ? `Calculating travel time for ${routeLabel}…`
      : "Calculating travel time…";
  } else if (travel.status === "ready") {
    const durationText = formatDuration(Number(travel.durationSeconds));
    const distanceText = formatDistance(Number(travel.distanceMeters));
    const parts = [];
    if (routeLabel) parts.push(`Route: ${routeLabel}`);
    if (durationText) parts.push(`Total ${durationText}`);
    if (distanceText) parts.push(distanceText);
    parts.push(`Mode ${getModeLabel(activeMode)}`);
    const transitSummary = formatTransitSummary(transitInfo || null, {
      includeLines: true,
    });
    if (transitSummary && activeMode !== "transit") {
      parts.push(transitSummary);
    } else if (transitSummary) {
      parts.push(transitSummary);
    }
    if (isModeReady(walkingInfo) && activeMode !== "walking") {
      const walkDur = formatDuration(Number(walkingInfo.durationSeconds));
      const walkDist = formatDistance(Number(walkingInfo.distanceMeters));
      parts.push(["Walking", walkDur, walkDist].filter(Boolean).join(" "));
    }
    if (isModeReady(drivingInfo) && activeMode !== "driving") {
      const driveDur = formatDuration(Number(drivingInfo.durationSeconds));
      const driveDist = formatDistance(Number(drivingInfo.distanceMeters));
      parts.push(["Driving", driveDur, driveDist].filter(Boolean).join(" "));
    }
    if (skippedCount) {
      parts.push(
        `${skippedCount} stop${skippedCount === 1 ? "" : "s"} missing map pins`
      );
    }
    message = parts.join(" · ") || "Route ready.";
  } else if (travel.status === "missing-key") {
    message = formatMissingRoutingKeyMessage(travel);
  } else if (travel.status === "missing-stay") {
    message = "Pick a stay with map coordinates to calculate travel time.";
  } else if (travel.status === "no-activities") {
    const base = routeLabel ? `Route: ${routeLabel}` : "";
    const detail = skippedCount
      ? `${skippedCount} stop${skippedCount === 1 ? "" : "s"} missing map pins.`
      : "No mapped stops scheduled for this day.";
    message = [base, detail].filter(Boolean).join(" · ");
  } else if (travel.status === "insufficient-data") {
    const base = routeLabel ? `Route: ${routeLabel}` : "";
    message = [base, buildMissingPinsTitle(travel.skipped)]
      .filter(Boolean)
      .join(" · ");
  } else if (travel.status === "error") {
    const errorText = travel.error || "Unable to calculate travel time.";
    message = routeLabel ? `${routeLabel} · ${errorText}` : errorText;
  } else {
    message = "Travel time is not available for this day.";
  }

  mapSummaryEl.textContent = message;
}

function renderMapMarkers(dateKey) {
  if (!mapInstance || !mapMarkersLayer) return;
  mapMarkersLayer.clearLayers();
  clearMapRoute();

  const day = ensureDay(dateKey);
  const itinerary = buildItineraryForDay(day, dateKey);
  const bounds = window.L.latLngBounds([]);

  if (
    itinerary.originStay?.coords &&
    (!itinerary.stay?.coords ||
      !coordsEqual(itinerary.originStay.coords, itinerary.stay.coords))
  ) {
    const startMarker = window.L.circleMarker(itinerary.originStay.coords, {
      radius: 7,
      color: "#10b981",
      fillColor: "#10b981",
      fillOpacity: 0.85,
      weight: 2,
      opacity: 0.9,
    }).addTo(mapMarkersLayer);
    startMarker.bindPopup(
      `Start: ${itinerary.originStay.label || "Previous stay"}`
    );
    bounds.extend(itinerary.originStay.coords);
  }

  if (itinerary.stay?.coords) {
    const stayMarker = window.L.circleMarker(itinerary.stay.coords, {
      radius: 8,
      color: "#2563eb",
      fillColor: "#2563eb",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(mapMarkersLayer);
    stayMarker.bindPopup(`Stay: ${itinerary.stay.label}`);
    bounds.extend(itinerary.stay.coords);
  }

  itinerary.activities.forEach((activity, index) => {
    const marker = window.L.marker(activity.coords, {
      riseOnHover: true,
    }).addTo(mapMarkersLayer);
    marker.bindPopup(`${index + 1}. ${activity.label}`);
    bounds.extend(activity.coords);
  });

  if (bounds.isValid()) {
    mapInstance.fitBounds(bounds, { padding: [32, 32] });
  } else if (planState.config.mapDefaults?.center) {
    mapInstance.setView(
      planState.config.mapDefaults.center,
      planState.config.mapDefaults.zoom || 5
    );
  } else {
    mapInstance.setView([20, 0], 2);
  }
}

function renderMapRoute(dateKey, { mode: modeOverride, fit = true } = {}) {
  if (!mapInstance || activeMapDate !== dateKey) {
    return;
  }
  clearMapRoute();
  const day = ensureDay(dateKey);
  const travel = day.travel;
  if (!travel || travel.status !== "ready") {
    return;
  }
  const mode = modeOverride || getMapModeForDate(dateKey);
  const modeDetails = getModeDetails(travel, mode);
  const geometry = modeDetails?.geometry || travel.geometry;
  if (!geometry) {
    return;
  }
  const color = MODE_COLORS[mode] || "#2563eb";
  const style =
    mode === "walking"
      ? { color, weight: 4, opacity: 0.85, dashArray: "6 6" }
      : { color, weight: 4, opacity: 0.85 };
  mapRouteLayer = window.L.geoJSON(geometry, { style }).addTo(mapInstance);
  if (fit) {
    try {
      const bounds = mapRouteLayer.getBounds();
      if (bounds.isValid()) {
        mapInstance.fitBounds(bounds, { padding: [48, 48] });
      }
    } catch (error) {
      console.warn("Unable to fit map to route", error);
    }
  }
}

function clearMapRoute() {
  if (mapRouteLayer && mapInstance) {
    mapInstance.removeLayer(mapRouteLayer);
  }
  mapRouteLayer = null;
  clearStepHighlight();
}

function clearStepHighlight() {
  if (mapStepHighlightLayer && mapInstance) {
    mapInstance.removeLayer(mapStepHighlightLayer);
  }
  mapStepHighlightLayer = null;
  if (mapDirectionsEl) {
    mapDirectionsEl
      .querySelectorAll(".directions__item--active")
      .forEach((item) => {
        item.classList.remove("directions__item--active");
      });
  }
  if (mapDirectionsData) {
    mapDirectionsData.activeIndex = null;
  }
}

function activateDirectionStep(stepIndex, { flyTo = true } = {}) {
  if (!mapDirectionsData || mapDirectionsData.dateKey !== activeMapDate) {
    return;
  }
  const index = Number(stepIndex);
  if (!Number.isInteger(index)) return;
  const steps = mapDirectionsData.steps || [];
  const step = steps[index];
  if (!step) return;

  clearStepHighlight();

  const item = mapDirectionsEl?.querySelector(
    `.directions__item[data-step-index="${index}"]`
  );
  if (item) {
    item.classList.add("directions__item--active");
    mapDirectionsData.activeIndex = index;
    if (typeof item.scrollIntoView === "function") {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  const path = Array.isArray(step.path) && step.path.length ? step.path : null;
  if (mapInstance && path) {
    const highlightColor =
      step.color || (step.modeKey ? MODE_COLORS[step.modeKey] : "#f97316");
    mapStepHighlightLayer = window.L.polyline(path, {
      color: highlightColor,
      weight: 6,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(mapInstance);
    if (flyTo) {
      const bounds = computeBoundsFromPath(path);
      if (bounds) {
        mapInstance.fitBounds(bounds, { padding: [48, 48] });
      }
    }
  } else if (flyTo && mapRouteLayer) {
    try {
      const bounds = mapRouteLayer.getBounds();
      if (bounds.isValid()) {
        mapInstance.fitBounds(bounds, { padding: [48, 48] });
      }
    } catch (error) {
      console.warn("Unable to focus map on step", error);
    }
  }
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

function handleDirectionsInteraction(event) {
  const item = event.target.closest(".directions__item");
  if (!item || item.tabIndex < 0) return;
  const index = Number(item.dataset.stepIndex);
  if (Number.isInteger(index)) {
    activateDirectionStep(index, { flyTo: true });
  }
}

function handleDirectionsKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const item = event.target.closest(".directions__item");
  if (!item || item.tabIndex < 0) return;
  event.preventDefault();
  const index = Number(item.dataset.stepIndex);
  if (Number.isInteger(index)) {
    activateDirectionStep(index, { flyTo: true });
  }
}

function handleMapModeClick(event) {
  const button = event.target.closest("[data-map-mode]");
  if (!button || button.disabled) return;
  const mode = button.dataset.mapMode;
  if (!mode || !activeMapDate) return;
  const day = ensureDay(activeMapDate);
  const travel = day.travel;
  if (!travel || travel.status !== "ready") return;
  const details = getModeDetails(travel, mode);
  if (!isModeReady(details)) return;
  mapOverlayMode = mode;
  setMapModeForDate(activeMapDate, mode);
  updateMapModeUI(activeMapDate);
  renderMapRoute(activeMapDate, { mode, fit: true });
  updateMapSummary(activeMapDate);
  updateMapDirections(activeMapDate, { mode, focus: true });
}

function renderTravelChip(dateKey, plan) {
  const chip = document.createElement("span");
  chip.className = "theme-chip theme-chip--travel";
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

  const stayWrap = document.createElement("span");
  stayWrap.className = "day-card__stay";
  const stayButton = document.createElement("button");
  stayButton.type = "button";
  stayButton.className = "theme-chip theme-chip--link";
  stayButton.textContent = plan.stay ? getStayLabel(plan.stay) : "Pick stay";
  stayButton.addEventListener("click", () => openSheet(dateKey, "stay"));
  stayWrap.appendChild(stayButton);
  if (plan.stay && STAY_MAP.has(plan.stay)) {
    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "chiplet__info";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg>`;
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = `View details for ${getStayLabel(plan.stay)}`;
    infoBtn.append(icon, sr);
    infoBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      openItemDetail("stay", plan.stay);
    });
    stayWrap.appendChild(infoBtn);
  }
  badges.appendChild(stayWrap);

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

  const travelSummary = document.createElement("div");
  travelSummary.className = "travel-summary";
  travelSummary.dataset.travelSummary = dateKey;
  if (!travelExpansionState.has(dateKey)) {
    travelExpansionState.set(dateKey, false);
  }
  applyTravelSummary(travelSummary, plan, dateKey);
  card.appendChild(travelSummary);

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

  const activity = ACTIVITY_MAP.get(itemId);
  if (activity) {
    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "chiplet__info";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg>`;
    const srText = document.createElement("span");
    srText.className = "sr-only";
    srText.textContent = `View details for ${activity.label || label}`;
    infoBtn.append(icon, srText);
    infoBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      openItemDetail("activity", itemId);
    });
    chip.appendChild(infoBtn);
  }

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
  const nextDate = getAdjacentDateKey(dateKey, 1);
  if (nextDate) {
    invalidateTravel(nextDate, { persist: false, updateCard: false });
  }
  persistState();
  updateDayCard(dateKey);
  if (nextDate) {
    scheduleTravelChipRefresh(nextDate);
    scheduleTravelCalculation(nextDate, { interactive: false });
  }
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
        renderSheetGroup(loc, options, {
          type: "activity",
          onSelect: (item) => {
            addActivity(day, slot, item.id);
          },
          slotName: slot,
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
        renderSheetGroup(loc, options, {
          type: "stay",
          onSelect: (item) => {
            setStay(day, item.id);
          },
          selectedId: dayPlan.stay,
        })
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
        renderSheetGroup(loc, options, { type: "booking" })
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

function renderSheetGroup(locationId, items, options = {}) {
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
  const { type = "activity", onSelect, selectedId, slotName } = options;
  items.forEach((item) => {
    let card;
    if (type === "booking") {
      card = createBookingCard(item);
    } else {
      card = createCatalogCard(type, item, {
        onSelect,
        selected: selectedId && item.id === selectedId,
        slotName,
      });
    }
    list.appendChild(card);
  });
  group.appendChild(list);
  return group;
}

function createCatalogCard(type, item, options = {}) {
  const card = document.createElement("article");
  card.className = "sheet-card";
  if (options.selected) {
    card.classList.add("sheet-card--selected");
  }

  if (item.image) {
    const media = document.createElement("div");
    media.className = "sheet-card__media";
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = item.imageAlt || item.label || item.id;
    img.loading = "lazy";
    media.appendChild(img);
    card.appendChild(media);
  }

  const body = document.createElement("div");
  body.className = "sheet-card__body";

  const title = document.createElement("h3");
  title.className = "sheet-card__title";
  title.textContent = item.label || item.id;
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "sheet-card__meta";
  const metaParts = [];
  if (item.city) {
    metaParts.push(getLocationLabel(item.city));
  }
  const coords = resolveItemCoordinates(item);
  const coordLabel = formatCoordinatePair(coords);
  if (coordLabel) {
    metaParts.push(coordLabel);
  }
  metaParts.forEach((text) => {
    if (!text) return;
    const span = document.createElement("span");
    span.textContent = text;
    meta.appendChild(span);
  });
  if (item.locked) {
    const tag = document.createElement("span");
    tag.className = "sheet-card__tag";
    tag.textContent = "Locked";
    meta.appendChild(tag);
  }
  if (options.selected) {
    const tag = document.createElement("span");
    tag.className = "sheet-card__tag";
    tag.textContent = "Selected";
    meta.appendChild(tag);
  }
  if (meta.children.length) {
    body.appendChild(meta);
  }

  if (item.description) {
    const description = document.createElement("p");
    description.className = "sheet-card__description";
    description.textContent = item.description;
    body.appendChild(description);
  }

  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "sheet-card__actions";

  if (typeof options.onSelect === "function") {
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "btn btn--primary sheet-card__action";
    if (options.selected) {
      selectBtn.textContent = type === "stay" ? "Selected" : "Added";
      selectBtn.disabled = true;
    } else {
      selectBtn.textContent =
        type === "stay"
          ? "Use this stay"
          : `Add to ${formatSlotName(options.slotName)}`;
    }
    selectBtn.addEventListener("click", () => options.onSelect(item));
    actions.appendChild(selectBtn);
  }

  const detailBtn = document.createElement("button");
  detailBtn.type = "button";
  detailBtn.className = "btn sheet-card__action";
  detailBtn.textContent = "Details";
  detailBtn.addEventListener("click", () => openItemDetail(type, item.id));
  actions.appendChild(detailBtn);

  if (item.url) {
    const siteLink = document.createElement("a");
    siteLink.href = item.url;
    siteLink.target = "_blank";
    siteLink.rel = "noreferrer noopener";
    siteLink.className = "btn sheet-card__action";
    siteLink.textContent = "Official site";
    actions.appendChild(siteLink);
  }

  const bookingLinks = getBookingLinks(item.bookingIds);
  bookingLinks.forEach((booking) => {
    const link = document.createElement("a");
    link.href = booking.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.className = "btn sheet-card__action";
    link.textContent = booking.label;
    actions.appendChild(link);
  });

  if (actions.children.length) {
    card.appendChild(actions);
  }

  return card;
}

function createBookingCard(item) {
  const card = document.createElement("article");
  card.className = "sheet-card sheet-card--compact";

  const body = document.createElement("div");
  body.className = "sheet-card__body";

  const title = document.createElement("h3");
  title.className = "sheet-card__title";
  title.textContent = item.label || item.id;
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "sheet-card__meta";
  if (item.city) {
    const span = document.createElement("span");
    span.textContent = getLocationLabel(item.city);
    meta.appendChild(span);
  }
  if (meta.children.length) {
    body.appendChild(meta);
  }

  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "sheet-card__actions";
  if (item.url) {
    const openLink = document.createElement("a");
    openLink.href = item.url;
    openLink.target = "_blank";
    openLink.rel = "noreferrer noopener";
    openLink.className = "btn sheet-card__action";
    openLink.textContent = "Open link";
    actions.appendChild(openLink);
  }
  if (actions.children.length) {
    card.appendChild(actions);
  }

  return card;
}

function resolveItemCoordinates(item) {
  if (!item) return null;
  if (Array.isArray(item.coords) && item.coords.length >= 2) {
    const lat = Number(item.coords[0]);
    const lng = Number(item.coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lat, lng];
    }
  }
  const coordRef = item.coord || item.mapCoord || item.id;
  if (coordRef && planState.config.mapCoordinates?.[coordRef]) {
    const raw = planState.config.mapCoordinates[coordRef];
    if (Array.isArray(raw) && raw.length >= 2) {
      const lat = Number(raw[0]);
      const lng = Number(raw[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [lat, lng];
      }
    }
  }
  return null;
}

function formatCoordinatePair(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return "";
  const lat = Number(pair[0]);
  const lng = Number(pair[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const latHem = lat >= 0 ? "N" : "S";
  const lngHem = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latHem}, ${Math.abs(lng).toFixed(
    4
  )}° ${lngHem}`;
}

function getBookingLinks(ids) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const links = [];
  ids.forEach((id) => {
    if (!id || seen.has(id)) return;
    const booking = BOOKING_MAP.get(id);
    if (booking && booking.url) {
      links.push(booking);
      seen.add(id);
    }
  });
  return links;
}

function formatSlotName(slotName) {
  const source = slotName ? String(slotName) : "plan";
  return source.charAt(0).toUpperCase() + source.slice(1);
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

  closeItemBtn?.addEventListener("click", closeItemDetail);
  itemOverlay?.addEventListener("click", (event) => {
    if (event.target === itemOverlay) {
      closeItemDetail();
    }
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
      if (itemOverlay?.classList.contains("is-open")) closeItemDetail();
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
  if (!ref) return "";
  if (typeof ref === "string") {
    const trimmed = ref.trim();
    return STAY_MAP.get(trimmed)?.label || trimmed;
  }
  if (typeof ref === "object") {
    if (typeof ref.label === "string" && ref.label.trim()) {
      return ref.label.trim();
    }
    if (typeof ref.name === "string" && ref.name.trim()) {
      return ref.name.trim();
    }
    if (typeof ref.id === "string" && ref.id.trim()) {
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

function openItemDetail(type, itemId) {
  if (!itemOverlay) return;
  let item = null;
  if (type === "activity") {
    item = ACTIVITY_MAP.get(itemId);
  } else if (type === "stay") {
    item = STAY_MAP.get(itemId);
  }
  if (!item) return;

  activeItemDetail = { type, id: itemId };
  const titleText =
    item.label ||
    (type === "activity" ? getActivityLabel(itemId) : getStayLabel(itemId)) ||
    itemId;
  if (itemDetailTitle) {
    itemDetailTitle.textContent = titleText;
  }
  const typeLabel = type === "stay" ? "Stay" : "Activity";
  const locationLabel = item.city ? getLocationLabel(item.city) : "";
  if (itemDetailSubtitle) {
    const subtitleParts = [typeLabel];
    if (locationLabel) subtitleParts.push(locationLabel);
    itemDetailSubtitle.textContent = subtitleParts.join(" • ");
  }

  if (itemDetailDescription) {
    if (item.description) {
      itemDetailDescription.textContent = item.description;
      itemDetailDescription.hidden = false;
    } else {
      itemDetailDescription.textContent = "";
      itemDetailDescription.hidden = true;
    }
  }

  if (item.image && itemDetailImage) {
    itemDetailImage.src = item.image;
    itemDetailImage.alt = item.imageAlt || titleText;
    if (itemDetailMedia) {
      itemDetailMedia.hidden = false;
      itemDetailMedia.classList.remove("is-hidden");
    }
  } else if (itemDetailImage) {
    itemDetailImage.src = "";
    if (itemDetailMedia) {
      itemDetailMedia.hidden = true;
      itemDetailMedia.classList.add("is-hidden");
    }
  }

  const coords = resolveItemCoordinates(item);
  const coordLabel = formatCoordinatePair(coords);
  if (itemDetailMeta) {
    itemDetailMeta.innerHTML = "";
    const appendMeta = (label, value) => {
      if (!value) return;
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      itemDetailMeta.append(dt, dd);
    };
    if (locationLabel) {
      appendMeta("Location", locationLabel);
    }
    if (coordLabel) {
      appendMeta("Coordinates", coordLabel);
    }
    if (item.locked) {
      appendMeta("Status", "Locked itinerary item");
    }
  }

  if (itemDetailLinks) {
    itemDetailLinks.innerHTML = "";
    if (item.url) {
      const siteLink = document.createElement("a");
      siteLink.href = item.url;
      siteLink.target = "_blank";
      siteLink.rel = "noreferrer noopener";
      siteLink.className = "btn btn--primary";
      siteLink.textContent = "Official site";
      itemDetailLinks.appendChild(siteLink);
    }
    const bookingLinks = getBookingLinks(item.bookingIds);
    bookingLinks.forEach((booking) => {
      const link = document.createElement("a");
      link.href = booking.url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.className = "btn";
      link.textContent = booking.label;
      itemDetailLinks.appendChild(link);
    });
    if (coordLabel && Array.isArray(coords)) {
      const [lat, lng] = coords;
      const mapLink = document.createElement("a");
      mapLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      mapLink.target = "_blank";
      mapLink.rel = "noreferrer noopener";
      mapLink.className = "btn";
      mapLink.textContent = "Open in Google Maps";
      itemDetailLinks.appendChild(mapLink);
    }
  }

  itemOverlay.classList.add("is-open");
  itemOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("item-open");
}

function closeItemDetail() {
  if (!itemOverlay) return;
  itemOverlay.classList.remove("is-open");
  itemOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("item-open");
  activeItemDetail = null;
  if (itemDetailImage) {
    itemDetailImage.src = "";
  }
  if (itemDetailDescription) {
    itemDetailDescription.textContent = "";
    itemDetailDescription.hidden = true;
  }
  if (itemDetailMeta) {
    itemDetailMeta.innerHTML = "";
  }
  if (itemDetailLinks) {
    itemDetailLinks.innerHTML = "";
  }
  if (itemDetailMedia) {
    itemDetailMedia.hidden = true;
    itemDetailMedia.classList.add("is-hidden");
  }
}

function openMap(dateKey) {
  const plan = ensureDay(dateKey);
  activeMapDate = dateKey;
  mapOverlayMode = getMapModeForDate(dateKey);
  mapOverlay.classList.add("is-open");
  mapOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("map-open");
  const mapTitle = document.getElementById("mapTitle");
  mapTitle.textContent = `${formatLongDate(dateKey)} — ${
    plan.theme || getDefaultTheme(plan.loc) || ""
  }`;
  updateMapSummary(dateKey);
  updateMapModeUI(dateKey);
  updateMapDirections(dateKey, { mode: mapOverlayMode });

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
    renderMapRoute(dateKey, { mode: mapOverlayMode, fit: true });
  }, 50);

  scheduleTravelCalculation(dateKey, { interactive: true }).finally(() => {
    if (activeMapDate === dateKey) {
      updateMapSummary(dateKey);
      updateMapModeUI(dateKey);
      renderMapRoute(dateKey, { mode: mapOverlayMode, fit: true });
      updateMapDirections(dateKey, { mode: mapOverlayMode });
    }
  });
}

function closeMap() {
  mapOverlay.classList.remove("is-open");
  mapOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("map-open");
  activeMapDate = null;
  clearMapRoute();
  if (mapMarkersLayer) {
    mapMarkersLayer.clearLayers();
  }
  if (mapSummaryEl) {
    mapSummaryEl.textContent = "";
  }
  if (mapDirectionsEl) {
    mapDirectionsEl.innerHTML = "";
    mapDirectionsEl.removeAttribute("data-state");
  }
  if (mapModeControls) {
    mapModeControls.style.display = "none";
  }
  clearStepHighlight();
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
      : {
          provider: DEFAULT_ROUTING_PROVIDER,
          drivingProvider: DEFAULT_ROUTING_PROVIDER,
          walkingProvider: DEFAULT_ROUTING_PROVIDER,
          transitProvider: "auto",
          openRouteApiKey: "",
          googleApiKey: "",
        },
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
