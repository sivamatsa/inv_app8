# Implementation Plan: App Versioning, PWA Update Engine & Release Changelog

A complete multi-tiered versioning and update system that resolves stubborn Chrome/PWA caching, provides real-time update detection with one-click and automatic reload, and displays the active version across the Sidebar footer, Topbar, and Settings About card with full Major/Minor release notes.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Based on your requirements and preferences, we have aligned on the following specifications:

- **Confirmed Decision 1 (All 3 Update Handlers)**:
  - **In-App Toast/Banner**: When an update is detected, a non-intrusive floating banner appears: *"New version v2.4.0 available. [Update Now]"*.
  - **Auto-Reload Option**: Smart auto-reload on launch/idle when a newer version has been cached by the service worker.
  - **Manual Update Check**: A dedicated **"Check for Updates"** button in Settings and in the Version details modal that pings the server, flushes the service worker, and confirms whether you are on the latest release.
  - **Emergency Cache Flush**: A 1-click **"Clear Cache & Hard Reload"** button specifically designed to fix installed Chrome PWAs that hold onto stale assets.
- **Confirmed Decision 2 (Version Displays in 3 Locations)**:
  - **Sidebar Footer**: Persistent badge at the bottom of the navigation drawer (`v2.4.0 · Stable`) with an active green status dot. Clicking it opens the **What's New** changelog modal.
  - **Topbar**: Subtle version chip next to the dashboard title (`v2.4.0`).
  - **Settings About Card**: Detailed **Application & Build Information** card with release date, semantic version, update status, and changelog breakdown of Major & Minor updates.

---

### 1. Root Cause Analysis: Why Chrome & Installed PWAs Delay Updates

1. **Service Worker Cache Trapping (`sw.js`)**:
   - `sw.js` had a static cache name (`investment-os-shell-v1`) that never changed.
   - Chrome's PWA runtime aggressively serves files from `CacheStorage` before consulting the network.
   - Even when files on the server changed, Chrome continued serving the cached bundle without triggering an update.
2. **Missing `controllerchange` Event Handlers**:
   - While `sw.js` had `self.skipWaiting()`, the client application did not listen for `navigator.serviceWorker.oncontrollerchange` to refresh the window when a new worker took control.
3. **No Centralized Version Endpoint**:
   - The app had no dedicated JSON version file or API route that the client could poll to compare its running version against the server's current release.

---

### 2. User Experience & Visual Design

#### A. Key User Flows

1. **Instant Version Visibility**:
   - Looking at the **Topbar** (`v2.4.0`), **Sidebar Footer** (`v2.4.0`), or **Settings**, the user can instantly verify whether their app is on the newest release.
2. **What's New & Release Changelog Modal**:
   - Clicking the version badge anywhere in the UI opens the **Personal Investment OS Release Notes** modal.
   - Displays structured tabs/badges for **Major Releases** (new systems like Telegram AI Copilot) and **Minor Updates** (enhancements, bug fixes, regional gold rate shifts).
3. **Seamless Update Flow for Chrome & Installed PWA**:
   - On app launch, tab focus, or background check (every 5 mins), the app queries `/version.json`.
   - If a new version is detected:
     - The Service Worker fetches the latest code in the background.
     - A floating notification appears: *"🚀 Update Ready: Version v2.4.0 is now available. [Reload Now]"*.
     - Clicking **Reload Now** activates the new service worker, purges stale caches, and refreshes the page to the latest code in under 1 second.
4. **Manual Check & Hard Reset in Settings**:
   - In **Settings &rarr; System & Application Version**:
     - Click **"Check for Updates"** &rarr; animates a spinner and reports *"You are on the latest version (v2.4.0)"* or initiates the update.
     - Click **"Force Clear Cache & Reload"** &rarr; unregisters all service workers, deletes all CacheStorage databases, and forces a hard reload (perfect for stubborn mobile Chrome shortcuts).

#### B. Visual Hierarchy & Restraint (Anti-AI Slop)

- Clean monospace version numbering (`v2.4.0`).
- Subtle inline status indicator: `● Up to date` in muted emerald, without loud flashing banners.
- Native dialog design for release notes with clean typography and clear release dates.

---

### 3. Key Technical Decisions & Trade-Offs

- **Decision 1: Centralized `version.json` + Runtime Constant**:
  - *Chosen Approach*: Maintain a canonical `version.json` at root that is also served via Express and statically on GitHub Pages.
  - *Why*: Works identically whether the app is hosted on Cloud Run (Node server) or GitHub Pages (static files).
- **Decision 2: Network-First Shell Strategy in Service Worker (`sw.js`)**:
  - *Chosen Approach*: For HTML/JS/CSS assets, attempt network fetch with a 2-second timeout before falling back to cache. Invalidate old caches on every version bump.
  - *Why*: Guarantees that users with an active internet connection always receive the latest files, while preserving offline PWA functionality.
- **Decision 3: Multi-Event Update Detection**:
  - *Chosen Approach*: Check for updates on:
    1. Initial page load
    2. Window `visibilitychange` (when returning to the installed PWA)
    3. `navigator.onLine` reconnect
    4. Background timer (every 10 minutes)
  - *Why*: Ensures installed PWAs don't stay stale for days in the background.

---

### 4. Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VERSIONING ENGINE                               │
│                                                                        │
│   ┌────────────────────────┐         ┌─────────────────────────────┐   │
│   │ /version.json          │         │ js/lib/version.js           │   │
│   │  • version: "2.4.0"    │ ◄───────┤  • App.version = "2.4.0"    │   │
│   │  • changelog: [...]    │         │  • App.updater.check()      │   │
│   └────────────────────────┘         └──────────────┬──────────────┘   │
└─────────────────────────────────────────────────────┼──────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────┐
                       ▼                                         ▼
┌──────────────────────────────────────────────┐   ┌─────────────────────────────┐
│             UI REPRESENTATION                │   │     SERVICE WORKER (sw.js)  │
│                                              │   │                             │
│ 1. Topbar: [ Dashboard  v2.4.0 ]             │   │ • CACHE_VERSION = 'v2.4.0'  │
│ 2. Sidebar Footer: [ v2.4.0 · Stable ● ]     │   │ • Auto-purges old caches    │
│ 3. Settings: [ About & System Version Card ] │   │ • Network-first shell       │
│ 4. Modal: [ What's New & Release Notes ]     │   │ • SKIP_WAITING broadcast    │
│ 5. Banner: [ Update Available (Reload Now) ] │   └─────────────────────────────┘
└──────────────────────────────────────────────┘
```

---

### Step-by-Step Implementation Sequence

1. **Create Canonical Version Definition (`version.json`)**:
   - Create `version.json` with semantic version (`2.4.0`), release timestamp, build ID, and full changelog detailing Major (Telegram AI Copilot, Cloud Gateway) and Minor (Gold valuation, UI enhancements) updates.
2. **Upgrade Service Worker Lifecycle (`sw.js`)**:
   - Update `CACHE_NAME` to `investment-os-shell-v2.4.0`.
   - Implement network-first strategy for navigation and script requests.
   - Listen for `SKIP_WAITING` message to activate immediately.
   - Add automated purge of all caches not matching `investment-os-shell-v2.4.0` during `activate`.
3. **Build the Client Update Engine (`js/lib/version.js`)**:
   - Define `App.version = '2.4.0'`.
   - Expose `App.updater.checkForUpdates()` with server comparison.
   - Implement floating update toast with 1-click **Reload Now**.
   - Implement `App.updater.forceClearCache()` to purge CacheStorage and ServiceWorker registrations.
   - Expose `App.updater.showReleaseNotesModal()` to view the changelog.
4. **Add UI Elements (Sidebar, Topbar, Settings)**:
   - **Topbar (`index.html`)**: Add clickable `v2.4.0` badge next to the title.
   - **Sidebar (`index.html` & `js/app.js`)**: Add a pinned footer inside `#appSidebar` displaying `v2.4.0 · Stable` with status dot.
   - **Settings (`js/views/settings.js`)**: Add a dedicated **"System & Application Version"** panel with "Check for Updates", "What's New", and "Force Clear Cache" buttons.
5. **Testing & Verification**:
   - Verify version displays in all 3 locations.
   - Test "Check for Updates" and "What's New" modal dialogs.
   - Test PWA cache clearing and update trigger.
   - Compile applet and restart server to verify clean build.
