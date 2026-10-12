# Missed Payments Management & Website Directory Import Sync

Implement a dedicated **Missed Payments** management tab within the Payments workspace with actionable workflows (Record Payment, Reschedule, Waive) that synchronize seamlessly to deals and portfolio cash flows, and repair the Website Directory CSV import engine to ensure robust vault decryption/encryption and automatic recording to the Global Import history.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The architectural design aligns directly with the choices confirmed during clarification:
> - **Dedicated Tab Location**: A first-class tab **"Missed Payments"** placed in the primary Payments workspace alongside *Schedule*, *Ledger*, and *Reconciliation*.
> - **Comprehensive Action Capabilities**: Every missed payment row features an explicit action menu and quick-action buttons for **Record Payment**, **Reschedule Due Date**, and **Waive Payment**, with modal workflows for transaction logging and audit notes.
> - **Global Import History Sync**: Website Directory CSV imports seamlessly log structured execution records into the **Global Import** history tab (`import_history`), including item counts, success metrics, and timestamps.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **Missed Payments Tab & Action Suite**: Identifies overdue and unpaid installments across all deals in the portfolio. Provides inline and modal actions to immediately record receipts, adjust payment milestones (reschedule), or waive fees/installments with full synchronization into deal status, ledger balances, and portfolio KPIs.
  2. **Website Directory CSV Import Engine**: Fixes file parsing and cryptographic credential generation so bulk CSV records import directly into the user's unlocked Website & Account Vault, while reliably logging the import batch to the Global Import history table.
- **Target Audience / Persona**: Portfolio managers, investors, and operations leads tracking active deal servicing, loan schedules, overdue receivables, and secure website credentials.
- **Key Value**: Closes the operational loop on delinquent/missed payments by eliminating manual recalculation across deals and portfolio metrics, while providing reliable bulk data onboarding for website accounts.

---

### 2. User Experience & Visual Design

#### A. Key User Flows
1. **Missed Payments Review & Action Flow**:
   - The user opens the **Payments** screen and clicks the new **"Missed Payments"** tab (annotated with an overdue count badge).
   - A summary header displays key delinquent metrics: *Total Overdue Amount*, *Count of Delinquent Deals*, and *Average Days Overdue*.
   - The user filters or searches by deal name, borrower, or overdue severity (>30d, >60d, >90d).
   - In each row, the user can click:
     - **Record Payment**: Opens the payment drawer/modal with the deal and installment preselected, payment date defaulting to today, amount prefilled with principal/interest breakdown, and payment mode options. Submitting logs the payment, updates the schedule item to `PAID`, triggers deal balance recalculation, and refreshes the portfolio ledger.
     - **Reschedule**: Opens a date picker modal to set a new due date and optional notes. Updates schedule item date and resets status to `PENDING` / `UPCOMING`.
     - **Waive**: Opens a confirmation dialog requesting an optional waiver justification. Marks schedule status as `WAIVED`, adjusts expected deal totals, and logs an audit entry.
2. **Website Directory CSV Import Flow**:
   - In the **Website Vault** or **Global Import** tab, the user uploads a CSV file containing website credentials.
   - The system parses headers (Domain/Title, URL, Username, Password, 2FA/Notes, Category).
   - Accounts are encrypted and saved into `website_vault_items`.
   - A new import batch record is committed to `import_history` with type `WEBSITES`, filename, total processed, error counts, and status `COMPLETED`.
   - The vault view automatically re-renders and the Global Import history tab reflects the new entry with a direct badge.

#### B. Visual Theme & Layout Specifications
- **Tabular Numerals**: Overdue amounts, days delinquent, and deal identifiers utilize `font-variant-numeric: tabular-nums` (`font-mono`) to prevent visual shifting.
- **Status Indicators**:
  - Overdue badge: Subtle red/amber border and text (`st-missed` / `st-overdue`) adhering to the zero-pill design rules.
  - Days overdue kicker: Crisp typographic inline text (`42 days overdue · Deal #DL-104`).
- **High-Density Data Grid**: Row heights aligned between 38px and 44px with right-aligned currencies and left-aligned entities.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Integration with Existing `recordPayment` and Deal Sync**:
  - *Chosen Approach*: Leverage the core `App.api.recordPayment` routine rather than creating an isolated payments handler.
  - *Why*: Guarantees that ledger entries, deal balance reductions, and portfolio totals update in a single atomic flow with full schema integrity.
- **Decision 2: Comprehensive Overdue Detection**:
  - *Chosen Approach*: Combine explicit database status (`MISSED` or `OVERDUE`) and dynamically calculated overdue items (`status === 'PENDING'` with `due_date < today`).
  - *Why*: Prevents missed installments from silently vanishing if scheduled cron jobs or status update triggers have not run yet.
- **Decision 3: Global Import Logging Contract**:
  - *Chosen Approach*: Call `App.api.createImport` and `App.api.updateImport` whenever a Website Directory import is executed from either the Vault modal or Global Import tab.
  - *Why*: Fulfills the user requirement that website uploads are tracked in the Global Import tab with identical auditing standards as investment and payment sheets.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Payments Workspace                            │
│  [ Schedule ]    [ Ledger ]    [ Reconciliation ]    [ Missed Payments* ]│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Missed Payments Tab View                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Metrics Bar: Total Overdue · Delinquent Deals · Critical (>60d)  │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Overdue Schedule Table with Action Buttons                       │  │
│  │  - Deal & Contact Info   - Due Date & Days Overdue               │  │
│  │  - Expected Principal    - Expected Interest / Late Fee          │  │
│  │  - Actions: [ Record Payment ]  [ Reschedule ]  [ Waive ]        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
          [ Record Modal ]   [ Reschedule Modal ] [ Waive Modal ]
                 │                  │                  │
                 ▼                  ▼                  ▼
        App.api.recordPayment   App.api.updateSched   App.api.updateSched
                 │                  │                  │
                 └──────────────┬───┴──────────────────┘
                                ▼
         Recalculate Deal Totals & Refresh Global Portfolio Cash Flows
```

#### A. Interactive Handlers & State Mapping
- `renderMissedPaymentsTab(container, filterState)`: Queries payment schedules where `status in ('MISSED', 'OVERDUE')` or (`status = 'PENDING'` and `due_date < TODAY`).
- `openRecordMissedPaymentModal(scheduleItem)`: Prefills payment modal, records payment via `App.api.recordPayment`, updates schedule record to `PAID`, triggers `App.api.recalculateDeal(dealId)`, and updates portfolio totals.
- `openReschedulePaymentModal(scheduleItem)`: Prompts for new due date and reason, updates `due_date` and resets status to `PENDING`.
- `openWaivePaymentModal(scheduleItem)`: Sets status to `WAIVED`, logs notes, and recalibrates remaining obligations.
- `executeWebsiteCsvImport(file, rows)`: Parses CSV rows, creates encrypted items via `App.api.createWebsiteVaultItem`, calls `App.api.createImport({ type: 'WEBSITES', filename, ... })`, and marks completion in `import_history`.
