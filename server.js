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

// Candidate models normalization and selection
function normalizeModelName(m) {
  if (!m) return 'gemini-3.6-flash';
  if (m === 'gemini-flash-latest' || m.startsWith('gemini-1.5') || m.startsWith('gemini-2.0') || m.startsWith('gemini-2.5')) {
    return 'gemini-3.6-flash';
  }
  return m;
}

// Helper with timeout
function callWithTimeout(promise, timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs))
  ]);
}

// Gemini Multi-turn Chat Endpoint with robust retry & fallback
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { messages, model = 'gemini-3.6-flash', systemInstruction, portfolioContext } = req.body || {};

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

    const requestedModel = normalizeModelName(model);

    // Candidate models in priority order of attempt
    const modelCandidates = [
      requestedModel,
      'gemini-3.6-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.7-flash',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    let lastErr = null;
    let responseText = null;
    let successfulModel = requestedModel;

    for (const targetModel of modelCandidates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await callWithTimeout(
            ai.models.generateContent({
              model: targetModel,
              contents: contents,
              config: {
                systemInstruction: fullSystemInstruction,
                temperature: 0.7,
              },
            }),
            12000
          );
          responseText = response?.text || '';
          successfulModel = targetModel;
          break; // Succeeded
        } catch (err) {
          lastErr = err;
          const errMsg = String(err.message || err);
          const isRetryable = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('429') || errMsg.includes('Timeout');
          if (isRetryable && attempt === 0) {
            await new Promise((r) => setTimeout(r, 400));
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

// Document & Agreement Extraction Endpoint (Sale Deeds, Dharani/Meebhoomi, Promissory Notes, Gold Schemes, Lease Agreements)
app.post('/api/extract-document', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { documentText, imageBase64, mimeType = 'image/jpeg', documentHint = 'auto' } = req.body || {};

    if (!documentText && !imageBase64) {
      return res.status(400).json({ error: 'Either documentText or imageBase64 is required.' });
    }

    const ai = getAiClient();

    const extractionPrompt = `You are the Institutional Document Analysis AI for Personal Investment OS.
Your task is to analyze and extract financial, legal, and operational parameters from the provided document (Sale Deed, Land Registry like Dharani/Meebhoomi/Pattadar Passbook, Promissory Note, Gold Scheme Passbook, or Commercial/Residential Lease Agreement).

Document Hint: ${documentHint}

Rules for Extraction:
1. Identify the exact Document Type accurately:
   - "Sale Deed / Conveyance"
   - "Land Registry (AP Dharani / Meebhoomi / ROR-1B)"
   - "Promissory Note / Loan Agreement"
   - "Gold Scheme / Chit Fund Passbook"
   - "Rental / Lease Agreement"
   - "Fixed Income / Bond / FD"
2. Normalize all financial amounts to numerical values in INR / USD.
3. Normalize all dates to ISO "YYYY-MM-DD".
4. Calculate or extract ROI/Interest rates, tenure in months, and payout frequencies.
5. For Land / Real Estate: extract survey numbers, village/mandal/district, sub-registrar office, and extent.
6. For Gold Schemes: extract purity (24K/22K), gross & net weight in grams, jeweller name, and monthly installment.
7. For Leases & Rent Agreements:
   - Extract Tenant Name, Monthly Rent, Security Deposit, Start Date, Expiry Date.
   - Extract Rental Escalation percentage (e.g., 5%, 7%, 10%) and Escalation Period in months (e.g. 11 months, 12 months).
   - Compute or estimate next escalation date and new escalated rent.
8. Output ONLY valid JSON matching this schema:
{
  "document_type": string,
  "deal_name": string,
  "investment_type": string (e.g. "Real Estate", "Private Lending", "Physical Gold", "Chit Funds", "Venture & P2P", "Fixed Deposit", "Rental Property"),
  "category": string,
  "party_name": string,
  "contact_phone": string,
  "invested_amount": number,
  "principal_amount": number,
  "annual_roi": number,
  "monthly_roi": number,
  "tenure_months": number,
  "start_date": string (YYYY-MM-DD),
  "maturity_date": string (YYYY-MM-DD),
  "payment_frequency": string ("Monthly" | "Quarterly" | "Half-Yearly" | "Yearly" | "At Maturity"),
  "payout_type": string ("Interest Only" | "Interest + Principal" | "Principal at Maturity" | "EMI" | "Rental Payout"),
  "collateral_available": boolean,
  "collateral_notes": string,
  "land_details": {
    "survey_number": string,
    "extent": string,
    "village_mandal_district": string,
    "sub_registrar_office": string,
    "document_number": string
  },
  "gold_details": {
    "jeweller_name": string,
    "purity": string,
    "weight_grams": number,
    "monthly_installment": number,
    "scheme_tenure_months": number
  },
  "lease_details": {
    "is_lease": boolean,
    "tenant_name": string,
    "monthly_rent": number,
    "security_deposit": number,
    "lease_start_date": string,
    "lease_expiry_date": string,
    "rental_escalation_pct": number,
    "escalation_period_months": number,
    "days_to_expiry": number,
    "next_escalation_date": string,
    "escalated_new_rent": number
  },
  "key_highlights": [string],
  "executive_summary": string,
  "confidence_score": number (0 to 100)
}`;

    const parts = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64,
        },
      });
    }
    if (documentText) {
      parts.push({
        text: `--- DOCUMENT RAW CONTENT ---\n${documentText}\n--- END DOCUMENT RAW CONTENT ---`,
      });
    }
    parts.push({ text: extractionPrompt });

    const modelCandidates = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];
    let parsedResult = null;
    let lastErr = null;

    for (const targetModel of modelCandidates) {
      try {
        const response = await callWithTimeout(
          ai.models.generateContent({
            model: targetModel,
            contents: [{ role: 'user', parts }],
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          }),
          20000
        );

        const textOut = response?.text || '';
        if (textOut) {
          parsedResult = JSON.parse(textOut);
          break;
        }
      } catch (err) {
        lastErr = err;
        console.warn(`Extraction attempt with ${targetModel} notice:`, err.message || err);
      }
    }

    if (parsedResult) {
      return res.json({
        success: true,
        extracted: parsedResult,
        timestamp: new Date().toISOString(),
      });
    }

    throw lastErr || new Error('Unable to extract structured data from document.');
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Document extraction failed',
      help: 'Please verify GEMINI_API_KEY or ensure clear image / text resolution.',
    });
  }
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

