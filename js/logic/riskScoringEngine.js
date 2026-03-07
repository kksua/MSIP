// js/logic/riskScoringEngine.js
// Computes risk scores for hex grid cells

import { minMaxNormalize } from '../utils/normalization.js';

const WEIGHTS = {
  calls911: 0.35,
  requests311: 0.30,
  violations: 0.20,
  vacant: 0.15,
};

function getLevelColor(score) {
  if (score <= 33) return { level: 'Low', color: '#3FB27F' };
  if (score <= 66) return { level: 'Moderate', color: '#F4B942' };
  return { level: 'Emerging', color: '#E55353' };
}

export function computeRiskScores(gridSummary) {
  // compute global min/max for each metric
  const mins = { calls911: Infinity, requests311: Infinity, violations: Infinity, vacant: Infinity };
  const maxs = { calls911: -Infinity, requests311: -Infinity, violations: -Infinity, vacant: -Infinity };
  gridSummary.forEach((cell) => {
    const c = cell.counts || {};
    Object.keys(mins).forEach((m) => {
      const v = Number(c[m]) || 0;
      if (v < mins[m]) mins[m] = v;
      if (v > maxs[m]) maxs[m] = v;
    });
  });

  return gridSummary.map((cell) => {
    const c = cell.counts || {};
    const normalized = {};
    Object.keys(WEIGHTS).forEach((m) => {
      normalized[m] = minMaxNormalize(Number(c[m]) || 0, mins[m], maxs[m]);
    });

    const rawScore =
      WEIGHTS.calls911 * normalized.calls911 +
      WEIGHTS.requests311 * normalized.requests311 +
      WEIGHTS.violations * normalized.violations +
      WEIGHTS.vacant * normalized.vacant;
    const riskScore = Math.round(rawScore * 10) / 10;
    const { level: riskLevel, color: riskColor } = getLevelColor(riskScore);

    return { ...cell, riskScore, riskLevel, riskColor, normalized };
  });
}

export function getScoreBreakdown(cell) {
  const score = cell.riskScore;
  const level = cell.riskLevel;
  const color = cell.riskColor;
  const normalized = cell.normalized || {};
  const counts = cell.counts || {};

  const breakdown = {
    '911 Calls': {
      raw: counts.calls911 || 0,
      normalized: normalized.calls911 || 0,
      weighted: Math.round((normalized.calls911 || 0) * WEIGHTS.calls911 * 10) / 10,
    },
    '311 Complaints': {
      raw: counts.requests311 || 0,
      normalized: normalized.requests311 || 0,
      weighted: Math.round((normalized.requests311 || 0) * WEIGHTS.requests311 * 10) / 10,
    },
    'Code Violations': {
      raw: counts.violations || 0,
      normalized: normalized.violations || 0,
      weighted: Math.round((normalized.violations || 0) * WEIGHTS.violations * 10) / 10,
    },
    'Vacant Properties': {
      raw: counts.vacant || 0,
      normalized: normalized.vacant || 0,
      weighted: Math.round((normalized.vacant || 0) * WEIGHTS.vacant * 10) / 10,
    },
  };

  return { score, level, color, breakdown };
}
