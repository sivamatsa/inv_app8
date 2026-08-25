/* Consolidated Executive PDF & Print Report Generator
   Generates a publication-grade, printable executive investment report
   with portfolio KPIs, asset allocation, cash flow forecast, risk distribution,
   and deal breakdown. Supports browser window.print() and standalone HTML/PDF export. */
window.App = window.App || {};

App.executiveReport = (function () {
  async function gatherReportData() {
    const [netWorth, cashFlow, deals, metrics, recurring, gold, expenseProjects, profile] = await Promise.all([
      App.netWorthCalc.computeNetWorth(),
      App.cashFlowCalc.computeCashFlow(),
      App.api.listDeals(),
      App.api.listDealMetrics(),
      App.api.getRecurringSummary(),
      App.api.listGoldSchemeHoldings(),
      App.api.listExpenseProjects(),
      App.state.profile || {},
    ]);

    const activeDeals = deals.filter((d) => d.status === 'ACTIVE');
    const totalInvested = deals.reduce((s, d) => s + (d.invested_amount || 0), 0);
    const activeInvested = activeDeals.reduce((s, d) => s + (d.invested_amount || 0), 0);
    const weightedRoi = activeInvested > 0
      ? activeDeals.reduce((s, d) => s + (d.invested_amount || 0) * (d.annual_roi || 0), 0) / activeInvested
      : 0;

    const metricsById = {};
    metrics.forEach((m) => { metricsById[m.deal_id] = m; });

    return {
      generatedAt: new Date(),
      userName: profile.full_name || profile.email || 'Portfolio Owner',
      userEmail: profile.email || '',
      netWorth,
      cashFlow,
      deals,
      activeDeals,
      metricsById,
      recurring,
      gold,
      expenseProjects,
      stats: {
        totalInvested,
        activeInvested,
        weightedRoi,
        dealCount: deals.length,
        activeDealCount: activeDeals.length,
      },
    };
  }

  function generateReportHtml(data) {
    const { netWorth, cashFlow, activeDeals, metricsById, stats, userName, userEmail, generatedAt } = data;
    const dateStr = App.utils.fmtDateTime(generatedAt);

    return `
      <div class="executive-report-document" id="executiveReportDoc">
        <div class="exec-header">
          <div class="exec-brand">
            <div class="exec-logo">IOS</div>
            <div>
              <div class="exec-title">INVESTMENT OPERATING SYSTEM</div>
              <div class="exec-subtitle">CONSOLIDATED EXECUTIVE PORTFOLIO REPORT</div>
            </div>
          </div>
          <div class="exec-meta">
            <div><b>Prepared for:</b> ${App.utils.escapeHtml(userName)}</div>
            ${userEmail ? `<div style="font-size:11px;color:var(--text3);">${App.utils.escapeHtml(userEmail)}</div>` : ''}
            <div style="margin-top:4px"><b>Date:</b> ${dateStr}</div>
            <div class="exec-confidential-tag">CONFIDENTIAL &amp; PROPRIETARY</div>
          </div>
        </div>

        <div class="exec-divider"></div>

        <!-- SECTION 1: EXECUTIVE WEALTH & LIQUIDITY SNAPSHOT -->
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
                  <td>Checking, Savings &amp; Emergency Reserves</td>
                </tr>
                <tr>
                  <td><b>Physical &amp; Scheme Gold</b></td>
                  <td style="text-align:right"><b>${App.utils.fmtMoney(netWorth.goldTotal)}</b></td>
                  <td style="text-align:right">${App.utils.fmtPct(netWorth.totalAssets > 0 ? (netWorth.goldTotal / netWorth.totalAssets) * 100 : 0)}</td>
                  <td>${netWorth.goldGrams ? netWorth.goldGrams.toFixed(2) + ' grams total' : 'Holdings recorded'}</td>
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

        <!-- SECTION 3: CASH FLOW & LIQUIDITY PIPELINE -->
        <div class="exec-section">
          <div class="exec-sec-title">3. Cash Flow Forecast &amp; Income Pipeline</div>
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
              <div class="exec-kpi-lbl">This Month Net Cash Movement</div>
              <div class="exec-kpi-val" style="color:${cashFlow.netCashMovement >= 0 ? 'var(--teal)' : 'var(--red)'}">${App.utils.fmtMoney(cashFlow.netCashMovement)}</div>
              <div class="exec-kpi-sub">Received: ${App.utils.fmtMoney(cashFlow.thisMonthReceived)}</div>
            </div>
          </div>
        </div>

        <!-- SECTION 4: ACTIVE DEALS PORTFOLIO MATRIX -->
        <div class="exec-section">
          <div class="exec-sec-title">4. Active Investment Contracts &amp; Yield Matrix</div>
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
                      <td>${App.utils.escapeHtml(d.investment_type)}</td>
                      <td style="text-align:right">${App.utils.fmtMoney(d.invested_amount)}</td>
                      <td style="text-align:right;color:var(--gold)">${App.utils.fmtPct(d.annual_roi)}</td>
                      <td>${d.payment_frequency}</td>
                      <td>${App.utils.fmtDate(d.maturity_date)}</td>
                      <td style="text-align:right">${m.payout_reliability != null ? App.utils.fmtPct(m.payout_reliability, 0) : '100%'}</td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text3)">No active deals recorded.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 5: GOVERNANCE & AUDIT TRAIL -->
        <div class="exec-footer">
          <div class="exec-disclaimer">
            <b>Disclaimer:</b> This executive report is generated for informational and wealth management governance purposes only. Data reflects confirmed ledger records stored in the Personal Investment Operating System as of ${dateStr}. Past performance is not a guarantee of future returns.
          </div>
          <div class="exec-page-num">Generated via Investment OS &bull; Confidential</div>
        </div>
      </div>
    `;
  }

  function openExecutiveReportModal() {
    App.ui.open({
      title: 'Consolidated Executive Report',
      small: false,
      bodyHtml: `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div style="font-size:12.5px;color:var(--text2)">
            Institutional-grade executive portfolio summary formatted for presentation, printing, or archival.
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" id="btnExecPrint">&#128438; Print / Save PDF</button>
            <button class="btn btn-gold btn-sm" id="btnExecDownloadExcel">&#8595; Export Full Excel</button>
          </div>
        </div>
        <div id="execReportContainer" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;max-height:68vh;overflow-y:auto">
          <div style="text-align:center;padding:40px;color:var(--text3)">Assembling consolidated portfolio data...</div>
        </div>
      `,
      onMount: async (modalBody) => {
        const container = App.utils.qs('#execReportContainer', modalBody);
        try {
          const reportData = await gatherReportData();
          container.innerHTML = generateReportHtml(reportData);

          const printBtn = App.utils.qs('#btnExecPrint', modalBody);
          if (printBtn) {
            printBtn.addEventListener('click', () => {
              triggerPrintReport(reportData);
            });
          }

          const exportBtn = App.utils.qs('#btnExecDownloadExcel', modalBody);
          if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
              try {
                await App.exportData.exportFullPortfolio();
                App.utils.toast('Full portfolio Excel downloaded');
              } catch (e) {
                App.utils.toast('Export failed: ' + (e.message || e), 'err');
              }
            });
          }
        } catch (e) {
          container.innerHTML = `<div class="hint" style="color:var(--red)">Failed to generate executive report: ${App.utils.escapeHtml(e.message || e)}</div>`;
        }
      },
      actions: [
        { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  function triggerPrintReport(reportData) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      // If popup blocked, print current page
      window.print();
      return;
    }

    const htmlContent = generateReportHtml(reportData);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Investment_OS_Executive_Report_${new Date().toISOString().slice(0, 10)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
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
          body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1b2534; padding: 30px; font-size: 13px; line-height: 1.5; }
          .executive-report-document { max-width: 900px; margin: 0 auto; }
          .exec-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
          .exec-brand { display: flex; align-items: center; gap: 12px; }
          .exec-logo { width: 42px; height: 42px; background: #b8923c; color: #fff; border-radius: 8px; font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
          .exec-title { font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 700; letter-spacing: 1px; color: #b8923c; }
          .exec-subtitle { font-size: 11px; color: #54627a; letter-spacing: 0.5px; font-weight: 600; }
          .exec-meta { text-align: right; font-size: 12px; color: #54627a; }
          .exec-confidential-tag { display: inline-block; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-top: 6px; letter-spacing: 0.5px; }
          .exec-divider { height: 2px; background: #b8923c; margin-bottom: 20px; }
          .exec-section { margin-bottom: 24px; page-break-inside: avoid; }
          .exec-sec-title { font-size: 14px; font-weight: 700; color: #1b2534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          .exec-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .exec-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .exec-kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .exec-kpi-lbl { font-size: 10.5px; font-weight: 600; color: #54627a; text-transform: uppercase; margin-bottom: 4px; }
          .exec-kpi-val { font-size: 17px; font-weight: 700; color: #1b2534; }
          .exec-kpi-val.highlight { color: #b8923c; }
          .exec-kpi-sub { font-size: 10.5px; color: #8592a8; margin-top: 4px; }
          .exec-table-wrap { overflow: hidden; border: 1px solid #e2e8f0; border-radius: 8px; }
          .exec-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
          .exec-table th { background: #f1f5f9; padding: 8px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
          .exec-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
          .exec-table tr:last-child td { border-bottom: none; }
          .exec-footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #8592a8; }
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
    triggerPrintReport,
  };
})();
