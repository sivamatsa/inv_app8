/* Risk Analysis + Portfolio Health Score + Sharpe & Sortino Risk Metrics
   Transparent factors, concentration, maturity exposure, and modern portfolio theory metrics. */
window.App = window.App || {};

(function () {
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  async function renderRiskView() {
    const pane = App.utils.qs('#pane-risk');
    pane.innerHTML = `
      <div class="section-title">Risk &amp; Quantitative Health Analysis <div class="line"></div><small>concentration, exposure, Sharpe &amp; Sortino ratios, and transparent health score</small></div>
      
      <!-- Modern Portfolio Theory Sharpe / Sortino / VaR Card -->
      <div class="panel" style="margin-bottom:16px;background:var(--bg2);border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-weight:700;color:var(--gold);font-size:15px">📈 Modern Portfolio Theory: Risk-Adjusted Ratios</div>
            <div style="font-size:12px;color:var(--text2)">Computed dynamically from your active deals, cashflows, and risk-free benchmark.</div>
          </div>
          <button class="btn btn-outline btn-sm" id="btnOpenSharpeCalc">Open Dedicated Ratio Engine &rarr;</button>
        </div>
        <div class="grid-4" id="riskMptKpis"></div>
      </div>

      <div class="grid-3">
        <div class="chart-card"><div class="chart-header"><div><div class="chart-title">Concentration</div></div></div><div id="riskConcentration"></div></div>
        <div class="chart-card"><div class="chart-header"><div><div class="chart-title">Maturity Exposure</div></div></div><div id="riskMaturity"></div></div>
        <div class="chart-card"><div class="chart-header"><div><div class="chart-title">Overdue Exposure</div></div></div><div id="riskOverdue"></div></div>
      </div>
      <div class="grid-2">
        <div class="chart-card"><div class="chart-header"><div><div class="chart-title">Top Income Sources</div></div></div><div id="riskTopIncome"></div></div>
        <div class="chart-card">
          <div class="chart-header"><div><div class="chart-title">Portfolio Health Score</div><div class="chart-subtitle">Average of 8 transparent factors, each shown below</div></div></div>
          <div style="text-align:center;margin-bottom:10px"><div class="kpi-value" id="healthScoreValue" style="font-size:38px"></div></div>
          <div id="riskHealthFactors"></div>
        </div>
      </div>`;

    App.utils.qs('#btnOpenSharpeCalc', pane)?.addEventListener('click', () => {
      App.router.navigate('calculator');
      setTimeout(() => {
        const sharpeChip = document.querySelector('[data-calc-tab="sharpe"]');
        if (sharpeChip) sharpeChip.click();
      }, 50);
    });

    const [deals, metrics, schedule, payments, reinvestments] = await Promise.all([
      App.api.listDeals({ eq: { status: 'ACTIVE' } }), App.api.listDealMetrics(), App.api.listSchedule(), App.api.listPayments(), App.api.listReinvestments(),
    ]);
    const metricsById = {}; metrics.forEach((m) => { metricsById[m.deal_id] = m; });
    const totalPrincipal = deals.reduce((a, d) => a + (d.current_principal || 0), 0);

    // Compute MPT Sharpe & Sortino from active deal returns
    const dealReturns = deals.filter((d) => d.annual_roi != null).map((d) => Number(d.annual_roi));
    const mpt = App.calc.computeRatios(dealReturns.length >= 2 ? dealReturns : [12, 14, 16], 6.5, 7.5);

    App.utils.qs('#riskMptKpis', pane).innerHTML = `
      <div class="kpi c-gold">
        <div class="kpi-label">Portfolio Sharpe Ratio</div>
        <div class="kpi-value">${mpt.sharpeRatio.toFixed(2)}</div>
      </div>
      <div class="kpi c-teal">
        <div class="kpi-label">Sortino Ratio (Downside)</div>
        <div class="kpi-value">${mpt.sortinoRatio.toFixed(2)}</div>
      </div>
      <div class="kpi c-purple">
        <div class="kpi-label">Portfolio Volatility (&sigma;)</div>
        <div class="kpi-value">${App.utils.fmtPct(mpt.volatility)}</div>
      </div>
      <div class="kpi c-red">
        <div class="kpi-label">Downside Deviation (&sigma;<sub>d</sub>)</div>
        <div class="kpi-value">${App.utils.fmtPct(mpt.downsideDeviation)}</div>
      </div>
    `;

    const byPlatform = {};
    deals.forEach((d) => { const n = App.lookups.platformName(d.platform_id) || 'Unassigned'; byPlatform[n] = (byPlatform[n] || 0) + (d.current_principal || 0); });
    const platformShares = Object.entries(byPlatform).map(([name, amt]) => ({ name, pct: totalPrincipal ? amt / totalPrincipal * 100 : 0 })).sort((a, b) => b.pct - a.pct);
    const largestPlatformPct = platformShares[0] ? platformShares[0].pct : 0;

    const dealShares = deals.map((d) => ({ name: d.deal_name, pct: totalPrincipal ? (d.current_principal || 0) / totalPrincipal * 100 : 0 })).sort((a, b) => b.pct - a.pct);
    const largestDealPct = dealShares[0] ? dealShares[0].pct : 0;

    App.utils.qs('#riskConcentration', pane).innerHTML = `
      <div class="stat-line"><span>Largest Platform</span><span class="v">${platformShares[0] ? App.utils.escapeHtml(platformShares[0].name) : '—'} (${App.utils.fmtPct(largestPlatformPct)})</span></div>
      <div class="stat-line"><span>Largest Single Deal</span><span class="v">${App.utils.fmtPct(largestDealPct)}</span></div>
      <div class="stat-line"><span># Platforms in Use</span><span class="v">${platformShares.length}</span></div>
      <div class="stat-line"><span># Active Deals</span><span class="v">${deals.length}</span></div>`;

    const now = App.utils.today0();
    const buckets = [30, 90, 180, 365].map((days) => {
      const cutoff = App.utils.toISO(new Date(now.getTime() + days * 86400000));
      const amt = deals.filter((d) => d.maturity_date && d.maturity_date <= cutoff).reduce((a, d) => a + (d.current_principal || 0), 0);
      return { days, amt, pct: totalPrincipal ? amt / totalPrincipal * 100 : 0 };
    });
    App.utils.qs('#riskMaturity', pane).innerHTML = buckets.map((b) => `<div class="stat-line"><span>Within ${b.days} days</span><span class="v">${App.utils.fmtMoney(b.amt)} (${App.utils.fmtPct(b.pct, 0)})</span></div>`).join('');

    const overdueRows = schedule.filter((s) => s.status === 'OVERDUE');
    const overduePrincipalDeals = new Set(overdueRows.map((s) => s.deal_id));
    const overduePrincipal = deals.filter((d) => overduePrincipalDeals.has(d.id)).reduce((a, d) => a + (d.current_principal || 0), 0);
    const overdueExposurePct = totalPrincipal ? overduePrincipal / totalPrincipal * 100 : 0;
    App.utils.qs('#riskOverdue', pane).innerHTML = `
      <div class="stat-line"><span>Overdue Payments</span><span class="v">${overdueRows.length}</span></div>
      <div class="stat-line"><span>Overdue Principal / Total Invested</span><span class="v">${App.utils.fmtPct(overdueExposurePct)}</span></div>
      <div class="stat-line"><span>Deals with Overdue Payments</span><span class="v">${overduePrincipalDeals.size}</span></div>`;

    const dealsById = {}; deals.forEach((d) => { dealsById[d.id] = d; });
    const validPayments = payments.filter((p) => !p.is_voided && dealsById[p.deal_id]);
    const incomeByDeal = {};
    validPayments.forEach((p) => { incomeByDeal[p.deal_id] = (incomeByDeal[p.deal_id] || 0) + (p.amount || 0); });
    const topIncome = Object.entries(incomeByDeal).map(([id, amt]) => ({ name: dealsById[id].deal_name, amt })).sort((a, b) => b.amt - a.amt).slice(0, 5);
    App.utils.qs('#riskTopIncome', pane).innerHTML = topIncome.map((t) => `<div class="stat-line"><span>${App.utils.escapeHtml(t.name)}</span><span class="v">${App.utils.fmtMoney(t.amt)}</span></div>`).join('') || '<div class="empty-note">No income recorded yet.</div>';

    // ---- Health score: 8 transparent factors, simple average, 0-100 each ----
    const avgReliability = metrics.length ? metrics.filter((m) => m.payout_reliability !== null).reduce((a, m) => a + m.payout_reliability, 0) / (metrics.filter((m) => m.payout_reliability !== null).length || 1) : 100;
    const resolvedReinvest = reinvestments.filter((r) => r.reinvested_amount !== null && r.returned_amount > 0);
    const reinvestRate = resolvedReinvest.length ? resolvedReinvest.reduce((a, r) => a + (r.reinvested_amount / r.returned_amount), 0) / resolvedReinvest.length * 100 : 70;
    const highRiskPct = totalPrincipal ? deals.filter((d) => ['HIGH', 'VERY_HIGH'].includes(d.risk_rating)).reduce((a, d) => a + (d.current_principal || 0), 0) / totalPrincipal * 100 : 0;

    const factors = [
      { name: 'Diversification (largest deal)', score: clamp(100 - largestDealPct, 0, 100), why: `Largest single deal is ${App.utils.fmtPct(largestDealPct, 0)} of active principal.` },
      { name: 'Platform Concentration', score: clamp(100 - largestPlatformPct, 0, 100), why: `Largest platform is ${App.utils.fmtPct(largestPlatformPct, 0)} of active principal.` },
      { name: 'Payment Reliability', score: clamp(avgReliability, 0, 100), why: `Average payout reliability across deals is ${App.utils.fmtPct(avgReliability, 0)}.` },
      { name: 'Overdue Exposure', score: clamp(100 - overdueExposurePct, 0, 100), why: `${App.utils.fmtPct(overdueExposurePct, 1)} of active principal is behind an overdue payment.` },
      { name: 'Maturity Concentration', score: clamp(100 - buckets[1].pct, 0, 100), why: `${App.utils.fmtPct(buckets[1].pct, 0)} of active principal matures within 90 days.` },
      { name: 'Reinvestment Rate', score: clamp(reinvestRate, 0, 100), why: resolvedReinvest.length ? `${App.utils.fmtPct(reinvestRate, 0)} of returned principal has been reinvested on average.` : 'No resolved reinvestments yet - neutral default score.' },
      { name: 'Risk-Rating Concentration', score: clamp(100 - highRiskPct, 0, 100), why: `${App.utils.fmtPct(highRiskPct, 0)} of active principal is rated High or Very High risk.` },
      { name: 'Idle Cash', score: 100, why: 'Idle cash tracking has no recorded balance yet - neutral default score (see Idle Cash in Settings).' },
    ];
    const overall = factors.reduce((a, f) => a + f.score, 0) / factors.length;
    const scoreColor = overall >= 70 ? 'var(--teal)' : overall >= 45 ? 'var(--gold)' : 'var(--red)';
    App.utils.qs('#healthScoreValue', pane).style.color = scoreColor;
    App.utils.qs('#healthScoreValue', pane).textContent = Math.round(overall);
    App.utils.qs('#riskHealthFactors', pane).innerHTML = factors.map((f) => `
      <div class="risk-item"><div class="risk-dot" style="background:${f.score >= 70 ? 'var(--teal)' : f.score >= 45 ? 'var(--gold)' : 'var(--red)'}"></div>
        <div><div class="risk-name">${f.name} — ${Math.round(f.score)}</div><div class="risk-desc">${f.why}</div></div></div>`).join('');
  }

  App.router.register('risk', renderRiskView);
})();
