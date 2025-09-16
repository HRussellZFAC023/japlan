import {
  STORAGE_KEY,
  TRIP_RANGE,
  FRIENDS,
  LOCATION_META,
  LOCATION_ORDER,
  DEFAULT_THEMES,
  MAP_COORDINATES,
  CATALOG,
  PREFILL,
} from './data.js';

const calendarEl = document.getElementById('calendar');
const editBtn = document.querySelector('[data-action="toggle-edit"]');
const icsBtn = document.querySelector('[data-action="export-ics"]');
const sheetEl = document.getElementById('sheet');
const sheetBackdrop = document.getElementById('sheetBackdrop');
const sheetTitle = document.getElementById('sheetTitle');
const sheetSubtitle = document.getElementById('sheetSubtitle');
const sheetBody = document.getElementById('sheetBody');
const mapOverlay = document.getElementById('mapOverlay');
const closeSheetBtn = sheetEl.querySelector('[data-action="close-sheet"]');
const closeMapBtn = mapOverlay.querySelector('[data-action="close-map"]');

const ACTIVITY_MAP = new Map(CATALOG.activity.map((item) => [item.id, item]));
const STAY_MAP = new Map(CATALOG.stay.map((item) => [item.id, item]));

const dateSequence = buildDateSequence(TRIP_RANGE.start, TRIP_RANGE.end);

let planState = loadState();
let editing = false;
let filterState = { friend: null, location: null };
let sheetState = { open: false, day: null, slot: 'morning', tab: 'activity' };
let cardDragSource = null;
let chipDragData = null;
let mapInstance = null;
let mapMarkersLayer = null;

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

function createEmptyDay(location = 'work') {
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
  const base = day || createEmptyDay();
  return {
    loc: base.loc || 'work',
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

function mergeDayData(defaultDay, savedDay) {
  if (!savedDay) return cloneDay(defaultDay);
  const merged = cloneDay(defaultDay);
  merged.loc = savedDay.loc || merged.loc;
  merged.theme = savedDay.theme ?? merged.theme;
  merged.stay = savedDay.stay ?? merged.stay ?? null;
  merged.friends = Array.isArray(savedDay.friends)
    ? [...new Set(savedDay.friends.filter(Boolean))]
    : merged.friends;
  merged.slots = {
    morning: Array.isArray(savedDay.slots?.morning) ? [...savedDay.slots.morning] : merged.slots.morning,
    afternoon: Array.isArray(savedDay.slots?.afternoon) ? [...savedDay.slots.afternoon] : merged.slots.afternoon,
    evening: Array.isArray(savedDay.slots?.evening) ? [...savedDay.slots.evening] : merged.slots.evening,
  };
  merged.locks = { ...merged.locks, ...(savedDay.locks || {}) };
  return merged;
}

function loadState() {
  const defaults = {};
  dateSequence.forEach((dateKey) => {
    defaults[dateKey] = cloneDay(PREFILL[dateKey] || createEmptyDay());
  });

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { days: defaults };
    }
    const parsed = JSON.parse(raw);
    const merged = {};
    dateSequence.forEach((dateKey) => {
      merged[dateKey] = mergeDayData(defaults[dateKey], parsed?.days?.[dateKey]);
    });
    return { days: merged };
  } catch (error) {
    console.warn('Unable to load saved state, using defaults.', error);
    return { days: defaults };
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: planState.days }));
  } catch (error) {
    console.warn('Unable to save state.', error);
  }
}

function ensureDay(dateKey) {
  if (!planState.days[dateKey]) {
    planState.days[dateKey] = createEmptyDay();
  }
  const day = planState.days[dateKey];
  day.slots = day.slots || { morning: [], afternoon: [], evening: [] };
  day.locks = day.locks || {};
  day.friends = Array.isArray(day.friends) ? day.friends : [];
  day.loc = day.loc || 'work';
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
  stripe.style.background = LOCATION_META[plan.loc]?.color || '#d1d5db';
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

  const themeLabel = plan.theme || DEFAULT_THEMES[plan.loc] || '';
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
  FRIENDS.forEach((friend) => {
    const isActive = plan.friends.includes(friend);
    const friendBtn = document.createElement('button');
    friendBtn.type = 'button';
    friendBtn.className = 'friend-chip' + (isActive ? ' friend-chip--on' : '');
    friendBtn.dataset.friend = friend;
    friendBtn.textContent = isActive ? friend : `+ ${friend}`;
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
  document.querySelectorAll('.slot[data-drop-hover]').forEach((slot) => {
    slot.removeAttribute('data-drop-hover');
  });
}

function handleSlotDragOver(event) {
  if (!editing) return;
  event.preventDefault();
  event.currentTarget.dataset.dropHover = 'true';
  event.dataTransfer.dropEffect = 'move';
}

function handleSlotDragLeave(event) {
  event.currentTarget.removeAttribute('data-drop-hover');
}

function handleSlotDrop(event) {
  if (!editing) return;
  event.preventDefault();
  event.currentTarget.removeAttribute('data-drop-hover');
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

  if (tab === 'activity') {
    LOCATION_ORDER.forEach((loc) => {
      const options = CATALOG.activity.filter((item) => item.city === loc);
      if (!options.length) return;
      sheetBody.appendChild(renderSheetGroup(loc, options, (item) => {
        addActivity(day, slot, item.id);
      }));
    });
  } else if (tab === 'stay') {
    const dayPlan = ensureDay(day);
    LOCATION_ORDER.forEach((loc) => {
      const options = CATALOG.stay.filter((item) => item.city === loc);
      if (!options.length) return;
      sheetBody.appendChild(renderSheetGroup(loc, options, (item) => {
        setStay(day, item.id);
      }, dayPlan.stay));
    });
  } else if (tab === 'booking') {
    LOCATION_ORDER.forEach((loc) => {
      const options = CATALOG.booking.filter((item) => item.city === loc);
      if (!options.length) return;
      sheetBody.appendChild(renderSheetGroup(loc, options, (item) => {
        window.open(item.url, '_blank', 'noopener');
      }));
    });
  }
}

function renderSheetGroup(locationId, items, onSelect, selectedId) {
  const group = document.createElement('section');
  group.className = 'sheet-group';

  const header = document.createElement('div');
  header.className = 'sheet-group__header';
  const swatch = document.createElement('span');
  swatch.className = 'sheet-group__swatch';
  swatch.style.background = LOCATION_META[locationId]?.color || '#d1d5db';
  const title = document.createElement('span');
  title.textContent = locationId.toUpperCase();
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

function attachToolbarEvents() {
  editBtn?.addEventListener('click', () => {
    editing = !editing;
    updateEditButton();
    renderCalendar();
  });

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

  document.querySelector('[data-filter="all"]').addEventListener('click', () => {
    filterState = { friend: null, location: null };
    applyFilters();
    updateFilterChips();
  });

  document.querySelectorAll('.chip[data-friend]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const friend = chip.dataset.friend;
      filterState.friend = filterState.friend === friend ? null : friend;
      applyFilters();
      updateFilterChips();
    });
  });

  document.querySelectorAll('.chip[data-location]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const loc = chip.dataset.location;
      filterState.location = filterState.location === loc ? null : loc;
      applyFilters();
      updateFilterChips();
    });
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
  const allBtn = document.querySelector('[data-filter="all"]');
  const allOn = !filterState.friend && !filterState.location;
  allBtn.setAttribute('aria-pressed', allOn ? 'true' : 'false');
}

function updateEditButton() {
  if (editBtn) {
    editBtn.textContent = editing ? 'Done' : 'Edit';
  }
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
  mapTitle.textContent = `${formatLongDate(dateKey)} — ${plan.theme || DEFAULT_THEMES[plan.loc] || ''}`;
  const markers = [];
  ['morning', 'afternoon', 'evening'].forEach((slot) => {
    plan.slots[slot]?.forEach((id) => {
      const activity = ACTIVITY_MAP.get(id);
      if (!activity || !activity.coord) return;
      const coords = MAP_COORDINATES[activity.coord];
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
      mapInstance.setView([35.0, 135.5], 5);
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
    const title = day.theme || DEFAULT_THEMES[day.loc] || 'Trip day';
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
    const locationLabel = LOCATION_META[day.loc]?.label || day.loc;

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
  anchor.download = 'Japan-Trip-Nov-2025.ics';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
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

