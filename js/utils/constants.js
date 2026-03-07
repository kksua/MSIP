// js/utils/constants.js - core config values for Safety CityPulse (Montgomery, AL)

// Map configuration
export const MAP_CENTER = [32.3668, -86.3000]; // Montgomery, Alabama
export const MAP_DEFAULT_ZOOM = 12;
export const MAP_MIN_ZOOM = 10;
export const MAP_MAX_ZOOM = 18;
export const MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// Risk score weights (PRD)
export const RISK_WEIGHTS = {
  calls911: 0.35,
  requests311: 0.30,
  violations: 0.20,
  vacant: 0.15,
};

// Risk levels (3 tiers)
export const RISK_LEVELS = [
  { name: "Low", min: 0, max: 33, color: "#3FB27F" },
  { name: "Moderate", min: 34, max: 66, color: "#F4B942" },
  { name: "Emerging", min: 67, max: 100, color: "#E55353" },
];

// Hex grid configuration
export const HEX_CELL_SIZE = 0.003;
export const HEX_GRID_BOUNDS = {
  southWest: [32.30, -86.40],
  northEast: [32.45, -86.20],
};

// API endpoints
export const API_ENDPOINTS = {
  calls911: "https://services7.arcgis.com/xNUwUjOJqYE54USz/arcgis/rest/services/911_Calls_Data/FeatureServer/0",
  requests311: "https://gis.montgomeryal.gov/server/rest/services/HostedDatasets/Received_311_Service_Request/MapServer/0",
  violations: "https://gis.montgomeryal.gov/server/rest/services/HostedDatasets/Code_Violations/MapServer/0",
  vacant: "https://services7.arcgis.com/xNUwUjOJqYE54USz/ArcGIS/rest/services/Vacant_Properties/FeatureServer/2",
};

// Feature flags
export const ENABLE_HEX_GRID = true;
export const ENABLE_AI_INSIGHTS = false;
export const ENABLE_BRIGHT_DATA = false;
export const ENABLE_TREND_DETECTION = false;
export const DEBUG_MODE = true;

// Time filters
export const DEFAULT_TIME_DAYS = 30;
export const TIME_OPTIONS_DAYS = [7, 30, 60, 90];

// Design tokens
export const CIVIC_BLUE = "#1F3A63";
export const DEEP_GOV_BLUE = "#0F2747";
export const MONTGOMERY_GOLD = "#CFA64A";
export const METRIC_COLORS = {
  calls911: "#E55353",
  requests311: "#F4B942",
  violations: "#4E6F9F",
  vacant: "#6B7280",
};
