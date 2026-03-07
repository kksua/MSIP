// js/services/MontgomeryDataAPI.js
// Browser-side ArcGIS REST client with server-side date + layer filtering,
// pagination caps, and short-lived caching.

export class MontgomeryDataAPI {
  constructor() {
    this.pageSize   = 1000;
    this.maxPages   = 3;
    this.cache      = new Map();   // feature result cache
    this._dateFieldCache = new Map(); // layer-url → detected date field (or null)
    this.cacheTtlMs = 60 * 1000;

    // Per-dataset config.
    //   dateFieldCandidates – ordered list of field names to probe for date filtering.
    //   categoryField / categoryValues – optional; when set, appended to the WHERE clause.
    this.datasets = {
      calls911: {
        label: "911 Calls",
        layerUrl:
          "https://services7.arcgis.com/xNUwUjOJqYE54USz/arcgis/rest/services/911_Calls_Data/FeatureServer/0",
        dateFieldCandidates: ["date", "timestamp", "call_datetime", "created_date"],
        categoryField: null,
        categoryValues: null,
      },
      requests311: {
        label: "311 Service Requests",
        layerUrl:
          "https://gis.montgomeryal.gov/server/rest/services/HostedDatasets/Received_311_Service_Request/MapServer/0",
        dateFieldCandidates: ["date", "timestamp", "request_date", "created_date"],
        categoryField: null,
        categoryValues: null,
      },
      violations: {
        label: "Code Violations",
        layerUrl:
          "https://gis.montgomeryal.gov/server/rest/services/HostedDatasets/Code_Violations/MapServer/0",
        dateFieldCandidates: ["date", "timestamp", "violation_date", "created_date"],
        categoryField: null,
        categoryValues: null,
      },
      vacant: {
        label: "Vacant Properties",
        layerUrl:
          "https://services7.arcgis.com/xNUwUjOJqYE54USz/ArcGIS/rest/services/Vacant_Properties/FeatureServer/2",
        dateFieldCandidates: [],  // static dataset — no meaningful date field
        categoryField: null,
        categoryValues: null,
      },
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetch all (or a subset of) datasets in parallel.
   *
   * @param {L.LatLngBounds} bounds       – Leaflet bounds for spatial filter
   * @param {number}         days         – Time window (0 = no date filter)
   * @param {string[]|null}  enabledKeys  – Dataset keys to fetch; null = all
   */
  async getAllDatasets({ bounds, days = 30, enabledKeys = null }) {
    const allKeys      = Object.keys(this.datasets);
    const keysToFetch  = enabledKeys
      ? allKeys.filter((k) => enabledKeys.includes(k))
      : allKeys;

    const results = await Promise.allSettled(
      keysToFetch.map(async (key) => {
        const def = this.datasets[key];
        if (!def.layerUrl) return { key, features: [] };

        const features = await this._fetchAllFeatures({
          cacheKey: `${key}:${days}:${this._boundsKey(bounds)}`,
          layerUrl:             def.layerUrl,
          bounds,
          days,
          dateFieldCandidates:  def.dateFieldCandidates,
          categoryField:        def.categoryField,
          categoryValues:       def.categoryValues,
        });

        return { key, features };
      })
    );

    const out = { calls911: [], requests311: [], violations: [], vacant: [] };

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        out[r.value.key] = r.value.features || [];
      } else {
        console.warn(
          `[MontgomeryDataAPI] Dataset "${keysToFetch[i]}" failed to load:`,
          r.reason
        );
      }
    });

    console.log("[MontgomeryDataAPI] Final counts:", {
      calls911:    out.calls911.length,
      requests311: out.requests311.length,
      violations:  out.violations.length,
      vacant:      out.vacant.length,
    });

    return out;
  }

  // ─── Internal fetch + WHERE logic ──────────────────────────────────────────

  async _fetchAllFeatures({
    cacheKey,
    layerUrl,
    bounds,
    days,
    dateFieldCandidates,
    categoryField,
    categoryValues,
  }) {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.data;

    const envelope = this._buildEnvelope(bounds);

    // Build WHERE clause from enabled filters.
    const clauses = [];

    // 1. Date filter — only when days > 0 and dataset has date field candidates
    if (days > 0 && dateFieldCandidates?.length) {
      const dateField = await this._tryDetectDateField(layerUrl, dateFieldCandidates);
      if (dateField) {
        clauses.push(this._buildLastNDaysWhere(dateField, days));
        console.log(`[MontgomeryDataAPI] ${layerUrl}: date filter on "${dateField}" (last ${days} days)`);
      } else {
        console.log(`[MontgomeryDataAPI] ${layerUrl}: no date field detected — fetching all records`);
      }
    }

    // 2. Category filter — only when dataset defines a category field + values
    if (categoryField && Array.isArray(categoryValues) && categoryValues.length > 0) {
      const quoted = categoryValues.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(", ");
      clauses.push(`${categoryField} IN (${quoted})`);
      console.log(`[MontgomeryDataAPI] ${layerUrl}: category filter ${categoryField} IN (${quoted})`);
    }

    const where = clauses.length ? clauses.join(" AND ") : "1=1";

    const all = [];

    for (let page = 0; page < this.maxPages; page++) {
      const resultOffset = page * this.pageSize;

      const url =
        `${layerUrl}/query?` +
        new URLSearchParams({
          where,
          outFields:         "*",
          outSR:             "4326",
          f:                 "json",
          returnGeometry:    "true",
          geometry:          envelope,
          geometryType:      "esriGeometryEnvelope",
          inSR:              "4326",
          spatialRel:        "esriSpatialRelIntersects",
          resultRecordCount: String(this.pageSize),
          resultOffset:      String(resultOffset),
        }).toString();

      const data     = await this._fetchJson(url);
      const features = Array.isArray(data.features) ? data.features : [];

      console.log(
        `[MontgomeryDataAPI] Fetched ${features.length} features from ${layerUrl} (page ${page + 1}/${this.maxPages}, where: ${where})`
      );
      all.push(...features);
      if (features.length < this.pageSize) break;
    }

    this.cache.set(cacheKey, { ts: Date.now(), data: all });
    return all;
  }

  // ─── Date field detection (cached per layer URL) ───────────────────────────

  async _tryDetectDateField(layerUrl, candidates) {
    if (this._dateFieldCache.has(layerUrl)) {
      return this._dateFieldCache.get(layerUrl);
    }

    let result = null;
    try {
      const metaUrl = `${layerUrl}?` + new URLSearchParams({ f: "json" }).toString();
      const meta    = await this._fetchJson(metaUrl);
      const fields  = Array.isArray(meta.fields) ? meta.fields : [];

      // Prefer a field typed as esriFieldTypeDate
      const dateTyped = fields.find((f) => f?.type === "esriFieldTypeDate");
      if (dateTyped?.name) {
        result = dateTyped.name;
      } else {
        // Fall back to candidate name matching (case-insensitive)
        const lower = new Map(fields.map((f) => [String(f.name).toLowerCase(), f.name]));
        for (const c of candidates) {
          const hit = lower.get(String(c).toLowerCase());
          if (hit) { result = hit; break; }
        }
      }
    } catch {
      result = null;
    }

    this._dateFieldCache.set(layerUrl, result);
    return result;
  }

  // ─── WHERE clause builders ─────────────────────────────────────────────────

  _buildLastNDaysWhere(dateField, days) {
    const n      = Math.max(1, Math.min(365, Number(days) || 30));
    const cutoff = new Date(Date.now() - n * 86400000);
    const ts     = cutoff.toISOString().replace("T", " ").substring(0, 19);
    return `${dateField} >= timestamp '${ts}'`;
  }

  // ─── Spatial helpers ───────────────────────────────────────────────────────

  _buildEnvelope(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
  }

  _boundsKey(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return [sw.lat.toFixed(3), sw.lng.toFixed(3), ne.lat.toFixed(3), ne.lng.toFixed(3)].join(",");
  }

  // ─── HTTP ──────────────────────────────────────────────────────────────────

  async _fetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(`ArcGIS error: ${data.error.message || JSON.stringify(data.error)}`);
      return data;
    } catch (err) {
      console.error(`[MontgomeryDataAPI] fetch failed: ${url}`, err);
      throw err;
    }
  }
}

export const montgomeryDataAPI = new MontgomeryDataAPI();
