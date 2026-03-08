/**
 * Main Application Entry Point
 * Initializes all components and orchestrates app flow
 */

import { montgomeryDataAPI } from "./services/MontgomeryDataAPI.js";
import { geminiAPI } from "./services/GeminiAPI.js";
import { fetchLocalNewsForCell } from "./services/NewsAPI.js";
import { generateHexGrid, buildGridSummary } from "./utils/dataProcessor.js";
import { computeRiskScores, getScoreBreakdown } from "./logic/riskScoringEngine.js";
import { getRiskLevel } from "./utils/normalization.js";
import { isValidFeature } from "./utils/dataValidation.js";

// Global variables
let map;
let hexLayerGroup;
let currentBounds;
let currentDays = 30;
let currentLayers = {
  calls911: true,
  requests311: true,
  violations: true,
  vacant: true,
};
let debounceTimer;
let selectedHexId = null;
let selectedCellData = null;

// News state
let newsAbortController = null; // cancelled when user picks a different cell
let newsFetchTimer = null;       // 400 ms debounce before firing the news fetch
let currentNewsContext = null;   // last fetched headlines as plain text, fed to Gemini

// Viewport / API fetch bounds — wider area so pan still loads data
const MONTGOMERY_BOUNDS = L.latLngBounds([[32.2, -86.5], [32.5, -86.1]]);

// Hex grid bounds — tight Montgomery city limits only
const HEX_GRID_BOUNDS = {
  south: 32.28,
  north: 32.46,
  west: -86.44,
  east: -86.15,
};

const HEX_CELL_SIZE = 0.005;

// Debounce function
function debounce(func, delay) {
  return function (...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}

function setAIInsightState({ text = "", loading = false, error = false } = {}) {
  const aiText = document.getElementById("ai-insight-text");
  const aiButton = document.getElementById("ai-insight-btn");

  if (aiText) {
    aiText.textContent = text;
    aiText.style.marginTop = "12px";
    aiText.style.whiteSpace = "pre-wrap";
    aiText.style.color = error ? "#b42318" : "#102033";
  }

  if (aiButton) {
    aiButton.disabled = loading || !selectedCellData;
    aiButton.textContent = loading ? "Generating Insight..." : "Explain This Area";
  }
}

function buildGeminiCellData(cell) {
  const centerLat = Array.isArray(cell?.center) ? Number(cell.center[0]) : Number(cell?.center?.lat ?? 0);
  const centerLng = Array.isArray(cell?.center) ? Number(cell.center[1]) : Number(cell?.center?.lng ?? 0);

  const counts = {
    calls911: Number(
      cell?.counts?.calls911 ??
      cell?.counts?.["911 Calls"] ??
      cell?.calls911Count ??
      0
    ),
    requests311: Number(
      cell?.counts?.requests311 ??
      cell?.counts?.["311 Complaints"] ??
      cell?.requests311Count ??
      0
    ),
    violations: Number(
      cell?.counts?.violations ??
      cell?.counts?.["Code Violations"] ??
      cell?.violationsCount ??
      0
    ),
    vacant: Number(
      cell?.counts?.vacant ??
      cell?.counts?.["Vacant Properties"] ??
      cell?.vacantCount ??
      0
    ),
  };

  return {
    riskScore: Number(cell?.riskScore ?? 0),
    riskLevel: getRiskLevel(Number(cell?.riskScore ?? 0)).label,
    counts,
    center: {
      lat: centerLat,
      lng: centerLng,
    },
    periodDays: currentDays,
  };
}

async function handleExplainArea() {
  if (!selectedCellData) return;

  setAIInsightState({
    text: "Analyzing this area...",
    loading: true,
    error: false,
  });

  try {
    const insight = await geminiAPI.generateInsight(selectedCellData, currentNewsContext);
    const isErrorMessage =
      typeof insight === "string" &&
      (insight.includes("temporarily unavailable") ||
        insight.includes("Please wait a moment"));

    setAIInsightState({
      text: insight,
      loading: false,
      error: isErrorMessage,
    });
  } catch (error) {
    console.error("Error generating AI insight:", error);
    setAIInsightState({
      text: "AI insight is temporarily unavailable.",
      loading: false,
      error: true,
    });
  }
}

// ---------------------------------------------------------------------------
// News / Local Context
// ---------------------------------------------------------------------------

function resetNewsPanel() {
  clearTimeout(newsFetchTimer);
  if (newsAbortController) {
    newsAbortController.abort();
    newsAbortController = null;
  }
  currentNewsContext = null;
  document.getElementById("news-section").style.display = "none";
  document.getElementById("news-list").innerHTML = "";
  document.getElementById("news-status").textContent = "";
  document.getElementById("news-retry").style.display = "none";
}

function _setNewsError() {
  document.getElementById("news-status").textContent = "Local context unavailable right now.";
  document.getElementById("news-retry").style.display = "inline-block";
}

function _renderHeadlines(headlines) {
  const list = document.getElementById("news-list");
  list.innerHTML = headlines.map((item) => {
    const date = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
    const meta = [item.source, date].filter(Boolean).join(" · ");
    return `<li>
      <a class="news-title" href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      ${meta ? `<span class="news-meta">${meta}</span>` : ""}
    </li>`;
  }).join("");

  // Build plain-text summary for Gemini context (titles only)
  currentNewsContext = headlines
    .map((h) => `- ${h.title}${h.source ? ` (${h.source})` : ""}`)
    .join("\n");
}

function loadLocalNews(cell) {
  const section = document.getElementById("news-section");

  // Cancel any in-flight fetch from a previous cell
  if (newsAbortController) newsAbortController.abort();
  clearTimeout(newsFetchTimer);
  currentNewsContext = null;

  // Show section immediately with loading state
  section.style.display = "block";
  document.getElementById("news-status").textContent = "Loading local context…";
  document.getElementById("news-list").innerHTML = "";
  document.getElementById("news-retry").style.display = "none";

  const lat = Array.isArray(cell.center) ? cell.center[0] : cell.center?.lat;
  const lng = Array.isArray(cell.center) ? cell.center[1] : cell.center?.lng;

  // 400 ms debounce — skip fast clicks
  newsFetchTimer = setTimeout(async () => {
    newsAbortController = new AbortController();
    try {
      const headlines = await fetchLocalNewsForCell(lat, lng, {
        signal: newsAbortController.signal,
      });

      if (headlines.length === 0) {
        document.getElementById("news-status").textContent = "No recent local news found.";
      } else {
        document.getElementById("news-status").textContent = "";
        _renderHeadlines(headlines);
      }
    } catch (err) {
      if (err.name === "AbortError") return; // user moved to another cell — silent
      console.error("[News] fetch error:", err);
      _setNewsError();
    } finally {
      newsAbortController = null;
    }
  }, 400);
}

// Initialize the application
function init() {
  // Initialize map
  map = L.map("map").setView([32.3668, -86.3], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  // Create hex layer group
  hexLayerGroup = L.layerGroup().addTo(map);

  // Generate hex grid once over the full city bounds.
  currentBounds = MONTGOMERY_BOUNDS;
  const hexGrid = generateHexGrid(HEX_GRID_BOUNDS, HEX_CELL_SIZE);

  // Initial data fetch and render
  fetchAndRenderData(hexGrid);

  // Re-fetch on pan/zoom (debounced); hex grid stays fixed.
  map.on(
    "moveend",
    debounce(() => {
      currentBounds = map.getBounds();
      fetchAndRenderData(hexGrid);
    }, 450)
  );

  document.getElementById("time-range").addEventListener("change", (e) => {
    currentDays = parseInt(e.target.value, 10);
  });

  document.querySelectorAll(".layer-toggle").forEach((toggle) => {
    toggle.addEventListener("change", (e) => {
      currentLayers[e.target.name] = e.target.checked;
    });
  });

  document.getElementById("apply-filters").addEventListener("click", () => {
    fetchAndRenderData(hexGrid);
  });

  document.querySelector(".close-btn").addEventListener("click", () => {
    selectedHexId = null;
    selectedCellData = null;
    const panel = document.getElementById("detail-panel");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    setAIInsightState({ text: "", loading: false, error: false });
    resetNewsPanel();
  });

  document.getElementById("news-retry").addEventListener("click", () => {
    if (selectedCellData) loadLocalNews({ center: selectedCellData.center });
  });

  document.getElementById("ai-insight-btn").addEventListener("click", handleExplainArea);
}

// Fetch data, process, and render
async function fetchAndRenderData(hexGrid) {
  showLoading(true);
  try {
    const enabledKeys = Object.keys(currentLayers).filter((k) => currentLayers[k]);

    const allDatasets = await montgomeryDataAPI.getAllDatasets({
      bounds: currentBounds,
      days: currentDays,
      enabledKeys,
    });

    const filteredDatasets = {
      calls911: allDatasets.calls911.filter(isValidFeature),
      requests311: allDatasets.requests311.filter(isValidFeature),
      violations: allDatasets.violations.filter(isValidFeature),
      vacant: allDatasets.vacant.filter(isValidFeature),
    };

    const gridSummary = buildGridSummary(hexGrid, filteredDatasets);
    const scoredGrid = computeRiskScores(gridSummary);

    renderHexGrid(scoredGrid);

    if (selectedHexId !== null) {
      const updatedCell = scoredGrid.find((c) => c.hexId === selectedHexId);
      if (updatedCell) {
        showDetailPanel(updatedCell);
      } else {
        showDetailPanelEmpty();
      }
    }

    updateDataStatus(filteredDatasets);
  } catch (error) {
    console.error("Error fetching or processing data:", error);
    renderHexGrid([]);
    updateDataStatus({ calls911: [], requests311: [], violations: [], vacant: [] });
  } finally {
    showLoading(false);
  }
}

// Render hex grid
function renderHexGrid(scoredGrid) {
  hexLayerGroup.clearLayers();
  scoredGrid.forEach((cell) => {
    const riskLevel = getRiskLevel(cell.riskScore);

    const polygon = L.polygon(cell.vertices, {
      fillColor: riskLevel.color,
      fillOpacity: 0.6,
      color: "white",
      weight: 1,
      opacity: 0.4,
    });

    polygon.on("mouseover", function () {
      this.setStyle({ fillOpacity: 0.85, weight: 2 });
    });

    polygon.on("mouseout", function () {
      this.setStyle({ fillOpacity: 0.6, weight: 1 });
    });

    polygon.on("click", () => showDetailPanel(cell));

    hexLayerGroup.addLayer(polygon);
  });
}

// Show detail panel
function showDetailPanel(cell) {
  selectedHexId = cell.hexId;
  selectedCellData = buildGeminiCellData(cell);

  const riskLevel = getRiskLevel(cell.riskScore);
  const breakdown = getScoreBreakdown(cell);

  document.getElementById("risk-value").textContent = cell.riskScore.toFixed(2);

  const badge = document.getElementById("risk-badge");
  badge.textContent = riskLevel.label;
  badge.style.backgroundColor = riskLevel.color;

  document.getElementById("breakdown-911").textContent = breakdown.breakdown["911 Calls"].raw;
  document.getElementById("breakdown-311").textContent = breakdown.breakdown["311 Complaints"].raw;
  document.getElementById("breakdown-violations").textContent = breakdown.breakdown["Code Violations"].raw;
  document.getElementById("breakdown-vacant").textContent = breakdown.breakdown["Vacant Properties"].raw;

  const panel = document.getElementById("detail-panel");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");

  setAIInsightState({ text: "", loading: false, error: false });
  loadLocalNews(cell);
}

// Show detail panel in empty/no-data state
function showDetailPanelEmpty() {
  selectedCellData = null;

  document.getElementById("risk-value").textContent = "--";
  const badge = document.getElementById("risk-badge");
  badge.textContent = "No data";
  badge.style.backgroundColor = "#95a5a6";
  document.getElementById("breakdown-911").textContent = "0";
  document.getElementById("breakdown-311").textContent = "0";
  document.getElementById("breakdown-violations").textContent = "0";
  document.getElementById("breakdown-vacant").textContent = "0";

  const panel = document.getElementById("detail-panel");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");

  setAIInsightState({ text: "", loading: false, error: false });
}

// Update data status
function updateDataStatus(datasets) {
  const status = `Loaded: ${datasets.calls911.length} 911 calls, ${datasets.requests311.length} 311 requests, ${datasets.violations.length} violations, ${datasets.vacant.length} vacant properties`;
  document.getElementById("data-status").textContent = status;
}

// Show/hide loading overlay
function showLoading(show) {
  const loading = document.getElementById("loading-overlay");
  if (!loading) return;
  if (show) {
    loading.classList.remove("hidden");
  } else {
    loading.classList.add("hidden");
  }
}

// Initialize on DOMContentLoaded
document.addEventListener("DOMContentLoaded", init);