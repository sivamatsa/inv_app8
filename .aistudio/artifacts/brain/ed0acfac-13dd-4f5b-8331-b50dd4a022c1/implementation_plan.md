# Website Vault Responsiveness, Cross-Device Sync, Directory Import & Dashboard Habit Tracker

Comprehensive architecture and implementation plan addressing mobile and desktop dual-view display issues, multi-device synchronization for the Website & Account Vault, global and vault-level CSV/Excel directory import with template generation, and a new dashboard Daily Financial Habit Tracker with streaks and custom habit creation.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions incorporate your confirmed answers from Phase 1:

- **Confirmed Decision 1 (Daily Habit Tracker)**: The Dashboard will feature a dedicated **Daily Financial Habit Tracker** component offering an actionable daily checklist, live progress ring/meter, consecutive-day streak counter (e.g. 🔥 5-day streak), and a quick modal to create and manage custom habits.
- **Confirmed Decision 2 (Import Buttons & Template)**: Import will be accessible from **both** the Website Vault toolbar (`📥 Import Directory`) and the Global Import Center (`js/views/imports.js`). It includes a one-click template download (`Websites_Directory_Template.csv` / `.xlsx`) populated with clear sample rows that are automatically excluded during import.
- **Confirmed Decision 3 (Security Controls)**: Per your clarification regarding authorization, extra custom PIN/biometric gates are omitted. The vault leverages account session identity for stable AES-256-GCM symmetric decryption across devices, with configurable auto-lock duration, default password masking, and clipboard auto-clear in Vault Settings.

---

### 1. Overview & Core Concept

- **What It Delivers**:
  1. **Responsive Dual View & Toolbar**: Fixes the 240px static sidebar layout and cramped toolbar controls. On mobile screens (<768px), the layout smoothly switches to a responsive vertical stack with category scroll chips, full-width search, and dedicated touch-target buttons (≥44px). The Compact Table view gains smooth horizontal scrolling (`-webkit-overflow-scrolling: touch`) so tables never break mobile viewports.
  2. **Reliable Multi-Device Sync**: Resolves the synchronization mismatch between mobile and laptop. Fixes the `column website_groups.undefined does not exist` query error in `selectAll`, stabilizes PBKDF2 key derivation using stable account identity so passwords decrypted on a second device succeed without session-token mismatch, wraps queries in resilient `Promise.allSettled`, and registers vault tables for real-time Postgres broadcast updates.
  3. **Websites Directory Import & Template**: Provides a prominent `📥 Import Websites` action in the vault toolbar and integrates a dedicated Websites tab into the Global Import wizard. Users can download a pre-formatted template with dummy guide entries. The parser detects and skips dummy guide rows so only the user's authentic data is stored.
  4. **Dashboard Daily Goal Tracker**: Adds a clean, motivating daily habits card into the main Dashboard view. Users can check off daily financial habits (such as logging transactions, checking gold spot rates, verifying bills, or monitoring portfolio metrics) with daily streak tracking and custom habit additions.

- **Target Persona**: Personal investors and active portfolio managers tracking credentials, banking portals, and recurring financial discipline across both smartphone and laptop screens.

---

### 2. User Experience & Visual Design

#### A. Mobile & Desktop Layout Architecture
- **Desktop (≥1024px)**:
  - Left navigation sidebar (240px) with clean view categories and count badges.
  - Main workspace with toolbar: responsive search bar with instant clear button, Sort dropdown (`Name`, `Recently Used`, `Recently Added`, `Importance`, `Upcoming Renewal`), and segmented toggle (`🗂️ Cards` vs `☰ Table`).
  - Cards grid auto-fits at `minmax(320px, 1fr)`. Compact Table view provides structured tabular view with fixed action columns and monospaced credential fields.
- **Mobile (<768px)**:
  - Vault sidebar collapses into horizontal swipeable category chips at the top (`All`, `Favorites`, `Banking`, `P2P`, `Gold`, `+ More Categories`), preventing the main content from being squeezed off-screen.
  - Toolbar stacks into two clean rows: Row 1 is a full-width search input; Row 2 displays Sort dropdown, view mode toggle, and Import/Add action buttons with touch hitboxes $\ge 44\text{px}$.
  - Compact Table view wrapped in `.table-scroll` container with horizontal touch-scroll indicator so all columns (Service, Category, Login ID, Password, Actions) remain easily accessible on 375px–430px viewports without horizontal clipping.

#### B. Dashboard Daily Habit Tracker Component
- **Placement**: Integrated into the Dashboard right alongside the macro Portfolio Goals card, completing the progression loop between micro daily habits and macro portfolio milestones.
- **Visual Design**:
  - Distinct gold-and-teal accented container with today's date badge and active streak counter (`🔥 X Days Streak`).
  - Progress bar showing `X of Y completed today (Z%)`.
  - Actionable checklist with 44px hit-target checkboxes for one-tap completion on phone or laptop.
  - Preloaded with actionable habits:
    - *Tracked daily spending / recorded cash receipt*
    - *Checked gold rates & bullion spot prices*
    - *Verified recurring investments & upcoming dues*
    - *Reviewed banking or investment portal balances*
  - `+ Add Habit` modal allowing custom habit title, icon, and frequency.

#### C. Websites Directory Import & Template Flow
- **Toolbar Trigger**: Prominent `📥 Import Directory` button located in both the Website Vault top action bar and the Global Import center (`#pane-import`).
- **Template Generator**: Download button generates `Websites_Directory_Template.csv` pre-filled with 3 clearly marked sample entries (`[Sample] HDFC NetBanking`, `[Sample] Groww Mutual Funds`, `[Sample] MMTC-PAMP Gold`).
- **Smart Dummy Data Stripping**: The importer checks each row. Rows containing `[Sample]` or placeholder domains are flagged and automatically skipped with an informative notice: *"3 dummy template rows skipped, 5 real records imported."*

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Device-Agnostic Cryptographic Key Derivation**:
  - *Chosen Approach*: Derive vault encryption keys from the stable user account identity (`user.id` + stable account salt) rather than the volatile per-device `session.access_token`.
  - *Why*: In Supabase Auth, `access_token` values are distinct per device and change on token refresh. Deriving symmetric AES-GCM keys from volatile access tokens meant mobile-encrypted data could not be decrypted on a laptop. Using the stable user identifier allows seamless cross-device synchronization while preserving AES-256-GCM authenticated encryption.
- **Decision 2: Resilient Data Fetching with `Promise.allSettled`**:
  - *Chosen Approach*: Replace strict `Promise.all` in `loadData()` with `Promise.allSettled` and safeguard `selectAll` ordering parameters against `undefined` column errors.
  - *Why*: A minor ordering syntax issue in `website_groups` previously caused the entire vault view to crash and display zero websites. With resilient resolution and guarded SQL parameters, website entries always load and render even if secondary group tags require a fallback.
- **Decision 3: Habit Tracker State Persistence**:
  - *Chosen Approach*: Store daily habit state in user-scoped database settings (`App.api.saveVaultSettings` / `system_kv` / localStorage dual-write) with automatic day rollover based on local calendar dates.
  - *Why*: Ensures habit check-offs made on mobile are immediately reflected when opening the dashboard on laptop, without requiring schema modifications.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PERSONAL INVESTMENT OS                           │
├──────────────────────────────────────┬──────────────────────────────────────┤
│              DASHBOARD VIEW          │         WEBSITE & ACCOUNT VAULT      │
│  ┌────────────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │ Daily Habit Tracker Component  │  │  │ Responsive Toolbar & Filters   │  │
│  │ - Daily Check-off List         │  │  │ - Search (375px-1440px)        │  │
│  │ - Streak Counter & Progress    │  │  │ - Cards View 🗂️ / Table ☰     │  │
│  │ - "+ Add Habit" Modal          │  │  │ - Horizontal Mobile Scroll     │  │
│  └────────────────────────────────┘  │  └────────────────────────────────┘  │
│                  │                   │                  │                   │
│                  ▼                   │                  ▼                   │
│  ┌────────────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │ Global Data Import Center      │  │  │ Import Directory Modal & CSV   │  │
│  │ - Added "Website Vault" Tab    │  │  │ - Template with Sample Data    │  │
│  │ - Unified Excel / CSV Wizard   │  │  │ - Auto Dummy Row Filter        │  │
│  └────────────────────────────────┘  │  └────────────────────────────────┘  │
├──────────────────────────────────────┴──────────────────────────────────────┤
│                          CORE CLIENT & SYNC LAYER                           │
│  ┌─────────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐  │
│  │ vaultCrypto.js          │  │ api.js              │  │ Realtime Sync   │  │
│  │ - Cross-device PBKDF2   │  │ - selectAll Fix     │  │ - Vault channel │  │
│  │ - AES-256-GCM cipher    │  │ - listWebsites      │  │ - Echo suppr.   │  │
│  └─────────────────────────┘  └─────────────────────┘  └─────────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                 Supabase PostgreSQL Backend (Remote)                 │  │
│  │ - website_entries  - website_accounts  - website_groups  - settings    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Step-by-Step Execution Plan
1. **Fix `api.js` Order Parser & Real-Time Sync**:
   - Guard `selectAll(table, opts)` against `{ order: { column: undefined } }` to eliminate `column website_groups.undefined does not exist`.
   - Update `listWebsites` to handle null or empty groups gracefully.
   - Add `website_entries` and `website_accounts` to real-time subscription channels.
2. **Fix `vaultCrypto.js` Cross-Device Key Derivation**:
   - Update `deriveSessionKey` to use stable `userId` and salt so data encrypted on mobile decrypts on laptop seamlessly.
3. **Refactor `websiteVault.js` for Mobile & Desktop Responsiveness**:
   - Add media queries and responsive wrappers to `vault-body-layout` so the sidebar collapses into a top horizontal scrollbar on mobile.
   - Refactor `.vault-toolbar` into responsive flex wrapping with full-width search input on small screens.
   - Ensure `.vault-cards-grid` and `renderCompactTable` scroll smoothly on mobile with touch support.
4. **Implement Directory Import & Template**:
   - Add `📥 Import Directory` button directly on the vault toolbar.
   - Implement `generateWebsitesTemplate()` creating a CSV/XLSX template with dummy rows.
   - Build import parser with duplicate URL detection and automatic dummy row exclusion.
   - Add Website Vault import option to `js/views/imports.js`.
5. **Build Dashboard Daily Goal Tracker**:
   - Implement `renderDailyHabitsTracker()` in `js/views/dashboard.js`.
   - Add streak calculation logic, toggle event handlers, and `+ Add Habit` modal.
6. **Compile & Lint Verification**:
   - Run syntax checks and `compile_applet` to confirm build health.
