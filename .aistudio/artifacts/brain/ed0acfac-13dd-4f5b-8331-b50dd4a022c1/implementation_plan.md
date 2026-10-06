# Custom Intelligence Cards & Expand/Collapse Architecture

Empower users to manually create, customize, and save custom date intelligence cards—specifically **Age & Living Duration Cards**, **Multi-Organization Career Experience Cards**, and **Custom Event Countdowns**—with global and per-card expand/collapse controls, multi-organization overlap warnings, and automatic cross-device synchronization via Supabase user profile metadata.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed by the user in Phase 1 and govern this implementation:

- **Confirmed Decision 1 (Storage)**: Custom intelligence cards will be saved and synchronized via the Supabase user profile (`profile.preferences.custom_intel_cards`) with local storage fallback, ensuring they sync across all browsers and devices.
- **Confirmed Decision 2 (Career Overlap Handling)**: Experience cards will allow overlapping employment dates between multiple organizations, calculating both the net calendar career span and total tenure, while highlighting concurrent stints with an informational warning banner.
- **Confirmed Decision 3 (Expand / Collapse UX)**: A unified Global Expand/Collapse All toggle will be placed in the toolbar alongside individual per-card collapse/expand toggles (`▼ / ▲`).

---

### 1. Custom Card Types & Capabilities

#### A. Card Type 1: Age & Living Duration Card (Auto-Updating Every Day)
- **User Inputs**:
  - Title (e.g., *"My Age"*, *"Child's Age"*, *"Incorporation Age"*)
  - Birth Date / Inception Date (e.g., `1995-05-14`)
  - End Date Mode: Default is **Live (`End = Today`)**, or optionally a fixed milestone date.
- **Dynamic Outputs**:
  - Exact age in **Years, Months, and Days** (e.g., `31 years, 4 months, 22 days`).
  - Total days alive/elapsed (e.g., `11,468 days`).
  - Weeks breakdown (e.g., `1,638 weeks, 2 days`).
  - Next birthday countdown badge (e.g., `Next birthday in 143 days`).
  - Automatically updates every morning with zero database writes.

#### B. Card Type 2: Career Experience Tracker Card (Multi-Organization Timeline)
- **User Inputs**:
  - Title (e.g., *"Total Career Experience"*)
  - Organization List (dynamically add/edit/remove multiple stints):
    - Company / Organization Name
    - Role / Designation
    - Start Date
    - End Date (or checkbox **"Currently Working Here / Present"**)
    - Key Skills or Notes
- **Dynamic Outputs**:
  - **Executive Experience Summary**: Total cumulative experience in Years, Months, and Days.
  - **Overlap Intelligence**: If two organizations overlap in dates, display both:
    - *Net Calendar Experience* (deduplicated continuous span)
    - *Cumulative Stint Experience* (summed tenure)
    - Alert banner: `⚠️ Notice: Concurrent employment detected between [Org A] and [Org B] (overlap: 3 months)`.
  - **Chronological Breakdown**: Stints arranged chronologically with tenure badges (e.g., `2 yrs 8 mos`), status badges (e.g., `Current Role`), and proportional timeline bars.

#### C. Card Type 3: Custom Countdown Card (Birthdays, Milestones & Events)
- **User Inputs**:
  - Event Name (e.g., *"30th Birthday Milestone"*, *"Joining Date"*, *"New Year 2027"*)
  - Target Date
  - Repeats Yearly checkbox (automatically advances countdown to next year once passed)
  - Category (Personal, Career, Family, Travel, Milestone)
  - Priority (High, Medium, Low)
- **Dynamic Outputs**:
  - Live days remaining (`87 days left`, `Tomorrow`, `Today`, `14 days ago`).
  - Weeks & months breakdown.
  - Progress bar if a start date is specified.

---

### 2. Expand & Collapse UX

1. **Global Toolbar Controls**:
   - `⤢ Expand All`: Opens the complete breakdowns, sub-timelines, and details across all cards.
   - `⤡ Collapse All`: Condenses all cards into a high-density executive summary view.
2. **Individual Per-Card Controls**:
   - Header chevron button (`▼ / ▲`) on each card.
   - Preserves expanded/collapsed state per card during the session.

---

### 3. Step-by-Step Implementation Roadmap

1. **Custom Cards Data & Sync Service (`js/views/dateIntelligence.js`)**:
   - Implement `loadCustomCards()`, `saveCustomCard(card)`, `deleteCustomCard(cardId)` syncing to `profile.preferences.custom_intel_cards`.
   - Age calculation engine (`calcExactAge(birthDate, endDate)`).
   - Career experience engine (`calcExperienceBreakdown(orgs)`), calculating exact stint tenures, net calendar duration, and overlap detection.
2. **Interactive Creation & Edit Modals**:
   - `openCreateCustomCardDialog()` with type selection:
     - `Age / Living Duration Card`
     - `Career Experience Card` (with interactive multi-organization add/remove inputs)
     - `Custom Countdown / Milestone Card`
3. **UI Dashboard Integration**:
   - Add **"+ Add Custom Card"** button and **"Expand All / Collapse All"** controls in the Date Intelligence toolbar.
   - Dedicated **"Custom Intelligence Cards"** section rendering Age cards, Experience cards, and Custom countdowns with full expand/collapse support.
   - Individual stint editor allowing users to add subsequent jobs to their career experience at any time.
4. **Verification & Testing**:
   - Compile via `compile_applet`.
   - Test Age card computation, verifying daily dynamic incrementation.
   - Test Experience card with 2+ organizations including an intentional overlap, verifying the warning badge and accurate net calculation.
   - Test global and per-card expand/collapse toggles.
