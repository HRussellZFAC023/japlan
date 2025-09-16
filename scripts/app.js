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
const closeSheetBtn = sheetEl.querySelector('[data-action="close-sheet"]');
const closeMapBtn = mapOverlay.querySelector('[data-action="close-map"]');

let planState = initializeState();
let dateSequence = buildDateSequence(planState.config.range.start, planState.config.range.end);
let ACTIVITY_MAP = new Map();
let STAY_MAP = new Map();
refreshCatalogLookups();
let editing = false;
let filterState = { friend: null, location: null };
let sheetState = { open: false, day: null, slot: 'morning', tab: 'activity' };
let cardDragSource = null;
let chipDragData = null;
let mapInstance = null;
let mapMarkersLayer = null;

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
  return day;
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
  calendarEl.replaceChild(replacement, existing);
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
  persistState();
  updateDayCard(dateKey);
}

function setStay(dateKey, stayId) {
  const day = ensureDay(dateKey);
  day.stay = stayId;
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
  mapOverlay.classList.add('is-open');
  mapOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('map-open');
  const mapTitle = document.getElementById('mapTitle');
  mapTitle.textContent = `${formatLongDate(dateKey)} — ${plan.theme || getDefaultTheme(plan.loc) || ''}`;
  const markers = [];
  ['morning', 'afternoon', 'evening'].forEach((slot) => {
    plan.slots[slot]?.forEach((id) => {
      const activity = ACTIVITY_MAP.get(id);
      if (!activity || !activity.coord) return;
      const coords = planState.config.mapCoordinates[activity.coord];
      if (!coords) return;
      markers.push({ coords, label: activity.label });
    });
  });

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
    mapMarkersLayer.clearLayers();
    if (markers.length) {
      const bounds = [];
      markers.forEach(({ coords, label }) => {
        const marker = window.L.marker(coords).addTo(mapMarkersLayer);
        marker.bindPopup(label);
        bounds.push(coords);
      });
      mapInstance.fitBounds(bounds, { padding: [32, 32] });
    } else {
      const fallback = planState.config.mapDefaults;
      if (fallback?.center) {
        mapInstance.setView(fallback.center, fallback.zoom || 5);
      } else {
        mapInstance.setView([20, 0], 2);
      }
    }
  }, 50);
}

function closeMap() {
  mapOverlay.classList.remove('is-open');
  mapOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('map-open');
}

function exportIcs() {
  const now = new Date();
  const dtstamp = formatIcsDateTime(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Canvas6 Trip Planner//EN',
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
    lines.push(`DTSTART:${dateValue}T090000`);
    lines.push(`DTEND:${dateValue}T210000`);
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

