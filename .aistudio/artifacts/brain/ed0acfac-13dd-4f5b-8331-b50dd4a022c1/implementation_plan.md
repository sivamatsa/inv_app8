# Implementation Plan: Fix Share Target Triplication & Remove Website Vault Lock Screen

Resolve the 3x duplicate link saving issue when sharing URLs from Android/external apps to the PWA, and streamline Website Vault by removing the redundant lock screen so the vault opens directly when logged in, with an interactive confirmation prompt when sharing duplicate URLs.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed in Phase 1:

* **Website Vault Lock Screen**: Confirmed — **Remove lock screen and open vault directly when logged in**. When a user has an active session, navigating to Website Vault will immediately render the directory, accounts, and credentials without requiring an extra "Unlock Vault with Active Session" click.
* **Shared Link Deduplication**: Confirmed — **Prompt for confirmation if URL already exists in vault**. If a shared URL already exists in the user's Website Vault, present a clean confirmation dialog allowing the user to view the existing entry, update notes, save as a duplicate, or cancel. Simultaneous multi-trigger execution (POST SW broadcast, GET redirect broadcast, and window cold-launch URL parser) will be guarded by a strict concurrency lock so a single share action never saves multiple times automatically.

---

## 1. Overview & Core Concept

### What It Does
1. **Single-Execution Web Share Target**: Fixes the underlying PWA architecture where a single external share from Android Chrome or another app triggers three simultaneous save pipelines (Service Worker POST broadcast, Service Worker GET redirect broadcast, and DOM page load query string extraction). A concurrency mutex and deduplication token ensure the incoming share is processed exactly once.
2. **Duplicate URL Confirmation Modal**: Before persisting a newly shared URL, checks the user's existing Website Vault database. If the URL (or normalized domain/path) already exists, opens a confirmation dialog showing the existing entry details and providing clear choices (View Existing, Update Existing, Save New Copy, or Cancel).
3. **Frictionless Website Vault Access**: Eliminates the redundant locked gate overlay in `websiteVault.js`. Because Investment OS already mandates authenticated sign-in and biometric/PIN protection at the app level, the Website Vault will derive its in-memory PBKDF2/AES-256 session key automatically upon load, presenting the credentials directory immediately to authorized users.

### Key Value
* Eliminates frustrating duplicate clutter in the user's credential directory.
* Cuts unnecessary clicks and friction when accessing saved accounts and links.
* Delivers standard native-like mobile OS sharing behavior on Android.

---

## 2. User Experience & Visual Design

### Key User Flows

#### A. Sharing a Link From an External App (New URL)
1. User taps "Share" in Chrome, YouTube, Twitter, or WhatsApp and selects **Investment OS**.
2. Service worker intercepts the payload and focuses/opens the PWA window with a single deduplication token.
3. The app verifies the URL against Supabase `website_entries`.
4. URL is unique: Instantly persists to `website_entries`, displays toast `✓ Saved to Website Vault: [Title]`, smoothly scrolls to the card/row in `#vault`, and pulses the item with the gold accent highlight glow.

#### B. Sharing a Link That Already Exists in Vault (Duplicate URL)
1. User shares a link that matches an existing vault record.
2. The PWA navigates to `#vault` and displays a clean confirmation modal:
   * **Title**: `Website Already in Vault`
   * **Existing Entry Card**: Favicon, name, primary category badge, and saved date.
   * **Action Buttons**:
     * `👁️ View Existing` (primary: highlights existing card)
     * `➕ Save as New Entry` (creates an additional independent record)
     * `Cancel` (dismisses without changes)

#### C. Accessing Website Vault
1. User clicks **Website Vault** in the sidebar or navigation bar.
2. The vault opens directly into the multi-column directory with categories, search, accounts, and action toolbar.
3. No locked gate or "Unlock Vault with Active Session" button blocks the view.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Root Cause Fix for 3x Duplicate Saves
* **Problem**: 
  1. `sw.js` fetch handler intercepts the POST request and dispatches `c.postMessage({ type: 'SHARE_TARGET_RECEIVED' })` to all open window clients.
  2. `sw.js` then redirects with HTTP 303 to `index.html?share_target=1&url=...`.
  3. `sw.js` fetch handler intercepts the subsequent GET request with `?share_target=1` and dispatches *another* `SHARE_TARGET_RECEIVED` postMessage.
  4. The redirected browser window loads `index.html`, where `App.shareTarget.init()` runs `processIncomingShare()` reading `window.location.search`.
  5. `launchQueue.setConsumer(...)` also invokes `processIncomingShare()`.
  6. Each of these three pathways independently executed `saveSharedEntry()`, which directly called `App.api.createWebsite()`.
* **Chosen Approach**:
  * In `sw.js`: Streamline the fetch handler to perform the redirect cleanly without redundant double-postMessage dispatch.
  * In `shareTarget.js`: Add a transaction mutex (`isProcessingShare`, `lastProcessedShareSignature`, `lastProcessedShareTimestamp`) that debounces identical payloads within an 8-second window.
  * Before saving: Check active memory state and database for identical URL matches to trigger the user's requested confirmation flow.

### Decision 2: Elimination of Website Vault Locked Screen
* **Problem**: The vault locked screen required users to click "Unlock Vault with Active Session", which simply derived the PBKDF2 key from the user ID and session secret without requiring any additional password or biometric verification.
* **Chosen Approach**:
  * Remove `renderLockedState(pane)` blocking check in `websiteVault.js`.
  * Automatically initialize `App.vaultCrypto.unlockVault()` upon initial view load if logged in.
  * Preserve the manual "Lock Vault" button in the settings/menu if a user ever wishes to temporarily clear memory credentials, but default to unlocked on normal navigation.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   Android Share Sheet                  │
└───────────────────────────┬────────────────────────────┘
                            │ POST /share-target
                            ▼
┌────────────────────────────────────────────────────────┐
│               Service Worker (sw.js)                   │
│  - Captures POST formData                              │
│  - Redirects 303 to index.html?share_target=1&url=...  │
│  - (Removes duplicate postMessage broadcasting)        │
└───────────────────────────┬────────────────────────────┘
                            │ Clean 303 Navigation
                            ▼
┌────────────────────────────────────────────────────────┐
│            Share Target Manager (shareTarget.js)       │
│  - Intercepts query params & launchQueue               │
│  - In-flight Mutex & 8s Signature Debounce            │
│  - URL Normalization (http/https, trailing slash)      │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
     [URL is New]                 [URL Already Exists]
              │                           │
              ▼                           ▼
┌───────────────────────────┐   ┌────────────────────────┐
│   Save to website_entries │   │ Duplicate Confirmation │
│   Smooth Scroll Highlight │   │ Modal (View/Duplicate) │
└───────────────────────────┘   └────────────────────────┘
```

### Components to Update
1. **`sw.js`**: Remove redundant postMessage broadcasts on POST and GET share-target requests; rely on the clean 303 redirect payload so only the focused window processes the share.
2. **`js/lib/shareTarget.js`**:
   * Add concurrency mutex (`shareLock`) and timestamp signature cache.
   * Add duplicate check helper `findExistingVaultEntry(url)`.
   * Add duplicate confirmation dialog modal with options (`View Existing`, `Save Duplicate`, `Cancel`).
   * Clean URL query string immediately using `history.replaceState`.
3. **`js/views/websiteVault.js`**:
   * Remove the blocking `renderLockedState` screen so the vault renders directly when the user is logged in.
   * Auto-unlock the cryptographic session key on initial load.
   * Ensure highlight transitions continue to smoothly scroll to any newly saved or selected entry.
4. **`js/lib/vaultCrypto.js`**:
   * Ensure `isVaultLocked` defaults to false when an active authenticated user session is detected.
