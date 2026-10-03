# Implementation Plan: 24/7 Telegram Bot Integration for Static Deployments (GitHub Pages & sri.qzz.io)

Fixes the `Server responded with 405` and `Server cannot connect to that backend URL` errors when running on GitHub Pages (`sivamatsa.github.io`) or custom domains (`sri.qzz.io`). Implements a resilient hybrid architecture: direct Supabase token storage, browser-based live poller with instant execution, and automated cloud webhook backup.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Based on your selections and architecture requirements, here are the decisions to be executed:

- **Confirmed Decision 1 (Storage)**: Store the Telegram Bot token directly in your private Supabase database (`public.bot_links` table) with Row-Level Security (RLS). This eliminates HTTP POST calls to static hosting domains, completely fixing the `405 Method Not Allowed` error.
- **Confirmed Decision 2 (Runtime)**: Implement a **Hybrid Telegram Poller**:
  - **Primary (In-App)**: A resilient client-side polling engine (`js/lib/telegramClientPoller.js`) that runs seamlessly in the browser / installed PWA. It calls `https://api.telegram.org/bot<token>/getUpdates`, answers all commands (`/summary`, `/due`, `/overdue`, `/gold`, etc.) with live Supabase portfolio data, and replies in real-time.
  - **Secondary (Cloud Webhook)**: Full support for Telegram Webhooks (`setWebhook`) pointing to Supabase Edge Functions or a cloud backend, so messages continue to be answered even when all browser tabs are closed.
- **Confirmed Decision 3 (UX Guardrails)**: Add smart detection in Settings so that entering a GitHub Pages or static URL (`sivamatsa.github.io` / `sri.qzz.io`) automatically guides the user to use the direct Supabase integration instead of failing with connection errors.

---

### 1. Root Cause Analysis

1. **Why `Server responded with 405` Occurred**:
   - `https://sivamatsa.github.io/inv_app8/` and `https://sri.qzz.io/` are static file hosts.
   - When entering the BotFather token, the app called `safeApiFetch('/api/bot/telegram/set-token', { method: 'POST' })`.
   - GitHub Pages does not support POST requests to static URLs and rejected it with **HTTP 405 (Method Not Allowed)**.
2. **Why `Server can not connect to that backend URL` Occurred**:
   - Entering `https://sri.qzz.io/` or `https://sivamatsa.github.io/` into the "Cloud Backend URL" input caused the app to test `GET https://sri.qzz.io/api/bot/config`.
   - Because GitHub Pages does not run Node.js/Express, it returned a 404 HTML page instead of API JSON, failing the health check.

---

### 2. Technical Architecture & Hybrid Workflow

```
┌────────────────────────────────────────────────────────────────────────┐
│                   STATIC HOST (GitHub Pages / sri.qzz.io)              │
│                                                                        │
│   ┌───────────────────────────┐      ┌───────────────────────────────┐ │
│   │ Settings View             │      │ js/lib/telegramClientPoller.js│ │
│   │  • Enter BotFather Token  │      │  • Long-polling getUpdates    │ │
│   │  • Test with Telegram API │      │  • Process /summary, /due     │ │
│   └─────────────┬─────────────┘      │  • Ground with Supabase Data  │ │
│                 │                    └──────────────┬────────────────┘ │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ 1. Upsert Bot Link                │ 2. Realtime Queries
                  ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE (PostgreSQL + RLS)                     │
│                                                                        │
│   • public.bot_links: stores token, chat_id, is_verified, preferences  │
│   • public.deals, public.payment_schedules: live portfolio data        │
│   • Edge Function / Webhook backup for background delivery             │
└────────────────────────────────────────────────────────────────────────┘
                  ▲                                   │
                  │ 3. Direct Telegram API (CORS OK)  │ 4. Send Responses
                  ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          TELEGRAM BOT API                              │
│             https://api.telegram.org/bot<TOKEN>/...                    │
│             (getMe, getUpdates, sendMessage, setWebhook)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Step-by-Step Implementation Sequence

1. **Direct Supabase Token Management (`js/data/api.js`)**:
   - Update `setTelegramBotToken(token, botUsername)`:
     - First, tests the token directly against `https://api.telegram.org/bot<token>/getMe` via browser `fetch` (CORS-friendly).
     - Retrieves the verified bot username (e.g., `@MyInvestmentOS_bot`).
     - Saves the token and configuration directly into the user's Supabase `public.bot_links` row under `platform = 'telegram'`.
     - Zero reliance on Node.js `/api/bot/telegram/set-token` &mdash; eliminating the 405 error on GitHub Pages.
   - Update `getTelegramBotConfig()`:
     - First checks Supabase `public.bot_links` for the active token and verification state.
     - Falls back to server API if a backend URL is configured.
2. **Client-Side Telegram Poller (`js/lib/telegramClientPoller.js`)**:
   - Implements a resilient client-side long poller using `https://api.telegram.org/bot<token>/getUpdates?offset=...&timeout=25`.
   - On incoming message:
     - Checks user verification code or authorized `chat_id`.
     - Executes commands:
       - `/start [code]` &rarr; Verifies and links the user's chat ID to their Supabase account.
       - `/summary` &rarr; Returns active capital, deal count, monthly yield, and overdue status.
       - `/due` &rarr; Lists upcoming payment dates for next 30 days.
       - `/overdue` &rarr; Lists any past-due payouts with borrower counter-party contacts.
       - `/gold` &rarr; Current gold holdings and live bullion valuation.
       - `/digest` &rarr; Daily portfolio briefing.
       - Natural language financial queries via Gemini AI.
     - Sends rich formatted HTML replies back via `https://api.telegram.org/bot<token>/sendMessage`.
3. **Settings UI Enhancements (`js/views/settings.js`)**:
   - Update the "Set BotFather Token" dialog:
     - Connects directly via Supabase + Telegram API without triggering 405.
     - Validates token format and live Telegram connectivity before saving.
   - Update "Cloud Backend Gateway" section:
     - Add smart helper note: If user types `github.io` or `qzz.io`, display a friendly banner: *"Note: This domain is a static frontend. Your bot uses direct Supabase connection &mdash; no backend URL required!"*
   - Add a Live Poller Status indicator in Settings showing:
     - `🟢 Active (Polling via Browser/PWA)` or `🌐 Active (Cloud Webhook)`
     - Updates processed counter and last message timestamp.
4. **Standalone Supabase Edge Function Webhook Reference (`supabase/functions/telegram-webhook/index.ts`)**:
   - Provide a clean, zero-maintenance Deno Edge Function script that can be deployed to Supabase with 1 command (`supabase functions deploy telegram-webhook`), providing 24/7 background webhook coverage when all browser tabs are closed.
5. **Testing & Verification**:
   - Verify token saving on both local and static domains without 405 errors.
   - Test Telegram `/start`, `/summary`, and `/due` commands.
   - Compile applet and verify zero build or lint warnings.
