import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '5mb' }));

let aiClient = null;
let lastApiKey = null;

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    ''
  );
}

function getAiClient() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured. Please add GEMINI_API_KEY in the Settings menu.');
  }
  if (!aiClient || lastApiKey !== apiKey) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    lastApiKey = apiKey;
  }
  return aiClient;
}

const DEFAULT_SYSTEM_INSTRUCTION = `You are the AI Financial Intelligence Advisor of Personal Investment OS (PIOS). 
You are an expert in quantitative portfolio management, asset allocation, Sharpe & Sortino ratios, P2P lending, fixed income debt, gold intelligence, loan amortizations, real estate waterfalls, and wealth compounding.

Your mission:
- Provide clear, actionable, and mathematically rigorous investment analysis and financial advice.
- When portfolio data is provided in context, tailor your answers directly to the user's active holdings, platforms, and risk metrics.
- Keep explanations structured, easy to read, and formatted with clean Markdown (bullet points, bold highlights, tables if appropriate).
- Maintain an encouraging, objective, institutional-grade tone without unnecessary financial jargon or vague disclaimers.`;

// Gemini Multi-turn Chat Endpoint with robust retry & fallback on 503/429
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model = 'gemini-flash-latest', systemInstruction, portfolioContext } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const ai = getAiClient();

    let fullSystemInstruction = systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
    if (portfolioContext) {
      fullSystemInstruction += `\n\n--- CURRENT USER PORTFOLIO CONTEXT ---\n${portfolioContext}\n--- END PORTFOLIO CONTEXT ---`;
    }

    // Format messages for @google/genai SDK
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.content || m.text || '') }],
    }));

    // Candidate models in priority order of attempt
    const modelCandidates = [
      model,
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.7-flash',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    let lastErr = null;
    let responseText = null;
    let successfulModel = model;

    for (const targetModel of modelCandidates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: targetModel,
            contents: contents,
            config: {
              systemInstruction: fullSystemInstruction,
              temperature: 0.7,
            },
          });
          responseText = response.text || '';
          successfulModel = targetModel;
          break; // Succeeded
        } catch (err) {
          lastErr = err;
          const errMsg = String(err.message || err);
          const isRetryable = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('429');
          if (isRetryable && attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          break; // Move to next candidate model
        }
      }
      if (responseText !== null) {
        break;
      }
    }

    if (responseText !== null) {
      return res.json({
        reply: responseText,
        model: successfulModel,
        timestamp: new Date().toISOString(),
      });
    }

    throw lastErr || new Error('Unable to get response from Gemini API. Please retry in a moment.');
  } catch (err) {
    const msg = err.message || 'Internal error calling Gemini API';
    const isKeyMissing = !getApiKey();
    return res.status(500).json({
      error: msg,
      help: isKeyMissing
        ? 'Please ensure GEMINI_API_KEY is configured in your project settings.'
        : 'Spikes in demand are usually temporary. Please retry in a moment.',
    });
  }
});

// Check AI status
app.get('/api/ai-status', (req, res) => {
  const hasKey = Boolean(getApiKey());
  res.json({
    configured: hasKey,
    keyPreview: hasKey ? `${getApiKey().slice(0, 4)}...${getApiKey().slice(-4)}` : null,
  });
});

// Serve static assets from workspace root
app.use(express.static(__dirname));

// Single Page Application fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

