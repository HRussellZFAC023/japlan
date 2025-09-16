const TRIP_SOURCE = new URL('../data/trip.json', import.meta.url);

export async function fetchTripDefinition() {
  const response = await fetch(TRIP_SOURCE, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load trip definition: ${response.status}`);
  }
  const data = await response.json();
  return normaliseTripDefinition(data);
}

export function buildStorageKey(definition) {
  const base = definition?.storage?.baseKey || 'jp-canvas6';
  const schema = definition?.storage?.schema || definition?.version || 1;
  return `${base}-v${schema}`;
}

export function encodeBase64(input) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function saveTripDefinitionToGitHub({
  token,
  owner,
  repo,
  branch = 'main',
  path = 'data/trip.json',
  message = 'Update trip definition',
  content,
}) {
  if (!token || !owner || !repo) {
    throw new Error('Missing GitHub credentials.');
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  let sha;
  const getUrl = new URL(apiBase);
  if (branch) {
    getUrl.searchParams.set('ref', branch);
  }
  const existing = await fetch(getUrl, { headers });
  if (existing.status === 200) {
    const json = await existing.json();
    sha = json.sha;
  } else if (existing.status !== 404) {
    const errText = await existing.text();
    throw new Error(`Unable to read ${path}: ${errText}`);
  }

  const body = {
    message,
    content: encodeBase64(content),
    branch,
  };
  if (sha) body.sha = sha;

  const putResponse = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!putResponse.ok) {
    const errText = await putResponse.text();
    throw new Error(`GitHub update failed: ${errText}`);
  }

  return putResponse.json();
}

function normaliseTripDefinition(definition = {}) {
  const result = { ...definition };
  result.people = Array.isArray(definition.people) ? definition.people.map((person) => ({ ...person })) : [];
  result.locations = Array.isArray(definition.locations)
    ? definition.locations.map((loc) => ({ ...loc }))
    : [];
  result.catalog = {
    activity: Array.isArray(definition.catalog?.activity) ? definition.catalog.activity.map((item) => ({ ...item })) : [],
    stay: Array.isArray(definition.catalog?.stay) ? definition.catalog.stay.map((item) => ({ ...item })) : [],
    booking: Array.isArray(definition.catalog?.booking) ? definition.catalog.booking.map((item) => ({ ...item })) : [],
    guide: Array.isArray(definition.catalog?.guide) ? definition.catalog.guide.map((item) => ({ ...item })) : [],
  };
  result.coordinates = { ...(definition.coordinates || {}) };
  result.themes = { ...(definition.themes || {}) };
  result.defaults = { ...(definition.defaults || {}) };
  result.trip = {
    title: definition.trip?.title || 'Trip plan',
    range: {
      start: definition.trip?.range?.start || new Date().toISOString().slice(0, 10),
      end: definition.trip?.range?.end || new Date().toISOString().slice(0, 10),
    },
    baseLocation: definition.trip?.baseLocation || result.locations?.[0]?.id || null,
  };
  result.storage = {
    baseKey: definition.storage?.baseKey || 'jp-canvas6',
    schema: definition.storage?.schema || definition.version || 1,
  };
  result.version = definition.version || result.storage.schema || 1;
  result.constraints = definition.constraints ? { ...definition.constraints } : {};
  return result;
}
