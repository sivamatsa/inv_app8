# Fix Deployment JSON Parsing, Restore Live Deal Metrics & Build Hybrid AI Assistant Bot

A comprehensive three-pillar fix addressing the static hosting JSON parsing error (`Unexpected token '<'`), restoring live deal metrics and payment schedules in Telegram with case-insensitive data binding, and upgrading the Telegram bot into a **Hybrid AI Financial Copilot** powered by Gemini with full portfolio grounding.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Based on your responses, we have aligned on the following core decisions:

- **Confirmed Decision 1 (Dual Architecture with Auto-Detection)**:
  - For external deployments (e.g. GitHub Pages or static hosts where no Node.js backend is running), we will add a **Safe API Client (`safeApiFetch`)** that detects HTML error pages (preventing `Unexpected token '<'` syntax crashes) and gracefully falls back to direct client-side Supabase data.
  - We will introduce an **External Backend URL setting** in Settings so an externally hosted static frontend (like GitHub Pages) can connect to your running cloud backend URL (e.g. Cloud Run, Render, or Railway) to preserve full bot management and AI features.
- **Confirmed Decision 2 (Live Deal Binding & Case-Insensitive Matching)**:
  - We identified why the Telegram bot showed 0/empty numbers: the backend filter performed a strict case-sensitive match (`d.status === 'Active'`), whereas deals in the Supabase database are stored in uppercase (`'ACTIVE'`).
  - Furthermore, `payment_schedule` in Supabase uses `'UPCOMING'` and `'RECEIVED_EARLY'` alongside `'DUE'` and `'OVERDUE'`. We will expand the schedule query to include all active schedule items.
  - When a message arrives from Telegram (`chat_id = 857004089`), the server will automatically resolve the user's primary Supabase account (`e9b2b685-1a44-4d7c-a9c0-e79e5017d442`) from `bot_links` so real deals and financials are loaded into every response.
- **Confirmed Decision 3 (Hybrid Telegram AI Financial Assistant)**:
  - The bot will combine **smart command routing** (instant formatted templates for `/summary`, `/due`, `/overdue`, `/gold`, `/digest`) with **Gemini AI reasoning** for all natural language questions.
  - We will fix the Gemini model call (updating from the invalid `gemini-3.6-flash` to the supported `gemini-2.5-flash` model via the modern `@google/genai` SDK).
  - The model prompt will be grounded with the user's complete real-time portfolio: all active deals, borrower names, platform IDs, invested amounts, annual/monthly ROI, and upcoming payment schedules.

---

### 1. Overview & Core Concept

1. **Static Hosting Compatibility**:
   When an app is deployed to GitHub Pages, requests to `/api/*` return the host's 404/SPA HTML page. The app must never attempt `res.json()` on HTML responses. If a backend URL is configured, requests route to that backend; if not, the app operates in static mode using client-side Supabase directly.

2. **Accurate Live Deal Metrics in Telegram**:
   By normalizing status checks (`status.toUpperCase() === 'ACTIVE'`) and extracting interest rates across `annual_roi`, `monthly_roi`, and `interest_rate`, `/summary` and `/digest` will display your real invested capital (₹15L+ across your 13+ active deals) and true monthly run-rate income.

3. **Intelligent Telegram Financial Copilot**:
   Instead of failing silently with "I didn't quite catch that", the bot will understand queries like:
   - *"How much money did I invest in OxyBricks?"*
   - *"Who owes me money this month?"*
   - *"What is my average ROI across all deals?"*
   - *"Tell me about deal SD-1CR-24M"*

---

### 2. User Experience & Visual Design

#### A. Key User Flows

1. **External Deployment & Backend URL in Settings**:
   - In **Settings &rarr; System &amp; Cloud Backend**, a new card indicates whether the app is running in **Direct Fullstack Mode** (dev/cloud container) or **Static External Mode** (GitHub Pages).
   - In Static Mode, an input allows setting the **Cloud Backend API URL** (e.g. `https://ais-pre-...run.app`).
   - A **Test Connection** button validates the backend URL in 1 click.
2. **Telegram Deal Summaries & Alert Sweeps**:
   - Sending `/summary` in Telegram returns your real active capital, accurate active deal count, expected monthly yield, and physical gold weight.
   - Sending `/due` displays all upcoming payouts arriving within the next 30 days.
   - Sending `/overdue` lists any delayed borrower payments with borrower names and days overdue.
3. **Conversational AI Financial Assistant**:
   - Send any natural question to `@InvestmentOS_AssistantBot`.
   - The bot analyzes your actual deals, payments, and bullion in Supabase and answers within seconds in clear Telegram HTML formatting.

#### B. Visual Hierarchy & Restraint

- **Defensive Error Boundaries**: HTML responses never display alert banners or red crash boxes in the console; quiet toast warnings guide the user to configure backend settings if needed.
- **Zero-Pill Restraint**: Status badges use quiet inline dot indicators (`● Connected to Backend · Cloud Run`).

---

### 3. Key Technical Decisions & Trade-Offs

- **Decision 1: Central Safe Fetch Utility (`safeApiFetch`)**:
  - *Chosen Approach*: Replace naked `fetch('/api/...')` with a shared wrapper that checks `response.headers.get('content-type')` before parsing JSON. If `text/html` is received, it returns a structured fallback or throws a meaningful error.
  - *Why*: Eliminates the root cause of `Unexpected token '<'` across the entire frontend.
- **Decision 2: Case-Insensitive Database Filters**:
  - *Chosen Approach*: Query deals and payment schedules with normalized status checks (`['ACTIVE', 'Active']` and `['UPCOMING', 'DUE', 'SCHEDULED', 'OVERDUE']`).
  - *Why*: Supports both programmatic API entries and manual Excel imports with varied casing.
- **Decision 3: Gemini Model & Grounding Architecture**:
  - *Chosen Approach*: Use `gemini-2.5-flash` with structured system instructions and dynamic JSON portfolio grounding (deals, borrowers, ROI, upcoming payouts, bullion).
  - *Why*: `gemini-2.5-flash` provides sub-second latency and high numerical precision for financial calculations.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT / FRONTEND                               │
│  GitHub Pages / External Static Host  OR  Cloud Run Container          │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ safeApiFetch(endpoint, opts)                                   │   │
│   │  • Resolves base URL (local origin vs external backend URL)    │   │
│   │  • Checks Content-Type (rejects HTML with safe fallback)       │   │
│   │  • Prevents "Unexpected token '<'" JSON crash                  │   │
│   └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   NODE.JS BACKEND ENGINE (server.js)                   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Telegram Inbound Router (Long Polling + Webhook)               │   │
│   │  • Resolves user_id from bot_links (chat_id = 857004089)       │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │
│                                   ▼
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ getUserPortfolioSnapshot(userId)                               │   │
│   │  • Case-insensitive deals query: status IN ('ACTIVE', 'Active')│   │
│   │  • Extended schedule query: UPCOMING, DUE, OVERDUE, SCHEDULED  │   │
│   │  • Computes true invested capital, monthly yield & 30-day dues │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │
│         ┌─────────────────────────┴────────────────────────┐           │
│         │ Exact Command (/summary, /due)                   │ Natural Q │
│         ▼                                                  ▼           │
│   ┌───────────────┐                             ┌──────────────────┐   │
│   │ Instant Reply │                             │ Gemini 2.5 Flash │   │
│   │ Template      │                             │ Full Portfolio   │   │
│   └───────┬───────┘                             │ Grounding        │   │
│           │                                     └─────────┬────────┘   │
│           └───────────────────────┬───────────────────────┘            │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ sendTelegramDirect(chatId, htmlResponse)                       │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Step-by-Step Implementation Sequence

1. **Backend Deal Metrics & Schedule Normalization (`server.js`)**:
   - Update `getUserPortfolioSnapshot` to filter deals case-insensitively (`status.toUpperCase() === 'ACTIVE'`).
   - Query `payment_schedule` with statuses `['UPCOMING', 'DUE', 'OVERDUE', 'SCHEDULED']` and calculate exact 30-day upcoming total and overdue total.
   - When receiving updates in Telegram, look up `user_id` in Supabase `bot_links` using `chat_id` so the real profile (`e9b2b685-1a44-4d7c-a9c0-e79e5017d442`) is always used.
2. **Telegram AI Copilot Upgrade (`server.js`)**:
   - Fix model call in `processBotCommand` to use `gemini-2.5-flash` via `@google/genai`.
   - Expand portfolio grounding prompt with detailed deal list (names, borrowers, principals, ROIs, next payment dates) and schedule items.
   - Add intelligent fallback and conversational tone.
3. **Safe API Client & HTML Guard (`js/data/api.js`)**:
   - Implement `safeApiFetch(url, options)` that handles content-type validation, custom backend URL resolution, and prevents `Unexpected token '<'` crashes.
   - Wrap all `/api/*` calls (`getBotConfig`, `getBotStatus`, `fetchLiveGoldSearch`, etc.) through `safeApiFetch`.
4. **Settings UI Backend URL Configuration (`js/views/settings.js`)**:
   - Add a "Backend API Connection" section in Settings allowing users on external static deployments to specify their live backend server URL.
5. **Verification & Testing**:
   - Verify `/summary` returns real active deals and capital figures.
   - Test natural language Q&A in Telegram bot with real investment queries.
   - Verify static deployment safety and successful applet compilation.
