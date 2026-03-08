const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 90_000;

const MAX_HEADLINES = 5;
const CLIENT_CACHE_TTL = 10 * 60 * 1000;

const clientCache = new Map();

export async function fetchLocalNewsForCell(lat, lng, options = {}) {
  const { signal } = options;

  const label = await reverseGeocode(lat, lng, signal);
  const cacheKey = label ? `label:${label}` : `${lat.toFixed(4)},${lng.toFixed(4)}`;

  const hit = clientCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.records;

  const queries = buildQueries(label);
  const triggerPayload = await triggerNews(queries, signal);

  let records;
  if (triggerPayload.records) {
    records = triggerPayload.records;
  } else if (triggerPayload.snapshotId) {
    records = await pollSnapshot(triggerPayload.snapshotId, signal);
  } else {
    records = [];
  }

  const headlines = selectTopHeadlines(records);

  clientCache.set(cacheKey, {
    records: headlines,
    expiresAt: Date.now() + CLIENT_CACHE_TTL,
  });

  return headlines;
}

async function reverseGeocode(lat, lng, signal) {
  try {
    const res = await fetch(
      `/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      { signal }
    );

    if (!res.ok) return '';

    const { label } = await res.json().catch(() => ({}));
    return typeof label === 'string' ? label.trim() : '';
  } catch {
    return '';
  }
}

function buildQueries(label) {
  const city = 'Montgomery AL';
  const local = label ? `${label} ${city}` : city;

  return [
    `${local} public hearing`,
    `${city} police investigation`,
    `${city} crime`,
  ];
}

async function triggerNews(queries, signal) {
  const res = await fetch('/api/news/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries,
      country: 'US',
      language: 'en',
    }),
    signal,
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      payload?.detail
        ? `${payload.error ?? res.status}: ${payload.detail}`
        : payload?.error ?? String(res.status);

    throw new Error(`News trigger failed: ${message}`);
  }

  return payload;
}

async function pollSnapshot(snapshotId, signal) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    if (signal?.aborted) {
      throw new DOMException('Cancelled', 'AbortError');
    }

    const res = await fetch(
      `/api/news/snapshot?id=${encodeURIComponent(snapshotId)}`,
      { signal }
    );

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message =
        payload?.detail
          ? `${payload.error ?? res.status}: ${payload.detail}`
          : payload?.error ?? String(res.status);

      throw new Error(`Snapshot poll failed: ${message}`);
    }

    if (payload.records) return payload.records;
    if (payload.status === 'failed') return [];
  }

  return [];
}

function selectTopHeadlines(records) {
  const now = Date.now();
  const cutoff30d = now - 30 * 24 * 60 * 60 * 1000;
  const cutoff365d = now - 365 * 24 * 60 * 60 * 1000;

  const seen = new Set();
  const unique = (records || []).filter((x) => {
    const u = x?.url;
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  function ts(item) {
    if (!item?.publishedAt) return null;
    const t = new Date(item.publishedAt).getTime();
    return Number.isFinite(t) ? t : null;
  }

  const within30 = unique.filter((x) => {
    const t = ts(x);
    return t != null && t >= cutoff30d;
  });

  if (within30.length > 0) {
    within30.sort((a, b) => (ts(b) ?? 0) - (ts(a) ?? 0));
    return within30.slice(0, MAX_HEADLINES);
  }

  const within365 = unique.filter((x) => {
    const t = ts(x);
    return t != null && t >= cutoff365d;
  });

  within365.sort((a, b) => (ts(b) ?? 0) - (ts(a) ?? 0));
  return within365.slice(0, MAX_HEADLINES);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}