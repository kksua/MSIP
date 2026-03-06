# Montgomery Neighborhood Risk Explorer

A client-side civic intelligence dashboard that visualizes neighborhood risk scores across Montgomery County, Maryland.

## Features

- **Interactive Map Visualization**: Leaflet-based map showing neighborhoods color-coded by risk level
- **Risk Score Calculation**: Normalized, weighted scoring system based on:
-   911 Calls
-   311 Service Requests
-   Code Violations
-   Vacant Properties

- **AI-Powered Insights**: Gemini API integration for contextual analysis
- **Community Perception**: Optional Bright Data signals for sentiment analysis
- **Detail Panels**: Click neighborhoods to view detailed metrics
- **Responsive Design**: Works on desktop and mobile devices

## Project Structure

```
montgomery-risk-explorer/
├── index.html                 # Main HTML entry point
├── css/
│   ├── main.css              # Global styles
│   ├── components.css        # Component styles
│   └── map.css               # Map-specific styles
├── js/
│   ├── main.js               # App initialization
│   ├── components/           # UI components
│   │   ├── MapPanel.js       # Map visualization
│   │   ├── DetailPanel.js    # Neighborhood details
│   │   └── InsightPanel.js   # AI insights display
│   ├── services/             # External API integrations
│   │   ├── MontgomeryDataAPI.js    # Montgomery Open Data
│   │   ├── GeminiAPI.js            # Google Gemini AI
│   │   └── BrightDataAPI.js        # Community signals
│   ├── logic/                # Business logic
│   │   ├── riskScoringEngine.js    # Risk calculations
│   │   └── dataProcessor.js        # Data transformation
│   ├── hooks/                # State management
│   │   ├── useMapData.js           # Map data state
│   │   └── useRiskScore.js         # Risk score state
│   └── utils/                # Utility functions
│       ├── constants.js             # App configuration
│       ├── normalization.js         # Data normalization
│       └── dataValidation.js        # Input validation
└── README.md
```

## Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for external APIs

### Installation

1. Clone or extract the project
2. Open `index.html` in a web browser
3. The app will load neighborhood data and display the map

### Configuration

Set API keys in `js/utils/constants.js`:

```javascript
APP_CONFIG.API = {
    GEMINI_API_KEY: 'your-key-here',
    BRIGHT_DATA_API_KEY: 'your-key-here',
};
```

Or set environment variables:
- `GEMINI_API_KEY`
- `BRIGHT_DATA_API_KEY`

### Feature Flags

Enable/disable features in `js/utils/constants.js`:

```javascript
APP_CONFIG.FEATURES = {
    ENABLE_BRIGHT_DATA: false,    // Community perception signals
    ENABLE_AI_INSIGHTS: true,     // AI-powered insights
    DEBUG_MODE: false,            // Debug logging
};
```

## Data Sources

- **Montgomery Open Data API**: 911 Calls, 311 Service Requests, Code Violations, Vacant Properties
- **Gemini API**: AI insight generation
- **Bright Data**: Community perception signals (optional)

## Risk Score Methodology

Risk Score formula:

0.35 \* normalized(911 calls) + 0.30 \* normalized(311 complaints) +
0.20 \* normalized(code violations) + 0.15 \* normalized(vacant
properties)

Risk Levels:

-   Low
-   Moderate
-   Emerging

## Architecture

### Modular Design
- **Components**: Reusable UI elements (Map, DetailPanel, InsightPanel)
- **Services**: External API integrations with caching
- **Logic**: Business logic separated from UI
- **Hooks**: State management (useMapData, useRiskScore)
- **Utils**: Shared utility functions

### Data Flow
1. Load neighborhood data from Montgomery API
2. Process and normalize raw metrics
3. Calculate risk scores and categorize
4. Render on map with color coding
5. On selection: Display details and generate AI insights

## Dependencies

### External Libraries
- **Leaflet** 1.9.4 - Map visualization
- **Leaflet CSS** - Map styling

### APIs
- Montgomery County Open Data API
- Google Gemini API (optional)
- Bright Data API (optional)

## Development

### Adding a New Metric

1. Add to risk score weights in `constants.js`
2. Update `RISK_WEIGHTS` and rebalance
3. Create fetch function in `MontgomeryDataAPI.js`
4. Add normalization logic in `DataProcessor.js`
5. Include in `RiskScoringEngine.calculateRiskScore()`

### Debugging

Enable debug mode in `constants.js`:
```javascript
APP_CONFIG.FEATURES.DEBUG_MODE = true;
```

Access app instance globally:
```javascript
window.montgomeryRiskExplorer
```

## Future Enhancements

-   predictive safety analytics
-   real-time city data ingestion
-   city resource optimization tools
-   citizen issue reporting
-   infrastructure monitoring
-   urban planning decision support

