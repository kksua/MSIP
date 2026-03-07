// js/utils/dataProcessor.js
// Pure-JS data processing for hex grid aggregation

// generate a flat-top hex grid within given bounds
export function generateHexGrid(bounds, cellSize = 0.003) {
  const { south, north, west, east } = bounds;
  const r = cellSize;
  const width = 2 * r;
  const height = Math.sqrt(3) * r;
  const horiz = 1.5 * r;
  const vert = height;

  const cells = [];
  let idCounter = 0;

  // compute column range
  for (let x = west; x <= east + width; x += horiz) {
    const col = Math.round((x - west) / horiz);
    // offset every other column
    const yStart = south + (col % 2 === 0 ? 0 : vert / 2);
    for (let y = yStart; y <= north + vert; y += vert) {
      const center = [y, x];
      const vertices = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i);
        const dx = r * Math.cos(angle);
        const dy = r * Math.sin(angle);
        // note: dx is lon offset, dy lat offset
        vertices.push([center[0] + dy, center[1] + dx]);
      }
      cells.push({
        id: `h${idCounter++}`,
        center,
        vertices,
      });
    }
  }
  return cells;
}

function distanceSquared(a, b) {
  const dlat = a[0] - b[0];
  const dlng = a[1] - b[1];
  return dlat * dlat + dlng * dlng;
}

// Returns [lat, lng] for point, polygon (centroid), or attribute-based coords.
function getFeatureCoords(feat) {
  const g = feat.geometry;

  // Point { x, y }
  if (g && typeof g.x === 'number' && typeof g.y === 'number') {
    return [g.y, g.x];
  }

  // Polygon — centroid of outer ring
  if (g && Array.isArray(g.rings) && g.rings[0]?.length) {
    const ring = g.rings[0];
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    return [lat, lng];
  }

  // Fallback: lat/lng stored as attribute fields (e.g. 911 datasets from CSVs)
  const attrs = feat.attributes;
  if (attrs && typeof attrs === 'object') {
    const lower = {};
    for (const k of Object.keys(attrs)) lower[k.toLowerCase()] = attrs[k];
    const LAT_KEYS = ['latitude', 'lat', 'y_lat', 'y_coord'];
    const LNG_KEYS = ['longitude', 'lon', 'lng', 'long', 'x_lon', 'x_coord'];
    let lat = null, lng = null;
    for (const f of LAT_KEYS) { if (typeof lower[f] === 'number') { lat = lower[f]; break; } }
    for (const f of LNG_KEYS) { if (typeof lower[f] === 'number') { lng = lower[f]; break; } }
    if (lat !== null && lng !== null) return [lat, lng];
  }

  return null;
}

export function assignFeaturesToGrid(features, hexGrid) {
  const map = new Map();
  // initialize map entries
  hexGrid.forEach((hex) => {
    map.set(hex.id, {
      hex,
      features: [],
      counts: { calls911: 0, requests311: 0, violations: 0, vacant: 0 },
    });
  });

  features.forEach((feat) => {
    const pt = getFeatureCoords(feat);
    if (!pt) return; // skip features with unresolvable geometry
    let best = null;
    let bestDist = Infinity;
    hexGrid.forEach((hex) => {
      const d = distanceSquared(pt, hex.center);
      if (d < bestDist) {
        bestDist = d;
        best = hex;
      }
    });
    if (best) {
      const entry = map.get(best.id);
      if (entry) {
        entry.features.push(feat);
      }
    }
  });

  return map;
}

export function aggregateByDataset(gridAssignments, datasetKey) {
  gridAssignments.forEach((entry) => {
    const list = entry.features || [];
    list.forEach(() => {
      if (entry.counts && entry.counts.hasOwnProperty(datasetKey)) {
        entry.counts[datasetKey]++;
      }
    });
  });
}

export function buildGridSummary(hexGrid, allDatasets) {
  const map = new Map();
  // create blank assignments (we'll reuse assignFeaturesToGrid by concatenating all features later)
  // but to cope with separate datasets we first assign each dataset separately
  const keys = Object.keys(allDatasets);
  keys.forEach((k) => {
    const features = allDatasets[k] || [];
    const partial = assignFeaturesToGrid(features, hexGrid);
    // merge partial into map
    partial.forEach((entry, hexId) => {
      if (!map.has(hexId)) {
        map.set(hexId, {
          hex: entry.hex,
          features: [],
          counts: { calls911: 0, requests311: 0, violations: 0, vacant: 0 },
        });
      }
      const target = map.get(hexId);
      target.features = target.features.concat(entry.features);
      // increment counts
      if (target.counts && target.counts.hasOwnProperty(k)) {
        target.counts[k] += entry.features.length;
      }
    });
  });

  const summary = [];
  map.forEach((entry, hexId) => {
    const counts = entry.counts;
    const totalIncidents =
      counts.calls911 + counts.requests311 + counts.violations + counts.vacant;
    summary.push({
      hexId,
      center: entry.hex.center,
      vertices: entry.hex.vertices,
      counts: { ...counts },
      totalIncidents,
    });
  });

  return summary;
}
