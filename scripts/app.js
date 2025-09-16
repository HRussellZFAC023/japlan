import {
  fetchTripDefinition,
  buildStorageKey,
  saveTripDefinitionToGitHub,
  encodeBase64,
} from './data.js';

const SHARE_PREFIX = '#view=';
const COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;
const FALLBACK_COLORS = ['#fde68a', '#bbf7d0', '#bae6fd', '#c7d2fe', '#fecdd3', '#fbcfe8'];
const TRAVEL_SPEED_KMH = 40;

const calendarEl = document.getElementById('calendar');
const poolSection = document.getElementById('pool');
const poolChipsEl = document.getElementById('poolChips');
const filterFeedbackEl = document.getElementById('filterFeedback');
const readonlyBanner = document.getElementById('readonlyBanner');
const friendFiltersEl = document.getElementById('friendFilters');
const locationFiltersEl = document.getElementById('locationFilters');
const editBtn = document.querySelector('[data-action="toggle-edit"]');
const shareBtn = document.querySelector('[data-action="share-state"]');
const wizardBtn = document.querySelector('[data-action="open-wizard"]');
const saveGithubBtn = document.querySelector('[data-action="save-github"]');
const icsBtn = document.querySelector('[data-action="export-ics"]');
const clearPoolBtn = poolSection.querySelector('[data-action="clear-pool"]');
const allFilterBtn = document.querySelector('[data-filter="all"]');

const sheetEl = document.getElementById('sheet');
const sheetBackdrop = document.getElementById('sheetBackdrop');
const sheetTitle = document.getElementById('sheetTitle');
const sheetSubtitle = document.getElementById('sheetSubtitle');
const sheetBody = document.getElementById('sheetBody');

const mapOverlay = document.getElementById('mapOverlay');
const closeMapBtn = mapOverlay.querySelector('[data-action="close-map"]');

const wizardOverlay = document.getElementById('wizardOverlay');
const wizardForm = document.getElementById('wizardForm');
const closeWizardBtn = wizardOverlay.querySelector('[data-action="close-wizard"]');
const githubOverlay = document.getElementById('githubOverlay');
const githubForm = document.getElementById('githubForm');
const closeGithubBtn = githubOverlay.querySelector('[data-action="close-github"]');

let statusTimer = null;

const state = {
  definition: null,
  storageKey: '',
  editing: false,
  share: { readOnly: false },
  filter: { friends: new Set(), locations: new Set() },
  sheet: { open: false, day: null, slot: 'morning', tab: 'activity' },
  plan: { days: {}, pool: [] },
  catalog: { activity: [], guide: [], stay: [], booking: [] },
  customCatalog: { activity: [], guide: [], stay: [], booking: [] },
  customCoordinates: {},
  coordinates: {},
  themes: {},
  people: [],
  locations: [],
  locationOrder: [],
  dateSequence: [],
  availability: new Map(),
  travelCache: new Map(),
  pointerDrag: null,
  chipDragData: null,
  cardDragSource: null,
  message: '',
  userConfig: {
    title: 'Trip plan',
    range: { start: '', end: '' },
    baseLocation: 'work',
    constraints: { nanaWork: true, maxAway: 3 },
    people: [],
  },
  map: { instance: null, markers: null, route: null },
};

init();

async function init() {
  try {
    state.definition = await fetchTripDefinition();
  } catch (error) {
    console.error('Unable to load trip definition', error);
    setStatusMessage('Failed to load trip data.', 'error');
    return;
  }

  state.storageKey = buildStorageKey(state.definition);
  applyDefinitionDefaults();
  loadLocalState();
  rebuildDerivedData();

  const shared = loadFromHash();
  if (!shared) {
    ensurePlanForRange();
    rebuildDerivedData();
    persistState();
  }

  renderApp();
  attachGlobalEvents();

  if (!shared && shouldOpenWizardInitially()) {
    openWizard();
  }
}

function applyDefinitionDefaults() {
  const def = state.definition;
  state.locations = Array.isArray(def.locations) ? def.locations.map((loc) => ({ ...loc })) : [];
  state.locationOrder = state.locations.map((loc) => loc.id);
  state.coordinates = { ...(def.coordinates || {}) };
  state.themes = { ...(def.themes || {}) };
  state.catalog = {
    activity: Array.isArray(def.catalog?.activity) ? def.catalog.activity.map((item) => ({ ...item })) : [],
    guide: Array.isArray(def.catalog?.guide) ? def.catalog.guide.map((item) => ({ ...item })) : [],
    stay: Array.isArray(def.catalog?.stay) ? def.catalog.stay.map((item) => ({ ...item })) : [],
    booking: Array.isArray(def.catalog?.booking) ? def.catalog.booking.map((item) => ({ ...item })) : [],
  };
  const basePeople = Array.isArray(def.people) ? def.people.map((person) => ({ ...person })) : [];
  state.userConfig.title = def.trip?.title || state.userConfig.title;
  state.userConfig.range = {
    start: def.trip?.range?.start || new Date().toISOString().slice(0, 10),
    end: def.trip?.range?.end || new Date().toISOString().slice(0, 10),
  };
  state.userConfig.baseLocation = def.trip?.baseLocation || state.userConfig.baseLocation;
  const nanaDefaults = def.people?.find((p) => p.id === 'Nana')?.constraints || {};
  state.userConfig.constraints = {
    nanaWork: def.constraints?.nanaWork ?? (nanaDefaults.workDays ? true : true),
    maxAway: def.constraints?.maxAway ?? nanaDefaults.maxAway ?? 3,
  };
  state.userConfig.people = basePeople.map((person) => ({
    id: person.id,
    label: person.label || person.id,
    color: person.color,
  }));
  syncPeople();
  buildDateSequenceForRange();
}

function shouldOpenWizardInitially() {
  const stored = localStorage.getItem(state.storageKey);
  return !stored;
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(state.storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.userConfig) {
      const cfg = parsed.userConfig;
      state.userConfig.title = cfg.title || state.userConfig.title;
      if (cfg.range?.start && cfg.range?.end) {
        state.userConfig.range = { start: cfg.range.start, end: cfg.range.end };
      }
      if (cfg.baseLocation) state.userConfig.baseLocation = cfg.baseLocation;
      if (cfg.constraints) {
        state.userConfig.constraints = {
          nanaWork: cfg.constraints.nanaWork ?? state.userConfig.constraints.nanaWork,
          maxAway: cfg.constraints.maxAway ?? state.userConfig.constraints.maxAway,
        };
      }
      if (Array.isArray(cfg.people) && cfg.people.length) {
        state.userConfig.people = cfg.people.map((person) => ({
          id: person.id,
          label: person.label || person.id,
          color: person.color,
        }));
      }
    }
    syncPeople();
    buildDateSequenceForRange();

    if (parsed?.customCatalog) {
      state.customCatalog = {
        activity: Array.isArray(parsed.customCatalog.activity) ? parsed.customCatalog.activity.map((item) => ({ ...item })) : [],
        guide: Array.isArray(parsed.customCatalog.guide) ? parsed.customCatalog.guide.map((item) => ({ ...item })) : [],
        stay: Array.isArray(parsed.customCatalog.stay) ? parsed.customCatalog.stay.map((item) => ({ ...item })) : [],
        booking: Array.isArray(parsed.customCatalog.booking) ? parsed.customCatalog.booking.map((item) => ({ ...item })) : [],
      };
    }
    if (parsed?.customCoordinates) {
      state.customCoordinates = { ...parsed.customCoordinates };
    }
    state.plan.pool = Array.isArray(parsed?.pool) ? [...parsed.pool] : [];
    state.plan.days = parsed?.days ? { ...parsed.days } : {};
  } catch (error) {
    console.warn('Failed to load saved state', error);
  }
}

function persistState() {
  if (state.share.readOnly) return;
  try {
    const payload = {
      version: state.definition.version,
      days: state.plan.days,
      pool: state.plan.pool,
      customCatalog: state.customCatalog,
      customCoordinates: state.customCoordinates,
      userConfig: state.userConfig,
    };
    localStorage.setItem(state.storageKey, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist trip planner state', error);
  }
}

function syncPeople() {
  const combined = new Map();
  const addPerson = (person) => {
    if (!person || !person.id) return;
    if (!combined.has(person.id)) {
      combined.set(person.id, {
        id: person.id,
        label: person.label || person.id,
        color: person.color || pickFallbackColor(combined.size),
      });
    }
  };
  (state.definition.people || []).forEach(addPerson);
  (state.userConfig.people || []).forEach(addPerson);
  state.people = Array.from(combined.values());
  state.userConfig.people = state.people.map((person) => ({ ...person }));
}

function pickFallbackColor(index) {
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function buildDateSequenceForRange() {
  state.dateSequence = buildDateSequence(state.userConfig.range.start, state.userConfig.range.end);
}

function ensurePlanForRange() {
  const defaults = state.definition.defaults || {};
  const nextDays = {};
  state.dateSequence.forEach((dateKey) => {
    const merged = mergeDayData(defaults[dateKey], state.plan.days?.[dateKey]);
    nextDays[dateKey] = merged;
  });
  state.plan.days = nextDays;
  pruneTravelCache();
}

function pruneTravelCache() {
  const next = new Map();
  state.dateSequence.forEach((date) => {
    if (state.travelCache.has(date)) {
      next.set(date, state.travelCache.get(date));
    }
  });
  state.travelCache = next;
}

function buildDateSequence(start, end) {
  const results = [];
  if (!start || !end) return results;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return results;
  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    results.push(cursor.toISOString().slice(0, 10));
  }
  return results;
}

function createEmptyDay(location = state.userConfig.baseLocation || 'work') {
  return {
    loc: location,
    theme: '',
    friends: [],
    stay: null,
    slots: { morning: [], afternoon: [], evening: [] },
    locks: {},
  };
}

function cloneDay(day) {
  const source = day || createEmptyDay();
  return {
    loc: source.loc || state.userConfig.baseLocation || 'work',
    theme: source.theme || '',
    friends: Array.isArray(source.friends) ? [...new Set(source.friends.filter(Boolean))] : [],
    stay: source.stay || null,
    slots: {
      morning: Array.isArray(source.slots?.morning) ? [...source.slots.morning] : [],
      afternoon: Array.isArray(source.slots?.afternoon) ? [...source.slots.afternoon] : [],
      evening: Array.isArray(source.slots?.evening) ? [...source.slots.evening] : [],
    },
    locks: { ...(source.locks || {}) },
  };
}

function mergeDayData(defaultDay, savedDay) {
  if (!savedDay) return cloneDay(defaultDay || createEmptyDay());
  const merged = cloneDay(defaultDay || createEmptyDay());
  merged.loc = savedDay.loc || merged.loc;
  merged.theme = savedDay.theme ?? merged.theme;
  merged.stay = savedDay.stay ?? merged.stay ?? null;
  if (Array.isArray(savedDay.friends)) {
    merged.friends = [...new Set(savedDay.friends.filter(Boolean))];
  }
  ['morning', 'afternoon', 'evening'].forEach((slot) => {
    if (Array.isArray(savedDay.slots?.[slot])) {
      merged.slots[slot] = [...savedDay.slots[slot]];
    }
  });
  merged.locks = { ...merged.locks, ...(savedDay.locks || {}) };
  return merged;
}
function rebuildDerivedData() {
  state.coordinates = { ...(state.definition.coordinates || {}), ...state.customCoordinates };
  state.catalog.activity = mergeCatalogArrays(state.definition.catalog?.activity, state.customCatalog.activity);
  state.catalog.guide = mergeCatalogArrays(state.definition.catalog?.guide, state.customCatalog.guide);
  state.catalog.stay = mergeCatalogArrays(state.definition.catalog?.stay, state.customCatalog.stay);
  state.catalog.booking = mergeCatalogArrays(state.definition.catalog?.booking, state.customCatalog.booking);
  updateTravelCache();
  updateAvailabilityWarnings();
}

function mergeCatalogArrays(base = [], extra = []) {
  const map = new Map();
  base.forEach((item) => {
    if (item?.id) {
      map.set(item.id, { ...item });
    }
  });
  extra.forEach((item) => {
    if (item?.id) {
      map.set(item.id, { ...item });
    }
  });
  return Array.from(map.values());
}

function ensureDay(dateKey) {
  if (!state.plan.days[dateKey]) {
    state.plan.days[dateKey] = createEmptyDay();
  }
  const day = state.plan.days[dateKey];
  day.slots = day.slots || { morning: [], afternoon: [], evening: [] };
  day.locks = day.locks || {};
  day.friends = Array.isArray(day.friends) ? day.friends : [];
  day.loc = day.loc || state.userConfig.baseLocation || 'work';
  return day;
}

function renderApp() {
  updateDocumentTitle();
  renderFilterChips();
  renderPool();
  renderCalendar();
  syncFilterButtons();
  updateFilterFeedback();
  updateActionStates();
}

function updateDocumentTitle() {
  const heading = document.querySelector('.site-title');
  if (heading) heading.textContent = state.userConfig.title;
  document.title = state.userConfig.title;
}

function renderFilterChips() {
  if (friendFiltersEl) {
    friendFiltersEl.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'toolbar-label';
    label.textContent = 'Friends';
    friendFiltersEl.appendChild(label);
    state.people.forEach((person) => {
      const btn = document.createElement('button');
      btn.className = 'chip chip--friend';
      btn.dataset.friend = person.id;
      btn.textContent = person.label || person.id;
      if (person.color) {
        btn.style.background = person.color;
      }
      btn.addEventListener('click', () => toggleFriendFilter(person.id));
      friendFiltersEl.appendChild(btn);
    });
  }

  if (locationFiltersEl) {
    locationFiltersEl.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'toolbar-label';
    label.textContent = 'Places';
    locationFiltersEl.appendChild(label);
    state.locationOrder.forEach((locId) => {
      const meta = state.locations.find((loc) => loc.id === locId);
      if (!meta) return;
      const btn = document.createElement('button');
      btn.className = 'chip chip--location';
      btn.dataset.location = locId;
      btn.textContent = meta.label || locId;
      btn.addEventListener('click', () => toggleLocationFilter(locId));
      locationFiltersEl.appendChild(btn);
    });
  }
}

function toggleFriendFilter(friend) {
  if (state.filter.friends.has(friend)) {
    state.filter.friends.delete(friend);
  } else {
    state.filter.friends.add(friend);
  }
  applyFilters();
  syncFilterButtons();
  updateFilterFeedback();
}

function toggleLocationFilter(location) {
  if (state.filter.locations.has(location)) {
    state.filter.locations.delete(location);
  } else {
    state.filter.locations.add(location);
  }
  applyFilters();
  syncFilterButtons();
  updateFilterFeedback();
}

function clearFilters() {
  state.filter.friends.clear();
  state.filter.locations.clear();
  applyFilters();
  syncFilterButtons();
  updateFilterFeedback();
}

function renderPool() {
  poolChipsEl.innerHTML = '';
  const poolItems = state.plan.pool.filter(Boolean);
  poolSection.hidden = !poolItems.length;
  if (!poolItems.length) return;

  poolItems.forEach((id, index) => {
    const item = getActivityById(id) || getGuideById(id);
    const chip = document.createElement('span');
    chip.className = 'chiplet';
    chip.dataset.id = id;
    chip.dataset.source = 'pool';
    chip.dataset.index = String(index);
    chip.appendChild(buildChipContent(item?.label || id));
    if (state.editing && !state.share.readOnly) {
      chip.draggable = !COARSE_POINTER;
      chip.addEventListener('dragstart', handleChipDragStart);
      chip.addEventListener('dragend', handleChipDragEnd);
      chip.addEventListener('pointerdown', handleChipPointerDown);
      const actions = document.createElement('span');
      actions.className = 'chiplet__actions';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'chiplet__btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove from pool';
      removeBtn.addEventListener('click', () => removeFromPool(index));
      actions.appendChild(removeBtn);
      chip.appendChild(actions);
    }
    poolChipsEl.appendChild(chip);
  });
}

function renderCalendar() {
  calendarEl.innerHTML = '';
  state.dateSequence.forEach((dateKey) => {
    const card = renderDayCard(dateKey);
    calendarEl.appendChild(card);
  });
  applyFilters();
}

function renderDayCard(dateKey) {
  const plan = ensureDay(dateKey);
  const card = document.createElement('article');
  card.className = 'day-card';
  card.dataset.date = dateKey;
  card.dataset.location = plan.loc;
  const canEdit = state.editing && !state.share.readOnly;
  card.draggable = canEdit;

  const stripe = document.createElement('span');
  stripe.className = 'day-card__stripe';
  const locMeta = state.locations.find((loc) => loc.id === plan.loc);
  stripe.style.background = locMeta?.color || '#d1d5db';
  card.appendChild(stripe);

  const header = document.createElement('div');
  header.className = 'day-card__header';
  const dateBox = document.createElement('div');
  dateBox.className = 'day-card__date';
  const date = new Date(`${dateKey}T00:00:00`);
  const number = document.createElement('span');
  number.className = 'day-card__day-number';
  number.textContent = String(date.getDate());
  const textWrap = document.createElement('div');
  textWrap.className = 'day-card__date-text';
  const month = document.createElement('span');
  month.textContent = date.toLocaleDateString(undefined, { month: 'short' });
  const weekday = document.createElement('span');
  weekday.textContent = date.toLocaleDateString(undefined, { weekday: 'short' });
  textWrap.append(month, weekday);
  dateBox.append(number, textWrap);
  header.appendChild(dateBox);

  const badges = document.createElement('div');
  badges.className = 'day-card__badges';

  const themeWrap = document.createElement('span');
  themeWrap.className = 'theme-editor';
  const themeChip = document.createElement('span');
  themeChip.className = 'theme-chip';
  const themeText = plan.theme || state.themes[plan.loc] || 'Set theme';
  themeChip.textContent = themeText;
  themeWrap.appendChild(themeChip);
  if (canEdit) {
    const editThemeBtn = document.createElement('button');
    editThemeBtn.type = 'button';
    editThemeBtn.className = 'theme-editor__button';
    editThemeBtn.textContent = '✎';
    editThemeBtn.title = 'Edit theme';
    editThemeBtn.addEventListener('click', () => openThemeEditor(dateKey, themeWrap));
    themeWrap.appendChild(editThemeBtn);
  }
  badges.appendChild(themeWrap);

  const stayBtn = document.createElement('button');
  stayBtn.type = 'button';
  stayBtn.className = 'theme-chip theme-chip--link';
  stayBtn.textContent = plan.stay ? getStayLabel(plan.stay) : 'Pick stay';
  stayBtn.disabled = !canEdit;
  if (canEdit) {
    stayBtn.addEventListener('click', () => openSheet(dateKey, 'stay'));
  }
  badges.appendChild(stayBtn);

  const mapBtn = document.createElement('button');
  mapBtn.type = 'button';
  mapBtn.className = 'theme-chip theme-chip--map';
  mapBtn.textContent = 'Map';
  mapBtn.addEventListener('click', () => openMap(dateKey));
  badges.appendChild(mapBtn);

  header.appendChild(badges);
  card.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'day-card__meta';
  const travelInfo = state.travelCache.get(dateKey);
  if (travelInfo && travelInfo.minutes > 0) {
    const travelPill = document.createElement('span');
    travelPill.className = 'meta-pill';
    travelPill.innerHTML = `<strong>Travel</strong> ~${travelInfo.minutes} min`;
    meta.appendChild(travelPill);
  }
  const conflicts = state.availability.get(dateKey) || [];
  conflicts.forEach((warning) => {
    const warn = document.createElement('span');
    warn.className = 'meta-pill meta-pill--warning';
    warn.textContent = warning;
    meta.appendChild(warn);
  });
  card.appendChild(meta);

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
    addBtn.disabled = !canEdit;
    if (canEdit) {
      addBtn.addEventListener('click', () => openSheet(dateKey, 'activity', slotName));
    }
    slotHeader.append(slotTitle, addBtn);
    slotSection.appendChild(slotHeader);

    const items = plan.slots?.[slotName] || [];
    items.forEach((itemId, index) => {
      const chip = renderChip(dateKey, slotName, itemId, index, canEdit);
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
  state.people.forEach((person) => {
    const on = plan.friends.includes(person.id);
    const friendBtn = document.createElement('button');
    friendBtn.type = 'button';
    friendBtn.className = 'friend-chip' + (on ? ' friend-chip--on' : '');
    friendBtn.dataset.friend = person.id;
    friendBtn.textContent = on ? person.label : `+ ${person.label}`;
    friendBtn.disabled = !canEdit;
    if (on && person.color) {
      friendBtn.style.background = person.color;
    }
    if (canEdit) {
      friendBtn.addEventListener('click', () => toggleFriend(dateKey, person.id));
    }
    friendRow.appendChild(friendBtn);
  });
  card.appendChild(friendRow);

  if (canEdit) {
    card.addEventListener('dragstart', handleCardDragStart);
    card.addEventListener('dragend', () => {
      state.cardDragSource = null;
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('drop', handleCardDrop);
  }

  return card;
}
function renderChip(dateKey, slotName, itemId, index, canEdit) {
  const chip = document.createElement('span');
  chip.className = 'chiplet';
  chip.dataset.id = itemId;
  chip.dataset.date = dateKey;
  chip.dataset.slot = slotName;
  chip.dataset.index = String(index);
  chip.dataset.source = 'slot';

  const activity = getActivityById(itemId) || getGuideById(itemId);
  chip.appendChild(buildChipContent(activity?.label || itemId));

  const locked = isChipLocked(dateKey, itemId);
  if (locked) {
    chip.classList.add('locked');
  }

  if (canEdit && !locked) {
    chip.draggable = !COARSE_POINTER;
    chip.addEventListener('dragstart', handleChipDragStart);
    chip.addEventListener('dragend', handleChipDragEnd);
  } else {
    chip.draggable = false;
  }
  if (canEdit && !locked) {
    chip.addEventListener('pointerdown', handleChipPointerDown);
  }

  if (canEdit) {
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

function openThemeEditor(dateKey, container) {
  const day = ensureDay(dateKey);
  container.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'theme-editor__input';
  input.value = day.theme || '';
  container.appendChild(input);
  input.focus();
  const finalize = () => {
    day.theme = input.value.trim();
    persistState();
    updateTravelForDay(dateKey);
    updateAvailabilityWarnings();
    updateDayCard(dateKey);
  };
  const cancel = () => {
    updateDayCard(dateKey);
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      finalize();
    } else if (event.key === 'Escape') {
      cancel();
    }
  });
  input.addEventListener('blur', finalize);
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
  updateAvailabilityWarnings();
  updateDayCard(dateKey);
}

function addActivity(dateKey, slotName, activityId) {
  if (state.share.readOnly) return;
  const day = ensureDay(dateKey);
  day.slots[slotName] = day.slots[slotName] || [];
  day.slots[slotName].push(activityId);
  persistState();
  updateTravelForDay(dateKey);
  updateAvailabilityWarnings();
  updateDayCard(dateKey);
}

function setStay(dateKey, stayId) {
  if (state.share.readOnly) return;
  const day = ensureDay(dateKey);
  day.stay = stayId;
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
  persistState();
  updateTravelForDay(dateKey);
  updateAvailabilityWarnings();
  updateDayCard(dateKey);
}

function toggleLock(dateKey, itemId) {
  const day = ensureDay(dateKey);
  day.locks = day.locks || {};
  if (isChipLocked(dateKey, itemId)) {
    day.locks[itemId] = 0;
  } else {
    day.locks[itemId] = 1;
  }
  persistState();
  updateDayCard(dateKey);
}

function isChipLocked(dateKey, itemId) {
  const day = ensureDay(dateKey);
  const override = day.locks?.[itemId];
  if (override === 1) return true;
  if (override === 0) return false;
  const activity = getActivityById(itemId) || getGuideById(itemId);
  return Boolean(activity?.locked);
}

function getActivityById(id) {
  return state.catalog.activity.find((item) => item.id === id);
}

function getGuideById(id) {
  return state.catalog.guide.find((item) => item.id === id);
}

function getStayById(id) {
  return state.catalog.stay.find((item) => item.id === id);
}

function getStayLabel(id) {
  return getStayById(id)?.label || id;
}

function getActivityLabel(id) {
  return (getActivityById(id) || getGuideById(id))?.label || id;
}

function applyFilters() {
  const cards = calendarEl.querySelectorAll('.day-card');
  cards.forEach((card) => {
    const dateKey = card.dataset.date;
    const plan = ensureDay(dateKey);
    const friendMatch = !state.filter.friends.size || plan.friends.some((friend) => state.filter.friends.has(friend));
    const locationMatch = !state.filter.locations.size || state.filter.locations.has(plan.loc);
    card.style.display = friendMatch && locationMatch ? '' : 'none';
  });
}

function syncFilterButtons() {
  document.querySelectorAll('.chip[data-friend]').forEach((chip) => {
    chip.setAttribute('aria-pressed', state.filter.friends.has(chip.dataset.friend) ? 'true' : 'false');
  });
  document.querySelectorAll('.chip[data-location]').forEach((chip) => {
    chip.setAttribute('aria-pressed', state.filter.locations.has(chip.dataset.location) ? 'true' : 'false');
  });
  if (allFilterBtn) {
    const noneActive = !state.filter.friends.size && !state.filter.locations.size;
    allFilterBtn.setAttribute('aria-pressed', noneActive ? 'true' : 'false');
  }
}

function updateFilterFeedback() {
  const friendText = state.filter.friends.size
    ? `Friends: ${Array.from(state.filter.friends).join(', ')}`
    : 'Friends: All';
  const locationText = state.filter.locations.size
    ? `Places: ${Array.from(state.filter.locations).join(', ')}`
    : 'Places: All';
  const status = state.message ? ` — ${state.message}` : '';
  filterFeedbackEl.textContent = `${friendText} • ${locationText}${status}`;
}

function setStatusMessage(text, tone = 'info') {
  state.message = text;
  updateFilterFeedback();
  if (statusTimer) clearTimeout(statusTimer);
  if (text) {
    statusTimer = setTimeout(() => {
      state.message = '';
      updateFilterFeedback();
    }, tone === 'error' ? 6000 : 4000);
  }
}

function updateActionStates() {
  if (editBtn) {
    editBtn.textContent = state.editing ? 'Done' : 'Edit';
    editBtn.disabled = state.share.readOnly;
  }
  if (wizardBtn) {
    wizardBtn.disabled = state.share.readOnly;
  }
  if (saveGithubBtn) {
    saveGithubBtn.disabled = state.share.readOnly;
  }
  if (clearPoolBtn) {
    clearPoolBtn.disabled = !state.plan.pool.length || state.share.readOnly;
  }
  if (readonlyBanner) {
    readonlyBanner.hidden = !state.share.readOnly;
  }
}
function updateDayCard(dateKey) {
  const existing = calendarEl.querySelector(`.day-card[data-date="${dateKey}"]`);
  if (!existing) return;
  const replacement = renderDayCard(dateKey);
  calendarEl.replaceChild(replacement, existing);
  applyFilters();
}

function updateTravelCache() {
  state.travelCache = new Map();
  state.dateSequence.forEach((dateKey) => {
    state.travelCache.set(dateKey, calculateTravelForDay(dateKey));
  });
}

function updateTravelForDay(dateKey) {
  state.travelCache.set(dateKey, calculateTravelForDay(dateKey));
}

function calculateTravelForDay(dateKey) {
  const plan = ensureDay(dateKey);
  const ordered = [];
  ['morning', 'afternoon', 'evening'].forEach((slot) => {
    (plan.slots[slot] || []).forEach((id) => {
      const item = getActivityById(id) || getGuideById(id);
      if (!item?.coord) return;
      const coords = state.coordinates[item.coord];
      if (!Array.isArray(coords)) return;
      ordered.push({ coords, label: item.label || id });
    });
  });
  if (ordered.length <= 1) {
    return { minutes: 0, points: ordered };
  }
  let totalMinutes = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const from = ordered[i - 1].coords;
    const to = ordered[i].coords;
    const distanceKm = haversineKm(from[0], from[1], to[0], to[1]);
    const travelMinutes = Math.max(10, Math.round((distanceKm / TRAVEL_SPEED_KMH) * 60));
    totalMinutes += travelMinutes;
  }
  return { minutes: totalMinutes, points: ordered };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function updateAvailabilityWarnings() {
  const warnings = new Map();
  const base = state.userConfig.baseLocation;
  const nanaWork = state.userConfig.constraints.nanaWork;
  const maxAway = Number(state.userConfig.constraints.maxAway) || 0;
  let consecutiveAway = 0;
  state.dateSequence.forEach((dateKey) => {
    const day = ensureDay(dateKey);
    let dayWarnings = [];
    const includesNana = day.friends.includes('Nana');
    const isAway = includesNana && base && day.loc !== base;
    if (includesNana) {
      const weekday = new Date(`${dateKey}T00:00:00`).getDay();
      if (nanaWork && isAway && (weekday === 2 || weekday === 5)) {
        dayWarnings.push('Nana away on work day');
      }
      if (isAway) {
        consecutiveAway += 1;
        if (maxAway && consecutiveAway > maxAway) {
          dayWarnings.push(`Nana away ${consecutiveAway} days (max ${maxAway})`);
        }
      } else {
        consecutiveAway = 0;
      }
    } else {
      consecutiveAway = 0;
    }
    if (dayWarnings.length) {
      warnings.set(dateKey, dayWarnings);
    }
  });
  state.availability = warnings;
}
function openSheet(day, tab = 'activity', slot = 'morning') {
  if (state.share.readOnly) return;
  state.sheet = { open: true, day, tab, slot };
  sheetTitle.textContent = 'Add to day';
  const prettyDate = formatLongDate(day);
  sheetSubtitle.textContent = `${prettyDate} — ${slot.toUpperCase()}`;
  sheetEl.classList.add('sheet--open');
  sheetBackdrop.removeAttribute('aria-hidden');
  sheetEl.removeAttribute('aria-hidden');
  document.body.classList.add('sheet-open');
  renderSheet();
}

function closeSheet() {
  state.sheet.open = false;
  sheetEl.classList.remove('sheet--open');
  sheetBackdrop.setAttribute('aria-hidden', 'true');
  sheetEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
}

function renderSheet() {
  const { day, tab, slot } = state.sheet;
  sheetBody.innerHTML = '';
  const dayPlan = ensureDay(day);
  const activeTab = sheetEl.querySelector(`.tab[data-tab="${tab}"]`);
  sheetEl.querySelectorAll('.tab').forEach((btn) => {
    btn.setAttribute('aria-selected', btn === activeTab ? 'true' : 'false');
  });

  const makeGroup = (title, color) => {
    const group = document.createElement('div');
    group.className = 'sheet-group';
    const header = document.createElement('div');
    header.className = 'sheet-group__header';
    const swatch = document.createElement('span');
    swatch.className = 'sheet-group__swatch';
    swatch.style.background = color;
    const label = document.createElement('span');
    label.textContent = title;
    header.append(swatch, label);
    group.appendChild(header);
    const list = document.createElement('div');
    list.className = 'sheet-group__list';
    group.appendChild(list);
    sheetBody.appendChild(group);
    return list;
  };

  if (tab === 'activity') {
    state.locationOrder.forEach((locId) => {
      const meta = state.locations.find((loc) => loc.id === locId);
      const color = meta?.color || '#d1d5db';
      const list = makeGroup(meta?.label || locId, color);
      const items = state.catalog.activity.filter((item) => item.city === locId);
      items.forEach((item) => {
        const card = buildSheetCard(item.label, {
          primary: 'Add',
          onPrimary: () => {
            addActivity(day, slot, item.id);
            closeSheet();
          },
        });
        if ((dayPlan.slots[slot] || []).includes(item.id)) {
          card.classList.add('sheet-card--selected');
        }
        list.appendChild(card);
      });
      const guides = state.catalog.guide.filter((item) => item.city === locId);
      guides.forEach((item) => {
        const card = buildSheetCard(`${item.label}`, {
          primary: 'Pool',
          onPrimary: () => {
            addToPool(item.id);
            setStatusMessage('Saved to pool.');
          },
          meta: 'Guide pick',
        });
        list.appendChild(card);
      });
    });
    sheetBody.appendChild(buildCustomActivityForm(day, slot));
  }

  if (tab === 'stay') {
    state.locationOrder.forEach((locId) => {
      const meta = state.locations.find((loc) => loc.id === locId);
      const color = meta?.color || '#d1d5db';
      const list = makeGroup(meta?.label || locId, color);
      const items = state.catalog.stay.filter((item) => item.city === locId);
      items.forEach((item) => {
        const card = buildSheetCard(item.label, {
          primary: 'Set stay',
          onPrimary: () => {
            setStay(day, item.id);
            closeSheet();
          },
          meta: item.url ? 'Link available' : '',
        });
        if (dayPlan.stay === item.id) {
          card.classList.add('sheet-card--selected');
        }
        list.appendChild(card);
      });
    });
    sheetBody.appendChild(buildCustomStayForm(day));
  }

  if (tab === 'booking') {
    state.locationOrder.forEach((locId) => {
      const meta = state.locations.find((loc) => loc.id === locId);
      const color = meta?.color || '#d1d5db';
      const list = makeGroup(meta?.label || locId, color);
      const items = state.catalog.booking.filter((item) => item.city === locId);
      items.forEach((item) => {
        const card = buildSheetCard(item.label, {
          primary: 'Open',
          onPrimary: () => window.open(item.url, '_blank', 'noopener'),
        });
        list.appendChild(card);
      });
    });
    sheetBody.appendChild(buildCustomBookingForm());
  }
}

function buildSheetCard(label, actions = {}) {
  const card = document.createElement('div');
  card.className = 'sheet-card';
  const text = document.createElement('div');
  text.textContent = label;
  card.appendChild(text);
  if (actions.meta) {
    const meta = document.createElement('span');
    meta.className = 'sheet-card__meta';
    meta.textContent = actions.meta;
    card.appendChild(meta);
  }
  if (actions.primary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = actions.primary;
    button.addEventListener('click', actions.onPrimary);
    card.appendChild(button);
  }
  return card;
}

function buildCustomActivityForm(day, slot) {
  const wrapper = document.createElement('form');
  wrapper.className = 'sheet__custom';
  wrapper.innerHTML = `
    <strong>Add custom activity</strong>
    <label>Title<input name="title" required /></label>
    <label>Area<select name="city"></select></label>
    <label>Coordinates <span class="sheet-card__meta">lat,lng or existing key</span><input name="coord" placeholder="34.68,135.50" /></label>
    <label>Type<select name="kind"><option value="activity">Activity</option><option value="guide">Guide pick</option></select></label>
    <div class="sheet__custom-actions">
      <button type="submit" class="btn">Save</button>
    </div>
  `;
  const select = wrapper.querySelector('select[name="city"]');
  state.locationOrder.forEach((locId) => {
    const option = document.createElement('option');
    option.value = locId;
    const meta = state.locations.find((loc) => loc.id === locId);
    option.textContent = meta?.label || locId;
    select.appendChild(option);
  });
  wrapper.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = formData.get('title')?.toString().trim();
    const city = formData.get('city')?.toString();
    const coordInput = formData.get('coord')?.toString().trim();
    const kind = formData.get('kind')?.toString();
    if (!title || !city) return;
    const id = `custom-${Date.now()}`;
    let coordKey = null;
    if (coordInput) {
      coordKey = ensureCustomCoordinate(coordInput);
    }
    const entry = { id, city, label: title };
    if (coordKey) entry.coord = coordKey;
    if (kind === 'guide') {
      state.customCatalog.guide.push(entry);
      addToPool(id);
      setStatusMessage('Guide saved to pool.');
    } else {
      state.customCatalog.activity.push(entry);
      addActivity(day, slot, id);
    }
    persistState();
    rebuildDerivedData();
    renderSheet();
  });
  return wrapper;
}

function buildCustomStayForm(day) {
  const wrapper = document.createElement('form');
  wrapper.className = 'sheet__custom';
  wrapper.innerHTML = `
    <strong>Add custom stay</strong>
    <label>Title<input name="title" required /></label>
    <label>Area<select name="city"></select></label>
    <label>Link<input name="url" type="url" placeholder="https://" /></label>
    <div class="sheet__custom-actions"><button type="submit" class="btn">Save</button></div>
  `;
  const select = wrapper.querySelector('select[name="city"]');
  state.locationOrder.forEach((locId) => {
    const option = document.createElement('option');
    option.value = locId;
    const meta = state.locations.find((loc) => loc.id === locId);
    option.textContent = meta?.label || locId;
    select.appendChild(option);
  });
  wrapper.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = formData.get('title')?.toString().trim();
    const city = formData.get('city')?.toString();
    if (!title || !city) return;
    const entry = {
      id: `custom-stay-${Date.now()}`,
      city,
      label: title,
      url: formData.get('url')?.toString().trim() || '',
    };
    state.customCatalog.stay.push(entry);
    persistState();
    rebuildDerivedData();
    setStay(day, entry.id);
    renderSheet();
  });
  return wrapper;
}

function buildCustomBookingForm() {
  const wrapper = document.createElement('form');
  wrapper.className = 'sheet__custom';
  wrapper.innerHTML = `
    <strong>Add booking link</strong>
    <label>Title<input name="title" required /></label>
    <label>Area<select name="city"></select></label>
    <label>Link<input name="url" type="url" placeholder="https://" required /></label>
    <div class="sheet__custom-actions"><button type="submit" class="btn">Save</button></div>
  `;
  const select = wrapper.querySelector('select[name="city"]');
  state.locationOrder.forEach((locId) => {
    const option = document.createElement('option');
    option.value = locId;
    const meta = state.locations.find((loc) => loc.id === locId);
    option.textContent = meta?.label || locId;
    select.appendChild(option);
  });
  wrapper.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = formData.get('title')?.toString().trim();
    const city = formData.get('city')?.toString();
    const url = formData.get('url')?.toString().trim();
    if (!title || !city || !url) return;
    const entry = { id: `custom-book-${Date.now()}`, city, label: title, url };
    state.customCatalog.booking.push(entry);
    persistState();
    rebuildDerivedData();
    renderSheet();
  });
  return wrapper;
}

function ensureCustomCoordinate(input) {
  if (state.coordinates[input]) return input;
  const [latStr, lonStr] = input.split(',');
  const lat = Number(latStr?.trim());
  const lon = Number(lonStr?.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return input;
  }
  const key = `custom-coord-${Date.now()}`;
  state.customCoordinates[key] = [lat, lon];
  state.coordinates[key] = [lat, lon];
  return key;
}
function addToPool(id) {
  if (!state.plan.pool.includes(id)) {
    state.plan.pool.push(id);
    persistState();
    renderPool();
    updateActionStates();
  }
}

function removeFromPool(index) {
  state.plan.pool.splice(index, 1);
  persistState();
  renderPool();
  updateActionStates();
}

function clearPool() {
  state.plan.pool = [];
  persistState();
  renderPool();
  updateActionStates();
}

function moveChip(dragData, targetDate, targetSlot, targetIndex = null) {
  if (!dragData || state.share.readOnly) return;
  const { source, date: sourceDate, slot: sourceSlot, index, id } = dragData;
  if (!id) return;
  if (source === 'slot') {
    const sourceDay = ensureDay(sourceDate);
    if (isChipLocked(sourceDate, id)) return;
    const sourceList = sourceDay.slots?.[sourceSlot];
    if (Array.isArray(sourceList)) {
      if (sourceList[index] === id) {
        sourceList.splice(index, 1);
      } else {
        const fallback = sourceList.indexOf(id);
        if (fallback >= 0) sourceList.splice(fallback, 1);
      }
    }
  } else if (source === 'pool') {
    state.plan.pool.splice(index, 1);
  }

  const targetDay = ensureDay(targetDate);
  targetDay.slots[targetSlot] = targetDay.slots[targetSlot] || [];
  const list = targetDay.slots[targetSlot];
  if (targetIndex === null || targetIndex >= list.length) {
    list.push(id);
  } else {
    list.splice(targetIndex, 0, id);
  }
  persistState();
  if (sourceDate) {
    updateTravelForDay(sourceDate);
  }
  if (sourceDate !== targetDate) {
    updateTravelForDay(targetDate);
  }
  updateAvailabilityWarnings();
  if (sourceDate) updateDayCard(sourceDate);
  if (sourceDate !== targetDate) updateDayCard(targetDate);
  renderPool();
  updateActionStates();
}

function moveChipToPool(dragData) {
  if (!dragData || state.share.readOnly) return;
  const { source, date: sourceDate, slot: sourceSlot, index, id } = dragData;
  if (source === 'slot') {
    const day = ensureDay(sourceDate);
    if (isChipLocked(sourceDate, id)) return;
    const list = day.slots?.[sourceSlot];
    if (Array.isArray(list)) {
      if (list[index] === id) {
        list.splice(index, 1);
      } else {
        const fallback = list.indexOf(id);
        if (fallback >= 0) list.splice(fallback, 1);
      }
    }
    persistState();
    if (sourceDate) {
      updateTravelForDay(sourceDate);
      updateDayCard(sourceDate);
    }
    updateAvailabilityWarnings();
  }
  addToPool(id);
}

function handleSlotDragOver(event) {
  if (!state.editing || state.share.readOnly) return;
  event.preventDefault();
  event.currentTarget.dataset.dropHover = 'true';
  event.dataTransfer.dropEffect = 'move';
}

function handleSlotDragLeave(event) {
  event.currentTarget.removeAttribute('data-drop-hover');
}

function handleSlotDrop(event) {
  if (!state.editing || state.share.readOnly) return;
  event.preventDefault();
  event.currentTarget.removeAttribute('data-drop-hover');
  if (!state.chipDragData) return;
  const targetDate = event.currentTarget.dataset.date;
  const targetSlot = event.currentTarget.dataset.slot;
  const index = computeDropIndex(event.currentTarget, event.clientX);
  moveChip(state.chipDragData, targetDate, targetSlot, index);
  state.chipDragData = null;
}

function computeDropIndex(slotEl, clientX) {
  const chips = Array.from(slotEl.querySelectorAll('.chiplet'));
  let index = chips.length;
  chips.forEach((chip, i) => {
    const rect = chip.getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2 && index === chips.length) {
      index = i;
    }
  });
  return index;
}

function handleChipDragStart(event) {
  const chip = event.currentTarget;
  state.chipDragData = buildDragDataFromElement(chip);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'chip', id: chip.dataset.id }));
  chip.classList.add('chiplet--dragging');
}

function handleChipDragEnd(event) {
  if (event.currentTarget) {
    event.currentTarget.classList.remove('chiplet--dragging');
  }
  state.chipDragData = null;
  document.querySelectorAll('.slot[data-drop-hover]').forEach((slot) => slot.removeAttribute('data-drop-hover'));
}

function buildDragDataFromElement(chip) {
  const source = chip.dataset.source || 'slot';
  if (source === 'pool') {
    return {
      source: 'pool',
      index: Number(chip.dataset.index),
      id: chip.dataset.id,
    };
  }
  return {
    source: 'slot',
    date: chip.dataset.date,
    slot: chip.dataset.slot,
    index: Number(chip.dataset.index),
    id: chip.dataset.id,
  };
}

function handleCardDragStart(event) {
  if (!state.editing || state.share.readOnly) {
    event.preventDefault();
    return;
  }
  state.cardDragSource = event.currentTarget.dataset.date;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', 'day-card');
}

function handleCardDrop(event) {
  if (!state.editing || state.share.readOnly) return;
  event.preventDefault();
  const targetDate = event.currentTarget.dataset.date;
  if (!state.cardDragSource || !targetDate || state.cardDragSource === targetDate) return;
  const sourcePlan = state.plan.days[state.cardDragSource];
  state.plan.days[state.cardDragSource] = state.plan.days[targetDate];
  state.plan.days[targetDate] = sourcePlan;
  persistState();
  updateTravelForDay(state.cardDragSource);
  updateTravelForDay(targetDate);
  updateAvailabilityWarnings();
  renderCalendar();
  state.cardDragSource = null;
}
function handleChipPointerDown(event) {
  if (!state.editing || state.share.readOnly) return;
  if (event.pointerType === 'mouse') return;
  const chip = event.currentTarget;
  if (chip.classList.contains('locked')) return;
  event.preventDefault();
  chip.setPointerCapture(event.pointerId);
  state.pointerDrag = {
    pointerId: event.pointerId,
    chip,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    placeholder: null,
    ghost: null,
    target: null,
    source: buildDragDataFromElement(chip),
    timer: setTimeout(() => startPointerDrag(event), 180),
  };
  chip.addEventListener('pointermove', handleChipPointerMove);
  chip.addEventListener('pointerup', handleChipPointerUp);
  chip.addEventListener('pointercancel', handleChipPointerCancel);
}

function startPointerDrag(event) {
  const drag = state.pointerDrag;
  if (!drag) return;
  drag.active = true;
  drag.chip.classList.add('chiplet--dragging');
  drag.chip.style.visibility = 'hidden';
  const placeholder = document.createElement('span');
  placeholder.className = 'chiplet-placeholder';
  drag.placeholder = placeholder;
  drag.chip.parentElement.insertBefore(placeholder, drag.chip);
  const ghost = drag.chip.cloneNode(true);
  ghost.classList.add('chiplet-ghost');
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  updatePointerGhostPosition(event.clientX, event.clientY);
}

function handleChipPointerMove(event) {
  const drag = state.pointerDrag;
  if (!drag) return;
  if (!drag.active) {
    const dx = Math.abs(event.clientX - drag.startX);
    const dy = Math.abs(event.clientY - drag.startY);
    if (dx > 6 || dy > 6) {
      clearTimeout(drag.timer);
      startPointerDrag(event);
    }
  }
  if (!drag.active) return;
  updatePointerGhostPosition(event.clientX, event.clientY);
  updatePointerDropTarget(event.clientX, event.clientY);
}

function handleChipPointerUp() {
  finalizePointerDrag();
}

function handleChipPointerCancel() {
  finalizePointerDrag(true);
}

function finalizePointerDrag(cancelled = false) {
  const drag = state.pointerDrag;
  if (!drag) return;
  clearTimeout(drag.timer);
  drag.chip.releasePointerCapture(drag.pointerId);
  drag.chip.removeEventListener('pointermove', handleChipPointerMove);
  drag.chip.removeEventListener('pointerup', handleChipPointerUp);
  drag.chip.removeEventListener('pointercancel', handleChipPointerCancel);
  drag.chip.style.visibility = '';
  drag.chip.classList.remove('chiplet--dragging');
  if (drag.placeholder) drag.placeholder.remove();
  if (drag.ghost) drag.ghost.remove();
  if (!cancelled && drag.active && drag.target) {
    if (drag.target.type === 'slot') {
      moveChip(
        drag.source,
        drag.target.date,
        drag.target.slot,
        drag.target.index,
      );
    } else if (drag.target.type === 'pool') {
      moveChipToPool(drag.source);
    }
  }
  state.pointerDrag = null;
}

function updatePointerGhostPosition(x, y) {
  const drag = state.pointerDrag;
  if (!drag?.ghost) return;
  drag.ghost.style.left = `${x}px`;
  drag.ghost.style.top = `${y}px`;
}

function updatePointerDropTarget(x, y) {
  const element = document.elementFromPoint(x, y);
  let target = null;
  const slot = element?.closest('.slot');
  if (slot) {
    const date = slot.dataset.date;
    const slotName = slot.dataset.slot;
    const index = computeDropIndex(slot, x);
    target = { type: 'slot', date, slot: slotName, index, element: slot };
  } else if (element?.closest('#pool')) {
    target = { type: 'pool' };
  }
  positionPlaceholder(target);
  state.pointerDrag.target = target;
}

function positionPlaceholder(target) {
  const drag = state.pointerDrag;
  if (!drag || !drag.placeholder) return;
  if (!target) {
    drag.placeholder.remove();
    return;
  }
  if (target.type === 'slot') {
    const slotEl = target.element;
    const chips = Array.from(slotEl.querySelectorAll('.chiplet'));
    if (target.index >= chips.length) {
      slotEl.appendChild(drag.placeholder);
    } else {
      slotEl.insertBefore(drag.placeholder, chips[target.index]);
    }
  } else if (target.type === 'pool') {
    poolChipsEl.appendChild(drag.placeholder);
  }
}
function openMap(dateKey) {
  const plan = ensureDay(dateKey);
  mapOverlay.classList.add('is-open');
  mapOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('map-open');
  const title = document.getElementById('mapTitle');
  title.textContent = `${formatLongDate(dateKey)} — ${plan.theme || state.themes[plan.loc] || ''}`;
  const travelInfo = state.travelCache.get(dateKey) || calculateTravelForDay(dateKey);
  setTimeout(() => {
    if (!state.map.instance) {
      const map = window.L.map('map');
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      state.map.instance = map;
      state.map.markers = window.L.layerGroup().addTo(map);
    }
    const map = state.map.instance;
    map.invalidateSize();
    state.map.markers.clearLayers();
    if (state.map.route) {
      map.removeLayer(state.map.route);
      state.map.route = null;
    }
    const points = travelInfo.points || [];
    if (!points.length) {
      map.setView([35.0, 135.5], 5);
      return;
    }
    const latlngs = [];
    points.forEach((point, index) => {
      const icon = window.L.divIcon({ className: 'map-marker', html: `<span>${index + 1}</span>` });
      const marker = window.L.marker(point.coords, { icon }).addTo(state.map.markers);
      marker.bindPopup(point.label);
      latlngs.push(point.coords);
    });
    state.map.route = window.L.polyline(latlngs, { color: '#2d3a64', weight: 3, opacity: 0.8 }).addTo(map);
    map.fitBounds(state.map.route.getBounds().pad(0.2));
  }, 60);
}

function closeMap() {
  mapOverlay.classList.remove('is-open');
  mapOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('map-open');
}
function formatLongDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday}, ${month} ${date.getDate()}`;
}

function formatSummaryDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()}`;
}
function exportIcs() {
  const now = new Date();
  const dtstamp = formatIcsDateTimeUtc(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Canvas6 Trip Planner//EN',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Tokyo',
    'X-LIC-LOCATION:Asia/Tokyo',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  state.dateSequence.forEach((dateKey) => {
    const day = ensureDay(dateKey);
    const dateValue = dateKey.replace(/-/g, '');
    const title = day.theme || state.themes[day.loc] || 'Trip day';
    const slotDescriptions = ['morning', 'afternoon', 'evening']
      .map((slot) => (day.slots[slot] || []).map(getActivityLabel).filter(Boolean).join(' • '))
      .filter(Boolean)
      .join(' / ');
    const descriptionParts = [];
    if (slotDescriptions) descriptionParts.push(slotDescriptions);
    if (day.stay) descriptionParts.push(`Stay: ${getStayLabel(day.stay)}`);
    if (day.friends.length) descriptionParts.push(`Friends: ${day.friends.join(', ')}`);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${dateValue}@jp-canvas6`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`SUMMARY:${escapeIcsText(`${formatSummaryDate(dateKey)} — ${title}`)}`);
    lines.push(`DTSTART;TZID=Asia/Tokyo:${dateValue}T090000`);
    lines.push(`DTEND;TZID=Asia/Tokyo:${dateValue}T210000`);
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join(' / '))}`);
    lines.push(`LOCATION:${escapeIcsText(day.loc)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\n')], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${state.userConfig.title.replace(/\s+/g, '-')}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeIcsText(value) {
  return String(value || '').replace(/[\\;,\n]/g, (match) => {
    if (match === '\\') return '\\\\';
    if (match === ';') return '\\;';
    if (match === ',') return '\\,';
    return '\\n';
  });
}

function formatIcsDateTimeUtc(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}
function generateShareLink() {
  const payload = {
    version: state.definition.version,
    plan: state.plan,
    customCatalog: state.customCatalog,
    customCoordinates: state.customCoordinates,
    userConfig: state.userConfig,
  };
  const encoded = encodeBase64(JSON.stringify(payload));
  const hash = `${SHARE_PREFIX}${encoded}`;
  window.location.hash = hash;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setStatusMessage('Share link copied.');
    });
  } else {
    setStatusMessage('Share link ready.');
  }
}

function loadFromHash() {
  if (!window.location.hash.startsWith(SHARE_PREFIX)) return false;
  try {
    const encoded = window.location.hash.slice(SHARE_PREFIX.length);
    const json = decodeBase64(encoded);
    const payload = JSON.parse(json);
    if (payload.plan) {
      state.plan = { days: { ...(payload.plan.days || {}) }, pool: Array.isArray(payload.plan.pool) ? payload.plan.pool : [] };
    }
    if (payload.customCatalog) {
      state.customCatalog = payload.customCatalog;
    }
    if (payload.customCoordinates) {
      state.customCoordinates = payload.customCoordinates;
    }
    if (payload.userConfig) {
      state.userConfig = { ...state.userConfig, ...payload.userConfig };
    }
    syncPeople();
    buildDateSequenceForRange();
    ensurePlanForRange();
    rebuildDerivedData();
    state.share.readOnly = true;
    state.editing = false;
    return true;
  } catch (error) {
    console.warn('Failed to parse shared link', error);
    return false;
  }
}

function decodeBase64(input) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
function attachGlobalEvents() {
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (state.share.readOnly) return;
      state.editing = !state.editing;
      renderApp();
    });
  }
  if (shareBtn) {
    shareBtn.addEventListener('click', generateShareLink);
  }
  if (wizardBtn) {
    wizardBtn.addEventListener('click', openWizard);
  }
  if (saveGithubBtn) {
    saveGithubBtn.addEventListener('click', openGithubDialog);
  }
  if (icsBtn) {
    icsBtn.addEventListener('click', exportIcs);
  }
  if (sheetBackdrop) {
    sheetBackdrop.addEventListener('click', closeSheet);
  }
  sheetEl.querySelectorAll('.tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      state.sheet.tab = tabBtn.dataset.tab;
      renderSheet();
    });
  });
  if (clearPoolBtn) {
    clearPoolBtn.addEventListener('click', clearPool);
  }
  if (allFilterBtn) {
    allFilterBtn.addEventListener('click', clearFilters);
  }
  closeMapBtn.addEventListener('click', closeMap);
  closeWizardBtn.addEventListener('click', closeWizard);
  closeGithubBtn.addEventListener('click', closeGithubDialog);
  wizardForm.addEventListener('submit', handleWizardSubmit);
  githubForm.addEventListener('submit', handleGithubSubmit);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.sheet.open) closeSheet();
      if (mapOverlay.classList.contains('is-open')) closeMap();
      if (!wizardOverlay.getAttribute('aria-hidden')) closeWizard();
      if (!githubOverlay.getAttribute('aria-hidden')) closeGithubDialog();
    }
  });
}
function openWizard() {
  wizardOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  const titleInput = document.getElementById('wizardTitleInput');
  const startInput = document.getElementById('wizardStart');
  const endInput = document.getElementById('wizardEnd');
  const baseSelect = document.getElementById('wizardBase');
  const peopleInput = document.getElementById('wizardPeople');
  const nanaWorkCheck = document.getElementById('wizardNanaWork');
  const maxAwayInput = document.getElementById('wizardMaxAway');
  titleInput.value = state.userConfig.title;
  startInput.value = state.userConfig.range.start;
  endInput.value = state.userConfig.range.end;
  baseSelect.innerHTML = '';
  state.locationOrder.forEach((locId) => {
    const option = document.createElement('option');
    option.value = locId;
    const meta = state.locations.find((loc) => loc.id === locId);
    option.textContent = meta?.label || locId;
    if (locId === state.userConfig.baseLocation) option.selected = true;
    baseSelect.appendChild(option);
  });
  peopleInput.value = state.people.map((person) => person.id).join(', ');
  nanaWorkCheck.checked = Boolean(state.userConfig.constraints.nanaWork);
  maxAwayInput.value = state.userConfig.constraints.maxAway ?? 3;
}

function closeWizard() {
  wizardOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
}

function handleWizardSubmit(event) {
  event.preventDefault();
  const formData = new FormData(wizardForm);
  const title = formData.get('title')?.toString().trim();
  const start = formData.get('start')?.toString();
  const end = formData.get('end')?.toString();
  const base = formData.get('base')?.toString();
  const peopleRaw = formData.get('people')?.toString() || '';
  const nanaWork = Boolean(formData.get('nanaWork'));
  const maxAway = Number(formData.get('maxAway')) || 3;
  if (title) state.userConfig.title = title;
  if (start && end) {
    state.userConfig.range = { start, end };
  }
  if (base) state.userConfig.baseLocation = base;
  const names = peopleRaw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length) {
    state.userConfig.people = names.map((name) => {
      const existing = state.people.find((person) => person.id === name);
      return existing ? { id: existing.id, label: existing.label, color: existing.color } : { id: name, label: name };
    });
  }
  state.userConfig.constraints = { nanaWork, maxAway };
  syncPeople();
  buildDateSequenceForRange();
  ensurePlanForRange();
  rebuildDerivedData();
  persistState();
  renderApp();
  closeWizard();
  setStatusMessage('Trip setup updated.');
}

function openGithubDialog() {
  if (state.share.readOnly) return;
  githubOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
}

function closeGithubDialog() {
  githubOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
}

async function handleGithubSubmit(event) {
  event.preventDefault();
  const formData = new FormData(githubForm);
  const owner = formData.get('owner')?.toString().trim();
  const repo = formData.get('repo')?.toString().trim();
  const branch = formData.get('branch')?.toString().trim() || 'main';
  const path = formData.get('path')?.toString().trim() || 'data/trip.json';
  const token = formData.get('token')?.toString().trim();
  const message = formData.get('message')?.toString().trim() || 'Update trip definition';
  if (!owner || !repo || !token) return;
  const exportData = assembleTripDefinitionForSave();
  try {
    await saveTripDefinitionToGitHub({ token, owner, repo, branch, path, message, content: JSON.stringify(exportData, null, 2) });
    setStatusMessage('Saved to GitHub.');
    closeGithubDialog();
  } catch (error) {
    console.error('GitHub save failed', error);
    setStatusMessage('GitHub save failed.', 'error');
  }
}

function assembleTripDefinitionForSave() {
  const defaults = {};
  Object.entries(state.plan.days).forEach(([dateKey, day]) => {
    defaults[dateKey] = cloneDay(day);
  });
  return {
    version: state.definition.version,
    storage: state.definition.storage,
    trip: {
      title: state.userConfig.title,
      range: state.userConfig.range,
      baseLocation: state.userConfig.baseLocation,
    },
    people: state.people.map((person) => ({ id: person.id, label: person.label, color: person.color })),
    locations: state.locations,
    themes: state.themes,
    coordinates: { ...(state.definition.coordinates || {}), ...state.customCoordinates },
    catalog: {
      activity: mergeCatalogArrays(state.definition.catalog?.activity, state.customCatalog.activity),
      guide: mergeCatalogArrays(state.definition.catalog?.guide, state.customCatalog.guide),
      stay: mergeCatalogArrays(state.definition.catalog?.stay, state.customCatalog.stay),
      booking: mergeCatalogArrays(state.definition.catalog?.booking, state.customCatalog.booking),
    },
    defaults,
    custom: {
      constraints: state.userConfig.constraints,
    },
    constraints: state.userConfig.constraints,
  };
}
