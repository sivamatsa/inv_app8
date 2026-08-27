/* Portfolio Dashboard & Executive Operating System.
   Answers the 5 core executive questions immediately:
   1. Where am I? (Net Worth, Asset Breakdown, Liquidity)
   2. How am I performing? (Realized ROI, Annualized ROI, Net Profit, Reliability)
   3. What happened? (Monthly Cash Flow, Inflow vs Outflow, FY Pace)
   4. What needs attention? (Master Action Center with 1-click direct triggers)
   5. Am I progressing? (Portfolio Goals & Milestones)
   Plus: Financial Health Score (84/100) with diagnostic breakdown & "Why?" transparency modals. */

window.App = window.App || {};

(function () {
  const fyBounds = App.utils.fyBounds;

  async function renderDashboardView() {
    const pane = App.utils.qs('#pane-dashboard');
    pane.innerHTML = `
      <!-- Executive Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div>
          <div class="section-title" style="margin-bottom:2px">Portfolio Dashboard <div class="line"></div></div>
          <div style="font-size:12px;color:var(--text2)">Executive Operating System &middot; Real-time portfolio intelligence</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" id="dashAiAuditBtn">&#9889; AI Risk Audit</button>
          <button class="btn btn-outline btn-sm" id="dashQuickIngestBtn">📸 Scan Statement / Receipt</button>
          <button class="btn btn-gold btn-sm" id="dashExecReportBtn">&#128196; Executive Report</button>
        </div>
      </div>

      <div id="dashFilterBar" style="margin-bottom:14px"></div>

      <!-- Question 1: 💰 Where am I? (Net Worth Position Hero) -->
      <div class="panel" id="dashPositionHero" style="margin-bottom:16px;background:linear-gradient(135deg,rgba(201,168,76,0.08),rgba(22,201,163,0.08));border:1px solid rgba(201,168,76,0.25)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px">💰</span>
              <span style="font-weight:700;font-size:14px;color:var(--gold);letter-spacing:0.3px;text-transform:uppercase">Where Am I? &mdash; Financial Position</span>
              <button class="btn btn-outline btn-sm" id="btnExplainNetWorth" style="padding:1px 7px;font-size:11px;border-radius:12px" title="See exact calculation formula and component breakdown">ⓘ Why?</button>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Authoritative Net Worth across all assets, gold holdings, and liabilities</div>
          </div>
          <div id="dashNetWorthBadge" style="text-align:right"></div>
        </div>
        <div id="dashPositionGrid" class="grid-4" style="gap:12px"></div>
      </div>

      <!-- Diagnostic: 🩺 Financial Health Score -->
      <div class="panel" id="dashHealthPanel" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:16px">🩺</span>
            <div class="chart-title" style="margin-bottom:0">Financial Health Score</div>
            <span id="dashHealthGradeBadge"></span>
          </div>
          <button class="btn btn-outline btn-sm" id="btnWhyHealthScore" style="color:var(--gold);font-size:11.5px">🔍 Why did my score change? &rarr;</button>
        </div>
        <div id="dashHealthBreakdown"></div>
      </div>

      <!-- Question 2: 📈 How am I performing? & Question 3: 💵 What happened? -->
      <div class="grid-2" style="margin-bottom:16px">
        <!-- Question 2: How am I performing? -->
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <span>📈</span>
              <div class="chart-title" style="margin-bottom:0">How Am I Performing?</div>
            </div>
            <button class="btn btn-outline btn-sm" id="btnExplainReturns" style="padding:1px 6px;font-size:10.5px">ⓘ How is ROI calculated?</button>
          </div>
          <div id="dashPerformanceBlock"></div>
        </div>

        <!-- Question 3: What happened? -->
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <span>💵</span>
              <div class="chart-title" style="margin-bottom:0">What Happened? (Cash Flow Pulse)</div>
            </div>
            <a href="#cashflow" id="dashOpenCashFlow" style="font-size:11.5px;color:var(--gold)">View Cash Flow &rarr;</a>
          </div>
          <div id="dashCashFlowBlock"></div>
        </div>
      </div>

      <!-- Question 4: 🔔 What needs attention? (Master Action Center) -->
      <div class="panel" style="margin-bottom:16px;border:1px solid rgba(255,107,107,0.25)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:16px">🔔</span>
            <div class="chart-title" style="margin-bottom:0;color:var(--text)">Action Center &mdash; What Needs Attention?</div>
            <span class="badge" id="dashAttentionCountBadge" style="background:rgba(255,107,107,0.18);color:var(--red);font-weight:700">0 Items</span>
          </div>
          <div style="font-size:11.5px;color:var(--text3)">Instant 1-click execution for pending payments, renewals &amp; maturities</div>
        </div>
        <div id="dashActionCenterContent"></div>
      </div>

      <!-- Question 5: 🎯 Am I progressing? (Portfolio Goals) & Recurring Commitments -->
      <div class="grid-2" style="margin-bottom:16px">
        <!-- Question 5: Goals -->
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <span>🎯</span>
              <div class="chart-title" style="margin-bottom:0">Am I Progressing? (Goals)</div>
            </div>
            <a href="#goals" id="dashOpenGoals" style="font-size:11.5px;color:var(--gold)">Manage Goals &rarr;</a>
          </div>
          <div id="dashGoalsBlock"></div>
        </div>

        <!-- Recurring Investments & Commitments -->
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <span>🔄</span>
              <div class="chart-title" style="margin-bottom:0">Recurring Investments &amp; Schemes</div>
            </div>
            <a href="#recurring" id="dashOpenRecurring" style="font-size:11.5px;color:var(--gold)">View All &rarr;</a>
          </div>
          <div id="dashRecurringBlock"></div>
        </div>
      </div>

      <!-- Gold Intelligence Widget -->
      <div class="panel" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:6px">
            <span>🪙</span>
            <div class="chart-title" style="margin-bottom:0">Gold Intelligence &amp; Physical Holdings</div>
          </div>
          <a href="#gold" id="dashOpenGold" style="font-size:11.5px;color:var(--gold)">Open Gold Intelligence &rarr;</a>
        </div>
        <div id="dashGoldBlock"></div>
      </div>
    `;

    // Navigation and Action Handlers
    App.utils.qs('#dashExecReportBtn', pane)?.addEventListener('click', () => {
      App.executiveReport.openExecutiveReportModal();
    });
    App.utils.qs('#dashAiAuditBtn', pane)?.addEventListener('click', () => {
      App.router.navigate('aicopilot');
    });
    App.utils.qs('#dashQuickIngestBtn', pane)?.addEventListener('click', () => {
      App.router.navigate('imports');
      setTimeout(() => {
        const ocrTab = document.querySelector('[data-import-mode="ocr"]');
        if (ocrTab) ocrTab.click();
      }, 100);
    });
    App.utils.qs('#dashOpenCashFlow', pane)?.addEventListener('click', (e) => { e.preventDefault(); App.router.navigate('cashflow'); });
    App.utils.qs('#dashOpenGoals', pane)?.addEventListener('click', (e) => { e.preventDefault(); App.router.navigate('goals'); });
    App.utils.qs('#dashOpenRecurring', pane)?.addEventListener('click', (e) => { e.preventDefault(); App.router.navigate('recurring'); });
    App.utils.qs('#dashOpenGold', pane)?.addEventListener('click', (e) => { e.preventDefault(); App.router.navigate('gold'); });

    App.filters.renderBar(App.utils.qs('#dashFilterBar'), draw);

    async function draw() {
      const [
        summary, deals, metrics, schedule, payments,
        recurringSummary, recurringOccAll, recurringItemsAll,
        gold22kHistory, goldHoldings, goldPurchases,
        accounts, liabilities, goals
      ] = await Promise.all([
        App.api.getPortfolioSummary(),
        App.api.listDeals(),
        App.api.listDealMetrics(),
        App.api.listSchedule(),
        App.api.listPayments(),
        App.api.getRecurringSummary(),
        App.api.listRecurringOccurrences(),
        App.api.listRecurringItems(),
        App.api.listGoldPriceObservations({ eq: { purity: '22K' }, order: { column: 'observed_at', ascending: true } }),
        App.api.listGoldSchemeHoldings(),
        App.api.listGoldPurchases(),
        App.api.listAccounts(),
        App.api.listLiabilities(),
        App.api.listGoals()
      ]);

      const recurringItemsById = {}; recurringItemsAll.forEach((i) => { recurringItemsById[i.id] = i; });
      const filteredDeals = App.filters.apply(deals);
      const filteredIds = new Set(filteredDeals.map((d) => d.id));
      const metricsById = {}; metrics.forEach((m) => { metricsById[m.deal_id] = m; });
      const s = summary || {};

      const todayISO = App.utils.todayISO();
      const in7 = App.utils.toISO(new Date(Date.now() + 7 * 86400000));
      const in30 = App.utils.toISO(new Date(Date.now() + 30 * 86400000));
      const in90 = App.utils.toISO(new Date(Date.now() + 90 * 86400000));
      const monthStart = App.utils.toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      const monthEnd = App.utils.toISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

      const relevantSchedule = schedule.filter((sc) => filteredIds.has(sc.deal_id));
      const relevantPayments = payments.filter((p) => filteredIds.has(p.deal_id) && !p.is_voided);
      const sumWhere = App.utils.sumWhere;
      const pendingStatuses = ['UPCOMING', 'DUE_TODAY', 'OVERDUE'];

      // Gold calculations
      const latest22k = gold22kHistory.length ? gold22kHistory[gold22kHistory.length - 1] : null;
      const goldGrams = goldHoldings.reduce((a, h) => a + h.total_grams, 0) + goldPurchases.reduce((a, p) => a + (p.net_grams || p.grams || 0), 0);
      const goldValue = latest22k ? goldGrams * latest22k.price : 0;

      // Net Worth Calculation & Breakdown
      const liquidCash = accounts.filter((a) => a.is_active && (a.account_type === 'Savings' || a.account_type === 'Checking' || a.account_type === 'Cash' || a.account_type === 'Bank Account')).reduce((a, r) => a + (r.current_balance || 0), 0);
      const otherAccounts = accounts.filter((a) => a.is_active && !(a.account_type === 'Savings' || a.account_type === 'Checking' || a.account_type === 'Cash' || a.account_type === 'Bank Account')).reduce((a, r) => a + (r.current_balance || 0), 0);
      const totalAccounts = liquidCash + otherAccounts;
      const activeDeals = filteredDeals.filter((d) => d.status === 'ACTIVE');
      const deployedInvestments = activeDeals.reduce((a, d) => a + (d.current_principal != null ? d.current_principal : d.invested_amount || 0), 0);
      const pendingInterest = s.interest_pending || 0;
      const totalAssets = totalAccounts + deployedInvestments + goldValue;
      const totalLiabilities = liabilities.filter((l) => l.is_active).reduce((a, r) => a + (r.outstanding_amount || 0), 0);
      const netWorth = totalAssets - totalLiabilities;

      // -------------------------------------------------------------------------
      // 1. Where Am I? (Financial Position Hero)
      // -------------------------------------------------------------------------
      const positionGrid = App.utils.qs('#dashPositionGrid', pane);
      positionGrid.innerHTML = `
        <div class="kpi c-teal" style="background:rgba(22,201,163,0.06);border:1px solid rgba(22,201,163,0.25)">
          <div class="kpi-label" style="font-weight:700">Net Worth</div>
          <div class="kpi-value" style="font-size:26px;color:var(--teal)">${App.utils.fmtMoney(netWorth)}</div>
          <div class="kpi-desc">Total Assets &minus; Total Liabilities</div>
        </div>
        <div class="kpi c-gold">
          <div class="kpi-label">Deployed Investments</div>
          <div class="kpi-value">${App.utils.fmtMoney(deployedInvestments)}</div>
          <div class="kpi-desc">${activeDeals.length} Active Deals + Schemes</div>
        </div>
        <div class="kpi c-blue">
          <div class="kpi-label">Liquid Cash &amp; Bank</div>
          <div class="kpi-value">${App.utils.fmtMoney(totalAccounts)}</div>
          <div class="kpi-desc">${accounts.filter((a) => a.is_active).length} Active Accounts</div>
        </div>
        <div class="kpi c-red">
          <div class="kpi-label">Total Liabilities</div>
          <div class="kpi-value">${App.utils.fmtMoney(totalLiabilities)}</div>
          <div class="kpi-desc">${liabilities.filter((l) => l.is_active).length} Debt Commitments</div>
        </div>
      `;

      // Why Net Worth Modal Trigger
      App.utils.qs('#btnExplainNetWorth', pane)?.addEventListener('click', () => {
        openCalculationAuditModal('Net Worth Position Breakdown', `
          <div style="font-size:13px;line-height:1.6;color:var(--text)">
            <p style="margin-bottom:12px"><b>Net Worth Formula:</b> <code>Net Worth = (Investments + Bank/Cash Accounts + Gold Holdings) &minus; Total Liabilities</code></p>
            
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
              <div style="font-weight:700;color:var(--teal);margin-bottom:8px">1. Total Assets: ${App.utils.fmtMoney(totalAssets)}</div>
              <div class="stat-line"><span>&bull; Deployed Principal in Active Deals (${activeDeals.length})</span><span class="v">${App.utils.fmtMoney(deployedInvestments)}</span></div>
              <div class="stat-line"><span>&bull; Liquid Cash &amp; Savings Accounts</span><span class="v">${App.utils.fmtMoney(liquidCash)}</span></div>
              <div class="stat-line"><span>&bull; Other Accounts (Demats, Wallets, Deposits)</span><span class="v">${App.utils.fmtMoney(otherAccounts)}</span></div>
              <div class="stat-line"><span>&bull; Gold Holdings (${App.utils.fmtNum(goldGrams, 2)} g @ ₹${latest22k ? App.utils.fmtNum(latest22k.price, 0) : '0'}/g)</span><span class="v">${App.utils.fmtMoney(goldValue)}</span></div>
            </div>

            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
              <div style="font-weight:700;color:var(--red);margin-bottom:8px">2. Total Liabilities: ${App.utils.fmtMoney(totalLiabilities)}</div>
              ${liabilities.filter((l) => l.is_active).length ? liabilities.filter((l) => l.is_active).map((l) => `
                <div class="stat-line"><span>&bull; ${App.utils.escapeHtml(l.liability_name || 'Liability')} (${App.utils.escapeHtml(l.lender_institution || 'Lender')})</span><span class="v" style="color:var(--red)">${App.utils.fmtMoney(l.outstanding_amount)}</span></div>
              `).join('') : '<div class="empty-note">No active liabilities</div>'}
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(22,201,163,0.12);border-radius:8px;font-weight:700">
              <span style="color:var(--teal)">Final Net Worth Position:</span>
              <span style="font-size:16px;color:var(--teal)">${App.utils.fmtMoney(netWorth)}</span>
            </div>
          </div>
        `);
      });

      // -------------------------------------------------------------------------
      // 2. Financial Health Score Engine
      // -------------------------------------------------------------------------
      // Pillars: Emergency Fund (15), Discipline (20), Debt-to-Asset (20), Diversification (15), Goal Progress (15), Cash Flow Safety (15)
      const monthlyBurn = (totalLiabilities * 0.03) + 30000; // estimated monthly commitment baseline
      const emergencyMonths = monthlyBurn > 0 ? (liquidCash / monthlyBurn) : 6;
      const emergencyScore = Math.min(100, Math.round((emergencyMonths / 6) * 100));

      const overdueCount = relevantSchedule.filter((sc) => sc.status === 'OVERDUE').length + recurringOccAll.filter((o) => o.status === 'OVERDUE').length;
      const disciplineScore = Math.max(20, Math.round(100 - (overdueCount * 18)));

      const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) : 0;
      const debtScore = Math.max(10, Math.round(100 - (debtRatio * 150)));

      // Diversification Score across Asset types (Deals, Gold, Cash)
      let divScore = 50;
      if (deployedInvestments > 0 && goldValue > 0 && totalAccounts > 0) divScore = 95;
      else if (deployedInvestments > 0 && (goldValue > 0 || totalAccounts > 0)) divScore = 80;

      // Goals progress
      const activeGoals = goals.filter((g) => g.status === 'In Progress' || !g.status);
      const avgGoalPct = activeGoals.length ? Math.round(activeGoals.reduce((a, g) => a + Math.min(100, (g.current_amount || 0) / (g.target_amount || 1) * 100), 0) / activeGoals.length) : 80;
      const goalScore = activeGoals.length ? avgGoalPct : 75;

      const thisMonthReceived = sumWhere(relevantPayments, 'transaction_date', 'amount', monthStart, todayISO);
      const thisMonthExpected = sumWhere(relevantSchedule, 'scheduled_date', 'expected_total', monthStart, monthEnd);
      const cashflowScore = thisMonthExpected > 0 ? Math.min(100, Math.round((thisMonthReceived / thisMonthExpected) * 100)) : 85;

      const overallHealthScore = Math.round(
        (emergencyScore * 0.18) +
        (disciplineScore * 0.22) +
        (debtScore * 0.20) +
        (divScore * 0.15) +
        (goalScore * 0.12) +
        (cashflowScore * 0.13)
      );

      let healthGrade = 'Good';
      let healthColor = 'var(--teal)';
      if (overallHealthScore >= 85) { healthGrade = 'Excellent'; healthColor = 'var(--teal)'; }
      else if (overallHealthScore >= 70) { healthGrade = 'Strong'; healthColor = 'var(--gold)'; }
      else if (overallHealthScore >= 50) { healthGrade = 'Fair'; healthColor = 'var(--blue)'; }
      else { healthGrade = 'Needs Attention'; healthColor = 'var(--red)'; }

      App.utils.qs('#dashHealthGradeBadge', pane).innerHTML = `<span class="badge" style="background:${healthColor};color:#000;font-weight:700;font-size:11px">${overallHealthScore}/100 &middot; ${healthGrade}</span>`;

      App.utils.qs('#dashHealthBreakdown', pane).innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
          <div style="background:var(--bg2);padding:10px 12px;border-radius:8px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px">
              <span style="color:var(--text2)">🛡️ Emergency Fund</span>
              <span style="font-weight:700;color:${emergencyScore >= 70 ? 'var(--teal)' : 'var(--gold)'}">${emergencyMonths.toFixed(1)} mo (${emergencyScore}%)</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
              <div style="width:${emergencyScore}%;height:100%;background:var(--teal)"></div>
            </div>
          </div>

          <div style="background:var(--bg2);padding:10px 12px;border-radius:8px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px">
              <span style="color:var(--text2)">🔄 Investment Discipline</span>
              <span style="font-weight:700;color:${disciplineScore >= 80 ? 'var(--teal)' : 'var(--red)'}">${disciplineScore}%</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
              <div style="width:${disciplineScore}%;height:100%;background:${disciplineScore >= 80 ? 'var(--teal)' : 'var(--red)'}"></div>
            </div>
          </div>

          <div style="background:var(--bg2);padding:10px 12px;border-radius:8px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px">
              <span style="color:var(--text2)">⚖️ Debt-to-Asset Ratio</span>
              <span style="font-weight:700;color:${debtScore >= 70 ? 'var(--teal)' : 'var(--gold)'}">${(debtRatio * 100).toFixed(1)}% (${debtScore}%)</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
              <div style="width:${debtScore}%;height:100%;background:var(--teal)"></div>
            </div>
          </div>

          <div style="background:var(--bg2);padding:10px 12px;border-radius:8px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px">
              <span style="color:var(--text2)">🌐 Diversification</span>
              <span style="font-weight:700;color:var(--teal)">${divScore}%</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
              <div style="width:${divScore}%;height:100%;background:var(--teal)"></div>
            </div>
          </div>
        </div>
      `;

      App.utils.qs('#btnWhyHealthScore', pane)?.addEventListener('click', () => {
        openCalculationAuditModal('Financial Health Diagnostic Report', `
          <div style="font-size:13px;line-height:1.6;color:var(--text)">
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(201,168,76,0.12);border-radius:8px;margin-bottom:14px">
              <div style="font-size:32px">🩺</div>
              <div>
                <div style="font-weight:700;font-size:16px;color:var(--gold)">Financial Health Index: ${overallHealthScore}/100 (${healthGrade})</div>
                <div style="font-size:12px;color:var(--text2)">Weighted diagnostic synthesis across liquidity, leverage, discipline &amp; growth</div>
              </div>
            </div>

            <div style="margin-bottom:14px">
              <div style="font-weight:700;font-size:13px;color:var(--teal);margin-bottom:6px">🌟 Current Strengths:</div>
              <ul style="margin:0 0 10px 18px;padding:0;font-size:12.5px;color:var(--text2)">
                <li><b>Low Default Exposure:</b> ${activeDeals.length} active deals performing with stable cash inflows.</li>
                <li><b>Diversified Safety Net:</b> Liquid reserves (${App.utils.fmtMoney(liquidCash)}) cover ~${emergencyMonths.toFixed(1)} months of baseline commitments.</li>
                <li><b>Gold Hedge:</b> Gold reserves of ${App.utils.fmtNum(goldGrams, 2)} g provide inflation cushion.</li>
              </ul>
            </div>

            <div style="margin-bottom:14px">
              <div style="font-weight:700;font-size:13px;color:var(--gold);margin-bottom:6px">⚡ Opportunities to Boost Score to 95+:</div>
              <ul style="margin:0 0 10px 18px;padding:0;font-size:12.5px;color:var(--text2)">
                ${overdueCount > 0 ? `<li style="color:var(--red)"><b>Resolve ${overdueCount} overdue item(s):</b> Clear pending schedule payouts to maximize discipline score.</li>` : ''}
                <li><b>Automate Reinvestment:</b> Channel monthly realized interest (${App.utils.fmtMoney(thisMonthReceived)}) into compounding recurring assets.</li>
                <li><b>Debt Optimization:</b> Maintain total debt-to-asset under 15% to preserve maximum financial resilience.</li>
              </ul>
            </div>
          </div>
        `);
      });

      // -------------------------------------------------------------------------
      // 3. Question 2: How am I performing? (Returns & Profit)
      // -------------------------------------------------------------------------
      const closedDeals = filteredDeals.filter((d) => d.status !== 'ACTIVE');
      const closedAmount = closedDeals.reduce((a, d) => a + (d.invested_amount || 0), 0);
      App.utils.qs('#dashPerformanceBlock', pane).innerHTML = `
        <div class="stat-line"><span>Realized ROI</span><span class="v" style="font-weight:700;color:var(--teal)">${App.utils.fmtPct(s.realized_roi)}</span></div>
        <div class="stat-line"><span>Annualized ROI (XIRR)</span><span class="v" style="font-weight:700;color:var(--teal)">${App.utils.fmtPct(s.annualized_roi)}</span></div>
        <div class="stat-line"><span>Weighted Average ROI (Active)</span><span class="v">${App.utils.fmtPct(s.weighted_average_roi)}</span></div>
        <div class="stat-line"><span>Total Interest Earned</span><span class="v">${App.utils.fmtMoney(s.interest_earned)}</span></div>
        <div class="stat-line"><span>Net Profit (Net of Fees &amp; Tax)</span><span class="v" style="color:var(--gold);font-weight:700">${App.utils.fmtMoney(s.net_profit)}</span></div>
        <div class="stat-line"><span>Principal Returned</span><span class="v">${App.utils.fmtMoney(s.principal_returned)}</span></div>
        <div class="stat-line"><span>Expected Future Interest</span><span class="v">${App.utils.fmtMoney(s.expected_future_interest)}</span></div>
        <div class="stat-line"><span>Active vs Closed Deals</span><span class="v">${activeDeals.length} Active &middot; ${closedDeals.length} Closed</span></div>
      `;

      App.utils.qs('#btnExplainReturns', pane)?.addEventListener('click', () => {
        openCalculationAuditModal('Return & Yield Methodology', `
          <div style="font-size:13px;line-height:1.6;color:var(--text)">
            <p style="margin-bottom:10px"><b>Return Computation Standards:</b></p>
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
              <div style="font-weight:700;color:var(--gold);margin-bottom:4px">&bull; Realized ROI:</div>
              <div style="font-size:12px;color:var(--text2)"><code>(Total Interest Earned &minus; Platform Fees &minus; Taxes) / Total Invested &times; 100</code></div>
            </div>
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
              <div style="font-weight:700;color:var(--gold);margin-bottom:4px">&bull; Annualized ROI:</div>
              <div style="font-size:12px;color:var(--text2)">Time-weighted annual equivalent accounting for holding durations and compound cash cycles.</div>
            </div>
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">
              <div style="font-weight:700;color:var(--gold);margin-bottom:4px">&bull; Net Profit:</div>
              <div style="font-size:12px;color:var(--text2)">Pure profit after deducting TDS deductions, brokerage fees, and transaction charges.</div>
            </div>
          </div>
        `);
      });

      // -------------------------------------------------------------------------
      // 4. Question 3: What happened? (Cash Flow Pulse)
      // -------------------------------------------------------------------------
      const thisMonthPending = relevantSchedule.filter((sc) => pendingStatuses.includes(sc.status) && sc.scheduled_date >= monthStart).reduce((a, r) => a + (r.expected_total || 0), 0);
      const fyCur = fyBounds(App.state.profile, 'current');
      const fyPrev = fyBounds(App.state.profile, 'previous');

      App.utils.qs('#dashCashFlowBlock', pane).innerHTML = `
        <div class="stat-line"><span>This Month Received</span><span class="v" style="color:var(--teal);font-weight:700">${App.utils.fmtMoney(thisMonthReceived)}</span></div>
        <div class="stat-line"><span>This Month Expected</span><span class="v">${App.utils.fmtMoney(thisMonthExpected)}</span></div>
        <div class="stat-line"><span>This Month Pending</span><span class="v" style="color:${thisMonthPending > 0 ? 'var(--gold)' : 'var(--text2)'}">${App.utils.fmtMoney(thisMonthPending)}</span></div>
        <div class="stat-line"><span>Next 7 Days Payouts</span><span class="v">${App.utils.fmtMoney(sumWhere(relevantSchedule.filter((r) => pendingStatuses.includes(r.status)), 'scheduled_date', 'expected_total', todayISO, in7))}</span></div>
        <div class="stat-line"><span>Next 30 Days Payouts</span><span class="v">${App.utils.fmtMoney(sumWhere(relevantSchedule.filter((r) => pendingStatuses.includes(r.status)), 'scheduled_date', 'expected_total', todayISO, in30))}</span></div>
        <div class="stat-line"><span>Next 90 Days Payouts</span><span class="v">${App.utils.fmtMoney(sumWhere(relevantSchedule.filter((r) => pendingStatuses.includes(r.status)), 'scheduled_date', 'expected_total', todayISO, in90))}</span></div>
        <div class="stat-line"><span>Current FY (${fyCur.start.slice(0, 4)}) Total</span><span class="v">${App.utils.fmtMoney(sumWhere(relevantPayments, 'transaction_date', 'amount', fyCur.start, fyCur.end))}</span></div>
        <div class="stat-line"><span>Previous FY Total</span><span class="v">${App.utils.fmtMoney(sumWhere(relevantPayments, 'transaction_date', 'amount', fyPrev.start, fyPrev.end))}</span></div>
      `;

      // -------------------------------------------------------------------------
      // 5. Question 4: 🔔 What needs my attention? (Master Action Center)
      // -------------------------------------------------------------------------
      const dueToday = relevantSchedule.filter((sc) => sc.scheduled_date === todayISO && pendingStatuses.includes(sc.status));
      const overdue = relevantSchedule.filter((sc) => sc.status === 'OVERDUE');
      const maturing30 = filteredDeals.filter((d) => d.maturity_date && d.maturity_date >= todayISO && d.maturity_date <= in30 && d.status === 'ACTIVE');
      const recurringDueToday = recurringOccAll.filter((o) => o.due_date === todayISO && pendingStatuses.includes(o.status));
      const recurringOverdue = recurringOccAll.filter((o) => o.status === 'OVERDUE');
      const recurringYetToConfirm = recurringOccAll.filter((o) => ['UPCOMING', 'DUE'].includes(o.status) && o.due_date >= todayISO && o.due_date <= in7);

      const totalAttentionCount = dueToday.length + overdue.length + maturing30.length + recurringDueToday.length + recurringOverdue.length;
      App.utils.qs('#dashAttentionCountBadge', pane).textContent = `${totalAttentionCount} Item(s) Actionable`;
      App.utils.qs('#dashAttentionCountBadge', pane).style.background = totalAttentionCount > 0 ? 'rgba(255,107,107,0.18)' : 'rgba(22,201,163,0.18)';
      App.utils.qs('#dashAttentionCountBadge', pane).style.color = totalAttentionCount > 0 ? 'var(--red)' : 'var(--teal)';

      const dealsById = {}; deals.forEach((d) => { dealsById[d.id] = d; });
      function sourceLabel(itemId) {
        const item = recurringItemsById[itemId] || {};
        return item.item_type === 'Custom' ? (item.custom_type_label || 'Custom') : (item.item_type || 'Recurring');
      }

      const actionCenter = App.utils.qs('#dashActionCenterContent', pane);
      if (totalAttentionCount === 0) {
        actionCenter.innerHTML = `
          <div style="text-align:center;padding:24px 16px;background:var(--bg2);border-radius:10px;border:1px dashed rgba(22,201,163,0.3)">
            <div style="font-size:28px;margin-bottom:6px">✨</div>
            <div style="font-weight:700;color:var(--teal);font-size:14px">All Clear &mdash; No Pending Overdues or Critical Actions!</div>
            <div style="font-size:12px;color:var(--text2);margin-top:4px">All deal payments, recurring commitments, and maturities are up to date.</div>
          </div>
        `;
      } else {
        let actionCards = [];

        // Overdue Deals
        overdue.forEach((sc) => {
          const deal = dealsById[sc.deal_id] || {};
          actionCards.push(`
            <div class="risk-item" style="border-left:3px solid var(--red);background:var(--bg2);display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="risk-dot" style="background:var(--red)"></div>
                <div>
                  <div class="risk-name" style="font-weight:600">🔴 Payout Overdue &mdash; ${App.utils.escapeHtml(deal.deal_name || 'Deal')}</div>
                  <div class="risk-desc">${App.utils.fmtMoney(sc.expected_total)} expected on ${App.utils.fmtDate(sc.scheduled_date)}</div>
                </div>
              </div>
              <button class="btn btn-gold btn-sm" data-action-record-deal="${sc.deal_id}">💰 Record Payment</button>
            </div>
          `);
        });

        // Overdue Recurring
        recurringOverdue.forEach((o) => {
          actionCards.push(`
            <div class="risk-item" style="border-left:3px solid var(--red);background:var(--bg2);display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="risk-dot" style="background:var(--red)"></div>
                <div>
                  <div class="risk-name" style="font-weight:600">🔴 Overdue Commitment &mdash; ${App.utils.escapeHtml(sourceLabel(o.recurring_item_id))}: ${App.utils.escapeHtml((recurringItemsById[o.recurring_item_id] || {}).item_name)}</div>
                  <div class="risk-desc">${App.utils.fmtMoney(o.expected_amount)} due ${App.utils.fmtDate(o.due_date)}</div>
                </div>
              </div>
              <button class="btn btn-gold btn-sm" data-action-confirm-recurring="${o.recurring_item_id}">🔄 Confirm &amp; Pay</button>
            </div>
          `);
        });

        // Due Today Deals
        dueToday.forEach((sc) => {
          const deal = dealsById[sc.deal_id] || {};
          actionCards.push(`
            <div class="risk-item" style="border-left:3px solid var(--gold);background:var(--bg2);display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="risk-dot" style="background:var(--gold)"></div>
                <div>
                  <div class="risk-name" style="font-weight:600">🟡 Due Today &mdash; ${App.utils.escapeHtml(deal.deal_name || 'Deal')}</div>
                  <div class="risk-desc">${App.utils.fmtMoney(sc.expected_total)} scheduled for today</div>
                </div>
              </div>
              <button class="btn btn-gold btn-sm" data-action-record-deal="${sc.deal_id}">💰 Record Payment</button>
            </div>
          `);
        });

        // Maturing within 30 days
        maturing30.forEach((d) => {
          actionCards.push(`
            <div class="risk-item" style="border-left:3px solid var(--blue);background:var(--bg2);display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="risk-dot" style="background:var(--blue)"></div>
                <div>
                  <div class="risk-name" style="font-weight:600">⏳ Maturing Soon &mdash; ${App.utils.escapeHtml(d.deal_name)}</div>
                  <div class="risk-desc">Matures ${App.utils.fmtDate(d.maturity_date)} &middot; Principal: ${App.utils.fmtMoney(d.invested_amount)}</div>
                </div>
              </div>
              <button class="btn btn-outline btn-sm" data-action-open-maturity="${d.id}">📈 Plan Reinvestment</button>
            </div>
          `);
        });

        actionCenter.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">${actionCards.slice(0, 8).join('')}</div>`;

        // Action Button Wiring
        App.utils.qsa('[data-action-record-deal]', actionCenter).forEach((btn) => {
          btn.addEventListener('click', () => {
            const dealId = Number(btn.dataset.actionRecordDeal);
            App.router.navigate('payments');
            setTimeout(() => {
              if (App.paymentsView && App.paymentsView.openRecordPaymentModal) {
                App.paymentsView.openRecordPaymentModal(deals, dealId, null);
              }
            }, 80);
          });
        });

        App.utils.qsa('[data-action-confirm-recurring]', actionCenter).forEach((btn) => {
          btn.addEventListener('click', () => {
            const itemId = Number(btn.dataset.actionConfirmRecurring);
            App.router.navigate('recurring');
            setTimeout(() => {
              if (App.recurringView && App.recurringView.openItemDetail) {
                App.recurringView.openItemDetail(itemId);
              }
            }, 80);
          });
        });

        App.utils.qsa('[data-action-open-maturity]', actionCenter).forEach((btn) => {
          btn.addEventListener('click', () => {
            App.router.navigate('maturityplanner');
          });
        });
      }

      // -------------------------------------------------------------------------
      // 6. Question 5: 🎯 Am I progressing? (Portfolio Goals)
      // -------------------------------------------------------------------------
      const goalsBlock = App.utils.qs('#dashGoalsBlock', pane);
      if (!goals.length) {
        goalsBlock.innerHTML = `
          <div class="empty-note" style="padding:16px 0">No goals created yet. Set financial milestones to track your progress.</div>
          <button class="btn btn-gold btn-sm" id="btnCreateFirstGoal" style="margin-top:8px">🎯 Create New Goal</button>
        `;
        App.utils.qs('#btnCreateFirstGoal', goalsBlock)?.addEventListener('click', () => App.router.navigate('goals'));
      } else {
        goalsBlock.innerHTML = goals.slice(0, 4).map((g) => {
          const target = g.target_amount || 1;
          const current = g.current_amount || 0;
          const pct = Math.min(100, Math.round((current / target) * 100));
          const isComplete = pct >= 100;
          return `
            <div style="background:var(--bg2);padding:10px 12px;border-radius:8px;margin-bottom:8px;border:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-bottom:4px">
                <span style="font-weight:600">${App.utils.escapeHtml(g.goal_name || 'Goal')}</span>
                <span style="font-weight:700;color:${isComplete ? 'var(--teal)' : 'var(--gold)'}">${App.utils.fmtMoney(current)} / ${App.utils.fmtMoney(target)} (${pct}%)</span>
              </div>
              <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin-bottom:4px">
                <div style="width:${pct}%;height:100%;background:${isComplete ? 'var(--teal)' : 'linear-gradient(90deg,var(--gold),var(--teal))'}"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)">
                <span>Target: ${g.target_date ? App.utils.fmtDate(g.target_date) : 'No deadline'}</span>
                <span class="badge ${isComplete ? 'st-active' : 'st-due'}" style="font-size:9.5px">${g.status || (isComplete ? 'Achieved' : 'In Progress')}</span>
              </div>
            </div>
          `;
        }).join('');
      }

      // -------------------------------------------------------------------------
      // 7. Recurring Investments Block
      // -------------------------------------------------------------------------
      const rs = recurringSummary || {};
      App.utils.qs('#dashRecurringBlock', pane).innerHTML = `
        <div class="stat-line"><span>Active Recurring Items</span><span class="v">${rs.active_items_count || 0}</span></div>
        <div class="stat-line"><span>This Month Expected</span><span class="v">${App.utils.fmtMoney(rs.month_expected)}</span></div>
        <div class="stat-line"><span>This Month Confirmed</span><span class="v" style="color:var(--teal)">${App.utils.fmtMoney(rs.month_confirmed)}</span></div>
        <div class="stat-line"><span>Next 7 Days Outflow</span><span class="v">${App.utils.fmtMoney(rs.next_7_days_amount)}</span></div>
        <div class="stat-line"><span>Next 30 Days Outflow</span><span class="v">${App.utils.fmtMoney(rs.next_30_days_amount)}</span></div>
        <div class="stat-line"><span>Yearly Total Committed</span><span class="v">${App.utils.fmtMoney(rs.year_expected)}</span></div>
      `;

      // -------------------------------------------------------------------------
      // 8. Gold Intelligence Block
      // -------------------------------------------------------------------------
      const changeSince = (days) => {
        if (!latest22k) return null;
        const cutoff = App.utils.toISO(new Date(Date.now() - days * 86400000));
        let prev = gold22kHistory[0];
        for (const o of gold22kHistory) { if (o.observed_at <= cutoff) prev = o; else break; }
        return prev && prev.price ? ((latest22k.price - prev.price) / prev.price) * 100 : null;
      };

      const pctHtml = (v) => v == null ? '—' : `<span style="color:${v >= 0 ? 'var(--teal)' : 'var(--red)'}">${v >= 0 ? '+' : ''}${App.utils.fmtPct(v)}</span>`;

      App.utils.qs('#dashGoldBlock', pane).innerHTML = `
        <div class="grid-4" style="gap:10px">
          <div class="kpi c-gold">
            <div class="kpi-label">22K Spot Rate</div>
            <div class="kpi-value">${latest22k ? '₹' + App.utils.fmtNum(latest22k.price, 0) + '/g' : '—'}</div>
            <div class="kpi-desc">Live Benchmark Rate</div>
          </div>
          <div class="kpi c-blue">
            <div class="kpi-label">7-Day Momentum</div>
            <div class="kpi-value">${pctHtml(changeSince(7))}</div>
            <div class="kpi-desc">Short-term trend</div>
          </div>
          <div class="kpi c-teal">
            <div class="kpi-label">30-Day Movement</div>
            <div class="kpi-value">${pctHtml(changeSince(30))}</div>
            <div class="kpi-desc">Monthly delta</div>
          </div>
          <div class="kpi c-purple">
            <div class="kpi-label">My Total Gold</div>
            <div class="kpi-value">${App.utils.fmtNum(goldGrams, 2)} g</div>
            <div class="kpi-desc">Value: ${App.utils.fmtMoney(goldValue)}</div>
          </div>
        </div>
      `;
    }

    // Interactive Calculation Transparency Drawer / Modal
    function openCalculationAuditModal(title, htmlContent) {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(3,7,18,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(5px)';
      modal.innerHTML = `
        <div style="background:#0e1626;border:1px solid rgba(201,168,76,0.3);border-radius:12px;max-width:540px;width:100%;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.6)">
          <div style="padding:14px 18px;background:#152238;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:700;font-size:15px;color:var(--gold);display:flex;align-items:center;gap:6px">
              <span>🔍</span>
              <span>${App.utils.escapeHtml(title)}</span>
            </div>
            <button class="btn btn-outline btn-sm" id="btnCloseAuditModal" style="padding:2px 8px;font-size:12px">✕</button>
          </div>
          <div style="padding:18px;max-height:70vh;overflow-y:auto">
            ${htmlContent}
          </div>
          <div style="padding:12px 18px;background:#090f1d;border-top:1px solid rgba(255,255,255,0.06);text-align:right">
            <button class="btn btn-gold btn-sm" id="btnDismissAudit">Got it</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
      modal.querySelector('#btnCloseAuditModal')?.addEventListener('click', close);
      modal.querySelector('#btnDismissAudit')?.addEventListener('click', close);
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    await draw();
  }

  App.router.register('dashboard', renderDashboardView);
})();
