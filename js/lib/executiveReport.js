/* Consolidated Executive PDF & Print Report Generator
   Generates a publication-grade, printable executive investment report
   with portfolio KPIs, asset allocation, cash flow forecast, risk distribution,
   deals, recurring investments, gold & bullion, expense projects & ledger,
   accounts, and liabilities. Supports browser window.print() and Excel/JSON export. */
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
      App.state.profile || {},
    ]);

    const activeDeals = deals.filter((d) => (d.status || '').toUpperCase() === 'ACTIVE');
    const totalInvested = deals.reduce((s, d) => s + (Number(d.invested_amount) || Number(d.principal_amount) || 0), 0);
    const activeInvested = activeDeals.reduce((s, d) => s + (Number(d.invested_amount) || Number(d.principal_amount) || 0), 0);
    const weightedRoi = activeInvested > 0
      ? activeDeals.reduce((s, d) => s + (Number(d.invested_amount) || Number(d.principal_amount) || 0) * (Number(d.annual_roi) || 0), 0) / activeInvested
      : 0;

    const metricsById = {};
    (metrics || []).forEach((m) => { if (m.deal_id) metricsById[m.deal_id] = m; });

    const totalGoldGrams = (goldPurchases || []).reduce((s, g) => s + (Number(g.weight_grams) || 0), 0) +
      (goldSchemeHoldings || []).reduce((s, g) => s + (Number(g.accumulated_grams) || 0), 0);
    const totalGoldInvested = (goldPurchases || []).reduce((s, g) => s + (Number(g.total_amount) || 0), 0) +
      (goldSchemeHoldings || []).reduce((s, g) => s + (Number(g.total_amount_paid) || 0), 0);

    const totalProjectsBudget = (expenseProjects || []).reduce((s, p) => s + (Number(p.budget_amount) || 0), 0);
    const totalExpensesSpent = (expenseTransactions || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const totalRecurringMonthly = (recurringItems || []).reduce((s, r) => {
      const amt = Number(r.amount) || 0;
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
      activeDeals,
      metricsById,
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

  function generateReportHtml(data) {
    const {
      netWorth,
      cashFlow,
      activeDeals,
      metricsById,
      recurringItems,
      goldPurchases,
      goldSchemeHoldings,
      expenseProjects,
      expenseTransactions,
      accounts,
      liabilities,
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
              <div class="exec-subtitle">COMPREHENSIVE MASTER PORTFOLIO DOSSIER</div>
            </div>
          </div>
          <div class="exec-meta">
            <div><b>Prepared for:</b> ${App.utils.escapeHtml(userName)}</div>
            ${userEmail ? `<div style="font-size:11px;color:var(--text3);">${App.utils.escapeHtml(userEmail)}</div>` : ''}
            <div style="margin-top:4px"><b>Date:</b> ${dateStr}</div>
            <div class="exec-confidential-tag">CONFIDENTIAL &bull; COMPLETE AUDIT</div>
          </div>
        </div>

        <div class="exec-divider"></div>

        <!-- SECTION 1: EXECUTIVE WEALTH & LIQUIDITY OVERVIEW -->
        <div class="exec-section">
          <div class="exec-sec-title">1. Executive Wealth &amp; Liquidity Overview</div>
          <div class="exec-grid-4">
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Total Net Worth</div>
              <div class="exec-kpi-val highlight">${App.utils.fmtMoney(netWorth.netWorth)}</div>
              <div class="exec-kpi-sub">Assets: ${App.utils.fmtMoney(netWorth.totalAssets)}</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Active Capital Invested</div>
              <div class="exec-kpi-val">${App.utils.fmtMoney(stats.activeInvested)}</div>
              <div class="exec-kpi-sub">Across ${stats.activeDealCount} active deals</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Weighted Annual ROI</div>
              <div class="exec-kpi-val" style="color:var(--teal)">${App.utils.fmtPct(stats.weightedRoi)}</div>
              <div class="exec-kpi-sub">Portfolio yield average</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Total Liabilities</div>
              <div class="exec-kpi-val" style="color:${netWorth.liabilitiesTotal > 0 ? 'var(--red)' : 'var(--text)'}">${App.utils.fmtMoney(netWorth.liabilitiesTotal)}</div>
              <div class="exec-kpi-sub">${netWorth.liabilitiesTotal > 0 ? 'Active obligations' : 'Zero debt reported'}</div>
            </div>
          </div>
        </div>

        <!-- SECTION 2: ASSET ALLOCATION BREAKDOWN -->
        <div class="exec-section">
          <div class="exec-sec-title">2. Asset Class Allocation &amp; Holdings</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Asset Class</th>
                  <th style="text-align:right">Current Valuation</th>
                  <th style="text-align:right">% of Portfolio</th>
                  <th>Key Holdings / Composition</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Deals &amp; Fixed Income</b></td>
                  <td style="text-align:right"><b>${App.utils.fmtMoney(netWorth.dealsTotal)}</b></td>
                  <td style="text-align:right">${App.utils.fmtPct(netWorth.totalAssets > 0 ? (netWorth.dealsTotal / netWorth.totalAssets) * 100 : 0)}</td>
                  <td>${stats.activeDealCount} Active Principal Contracts</td>
                </tr>
                <tr>
                  <td><b>Liquid Bank Accounts &amp; Cash</b></td>
                  <td style="text-align:right"><b>${App.utils.fmtMoney(netWorth.accountsTotal)}</b></td>
                  <td style="text-align:right">${App.utils.fmtPct(netWorth.totalAssets > 0 ? (netWorth.accountsTotal / netWorth.totalAssets) * 100 : 0)}</td>
                  <td>${stats.accountsCount} Checking, Savings &amp; Emergency Accounts</td>
                </tr>
                <tr>
                  <td><b>Physical &amp; Scheme Gold</b></td>
                  <td style="text-align:right"><b>${App.utils.fmtMoney(netWorth.goldTotal)}</b></td>
                  <td style="text-align:right">${App.utils.fmtPct(netWorth.totalAssets > 0 ? (netWorth.goldTotal / netWorth.totalAssets) * 100 : 0)}</td>
                  <td>${stats.totalGoldGrams ? stats.totalGoldGrams.toFixed(2) + ' grams total' : 'Holdings recorded'}</td>
                </tr>
                <tr style="background:var(--fill-2);font-weight:700">
                  <td>Total Gross Assets</td>
                  <td style="text-align:right">${App.utils.fmtMoney(netWorth.totalAssets)}</td>
                  <td style="text-align:right">100.0%</td>
                  <td>Consolidated Asset Base</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 3: ACTIVE & HISTORICAL DEALS MATRIX -->
        <div class="exec-section">
          <div class="exec-sec-title">3. Investment Contracts &amp; Yield Matrix (${activeDeals.length} Active Deals)</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Deal Name</th>
                  <th>Type</th>
                  <th style="text-align:right">Invested</th>
                  <th style="text-align:right">ROI</th>
                  <th>Frequency</th>
                  <th>Maturity</th>
                  <th style="text-align:right">Reliability</th>
                </tr>
              </thead>
              <tbody>
                ${activeDeals.length > 0 ? activeDeals.map((d) => {
                  const m = metricsById[d.id] || {};
                  return `
                    <tr>
                      <td><b>${App.utils.escapeHtml(d.deal_name)}</b> ${d.external_deal_id ? `<span style="font-size:10px;color:var(--text3)">(${App.utils.escapeHtml(d.external_deal_id)})</span>` : ''}</td>
                      <td>${App.utils.escapeHtml(d.investment_type || 'Debt')}</td>
                      <td style="text-align:right">${App.utils.fmtMoney(d.invested_amount || d.principal_amount || 0)}</td>
                      <td style="text-align:right;color:var(--gold)">${App.utils.fmtPct(d.annual_roi || 0)}</td>
                      <td>${d.payment_frequency || 'Monthly'}</td>
                      <td>${App.utils.fmtDate ? App.utils.fmtDate(d.maturity_date) : (d.maturity_date || 'N/A')}</td>
                      <td style="text-align:right">${m.payout_reliability != null ? App.utils.fmtPct(m.payout_reliability, 0) : '100%'}</td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text3)">No active deals recorded.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 4: RECURRING INVESTMENTS & SYSTEMATIC PLANS (SIPs) -->
        <div class="exec-section">
          <div class="exec-sec-title">4. Systematic Recurring Investments &amp; SIPs (${recurringItems.length} Plans)</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Plan / Asset Name</th>
                  <th>Category</th>
                  <th>Frequency</th>
                  <th style="text-align:right">Installment Amount</th>
                  <th style="text-align:right">Monthly Equiv.</th>
                  <th>Next Due Date</th>
                  <th style="text-align:center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${recurringItems.length > 0 ? recurringItems.map((r) => {
                  const amt = Number(r.amount) || 0;
                  const freq = (r.frequency || 'Monthly').toLowerCase();
                  let monthly = amt;
                  if (freq === 'weekly') monthly = amt * 52 / 12;
                  if (freq === 'quarterly') monthly = amt / 3;
                  if (freq === 'yearly' || freq === 'annually') monthly = amt / 12;
                  return `
                    <tr>
                      <td><b>${App.utils.escapeHtml(r.title || r.name || 'Recurring Plan')}</b></td>
                      <td>${App.utils.escapeHtml(r.category || 'Investment')}</td>
                      <td>${App.utils.escapeHtml(r.frequency || 'Monthly')}</td>
                      <td style="text-align:right"><b>${App.utils.fmtMoney(amt)}</b></td>
                      <td style="text-align:right;color:var(--teal)">${App.utils.fmtMoney(monthly)}/mo</td>
                      <td>${r.next_due_date ? (App.utils.fmtDate ? App.utils.fmtDate(r.next_due_date) : r.next_due_date) : 'Active'}</td>
                      <td style="text-align:center"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(22,201,163,0.12);color:var(--teal)">${(r.status || 'ACTIVE').toUpperCase()}</span></td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text3)">No systematic recurring investments configured.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 5: PHYSICAL & SCHEME BULLION / GOLD VAULT -->
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

        <!-- SECTION 6: EXPENSE PROJECTS & DIRECT SPENDING LEDGER -->
        <div class="exec-section">
          <div class="exec-sec-title">6. Expense Projects &amp; Expenditure Ledger (${expenseProjects.length} Projects)</div>
          <div class="exec-table-wrap">
            <table class="exec-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Category</th>
                  <th style="text-align:right">Allocated Budget</th>
                  <th style="text-align:right">Actual Spent</th>
                  <th style="text-align:right">Variance</th>
                  <th style="text-align:center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${expenseProjects.length > 0 ? expenseProjects.map((p) => {
                  const budget = Number(p.budget_amount) || 0;
                  const spent = Number(p.total_spent) || Number(p.spent_amount) || 0;
                  const variance = budget - spent;
                  const isOver = variance < 0;
                  return `
                    <tr>
                      <td><b>${App.utils.escapeHtml(p.project_name || p.name || 'Expense Project')}</b></td>
                      <td>${App.utils.escapeHtml(p.category || 'General')}</td>
                      <td style="text-align:right">${App.utils.fmtMoney(budget)}</td>
                      <td style="text-align:right;color:${isOver ? 'var(--red)' : 'var(--text)'}"><b>${App.utils.fmtMoney(spent)}</b></td>
                      <td style="text-align:right;color:${isOver ? 'var(--red)' : 'var(--teal)'}">${isOver ? '-' : '+'}${App.utils.fmtMoney(Math.abs(variance))}</td>
                      <td style="text-align:center"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:${isOver ? 'rgba(217,83,79,0.12)' : 'rgba(22,201,163,0.12)'};color:${isOver ? 'var(--red)' : 'var(--teal)'}">${(p.status || 'ACTIVE').toUpperCase()}</span></td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text3)">No specific expense projects recorded.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 7: CASH FLOW & UPCOMING PAYOUT PIPELINE -->
        <div class="exec-section">
          <div class="exec-sec-title">7. Cash Flow Forecast &amp; Income Pipeline</div>
          <div class="exec-grid-3">
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Next 30 Days Expected Inflow</div>
              <div class="exec-kpi-val" style="color:var(--teal)">${App.utils.fmtMoney(cashFlow.next30Days)}</div>
              <div class="exec-kpi-sub">Next 7 Days: ${App.utils.fmtMoney(cashFlow.next7Days)}</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">Next 90 Days Expected Inflow</div>
              <div class="exec-kpi-val" style="color:var(--blue)">${App.utils.fmtMoney(cashFlow.next90Days)}</div>
              <div class="exec-kpi-sub">Quarterly liquidity forecast</div>
            </div>
            <div class="exec-kpi">
              <div class="exec-kpi-lbl">This Month Net Movement</div>
              <div class="exec-kpi-val" style="color:${cashFlow.netCashMovement >= 0 ? 'var(--teal)' : 'var(--red)'}">${App.utils.fmtMoney(cashFlow.netCashMovement)}</div>
              <div class="exec-kpi-sub">Received: ${App.utils.fmtMoney(cashFlow.thisMonthReceived)}</div>
            </div>
          </div>
        </div>

        <!-- SECTION 8: BANK ACCOUNTS, LIQUID RESERVES & LIABILITIES -->
        <div class="exec-section">
          <div class="exec-sec-title">8. Bank Accounts, Liquid Reserves &amp; Liabilities</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="exec-table-wrap">
              <div style="background:var(--fill-2);padding:6px 12px;font-weight:700;font-size:11px;text-transform:uppercase;color:var(--text2)">Bank Accounts &amp; Cash (${accounts.length})</div>
              <table class="exec-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Type</th>
                    <th style="text-align:right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  ${accounts.length > 0 ? accounts.map((a) => `
                    <tr>
                      <td><b>${App.utils.escapeHtml(a.account_name || a.bank_name || 'Bank Account')}</b></td>
                      <td>${App.utils.escapeHtml(a.account_type || 'Checking')}</td>
                      <td style="text-align:right"><b>${App.utils.fmtMoney(a.current_balance || a.balance || 0)}</b></td>
                    </tr>
                  `).join('') : `<tr><td colspan="3" style="text-align:center;padding:12px;color:var(--text3)">No accounts recorded.</td></tr>`}
                </tbody>
              </table>
            </div>
            <div class="exec-table-wrap">
              <div style="background:var(--fill-2);padding:6px 12px;font-weight:700;font-size:11px;text-transform:uppercase;color:var(--text2)">Liabilities &amp; Debt Obligations (${liabilities.length})</div>
              <table class="exec-table">
                <thead>
                  <tr>
                    <th>Liability</th>
                    <th>Creditor</th>
                    <th style="text-align:right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  ${liabilities.length > 0 ? liabilities.map((l) => `
                    <tr>
                      <td><b>${App.utils.escapeHtml(l.title || l.loan_name || 'Liability')}</b></td>
                      <td>${App.utils.escapeHtml(l.lender || l.creditor || 'Financial Institution')}</td>
                      <td style="text-align:right;color:var(--red)"><b>${App.utils.fmtMoney(l.outstanding_amount || l.amount || 0)}</b></td>
                    </tr>
                  `).join('') : `<tr><td colspan="3" style="text-align:center;padding:12px;color:var(--text3)">No active liabilities reported.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- SECTION 9: GOVERNANCE & AUDIT TRAIL -->
        <div class="exec-footer">
          <div class="exec-disclaimer">
            <b>Audit Note:</b> This comprehensive dossier compiles verified ledger records for deals, recurring systematic investments, gold vault bullion, expense projects, liquid cash accounts, and liabilities stored in the Personal Investment Operating System as of ${dateStr}. Past performance does not guarantee future financial returns.
          </div>
          <div class="exec-page-num">Investment OS &bull; Confidential Dossier</div>
        </div>
      </div>
    `;
  }

  // Opens the comprehensive full portfolio modal with instant PDF/Print and Excel download
  function openFullPortfolioDossierModal() {
    App.ui.open({
      title: '🗂️ Full Portfolio Dossier (Complete Investor Data)',
      small: false,
      bodyHtml: `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">Consolidated Investor Financial Footprint</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">
              Includes all Deals, Systematic Recurring SIPs, Gold Vault, Expense Projects &amp; Ledger, Accounts, and Liabilities.
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="btnFullPrintPDF">&#128438; Print / Save PDF</button>
            <button class="btn btn-gold btn-sm" id="btnFullExportExcel">&#8595; Export Full Workbook (.xlsx)</button>
            <button class="btn btn-outline btn-sm" id="btnFullExportJson">&#128190; Raw Backup (.json)</button>
          </div>
        </div>
        <div id="execFullDossierContainer" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;max-height:68vh;overflow-y:auto">
          <div style="text-align:center;padding:40px;color:var(--text3)">Assembling complete portfolio dossier across all database tables...</div>
        </div>
      `,
      onMount: async (modalBody) => {
        const container = App.utils.qs('#execFullDossierContainer', modalBody);
        try {
          const reportData = await gatherReportData();
          container.innerHTML = generateReportHtml(reportData);

          const printBtn = App.utils.qs('#btnFullPrintPDF', modalBody);
          if (printBtn) {
            printBtn.addEventListener('click', () => {
              triggerPrintReport(reportData);
            });
          }

          const exportBtn = App.utils.qs('#btnFullExportExcel', modalBody);
          if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
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

  function openExecutiveReportModal() {
    openFullPortfolioDossierModal();
  }

  function triggerPrintReport(reportData) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const htmlContent = generateReportHtml(reportData);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Portfolio_Dossier_${new Date().toISOString().slice(0, 10)}</title>
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
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: #fff; color: #1b2534; padding: 26px; font-size: 12.5px; line-height: 1.5; }
          .executive-report-document { max-width: 960px; margin: 0 auto; }
          .exec-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
          .exec-brand { display: flex; align-items: center; gap: 12px; }
          .exec-logo { width: 40px; height: 40px; background: #b8923c; color: #fff; border-radius: 8px; font-family: 'Cormorant Garamond', serif; font-size: 19px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
          .exec-title { font-family: 'Cormorant Garamond', serif; font-size: 17px; font-weight: 700; letter-spacing: 0.8px; color: #b8923c; }
          .exec-subtitle { font-size: 10.5px; color: #54627a; letter-spacing: 0.5px; font-weight: 600; }
          .exec-meta { text-align: right; font-size: 11.5px; color: #54627a; }
          .exec-confidential-tag { display: inline-block; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-top: 5px; letter-spacing: 0.5px; }
          .exec-divider { height: 2px; background: #b8923c; margin-bottom: 16px; }
          .exec-section { margin-bottom: 20px; page-break-inside: avoid; }
          .exec-sec-title { font-size: 13px; font-weight: 700; color: #1b2534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          .exec-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
          .exec-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .exec-kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
          .exec-kpi-lbl { font-size: 10px; font-weight: 600; color: #54627a; text-transform: uppercase; margin-bottom: 3px; }
          .exec-kpi-val { font-size: 16px; font-weight: 700; color: #1b2534; font-variant-numeric: tabular-nums; }
          .exec-kpi-val.highlight { color: #b8923c; }
          .exec-kpi-sub { font-size: 10px; color: #8592a8; margin-top: 3px; }
          .exec-table-wrap { overflow: hidden; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 4px; }
          .exec-table { width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left; }
          .exec-table th { background: #f1f5f9; padding: 7px 10px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
          .exec-table td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; }
          .exec-table tr:last-child td { border-bottom: none; }
          .exec-footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #8592a8; }
          .exec-disclaimer { max-width: 75%; line-height: 1.4; }
          @media print {
            body { padding: 0; }
            .executive-report-document { max-width: 100%; }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 350);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  return {
    gatherReportData,
    generateReportHtml,
    openExecutiveReportModal,
    openFullPortfolioDossierModal,
    triggerPrintReport,
  };
})();
