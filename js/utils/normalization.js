// js/utils/normalization.js
// Utility helpers for normalizing dataset counts and deriving risk levels

export function minMaxNormalize(value, min, max) {
  if (min === max) return 0;
  let scaled = ((value - min) / (max - min)) * 100;
  if (scaled < 0) scaled = 0;
  if (scaled > 100) scaled = 100;
  return scaled;
}

export function normalizeDatasetCounts(gridCells) {
  const metrics = ["calls911", "requests311", "violations", "vacant"];
  const mins = {};
  const maxs = {};

  // initialize
  metrics.forEach((m) => {
    mins[m] = Infinity;
    maxs[m] = -Infinity;
  });

  // compute global min/max
  gridCells.forEach((cell) => {
    const counts = cell.counts || {};
    metrics.forEach((m) => {
      const v = Number(counts[m]) || 0;
      if (v < mins[m]) mins[m] = v;
      if (v > maxs[m]) maxs[m] = v;
    });
  });

  // return new array with normalized values
  return gridCells.map((cell) => {
    const counts = cell.counts || {};
    const normalized = {};
    metrics.forEach((m) => {
      const v = Number(counts[m]) || 0;
      normalized[m] = minMaxNormalize(v, mins[m], maxs[m]);
    });
    return { ...cell, normalized };
  });
}

export function getRiskLevel(score) {
  const s = Number(score);
  if (s <= 33) return { label: "Low", color: "#3FB27F" };
  if (s <= 66) return { label: "Moderate", color: "#F4B942" };
  return { label: "Emerging", color: "#E55353" };
}
