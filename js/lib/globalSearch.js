/* ============================================================================
   PIOS OS-WIDE COMMAND & NATURAL LANGUAGE SEARCH ENGINE
   ============================================================================
   Transforms topbar search into an OS-wide Intelligent Command Palette:
   - Natural Language Questions ("What do I need to pay next week?" -> Action Center)
   - Intelligent Keywords ("pending" -> Everything pending across the OS)
   - Asset Intelligence ("gold" -> Gold Intelligence Hub & purchase records)
   - Financial Figures ("₹15000" / "15k" -> Matching transactions & commitments)
   - Timeframe / Maturity ("maturity next month" -> Investments maturing next month)
   - OS Commands ("> Add Deal", "> Record Payment", "> Export", "> Toggle Theme")
   - Full Multi-Entity Search (Deals, Payments, Recurring, Expenses, Contacts,
     Gold, Notes, Documents, Goals, Chat, Support, Platforms, Admin Users).
   - Global Keyboard Palette: ⌘K / Ctrl+K / / to open, Arrow keys, Enter, Esc.
   ============================================================================ */

window.App = window.App || {};

App.globalSearch = (function () {
  function esc(s) { return App.utils.escapeHtml(s == null ? '' : String(s)); }

  let selectedIndex = -1;
  let currentResultsList = [];

  // Helper: check if a text contains query
  const matches = (q, ...fields) => fields.some((f) => f && String(f).toLowerCase().includes(q));

  // Date parsing helpers
  function parseDateWindow(type) {
    const now = new Date();
    const todayISO = App.utils.todayISO();

    if (type === 'next_week') {
      const in7 = App.utils.toISO(new Date(now.getTime() + 7 * 86400000));
      return { start: todayISO, end: in7, label: 'Next 7 Days' };
    }
    if (type === 'this_week') {
      const day = now.getDay();
      const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diffToMonday));
      const sunday = new Date(now.setDate(diffToMonday + 6));
      return { start: App.utils.toISO(monday), end: App.utils.toISO(sunday), label: 'This Week' };
    }
    if (type === 'next_month') {
      const nextM = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endNextM = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const monthName = nextM.toLocaleString('default', { month: 'long' });
      return { start: App.utils.toISO(nextM), end: App.utils.toISO(endNextM), label: `${monthName} ${nextM.getFullYear()}` };
    }
    if (type === 'this_month') {
      const curM = new Date(now.getFullYear(), now.getMonth(), 1);
      const endCurM = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthName = curM.toLocaleString('default', { month: 'long' });
      return { start: App.utils.toISO(curM), end: App.utils.toISO(endCurM), label: `${monthName} ${curM.getFullYear()}` };
    }
    if (type === 'next_30_days') {
      const in30 = App.utils.toISO(new Date(now.getTime() + 30 * 86400000));
      return { start: todayISO, end: in30, label: 'Next 30 Days' };
    }
    return { start: todayISO, end: App.utils.toISO(new Date(now.getTime() + 7 * 86400000)), label: 'Upcoming' };
  }

  // Parse numerical amount from query (e.g. ₹15000, 15000, 15k, 1.5L, $500)
  function parseAmountQuery(raw) {
    if (!raw) return null;
    const clean = raw.trim().replace(/,/g, '').toLowerCase();

    // Check for k / lakh / cr suffix
    const kMatch = clean.match(/^[₹$€£]?\s*(\d+(?:\.\d+)?)\s*k$/i);
    if (kMatch) return Number(kMatch[1]) * 1000;

    const lMatch = clean.match(/^[₹$€£]?\s*(\d+(?:\.\d+)?)\s*(?:l|lac|lakh)s?$/i);
    if (lMatch) return Number(lMatch[1]) * 100000;

    const crMatch = clean.match(/^[₹$€£]?\s*(\d+(?:\.\d+)?)\s*(?:cr|crore)s?$/i);
    if (crMatch) return Number(crMatch[1]) * 10000000;

    // Check direct number
    const numMatch = clean.match(/^[₹$€£]?\s*(\d+(?:\.\d+)?)$/);
    if (numMatch) {
      const val = Number(numMatch[1]);
      return val > 0 ? val : null;
    }
    return null;
  }

  // Detect query intention type
  function detectQueryIntent(rawQuery) {
    const q = rawQuery.trim().toLowerCase();

    // 1. Action Center / Upcoming payments question
    // E.g. "What do I need to pay next week?", "what to pay next week", "bills due next week", "what needs attention?"
    const isPaymentQuestion = /(what|how much|when|where|which).*(need to|have to|should i|do i|due|pay|incoming|outflow|action|attention|bills)/i.test(q)
      || /(pay next week|due next week|pay next month|due this week|upcoming payments|bills due|what needs attention|action center)/i.test(q);

    if (isPaymentQuestion) {
      let windowType = 'next_week';
      if (q.includes('next month')) windowType = 'next_month';
      else if (q.includes('this week')) windowType = 'this_week';
      else if (q.includes('this month')) windowType = 'this_month';
      else if (q.includes('today')) windowType = 'this_week';
      return { type: 'action_center_question', windowType, raw: rawQuery };
    }

    // 2. Pending / Due / Attention keyword
    // E.g. "pending", "due", "overdue", "unpaid", "pending items", "everything pending"
    if (q === 'pending' || q === 'due' || q === 'overdue' || q === 'unpaid' || q === 'everything pending' || q === 'pending payments' || q === 'attention') {
      return { type: 'all_pending', raw: rawQuery };
    }

    // 3. Maturity queries
    // E.g. "maturity next month", "maturing next month", "maturing in 2026", "maturing soon", "maturity planner", "maturity this month"
    const isMaturity = /(maturity|maturing|mature|matures)/i.test(q);
    if (isMaturity) {
      let windowType = 'next_month';
      if (q.includes('this month')) windowType = 'this_month';
      else if (q.includes('next 30 days') || q.includes('soon') || q.includes('30 days')) windowType = 'next_30_days';
      else if (q.includes('this week') || q.includes('next week')) windowType = 'next_week';
      return { type: 'maturity_query', windowType, raw: rawQuery };
    }

    // 4. Gold queries
    // E.g. "gold", "gold records", "gold price", "gold intelligence", "gold purchases"
    if (q === 'gold' || q === 'gold records' || q === 'gold purchases' || q === 'gold intelligence' || q === 'gold price' || q === 'gold scheme' || q === '24k' || q === '22k') {
      return { type: 'gold_hub', raw: rawQuery };
    }

    // 5. Amount queries
    // E.g. "₹15000", "15000", "15k", "$500", "50000", "1.5L"
    const amountVal = parseAmountQuery(rawQuery);
    if (amountVal !== null && amountVal >= 10) {
      return { type: 'amount_match', amount: amountVal, raw: rawQuery };
    }

    // 6. OS Commands
    // E.g. "> Add Deal", "> Record Payment", "> Export", "> Dark mode", "add deal", "new deal", "record payment"
    if (q.startsWith('>') || q.startsWith('goto ') || q.startsWith('open ') || q.startsWith('add ') || q.startsWith('new ') || q === 'export' || q === 'theme' || q === 'dark mode' || q === 'light mode' || q === 'calculator' || q === 'tape') {
      return { type: 'command_intent', clean: q.replace(/^>\s*/, ''), raw: rawQuery };
    }

    return { type: 'standard_search', raw: rawQuery };
  }

  // OS System Commands definition
  function getSystemCommands(queryClean) {
    const q = (queryClean || '').trim().toLowerCase();
    const commands = [
      {
        id: 'cmd_add_deal', icon: '&#10133;', title: 'Add New Investment Deal',
        sub: 'Launch the interactive 4-step Deal Wizard', tag: 'Action',
        keywords: 'add new create deal investment wizard loan bond property equity invoice',
        action: () => {
          App.router.navigate('deals');
          setTimeout(() => { if (App.dealsView && App.dealsView.openDealWizard) App.dealsView.openDealWizard(); }, 100);
        },
      },
      {
        id: 'cmd_record_payment', icon: '&#128176;', title: 'Record Payment / Payout',
        sub: 'Record received or scheduled payment on any deal', tag: 'Action',
        keywords: 'record payment payout interest principal receipt confirm receive pay',
        action: async () => {
          App.router.navigate('payments');
          const deals = await App.api.listDeals().catch(() => []);
          setTimeout(() => {
            if (App.paymentsView && App.paymentsView.openRecordPaymentModal) {
              App.paymentsView.openRecordPaymentModal(deals, deals[0]?.id || null, null);
            }
          }, 100);
        },
      },
      {
        id: 'cmd_add_recurring', icon: '&#128257;', title: 'Add Recurring Investment / SIP',
        sub: 'Set up systematic SIP, mutual fund, gold scheme, or recurring payout', tag: 'Action',
        keywords: 'add new recurring sip mutual fund gold scheme deposit pension commitment',
        action: () => {
          App.router.navigate('recurring');
          setTimeout(() => { if (App.recurringView && App.recurringView.openItemWizard) App.recurringView.openItemWizard(); }, 100);
        },
      },
      {
        id: 'cmd_log_gold', icon: '&#129689;', title: 'Log Gold Purchase',
        sub: 'Record physical 24K/22K bullion, bar, coin, or jewelry acquisition', tag: 'Action',
        keywords: 'gold log buy purchase bullion coin bar 24k 22k physical karat',
        action: () => { App.router.navigate('gold'); },
      },
      {
        id: 'cmd_add_contact', icon: '&#128101;', title: 'Add New Contact / Borrower',
        sub: 'Register a counterparty, borrower, promoter, or financial contact', tag: 'Action',
        keywords: 'add new contact borrower counterparty partner person',
        action: () => {
          App.router.navigate('contacts');
          setTimeout(() => { if (App.contactsView && App.contactsView.openContactWizard) App.contactsView.openContactWizard(); }, 100);
        },
      },
      {
        id: 'cmd_new_chat', icon: '&#128488;', title: 'Start Secure Chat Conversation',
        sub: 'Initiate 1-on-1 direct message or create collaborative investor group', tag: 'Action',
        keywords: 'chat message talk group message conversation discuss',
        action: () => {
          App.router.navigate('chat');
          setTimeout(() => { if (App.chatView && App.chatView.openNewChatModal) App.chatView.openNewChatModal(); }, 100);
        },
      },
      {
        id: 'cmd_executive_report', icon: '&#128202;', title: 'Generate Executive Portfolio Summary',
        sub: 'Instant executive briefing with net worth, returns, asset allocation & cash flow', tag: 'Report',
        keywords: 'executive report summary pdf print portfolio snapshot',
        action: () => {
          if (App.executiveReport && App.executiveReport.openExecutiveReportModal) {
            App.executiveReport.openExecutiveReportModal();
          } else {
            App.router.navigate('reports');
          }
        },
      },
      {
        id: 'cmd_tape_calculator', icon: '&#129534;', title: 'Open Tape Scratchpad Calculator',
        sub: 'Audit-ready adding machine with live roll tape, notes & expressions', tag: 'Tool',
        keywords: 'tape calculator math add scratchpad adding machine numbers tally',
        action: () => { App.router.navigate('calculator'); },
      },
      {
        id: 'cmd_toggle_theme', icon: '&#127763;', title: 'Toggle Dark / Light Mode',
        sub: 'Switch between Obsidian Dark and High-Contrast Daylight theme', tag: 'System',
        keywords: 'theme dark light mode switch toggle color appearance',
        action: () => { if (App.theme && App.theme.toggle) App.theme.toggle(); },
      },
      {
        id: 'cmd_export_data', icon: '&#128229;', title: 'Export Full Portfolio Backup',
        sub: 'Download complete structured JSON / Excel backup archive of all data', tag: 'System',
        keywords: 'export backup download json excel data save archive',
        action: () => {
          if (App.exportData && App.exportData.run) App.exportData.run();
          else App.router.navigate('settings');
        },
      },
      {
        id: 'cmd_play_game', icon: '&#127918;', title: 'Play Market Runner (Arcade Game)',
        sub: 'Offline arcade runner featuring gold bars, stock returns & market obstacles', tag: 'Tool',
        keywords: 'game play arcade market runner offline mini fun',
        action: () => { if (App.offlineGame && App.offlineGame.open) App.offlineGame.open(); },
      },
      // Quick View Navigators
      { id: 'cmd_nav_dashboard', icon: '&#9670;', title: 'Go to Overview Dashboard', sub: 'Master KPIs, portfolio breakdown & Action Center', tag: 'View', keywords: 'goto overview dashboard home kpi metrics', action: () => App.router.navigate('dashboard') },
      { id: 'cmd_nav_deals', icon: '&#128188;', title: 'Go to Deals & Investments', sub: 'Active investments, loans, bonds, equities & real estate', tag: 'View', keywords: 'goto deals investments assets portfolio', action: () => App.router.navigate('deals') },
      { id: 'cmd_nav_payments', icon: '&#128179;', title: 'Go to Payment Schedule & Ledger', sub: 'Incoming payout schedules, payment history & reconciliation', tag: 'View', keywords: 'goto payments schedule ledger payouts cash', action: () => App.router.navigate('payments') },
      { id: 'cmd_nav_recurring', icon: '&#128257;', title: 'Go to Recurring Investments & SIPs', sub: 'Active SIP schedules, commitments & automated occurrences', tag: 'View', keywords: 'goto recurring sips commitments auto pay', action: () => App.router.navigate('recurring') },
      { id: 'cmd_nav_gold', icon: '&#129689;', title: 'Go to Gold Intelligence', sub: 'Live rates, bullion tracking, price alerts & historical analytics', tag: 'View', keywords: 'goto gold intelligence bullion physical 24k', action: () => App.router.navigate('gold') },
      { id: 'cmd_nav_expenses', icon: '&#128184;', title: 'Go to Expenses & Project Budgets', sub: 'Project cost centers, vendors, advances & expense ledgers', tag: 'View', keywords: 'goto expenses projects costs budgets spending', action: () => App.router.navigate('expenses') },
      { id: 'cmd_nav_networth', icon: '&#127974;', title: 'Go to Net Worth & Balance Sheet', sub: 'Asset allocation, liabilities, historical growth & net equity', tag: 'View', keywords: 'goto net worth balance sheet assets liabilities equity', action: () => App.router.navigate('netWorth') },
      { id: 'cmd_nav_cashflow', icon: '&#128200;', title: 'Go to Cash Flow Forecast', sub: 'Forward-looking monthly inflows, outflows & liquidity timeline', tag: 'View', keywords: 'goto cash flow forecast liquidity timeline projection', action: () => App.router.navigate('cashFlow') },
      { id: 'cmd_nav_maturity', icon: '&#128197;', title: 'Go to Maturity Planner', sub: 'Principal return dates, days remaining & reinvestment decisions', tag: 'View', keywords: 'goto maturity planner reinvestment principal return due', action: () => App.router.navigate('maturity') },
      { id: 'cmd_nav_goals', icon: '&#127919;', title: 'Go to Portfolio Goals', sub: 'Financial milestones, target dates & progress tracking', tag: 'View', keywords: 'goto goals targets milestones savings future', action: () => App.router.navigate('goals') },
      { id: 'cmd_nav_analytics', icon: '&#128201;', title: 'Go to Performance Analytics', sub: 'XIRR, weighted annual ROI, asset risk & return metrics', tag: 'View', keywords: 'goto analytics performance xirr returns yield stats', action: () => App.router.navigate('analytics') },
      { id: 'cmd_nav_copilot', icon: '&#129302;', title: 'Go to AI Copilot & Advisor', sub: 'Gemini AI financial advisor for portfolio optimization', tag: 'View', keywords: 'goto ai copilot advisor intelligence gemini chat help', action: () => App.router.navigate('aiCopilot') },
      { id: 'cmd_nav_contacts', icon: '&#128101;', title: 'Go to Contacts & Directory', sub: 'Counterparties, brokers, borrowers, founders & partners', tag: 'View', keywords: 'goto contacts address directory people partners', action: () => App.router.navigate('contacts') },
      { id: 'cmd_nav_documents', icon: '&#128193;', title: 'Go to Document Vault', sub: 'Agreements, promissory notes, invoices, receipts & collateral', tag: 'View', keywords: 'goto documents files vault agreements pdfs contracts', action: () => App.router.navigate('documents') },
      { id: 'cmd_nav_support', icon: '&#127991;', title: 'Go to Message to Us / Roadmap', sub: 'Support tickets, feature suggestions & development roadmap', tag: 'View', keywords: 'goto support help tickets contact roadmap feedback', action: () => App.router.navigate('support') },
      { id: 'cmd_nav_settings', icon: '&#9881;', title: 'Go to Settings & Portfolios', sub: 'Platform accounts, shared portfolios, currencies & preferences', tag: 'View', keywords: 'goto settings config platforms portfolios preferences', action: () => App.router.navigate('settings') },
    ];

    if (!q) return commands.slice(0, 10);
    return commands.filter((c) => matches(q, c.title, c.sub, c.tag, c.keywords)).slice(0, 8);
  }

  // ---------------------------------------------------------------------------
  // INTENT HANDLERS
  // ---------------------------------------------------------------------------

  // 1. Action Center Question Handler ("What do I need to pay next week?")
  async function handleActionCenterQuestion(intent) {
    const { start, end, label } = parseDateWindow(intent.windowType);
    const todayISO = App.utils.todayISO();

    const [deals, schedule, recurringOcc, recurringItems] = await Promise.all([
      App.api.listDeals().catch(() => []),
      App.api.listSchedule({ in: { status: ['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_RECEIVED'] } }).catch(() => []),
      App.api.listRecurringOccurrences().catch(() => []),
      App.api.listRecurringItems().catch(() => []),
    ]);

    const dealsById = {}; deals.forEach((d) => { dealsById[d.id] = d; });
    const recById = {}; recurringItems.forEach((r) => { recById[r.id] = r; });

    // Filter items in date window or overdue
    const pendingStatuses = ['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_RECEIVED', 'DUE'];

    const dealPayoutsInWindow = schedule.filter((s) =>
      pendingStatuses.includes(s.status) && s.scheduled_date >= start && s.scheduled_date <= end
    );
    const dealOverdue = schedule.filter((s) => s.status === 'OVERDUE');

    const recInWindow = recurringOcc.filter((o) =>
      pendingStatuses.includes(o.status) && o.due_date >= start && o.due_date <= end
    );
    const recOverdue = recurringOcc.filter((o) => o.status === 'OVERDUE');

    const totalDealSum = dealPayoutsInWindow.reduce((a, s) => a + (s.expected_total || 0), 0);
    const totalRecSum = recInWindow.reduce((a, o) => a + (o.expected_amount || 0), 0);
    const totalDue = totalDealSum + totalRecSum;
    const totalItemsCount = dealPayoutsInWindow.length + recInWindow.length;
    const overdueCount = dealOverdue.length + recOverdue.length;

    const items = [];

    // Deal payouts
    dealPayoutsInWindow.forEach((s) => {
      const deal = dealsById[s.deal_id] || {};
      items.push({
        group: `Action Center — ${label}`,
        icon: '&#128179;',
        tag: s.status === 'OVERDUE' ? 'OVERDUE' : 'DEAL PAYOUT',
        tagColor: s.status === 'OVERDUE' ? 'var(--red)' : 'var(--gold)',
        title: `${deal.deal_name || 'Deal'} — Payout Expected`,
        sub: `Due ${App.utils.fmtDate(s.scheduled_date)} · Expected: ${App.utils.fmtMoney(s.expected_total)} (Interest: ${App.utils.fmtMoney(s.expected_interest)})`,
        amount: s.expected_total,
        btnLabel: 'Record Payment',
        action: () => {
          App.router.navigate('payments');
          setTimeout(() => {
            if (App.paymentsView && App.paymentsView.openRecordPaymentModal) {
              App.paymentsView.openRecordPaymentModal(deals, s.deal_id, s);
            }
          }, 100);
        },
      });
    });

    // Recurring commitments
    recInWindow.forEach((o) => {
      const rec = recById[o.recurring_item_id] || {};
      items.push({
        group: `Action Center — ${label}`,
        icon: '&#128257;',
        tag: o.status === 'OVERDUE' ? 'OVERDUE' : 'RECURRING SIP',
        tagColor: o.status === 'OVERDUE' ? 'var(--red)' : 'var(--teal)',
        title: `${rec.item_name || 'Recurring Item'} — SIP Commitment`,
        sub: `Due ${App.utils.fmtDate(o.due_date)} · ${rec.item_type || 'SIP'} · ${App.utils.fmtMoney(o.expected_amount)}`,
        amount: o.expected_amount,
        btnLabel: 'Confirm & Pay',
        action: () => {
          App.router.navigate('recurring');
          setTimeout(() => {
            if (App.recurringView && App.recurringView.openItemDetail) {
              App.recurringView.openItemDetail(o.recurring_item_id);
            }
          }, 100);
        },
      });
    });

    return {
      hero: {
        type: 'action_center',
        badge: '⚡ ACTION CENTER INTELLIGENCE',
        title: `Payment Commitments for ${label}`,
        summary: totalItemsCount > 0
          ? `You have <strong>${totalItemsCount} payment(s)</strong> due in <strong>${label}</strong> totaling <strong>${App.utils.fmtMoney(totalDue)}</strong>${overdueCount > 0 ? ` (<span style="color:var(--red)">${overdueCount} overdue</span>)` : ''}.`
          : `✨ All clear! You have <strong>no pending payments or bills due</strong> for ${label}.`,
        kpis: [
          { label: 'Total Due in Window', value: App.utils.fmtMoney(totalDue), color: 'var(--gold)' },
          { label: 'Deal Payouts', value: `${dealPayoutsInWindow.length} (${App.utils.fmtMoney(totalDealSum)})`, color: 'var(--text)' },
          { label: 'Recurring SIPs', value: `${recInWindow.length} (${App.utils.fmtMoney(totalRecSum)})`, color: 'var(--teal)' },
          { label: 'Overdue Attention', value: `${overdueCount} Item(s)`, color: overdueCount > 0 ? 'var(--red)' : 'var(--teal)' },
        ],
        actions: [
          { label: '📋 Open Action Center (Dashboard)', action: () => { App.router.navigate('dashboard'); } },
          { label: '📅 View Payment Schedule', action: () => { App.router.navigate('payments'); } },
          {
            label: '🤖 Ask AI Advisor for Detailed Cash Flow Plan',
            className: 'btn-gold',
            action: () => {
              if (App.chatbot && App.chatbot.ask) {
                App.chatbot.ask(intent.raw || `What do I need to pay during ${label}? Please analyze my cash flow.`);
              } else {
                App.router.navigate('aiCopilot');
              }
            }
          },
        ],
      },
      items,
    };
  }

  // 2. All Pending & Attention Items Handler ("pending")
  async function handleAllPending() {
    const todayISO = App.utils.todayISO();

    const [deals, schedule, recurringOcc, recurringItems, bankTxns, tickets] = await Promise.all([
      App.api.listDeals().catch(() => []),
      App.api.listSchedule({ in: { status: ['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_RECEIVED'] } }).catch(() => []),
      App.api.listRecurringOccurrences().catch(() => []),
      App.api.listRecurringItems().catch(() => []),
      App.api.listBankTransactions ? App.api.listBankTransactions().catch(() => []) : Promise.resolve([]),
      App.api.listTickets().catch(() => []),
    ]);

    const dealsById = {}; deals.forEach((d) => { dealsById[d.id] = d; });
    const recById = {}; recurringItems.forEach((r) => { recById[r.id] = r; });

    const overdueSchedules = schedule.filter((s) => s.status === 'OVERDUE');
    const upcomingSchedules = schedule.filter((s) => s.status !== 'OVERDUE');

    const overdueRec = recurringOcc.filter((o) => o.status === 'OVERDUE');
    const upcomingRec = recurringOcc.filter((o) => ['UPCOMING', 'DUE'].includes(o.status));

    const unmatchedBank = bankTxns.filter((t) => t.status === 'UNMATCHED' || !t.matched_deal_id);
    const openTickets = tickets.filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status));

    const totalPendingAmount = schedule.reduce((a, s) => a + (s.expected_total || 0), 0) + recurringOcc.reduce((a, o) => a + (o.expected_amount || 0), 0);
    const totalCount = schedule.length + recurringOcc.length + unmatchedBank.length + openTickets.length;

    const items = [];

    // Overdue Deal Schedules
    overdueSchedules.forEach((s) => {
      const deal = dealsById[s.deal_id] || {};
      items.push({
        group: '🔴 Overdue Deal Payouts',
        icon: '&#9888;',
        tag: 'OVERDUE',
        tagColor: 'var(--red)',
        title: `${deal.deal_name || 'Deal'} — Payout Overdue`,
        sub: `Was due ${App.utils.fmtDate(s.scheduled_date)} · Expected: ${App.utils.fmtMoney(s.expected_total)}`,
        amount: s.expected_total,
        btnLabel: 'Record Payment',
        action: () => {
          App.router.navigate('payments');
          setTimeout(() => {
            if (App.paymentsView && App.paymentsView.openRecordPaymentModal) {
              App.paymentsView.openRecordPaymentModal(deals, s.deal_id, s);
            }
          }, 100);
        },
      });
    });

    // Overdue Recurring
    overdueRec.forEach((o) => {
      const rec = recById[o.recurring_item_id] || {};
      items.push({
        group: '🔴 Overdue Recurring Commitments',
        icon: '&#9888;',
        tag: 'OVERDUE',
        tagColor: 'var(--red)',
        title: `${rec.item_name || 'Recurring Item'} — Overdue SIP`,
        sub: `Was due ${App.utils.fmtDate(o.due_date)} · ${App.utils.fmtMoney(o.expected_amount)}`,
        amount: o.expected_amount,
        btnLabel: 'Confirm & Pay',
        action: () => {
          App.router.navigate('recurring');
          setTimeout(() => {
            if (App.recurringView && App.recurringView.openItemDetail) {
              App.recurringView.openItemDetail(o.recurring_item_id);
            }
          }, 100);
        },
      });
    });

    // Upcoming Payouts
    upcomingSchedules.slice(0, 6).forEach((s) => {
      const deal = dealsById[s.deal_id] || {};
      items.push({
        group: '🟡 Upcoming Deal Payouts',
        icon: '&#128179;',
        tag: s.status,
        tagColor: 'var(--gold)',
        title: `${deal.deal_name || 'Deal'} — Scheduled Payout`,
        sub: `Scheduled for ${App.utils.fmtDate(s.scheduled_date)} · ${App.utils.fmtMoney(s.expected_total)}`,
        amount: s.expected_total,
        btnLabel: 'Record',
        action: () => {
          App.router.navigate('payments');
          setTimeout(() => {
            if (App.paymentsView && App.paymentsView.openRecordPaymentModal) {
              App.paymentsView.openRecordPaymentModal(deals, s.deal_id, s);
            }
          }, 100);
        },
      });
    });

    // Upcoming Recurring
    upcomingRec.slice(0, 6).forEach((o) => {
      const rec = recById[o.recurring_item_id] || {};
      items.push({
        group: '🔄 Upcoming Recurring SIPs',
        icon: '&#128257;',
        tag: 'UPCOMING',
        tagColor: 'var(--teal)',
        title: `${rec.item_name || 'Recurring Item'} — SIP Due`,
        sub: `Due ${App.utils.fmtDate(o.due_date)} · ${App.utils.fmtMoney(o.expected_amount)}`,
        amount: o.expected_amount,
        btnLabel: 'View SIP',
        action: () => {
          App.router.navigate('recurring');
          setTimeout(() => {
            if (App.recurringView && App.recurringView.openItemDetail) {
              App.recurringView.openItemDetail(o.recurring_item_id);
            }
          }, 100);
        },
      });
    });

    // Unmatched Bank Transactions
    unmatchedBank.slice(0, 4).forEach((t) => {
      items.push({
        group: '🏦 Unreconciled Bank Entries',
        icon: '&#127974;',
        tag: 'UNMATCHED',
        tagColor: 'var(--purple, #a855f7)',
        title: t.description || t.narrative || 'Bank Transaction',
        sub: `${App.utils.fmtDate(t.transaction_date)} · ${App.utils.fmtMoney(t.amount)}`,
        amount: t.amount,
        btnLabel: 'Reconcile',
        action: () => {
          if (App.paymentsView && App.paymentsView.openReconciliationTab) {
            App.paymentsView.openReconciliationTab();
          } else {
            App.router.navigate('payments');
          }
        },
      });
    });

    return {
      hero: {
        type: 'all_pending',
        badge: '⚠️ OS-WIDE PENDING & ATTENTION HUB',
        title: `Everything Pending (${totalCount} Actionable Items)`,
        summary: `Found <strong>${totalCount} pending items</strong> across Deal Schedules, Recurring SIPs, and Bank Reconciliation requiring action, totaling <strong>${App.utils.fmtMoney(totalPendingAmount)}</strong> in active flow.`,
        kpis: [
          { label: 'Overdue Items', value: `${overdueSchedules.length + overdueRec.length}`, color: (overdueSchedules.length + overdueRec.length) > 0 ? 'var(--red)' : 'var(--teal)' },
          { label: 'Pending Payouts', value: `${schedule.length} (${App.utils.fmtMoney(schedule.reduce((a,s)=>a+(s.expected_total||0),0))})`, color: 'var(--gold)' },
          { label: 'Recurring SIPs Due', value: `${recurringOcc.length}`, color: 'var(--teal)' },
          { label: 'Unmatched Bank', value: `${unmatchedBank.length}`, color: 'var(--purple, #a855f7)' },
        ],
        actions: [
          { label: '📋 Open Action Center', action: () => { App.router.navigate('dashboard'); } },
          { label: '📅 Open Payment Schedule', action: () => { App.router.navigate('payments'); } },
          { label: '🔄 Open Recurring SIPs', action: () => { App.router.navigate('recurring'); } },
        ],
      },
      items,
    };
  }

  // 3. Maturity Queries Handler ("maturity next month")
  async function handleMaturityQuery(intent) {
    const { start, end, label } = parseDateWindow(intent.windowType);
    const todayISO = App.utils.todayISO();

    const [deals, schedule] = await Promise.all([
      App.api.listDeals({ eq: { status: 'ACTIVE' } }).catch(() => []),
      App.api.listSchedule({ in: { status: ['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_RECEIVED'] } }).catch(() => []),
    ]);

    let maturingDeals = deals.filter((d) => d.maturity_date && d.maturity_date >= start && d.maturity_date <= end);
    // If none found in strict window, provide next upcoming active deals
    let isBroadened = false;
    if (maturingDeals.length === 0) {
      maturingDeals = deals.filter((d) => d.maturity_date && d.maturity_date >= todayISO).slice(0, 6);
      isBroadened = true;
    }

    maturingDeals.sort((a, b) => (a.maturity_date || '').localeCompare(b.maturity_date || ''));

    const totalReturningPrincipal = maturingDeals.reduce((a, d) => a + (d.current_principal || d.invested_amount || 0), 0);

    const items = maturingDeals.map((d) => {
      const remainingInterest = schedule.filter((s) => s.deal_id === d.id && s.scheduled_date <= d.maturity_date).reduce((a, s) => a + (s.expected_interest || 0), 0);
      const daysLeft = App.utils.daysBetween(todayISO, d.maturity_date);

      return {
        group: isBroadened ? 'Upcoming Maturing Investments' : `Maturing in ${label}`,
        icon: '&#128197;',
        tag: daysLeft <= 30 ? 'CRITICAL' : 'MATURING',
        tagColor: daysLeft <= 30 ? 'var(--gold)' : 'var(--teal)',
        title: d.deal_name,
        sub: `Maturity: ${App.utils.fmtDate(d.maturity_date)} (${daysLeft} days left) · Principal: ${App.utils.fmtMoney(d.current_principal || d.invested_amount)} · Final Interest: ${App.utils.fmtMoney(remainingInterest)}`,
        amount: d.current_principal || d.invested_amount,
        btnLabel: 'Plan Reinvestment',
        action: () => {
          App.router.navigate('maturity');
        },
      };
    });

    return {
      hero: {
        type: 'maturity_hub',
        badge: '📅 MATURITY & REINVESTMENT INTELLIGENCE',
        title: isBroadened ? 'Upcoming Investment Maturities' : `Investments Maturing in ${label}`,
        summary: maturingDeals.length > 0
          ? `Found <strong>${maturingDeals.length} active deal(s)</strong> returning <strong>${App.utils.fmtMoney(totalReturningPrincipal)}</strong> in principal capital.`
          : `No deals currently recorded maturing in ${label}.`,
        kpis: [
          { label: 'Maturing Deals', value: `${maturingDeals.length}`, color: 'var(--teal)' },
          { label: 'Returning Principal', value: App.utils.fmtMoney(totalReturningPrincipal), color: 'var(--gold)' },
          { label: 'Earliest Maturity', value: maturingDeals[0]?.maturity_date ? App.utils.fmtDate(maturingDeals[0].maturity_date) : '—', color: 'var(--text)' },
        ],
        actions: [
          { label: '📊 Open Maturity Planner', action: () => { App.router.navigate('maturity'); } },
          { label: '🔄 Open Reinvestment Engine', action: () => { App.router.navigate('reinvestments'); } },
        ],
      },
      items,
    };
  }

  // 4. Gold Hub Handler ("gold")
  async function handleGoldHub() {
    const [purchases, obs] = await Promise.all([
      App.api.listGoldPurchases().catch(() => []),
      App.api.listGoldPriceObservations ? App.api.listGoldPriceObservations().catch(() => []) : Promise.resolve([]),
    ]);

    const totalGrams = purchases.reduce((a, p) => a + (p.weight_grams || 0), 0);
    const totalCost = purchases.reduce((a, p) => a + (p.total_amount_paid || 0), 0);

    const latest24k = obs.find((o) => o.purity === '24K')?.market_rate_per_gram || 7450;
    const latest22k = obs.find((o) => o.purity === '22K')?.market_rate_per_gram || 6830;
    const estimatedValue = totalGrams * latest24k;

    const items = purchases.slice(0, 8).map((p) => ({
      group: 'Gold Purchases & Bullion Holdings',
      icon: '&#129689;',
      tag: p.purity || '24K',
      tagColor: 'var(--gold)',
      title: `${p.purity || '24K'} Gold Purchase · ${p.weight_grams || 0}g`,
      sub: `Purchased ${App.utils.fmtDate(p.purchase_date)} · Rate: ${App.utils.fmtMoney(p.rate_per_gram)}/g · Total: ${App.utils.fmtMoney(p.total_amount_paid)} · Source: ${p.source || '—'}`,
      amount: p.total_amount_paid,
      btnLabel: 'View Gold',
      action: () => { App.router.navigate('gold'); },
    }));

    return {
      hero: {
        type: 'gold_hub',
        badge: '🪙 GOLD INTELLIGENCE & BULLION HUB',
        title: 'Gold Assets, Physical Holdings & Market Intelligence',
        summary: `Total holdings: <strong>${totalGrams.toFixed(2)}g</strong> across <strong>${purchases.length} purchase(s)</strong> with an estimated current value of <strong>${App.utils.fmtMoney(estimatedValue)}</strong>.`,
        kpis: [
          { label: 'Total Weight', value: `${totalGrams.toFixed(2)} grams`, color: 'var(--gold)' },
          { label: 'Invested Capital', value: App.utils.fmtMoney(totalCost), color: 'var(--text)' },
          { label: 'Current 24K Rate', value: `${App.utils.fmtMoney(latest24k)}/g`, color: 'var(--gold)' },
          { label: 'Current 22K Rate', value: `${App.utils.fmtMoney(latest22k)}/g`, color: 'var(--teal)' },
        ],
        actions: [
          { label: '➕ Log New Gold Purchase', action: () => { App.router.navigate('gold'); } },
          { label: '📈 Open Gold Intelligence Dashboard', action: () => { App.router.navigate('gold'); } },
        ],
      },
      items,
    };
  }

  // 5. Amount Match Handler ("₹15000", "15000", "15k")
  async function handleAmountMatch(targetAmount) {
    const [deals, payments, schedule, expenses, gold, cashTxns] = await Promise.all([
      App.api.listDeals().catch(() => []),
      App.api.listPayments().catch(() => []),
      App.api.listSchedule().catch(() => []),
      App.api.listExpenseTransactions ? App.api.listExpenseTransactions().catch(() => []) : Promise.resolve([]),
      App.api.listGoldPurchases().catch(() => []),
      App.api.listCashTransactions ? App.api.listCashTransactions().catch(() => []) : Promise.resolve([]),
    ]);

    const isMatch = (val) => {
      if (val == null) return false;
      const num = Number(val);
      if (isNaN(num)) return false;
      // Exact match or within 0.5%
      return Math.abs(num - targetAmount) < 1 || (Math.abs(num - targetAmount) / targetAmount) < 0.005;
    };

    const items = [];

    // Matching Deals
    deals.filter((d) => isMatch(d.invested_amount) || isMatch(d.current_principal)).forEach((d) => {
      items.push({
        group: `Matching Deals (${App.utils.fmtMoney(targetAmount)})`,
        icon: '&#128188;',
        tag: 'DEAL',
        tagColor: 'var(--blue, #3b82f6)',
        title: d.deal_name,
        sub: `Invested: ${App.utils.fmtMoney(d.invested_amount)} · Principal: ${App.utils.fmtMoney(d.current_principal)} · ${d.investment_type || ''}`,
        amount: d.invested_amount,
        btnLabel: 'Open Deal',
        action: () => {
          App.router.navigate('deals');
          setTimeout(() => { if (App.dealsView && App.dealsView.openDealDetail) App.dealsView.openDealDetail(d.id); }, 80);
        },
      });
    });

    // Matching Recorded Payments
    payments.filter((p) => isMatch(p.amount) || isMatch(p.interest_amount) || isMatch(p.principal_amount)).forEach((p) => {
      items.push({
        group: `Matching Payments (${App.utils.fmtMoney(targetAmount)})`,
        icon: '&#128179;',
        tag: 'PAYMENT',
        tagColor: 'var(--teal)',
        title: `Payment of ${App.utils.fmtMoney(p.amount)} recorded on ${App.utils.fmtDate(p.transaction_date)}`,
        sub: `Mode: ${p.payment_mode || 'Bank'} · Ref: ${p.payment_reference || '—'} · Deal #${p.deal_id}`,
        amount: p.amount,
        btnLabel: 'View Payments',
        action: () => { App.router.navigate('payments'); },
      });
    });

    // Matching Scheduled Payouts
    schedule.filter((s) => isMatch(s.expected_total) || isMatch(s.expected_interest)).forEach((s) => {
      items.push({
        group: `Matching Schedule Payouts (${App.utils.fmtMoney(targetAmount)})`,
        icon: '&#128197;',
        tag: s.status || 'SCHEDULED',
        tagColor: s.status === 'OVERDUE' ? 'var(--red)' : 'var(--gold)',
        title: `Scheduled Payout of ${App.utils.fmtMoney(s.expected_total)}`,
        sub: `Scheduled Date: ${App.utils.fmtDate(s.scheduled_date)} · Status: ${s.status} · Deal #${s.deal_id}`,
        amount: s.expected_total,
        btnLabel: 'Record',
        action: () => {
          App.router.navigate('payments');
          setTimeout(() => {
            if (App.paymentsView && App.paymentsView.openRecordPaymentModal) {
              App.paymentsView.openRecordPaymentModal(deals, s.deal_id, s);
            }
          }, 80);
        },
      });
    });

    // Matching Expenses
    expenses.filter((e) => isMatch(e.amount)).forEach((e) => {
      items.push({
        group: `Matching Expenses (${App.utils.fmtMoney(targetAmount)})`,
        icon: '&#128184;',
        tag: 'EXPENSE',
        tagColor: 'var(--purple, #a855f7)',
        title: e.description || 'Expense Entry',
        sub: `Date: ${App.utils.fmtDate(e.transaction_date)} · Amount: ${App.utils.fmtMoney(e.amount)} · ${e.payment_mode || ''}`,
        amount: e.amount,
        btnLabel: 'Open Expenses',
        action: () => { App.router.navigate('expenses'); },
      });
    });

    // Matching Gold Purchases
    gold.filter((g) => isMatch(g.total_amount_paid)).forEach((g) => {
      items.push({
        group: `Matching Gold Purchases (${App.utils.fmtMoney(targetAmount)})`,
        icon: '&#129689;',
        tag: 'GOLD',
        tagColor: 'var(--gold)',
        title: `${g.purity || '24K'} Gold Purchase (${g.weight_grams}g)`,
        sub: `Paid ${App.utils.fmtMoney(g.total_amount_paid)} on ${App.utils.fmtDate(g.purchase_date)} · Source: ${g.source || '—'}`,
        amount: g.total_amount_paid,
        btnLabel: 'View Gold',
        action: () => { App.router.navigate('gold'); },
      });
    });

    // Matching Cash Transactions
    cashTxns.filter((c) => isMatch(c.amount)).forEach((c) => {
      items.push({
        group: `Matching Cash Transactions (${App.utils.fmtMoney(targetAmount)})`,
        icon: '&#128181;',
        tag: c.type || 'CASH',
        tagColor: 'var(--teal)',
        title: c.description || c.notes || 'Cash Transaction',
        sub: `${App.utils.fmtDate(c.transaction_date)} · ${App.utils.fmtMoney(c.amount)}`,
        amount: c.amount,
        btnLabel: 'View Ledger',
        action: () => { App.router.navigate('payments'); },
      });
    });

    return {
      hero: {
        type: 'amount_match',
        badge: '💵 FINANCIAL FIGURE INTELLIGENCE',
        title: `Financial Records Matching ${App.utils.fmtMoney(targetAmount)}`,
        summary: items.length > 0
          ? `Found <strong>${items.length} record(s)</strong> matching the amount <strong>${App.utils.fmtMoney(targetAmount)}</strong> across deals, payments, schedules, expenses, and bullion purchases.`
          : `No financial records found matching exactly ${App.utils.fmtMoney(targetAmount)}.`,
        kpis: [
          { label: 'Target Amount', value: App.utils.fmtMoney(targetAmount), color: 'var(--gold)' },
          { label: 'Total Matches Found', value: `${items.length} Records`, color: 'var(--teal)' },
        ],
        actions: [
          { label: '📊 View All Deals', action: () => { App.router.navigate('deals'); } },
          { label: '💳 View All Payments', action: () => { App.router.navigate('payments'); } },
        ],
      },
      items,
    };
  }

  // 6. Standard Multi-Entity Search
  async function runStandardSearch(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { hero: null, items: [] };

    const isAdmin = App.state.profile && App.state.profile.is_admin;

    // Check system commands first
    const cmdMatches = getSystemCommands(q);
    const commandItems = cmdMatches.map((c) => ({
      group: '⚡ System Commands & Shortcuts',
      icon: c.icon,
      tag: c.tag,
      tagColor: 'var(--gold)',
      title: c.title,
      sub: c.sub,
      btnLabel: 'Execute',
      action: c.action,
    }));

    const tasks = [
      App.api.listDeals().then((rows) => rows
        .filter((d) => matches(q, d.deal_name, d.external_deal_id, d.notes, d.category, d.investment_type, d.borrower_name))
        .slice(0, 6)
        .map((d) => ({
          group: 'Deals & Investments', icon: '&#128188;', tag: d.status || 'DEAL', tagColor: 'var(--gold)',
          title: d.deal_name,
          sub: `${d.investment_type || 'Investment'} · ${App.utils.fmtMoney(d.invested_amount)} · ROI: ${d.annual_roi ? d.annual_roi + '%' : '—'}`,
          btnLabel: 'Open Deal',
          action: () => { App.router.navigate('deals'); setTimeout(() => { if (App.dealsView && App.dealsView.openDealDetail) App.dealsView.openDealDetail(d.id); }, 80); },
        }))).catch(() => []),

      App.api.listPayments().then((rows) => rows
        .filter((p) => matches(q, p.payment_reference, p.payment_mode, p.notes, p.confirmation_method))
        .slice(0, 5)
        .map((p) => ({
          group: 'Payment Ledger', icon: '&#128179;', tag: 'PAYMENT', tagColor: 'var(--teal)',
          title: `Payment ${App.utils.fmtMoney(p.amount)} · ${App.utils.fmtDate(p.transaction_date)}`,
          sub: `Ref: ${p.payment_reference || '—'} · Mode: ${p.payment_mode || '—'}`,
          btnLabel: 'View',
          action: () => { App.router.navigate('payments'); },
        }))).catch(() => []),

      App.api.listRecurringItems().then((rows) => rows
        .filter((r) => matches(q, r.item_name, r.provider, r.notes, r.category, r.item_type))
        .slice(0, 6)
        .map((r) => ({
          group: 'Recurring Investments & SIPs', icon: '&#128257;', tag: r.item_type || 'SIP', tagColor: 'var(--teal)',
          title: r.item_name, sub: `${r.provider || ''} · ${App.utils.fmtMoney(r.amount)} ${r.frequency || 'Monthly'}`,
          btnLabel: 'Open SIP',
          action: () => { App.router.navigate('recurring'); setTimeout(() => { if (App.recurringView && App.recurringView.openItemDetail) App.recurringView.openItemDetail(r.id); }, 80); },
        }))).catch(() => []),

      App.api.listContacts().then((rows) => rows
        .filter((c) => matches(q, c.full_name, c.display_name, c.company, c.job_title, c.email, c.phone, (c.tags || []).join(' ')))
        .slice(0, 6)
        .map((c) => ({
          group: 'Contacts & Directory', icon: '&#128101;', tag: 'CONTACT', tagColor: 'var(--blue, #3b82f6)',
          title: c.display_name || c.full_name || '(unnamed)', sub: `${c.company ? c.company + ' · ' : ''}${c.email || c.phone || ''}`,
          btnLabel: 'Open Profile',
          action: () => { App.router.navigate('contacts'); setTimeout(() => { if (App.contactsView && App.contactsView.openContactDetail) App.contactsView.openContactDetail(c.id); }, 80); },
        }))).catch(() => []),

      App.api.listGoldPurchases().then((rows) => rows
        .filter((p) => matches(q, p.source, p.notes, p.purity, p.invoice_number))
        .slice(0, 5)
        .map((p) => ({
          group: 'Gold Intelligence', icon: '&#129689;', tag: p.purity || '24K', tagColor: 'var(--gold)',
          title: `${p.purity || '24K'} Gold Purchase · ${p.weight_grams}g`,
          sub: `${App.utils.fmtDate(p.purchase_date)} · ${App.utils.fmtMoney(p.total_amount_paid)} · ${p.source || ''}`,
          btnLabel: 'View Gold',
          action: () => App.router.navigate('gold'),
        }))).catch(() => []),

      App.api.listConversations ? App.api.listConversations().then((rows) => rows
        .filter((c) => matches(q, c.name))
        .slice(0, 4)
        .map((c) => ({
          group: 'Secure Chat', icon: '&#128488;', tag: c.type === 'GROUP' ? 'GROUP' : 'DM', tagColor: 'var(--gold)',
          title: c.name, sub: c.type === 'GROUP' ? 'Group Discussion' : 'Direct Conversation',
          btnLabel: 'Open Chat',
          action: () => { App.router.navigate('chat'); setTimeout(() => { if (App.chatView && App.chatView.openConversation) App.chatView.openConversation(c.conversation_id); }, 80); },
        }))).catch(() => []) : Promise.resolve([]),

      App.api.listNotes().then((rows) => rows
        .filter((n) => matches(q, n.title, n.content))
        .slice(0, 4)
        .map((n) => ({
          group: 'Notes & Scratchpads', icon: '&#128221;', tag: 'NOTE', tagColor: 'var(--text3)',
          title: n.title || '(untitled)', sub: (n.content || '').slice(0, 70),
          btnLabel: 'Open Notes',
          action: () => App.router.navigate('notes'),
        }))).catch(() => []),

      App.api.listDocuments ? App.api.listDocuments().then((rows) => rows
        .filter((doc) => matches(q, doc.file_name, doc.notes, doc.deal_name))
        .slice(0, 4)
        .map((doc) => ({
          group: 'Document Vault', icon: '&#128193;', tag: 'DOC', tagColor: 'var(--blue, #3b82f6)',
          title: doc.file_name, sub: `${doc.file_type || 'File'} · ${App.utils.fmtDate(doc.created_at)}`,
          btnLabel: 'Open Vault',
          action: () => App.router.navigate('documents'),
        }))).catch(() => []) : Promise.resolve([]),

      App.api.listGoals ? App.api.listGoals().then((rows) => rows
        .filter((g) => matches(q, g.goal_name, g.target_description))
        .slice(0, 3)
        .map((g) => ({
          group: 'Portfolio Goals', icon: '&#127919;', tag: 'GOAL', tagColor: 'var(--teal)',
          title: g.goal_name, sub: `Target: ${App.utils.fmtMoney(g.target_amount)} by ${App.utils.fmtDate(g.target_date)}`,
          btnLabel: 'View Goal',
          action: () => App.router.navigate('goals'),
        }))).catch(() => []) : Promise.resolve([]),

      App.api.listTickets().then((rows) => rows
        .filter((t) => matches(q, t.subject, t.ticket_number, t.category))
        .slice(0, 4)
        .map((t) => ({
          group: 'Message to Us / Tickets', icon: '&#127991;', tag: t.status || 'TICKET', tagColor: 'var(--gold)',
          title: t.subject, sub: `#${t.ticket_number || ''} · ${t.category || ''}`,
          btnLabel: 'View',
          action: () => App.router.navigate('support'),
        }))).catch(() => []),

      App.api.listPlatforms().then((rows) => rows
        .filter((p) => matches(q, p.name, p.investment_type))
        .slice(0, 4)
        .map((p) => ({
          group: 'Platforms & Setup', icon: '&#127974;', tag: 'PLATFORM', tagColor: 'var(--text3)',
          title: p.name, sub: p.investment_type || 'Investment Platform',
          btnLabel: 'Settings',
          action: () => App.router.navigate('settings'),
        }))).catch(() => []),
    ];

    if (isAdmin) {
      tasks.push(App.api.listAllProfiles().then((rows) => rows
        .filter((u) => matches(q, u.full_name, u.email))
        .slice(0, 4)
        .map((u) => ({
          group: 'Admin — Users', icon: '&#128081;', tag: 'USER', tagColor: 'var(--red)',
          title: u.full_name || u.email, sub: u.email,
          btnLabel: 'Inspect',
          action: () => { App.router.navigate('admin'); setTimeout(() => { if (App.adminView && App.adminView.openUserDetailModal) App.adminView.openUserDetailModal(u); }, 80); },
        }))).catch(() => []));
    }

    const resolved = await Promise.all(tasks);
    const allItems = [...commandItems, ...resolved.flat()];

    return { hero: null, items: allItems };
  }

  // Master Query Dispatcher
  async function runUnifiedSearch(rawQuery) {
    if (!rawQuery || rawQuery.trim().length === 0) {
      return { isDefault: true, hero: null, items: [] };
    }

    const intent = detectQueryIntent(rawQuery);

    if (intent.type === 'action_center_question') {
      return await handleActionCenterQuestion(intent);
    }
    if (intent.type === 'all_pending') {
      return await handleAllPending();
    }
    if (intent.type === 'maturity_query') {
      return await handleMaturityQuery(intent);
    }
    if (intent.type === 'gold_hub') {
      return await handleGoldHub();
    }
    if (intent.type === 'amount_match') {
      return await handleAmountMatch(intent.amount);
    }
    if (intent.type === 'command_intent') {
      const cmds = getSystemCommands(intent.clean);
      const items = cmds.map((c) => ({
        group: '⚡ System Commands',
        icon: c.icon,
        tag: c.tag,
        tagColor: 'var(--gold)',
        title: c.title,
        sub: c.sub,
        btnLabel: 'Execute',
        action: c.action,
      }));
      return { hero: null, items };
    }

    return await runStandardSearch(rawQuery);
  }

  // ---------------------------------------------------------------------------
  // RENDERING & UI LOGIC
  // ---------------------------------------------------------------------------

  function hide(container, input) {
    if (!container) return;
    container.style.display = 'none';
    container.innerHTML = '';
    selectedIndex = -1;
    currentResultsList = [];
  }

  // Render Default Suggestions Palette when user focuses empty input
  function renderDefaultSuggestions(container, input) {
    const suggestions = [
      { chip: '⚡ pending', label: 'Everything pending across the OS', query: 'pending' },
      { chip: '📅 maturity next month', label: 'Investments maturing next month', query: 'maturity next month' },
      { chip: '🔔 What do I need to pay next week?', label: 'Action Center cash outflow analysis', query: 'What do I need to pay next week?' },
      { chip: '🪙 gold', label: 'Gold Intelligence & purchase records', query: 'gold' },
      { chip: '💰 ₹15000', label: 'Search matching transaction amounts', query: '₹15000' },
      { chip: '➕ > Add New Deal', label: 'Launch 4-step Deal Wizard', query: '> Add New Deal' },
      { chip: '📊 > Executive Report', label: 'Generate portfolio executive summary', query: '> Executive Report' },
    ];

    const quickCommands = getSystemCommands('').slice(0, 6);

    container.innerHTML = `
      <div class="search-default-palette" style="padding:16px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--gold);text-transform:uppercase">
            ✨ OS Intelligent Search &amp; Command Palette
          </div>
          <div style="font-size:11px;color:var(--text3)">Type query or press <kbd style="background:var(--fill-2);border:1px solid var(--border2);padding:2px 5px;border-radius:4px;font-size:10px">Esc</kbd></div>
        </div>

        <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Try natural language, asset filters, or quick commands:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          ${suggestions.map((s) => `
            <button type="button" class="btn btn-outline btn-sm search-suggest-chip" data-search-fill="${esc(s.query)}" style="font-size:11.5px;padding:5px 10px;border-radius:20px;text-align:left">
              <strong style="color:var(--text)">${esc(s.chip)}</strong> <span style="color:var(--text3);margin-left:4px">&mdash; ${esc(s.label)}</span>
            </button>
          `).join('')}
        </div>

        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Quick System Actions</div>
        <div class="search-quick-cmds-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px">
          ${quickCommands.map((c, i) => `
            <div class="search-result-row" data-default-cmd="${i}" style="cursor:pointer;padding:8px 12px;border-radius:8px;background:var(--fill-1);border:1px solid var(--border2);display:flex;align-items:center;gap:10px;transition:.15s">
              <div style="font-size:16px;width:22px;text-align:center">${c.icon}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.title)}</div>
                <div style="font-size:10.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.sub)}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="search-footer-bar" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3)">
          <div>Tip: Type <code style="color:var(--gold)">></code> for system commands, <code style="color:var(--gold)">₹amount</code> for transactions, or natural questions.</div>
          <div><kbd style="background:var(--fill-2);border:1px solid var(--border2);padding:2px 5px;border-radius:4px;font-size:10px">⌘K</kbd> / <kbd style="background:var(--fill-2);border:1px solid var(--border2);padding:2px 5px;border-radius:4px;font-size:10px">/</kbd></div>
        </div>
      </div>
    `;

    container.style.display = 'block';

    // Wire suggestion chips
    App.utils.qsa('[data-search-fill]', container).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fillText = btn.dataset.searchFill;
        if (input) {
          input.value = fillText;
          input.focus();
          // Dispatch input event to trigger search
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // Wire quick commands
    App.utils.qsa('[data-default-cmd]', container).forEach((row) => {
      const idx = Number(row.dataset.defaultCmd);
      row.addEventListener('click', () => {
        hide(container, input);
        quickCommands[idx].action();
      });
    });
  }

  // Render Full Search / Intelligence Results
  function renderSearchResults(container, data, query, input) {
    const { hero, items } = data;
    currentResultsList = items || [];
    selectedIndex = -1;

    if (!hero && (!items || items.length === 0)) {
      container.innerHTML = `
        <div style="padding:24px 20px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">&#128269;</div>
          <div style="font-size:14px;font-weight:600;color:var(--text)">No matches found for "${esc(query)}"</div>
          <div style="font-size:12px;color:var(--text3);margin-top:4px">Try typing <strong>pending</strong>, <strong>gold</strong>, <strong>₹15000</strong>, <strong>maturity next month</strong>, or <strong>What do I need to pay next week?</strong></div>
        </div>
      `;
      container.style.display = 'block';
      return;
    }

    let heroHtml = '';
    if (hero) {
      heroHtml = `
        <div class="search-hero-card" style="background:linear-gradient(135deg,rgba(201,168,76,0.12),rgba(22,201,163,0.08));border-bottom:1px solid var(--border);padding:16px 18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--gold);text-transform:uppercase;background:rgba(201,168,76,0.18);padding:3px 8px;border-radius:4px;border:1px solid rgba(201,168,76,0.3)">
              ${esc(hero.badge)}
            </span>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px">${esc(hero.title)}</div>
          <div style="font-size:12.5px;color:var(--text2);line-height:1.5;margin-bottom:12px">${hero.summary}</div>
          
          ${hero.kpis && hero.kpis.length ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px">
              ${hero.kpis.map((k) => `
                <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:8px 10px">
                  <div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">${esc(k.label)}</div>
                  <div style="font-size:13.5px;font-weight:700;color:${esc(k.color || 'var(--text)')};margin-top:2px">${esc(k.value)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${hero.actions && hero.actions.length ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${hero.actions.map((act, i) => `
                <button type="button" class="btn ${esc(act.className || 'btn-outline')} btn-sm" data-hero-action="${i}" style="font-size:11.5px">
                  ${esc(act.label)}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    // Group items
    const byGroup = {};
    items.forEach((item, index) => {
      const g = item.group || 'Results';
      (byGroup[g] = byGroup[g] || []).push({ item, index });
    });

    let itemsHtml = '';
    Object.keys(byGroup).forEach((groupName) => {
      itemsHtml += `
        <div style="padding:10px 18px 4px;font-size:10.5px;font-weight:700;letter-spacing:.06em;color:var(--text3);text-transform:uppercase;display:flex;justify-content:space-between;align-items:center">
          <span>${esc(groupName)}</span>
          <span style="font-weight:400;opacity:0.7">(${byGroup[groupName].length})</span>
        </div>
        <div style="padding:0 8px 6px">
          ${byGroup[groupName].map(({ item, index }) => `
            <div class="search-result-row" data-result-index="${index}" style="cursor:pointer;padding:8px 12px;margin:2px 0;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;transition:.12s;border:1px solid transparent">
              <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
                <div style="font-size:18px;width:24px;text-align:center;flex-shrink:0">${item.icon || '&#9670;'}</div>
                <div style="min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title)}</div>
                    ${item.tag ? `<span class="badge" style="font-size:9.5px;padding:2px 6px;border-radius:4px;border:1px solid ${esc(item.tagColor || 'var(--border2)')};color:${esc(item.tagColor || 'var(--text2)')};background:transparent;text-transform:uppercase;font-weight:700">${esc(item.tag)}</span>` : ''}
                  </div>
                  ${item.sub ? `<div style="font-size:11.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc(item.sub)}</div>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                ${item.amount ? `<span style="font-size:12.5px;font-weight:700;color:var(--gold);white-space:nowrap">${App.utils.fmtMoney(item.amount)}</span>` : ''}
                <button type="button" class="btn btn-outline btn-xs" data-btn-action="${index}" style="padding:4px 8px;font-size:10.5px;border-radius:6px;white-space:nowrap">
                  ${esc(item.btnLabel || 'Open')}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    });

    const footerHtml = `
      <div style="padding:8px 18px;border-top:1px solid var(--border2);background:var(--bg2);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3)">
        <div style="display:flex;gap:12px">
          <span><kbd style="background:var(--fill-2);border:1px solid var(--border2);padding:1px 4px;border-radius:3px">↑</kbd> <kbd style="background:var(--fill-2);border:1px solid var(--border2);padding:1px 4px;border-radius:3px">↓</kbd> to navigate</span>
          <span><kbd style="background:var(--fill-2);border:1px solid var(--border2);padding:1px 4px;border-radius:3px">↵</kbd> to select</span>
          <span><kbd style="background:var(--fill-2);border:1px solid var(--border2);padding:1px 4px;border-radius:3px">esc</kbd> to close</span>
        </div>
        <div style="font-weight:600;color:var(--gold)">PIOS Intelligence</div>
      </div>
    `;

    container.innerHTML = heroHtml + itemsHtml + footerHtml;
    container.style.display = 'block';

    // Wire hero actions
    if (hero && hero.actions) {
      App.utils.qsa('[data-hero-action]', container).forEach((btn) => {
        const idx = Number(btn.dataset.heroAction);
        btn.addEventListener('click', () => {
          hide(container, input);
          if (hero.actions[idx] && hero.actions[idx].action) {
            hero.actions[idx].action();
          }
        });
      });
    }

    // Wire result rows & action buttons
    App.utils.qsa('[data-result-index]', container).forEach((row) => {
      const idx = Number(row.dataset.resultIndex);
      const execute = () => {
        hide(container, input);
        if (currentResultsList[idx] && currentResultsList[idx].action) {
          currentResultsList[idx].action();
        }
      };
      row.addEventListener('click', execute);
      row.querySelector('[data-btn-action]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        execute();
      });
    });
  }

  // Update active highlighted row for keyboard navigation
  function updateKeyboardSelection(container) {
    const rows = App.utils.qsa('[data-result-index]', container);
    rows.forEach((row, i) => {
      const isSelected = i === selectedIndex;
      row.classList.toggle('is-selected', isSelected);
      if (isSelected) {
        row.style.background = 'var(--fill-2)';
        row.style.borderColor = 'var(--gold)';
        row.scrollIntoView({ block: 'nearest' });
      } else {
        row.style.background = 'transparent';
        row.style.borderColor = 'transparent';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // INITIALIZATION & KEYBOARD SHORTCUTS
  // ---------------------------------------------------------------------------

  function wire() {
    const input = App.utils.qs('#globalSearchInput');
    const container = App.utils.qs('#globalSearchResults');
    if (!input || !container) return;

    // Expand search input placeholder
    input.setAttribute('placeholder', 'Search deals, contacts, gold, ₹15000, "maturity next month", "pending"... (⌘K)');

    const performSearch = async () => {
      const q = input.value;
      if (!q || q.trim().length === 0) {
        renderDefaultSuggestions(container, input);
        return;
      }
      try {
        const data = await runUnifiedSearch(q);
        renderSearchResults(container, data, q, input);
      } catch (e) {
        console.error('Unified search error:', e);
      }
    };

    const debouncedSearch = App.utils.debounce(performSearch, 180);

    input.addEventListener('input', debouncedSearch);
    input.addEventListener('focus', () => {
      if (!input.value.trim()) {
        renderDefaultSuggestions(container, input);
      } else {
        debouncedSearch();
      }
    });

    // Keyboard navigation within search palette
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        hide(container, input);
        input.blur();
        return;
      }

      if (container.style.display === 'block' && currentResultsList.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % currentResultsList.length;
          updateKeyboardSelection(container);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + currentResultsList.length) % currentResultsList.length;
          updateKeyboardSelection(container);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIndex >= 0 && currentResultsList[selectedIndex]) {
            hide(container, input);
            currentResultsList[selectedIndex].action();
          } else if (currentResultsList.length > 0) {
            // Default to first item
            hide(container, input);
            currentResultsList[0].action();
          }
          return;
        }
      }
    });

    // Global shortcut: ⌘K or Ctrl+K or / to open search anywhere
    document.addEventListener('keydown', (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      const isSlash = e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      if (isCmdK || isSlash) {
        e.preventDefault();
        input.focus();
        input.select();
        const searchWrap = App.utils.qs('#topbarSearchWrap');
        if (searchWrap) searchWrap.classList.add('mobile-open');
        if (!input.value.trim()) {
          renderDefaultSuggestions(container, input);
        } else {
          debouncedSearch();
        }
      }
    });

    // Dismiss on click outside
    document.addEventListener('click', (e) => {
      if (e.target !== input && !container.contains(e.target)) {
        hide(container, input);
      }
    });
  }

  return {
    wire,
    search: runUnifiedSearch,
    openPalette: () => {
      const input = App.utils.qs('#globalSearchInput');
      const container = App.utils.qs('#globalSearchResults');
      if (input && container) {
        input.focus();
        renderDefaultSuggestions(container, input);
      }
    }
  };
})();
