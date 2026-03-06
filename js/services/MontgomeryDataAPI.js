// js/services/MontgomeryDataAPI.js - Browser-side ArcGIS REST client with viewport + optional time filtering, paging caps, and short caching.

export class MontgomeryDataAPI {
  constructor() {
    this.pageSize = 1000;
    this.maxPages = 3;
    this.cache = new Map();
    this.cacheTtlMs = 60 * 1000;

    this.datasets = {
      calls911: {
        label: "911 Calls",
        layerUrl:
          "https://services7.arcgis.com/xNUwUjOJqYE54USz/arcgis/rest/services/911_Calls_Data/FeatureServer/0",
        dateFieldCandidates: ["date", "timestamp", "call_datetime", "created_date"],
      },
      requests311: {
        label: "311 Service Requests",
        layerUrl:
          "https://gis.montgomeryal.gov/server/rest/services/HostedDatasets/Received_311_Service_Request/MapServer/0",
        dateFieldCandidates: ["date", "timestamp", "request_date", "created_date"],
      },
      violations: {
        label: "Code Violations",
        layerUrl:
          "https://gis.montgomeryal.gov/server/rest/services/HostedDatasets/Code_Violations/MapServer/0",
        dateFieldCandidates: ["date", "timestamp", "violation_date", "created_date"],
      },
      vacant: {
        label: "Vacant Properties",
        layerUrl:
          "https://services7.arcgis.com/xNUwUjOJqYE54USz/ArcGIS/rest/services/Vacant_Properties/FeatureServer/2",
        dateFieldCandidates: ["date", "timestamp", "created_date"],
      },
    };
  }

  async getAllDatasets({ bounds, days = 30 }) {
    const keys = Object.keys(this.datasets);

    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const def = this.datasets[key];
        if (!def.layerUrl) return { key, features: [] };

        const features = await this._fetchAllFeatures({
          cacheKey: `${key}:${days}:${this._boundsKey(bounds)}`,
          layerUrl: def.layerUrl,
          bounds,
          days,
          dateFieldCandidates: def.dateFieldCandidates,
        });

        return { key, features };
      })
    );

    const out = { calls911: [], requests311: [], violations: [], vacant: [] };

    for (const r of results) {
      if (r.status === "fulfilled") out[r.value.key] = r.value.features || [];
    }

    return out;
  }

    async _fetchAllFeatures({ cacheKey, layerUrl, bounds, days, dateFieldCandidates }) {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.data;

    const envelope = this._buildEnvelope(bounds);

    // Hackathon-stable approach: avoid extra metadata requests that can fail intermittently.
    const where = "1=1";

    const all = [];

    for (let page = 0; page < this.maxPages; page++) {
        const resultOffset = page * this.pageSize;

        const url =
        `${layerUrl}/query?` +
        new URLSearchParams({
            where,
            outFields: "*",
            outSR: "4326",
            f: "json",
            returnGeometry: "true",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            resultRecordCount: String(this.pageSize),
            resultOffset: String(resultOffset),
        }).toString();

        const data = await this._fetchJson(url);
        const features = Array.isArray(data.features) ? data.features : [];

        all.push(...features);
        if (features.length < this.pageSize) break;
    }

    this.cache.set(cacheKey, { ts: Date.now(), data: all });
    return all;
    }

  async _tryDetectDateField(layerUrl, candidates) {
    try {
      const metaUrl = `${layerUrl}?` + new URLSearchParams({ f: "json" }).toString();
      const meta = await this._fetchJson(metaUrl);

      const fields = Array.isArray(meta.fields) ? meta.fields : [];
      const dateType = fields.find((f) => f?.type === "esriFieldTypeDate");
      if (dateType?.name) return dateType.name;

      const lower = new Map(fields.map((f) => [String(f.name).toLowerCase(), f.name]));
      for (const c of candidates) {
        const hit = lower.get(String(c).toLowerCase());
        if (hit) return hit;
      }
      return null;
    } catch {
      return null;
    }
  }

  _buildLastNDaysWhere(dateField, days) {
    const n = Math.max(1, Math.min(365, Number(days) || 30));
    return `${dateField} >= CURRENT_TIMESTAMP - INTERVAL '${n}' DAY`;
  }

  _buildEnvelope(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
  }

  _boundsKey(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return [
      sw.lat.toFixed(3),
      sw.lng.toFixed(3),
      ne.lat.toFixed(3),
      ne.lng.toFixed(3),
    ].join(",");
  }

  async _fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`API payload error: ${data.error.message || "unknown"}`);
    return data;
  }
}

export const montgomeryDataAPI = new MontgomeryDataAPI();