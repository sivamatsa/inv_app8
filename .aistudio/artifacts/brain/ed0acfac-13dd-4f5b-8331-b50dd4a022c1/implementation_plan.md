# Share URLs Directly to Investment OS Website Vault

Implement a zero-friction **Share to Website Vault** feature for Personal Investment OS, enabling Android Chrome and compatible mobile apps to share URLs and webpage titles directly into the user's encrypted Website Vault via the PWA Web Share Target API, with multi-tier category auto-detection, immediate toast feedback, seamless vault navigation, and an accompanying lightweight Android APK intent wrapper specification.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The architectural design directly incorporates the three implementation decisions confirmed during clarification:
> - **Share Target Architecture**: PWA Web Share Target API implemented via `manifest.json` and `sw.js` for instant browser/Android Sharesheet registration, accompanied by a lightweight Android native wrapper guide with `ACTION_SEND` intent filter configuration for standalone APK builds.
> - **Intelligent Multi-Tier Category Auto-Detection**: Incoming shared URLs undergo automatic domain and keyword parsing to assign existing categories (e.g., *Banking & Finance*, *Recharge & Utilities*, *Stocks & Mutual Funds*, *Shopping & Payments*). If domain heuristics fail or find no match, entries default gracefully to *General* / *Shared Links*.
> - **Post-Save Navigation & Visual Feedback**: Upon receiving a share, the application displays a crisp success toast, navigates directly to the Website Vault view (`#vault`), smooth-scrolls to the newly created entry, and applies an attention highlight pulse.
> - **Duplicate Handling**: Strict compliance with user directive — repeated shares of identical URLs create separate, independent vault entries without blocking, merging, or overwriting.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. Registers Investment OS as an official Android Sharesheet destination through the W3C Web Share Target API (`action`, `params: { url, title, text }`) in `manifest.json`.
  2. Intercepts incoming share invocations in both closed (cold launch) and active (background/warm) app states via a dedicated URL handler (`js/lib/shareTarget.js`).
  3. Sanitizes and validates the incoming payload, extracting HTTP/HTTPS URLs from either the dedicated URL parameter or embedded text snippets, and deriving high-fidelity titles (with clean domain fallback when titles are omitted).
  4. Persists the record directly into Supabase `website_entries` using the user's authenticated session, respecting Row-Level Security (RLS) and existing vault encryption structures.
  5. Stashes pending shares in `sessionStorage` if the user is unauthenticated, automatically saving the item once the session is unlocked.
- **Target Audience / Persona**: Mobile portfolio investors, researchers, and financial operators quickly saving banking platforms, utility portals, financial news, investment articles, and loan/deal counterparty sites from mobile browsers directly to their personal vault.
- **Key Value**: Eliminates the multi-step chore of copying a URL, opening Investment OS, unlocking, clicking Add Website, pasting, and typing names. One tap on Android's native Share menu immediately archives the link.

---

### 2. User Experience & Visual Design

#### A. Key User Flows
1. **Cold & Warm Share Flow (Authenticated)**:
   - User browses a portal in Chrome (e.g., `https://netbanking.hdfcbank.com` or `https://zerodha.com`) on Android and taps **Share**.
   - The Android Sharesheet displays **Investment OS** with its custom icon.
   - User taps Investment OS; the PWA launches or shifts to focus.
   - The share handler intercepts parameters (`?share_target=1&url=...&title=...`).
   - Category heuristics identify the domain (e.g., `hdfcbank.com` $\rightarrow$ *Banking & Finance*).
   - The entry is immediately committed to Supabase `website_entries`.
   - The browser URL query parameters are cleaned via `history.replaceState`.
   - A crisp toast appears: `✓ Saved to Website Vault: HDFC NetBanking`.
   - The viewport automatically routes to `#vault`, loads the entries, smooth-scrolls to the new item, and triggers a 2-second glow border highlight.
2. **Unauthenticated Share Flow**:
   - If the user is logged out or session is expired, the payload is safely persisted to `sessionStorage.setItem('pending_shared_vault_item', ...)` without data loss.
   - The login screen presents a status notice: `Shared link pending: example.com. Sign in to save to your vault.`
   - Once credentials are verified, the pending item is committed automatically, followed by the vault navigation and toast.
3. **Invalid or Malformed Share Flow**:
   - If incoming text contains no valid HTTP/HTTPS link, a warning toast is shown: `Invalid or missing URL in shared content.` The app routes to `#vault` safely without writing corrupted records.

#### B. Visual Theme & Layout Specifications
- **Toast Feedback**: Crisp domain notification adhering to anti-slop rules (no excessive gradients; clean dark background `#0f172a`, border `#1e293b`, text `#f8fafc`, subtle emerald accent indicator).
- **Vault Highlight Style**: The newly saved website card receives a temporary CSS class `.vault-item-just-added` featuring a high-contrast 2px accent outline (`#16C9A3` / cyan emerald) that smoothly fades over 2.5 seconds.
- **Zero-Pill Adherence**: Shared entries display clean typographic metadata (e.g., `Domain · Shared via Mobile · Just now`) without clumsy pill capsules.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: GET vs. POST Web Share Target**:
  - *Chosen Approach*: Configure `GET` parameters (`action: "./index.html"`, `params: { url: "url", title: "title", text: "text" }`) combined with a service worker fallback in `sw.js` that handles both GET queries and POST form data.
  - *Why*: GET-based Web Share Target has universal, rock-solid support across Android Chrome, Edge, and Samsung Internet without requiring complex multipart service-worker body parsing. Service worker POST interception provides a safety net if sharing applications dispatch form posts.
- **Decision 2: Dedicated Modular Share Handler (`js/lib/shareTarget.js`)**:
  - *Chosen Approach*: Encapsulate URL extraction, regex parsing, domain categorization, and Supabase persistence into an isolated helper module imported into `index.html`.
  - *Why*: Prevents cluttering `websiteVault.js` or `app.js`, guarantees testability, and allows direct reuse in both PWA boot routines and future Android wrappers.
- **Decision 3: Multi-Tier Category Auto-Detection Engine**:
  - *Chosen Approach*: Regex match domain hostnames and title tokens against existing vault categories:
    - `Banking & Finance`: `hdfc`, `sbi`, `icici`, `axis`, `kotak`, `bank`, `paytm`, `phonepe`, `gpay`
    - `Stocks & Mutual Funds`: `zerodha`, `groww`, `upstox`, `angelone`, `nseindia`, `bseindia`, `moneycontrol`
    - `Gold Investment`: `tanishq`, `kalyan`, `malabar`, `bullion`, `gold`
    - `Recharge & Utilities`: `airtel`, `jio`, `vi.in`, `bescom`, `tneb`, `bill`, `recharge`
    - `Shopping & Payments`: `amazon`, `flipkart`, `myntra`, `swiggy`, `zomato`
    - `Government & Tax`: `incometax`, `epfindia`, `uidai`, `gst`, `parivahan`
    - *Fallback*: If no rule matches, categorize as `General` (or `Shared Links`).
  - *Why*: Fulfills the user's explicit preference ("Build all 2 and 3, first auto detect if it fails to 2").
- **Decision 4: Intentional Duplicates Policy**:
  - *Chosen Approach*: Always insert a new row into `website_entries` with a fresh `id` and current timestamp, allowing identical URLs.
  - *Why*: Complies with user requirement Section 5. Users frequently re-share portals for different accounts or project notes.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Android OS / Mobile Browser Ecosystem                │
│                                                                        │
│   [ Chrome / Firefox / Edge ]           [ Android Native Apps ]        │
│                │                                   │                   │
│   (Tap Share in Browser)                 (Tap Share in App)            │
│                └─────────────────┬─────────────────┘                   │
│                                  │                                     │
│                                  ▼                                     │
│                      [ Android Sharesheet Menu ]                       │
│                     ┌───────────────────────────┐                      │
│                     │  ★ Investment OS (PWA)   │                      │
│                     └─────────────┬─────────────┘                      │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               │                                         │
               ▼                                         ▼
┌───────────────────────────────┐     ┌──────────────────────────────────┐
│     PWA Web Share Target      │     │    Android Wrapper Alternative   │
│  manifest.json (share_target) │     │  AndroidManifest.xml intent-filter│
│  sw.js fetch interception     │     │  ACTION_SEND (text/plain)        │
└──────────────┬────────────────┘     └──────────────────┬───────────────┘
               │                                         │
               └────────────────────┬────────────────────┘
                                    │ Launches / Focuses
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Investment OS App Shell (index.html)                   │
│                                                                        │
│  1. Check URL parameters (?share_target=1&url=...&title=...&text=...)  │
│                                                                        │
│  2. App.shareTarget.processIncomingShare()                             │
│     ├── Extract & validate HTTP/HTTPS URL                              │
│     ├── Extract title or fallback to hostname                          │
│     └── Auto-detect Category (Tier 1 regex -> Tier 2 'General')        │
│                                                                        │
│  3. Authentication Gate:                                               │
│     ├── If Auth Ready:                                                 │
│     │   └── App.api.createWebsite(...) ──► Supabase website_entries    │
│     │       ├── Replace state (clean browser URL params)               │
│     │       ├── App.utils.toast('Saved to Website Vault', 'ok')        │
│     │       └── App.router.navigate('vault') + Highlight Element       │
│     │                                                                  │
│     └── If Logged Out / Locked:                                        │
│         └── Stash in sessionStorage('pending_shared_vault_item')       │
│             └── Auto-save listener triggered upon App.auth 'LOGIN'     │
└────────────────────────────────────────────────────────────────────────┘
```

#### A. Files to Update & Create
1. **`manifest.json`**:
   - Add the standard `share_target` configuration:
     ```json
     "share_target": {
       "action": "./index.html",
       "method": "GET",
       "enctype": "application/x-www-form-urlencoded",
       "params": {
         "title": "title",
         "text": "text",
         "url": "url"
       }
     }
     ```
2. **`sw.js`**:
   - Enhance the `fetch` listener to detect any POST-based share target submissions (if sent by specific user agents), converting payload to redirect navigation so data is never dropped.
3. **`js/lib/shareTarget.js` (New Module)**:
   - `extractUrlAndTitle(params)`: Robust regex extraction ensuring URLs inside freeform text are accurately parsed and Javascript/data schemes are rejected.
   - `autoDetectCategory(url, title)`: Keyword & domain matcher against existing categories with fallback to `General`.
   - `handlePendingShare()`: Checks `sessionStorage` upon authentication.
   - `saveSharedEntry(data)`: Calls `App.api.createWebsite()`, fires toast, navigates to `#vault`, and marks highlight state.
4. **`js/views/websiteVault.js`**:
   - Support `highlightSiteId` state parameter to scroll to the target entry and add visual pulsing animation.
5. **`index.html`**:
   - Include `<script src="js/lib/shareTarget.js"></script>` in correct load order before router initialization.
6. **`ANDROID_WRAPPER_GUIDE.md` (New Documentation Artifact)**:
   - Provide minimal, production-grade instructions for scaffolding a Trusted Web Activity (TWA) or Android WebView wrapper using Android Studio, including `AndroidManifest.xml` intent-filter snippet for `android.intent.action.SEND` with MIME type `text/plain`.
