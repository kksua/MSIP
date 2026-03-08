/**
 * Gemini API Service
 * Generates AI-powered insights about neighborhoods using Google's Gemini model
 */

const GEMINI_API_KEY = 'AIzaSyAkblKk7lTzSuy96j3CmkZ-OFNL3pFV7jk';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_INSTRUCTION =
  'You are an urban analytics assistant for the City of Montgomery, Alabama. You analyze neighborhood-level data from 911 emergency calls, 311 service requests, code violations, and vacant property records. Your role is to explain patterns in plain language for city administrators, journalists, and community members. Be specific, cite the data provided, and avoid speculation. If trends are present, note whether conditions appear to be improving, stable, or worsening. Keep responses to 3-4 sentences.';

const MIN_REQUEST_INTERVAL_MS = 2000;
const DEFAULT_TIME_WINDOW_DAYS = 30;

export class GeminiAPI {
  constructor() {
    this.apiKey = GEMINI_API_KEY;
    this.isLoading = false;
    this.lastRequestTime = 0;
  }

  isConfigured() {
    return typeof this.apiKey === 'string' && this.apiKey.trim() !== '';
  }

  async generateInsight(cellData, newsContext = null) {
    const riskScore = Number(cellData?.riskScore ?? 0);
    const riskLevel = cellData?.riskLevel ?? 'Unknown';
    const counts = {
      calls911: Number(cellData?.counts?.calls911 ?? 0),
      requests311: Number(cellData?.counts?.requests311 ?? 0),
      violations: Number(cellData?.counts?.violations ?? 0),
      vacant: Number(cellData?.counts?.vacant ?? 0),
    };
    const center = {
      lat: Number(cellData?.center?.lat ?? 0),
      lng: Number(cellData?.center?.lng ?? 0),
    };

    const totalIncidents =
      counts.calls911 +
      counts.requests311 +
      counts.violations +
      counts.vacant;

    const fallbackMessage = `AI insight is temporarily unavailable. This area has a risk score of ${riskScore} (${riskLevel}) based on ${totalIncidents} incidents.`;

    const now = Date.now();
    if (now - this.lastRequestTime < MIN_REQUEST_INTERVAL_MS) {
      return 'Please wait a moment before requesting another insight.';
    }

    if (!this.isConfigured()) {
      return fallbackMessage;
    }

    const userPrompt = [
      'Analyze this neighborhood grid cell in Montgomery, AL:',
      `Location: ${center.lat}, ${center.lng}`,
      `Time window: last ${DEFAULT_TIME_WINDOW_DAYS} days`,
      '',
      'Data summary:',
      `- 911 Calls: ${counts.calls911}`,
      `- 311 Complaints: ${counts.requests311}`,
      `- Code Violations: ${counts.violations}`,
      `- Vacant Properties: ${counts.vacant}`,
      '',
      `Neighborhood Risk Score: ${riskScore} (${riskLevel})`,
      ...(newsContext ? ['', 'Recent local news context:', newsContext] : []),
      '',
      'Provide a concise, plain-language explanation of what this data suggests about conditions in this area.',
    ].join('\n');

    const requestBody = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300,
      },
    };

    this.isLoading = true;
    this.lastRequestTime = now;

    try {
      const response = await fetch(
        `${GEMINI_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof text !== 'string' || text.trim() === '') {
        throw new Error('Gemini API returned an empty response.');
      }

      return text.trim();
    } catch (error) {
      console.error('GeminiAPI.generateInsight error:', error);
      return fallbackMessage;
    } finally {
      this.isLoading = false;
    }
  }
}

export const geminiAPI = new GeminiAPI();