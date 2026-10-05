# Universal Portfolio Recycle Bin & Foreground Modal Stacking Architecture

Fix the foreground z-index stacking bug so the Recycle Bin and 2-step confirmation modals always open on top of any active screen or parent modal, and expand both the Two-Step Deletion Protection and the Recycle Bin to cover ALL investment asset classes across the application (Deals, SIPs & Recurring, Gold & Bullion, Accounts/FDs, Expenses, and Liabilities).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed by the user in Phase 1 and govern this implementation:

- **Confirmed Decision 1 (Foreground z-index Stacking)**: Ensure modals opened via `App.ui.open` (including the Recycle Bin and Two-Step Delete modals) dynamically calculate or set an ultra-high foreground stacking index (`z-index: 120000`), resolving the bug where it was opening behind parent modals (such as the Emergency Reserve modal with `z-index: 10060`).
- **Confirmed Decision 2 (Universal Scope for All Investments)**: Expand soft-delete protection and the two-step confirmation beyond Fixed Deposits to ALL investment types: Investment Deals, Systematic Recurring / SIPs, Gold & Bullion, Accounts & FDs, Expense Projects/Transactions, and Liabilities.
- **Confirmed Decision 3 (Tabbed Organization)**: Structure the Recycle Bin modal with tabbed filtering: `All Items`, `Deals`, `SIPs & Recurring`, `Gold & Bullion`, `Accounts & FDs`, and `Expenses`.
- **Confirmed Decision 4 (Retention & Purge Controls)**: Include a default-enabled checkbox `[x] Automatically prune items older than 90 days` alongside the ability for the user to manually purge single items or empty the entire trash with two-step confirmation.
- **Confirmed Decision 5 (Access Locations)**: Provide clear entry points under **Settings** (Backup & Disaster Recovery) and across primary **Portfolio Views** (Deals, Recurring Investments, Gold, Net Worth, and Dashboard).

---

### 1. Root Cause & Solution Details

#### A. Modal Stacking & Background Issue
- **Root Cause**:
  Parent views (like the Dashboard Emergency Buffer modal, line 965 and line 1075 of `dashboard.js`) set inline styles with `z-index: 10060`, whereas `#sharedModalBackdrop` created by `App.ui.open` used `.modal-backdrop` which was defined in `css/app.css` with `z-index: 500`. Consequently, opening the Recycle Bin from within the Emergency Reserve modal caused it to render physically beneath the parent modal.
- **Fix**:
  1. In `App.ui.open`, dynamically assign `backdropEl.style.zIndex = 120000` (or 10 higher than the highest visible `.modal-backdrop`).
  2. In `css/app.css`, elevate the base `.modal-backdrop` index to `10000`.
  3. Ensure nested dialogs and confirmation modals always nest above whatever view opened them.

#### B. Universal Recycle Bin Service (`App.recycleBin`)
Expand `js/lib/recycleBin.js` with comprehensive type adapters:
- **Deals**: Restores deal details, platform attribution, principal, ROI, maturity, and re-links payment schedules via `App.api.createDeal`.
- **SIPs & Recurring**: Restores systematic investment plans and payment frequency via `App.api.createRecurringItem`.
- **Gold & Bullion**: Restores weight (grams), purchase rate, purity, provider, and total cost via `App.api.createGoldPurchase`.
- **Accounts & Fixed Deposits**: Restores account details, bank, maturity date, and interest rates via `App.api.createAccount`.
- **Expenses & Projects**: Restores expense transactions and projects via `App.api.createExpenseTransaction`.
- **Liabilities**: Restores loan/debt obligations via `App.api.createLiability`.

#### C. Tabbed UI with 90-Day Retention Filter
- The Recycle Bin modal will render tab navigation:
  `[All (${total})] [Deals (${dCount})] [SIPs (${rCount})] [Gold (${gCount})] [Accounts/FDs (${aCount})] [Expenses (${eCount})]`
- **Retention Checkbox**:
  `[x] Auto-prune items deleted more than 90 days ago` (enabled by default; automatically cleans up stale entries while keeping recent deletions safe).
- **Audit Columns**:
  - Item Name & Sub-Category
  - Asset Class / Investment Type
  - Amount / Invested Value
  - Deleted When (Date & Time)
  - Deleted By (`SIVAAIM12345@gmail.com`)
  - Actions: **"↩️ Restore"** and **"✕ Purge"**

---

### 2. User Experience & Visual Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  🗑️ Universal Portfolio Recycle Bin (Recover Deleted Investments)   ✕  │
├────────────────────────────────────────────────────────────────────────┤
│  [All (14)]  [Deals (3)]  [SIPs (2)]  [Gold (1)]  [Accounts/FD (6)]... │
├────────────────────────────────────────────────────────────────────────┤
│  ☑ Auto-purge items deleted >90 days ago        [ Empty Recycle Bin ]  │
│                                                                        │
│  Item Name          Type         Amount      Deleted When   Deleted By Actions  │
│  ────────────────────────────────────────────────────────────────────────────  │
│  HDFC 10L FD        Fixed Dep.   ₹10,00,000  Oct 05 07:15   SIVA...    [↩ Restore]│
│  Grip Corporate Bnd Deal         ₹2,00,000   Oct 02 11:20   SIVA...    [↩ Restore]│
│  Karat 24K Gold Bar Gold         ₹75,400     Sep 28 16:04   SIVA...    [↩ Restore]│
│  Nifty 50 Monthly   SIP          ₹15,000     Sep 20 09:30   SIVA...    [↩ Restore]│
│                                                                        │
│  [ Close ]                                                             │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Step-by-Step Implementation Roadmap

1. **Foreground Stacking & z-index Resolution (`js/lib/ui.js` & `css/app.css`)**:
   - Update `App.ui.open` in `js/lib/ui.js` to dynamically compute the topmost z-index or default to `120000`, ensuring any confirmation or Recycle Bin modal always displays in the foreground.
   - Update `css/app.css` to set `#sharedModalBackdrop` to `z-index: 120000`.

2. **Universal Item Restoration in `js/lib/recycleBin.js`**:
   - Implement handlers in `restoreItem` for all investment asset classes (`Deal`, `Recurring`, `Gold`, `Account`, `Expense`, `Liability`).
   - Add tabbed switching in `openTrashModal` (`All`, `Deals`, `SIPs`, `Gold`, `Accounts`, `Expenses`).
   - Add the 90-day retention toggle logic and auto-prune functionality.

3. **Wire 2-Step Confirmation & Soft Delete Across Portfolio Views**:
   - **Deals (`js/views/deals.js`)**: Integrate 2-step confirmation and Recycle Bin button in deals toolbar.
   - **Recurring / SIPs (`js/views/recurring.js`)**: Replace standard delete with 2-step confirmation and Recycle Bin button.
   - **Gold (`js/views/gold.js`)**: Protect gold purchase deletion with 2-step confirmation and Recycle Bin button.
   - **Expenses (`js/views/expenses.js`)**: Protect expense deletion with 2-step confirmation and Recycle Bin button.
   - **Net Worth & Accounts (`js/views/netWorth.js`)**: Maintain and verify Recycle Bin button and 2-step confirmation.
   - **Dashboard (`js/views/dashboard.js`)**: Verify foreground presentation of the Recycle Bin modal from within the Emergency Reserve modal.
   - **Settings (`js/views/settings.js`)**: Keep the central Recycle Bin management button in the Backup & Disaster Recovery panel.

4. **Verification & Testing**:
   - Compile via `compile_applet`.
   - Test modal opening from inside the Emergency Reserve dialog to verify foreground stacking.
   - Verify tabbed switching and restoration across each investment type.
