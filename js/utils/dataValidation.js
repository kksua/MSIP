// js/utils/dataValidation.js
// Validation helpers for geographic features and attributes

// bounding box for greater Montgomery, AL
const LAT_MIN = 32.0;
const LAT_MAX = 33.0;
const LNG_MIN = -87.0;
const LNG_MAX = -85.5;

// Common attribute field names used when coordinates are stored as attributes
// instead of proper geometry (e.g. 911 datasets imported from CSVs).
const LAT_ATTR_KEYS = ['latitude', 'lat', 'y_lat', 'y_coord'];
const LNG_ATTR_KEYS = ['longitude', 'lon', 'lng', 'long', 'x_lon', 'x_coord'];

// Extract [lat, lng] from feature attributes when geometry is absent.
export function coordFromAttrs(attrs) {
  if (!attrs || typeof attrs !== 'object') return null;
  const lower = {};
  for (const k of Object.keys(attrs)) lower[k.toLowerCase()] = attrs[k];
  let lat = null, lng = null;
  for (const f of LAT_ATTR_KEYS) { if (typeof lower[f] === 'number') { lat = lower[f]; break; } }
  for (const f of LNG_ATTR_KEYS) { if (typeof lower[f] === 'number') { lng = lower[f]; break; } }
  if (lat !== null && lng !== null) return [lat, lng];
  return null;
}

export function isValidCoordinate(lat, lng) {
  if (lat == null || lng == null) return false;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  return lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;
}

export function isValidFeature(feature) {
  if (!feature) return false;
  const g = feature.geometry;

  // Point geometry { x, y }
  if (g && typeof g.x === 'number' && typeof g.y === 'number') {
    return isValidCoordinate(g.y, g.x);
  }

  // Polygon geometry { rings: [[[lng, lat], ...], ...] }
  if (g && Array.isArray(g.rings) && g.rings.length > 0 && g.rings[0].length > 0) {
    const ring = g.rings[0];
    const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return isValidCoordinate(lat, lng);
  }

  // Fallback: coordinates stored as attribute fields (common in 911 datasets)
  const coords = coordFromAttrs(feature.attributes);
  if (coords) return isValidCoordinate(coords[0], coords[1]);

  return false;
}

export function sanitizeAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object') return {};
  const clean = {};
  const keys = Object.keys(attributes).slice(0, 10);
  keys.forEach((k) => {
    let v = attributes[k];
    if (v === null || v === undefined) {
      v = 'N/A';
    } else if (typeof v === 'string') {
      v = v.trim();
      if (v === '') v = 'N/A';
    }
    clean[k] = v;
  });
  return clean;
}
