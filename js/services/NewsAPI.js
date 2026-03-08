/**
 * Service de récupération d'actualités locales.
 *
 * Stratégie:
 * 1. Tenter l'API live
 * 2. Attendre au maximum 60 secondes
 * 3. Si aucun résultat exploitable n'est trouvé, basculer vers Supabase
 * 4. Sélectionner les meilleurs titres récents
 */

const POLL_INTERVAL_MS = 4000;
const LIVE_FETCH_TIMEOUT_MS = 60_000;

const MAX_HEADLINES = 5;
const CLIENT_CACHE_TTL = 10 * 60 * 1000;

const clientCache = new Map();

export async function fetchLocalNewsForCell(lat, lng, options = {}) {
  const { signal } = options;

  const label = await reverseGeocode(lat, lng, signal);
  const cacheKey = label ? `label:${label}` : `${lat.toFixed(4)},${lng.toFixed(4)}`;

  const hit = clientCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.records;
  }

  const queries = buildQueries(label);

  let liveRecords = [];

  try {
    liveRecords = await fetchLiveNewsWithTimeout(queries, signal, LIVE_FETCH_TIMEOUT_MS);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw err;
    }
  }

  let headlines = selectTopHeadlines(liveRecords);

  /**
   * Si l'API live ne retourne rien d'utile après 1 minute,
   * on bascule vers Supabase avec une requête plus robuste.
   */
  if (headlines.length === 0) {
    const fallbackQueries = buildFallbackQueries(label);
    const fallbackRecords = await fetchSupabaseFallback(fallbackQueries, signal);
    headlines = selectTopHeadlines(fallbackRecords);
  }

  clientCache.set(cacheKey, {
    records: headlines,
    expiresAt: Date.now() + CLIENT_CACHE_TTL,
  });

  return headlines;
}

async function fetchLiveNewsWithTimeout(queries, signal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = createCombinedSignal(signal, controller.signal);

  try {
    const triggerPayload = await triggerNews(queries, combinedSignal);

    if (triggerPayload.records) {
      return Array.isArray(triggerPayload.records) ? triggerPayload.records : [];
    }

    if (triggerPayload.snapshotId) {
      return await pollSnapshot(triggerPayload.snapshotId, combinedSignal, timeoutMs);
    }

    return [];
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      return [];
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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

function buildFallbackQueries(label) {
  const city = 'Montgomery AL';
  const local = label ? `${label} ${city}` : city;

  /**
   * Requêtes de secours plus ciblées sur des mots-clés susceptibles
   * d'exister dans la base Supabase.
   */
  return [
    `${local} crime`,
    `${city} crime`,
    `${city} shooting`,
    `${city} investigation`,
  ];
}

async function fetchSupabaseFallback(queries, signal) {
  try {
    const params = new URLSearchParams();

    queries.forEach((q) => {
      if (q && q.trim()) params.append('queries', q.trim());
    });

    const res = await fetch(`/api/news/fallback?${params.toString()}`, { signal });

    if (!res.ok) {
      return [];
    }

    const { records } = await res.json().catch(() => ({}));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
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

async function pollSnapshot(snapshotId, signal, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

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

    if (Array.isArray(payload.records)) {
      return payload.records;
    }

    if (payload.status === 'failed') {
      return [];
    }
  }

  return [];
}

function selectTopHeadlines(records) {
  const now = Date.now();
  const cutoff30d = now - 30 * 24 * 60 * 60 * 1000;
  const cutoff365d = now - 365 * 24 * 60 * 60 * 1000;

  const seen = new Set();
  const unique = (records || []).filter((item) => {
    const url = item?.url;
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  function getTimestamp(item) {
    if (!item?.publishedAt) return null;
    const value = new Date(item.publishedAt).getTime();
    return Number.isFinite(value) ? value : null;
  }

  const within30Days = unique.filter((item) => {
    const timestamp = getTimestamp(item);
    return timestamp != null && timestamp >= cutoff30d;
  });

  if (within30Days.length > 0) {
    within30Days.sort((a, b) => (getTimestamp(b) ?? 0) - (getTimestamp(a) ?? 0));
    return within30Days.slice(0, MAX_HEADLINES);
  }

  const within365Days = unique.filter((item) => {
    const timestamp = getTimestamp(item);
    return timestamp != null && timestamp >= cutoff365d;
  });

  within365Days.sort((a, b) => (getTimestamp(b) ?? 0) - (getTimestamp(a) ?? 0));
  return within365Days.slice(0, MAX_HEADLINES);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCombinedSignal(...signals) {
  const validSignals = signals.filter(Boolean);

  if (validSignals.length === 0) return undefined;
  if (validSignals.length === 1) return validSignals[0];

  const controller = new AbortController();

  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
}