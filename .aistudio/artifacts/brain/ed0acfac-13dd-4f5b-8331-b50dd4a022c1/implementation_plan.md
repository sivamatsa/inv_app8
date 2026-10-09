# Portfolio-Aware AI Copilot & Full-Page Advisor: Complete Portfolio Intelligence Plan

Comprehensive architectural specification and implementation roadmap to empower both the **Floating AI Copilot** (`js/lib/chatbot.js`) and the **Full-Page AI Advisor** (`js/views/aiCopilot.js`) to accurately answer questions referencing the user's **entire portfolio data**: Deals, SIPs/Recurring Investments, Bank FDs, Physical & Scheme Gold, Expense Projects & Ledgers, and Net Worth/Cash Flow.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your explicit preferences:
> 1. **Complete Portfolio Scope**: Both AI interfaces will reference the user's entire portfolio:
>    - **High-Yield Deals & Loans**: Active/Matured status, invested principal, current outstanding, annual ROI, payout frequency, installments, interest received vs. pending, payout reliability, and overdue schedules.
>    - **Systematic Recurring Investments & SIPs**: Active/paused plans, amounts, frequencies, start/end dates, total committed, total invested to date, consistency rates, and upcoming due dates.
>    - **Bank Accounts & Fixed Deposits (FDs)**: Account balances, FD principal, interest rate (% p.a.), start/maturity dates, accumulated interest to date, and maturity values.
>    - **Gold Vault & Bullion**: Physical purchases (grams, purity, jeweler, purchase price vs current market valuation) and monthly Gold Savings Schemes (accumulated grams, installments paid).
>    - **Expense Projects & Ledgers**: Project names, allocated budgets, total debited/spent, available project balances, top spending categories, and recent transaction records.
>    - **Net Worth & Cash Flow**: Total Net Worth, total assets, active liabilities/debt, liquid cash runway, 7/30/90-day cash flow inflow/outflow projections.
> 2. **Dual Interaction Surfaces**:
>    - **Floating AI Copilot** (`#piosChatbotContainer` / docked launcher): Accessible from any screen in the app with floating chat history, model selection, live portfolio badge, quick chips, and collapsible settings.
>    - **Full-Page AI Advisor** (`#pane-aicopilot` / nav item `AI Portfolio Copilot`): Comprehensive cockpit with 1-click risk & health audit gauge, executive briefing generator, customizable prompt presets, and conversation history.
> 3. **Triple-Layer Response Capability**:
>    - **Detailed Breakdown**: Exact numeric tables, audit metrics, ROI comparisons, transaction dates, and delinquent deal flags.
>    - **Concise Executive Summary**: C-Suite high-level totals, key ratios (debt-to-assets, liquid runway, weighted average yield).
>    - **Interactive Action Suggestions**: Clickable action pills and deep links (e.g., `[View Deal #102](#deals)`, `[Record Payment](#payments)`, `[Reconcile Cashflow](#reconciliation)`, `[Audit Risk](#risk)`) right inside bot answers.

---

## 1. Overview & Core Concept

### What It Does
- **Unified Portfolio Grounding Engine (`App.portfolioIntelligence.buildFullPortfolioContext()`)**:
  - Creates a single, canonical, client-side portfolio extraction pipeline that gathers data across all tables and stores without drift or duplicate queries.
  - Summarizes data into structured, token-optimized Markdown sections formatted for Gemini (`gemini-3.8-flash` default with fast fallback to `gemini-3.1-flash-lite` and `gemini-flash-latest`).
  - Includes institutional financial metrics: weighted ROI, portfolio concentration, debt leverage, liquidity buffer, and delinquency rate.
- **Deep Grounding for Floating AI Copilot (`js/lib/chatbot.js`)**:
  - Upgrades `getLivePortfolioContext()` from a 6-line deals summary to the complete multi-asset ledger context.
  - Adds quick portfolio prompt starters: *"Summarize my FDs & SIPs"*, *"What is my total Gold vs Deals allocation?"*, *"Analyze expense project burn rate"*, *"Show overdue payments & at-risk capital"*.
  - Adds interactive link/action click handlers inside rendered chat messages so clicking suggested actions routes immediately to the target view or opens the relevant modal.
- **Enhanced Full-Page AI Advisor (`js/views/aiCopilot.js`)**:
  - Synchronizes `assembleContext()` with the unified engine so the full-page view sends identical, rich context to `/api/chat` and `/api/copilot`.
  - Upgrades the 1-Click Health Audit to evaluate FDs, Gold, SIPs consistency, and Expense project burn alongside Deals.
  - Upgrades the local fallback calculation engine so even if offline or without an active API key, the local deterministic engine provides full numbers across Deals, FDs, Gold, SIPs, Expenses, and Net Worth.
- **Backend API Resilience (`server.js`)**:
  - The `/api/chat` route already supports `@google/genai` and `portfolioContext`. We ensure it handles token limits cleanly by structuring the prompt with clear delimiters and instructing the model to provide both high-level summaries and audit-level breakdowns when requested.

---

## 2. User Experience & Visual Design

### Unified Portfolio Context Hierarchy (Supplied to Gemini)
```
================ PORTFOLIO CONTEXT (REAL-TIME AUDIT) ================
1. NET WORTH & LIQUIDITY:
   • Total Net Worth: ₹X,XX,XXX (Assets: ₹X,XX,XXX | Liabilities: ₹XX,XXX)
   • Liquid Cash in Accounts: ₹X,XX,XXX (Liquid Runway: X.X months)
   • Cash Movement (30-day projected net): ₹+XX,XXX

2. HIGH-YIELD DEALS & CONTRACTS:
   • Active Deals (N): Deal #1 [Name, Principal ₹XX,XXX, ROI XX%, Freq Monthly, Total Recv ₹XX,XXX, Payout Reliability XX%]
   • Overdue / At-Risk Deals: [Deal #X - ₹XX,XXX overdue]

3. SYSTEMATIC RECURRING INVESTMENTS & SIPS:
   • Active Plans (N): [SIP Name - ₹X,XXX/mo, Invested to date ₹XX,XXX, Consistency XX%, Next Due YYYY-MM-DD]

4. BANK ACCOUNTS & FIXED DEPOSITS (FD):
   • Accounts (N): [HDFC Bank (Checking) ₹XX,XXX], [SBI FD ₹X,XX,XXX @ 7.1% p.a., Maturing YYYY-MM-DD, Accum Interest ₹X,XXX]

5. GOLD & BULLION HOLDINGS:
   • Physical Bullion: XX.X grams (Valuation ₹X,XX,XXX)
   • Gold Schemes: [Scheme Name, XX.X grams accumulated, ₹XX,XXX paid]

6. EXPENSE PROJECTS & RUNWAY:
   • Projects (N): [Project Alpha - Budget ₹X,XX,XXX, Spent ₹XX,XXX, Balance ₹XX,XXX]
====================================================================
```

### Interactive Bot Response Layout (Both Floating & Full-Page)
```
┌────────────────────────────────────────────────────────────────────────┐
│ 💼 AI Financial Advisor                                      Gemini 3.8│
├────────────────────────────────────────────────────────────────────────┤
│ Here is the full breakdown of your portfolio across all 6 asset classes:│
│                                                                        │
│ 📊 Executive Summary                                                  │
│ • Net Worth: ₹48,50,000 across 8 active deals, 3 SIPs, 2 FDs & Gold.  │
│ • Weighted Yield: 14.8% p.a. with 92% payout reliability.             │
│                                                                        │
│ 📋 Detailed Audit Matrix                                              │
│ | Asset Class | Total Principal | Current Value | Monthly Inflow/Yield │
│ | Deals       | ₹25,00,000      | ₹25,80,000    | ₹32,500 (15.6%)     │
│ | Bank FDs    | ₹10,00,000      | ₹10,42,000    | ₹5,916 (7.1%)       │
│ | SIPs        | ₹5,00,000       | ₹5,60,000     | -₹15,000 committed  │
│ | Gold        | ₹6,50,000       | ₹7,20,000     | 85.5 grams          │
│                                                                        │
│ ⚡ Recommended Quick Actions                                           │
│ [📌 View Overdue Schedules]  [💳 Record Deal Payment]  [📈 Rebalance]  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technical Architecture & File Modifications

### A. New Unified Portfolio Intelligence Module: `js/lib/portfolioIntelligence.js`
- Create a dedicated singleton `App.portfolioIntelligence` loaded in `index.html`.
- Exposes:
  - `gatherAllPortfolioData()`: Single parallel `Promise.all` fetching Deals, Metrics, Recurring Items, Recurring Consistency, Gold Purchases, Gold Schemes, Expense Projects, Expense Summaries, Accounts (including FDs), Liabilities, Cash Flow, and Net Worth.
  - `buildFullPortfolioContextText(data)`: Serializes all 6 asset classes into structured markdown text formatted for system instructions.
  - `computeComprehensiveAudit(data)`: Computes institutional health metrics, diversification score, liquidity buffer, and delinquency rate.
  - `generateInteractiveLocalReport(question, data)`: Produces institutional local answers when offline or without Gemini API key, honoring the requested detail levels (Summary, Audit Table, Action Suggestions).

### B. Floating AI Copilot: `js/lib/chatbot.js`
- Replace primitive `getLivePortfolioContext()` with `App.portfolioIntelligence.buildFullPortfolioContextText()`.
- Update `systemPrompt` across all 4 personas (Advisor, Risk Auditor, Tax Strategist, Cash Flow Specialist) to explicitly guide multi-asset awareness:
  - *"Always cross-reference the user's Deals, SIPs, Bank FDs, Gold, Expense projects, and Net Worth metrics when answering."*
  - *"Structure answers with: 1) Concise Executive Summary, 2) Granular breakdown with verified figures, and 3) Actionable next steps formatted as clickable hash links like `[Go to Deals](#deals)` or `[Open Payments](#payments)`."*
- Enhance markdown renderer to parse and render interactive action pills (`[Action Label](#route)`).
- Add new quick starter prompts covering the full asset spectrum (FDs, SIPs, Gold vs. Deals, Expense Burn).

### C. Full-Page AI Advisor: `js/views/aiCopilot.js`
- Update `assembleContext()` to use `App.portfolioIntelligence.gatherAllPortfolioData()`.
- Update the Gemini system instruction in `ask()` to match the comprehensive portfolio persona.
- Enhance the 1-Click Health & Risk Audit display to highlight FD coverage, Gold hedge ratio, and SIP consistency alongside Deals.
- Enhance the local fallback engine to output the full multi-asset snapshot when the server endpoint is unreachable.

### D. Server Chat Endpoint: `server.js`
- Refine system instruction prompt concatenation to ensure large multi-asset context strings are cleanly partitioned and prioritized.
- Ensure model candidate chain (`gemini-3.8-flash` -> `gemini-3.1-flash-lite` -> `gemini-flash-latest`) reliably passes portfolio context with temperature 0.4 for financial precision.

### E. Script Inclusions: `index.html`
- Register `<script src="js/lib/portfolioIntelligence.js"></script>` before `js/views/aiCopilot.js` and `js/lib/chatbot.js`.

---

## 4. Verification & Testing Plan

1. **Compilation & Syntax Check**: Verify that all 71+ scripts load without JavaScript syntax errors via Node execution test.
2. **Context Assembly Test**: Verify `App.portfolioIntelligence.buildFullPortfolioContextText()` outputs verified figures for all 6 domains (Deals, SIPs, FDs, Gold, Expenses, Net Worth).
3. **Floating AI Copilot Verification**:
   - Open floating widget and ask: *"Give me a complete breakdown of my portfolio across Deals, SIPs, FDs, Gold, and Expenses."*
   - Verify that the response includes exact figures from all asset classes.
   - Verify that interactive action suggestions appear and clicking them navigates to the respective views (`#deals`, `#recurring`, `#payments`, `#expenses`).
4. **Full-Page AI Advisor Verification**:
   - Navigate to `#aicopilot`.
   - Run the 1-Click Health Audit; verify it accounts for FDs, Gold, and SIPs.
   - Ask: *"What is my total passive monthly inflow vs recurring commitments?"*
   - Verify that deals interest and SIP commitments are accurately juxtaposed.
5. **Fallback Resilience Test**: Test response behavior when offline or with simulated network failure to ensure the deterministic local analytical engine outputs accurate multi-asset figures.
