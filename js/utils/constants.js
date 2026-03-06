/**
 * Application Constants
 * Centralized configuration for the Montgomery Risk Explorer app
 */

// Application Constants

const APP_CONFIG = {
    // Map Configuration
    MAP: {
        CENTER: [39.0997, -77.1344], // Montgomery County, MD center coordinates
        ZOOM_LEVEL: 11,
        MIN_ZOOM: 9,
        MAX_ZOOM: 16,
        DEFAULT_ZOOM: 11,
    },

    // Risk Score Ranges (for future use)
    RISK_LEVELS: {
        VERY_LOW: { min: 0, max: 20, label: 'Very Low', color: '#28a745' },
        LOW: { min: 20, max: 40, label: 'Low', color: '#6db3f2' },
        MODERATE: { min: 40, max: 60, label: 'Moderate', color: '#ffc107' },
        HIGH: { min: 60, max: 80, label: 'High', color: '#ff9800' },
        VERY_HIGH: { min: 80, max: 100, label: 'Very High', color: '#dc3545' },
    },

    // API Endpoints (for future use)
    API: {
        MONTGOMERY_DATA_BASE: 'https://data.montgomerycountymd.gov/api/records/1.0/search',
        GEMINI_API_KEY: '', // To be configured
        BRIGHT_DATA_API_KEY: '', // To be configured
    },

    // Feature Flags
    FEATURES: {
        ENABLE_BRIGHT_DATA: false,
        ENABLE_AI_INSIGHTS: false, // Disable for initial map focus
        DEBUG_MODE: false,
    },

    // Data Parameters
    DATA: {
        UPDATE_INTERVAL: 3600000, // 1 hour
        CACHE_DURATION: 300000,   // 5 minutes
    },
};

// Risk Score Weight Configuration (for future use)
const RISK_WEIGHTS = {
    CRIME_RATE: 0.35,
    ECONOMIC_INDICATORS: 0.30,
    HEALTH_METRICS: 0.20,
    ENVIRONMENTAL_FACTORS: 0.10,
    INFRASTRUCTURE_CONDITIONS: 0.05,
};

// Normalize weights
const NORMALIZED_WEIGHTS = (() => {
    const sum = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    const normalized = {};
    for (const [key, value] of Object.entries(RISK_WEIGHTS)) {
        normalized[key] = value / sum;
    }
    return normalized;
})();

// Default neighborhood structure (for future use)
const DEFAULT_NEIGHBORHOOD = {
    id: null,
    name: 'Unknown',
    geometry: null,
    metrics: {
        crimeRate: null,
        economicIndex: null,
        healthIndex: null,
        environmentalIndex: null,
        infrastructureIndex: null,
    },
    riskScore: null,
    lastUpdated: null,
};
