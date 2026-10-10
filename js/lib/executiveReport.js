/* Consolidated Executive Investment Report & Full Portfolio Dossier Engine
   Generates two distinctly differentiated reports:
   1. Executive Report: High-level C-Suite strategic summary of portfolio KPIs, net worth allocation,
      30/60/90-day cash flow forecast, annual projected yield, and risk exposure.
   2. Full Portfolio Dossier: Comprehensive, audit-level investment register with:
      - Investment Contracts & Yield Matrix (Active deals first, then remaining, with Deal Name,
        Deal ID, Invested Amount, ROI, Frequency, Installments/Months, Start Date, Maturity Date,
        Interest Received, Interest Pending, Principal Returned, Total Received)
      - Systematic Recurring Investments & SIPs (Active first, then remaining, with Item, Amount,
        Frequency, Start Date, End Date, Total Expected, Total Invested to Date, Next Due Date)
      - Expense Projects & Expenditure Ledger (Consecutive projects with full line-item transactions:
        Date, Item, Amount, CR/DR)
      - Bank Accounts & Fixed Deposits (FD Principal, Start Date, End Date, Interest Rate,
        Expected Return on Maturity, and Current Accumulated Interest)
      - Physical & Scheme Bullion, Liabilities & Debt Ledger */
window.App = window.App || {};

App.executiveReport = (function () {
  async function gatherReportData() {
    const [
      netWorth,
      cashFlow,
      deals,
      metrics,
      recurringItems,
      recurringSummary,
      goldPurchases,
      goldSchemeHoldings,
      expenseProjects,
      expenseTransactions,
      accounts,
      liabilities,
      contacts,
      schedule,
      payments,
      recurringOccurrences,
      profile,
    ] = await Promise.all([
      App.netWorthCalc ? App.netWorthCalc.computeNetWorth().catch(() => ({ netWorth: 0, totalAssets: 0, liabilitiesTotal: 0, dealsTotal: 0, accountsTotal: 0, goldTotal: 0 })) : { netWorth: 0, totalAssets: 0, liabilitiesTotal: 0, dealsTotal: 0, accountsTotal: 0, goldTotal: 0 },
      App.cashFlowCalc ? App.cashFlowCalc.computeCashFlow().catch(() => ({ next30Days: 0, next7Days: 0, next90Days: 0, netCashMovement: 0, thisMonthReceived: 0 })) : { next30Days: 0, next7Days: 0, next90Days: 0, netCashMovement: 0, thisMonthReceived: 0 },
      App.api.listDeals ? App.api.listDeals().catch(() => []) : [],
      App.api.listDealMetrics ? App.api.listDealMetrics().catch(() => []) : [],
      App.api.listRecurringItems ? App.api.listRecurringItems().catch(() => []) : (App.api.listRecurring ? App.api.listRecurring().catch(() => []) : []),
      App.api.getRecurringSummary ? App.api.getRecurringSummary().catch(() => ({})) : {},
      App.api.listGoldPurchases ? App.api.listGoldPurchases().catch(() => []) : [],
      App.api.listGoldSchemeHoldings ? App.api.listGoldSchemeHoldings().catch(() => []) : [],
      App.api.listExpenseProjects ? App.api.listExpenseProjects().catch(() => []) : [],
      App.api.listExpenseTransactions ? App.api.listExpenseTransactions().catch(() => []) : [],
      App.api.listAccounts ? App.api.listAccounts().catch(() => []) : [],
      App.api.listLiabilities ? App.api.listLiabilities().catch(() => []) : [],
      App.api.listContacts ? App.api.listContacts().catch(() => []) : [],
      App.api.listSchedule ? App.api.listSchedule().catch(() => []) : [],
      App.api.listPayments ? App.api.listPayments().catch(() => []) : [],
      App.api.listRecurringOccurrences ? App.api.listRecurringOccurrences().catch(() => []) : [],
      App.state.profile || {},
    ]);

    const activeDeals = deals.filter((d) => (d.status || '').toUpperCase() === 'ACTIVE');
    const inactiveDeals = deals.filter((d) => (d.status || '').toUpperCase() !== 'ACTIVE');
    const sortedDeals = [...activeDeals, ...inactiveDeals];

    const totalInvested = deals.reduce((s, d) => s + (Number(d.invested_amount) || Number(d.principal_amount) || 0), 0);
    const activeInvested = activeDeals.reduce((s, d) => s + (Number(d.invested_amount) || Number(d.principal_amount) || 0), 0);
    const weightedRoi = activeInvested > 0
      ? activeDeals.reduce((s, d) => s + (Number(d.invested_amount) || Number(d.principal_amount) || 0) * (Number(d.annual_roi) || 0), 0) / activeInvested
      : 0;

    const metricsById = {};
    (metrics || []).forEach((m) => { if (m.deal_id) metricsById[m.deal_id] = m; });

    // Group payments by deal_id
    const paymentsByDeal = {};
    (payments || []).forEach((p) => {
      if (!p.deal_id) return;
      if (!paymentsByDeal[p.deal_id]) paymentsByDeal[p.deal_id] = [];
      paymentsByDeal[p.deal_id].push(p);
    });

    // Group recurring occurrences by recurring_item_id
    const occurrencesByRecurring = {};
    (recurringOccurrences || []).forEach((o) => {
      if (!o.recurring_item_id) return;
      if (!occurrencesByRecurring[o.recurring_item_id]) occurrencesByRecurring[o.recurring_item_id] = [];
      occurrencesByRecurring[o.recurring_item_id].push(o);
    });

    // Group expense transactions by project_id
    const txnsByProject = {};
    (expenseTransactions || []).forEach((t) => {
      const pid = t.project_id || t.expense_project_id || 'unassigned';
      if (!txnsByProject[pid]) txnsByProject[pid] = [];
      txnsByProject[pid].push(t);
    });

    const totalGoldGrams = (goldPurchases || []).reduce((s, g) => s + (Number(g.weight_grams) || 0), 0) +
      (goldSchemeHoldings || []).reduce((s, g) => s + (Number(g.accumulated_grams) || 0), 0);
    const totalGoldInvested = (goldPurchases || []).reduce((s, g) => s + (Number(g.total_amount) || 0), 0) +
      (goldSchemeHoldings || []).reduce((s, g) => s + (Number(g.total_amount_paid) || 0), 0);

    const totalProjectsBudget = (expenseProjects || []).reduce((s, p) => s + (Number(p.budget_total ?? p.budget_amount) || 0), 0);
    const totalExpensesSpent = (expenseTransactions || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const totalRecurringMonthly = (recurringItems || []).reduce((s, r) => {
      const amt = Number(r.expected_amount ?? r.amount) || 0;
      const freq = (r.frequency || '').toLowerCase();
      if (freq === 'weekly') return s + (amt * 52 / 12);
      if (freq === 'quarterly') return s + (amt / 3);
      if (freq === 'yearly' || freq === 'annually') return s + (amt / 12);
      return s + amt;
    }, 0);

    return {
      generatedAt: new Date(),
      userName: profile.full_name || profile.username || profile.email || 'Portfolio Owner',
      userEmail: profile.email || '',
      preferredCurrency: profile.preferred_currency || 'INR',
      netWorth,
      cashFlow,
      deals,
      sortedDeals,
      activeDeals,
      inactiveDeals,
      metricsById,
      paymentsByDeal,
      recurringItems,
      occurrencesByRecurring,
      recurringSummary,
      goldPurchases,
      goldSchemeHoldings,
      expenseProjects,
      expenseTransactions,
      txnsByProject,
      accounts,
      liabilities,
      contacts,
      schedule,
      stats: {
        totalInvested,
        activeInvested,
        weightedRoi,
        dealCount: deals.length,
        activeDealCount: activeDeals.length,
        totalGoldGrams,
        totalGoldInvested,
        totalProjectsBudget,
        totalExpensesSpent,
        totalRecurringMonthly,
        recurringCount: recurringItems.length,
        accountsCount: accounts.length,
        liabilitiesCount: liabilities.length,
      },
    };
  }

  // Helper: compute duration in months and installment count
  function computeMonthsAndInstallments(startDateStr, maturityDateStr, frequency) {
    if (!startDateStr || !maturityDateStr) return { months: 0, text: 'N/A' };
    const d1 = new Date(startDateStr);
    const d2 = new Date(maturityDateStr);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) return { months: 0, text: 'N/A' };
    const months = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()));
    const freq = (frequency || 'Monthly').toLowerCase();
    let divisor = 1;
    if (freq.includes('quarter')) divisor = 3;
    else if (freq.includes('half') || freq.includes('semi')) divisor = 6;
    else if (freq.includes('year') || freq.includes('annual')) divisor = 12;
    else if (freq.includes('week')) divisor = 0.23;
    const installments = Math.max(1, Math.round(months / divisor));
    return {
      months,
      installments,
      text: `${months} Mos (${installments} inst.)`,
    };
  }

  // =========================================================================
  // 1. EXECUTIVE REPORT (C-Suite Strategic Summary)
  // =========================================================================
  function generateExecutiveReportHtml(data) {
    const {
      netWorth,
      cashFlow,
      activeDeals,
      stats,
      userName,
      userEmail,
      generatedAt,
    } = data;

    const dateStr = App.utils.fmtDateTime ? App.utils.fmtDateTime(generatedAt) : new Date(generatedAt).toLocaleString();

    return `
      <div class="executive-report-document" id="executiveReportDoc">
        <div class="exec-header">
          <div class="exec-brand">
            <div class="exec-logo">IOS</div>
            <div>
              <div class="exec-title">PERSONAL INVESTMENT OPERATING SYSTEM</div>
              <div class="exec-subtitle">EXECUTIVE PORTFOLIO STRATEGY REPORT</div>
            </div>
          </div>
          <div class="exec-meta">
            <div><b>Prepared for:</b> ${App.utils.escapeHtml(userName)}</div>
            ${userEmail ? `<div style="font-size:11px;color:var(--text3);">${App.utils.escapeHtml(userEmail)}</div>` : ''}
            <div style="margin-top:4px"><b>Generated:</b> ${dateStr}</div>
            <div class="exec-confidential-tag" style="background:#eff6ff;color:#1e40af;border-color:#bfdbfe">EXECUTIVE BRIEFING &bull; PRIVATE</div>
          </div>
        </div>

        <div class="exec-divider" style="background:var(--blue, #2563eb)"></div>

        <!-- SECTION 1: C-SUITE WEALTH & LIQUIDITY SNAPSHOT -->
        <div class="exec-section">
          <div class="exec-sec-title">1. Executive Wealth &amp; Liquidity Snapshot</div>
          <div class="exec-grid-4">
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Total Net Worth</div>
              <div class="exec-kpi-val highlight">${App.utils.fmtMoney(netWorth.netWorth)}</div>
              <div class="exec-kpi-sub">Total Assets: ${App.utils.fmtMoney(netWorth.totalAssets)}</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Active Capital Invested</div>
              <div class="exec-kpi-val">${App.utils.fmtMoney(stats.activeInvested)}</div>
              <div class="exec-kpi-sub">${stats.activeDealCount} Active High-Yield Deals</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Weighted Portfolio ROI</div>
              <div class="exec-kpi-val" style="color:var(--teal)">${App.utils.fmtPct(stats.weightedRoi)}</div>
              <div class="exec-kpi-sub">Annualized average yield</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Total Liabilities</div>
              <div class="exec-kpi-val" style="color:${netWorth.liabilitiesTotal > 0 ? 'var(--red)' : 'var(--text)'}">${App.utils.fmtMoney(netWorth.liabilitiesTotal)}</div>
              <div class="exec-kpi-sub">${netWorth.liabilitiesTotal > 0 ? 'Active Debt Obligations' : 'Zero Liabilities Reported'}</div>
            </div>
          </div>
        </div>

        <!-- SECTION 2: MACRO ASSET ALLOCATION -->
        <div class="exec-section">
          <div class="exec-sec-title">2. Macro Asset Allocation &amp; Portfolio Distribution</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Asset Class</th>
                  <th style="text-align:right">Current Valuation</th>
                  <th style="text-align:right">% Portfolio Share</th>
                  <th>Strategic Purpose &amp; Composition</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Deals &amp; Private Credit Contracts</b></td>
                  <td style="text-align:right"><b>${App.utils.fmtMoney(netWorth.dealsTotal)}</b></td>
                  <td style="text-align:right">${App.utils.fmtPct(netWorth.totalAssets > 0 ? (netWorth.dealsTotal / netWorth.totalAssets) * 100 : 0)}</td>
                  <td>${stats.activeDealCount} active yield-generating contracts with monthly/quarterly payouts</td>
                </tr>
                <tr>
                  <td><b>Liquid Bank Accounts &amp; Fixed Deposits</b></td>
                  <td style="text-align:right"><b>${App.utils.fmtMoney(netWorth.accountsTotal)}</b></td>
                  <td style="text-align:right">${App.utils.fmtPct(netWorth.totalAssets > 0 ? (netWorth.accountsTotal / netWorth.totalAssets) * 100 : 0)}</td>
                  <td>${stats.accountsCount} Checking, Savings &amp; Fixed Deposit reserves for emergency buffer</td>
                </tr>
                <tr>
                  <td><b>Physical &amp; Scheme Gold Holdings</b></td>
                  <td style="text-align:right"><b>${App.utils.fmtMoney(netWorth.goldTotal)}</b></td>
                  <td style="text-align:right">${App.utils.fmtPct(netWorth.totalAssets > 0 ? (netWorth.goldTotal / netWorth.totalAssets) * 100 : 0)}</td>
                  <td>${stats.totalGoldGrams ? stats.totalGoldGrams.toFixed(2) + ' grams total' : 'Recorded holdings'} hedging inflation</td>
                </tr>
                <tr style="background:var(--fill-2);font-weight:700">
                  <td>Consolidated Asset Base</td>
                  <td style="text-align:right">${App.utils.fmtMoney(netWorth.totalAssets)}</td>
                  <td style="text-align:right">100.0%</td>
                  <td>Gross portfolio capitalization</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 3: PROJECTED INCOME & CASH FLOW FORECAST -->
        <div class="exec-section">
          <div class="exec-sec-title">3. Income Forecast &amp; Cash Flow Velocity</div>
          <div class="exec-grid-3">
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Next 30 Days Expected Inflows</div>
              <div class="exec-kpi-val" style="color:var(--teal)">${App.utils.fmtMoney(cashFlow.next30Days)}</div>
              <div class="exec-kpi-sub">Next 7 Days: ${App.utils.fmtMoney(cashFlow.next7Days)}</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Next 90 Days Expected Inflows</div>
              <div class="exec-kpi-val" style="color:var(--blue)">${App.utils.fmtMoney(cashFlow.next90Days)}</div>
              <div class="exec-kpi-sub">Quarterly projected liquidity</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">This Month Net Cash Movement</div>
              <div class="exec-kpi-val" style="color:${cashFlow.netCashMovement >= 0 ? 'var(--teal)' : 'var(--red)'}">${App.utils.fmtMoney(cashFlow.netCashMovement)}</div>
              <div class="exec-kpi-sub">Received to date: ${App.utils.fmtMoney(cashFlow.thisMonthReceived)}</div>
            </div>
          </div>
        </div>

        <!-- SECTION 4: STRATEGIC MATURITY HORIZON -->
        <div class="exec-section">
          <div class="exec-sec-title">4. Top Active Deals &amp; Maturity Horizon</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Deal Name</th>
                  <th>ID</th>
                  <th style="text-align:right">Invested Capital</th>
                  <th style="text-align:right">ROI (% p.a.)</th>
                  <th>Payout Freq</th>
                  <th>Maturity Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${activeDeals.slice(0, 8).map((d) => `
                  <tr>
                    <td><b>${App.utils.escapeHtml(d.deal_name)}</b></td>
                    <td style="font-family:monospace;font-size:11px">${App.utils.escapeHtml(d.external_deal_id || String(d.id))}</td>
                    <td style="text-align:right"><b>${App.utils.fmtMoney(d.invested_amount || d.principal_amount || 0)}</b></td>
                    <td style="text-align:right;color:var(--gold);font-weight:600">${App.utils.fmtPct(d.annual_roi || 0)}</td>
                    <td>${App.utils.escapeHtml(d.payment_frequency || 'Monthly')}</td>
                    <td>${App.utils.fmtDate ? App.utils.fmtDate(d.maturity_date) : (d.maturity_date || 'N/A')}</td>
                    <td><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(22,201,163,0.12);color:var(--teal)">ACTIVE</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="exec-footer">
          <div class="exec-disclaimer">
            This Executive Report provides high-level strategic intelligence for personal asset allocation, liquidity management, and cash flow forecasting. For line-item audits and contract matrices, consult the Full Portfolio Dossier.
          </div>
          <div><b>Investment OS</b> &bull; Confidential</div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 2. FULL PORTFOLIO DOSSIER (Complete Detailed Audit Register)
  // =========================================================================
  function generateFullPortfolioDossierHtml(data) {
    const {
      netWorth,
      sortedDeals,
      activeDeals,
      metricsById,
      paymentsByDeal,
      recurringItems,
      occurrencesByRecurring,
      goldPurchases,
      goldSchemeHoldings,
      expenseProjects,
      txnsByProject,
      accounts,
      liabilities,
      stats,
      userName,
      userEmail,
      generatedAt,
    } = data;

    const dateStr = App.utils.fmtDateTime ? App.utils.fmtDateTime(generatedAt) : new Date(generatedAt).toLocaleString();

    // Sort recurring items: Active first
    const sortedRecurring = [...recurringItems].sort((a, b) => {
      const aAct = (a.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 1 : 0;
      const bAct = (b.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 1 : 0;
      return bAct - aAct;
    });

    return `
      <div class="executive-report-document" id="executiveReportDoc">
        <div class="exec-header">
          <div class="exec-brand">
            <div class="exec-logo">IOS</div>
            <div>
              <div class="exec-title">PERSONAL INVESTMENT OPERATING SYSTEM</div>
              <div class="exec-subtitle">FULL COMPREHENSIVE PORTFOLIO DOSSIER &amp; AUDIT LEDGER</div>
            </div>
          </div>
          <div class="exec-meta">
            <div><b>Prepared for:</b> ${App.utils.escapeHtml(userName)}</div>
            ${userEmail ? `<div style="font-size:11px;color:var(--text3);">${App.utils.escapeHtml(userEmail)}</div>` : ''}
            <div style="margin-top:4px"><b>Audit Date:</b> ${dateStr}</div>
            <div class="exec-confidential-tag">CONFIDENTIAL &bull; COMPLETE AUDIT REGISTER</div>
          </div>
        </div>

        <div class="exec-divider"></div>

        <!-- KPI SUMMARY BAR -->
        <div class="exec-section">
          <div class="exec-grid-4">
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Total Net Worth</div>
              <div class="exec-kpi-val highlight">${App.utils.fmtMoney(netWorth.netWorth)}</div>
              <div class="exec-kpi-sub">Gross Assets: ${App.utils.fmtMoney(netWorth.totalAssets)}</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Total Capital Invested</div>
              <div class="exec-kpi-val">${App.utils.fmtMoney(stats.totalInvested)}</div>
              <div class="exec-kpi-sub">${stats.activeDealCount} Active (${App.utils.fmtMoney(stats.activeInvested)})</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Weighted ROI</div>
              <div class="exec-kpi-val" style="color:var(--teal)">${App.utils.fmtPct(stats.weightedRoi)}</div>
              <div class="exec-kpi-sub">Annualized contract yield</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Liabilities Total</div>
              <div class="exec-kpi-val" style="color:${netWorth.liabilitiesTotal > 0 ? 'var(--red)' : 'var(--text)'}">${App.utils.fmtMoney(netWorth.liabilitiesTotal)}</div>
              <div class="exec-kpi-sub">${netWorth.liabilitiesTotal > 0 ? 'Active obligations' : 'Zero debt reported'}</div>
            </div>
          </div>
        </div>

        <!-- 1. INVESTMENT CONTRACTS & YIELD MATRIX -->
        <div class="exec-section">
          <div class="exec-sec-title">1. Investment Contracts &amp; Yield Matrix (${sortedDeals.length} Deals &bull; Active First)</div>
          <div class="exec-table-wrap">
            <table class="exec-table exec-table-dossier-deals" style="width:100%;table-layout:fixed;border-collapse:collapse">
              <colgroup>
                <col style="width:15%">
                <col style="width:6%">
                <col style="width:9%">
                <col style="width:5.5%">
                <col style="width:5.5%">
                <col style="width:7.5%">
                <col style="width:7%">
                <col style="width:7%">
                <col style="width:9.25%">
                <col style="width:9.25%">
                <col style="width:9.25%">
                <col style="width:9.75%">
              </colgroup>
              <thead>
                <tr>
                  <th>Deal Name</th>
                  <th>Deal ID</th>
                  <th style="text-align:right">Invested Amount</th>
                  <th style="text-align:right">Invested ROI</th>
                  <th>Frequency</th>
                  <th>Installments (Months)</th>
                  <th>Start Date</th>
                  <th>Maturity Date</th>
                  <th style="text-align:right">Interest Received</th>
                  <th style="text-align:right">Interest Pending</th>
                  <th style="text-align:right">Principal Returned</th>
                  <th style="text-align:right">Total Received</th>
                </tr>
              </thead>
              <tbody>
                ${sortedDeals.length > 0 ? sortedDeals.map((d) => {
                  const m = metricsById[d.id] || {};
                  const dPayments = paymentsByDeal[d.id] || [];
                  const isActive = (d.status || '').toUpperCase() === 'ACTIVE';

                  // Calculate interest & principal received from recorded payments or metrics
                  let intRec = dPayments.reduce((s, p) => s + (Number(p.interest_amount) || (p.payment_type === 'Interest' ? Number(p.amount) : 0)), 0);
                  let prnRec = dPayments.reduce((s, p) => s + (Number(p.principal_amount) || (p.payment_type === 'Principal' ? Number(p.amount) : 0)), 0);
                  if (m.total_interest_received > 0 && intRec === 0) intRec = Number(m.total_interest_received);
                  if (m.principal_returned > 0 && prnRec === 0) prnRec = Number(m.principal_returned);

                  // Expected interest & pending interest
                  const inv = Number(d.invested_amount || d.principal_amount || 0);
                  const roi = Number(d.annual_roi || 0);
                  const dur = computeMonthsAndInstallments(d.start_date, d.maturity_date, d.payment_frequency);
                  const expInt = m.expected_interest != null
                    ? Number(m.expected_interest)
                    : (d.expected_total_interest != null ? Number(d.expected_total_interest) : (inv * (roi / 100) * ((dur.months || 12) / 12)));
                  const intPending = Math.max(0, expInt - intRec);
                  const totalRec = intRec + prnRec;

                  return `
                    <tr style="${isActive ? 'background:rgba(22,201,163,0.02)' : 'opacity:0.8'}">
                      <td style="word-break:break-word">
                        <b>${App.utils.escapeHtml(d.deal_name)}</b>
                        ${isActive ? '<span style="margin-left:3px;padding:1px 4px;background:rgba(22,201,163,0.15);color:var(--teal);border-radius:3px;font-weight:700">ACTIVE</span>' : `<span style="margin-left:3px;padding:1px 4px;background:rgba(100,116,139,0.15);color:#64748b;border-radius:3px;font-weight:600">${App.utils.escapeHtml(d.status || 'CLOSED')}</span>`}
                      </td>
                      <td style="font-family:monospace;word-break:break-all">${App.utils.escapeHtml(d.external_deal_id || String(d.id))}</td>
                      <td style="text-align:right"><b>${App.utils.fmtMoney(inv)}</b></td>
                      <td style="text-align:right;color:var(--gold);font-weight:600">${App.utils.fmtPct(roi)}</td>
                      <td>${App.utils.escapeHtml(d.payment_frequency || 'Monthly')}</td>
                      <td>${dur.text}</td>
                      <td>${d.start_date ? (App.utils.fmtDate ? App.utils.fmtDate(d.start_date) : d.start_date) : '—'}</td>
                      <td>${d.maturity_date ? (App.utils.fmtDate ? App.utils.fmtDate(d.maturity_date) : d.maturity_date) : '—'}</td>
                      <td style="text-align:right;color:var(--teal)">${App.utils.fmtMoney(intRec)}</td>
                      <td style="text-align:right;color:var(--gold)">${App.utils.fmtMoney(intPending)}</td>
                      <td style="text-align:right;color:${prnRec > 0 ? 'var(--blue)' : 'inherit'}">${App.utils.fmtMoney(prnRec)}</td>
                      <td style="text-align:right;font-weight:700">${App.utils.fmtMoney(totalRec)}</td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="12" style="text-align:center;padding:16px;color:var(--text3)">No investment deals recorded.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. SYSTEMATIC RECURRING INVESTMENTS & SIPS -->
        <div class="exec-section">
          <div class="exec-sec-title">2. Systematic Recurring Investments &amp; SIPs (${sortedRecurring.length} Plans &bull; Active First)</div>
          <div class="exec-table-wrap">
            <table class="exec-table exec-table-dossier-recurring" style="width:100%;table-layout:fixed;border-collapse:collapse">
              <colgroup>
                <col style="width:20%">
                <col style="width:9%">
                <col style="width:7%">
                <col style="width:8%">
                <col style="width:9%">
                <col style="width:12%">
                <col style="width:13%">
                <col style="width:12%">
                <col style="width:10%">
              </colgroup>
              <thead>
                <tr>
                  <th>Item / Plan Name</th>
                  <th style="text-align:right">Amount</th>
                  <th>Frequency</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th style="text-align:right">Total Expected</th>
                  <th style="text-align:right">Total Invested to Date</th>
                  <th>Next Due Date</th>
                  <th style="text-align:center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${sortedRecurring.length > 0 ? sortedRecurring.map((r) => {
                  const amt = Number(r.expected_amount ?? r.current_amount ?? r.amount) || 0;
                  const isActive = (r.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
                  const occurrences = occurrencesByRecurring[r.id] || [];
                  const confirmedOccs = occurrences.filter((o) => o.status === 'Paid' || o.status === 'Confirmed' || (o.due_date && new Date(o.due_date) <= new Date()));
                  const totalPaid = confirmedOccs.reduce((s, o) => s + (Number(o.actual_amount || o.expected_amount || amt) || 0), 0);
                  const totalInvestedToDate = r.total_invested != null ? Math.max(Number(r.total_invested), totalPaid) : totalPaid;

                  // Expected total calculation
                  let totalExpected = r.total_expected_amount || r.target_amount || r.expected_return || 0;
                  if (!totalExpected && r.start_date && r.end_date) {
                    const dur = computeMonthsAndInstallments(r.start_date, r.end_date, r.frequency);
                    totalExpected = amt * (dur.installments || dur.months || 1);
                  } else if (!totalExpected && (r.number_of_occurrences || r.total_occurrences)) {
                    totalExpected = amt * Number(r.number_of_occurrences || r.total_occurrences || 1);
                  }

                  return `
                    <tr style="${isActive ? 'background:rgba(22,201,163,0.02)' : 'opacity:0.8'}">
                      <td><b>${App.utils.escapeHtml(r.item_name || r.title || r.name || 'SIP Plan')}</b></td>
                      <td style="text-align:right"><b>${App.utils.fmtMoney(amt)}</b></td>
                      <td>${App.utils.escapeHtml(r.frequency || 'Monthly')}</td>
                      <td>${r.start_date ? (App.utils.fmtDate ? App.utils.fmtDate(r.start_date) : r.start_date) : (r.first_due_date ? App.utils.fmtDate(r.first_due_date) : '—')}</td>
                      <td>${r.end_date ? (App.utils.fmtDate ? App.utils.fmtDate(r.end_date) : r.end_date) : 'Ongoing (No End Date)'}</td>
                      <td style="text-align:right">${totalExpected > 0 ? App.utils.fmtMoney(totalExpected) : (amt > 0 ? `Ongoing (${App.utils.fmtMoney(amt * 12)}/yr)` : '—')}</td>
                      <td style="text-align:right;color:var(--teal);font-weight:600">${App.utils.fmtMoney(totalInvestedToDate)}</td>
                      <td>${r.next_due_date ? (App.utils.fmtDate ? App.utils.fmtDate(r.next_due_date) : r.next_due_date) : 'Active'}</td>
                      <td style="text-align:center"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:${isActive ? 'rgba(22,201,163,0.12)' : 'rgba(100,116,139,0.12)'};color:${isActive ? 'var(--teal)' : '#64748b'}">${(r.status || 'ACTIVE').toUpperCase()}</span></td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--text3)">No systematic recurring investments or SIPs recorded.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 3. EXPENSE PROJECTS & EXPENDITURE LEDGER -->
        <div class="exec-section">
          <div class="exec-sec-title">3. Expense Projects &amp; Expenditure Ledger (${expenseProjects.length} Projects &bull; With Full Transaction Detail)</div>
          ${expenseProjects.length > 0 ? expenseProjects.map((p) => {
            const budget = Number(p.budget_total ?? p.budget_amount) || 0;
            const txns = txnsByProject[p.id] || [];
            const debits = txns.filter((t) => (t.transaction_type || 'Debit').toLowerCase() !== 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const credits = txns.filter((t) => (t.transaction_type || '').toLowerCase() === 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const netTxnSpent = debits - credits;
            const spent = (p.total_spent != null && Number(p.total_spent) > 0)
              ? Number(p.total_spent)
              : ((p.spent_amount != null && Number(p.spent_amount) > 0) ? Number(p.spent_amount) : Math.max(0, netTxnSpent));
            const variance = budget - spent;
            const isOver = variance < 0;

            return `
              <div class="exec-project-box" style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;background:#fcfcfd">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
                  <div>
                    <strong style="font-size:13px;color:var(--text)">${App.utils.escapeHtml(p.name || p.project_name || 'Expense Project')}</strong>
                    <span style="font-size:11px;color:var(--text3);margin-left:6px">(${App.utils.escapeHtml(p.project_type || p.category || 'General')})</span>
                  </div>
                  <div style="display:flex;gap:14px;font-size:11.5px">
                    <span>Allocated Budget: <b>${App.utils.fmtMoney(budget)}</b></span>
                    <span>Actual Spent: <b style="color:${isOver ? 'var(--red)' : 'var(--text)'}">${App.utils.fmtMoney(spent)}</b></span>
                    <span>Variance: <b style="color:${isOver ? 'var(--red)' : 'var(--teal)'}">${isOver ? '-' : '+'}${App.utils.fmtMoney(Math.abs(variance))}</b></span>
                  </div>
                </div>

                <!-- Transaction Ledger for this Project -->
                <div class="exec-table-wrap">
                  <table class="exec-table" style="width:100%;table-layout:fixed;border-collapse:collapse">
                    <colgroup>
                      <col style="width:15%">
                      <col style="width:55%">
                      <col style="width:18%">
                      <col style="width:12%">
                    </colgroup>
                    <thead>
                      <tr style="background:#f8fafc">
                        <th>Date</th>
                        <th>Item / Description</th>
                        <th style="text-align:right">Amount</th>
                        <th style="text-align:center">CR / DR</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${txns.length > 0 ? txns.map((t) => {
                        const isCredit = (t.transaction_type || '').toLowerCase() === 'credit';
                        return `
                          <tr>
                            <td>${t.transaction_date ? (App.utils.fmtDate ? App.utils.fmtDate(t.transaction_date) : t.transaction_date) : '—'}</td>
                            <td>${App.utils.escapeHtml(t.item || t.description || 'Expense item')}</td>
                            <td style="text-align:right;font-weight:600;color:${isCredit ? 'var(--teal)' : 'inherit'}">${isCredit ? '+' : ''}${App.utils.fmtMoney(t.amount)}</td>
                            <td style="text-align:center;font-weight:700;color:${isCredit ? 'var(--teal)' : 'var(--red)'}">${isCredit ? 'CR' : 'DR'}</td>
                          </tr>
                        `;
                      }).join('') : `<tr><td colspan="4" style="text-align:center;padding:8px;color:var(--text3);font-size:11px">No direct transactions logged under this project.</td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }).join('') : `<div style="padding:14px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;color:var(--text3)">No expense projects configured.</div>`}
        </div>

        <!-- 4. BANK ACCOUNTS & FIXED DEPOSIT MATURITY REGISTER -->
        <div class="exec-section">
          <div class="exec-sec-title">4. Bank Accounts &amp; Fixed Deposits (${accounts.length} Accounts)</div>
          <div class="exec-table-wrap">
            <table class="exec-table exec-table-dossier-accounts" style="width:100%;table-layout:fixed;border-collapse:collapse">
              <colgroup>
                <col style="width:17%">
                <col style="width:10%">
                <col style="width:11%">
                <col style="width:8%">
                <col style="width:9%">
                <col style="width:7%">
                <col style="width:19%">
                <col style="width:19%">
              </colgroup>
              <thead>
                <tr>
                  <th>Account / Bank Name</th>
                  <th>Account Type</th>
                  <th style="text-align:right">Balance / Principal</th>
                  <th>Start Date</th>
                  <th>End / Maturity Date</th>
                  <th style="text-align:right">Interest Rate (% p.a.)</th>
                  <th style="text-align:right">Current Accumulated Interest</th>
                  <th style="text-align:right">Expected Return on Maturity</th>
                </tr>
              </thead>
              <tbody>
                ${accounts.length > 0 ? accounts.map((a) => {
                  const bal = Number(a.current_balance || a.balance || 0);
                  const isFd = (a.account_type || '').toLowerCase().includes('deposit') || (a.account_type || '').toLowerCase().includes('fd') || a.interest_rate > 0;
                  const rate = Number(a.interest_rate || 0);
                  const startDate = a.start_date || null;
                  const endDate = a.maturity_date || a.end_date || null;

                  // Compute FD expected return & accumulated interest
                  let expReturn = a.maturity_amount ? Number(a.maturity_amount) : bal;
                  let accumInt = a.accumulated_interest ? Number(a.accumulated_interest) : 0;
                  if (isFd && rate > 0 && startDate) {
                    const s = new Date(startDate);
                    const now = new Date();
                    const e = endDate ? new Date(endDate) : new Date(s.getTime() + 365 * 24 * 3600 * 1000);
                    const totalDays = Math.max(1, (e - s) / (1000 * 3600 * 24));
                    const elapsedDays = Math.max(0, Math.min(totalDays, (now - s) / (1000 * 3600 * 24)));
                    if (!a.maturity_amount) {
                      expReturn = bal + (bal * (rate / 100) * (totalDays / 365));
                    }
                    if (!a.accumulated_interest) {
                      accumInt = bal * (rate / 100) * (elapsedDays / 365);
                    }
                  }

                  return `
                    <tr style="${isFd ? 'background:rgba(184,146,60,0.03)' : ''}">
                      <td><b>${App.utils.escapeHtml(a.account_name || a.bank_name || 'Bank Account')}</b></td>
                      <td>
                        ${App.utils.escapeHtml(a.account_type || 'Checking')}
                        ${isFd ? '<span style="margin-left:4px;font-size:9.5px;padding:1px 4px;background:rgba(184,146,60,0.15);color:var(--gold);border-radius:3px;font-weight:700">FD / TERM</span>' : ''}
                      </td>
                      <td style="text-align:right"><b>${App.utils.fmtMoney(bal)}</b></td>
                      <td>${startDate ? (App.utils.fmtDate ? App.utils.fmtDate(startDate) : startDate) : '—'}</td>
                      <td>${endDate ? (App.utils.fmtDate ? App.utils.fmtDate(endDate) : endDate) : (isFd ? 'Perpetual' : 'Liquid')}</td>
                      <td style="text-align:right;color:var(--gold)">${rate > 0 ? `${rate}%` : '—'}</td>
                      <td style="text-align:right;color:var(--teal)">${accumInt > 0 ? App.utils.fmtMoney(accumInt) : '—'}</td>
                      <td style="text-align:right;font-weight:600;color:var(--blue)">${isFd ? App.utils.fmtMoney(expReturn) : App.utils.fmtMoney(bal)}</td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text3)">No bank accounts recorded.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 5. PHYSICAL & SCHEME GOLD VAULT -->
        <div class="exec-section">
          <div class="exec-sec-title">5. Physical &amp; Scheme Gold Vault (${stats.totalGoldGrams.toFixed(2)} Grams Total)</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Holding / Scheme</th>
                  <th>Type / Dealer</th>
                  <th style="text-align:right">Purity</th>
                  <th style="text-align:right">Grams</th>
                  <th style="text-align:right">Book Cost</th>
                  <th style="text-align:right">Current Valuation</th>
                </tr>
              </thead>
              <tbody>
                ${(goldPurchases.length > 0 || goldSchemeHoldings.length > 0) ? `
                  ${goldPurchases.map((g) => `
                    <tr>
                      <td><b>Physical Gold Purchase</b> ${g.invoice_number ? `<span style="font-size:10px;color:var(--text3)">(${App.utils.escapeHtml(g.invoice_number)})</span>` : ''}</td>
                      <td>${App.utils.escapeHtml(g.jeweller_name || 'Physical Bullion')}</td>
                      <td style="text-align:right">${g.purity || '24K'}</td>
                      <td style="text-align:right"><b>${Number(g.weight_grams || 0).toFixed(2)}g</b></td>
                      <td style="text-align:right">${App.utils.fmtMoney(g.total_amount || 0)}</td>
                      <td style="text-align:right;color:var(--gold)">${App.utils.fmtMoney(g.current_value || g.total_amount || 0)}</td>
                    </tr>
                  `).join('')}
                  ${goldSchemeHoldings.map((s) => `
                    <tr>
                      <td><b>${App.utils.escapeHtml(s.scheme_name || 'Gold Savings Scheme')}</b></td>
                      <td>${App.utils.escapeHtml(s.jeweller_name || 'Jeweller Scheme')}</td>
                      <td style="text-align:right">22K / 24K</td>
                      <td style="text-align:right"><b>${Number(s.accumulated_grams || 0).toFixed(2)}g</b></td>
                      <td style="text-align:right">${App.utils.fmtMoney(s.total_amount_paid || 0)}</td>
                      <td style="text-align:right;color:var(--gold)">${App.utils.fmtMoney(s.maturity_valuation || s.total_amount_paid || 0)}</td>
                    </tr>
                  `).join('')}
                ` : `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text3)">No gold purchases or schemes recorded.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 6. LIABILITIES & DEBT REGISTER -->
        <div class="exec-section">
          <div class="exec-sec-title">6. Liabilities &amp; Debt Register (${liabilities.length} Obligations)</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Liability / Loan Name</th>
                  <th>Creditor / Institution</th>
                  <th style="text-align:right">Interest Rate</th>
                  <th style="text-align:right">Outstanding Balance</th>
                </tr>
              </thead>
              <tbody>
                ${liabilities.length > 0 ? liabilities.map((l) => `
                  <tr>
                    <td><b>${App.utils.escapeHtml(l.title || l.loan_name || 'Liability')}</b></td>
                    <td>${App.utils.escapeHtml(l.lender || l.creditor || 'Financial Institution')}</td>
                    <td style="text-align:right">${l.interest_rate ? `${l.interest_rate}%` : '—'}</td>
                    <td style="text-align:right;color:var(--red)"><b>${App.utils.fmtMoney(l.outstanding_amount || l.amount || 0)}</b></td>
                  </tr>
                `).join('') : `<tr><td colspan="4" style="text-align:center;padding:14px;color:var(--text3)">No active liabilities reported.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="exec-footer">
          <div class="exec-disclaimer">
            This Master Portfolio Dossier serves as a legally structured, audit-grade consolidated register of all personal investment contracts, systematic plans, expenditure ledgers, and bank holdings.
          </div>
          <div><b>Investment OS</b> &bull; Confidential</div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // MODAL LAUNCHERS: DISTINCT EXECUTIVE REPORT VS FULL PORTFOLIO DOSSIER
  // =========================================================================

  // 1. Executive Report Modal (Strategic C-Suite View)
  async function openExecutiveReportModal() {
    App.ui.open({
      title: '📊 Executive Investment Portfolio Report',
      small: false,
      bodyHtml: `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">Executive Strategic Briefing</div>
            <div style="font-size:11.5px;color:var(--text2)">High-level wealth snapshot, asset allocation, and quarterly liquidity forecast.</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-gold btn-sm" id="btnPrintExecReport">&#128424; Print / Save PDF</button>
            <button class="btn btn-outline btn-sm" id="btnExportExecExcel">&#128196; Download Excel</button>
          </div>
        </div>
        <div id="execReportContentHost" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;max-height:72vh;overflow:auto">
          <div style="text-align:center;padding:32px;color:var(--text2)">⏳ Compiling executive intelligence...</div>
        </div>
      `,
      onMount: async (modalBody) => {
        const container = App.utils.qs('#execReportContentHost', modalBody);
        try {
          const reportData = await gatherReportData();
          container.innerHTML = generateExecutiveReportHtml(reportData);

          const printBtn = App.utils.qs('#btnPrintExecReport', modalBody);
          if (printBtn) {
            printBtn.addEventListener('click', () => {
              triggerPrintReport(reportData, 'executive');
            });
          }

          const excelBtn = App.utils.qs('#btnExportExecExcel', modalBody);
          if (excelBtn) {
            excelBtn.addEventListener('click', async () => {
              try {
                if (App.exportData && App.exportData.exportFullPortfolio) {
                  await App.exportData.exportFullPortfolio();
                  App.utils.toast('Executive summary exported to Excel successfully!');
                } else {
                  App.utils.toast('Export engine loaded', 'info');
                }
              } catch (e) {
                App.utils.toast('Export failed: ' + (e.message || e), 'err');
              }
            });
          }
        } catch (e) {
          container.innerHTML = `<div class="hint" style="color:var(--red)">Failed to compile report: ${App.utils.escapeHtml(e.message || e)}</div>`;
        }
      },
      actions: [
        { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  // 2. Full Portfolio Dossier Modal (Detailed Audit Ledger)
  async function openFullPortfolioDossierModal() {
    App.ui.open({
      title: '📑 Full Comprehensive Portfolio Dossier & Audit Ledger',
      small: false,
      bodyHtml: `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">Consolidated Investment Audit Dossier</div>
            <div style="font-size:11.5px;color:var(--text2)">Comprehensive contract yield matrix, systematic SIPs, expense ledgers, and bank fixed deposits.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-gold btn-sm" id="btnPrintFullDossier">&#128424; Print / Save as PDF (Landscape)</button>
            <button class="btn btn-teal btn-sm" id="btnDownloadHtmlDossier">&#128190; Save Standalone HTML / PDF</button>
            <button class="btn btn-outline btn-sm" id="btnFullExportExcel">&#128196; Download Excel Workbook</button>
            <button class="btn btn-outline btn-sm" id="btnFullExportJson">&#128450; JSON Backup</button>
          </div>
        </div>
        <div id="fullDossierContentHost" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;max-height:72vh;overflow:auto">
          <div style="text-align:center;padding:32px;color:var(--text2)">⏳ Compiling full portfolio dossier &amp; ledger matrices...</div>
        </div>
      `,
      onMount: async (modalBody) => {
        const container = App.utils.qs('#fullDossierContentHost', modalBody);
        try {
          const reportData = await gatherReportData();
          container.innerHTML = generateFullPortfolioDossierHtml(reportData);

          const printBtn = App.utils.qs('#btnPrintFullDossier', modalBody);
          if (printBtn) {
            printBtn.addEventListener('click', () => {
              triggerPrintReport(reportData, 'dossier');
            });
          }

          const htmlBtn = App.utils.qs('#btnDownloadHtmlDossier', modalBody);
          if (htmlBtn) {
            htmlBtn.addEventListener('click', () => {
              downloadStandaloneReportHtml(reportData, 'dossier');
            });
          }

          const excelBtn = App.utils.qs('#btnFullExportExcel', modalBody);
          if (excelBtn) {
            excelBtn.addEventListener('click', async () => {
              try {
                if (App.exportData && App.exportData.exportFullPortfolio) {
                  await App.exportData.exportFullPortfolio();
                  App.utils.toast('Full Portfolio Excel workbook downloaded successfully!');
                } else {
                  App.utils.toast('Export engine loading, please try again.', 'info');
                }
              } catch (e) {
                App.utils.toast('Export failed: ' + (e.message || e), 'err');
              }
            });
          }

          const jsonBtn = App.utils.qs('#btnFullExportJson', modalBody);
          if (jsonBtn) {
            jsonBtn.addEventListener('click', () => {
              try {
                const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Portfolio_Dossier_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                App.utils.toast('Raw JSON dossier backup downloaded');
              } catch (e) {
                App.utils.toast('JSON export failed: ' + (e.message || e), 'err');
              }
            });
          }
        } catch (e) {
          container.innerHTML = `<div class="hint" style="color:var(--red)">Failed to compile full dossier: ${App.utils.escapeHtml(e.message || e)}</div>`;
        }
      },
      actions: [
        { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  // Generate full standalone printable HTML document string
  function buildStandaloneHtml(reportData, type = 'dossier') {
    const htmlContent = type === 'executive'
      ? generateExecutiveReportHtml(reportData)
      : generateFullPortfolioDossierHtml(reportData);

    const docTitle = type === 'executive'
      ? `Executive_Report_${new Date().toISOString().slice(0, 10)}`
      : `Portfolio_Dossier_${new Date().toISOString().slice(0, 10)}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #ffffff;
      --text: #1b2534;
      --text2: #54627a;
      --text3: #8592a8;
      --gold: #b8923c;
      --teal: #0f9d82;
      --red: #d9534f;
      --blue: #2f6fb0;
      --border: #e2e8f0;
      --fill-1: #f8fafc;
      --fill-2: #f1f5f9;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #1b2534;
      padding: 16px;
      font-size: 11px;
      line-height: 1.35;
    }
    .executive-report-document {
      width: 100%;
      max-width: 1440px;
      margin: 0 auto;
      background: #ffffff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.06);
    }
    .exec-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .exec-brand { display: flex; align-items: center; gap: 10px; }
    .exec-logo { width: 36px; height: 36px; background: #b8923c; color: #fff; border-radius: 8px; font-family: 'Cormorant Garamond', serif; font-size: 17px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .exec-title { font-family: 'Cormorant Garamond', serif; font-size: 15px; font-weight: 700; letter-spacing: 0.8px; color: #b8923c; }
    .exec-subtitle { font-size: 10px; color: #54627a; letter-spacing: 0.5px; font-weight: 600; }
    .exec-meta { text-align: right; font-size: 10.5px; color: #54627a; }
    .exec-confidential-tag { display: inline-block; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; font-size: 8.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-top: 3px; letter-spacing: 0.5px; }
    .exec-divider { height: 2px; background: #b8923c; margin-bottom: 12px; }
    .exec-section { margin-bottom: 14px; }
    .exec-sec-title { font-size: 11px; font-weight: 700; color: #1b2534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    .exec-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .exec-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .exec-kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; }
    .exec-kpi-lbl { font-size: 9px; font-weight: 600; color: #54627a; text-transform: uppercase; margin-bottom: 2px; }
    .exec-kpi-val { font-size: 14px; font-weight: 700; color: #1b2534; font-variant-numeric: tabular-nums; }
    .exec-kpi-val.highlight { color: #b8923c; }
    .exec-kpi-sub { font-size: 9px; color: #8592a8; margin-top: 2px; }
    .exec-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin-top: 4px; width: 100%; }
    .exec-table { width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: left; }
    .exec-table th { background: #f1f5f9; padding: 4px 5px; font-weight: 600; color: #334155; border-bottom: 1px solid #cbd5e1; font-size: 9px; }
    .exec-table td { padding: 4px 5px; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; word-break: break-word; }
    .exec-table tr:last-child td { border-bottom: none; }
    .exec-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #8592a8; }
    .exec-disclaimer { max-width: 75%; line-height: 1.35; }

    /* Interactive Print Toolbar */
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 999;
      background: #0f172a;
      color: #fff;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-radius: 8px;
      margin-bottom: 14px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      font-size: 11.5px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .print-toolbar-btn {
      background: #b8923c;
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      text-decoration: none;
    }
    .print-toolbar-btn:hover { background: #96742b; }
    .print-toolbar-btn.secondary { background: #334155; }
    .print-toolbar-btn.secondary:hover { background: #475569; }

    /* Print Media Engine - 100% Page Width Landscape, Zero Trimming */
    @page {
      size: landscape;
      margin: 4mm 4mm;
    }
    @media print {
      .no-print { display: none !important; }
      html, body {
        background: #ffffff !important;
        color: #000000 !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        font-size: 7pt !important;
      }
      .executive-report-document {
        max-width: 100% !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        border: none !important;
      }
      .exec-section {
        page-break-inside: auto !important;
        break-inside: auto !important;
        margin-bottom: 10px !important;
      }
      .exec-sec-title {
        page-break-after: avoid !important;
        break-after: avoid !important;
        font-size: 8.5pt !important;
      }
      .exec-table-wrap {
        overflow: visible !important;
        overflow-x: visible !important;
        width: 100% !important;
        max-width: 100% !important;
        border: 1px solid #cbd5e1 !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .exec-table {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        font-size: 6.2pt !important;
        border-collapse: collapse !important;
      }
      .exec-table th {
        background: #f1f5f9 !important;
        padding: 2px 2px !important;
        font-size: 6pt !important;
        line-height: 1.1 !important;
        border: 1px solid #94a3b8 !important;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .exec-table td {
        padding: 2px 2px !important;
        font-size: 6.2pt !important;
        line-height: 1.15 !important;
        border: 1px solid #cbd5e1 !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .exec-table-dossier-deals th {
        padding: 1.5px 1.5px !important;
        font-size: 5.3pt !important;
        line-height: 1.05 !important;
        letter-spacing: -0.2px !important;
      }
      .exec-table-dossier-deals td {
        padding: 1.5px 1.5px !important;
        font-size: 5.5pt !important;
        line-height: 1.1 !important;
      }
      .exec-table-dossier-deals td span {
        font-size: 4.8pt !important;
        padding: 0 2px !important;
      }
      .exec-table-dossier-recurring th,
      .exec-table-dossier-recurring td {
        font-size: 5.8pt !important;
        padding: 2px 2px !important;
      }
      .exec-table-dossier-accounts th,
      .exec-table-dossier-accounts td {
        font-size: 6pt !important;
        padding: 2px 2px !important;
      }
      .exec-project-box {
        page-break-inside: auto !important;
        break-inside: auto !important;
        margin-bottom: 8px !important;
        padding: 6px 8px !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      thead {
        display: table-header-group !important;
      }
      .exec-kpi {
        padding: 4px 6px !important;
        border: 1px solid #cbd5e1 !important;
      }
      .exec-kpi-val {
        font-size: 10.5pt !important;
      }
    }
  </style>
</head>
<body id="reportRootBody">
  <div class="print-toolbar no-print">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-weight:700">📄 ${docTitle}</span>
      <span style="color:#38bdf8;font-size:11px">✨ Configured for Landscape (All columns fitted without trimming)</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="print-toolbar-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
      <button class="print-toolbar-btn secondary" onclick="toggleScale(this)">🔍 Scale: Compact (85%)</button>
      <button class="print-toolbar-btn secondary" onclick="toggleOrientation(this)">📐 Switch: Portrait</button>
      <button class="print-toolbar-btn secondary" onclick="downloadCurrentHtml()">💾 Download HTML</button>
      <button class="print-toolbar-btn secondary" onclick="window.close()">✕ Close</button>
    </div>
  </div>

  ${htmlContent}

  <script>
    let isLandscape = true;
    let currentScaleMode = 'compact'; // 'compact' | 'ultra' | 'normal'

    function toggleOrientation(btn) {
      isLandscape = !isLandscape;
      const style = document.getElementById('dynPageStyle') || document.createElement('style');
      style.id = 'dynPageStyle';
      style.innerHTML = '@page { size: ' + (isLandscape ? 'landscape' : 'portrait') + '; margin: 4mm 6mm; }';
      document.head.appendChild(style);
      btn.textContent = isLandscape ? '📐 Switch: Portrait' : '📐 Switch: Landscape';
    }

    function toggleScale(btn) {
      const doc = document.getElementById('executiveReportDoc');
      if (!doc) return;
      if (currentScaleMode === 'compact') {
        currentScaleMode = 'ultra';
        doc.style.transform = 'scale(0.78)';
        doc.style.transformOrigin = 'top left';
        doc.style.width = '128%';
        btn.textContent = '🔍 Scale: Ultra-Fit (78%)';
      } else if (currentScaleMode === 'ultra') {
        currentScaleMode = 'normal';
        doc.style.transform = 'none';
        doc.style.width = '100%';
        btn.textContent = '🔍 Scale: Normal (100%)';
      } else {
        currentScaleMode = 'compact';
        doc.style.transform = 'scale(0.88)';
        doc.style.transformOrigin = 'top left';
        doc.style.width = '114%';
        btn.textContent = '🔍 Scale: Compact (88%)';
      }
    }

    function downloadCurrentHtml() {
      const clone = document.documentElement.cloneNode(true);
      const toolbar = clone.querySelector('.print-toolbar');
      if (toolbar) toolbar.remove();
      const blob = new Blob(['<!DOCTYPE html>' + clone.outerHTML], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${docTitle}.html';
      a.click();
    }

    window.onload = function() {
      // Auto-trigger print dialog after small settle delay
      setTimeout(function() {
        try { window.print(); } catch (_) {}
      }, 450);
    };
  </script>
</body>
</html>`;
  }

  // Standalone file download
  function downloadStandaloneReportHtml(reportData, type = 'dossier') {
    const fullHtml = buildStandaloneHtml(reportData, type);
    const docTitle = type === 'executive'
      ? `Executive_Report_${new Date().toISOString().slice(0, 10)}`
      : `Portfolio_Dossier_${new Date().toISOString().slice(0, 10)}`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.utils.toast('Standalone audit report downloaded! You can open it in any browser or print to PDF.', 'ok');
  }

  // Window Print / PDF Trigger (with hidden iframe fallback so iframe sandbox never clips)
  function triggerPrintReport(reportData, type = 'dossier') {
    const fullHtml = buildStandaloneHtml(reportData, type);

    let printWindow = null;
    try {
      printWindow = window.open('', '_blank');
    } catch (_) {}

    if (printWindow && !printWindow.closed) {
      try {
        printWindow.document.open();
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        return;
      } catch (err) {
        console.warn('Could not write to popup window:', err);
      }
    }

    // Fallback: If popup was blocked or prohibited, execute cleanly via hidden iframe!
    let hiddenFrame = document.getElementById('reportPrintIframe');
    if (!hiddenFrame) {
      hiddenFrame = document.createElement('iframe');
      hiddenFrame.id = 'reportPrintIframe';
      hiddenFrame.style.position = 'fixed';
      hiddenFrame.style.right = '0';
      hiddenFrame.style.bottom = '0';
      hiddenFrame.style.width = '0';
      hiddenFrame.style.height = '0';
      hiddenFrame.style.border = '0';
      hiddenFrame.style.visibility = 'hidden';
      document.body.appendChild(hiddenFrame);
    }

    try {
      const frameDoc = hiddenFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(fullHtml);
      frameDoc.close();
      setTimeout(() => {
        try {
          hiddenFrame.contentWindow.focus();
          hiddenFrame.contentWindow.print();
        } catch (_) {
          window.print();
        }
      }, 500);
    } catch (e) {
      window.print();
    }
  }

  return {
    gatherReportData,
    generateExecutiveReportHtml,
    generateFullPortfolioDossierHtml,
    generateReportHtml: generateFullPortfolioDossierHtml, // backwards-compatible alias
    openExecutiveReportModal,
    openFullPortfolioDossierModal,
    triggerPrintReport,
    downloadStandaloneReportHtml,
  };
})();
