const STORAGE_VERSION = 'v2';
const STORAGE_KEYS = {
  config: `jp-trip-config-${STORAGE_VERSION}`,
  plan: `jp-trip-plan-${STORAGE_VERSION}`,
  guides: `jp-trip-guides-${STORAGE_VERSION}`,
  github: `jp-trip-github-${STORAGE_VERSION}`,
  setup: `jp-trip-setup-${STORAGE_VERSION}`,
};

const SPEED_KMH = 32;
const SHARE_PREFIX = '#share=';
const LONG_PRESS_MS = 200;
const DRAG_THRESHOLD = 6;
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const calendarEl = document.getElementById('calendar');
const siteTitleEl = document.getElementById('siteTitle');
const legendEl = document.getElementById('legend');
const filterSummaryEl = document.getElementById('filterSummary');
const friendFiltersEl = document.getElementById('friendFilters');
const locationFiltersEl = document.getElementById('locationFilters');
const editBtn = document.querySelector('[data-action="toggle-edit"]');
const icsBtn = document.querySelector('[data-action="export-ics"]');
const shareBtn = document.querySelector('[data-action="share-plan"]');
const githubBtn = document.querySelector('[data-action="save-github"]');
const wizardBtn = document.querySelector('[data-action="open-wizard"]');
const clearFiltersBtn = document.querySelector('[data-action="clear-filters"]');
const showAllBtn = document.querySelector('[data-filter="all"]');
const shareBanner = document.getElementById('shareBanner');
const shareExitBtn = shareBanner?.querySelector('[data-action="exit-share"]');
const sheetEl = document.getElementById('sheet');
const sheetBackdrop = document.getElementById('sheetBackdrop');
const sheetTitle = document.getElementById('sheetTitle');
const sheetSubtitle = document.getElementById('sheetSubtitle');
const sheetBody = document.getElementById('sheetBody');
const sheetFooter = document.getElementById('sheetFooter');
const closeSheetBtn = sheetEl?.querySelector('[data-action="close-sheet"]');
const mapOverlay = document.getElementById('mapOverlay');
const mapTitleEl = document.getElementById('mapTitle');
const closeMapBtn = mapOverlay?.querySelector('[data-action="close-map"]');
const wizardOverlay = document.getElementById('wizardOverlay');
const wizardForm = document.getElementById('wizardForm');
const wizardPeopleList = document.getElementById('wizardPeopleList');
const githubOverlay = document.getElementById('githubOverlay');
const githubForm = document.getElementById('githubForm');
const toastEl = document.getElementById('toast');

const state = {
  config: null,
  plan: { days: {} },
  editing: false,
  filters: { friends: new Set(), locations: new Set() },
  sheet: { open: false, day: null, slot: 'morning', tab: 'activity' },
  inlineThemeEdit: null,
  shareMode: false,
  readOnly: false,
  dateSequence: [],
  activityLookup: new Map(),
  stayLookup: new Map(),
  bookingLookup: new Map(),
  activeGuides: new Set(),
  travelSummaries: new Map(),
  constraintWarnings: new Map(),
  mapInstance: null,
  mapMarkersLayer: null,
  mapRouteLayer: null,
  chipDrag: null,
  githubSettings: loadGithubSettings(),
  setupComplete: localStorage.getItem(STORAGE_KEYS.setup) === '1',
};

init().catch((error) => {
  console.error('Failed to initialise planner', error);
  showToast('Unable to load trip planner data.', 'error');
});

async function init() {
  const baseConfig = await fetchConfig();
  hydrateState(baseConfig);
  applyShareHash();
  refreshCatalogCaches();
  computeTravelSummaries();
  recomputeConstraintWarnings();
  renderTitle();
  renderLegend();
  renderFilters();
  renderCalendar();
  updateToolbar();
  attachGlobalEvents();
  maybeOpenWizard();
  updateFilterSummary();
  if (state.shareMode) {
    shareBanner?.removeAttribute('hidden');
  }
}

async function fetchConfig() {
  const response = await fetch(`data/trip.json?_=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch trip schema (${response.status})`);
  }
  const json = await response.json();
  return json;
}

function hydrateState(baseConfig) {
  const storedConfig = readStoredJson(STORAGE_KEYS.config);
  const storedPlan = readStoredJson(STORAGE_KEYS.plan);
  const storedGuides = readStoredJson(STORAGE_KEYS.guides);

  const mergedConfig = mergeConfig(baseConfig, storedConfig);
  state.config = mergedConfig;
  state.activeGuides = new Set(
    Array.isArray(storedGuides?.activeGuides)
      ? storedGuides.activeGuides
      : Array.isArray(mergedConfig.meta?.activeGuides)
      ? mergedConfig.meta.activeGuides
      : []
  );

  const { start, end } = mergedConfig.meta?.dates || {};
  state.dateSequence = buildDateSequence(start, end);
  state.plan.days = buildPlanFromSources(mergedConfig.prefill, storedPlan?.days);
}

function mergeConfig(base, stored) {
  if (!stored) return deepClone(base);
  const result = deepClone(base);
  result.version = stored.version || base.version;
  result.meta = { ...base.meta, ...stored.meta };
  result.locations = { ...base.locations, ...(stored.locations || {}) };
  result.coordinates = { ...base.coordinates, ...(stored.coordinates || {}) };
  result.people = Array.isArray(stored.people) && stored.people.length ? stored.people : base.people;
  result.catalog = {
    activities: mergeArraysById(base.catalog?.activities || [], stored.catalog?.activities || []),
    stays: mergeArraysById(base.catalog?.stays || [], stored.catalog?.stays || []),
    bookings: mergeArraysById(base.catalog?.bookings || [], stored.catalog?.bookings || []),
    guides: mergeArraysById(base.catalog?.guides || [], stored.catalog?.guides || []),
  };
  result.prefill = { ...base.prefill, ...(stored.prefill || {}) };
  return result;
}

function buildDateSequence(start, end) {
  if (!start || !end) return [];
  const sequence = [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    sequence.push(date.toISOString().slice(0, 10));
  }
  return sequence;
}

function buildPlanFromSources(defaults = {}, saved = {}) {
  const plan = {};
  state.dateSequence.forEach((dateKey) => {
    plan[dateKey] = mergeDayData(defaults[dateKey], saved?.[dateKey]);
  });
  return plan;
}

function mergeDayData(defaultDay, savedDay) {
  const base = cloneDay(defaultDay || {});
  if (!savedDay) return base;
  const merged = cloneDay(savedDay);
  merged.loc = savedDay.loc || base.loc || state.config.meta?.baseLocation || 'work';
  merged.theme = savedDay.theme ?? base.theme ?? '';
  merged.stay = savedDay.stay ?? base.stay ?? null;
  merged.friends = Array.isArray(savedDay.friends) ? [...new Set(savedDay.friends)] : base.friends || [];
  merged.slots = {
    morning: Array.isArray(savedDay.slots?.morning) ? [...savedDay.slots.morning] : base.slots?.morning || [],
    afternoon: Array.isArray(savedDay.slots?.afternoon) ? [...savedDay.slots.afternoon] : base.slots?.afternoon || [],
    evening: Array.isArray(savedDay.slots?.evening) ? [...savedDay.slots.evening] : base.slots?.evening || [],
  };
  merged.locks = { ...(base.locks || {}), ...(savedDay.locks || {}) };
  return merged;
}

function cloneDay(day) {
  return {
    loc: day.loc || state.config?.meta?.baseLocation || 'work',
    theme: day.theme || '',
    friends: Array.isArray(day.friends) ? [...day.friends] : [],
    stay: day.stay ?? null,
    slots: {
      morning: Array.isArray(day.slots?.morning) ? [...day.slots.morning] : [],
      afternoon: Array.isArray(day.slots?.afternoon) ? [...day.slots.afternoon] : [],
      evening: Array.isArray(day.slots?.evening) ? [...day.slots.evening] : [],
    },
    locks: { ...(day.locks || {}) },
  };
}

function ensureDay(dateKey) {
  if (!state.plan.days[dateKey]) {
    state.plan.days[dateKey] = cloneDay({ loc: state.config.meta?.baseLocation || 'work' });
  }
  return state.plan.days[dateKey];
}

function refreshCatalogCaches() {
  const catalog = state.config.catalog || {};
  const activities = [...(catalog.activities || [])];
  const guides = catalog.guides || [];
  const activeGuideItems = guides
    .filter((guide) => state.activeGuides.has(guide.id))
    .map((guide) => ({ ...guide, source: 'guide' }));

  activeGuideItems.forEach((item) => {
    if (!activities.find((existing) => existing.id === item.id)) {
      activities.push(item);
    }
  });

  state.activityLookup = new Map(activities.map((item) => [item.id, item]));
  state.stayLookup = new Map((catalog.stays || []).map((item) => [item.id, item]));
  state.bookingLookup = new Map((catalog.bookings || []).map((item) => [item.id, item]));
}

function renderTitle() {
  if (!siteTitleEl || !state.config?.meta?.title) return;
  siteTitleEl.textContent = state.config.meta.title;
}

function renderLegend() {
  if (!legendEl) return;
  legendEl.innerHTML = '';
  Object.entries(state.config.locations || {}).forEach(([key, info]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = info.color || '#d1d5db';
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(info.label || key));
    legendEl.appendChild(item);
  });
}

function renderFilters() {
  renderFriendFilters();
  renderLocationFilters();
}

function renderFriendFilters() {
  if (!friendFiltersEl) return;
  friendFiltersEl.innerHTML = '';
  (state.config.people || []).forEach((person) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.filterType = 'friend';
    button.dataset.value = person.name;
    button.textContent = person.name;
    if (person.color) button.style.background = `${person.color}22`;
    button.addEventListener('click', () => toggleFilter('friends', person.name, button));
    friendFiltersEl.appendChild(button);
  });
}

function renderLocationFilters() {
  if (!locationFiltersEl) return;
  locationFiltersEl.innerHTML = '';
  Object.entries(state.config.locations || {}).forEach(([key, info]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.filterType = 'location';
    button.dataset.value = key;
    button.textContent = info.label || key;
    button.style.background = `${info.color || '#d1d5db'}22`;
    button.addEventListener('click', () => toggleFilter('locations', key, button));
    locationFiltersEl.appendChild(button);
  });
}

function toggleFilter(type, value, button) {
  const set = state.filters[type];
  if (!set) return;
  if (set.has(value)) {
    set.delete(value);
    button?.classList.remove('chip--active');
    button?.setAttribute('aria-pressed', 'false');
  } else {
    set.add(value);
    button?.classList.add('chip--active');
    button?.setAttribute('aria-pressed', 'true');
  }
  showAllBtn?.setAttribute('aria-pressed', state.filters.friends.size === 0 && state.filters.locations.size === 0 ? 'true' : 'false');
  applyFilters();
  updateFilterSummary();
}

function clearFilters() {
  state.filters.friends.clear();
  state.filters.locations.clear();
  document.querySelectorAll('.chip[data-filter-type]').forEach((chip) => {
    chip.classList.remove('chip--active');
    chip.setAttribute('aria-pressed', 'false');
  });
  showAllBtn?.setAttribute('aria-pressed', 'true');
  applyFilters();
  updateFilterSummary();
}

function updateFilterSummary() {
  if (!filterSummaryEl) return;
  const friendList = Array.from(state.filters.friends);
  const locationList = Array.from(state.filters.locations);
  if (!friendList.length && !locationList.length) {
    filterSummaryEl.textContent = '';
    return;
  }
  const parts = [];
  if (friendList.length) parts.push(`Friends: ${friendList.join(', ')}`);
  if (locationList.length) parts.push(`Places: ${locationList.map((loc) => state.config.locations?.[loc]?.label || loc).join(', ')}`);
  filterSummaryEl.textContent = parts.join(' • ');
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
  card.draggable = state.editing && !state.readOnly;

  const stripe = document.createElement('span');
  stripe.className = 'day-card__stripe';
  stripe.style.background = state.config.locations?.[plan.loc]?.color || '#d1d5db';
  card.appendChild(stripe);

  const header = document.createElement('div');
  header.className = 'day-card__header';

  const dateBox = document.createElement('div');
  dateBox.className = 'day-card__date';
  const date = new Date(`${dateKey}T00:00:00`);
  const number = document.createElement('span');
  number.className = 'day-card__day-number';
  number.textContent = String(date.getDate());
  const dateText = document.createElement('div');
  dateText.className = 'day-card__date-text';
  dateText.innerHTML = `<span>${date.toLocaleDateString(undefined, { month: 'short' })}</span><span>${date.toLocaleDateString(undefined, { weekday: 'short' })}</span>`;
  dateBox.append(number, dateText);

  const meta = document.createElement('div');
  meta.className = 'day-card__meta';
  meta.appendChild(renderThemeEditor(dateKey, plan));

  const badgeRow = document.createElement('div');
  badgeRow.className = 'day-card__badges';
  const stayBtn = document.createElement('button');
  stayBtn.type = 'button';
  stayBtn.className = 'pill';
  stayBtn.textContent = plan.stay ? getStayLabel(plan.stay) : 'Pick stay';
  stayBtn.addEventListener('click', () => openSheet(dateKey, 'stay'));
  badgeRow.appendChild(stayBtn);
  const mapBtn = document.createElement('button');
  mapBtn.type = 'button';
  mapBtn.className = 'pill';
  mapBtn.textContent = 'Map';
  mapBtn.addEventListener('click', () => openMap(dateKey));
  badgeRow.appendChild(mapBtn);
  meta.appendChild(badgeRow);

  header.append(dateBox, meta);
  card.appendChild(header);

  const summary = document.createElement('div');
  summary.className = 'day-card__summary';
  const travelInfo = state.travelSummaries.get(dateKey);
  if (travelInfo && travelInfo.points.length >= 2) {
    const travelChip = document.createElement('span');
    travelChip.className = 'travel-chip';
    const hours = Math.floor(travelInfo.minutes / 60);
    const minutes = travelInfo.minutes % 60;
    const labelParts = [];
    if (hours) labelParts.push(`${hours}h`);
    labelParts.push(`${minutes}m`);
    travelChip.textContent = `Travel ~ ${labelParts.join(' ')} · ${travelInfo.distanceKm.toFixed(1)} km`;
    summary.appendChild(travelChip);
  } else {
    const travelChip = document.createElement('span');
    travelChip.className = 'travel-chip';
    travelChip.textContent = 'Local day';
    summary.appendChild(travelChip);
  }
  card.appendChild(summary);

  const warnings = state.constraintWarnings.get(dateKey);
  if (warnings?.length) {
    const warningList = document.createElement('div');
    warningList.className = 'warning-list';
    warnings.forEach((message) => {
      const warning = document.createElement('div');
      warning.className = 'warning-chip';
      warning.textContent = message;
      warningList.appendChild(warning);
    });
    card.appendChild(warningList);
  }

  const slotsWrap = document.createElement('div');
  slotsWrap.className = 'slots';
  ['morning', 'afternoon', 'evening'].forEach((slotName) => {
    const slot = document.createElement('section');
    slot.className = 'slot';
    slot.dataset.slot = slotName;
    slot.dataset.date = dateKey;

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
    slot.appendChild(slotHeader);

    (plan.slots?.[slotName] || []).forEach((id, index) => {
      const chip = renderChiplet({ dateKey, slotName, index, id });
      slot.appendChild(chip);
    });

    slotsWrap.appendChild(slot);
  });
  card.appendChild(slotsWrap);

  const friendRow = document.createElement('div');
  friendRow.className = 'day-card__friends';
  (state.config.people || []).forEach((person) => {
    const active = plan.friends.includes(person.name);
    const friendBtn = document.createElement('button');
    friendBtn.type = 'button';
    friendBtn.className = 'friend-chip' + (active ? ' friend-chip--on' : '');
    friendBtn.textContent = active ? person.name : `+ ${person.name}`;
    friendBtn.style.background = active && person.color ? `${person.color}55` : '#fff';
    friendBtn.addEventListener('click', () => toggleFriend(dateKey, person.name));
    friendRow.appendChild(friendBtn);
  });
  card.appendChild(friendRow);

  card.addEventListener('dragstart', handleDayDragStart);
  card.addEventListener('dragover', handleDayDragOver);
  card.addEventListener('drop', handleDayDrop);
  card.addEventListener('dragend', () => {
    state.cardDragSource = null;
  });

  return card;
}
function renderThemeEditor(dateKey, plan) {
  const container = document.createElement('div');
  container.className = 'theme-editor';
  if (state.inlineThemeEdit === dateKey && state.editing && !state.readOnly) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = plan.theme || '';
    input.className = 'theme-editor__input';
    input.placeholder = state.config.meta?.themeDefaults?.[plan.loc] || 'Theme';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitThemeEdit(dateKey, input.value);
      } else if (event.key === 'Escape') {
        cancelThemeEdit();
      }
    });
    input.addEventListener('blur', () => commitThemeEdit(dateKey, input.value));
    container.appendChild(input);
    queueMicrotask(() => input.focus());
  } else {
    const text = document.createElement('span');
    text.className = 'theme-editor__text';
    text.textContent = plan.theme || state.config.meta?.themeDefaults?.[plan.loc] || 'Set theme';
    container.appendChild(text);
    if (state.editing && !state.readOnly) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.innerHTML = '✎';
      editBtn.addEventListener('click', () => {
        state.inlineThemeEdit = dateKey;
        updateDayCard(dateKey);
      });
      container.appendChild(editBtn);
    }
  }
  return container;
}

function commitThemeEdit(dateKey, value) {
  state.inlineThemeEdit = null;
  const day = ensureDay(dateKey);
  day.theme = value.trim();
  persistPlan();
  updateDayCard(dateKey);
}

function cancelThemeEdit() {
  state.inlineThemeEdit = null;
  renderCalendar();
}

function renderChiplet(meta) {
  const { dateKey, slotName, index, id } = meta;
  const chip = document.createElement('span');
  chip.className = 'chiplet';
  chip.dataset.date = dateKey;
  chip.dataset.slot = slotName;
  chip.dataset.index = String(index);
  chip.dataset.id = id;

  const label = getActivityLabel(id);
  chip.appendChild(buildChipContent(label));

  const locked = isChipLocked(dateKey, id);
  if (locked) chip.classList.add('locked');

  if (state.editing && !state.readOnly) {
    chip.appendChild(renderChipActions({ dateKey, slotName, index, id, locked }));
    if (!locked) {
      chip.addEventListener('pointerdown', (event) => handleChipPointerDown(event, meta));
    }
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
    fragment.append(time, document.createTextNode(` ${match[2]}`));
  } else {
    fragment.append(document.createTextNode(label));
  }
  return fragment;
}

function renderChipActions(meta) {
  const { dateKey, slotName, index, id, locked } = meta;
  const actions = document.createElement('span');
  actions.className = 'chiplet__actions';

  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = 'chiplet__btn';
  lockBtn.textContent = locked ? '🔒' : '🔓';
  lockBtn.title = locked ? 'Unlock item' : 'Lock item';
  lockBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleLock(dateKey, id);
  });
  actions.appendChild(lockBtn);

  if (!locked) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chiplet__btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeChip(dateKey, slotName, index);
    });
    actions.appendChild(removeBtn);
  }

  return actions;
}

function getActivityLabel(id) {
  return state.activityLookup.get(id)?.label || id;
}

function getStayLabel(id) {
  return state.stayLookup.get(id)?.label || id;
}

function isChipLocked(dateKey, id) {
  const day = ensureDay(dateKey);
  if (day.locks?.[id] === 1) return true;
  if (day.locks?.[id] === 0) return false;
  return Boolean(state.activityLookup.get(id)?.locked);
}

function toggleLock(dateKey, id) {
  if (state.readOnly) return;
  const day = ensureDay(dateKey);
  day.locks = day.locks || {};
  day.locks[id] = isChipLocked(dateKey, id) ? 0 : 1;
  persistPlan();
  updateDayCard(dateKey);
}

function removeChip(dateKey, slotName, index) {
  if (state.readOnly) return;
  const day = ensureDay(dateKey);
  const list = day.slots?.[slotName];
  if (!Array.isArray(list)) return;
  const id = list[index];
  if (isChipLocked(dateKey, id)) return;
  list.splice(index, 1);
  persistPlan();
  updateDayCard(dateKey);
}

function toggleFriend(dateKey, name) {
  if (state.readOnly) return;
  const day = ensureDay(dateKey);
  const idx = day.friends.indexOf(name);
  if (idx >= 0) {
    day.friends.splice(idx, 1);
  } else {
    day.friends.push(name);
  }
  persistPlan();
  updateDayCard(dateKey);
}

function addActivity(dateKey, slotName, id) {
  if (state.readOnly) return;
  const day = ensureDay(dateKey);
  day.slots[slotName] = Array.isArray(day.slots[slotName]) ? day.slots[slotName] : [];
  day.slots[slotName].push(id);
  persistPlan();
  updateDayCard(dateKey);
}

function setStay(dateKey, stayId) {
  if (state.readOnly) return;
  const day = ensureDay(dateKey);
  day.stay = stayId;
  persistPlan();
  updateDayCard(dateKey);
}

function applyFilters() {
  const cards = calendarEl.querySelectorAll('.day-card');
  cards.forEach((card) => {
    const dateKey = card.dataset.date;
    const plan = ensureDay(dateKey);
    const matchesFriend = state.filters.friends.size
      ? plan.friends.some((friend) => state.filters.friends.has(friend))
      : true;
    const matchesLocation = state.filters.locations.size
      ? state.filters.locations.has(plan.loc)
      : true;
    card.style.display = matchesFriend && matchesLocation ? '' : 'none';
  });
}

function updateToolbar() {
  if (editBtn) {
    editBtn.textContent = state.editing ? 'Done' : 'Edit';
    editBtn.disabled = state.readOnly;
  }
  if (shareBtn) shareBtn.disabled = false;
  if (githubBtn) githubBtn.disabled = false;
  if (icsBtn) icsBtn.disabled = false;
  if (state.shareMode) {
    if (editBtn) editBtn.disabled = true;
    if (githubBtn) githubBtn.disabled = true;
  }
}

function updateDayCard(dateKey) {
  const existing = calendarEl.querySelector(`.day-card[data-date="${dateKey}"]`);
  if (!existing) return;
  const replacement = renderDayCard(dateKey);
  calendarEl.replaceChild(replacement, existing);
  applyFilters();
}
function openSheet(day, tab = 'activity', slot = 'morning') {
  if (state.readOnly) return;
  state.sheet = { open: true, day, tab, slot };
  renderSheet();
  sheetEl.classList.add('sheet--open');
  sheetEl.setAttribute('aria-hidden', 'false');
  sheetBackdrop.classList.add('is-visible');
  document.body.classList.add('sheet-open');
}

function closeSheet() {
  state.sheet.open = false;
  sheetEl.classList.remove('sheet--open');
  sheetEl.setAttribute('aria-hidden', 'true');
  sheetBackdrop.classList.remove('is-visible');
  document.body.classList.remove('sheet-open');
}

function renderSheet() {
  if (!state.sheet.open) return;
  const { day, tab, slot } = state.sheet;
  const longDate = formatLongDate(day);
  sheetTitle.textContent = longDate;
  sheetSubtitle.textContent = tab === 'activity' ? `${slot.toUpperCase()} SLOT` : tab === 'stay' ? 'Choose stay' : 'Bookings & tickets';
  sheetBody.innerHTML = '';
  sheetFooter.innerHTML = '';

  sheetEl.querySelectorAll('.tab').forEach((tabBtn) => {
    tabBtn.setAttribute('aria-selected', tabBtn.dataset.tab === tab ? 'true' : 'false');
  });

  if (tab === 'activity') {
    renderActivitySheet(day, slot);
    renderCustomActivityForm();
  } else if (tab === 'stay') {
    renderStaySheet(day);
    renderCustomStayForm();
  } else if (tab === 'booking') {
    renderBookingSheet();
  }
}

function renderActivitySheet(day, slot) {
  Object.keys(state.config.locations || {}).forEach((locationId) => {
    const options = [...state.activityLookup.values()].filter((item) => item.city === locationId);
    if (!options.length) return;
    sheetBody.appendChild(renderSheetGroup(locationId, options, (item) => {
      addActivity(day, slot, item.id);
    }));
  });

  const guideSection = document.createElement('section');
  guideSection.className = 'sheet-group';
  const guideHeader = document.createElement('div');
  guideHeader.className = 'sheet-group__header';
  guideHeader.innerHTML = '<span class="sheet-group__swatch" style="background:#f1f5f9"></span>Area guide picks';
  guideSection.appendChild(guideHeader);
  const list = document.createElement('div');
  list.className = 'sheet-group__list';
  (state.config.catalog.guides || []).forEach((guide) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sheet-card';
    card.textContent = `${guide.label} · ${state.config.locations?.[guide.city]?.label || guide.city}`;
    const meta = document.createElement('span');
    meta.className = 'sheet-card__meta';
    const active = state.activeGuides.has(guide.id);
    meta.textContent = active ? 'In library' : 'Add to library';
    card.appendChild(meta);
    card.addEventListener('click', () => {
      if (active) {
        state.activeGuides.delete(guide.id);
      } else {
        state.activeGuides.add(guide.id);
      }
      persistActiveGuides();
      refreshCatalogCaches();
      renderSheet();
      renderCalendar();
    });
    list.appendChild(card);
  });
  guideSection.appendChild(list);
  sheetBody.appendChild(guideSection);
}

function renderStaySheet(day) {
  Object.keys(state.config.locations || {}).forEach((locationId) => {
    const options = (state.config.catalog.stays || []).filter((stay) => stay.city === locationId);
    if (!options.length) return;
    const dayPlan = ensureDay(day);
    sheetBody.appendChild(
      renderSheetGroup(locationId, options, (item) => {
        setStay(day, item.id);
      }, dayPlan.stay)
    );
  });
}

function renderBookingSheet() {
  Object.keys(state.config.locations || {}).forEach((locationId) => {
    const options = (state.config.catalog.bookings || []).filter((booking) => booking.city === locationId);
    if (!options.length) return;
    sheetBody.appendChild(
      renderSheetGroup(locationId, options, (item) => {
        window.open(item.url, '_blank', 'noopener');
      })
    );
  });
}

function renderSheetGroup(locationId, items, onSelect, selectedId) {
  const group = document.createElement('section');
  group.className = 'sheet-group';
  const header = document.createElement('div');
  header.className = 'sheet-group__header';
  const swatch = document.createElement('span');
  swatch.className = 'sheet-group__swatch';
  swatch.style.background = state.config.locations?.[locationId]?.color || '#d1d5db';
  header.append(swatch, document.createTextNode(state.config.locations?.[locationId]?.label || locationId.toUpperCase()));
  group.appendChild(header);

  const list = document.createElement('div');
  list.className = 'sheet-group__list';
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sheet-card';
    if (selectedId && item.id === selectedId) button.classList.add('sheet-card--selected');
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

function renderCustomActivityForm() {
  const form = document.createElement('form');
  form.className = 'inline-form';
  form.innerHTML = `
    <strong>Add a custom activity</strong>
    <div class="inline-form__row">
      <input type="text" name="label" placeholder="Title" required />
      <select name="city" required>
        <option value="" disabled selected>City</option>
        ${Object.entries(state.config.locations || {})
          .map(([key, info]) => `<option value="${key}">${info.label || key}</option>`)
          .join('')}
      </select>
    </div>
    <div class="inline-form__row">
      <select name="coord">
        <option value="">Coordinate key (optional)</option>
        ${Object.keys(state.config.coordinates || {})
          .sort()
          .map((key) => `<option value="${key}">${key}</option>`)
          .join('')}
      </select>
      <input type="text" name="lat" placeholder="Latitude (optional)" />
      <input type="text" name="lng" placeholder="Longitude (optional)" />
    </div>
    <button type="submit" class="btn">Add activity</button>
  `;
  form.addEventListener('submit', handleCustomActivitySubmit);
  sheetFooter.appendChild(form);
}

function handleCustomActivitySubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const label = form.label.value.trim();
  const city = form.city.value;
  if (!label || !city) return;
  let coordKey = form.coord.value.trim();
  const lat = parseFloat(form.lat.value);
  const lng = parseFloat(form.lng.value);
  if (!coordKey && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    coordKey = registerCoordinate(label, lat, lng);
  }
  const id = generateId('custom-act');
  state.config.catalog.activities = state.config.catalog.activities || [];
  state.config.catalog.activities.push({ id, city, label, coord: coordKey || undefined });
  refreshCatalogCaches();
  persistConfig();
  showToast('Activity added to library.');
  form.reset();
  renderSheet();
}

function renderCustomStayForm() {
  const form = document.createElement('form');
  form.className = 'inline-form';
  form.innerHTML = `
    <strong>Add a custom stay</strong>
    <div class="inline-form__row">
      <input type="text" name="label" placeholder="Stay name" required />
      <select name="city" required>
        <option value="" disabled selected>City</option>
        ${Object.entries(state.config.locations || {})
          .map(([key, info]) => `<option value="${key}">${info.label || key}</option>`)
          .join('')}
      </select>
    </div>
    <div class="inline-form__row">
      <input type="url" name="url" placeholder="Link" required />
    </div>
    <button type="submit" class="btn">Add stay</button>
  `;
  form.addEventListener('submit', handleCustomStaySubmit);
  sheetFooter.appendChild(form);
}

function handleCustomStaySubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const label = form.label.value.trim();
  const city = form.city.value;
  const url = form.url.value.trim();
  if (!label || !city || !url) return;
  const id = generateId('custom-stay');
  state.config.catalog.stays = state.config.catalog.stays || [];
  state.config.catalog.stays.push({ id, city, label, url });
  refreshCatalogCaches();
  persistConfig();
  showToast('Stay added to catalog.');
  form.reset();
  renderSheet();
}

function registerCoordinate(label, lat, lng) {
  const key = slugify(label) + '-' + Math.abs(Math.round(lat * 1000));
  if (!state.config.coordinates) state.config.coordinates = {};
  state.config.coordinates[key] = [lat, lng];
  return key;
}
function openMap(dateKey) {
  const plan = ensureDay(dateKey);
  mapOverlay.classList.add('is-open');
  mapOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('map-open');
  mapTitleEl.textContent = `${formatLongDate(dateKey)} — ${plan.theme || state.config.meta?.themeDefaults?.[plan.loc] || ''}`;
  const travel = state.travelSummaries.get(dateKey);
  const points = travel?.points || [];
  setTimeout(() => {
    if (!state.mapInstance) {
      state.mapInstance = window.L.map('map');
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(state.mapInstance);
      state.mapMarkersLayer = window.L.layerGroup().addTo(state.mapInstance);
      state.mapRouteLayer = window.L.layerGroup().addTo(state.mapInstance);
    }
    state.mapInstance.invalidateSize();
    state.mapMarkersLayer.clearLayers();
    state.mapRouteLayer.clearLayers();

    if (points.length) {
      const latLngs = points.map((p) => p.coords);
      points.forEach((point, index) => {
        const marker = window.L.marker(point.coords).addTo(state.mapMarkersLayer);
        marker.bindPopup(`${index + 1}. ${point.label}`);
      });
      if (latLngs.length >= 2) {
        window.L.polyline(latLngs, { color: '#2d3a64', weight: 3, opacity: 0.7 }).addTo(state.mapRouteLayer);
      }
      state.mapInstance.fitBounds(latLngs, { padding: [32, 32] });
    } else {
      state.mapInstance.setView([35.0, 135.5], 5);
    }
  }, 50);
}

function closeMap() {
  mapOverlay.classList.remove('is-open');
  mapOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('map-open');
}

function formatLongDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.toLocaleDateString(undefined, { weekday: 'long' })}, ${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()}`;
}

function toggleEditing() {
  if (state.readOnly) return;
  state.editing = !state.editing;
  state.inlineThemeEdit = null;
  updateToolbar();
  renderCalendar();
}

function exportIcs() {
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
  const dtstamp = formatIcsDateTime(new Date());
  state.dateSequence.forEach((dateKey, index) => {
    const day = ensureDay(dateKey);
    const dateValue = dateKey.replace(/-/g, '');
    const summary = day.theme || state.config.meta?.themeDefaults?.[day.loc] || 'Trip day';
    const slotDescriptions = [];
    const slotNames = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
    ['morning', 'afternoon', 'evening'].forEach((slot) => {
      const labels = (day.slots[slot] || []).map(getActivityLabel).filter(Boolean);
      if (labels.length) slotDescriptions.push(`${slotNames[slot]}: ${labels.join(' • ')}`);
    });
    if (day.stay) slotDescriptions.push(`Stay: ${getStayLabel(day.stay)}`);
    if (day.friends.length) slotDescriptions.push(`Friends: ${day.friends.join(', ')}`);
    const description = slotDescriptions.join(' / ');
    const uid = `${dateValue}-${index}@jp-trip`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`SUMMARY:${escapeIcsText(`${formatSummaryDate(dateKey)} — ${summary}`)}`);
    lines.push(`DTSTART;TZID=Asia/Tokyo:${dateValue}T090000`);
    lines.push(`DTEND;TZID=Asia/Tokyo:${dateValue}T210000`);
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push(`LOCATION:${escapeIcsText(state.config.locations?.[day.loc]?.label || day.loc)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slugify(state.config.meta?.title || 'trip-plan')}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function formatIcsDateTime(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatSummaryDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()}`;
}

function attachGlobalEvents() {
  editBtn?.addEventListener('click', toggleEditing);
  icsBtn?.addEventListener('click', exportIcs);
  shareBtn?.addEventListener('click', sharePlan);
  githubBtn?.addEventListener('click', openGithubModal);
  wizardBtn?.addEventListener('click', openWizard);
  closeSheetBtn?.addEventListener('click', closeSheet);
  sheetBackdrop?.addEventListener('click', closeSheet);
  closeMapBtn?.addEventListener('click', closeMap);
  mapOverlay?.addEventListener('click', (event) => {
    if (event.target === mapOverlay) closeMap();
  });
  document.querySelectorAll('.sheet__tabs .tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      if (!state.sheet.open) return;
      state.sheet.tab = tabBtn.dataset.tab;
      renderSheet();
    });
  });
  clearFiltersBtn?.addEventListener('click', clearFilters);
  showAllBtn?.addEventListener('click', () => {
    clearFilters();
    showAllBtn.setAttribute('aria-pressed', 'true');
  });
  shareExitBtn?.addEventListener('click', exitShareMode);
  wizardForm?.addEventListener('submit', submitWizard);
  wizardForm?.querySelector('[data-action="add-person"]')?.addEventListener('click', addWizardPersonRow);
  wizardForm?.querySelector('[data-action="close-wizard"]')?.addEventListener('click', closeWizard);
  githubForm?.addEventListener('submit', submitGithubForm);
  githubForm?.querySelector('[data-action="close-github"]')?.addEventListener('click', closeGithubModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.sheet.open) closeSheet();
      if (wizardOverlay?.classList.contains('is-open')) closeWizard();
      if (githubOverlay?.classList.contains('is-open')) closeGithubModal();
      if (mapOverlay?.classList.contains('is-open')) closeMap();
    }
  });
}

function computeTravelSummaries() {
  const coordinates = state.config.coordinates || {};
  const summaries = new Map();
  state.dateSequence.forEach((dateKey) => {
    const day = ensureDay(dateKey);
    const points = [];
    ['morning', 'afternoon', 'evening'].forEach((slot) => {
      (day.slots[slot] || []).forEach((id) => {
        const activity = state.activityLookup.get(id);
        if (!activity?.coord) return;
        const coord = coordinates[activity.coord];
        if (!coord) return;
        points.push({ coords: coord, label: activity.label, slot, id });
      });
    });
    let distanceKm = 0;
    const segments = [];
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1].coords;
      const to = points[i].coords;
      const segment = haversine(from, to);
      distanceKm += segment;
      segments.push({ from: points[i - 1], to: points[i], distance: segment });
    }
    const minutes = Math.round((distanceKm / SPEED_KMH) * 60);
    summaries.set(dateKey, { distanceKm, minutes, points, segments });
  });
  state.travelSummaries = summaries;
}

function recomputeConstraintWarnings() {
  const warnings = new Map();
  const baseLocation = state.config.meta?.baseLocation || 'work';
  const peopleByName = new Map((state.config.people || []).map((person) => [person.name, person]));

  state.dateSequence.forEach((dateKey) => {
    const day = ensureDay(dateKey);
    const weekday = WEEKDAY_KEYS[new Date(`${dateKey}T00:00:00`).getDay()];
    day.friends.forEach((name) => {
      const person = peopleByName.get(name);
      if (!person?.constraints) return;
      const warningsForDay = warnings.get(dateKey) || [];
      if (person.constraints.workDays?.includes(weekday)) {
        const busy = (day.slots.morning?.length || 0) + (day.slots.afternoon?.length || 0) > 0;
        if (busy || (day.loc !== baseLocation && day.loc !== 'work')) {
          warningsForDay.push(`${name} works ${weekday.toUpperCase()} — keep daytime light.`);
        }
      }
      if (warningsForDay.length) warnings.set(dateKey, warningsForDay);
    });
  });

  (state.config.people || []).forEach((person) => {
    const limit = person.constraints?.maxConsecutiveAway;
    if (!limit) return;
    let streak = 0;
    state.dateSequence.forEach((dateKey) => {
      const day = ensureDay(dateKey);
      if (!day.friends.includes(person.name)) {
        streak = 0;
        return;
      }
      const away = day.loc !== baseLocation && day.loc !== 'work';
      if (away) {
        streak += 1;
        if (streak > limit) {
          const warningsForDay = warnings.get(dateKey) || [];
          warningsForDay.push(`${person.name} exceeds ${limit}-day away limit.`);
          warnings.set(dateKey, warningsForDay);
        }
      } else {
        streak = 0;
      }
    });
  });

  state.constraintWarnings = warnings;
}

function persistPlan() {
  if (state.shareMode) return;
  syncPrefillFromPlan();
  localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify({ days: state.plan.days }));
  computeTravelSummaries();
  recomputeConstraintWarnings();
}

function persistConfig() {
  if (state.shareMode) return;
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(state.config));
}

function persistActiveGuides() {
  state.config.meta = state.config.meta || {};
  state.config.meta.activeGuides = Array.from(state.activeGuides);
  if (!state.shareMode) {
    localStorage.setItem(STORAGE_KEYS.guides, JSON.stringify({ activeGuides: Array.from(state.activeGuides) }));
    persistConfig();
  }
}

function syncPrefillFromPlan() {
  state.config.prefill = { ...state.plan.days };
  persistConfig();
}

function readStoredJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Unable to parse stored data for', key, error);
    return null;
  }
}

function showToast(message, tone = 'info') {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.className = 'toast';
  if (tone === 'error') toastEl.classList.add('toast--error');
  if (tone === 'warn') toastEl.classList.add('toast--warn');
  toastEl.classList.add('is-visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
  }, 3200);
}
function handleDayDragStart(event) {
  if (!state.editing || state.readOnly) {
    event.preventDefault();
    return;
  }
  state.cardDragSource = event.currentTarget.dataset.date;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', 'day');
}

function handleDayDragOver(event) {
  if (!state.editing || state.readOnly) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function handleDayDrop(event) {
  if (!state.editing || state.readOnly) return;
  event.preventDefault();
  if (event.dataTransfer.getData('text/plain') !== 'day') return;
  const source = state.cardDragSource;
  const target = event.currentTarget.dataset.date;
  if (!source || !target || source === target) return;
  const temp = state.plan.days[source];
  state.plan.days[source] = state.plan.days[target];
  state.plan.days[target] = temp;
  persistPlan();
  renderCalendar();
}

function handleChipPointerDown(event, meta) {
  if (!state.editing || state.readOnly || event.button === 2) return;
  event.preventDefault();
  const chip = event.currentTarget;
  chip.setPointerCapture(event.pointerId);
  const dragState = {
    pointerId: event.pointerId,
    chip,
    meta: { ...meta },
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    longPressTimer: null,
    ghost: null,
    placeholder: null,
    lastSlot: null,
    target: null,
  };
  dragState.longPressTimer = window.setTimeout(() => startChipDrag(event, dragState), LONG_PRESS_MS);
  let moveHandler;
  let upHandler;
  let cancelHandler;
  moveHandler = (ev) => handleChipPointerMove(ev, dragState);
  cancelHandler = (ev) => handleChipPointerCancel(ev, dragState, moveHandler, upHandler, cancelHandler);
  upHandler = (ev) => handleChipPointerUp(ev, dragState, moveHandler, upHandler, cancelHandler);
  chip.addEventListener('pointermove', moveHandler);
  chip.addEventListener('pointerup', upHandler);
  chip.addEventListener('pointercancel', cancelHandler);
  state.chipDrag = dragState;
}

function startChipDrag(event, drag) {
  if (drag.active) return;
  drag.active = true;
  const rect = drag.chip.getBoundingClientRect();
  drag.placeholder = document.createElement('span');
  drag.placeholder.className = 'chiplet';
  drag.placeholder.style.visibility = 'hidden';
  drag.placeholder.style.width = `${rect.width}px`;
  drag.placeholder.style.height = `${rect.height}px`;
  drag.chip.parentNode.insertBefore(drag.placeholder, drag.chip.nextSibling);
  drag.chip.classList.add('chiplet--dragging');
  drag.ghost = drag.chip.cloneNode(true);
  drag.ghost.classList.add('chiplet--ghost');
  drag.ghost.style.width = `${rect.width}px`;
  drag.ghost.style.left = `${event.clientX}px`;
  drag.ghost.style.top = `${event.clientY}px`;
  document.body.appendChild(drag.ghost);
}

function handleChipPointerMove(event, drag) {
  if (!state.chipDrag || drag.pointerId !== event.pointerId) return;
  const deltaX = Math.abs(event.clientX - drag.startX);
  const deltaY = Math.abs(event.clientY - drag.startY);
  if (!drag.active && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
    startChipDrag(event, drag);
  }
  if (!drag.active) return;
  if (drag.ghost) {
    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
  }
  evaluateChipDropTarget(event, drag);
}

function evaluateChipDropTarget(event, drag) {
  if (!drag.active) return;
  const targetEl = document.elementFromPoint(event.clientX, event.clientY);
  const slot = targetEl?.closest('.slot');
  if (drag.lastSlot && drag.lastSlot !== slot) {
    drag.lastSlot.removeAttribute('data-drop-hover');
  }
  drag.lastSlot = slot;
  if (!slot) {
    drag.target = null;
    return;
  }
  slot.setAttribute('data-drop-hover', 'true');
  const chips = Array.from(slot.querySelectorAll('.chiplet:not(.chiplet--dragging)'));
  let index = chips.length;
  for (let i = 0; i < chips.length; i += 1) {
    const rect = chips[i].getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) {
      index = i;
      break;
    }
  }
  drag.target = {
    dateKey: slot.dataset.date,
    slotName: slot.dataset.slot,
    index,
  };
}

function handleChipPointerUp(event, drag, moveHandler, upHandler, cancelHandler) {
  if (!state.chipDrag || drag.pointerId !== event.pointerId) return;
  cleanupChipDrag(drag, moveHandler, upHandler, cancelHandler);
  if (drag.target) {
    moveChip(drag.meta, drag.target);
  }
  state.chipDrag = null;
}

function handleChipPointerCancel(event, drag, moveHandler, upHandler, cancelHandler) {
  if (!state.chipDrag || drag.pointerId !== event.pointerId) return;
  cleanupChipDrag(drag, moveHandler, upHandler, cancelHandler);
  state.chipDrag = null;
}

function cleanupChipDrag(drag, moveHandler, upHandler, cancelHandler) {
  window.clearTimeout(drag.longPressTimer);
  drag.chip.releasePointerCapture(drag.pointerId);
  drag.chip.classList.remove('chiplet--dragging');
  drag.chip.removeEventListener('pointermove', moveHandler);
  drag.chip.removeEventListener('pointerup', upHandler);
  drag.chip.removeEventListener('pointercancel', cancelHandler);
  drag.placeholder?.remove();
  drag.ghost?.remove();
  drag.lastSlot?.removeAttribute('data-drop-hover');
}

function moveChip(source, target) {
  if (state.readOnly) return;
  const fromDay = ensureDay(source.dateKey);
  const fromList = fromDay.slots[source.slotName];
  if (!Array.isArray(fromList)) return;
  const id = fromList[source.index];
  if (isChipLocked(source.dateKey, id)) return;
  fromList.splice(source.index, 1);
  const toDay = ensureDay(target.dateKey);
  toDay.slots[target.slotName] = Array.isArray(toDay.slots[target.slotName]) ? toDay.slots[target.slotName] : [];
  let insertIndex = target.index;
  if (source.dateKey === target.dateKey && source.slotName === target.slotName && source.index < target.index) {
    insertIndex -= 1;
  }
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > toDay.slots[target.slotName].length) {
    insertIndex = toDay.slots[target.slotName].length;
  }
  toDay.slots[target.slotName].splice(insertIndex, 0, id);
  persistPlan();
  updateDayCard(source.dateKey);
  if (source.dateKey !== target.dateKey) updateDayCard(target.dateKey);
}

function addWizardPersonRow() {
  const person = { name: '', color: randomPastel(), active: true };
  const row = renderWizardPersonRow(person);
  wizardPeopleList.appendChild(row);
  const input = row.querySelector('input[name="person-name"]');
  input?.focus();
}

function renderWizardPersonRow(person) {
  const row = document.createElement('div');
  row.className = 'wizard-person';
  row.innerHTML = `
    <input type="text" name="person-name" value="${person.name || ''}" placeholder="Name" required />
    <div class="wizard-person__controls">
      <label>
        <input type="checkbox" name="person-active" ${person.active !== false ? 'checked' : ''} /> include
      </label>
      <button type="button" class="btn btn--ghost" data-action="remove">Remove</button>
    </div>
  `;
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
  });
  return row;
}

function openWizard() {
  populateWizard();
  wizardOverlay.classList.add('is-open');
  wizardOverlay.setAttribute('aria-hidden', 'false');
}

function closeWizard() {
  wizardOverlay.classList.remove('is-open');
  wizardOverlay.setAttribute('aria-hidden', 'true');
}

function populateWizard() {
  if (!wizardForm) return;
  wizardForm.start.value = state.config.meta?.dates?.start || '';
  wizardForm.end.value = state.config.meta?.dates?.end || '';
  const baseSelect = wizardForm.base;
  baseSelect.innerHTML = Object.entries(state.config.locations || {})
    .map(([key, info]) => `<option value="${key}" ${key === state.config.meta?.baseLocation ? 'selected' : ''}>${info.label || key}</option>`)
    .join('');
  const nana = state.config.people?.find((p) => p.name === 'Nana');
  wizardForm.nanaWork.checked = Boolean(nana?.constraints?.workDays?.length);
  wizardForm.nanaMaxAway.value = nana?.constraints?.maxConsecutiveAway || 3;
  wizardPeopleList.innerHTML = '';
  (state.config.people || []).forEach((person) => {
    const row = renderWizardPersonRow({ name: person.name, active: true });
    wizardPeopleList.appendChild(row);
  });
}

function submitWizard(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const start = form.start.value;
  const end = form.end.value;
  const base = form.base.value;
  if (!start || !end || !base) {
    showToast('Please complete the trip basics.', 'warn');
    return;
  }
  const people = [];
  wizardPeopleList.querySelectorAll('.wizard-person').forEach((row) => {
    const name = row.querySelector('input[name="person-name"]').value.trim();
    const active = row.querySelector('input[name="person-active"]').checked;
    if (!name || !active) return;
    const existing = state.config.people?.find((p) => p.name === name);
    people.push({
      id: existing?.id || slugify(name),
      name,
      color: existing?.color || randomPastel(),
      constraints: existing?.constraints || {},
    });
  });
  state.config.meta = state.config.meta || {};
  state.config.meta.dates = { start, end };
  state.config.meta.baseLocation = base;
  state.config.people = people;

  const nana = state.config.people.find((p) => p.name === 'Nana');
  if (nana) {
    nana.constraints = nana.constraints || {};
    nana.constraints.workDays = form.nanaWork.checked ? ['tue', 'fri'] : [];
    const maxAway = parseInt(form.nanaMaxAway.value, 10);
    nana.constraints.maxConsecutiveAway = Number.isFinite(maxAway) && maxAway > 0 ? maxAway : 3;
  }

  state.dateSequence = buildDateSequence(start, end);
  state.plan.days = buildPlanFromSources(state.config.prefill, state.plan.days);
  state.setupComplete = true;
  localStorage.setItem(STORAGE_KEYS.setup, '1');
  persistConfig();
  persistPlan();
  renderFilters();
  renderLegend();
  renderCalendar();
  closeWizard();
  showToast('Trip setup updated.');
}

function maybeOpenWizard() {
  if (!state.setupComplete) {
    openWizard();
  }
}

function openGithubModal() {
  populateGithubForm();
  githubOverlay.classList.add('is-open');
  githubOverlay.setAttribute('aria-hidden', 'false');
}

function closeGithubModal() {
  githubOverlay.classList.remove('is-open');
  githubOverlay.setAttribute('aria-hidden', 'true');
}

function populateGithubForm() {
  if (!githubForm) return;
  const settings = state.githubSettings || {};
  githubForm.owner.value = settings.owner || '';
  githubForm.repo.value = settings.repo || '';
  githubForm.branch.value = settings.branch || (state.config.meta?.github?.branch || 'main');
  githubForm.path.value = settings.path || state.config.meta?.github?.path || 'data/trip.json';
  githubForm.message.value = settings.message || `Update trip.json (${new Date().toISOString().slice(0, 10)})`;
  githubForm.token.value = settings.token || '';
}

function submitGithubForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    owner: form.owner.value.trim(),
    repo: form.repo.value.trim(),
    branch: form.branch.value.trim(),
    path: form.path.value.trim(),
    message: form.message.value.trim() || `Update trip.json (${new Date().toISOString()})`,
    token: form.token.value.trim(),
  };
  if (!payload.owner || !payload.repo || !payload.branch || !payload.path || !payload.token) {
    showToast('Complete all GitHub fields.', 'warn');
    return;
  }
  state.githubSettings = payload;
  localStorage.setItem(STORAGE_KEYS.github, JSON.stringify(payload));
  saveToGithub(payload).catch((error) => {
    console.error(error);
    showToast('GitHub save failed. Check console for details.', 'error');
  });
}

async function saveToGithub(settings) {
  const { owner, repo, branch, path, token, message } = settings;
  showToast('Saving to GitHub…');
  const configForSave = deepClone(state.config);
  configForSave.prefill = { ...state.plan.days };
  configForSave.meta = configForSave.meta || {};
  configForSave.meta.activeGuides = Array.from(state.activeGuides);
  const content = JSON.stringify(configForSave, null, 2);
  const encodedContent = base64Encode(content);

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
  };

  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const getResponse = await fetch(getUrl, { headers });
  let sha = undefined;
  if (getResponse.status === 200) {
    const json = await getResponse.json();
    sha = json.sha;
  } else if (getResponse.status !== 404) {
    const errorText = await getResponse.text();
    throw new Error(`Unable to read target file: ${errorText}`);
  }

  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message,
    content: encodedContent,
    branch,
  };
  if (sha) body.sha = sha;

  const putResponse = await fetch(putUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!putResponse.ok) {
    const errorText = await putResponse.text();
    throw new Error(`GitHub write failed: ${errorText}`);
  }
  closeGithubModal();
  showToast('Trip saved to GitHub.');
}

function sharePlan() {
  const data = {
    version: state.config.version,
    title: state.config.meta?.title,
    dates: state.config.meta?.dates,
    base: state.config.meta?.baseLocation,
    plan: state.plan.days,
    guides: Array.from(state.activeGuides),
  };
  const encoded = encodeShareData(data);
  const shareUrl = `${location.origin}${location.pathname}${SHARE_PREFIX}${encoded}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Share link copied to clipboard.');
    });
  } else {
    showToast('Share link ready. Copy from address bar.');
  }
  history.replaceState(null, '', shareUrl);
}

function applyShareHash() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  try {
    const encoded = location.hash.slice(SHARE_PREFIX.length);
    const payload = decodeShareData(encoded);
    if (payload.plan) {
      state.plan.days = buildPlanFromSources(state.config.prefill, payload.plan);
    }
    if (payload.guides) {
      state.activeGuides = new Set(payload.guides);
    }
    state.shareMode = true;
    state.readOnly = true;
    state.editing = false;
    updateToolbar();
    showToast('Read-only share view loaded.');
  } catch (error) {
    console.error('Invalid share payload', error);
    showToast('Invalid share link.', 'error');
    location.hash = '';
  }
}

function exitShareMode() {
  location.hash = '';
  window.location.reload();
}

function encodeShareData(data) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeShareData(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function loadGithubSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.github);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to parse GitHub settings', error);
    return null;
  }
}

function randomPastel() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 70% 88%)`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeArraysById(base, override) {
  const map = new Map(base.map((item) => [item.id, item]));
  override.forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values());
}

function haversine(from, to) {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
