/**
 * Main Application Entry Point
 * Initializes all components and orchestrates app flow
 */

import { montgomeryDataAPI } from "./services/MontgomeryDataAPI.js";

const MONTGOMERY_COORDS = [32.3668, -86.3000];
const INITIAL_ZOOM = 12;

let mapInstance = null;
let dataLayers = {};
let isLoading = false;

const DEFAULT_DAYS = 30;

document.addEventListener("DOMContentLoaded", () => {
  initializeMap();
  refreshDatasets();
});

function initializeMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement) {
    console.error("Map container #map was not found.");
    return;
  }

  mapInstance = L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: true,
    preferCanvas: true,
  }).setView(MONTGOMERY_COORDS, INITIAL_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
    crossOrigin: true,
  }).addTo(mapInstance);

  const debounced = debounce(refreshDatasets, 450);
  mapInstance.on("moveend", debounced);

  window.addEventListener("resize", () => mapInstance.invalidateSize());
  setTimeout(() => mapInstance.invalidateSize(), 150);
}

async function refreshDatasets() {
  if (!mapInstance || isLoading) return;

  isLoading = true;
  try {
    clearAllLayers();

    const bounds = mapInstance.getBounds();
    console.log("Loading datasets (viewport + recent window)...");

    const datasets = await montgomeryDataAPI.getAllDatasets({
      bounds,
      days: DEFAULT_DAYS,
    });

    drawDataset(datasets.calls911, "911 Calls", "#dc3545", "calls911");
    drawDataset(
      datasets.requests311,
      "311 Service Requests",
      "#ff9800",
      "requests311"
    );
    drawDataset(datasets.violations, "Code Violations", "#ffc107", "violations");
    drawDataset(datasets.vacant, "Vacant Properties", "#6c757d", "vacant");

    console.log("Datasets loaded and displayed");
  } catch (e) {
    console.error("Dataset load failed:", e);
  } finally {
    isLoading = false;
  }
}

function drawDataset(features, label, color, layerId) {
  if (!features || features.length === 0) return;

  const featureGroup = L.featureGroup();

  for (const feature of features) {
    const g = feature.geometry;
    if (!g) continue;

    let layer = null;

    if (typeof g.x === "number" && typeof g.y === "number") {
      layer = L.circleMarker([g.y, g.x], {
        radius: 4,
        fillColor: color,
        color,
        weight: 1,
        opacity: 0.7,
        fillOpacity: 0.55,
      });
    }

    if (!layer && Array.isArray(g.rings) && g.rings[0]) {
      const rings = g.rings[0].map((coord) => [coord[1], coord[0]]);
      layer = L.polygon(rings, {
        color,
        weight: 2,
        opacity: 0.6,
        fillOpacity: 0.25,
      });
    }

    if (!layer && Array.isArray(g.paths) && g.paths[0]) {
      const paths = g.paths[0].map((coord) => [coord[1], coord[0]]);
      layer = L.polyline(paths, { color, weight: 2, opacity: 0.6 });
    }

    if (!layer) continue;

    const attrs = feature.attributes || {};
    let popup = `<strong>${escapeHtml(label)}</strong><br/>`;

    const entries = Object.entries(attrs).slice(0, 3);
    for (const [k, v] of entries) {
      if (v === null || v === undefined) continue;
      popup += `${escapeHtml(String(k))}: ${escapeHtml(String(v))}<br/>`;
    }

    layer.bindPopup(popup);
    featureGroup.addLayer(layer);
  }

  featureGroup.addTo(mapInstance);
  dataLayers[layerId] = featureGroup;
  console.log(`Displayed ${features.length} ${label}`);
}

function clearAllLayers() {
  for (const layer of Object.values(dataLayers)) {
    try {
      layer.remove();
    } catch {}
  }
  dataLayers = {};
}

function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), waitMs);
  };
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}