/* What-If Simulator + Monte Carlo Return Simulations (What-If 2.0) +
   Investment Comparison, as tabs of one view. */
window.App = window.App || {};

(function () {
  let mcChartInstance = null;

  async function renderWhatIfView() {
    const pane = App.utils.qs('#pane-whatif');
    pane.innerHTML = `
      <div class="section-title">What-If &amp; Quantitative Simulations <div class="line"></div><small>projections, stochastic Monte Carlo models, and deal comparisons</small></div>
      <div class="panel">
        <div class="tabbar">
          <button class="tab-btn active" data-tab="sim">What-If Simulator</button>
          <button class="tab-btn" data-tab="montecarlo">🎲 Monte Carlo (What-If 2.0)</button>
          <button class="tab-btn" data-tab="cmp">Compare Deals</button>
        </div>
        <div class="tab-pane active" data-pane="sim" id="simBody"></div>
        <div class="tab-pane" data-pane="montecarlo" id="mcBody"></div>
        <div class="tab-pane" data-pane="cmp" id="cmpBody"></div>
      </div>`;

    App.utils.qsa('.tab-btn', pane).forEach((btn) => btn.addEventListener('click', () => {
      App.utils.qsa('.tab-btn', pane).forEach((b) => b.classList.toggle('active', b === btn));
      App.utils.qsa('.tab-pane', pane).forEach((p) => p.classList.toggle('active', p.dataset.pane === btn.dataset.tab));
      if (btn.dataset.tab === 'montecarlo' && !mcChartInstance) {
        setTimeout(runAndDrawMonteCarlo, 50);
      }
    }));

    await renderSimTab(App.utils.qs('#simBody', pane));
    await renderMonteCarloTab(App.utils.qs('#mcBody', pane));
    await renderCompareTab(App.utils.qs('#cmpBody', pane));
  }

  // -------------------------------------------------------------------------
  // 1. Classic What-If Simulator
  // -------------------------------------------------------------------------
  async function renderSimTab(host) {
    const fields = [
      { key: 'amount', label: 'Amount', type: 'number', required: true },
      { key: 'annualRoiPct', label: 'Annual ROI %', type: 'number', required: true },
      { key: 'tenureMonths', label: 'Tenure (months)', type: 'number', required: true },
      { key: 'scenario', label: 'Scenario', type: 'select', options: [
        { value: 'withdraw_interest', label: 'Withdraw interest, keep principal' },
        { value: 'reinvest_every_payment', label: 'Reinvest every payment (compounding)' },
        { value: 'reinvest_principal_only', label: 'Reinvest principal only at maturity' },
      ] },
    ];
    host.innerHTML = App.ui.renderForm(fields) + `<div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-gold" id="runSim">Run Simulation</button></div>
      <div id="simResult" style="margin-top:16px"></div>
      <div class="table-scroll" style="margin-top:16px"><div class="chart-title" style="margin-bottom:8px">Saved Scenarios</div><table class="data" id="savedScenarios"></table></div>`;

    async function drawSaved() {
      const scenarios = await App.api.listScenarios();
      App.utils.qs('#savedScenarios', host).innerHTML = `<thead><tr><th>Name</th><th>Type</th><th>Amount</th><th>Final Principal</th><th>Total Interest</th><th>Annualized</th><th></th></tr></thead>
        <tbody>${scenarios.map((s) => `<tr><td>${App.utils.escapeHtml(s.scenario_name)}</td><td>${s.scenario_type}</td><td>${App.utils.fmtMoney(s.inputs.amount)}</td><td>${App.utils.fmtMoney(s.outputs.finalPrincipal)}</td><td>${App.utils.fmtMoney(s.outputs.totalInterest)}</td><td>${App.utils.fmtPct(s.outputs.annualizedReturn)}</td>
          <td><button class="icon-btn del" data-del-scenario="${s.id}">&#128465;</button></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:16px">No saved scenarios.</td></tr>'}</tbody>`;
      App.utils.qsa('[data-del-scenario]', host).forEach((b) => b.addEventListener('click', async () => { await App.api.deleteScenario(Number(b.dataset.delScenario)); drawSaved(); }));
    }

    App.utils.qs('#runSim', host).addEventListener('click', async () => {
      const { values, errors } = App.ui.readForm(fields);
      if (errors.length) { App.utils.toast('Fill in amount, ROI and tenure', 'err'); return; }
      const result = App.calc.whatIf(values);
      App.utils.qs('#simResult', host).innerHTML = `
        <div class="hint" style="margin-bottom:10px"><b>This is a projection, not a guarantee.</b> ${result.note || ''}</div>
        <div class="grid-4">
          <div class="kpi c-gold"><div class="kpi-label">Final Principal</div><div class="kpi-value">${App.utils.fmtMoney(result.finalPrincipal)}</div></div>
          <div class="kpi c-teal"><div class="kpi-label">Total Interest</div><div class="kpi-value">${App.utils.fmtMoney(result.totalInterest)}</div></div>
          <div class="kpi c-blue"><div class="kpi-label">Cash Received</div><div class="kpi-value">${App.utils.fmtMoney(result.cashReceived)}</div></div>
          <div class="kpi c-purple"><div class="kpi-label">Annualized Return</div><div class="kpi-value">${App.utils.fmtPct(result.annualizedReturn)}</div></div>
        </div>
        <div class="stat-line"><span>Reinvestment Effect</span><span class="v">${App.utils.fmtMoney(result.reinvestmentEffect)}</span></div>
        <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-outline btn-sm" id="saveScenarioBtn">Save this scenario</button></div>`;
      App.utils.qs('#saveScenarioBtn', host).addEventListener('click', async () => {
        const name = prompt('Name this scenario:', `${values.scenario} - ${App.utils.fmtMoney(values.amount)}`);
        if (!name) return;
        await App.api.saveScenario({ scenario_name: name, scenario_type: values.scenario, inputs: result.inputs, outputs: result });
        App.utils.toast('Scenario saved');
        drawSaved();
      });
    });

    await drawSaved();
  }

  // -------------------------------------------------------------------------
  // 2. Monte Carlo Return Simulations (What-If 2.0)
  // -------------------------------------------------------------------------
  async function renderMonteCarloTab(host) {
    host.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-weight:700;color:var(--gold);font-size:16px">🎲 Monte Carlo Stochastic Wealth Engine (What-If 2.0)</div>
            <div style="font-size:12px;color:var(--text2)">Simulates 1,000+ stochastic market paths using Geometric Brownian Motion (GBM) with volatility shocks and inflation adjustments.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="mcPresets">
            <button class="ai-preset-chip" data-mc-preset="balanced" style="font-size:11px">⚖️ Balanced (12% / 10% σ)</button>
            <button class="ai-preset-chip" data-mc-preset="aggressive" style="font-size:11px">🚀 Aggressive (18% / 18% σ)</button>
            <button class="ai-preset-chip" data-mc-preset="conservative" style="font-size:11px">🛡️ Fixed Income (9% / 4% σ)</button>
            <button class="ai-preset-chip" data-mc-preset="recession" style="font-size:11px">⚡ Recession Stress (4% / 22% σ)</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px">
          <div class="field"><label>Initial Capital (₹)</label><input type="number" id="mcInitial" value="500000"></div>
          <div class="field"><label>Monthly SIP / Inflow (₹)</label><input type="number" id="mcMonthly" value="25000"></div>
          <div class="field"><label>Expected Annual Return (%)</label><input type="number" id="mcReturn" value="14" step="0.5"></div>
          <div class="field"><label>Annual Volatility σ (%)</label><input type="number" id="mcVol" value="12" step="0.5"></div>
          <div class="field"><label>Time Horizon (Years)</label><input type="number" id="mcYears" value="5" min="1" max="30"></div>
          <div class="field"><label>Annual Inflation (%)</label><input type="number" id="mcInflation" value="5.5" step="0.5"></div>
          <div class="field"><label>Financial Goal Target (₹)</label><input type="number" id="mcGoal" value="3500000"></div>
          <div class="field"><label>Simulation Iterations</label>
            <select class="search-input" id="mcIterations" style="width:100%">
              <option value="1000" selected>1,000 Paths (Fast)</option>
              <option value="5000">5,000 Paths (Standard)</option>
              <option value="10000">10,000 Paths (High Precision)</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center">
          <button class="btn btn-gold" id="btnRunMonteCarlo">⚡ Run Stochastic Simulation</button>
          <span style="font-size:12px;color:var(--text3)">Statistical sampling using Box-Muller log-normal distributions</span>
        </div>
      </div>

      <!-- Simulation Summary KPIs -->
      <div id="mcKpiContainer" style="margin-bottom:16px"></div>

      <!-- Chart Fan Graph -->
      <div class="chart-card" style="margin-bottom:16px">
        <div class="chart-header">
          <div>
            <div class="chart-title">Stochastic Trajectory Fan Chart (10th to 90th Percentiles)</div>
            <div class="chart-subtitle">Shows range of outcomes across varying market volatility conditions over time</div>
          </div>
        </div>
        <div class="chart-wrap tall"><canvas id="chMonteCarlo"></canvas></div>
      </div>

      <!-- Percentile Breakdown Table -->
      <div class="table-scroll">
        <div class="chart-title" style="margin-bottom:8px">Outcome Distribution Percentiles</div>
        <table class="data" id="mcPercentileTable"></table>
      </div>
    `;

    // Presets
    App.utils.qsa('[data-mc-preset]', host).forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.mcPreset;
        if (p === 'balanced') {
          App.utils.qs('#mcReturn', host).value = '12';
          App.utils.qs('#mcVol', host).value = '10';
        } else if (p === 'aggressive') {
          App.utils.qs('#mcReturn', host).value = '18';
          App.utils.qs('#mcVol', host).value = '18';
        } else if (p === 'conservative') {
          App.utils.qs('#mcReturn', host).value = '9';
          App.utils.qs('#mcVol', host).value = '4';
        } else if (p === 'recession') {
          App.utils.qs('#mcReturn', host).value = '4';
          App.utils.qs('#mcVol', host).value = '22';
        }
        runAndDrawMonteCarlo();
      });
    });

    App.utils.qs('#btnRunMonteCarlo', host)?.addEventListener('click', runAndDrawMonteCarlo);
  }

  function runAndDrawMonteCarlo() {
    const pane = App.utils.qs('#pane-whatif');
    if (!pane) return;

    const initial = parseFloat(App.utils.qs('#mcInitial', pane)?.value) || 500000;
    const monthly = parseFloat(App.utils.qs('#mcMonthly', pane)?.value) || 25000;
    const expectedReturn = parseFloat(App.utils.qs('#mcReturn', pane)?.value) || 14;
    const vol = parseFloat(App.utils.qs('#mcVol', pane)?.value) || 12;
    const years = parseFloat(App.utils.qs('#mcYears', pane)?.value) || 5;
    const inflation = parseFloat(App.utils.qs('#mcInflation', pane)?.value) || 5.5;
    const goal = parseFloat(App.utils.qs('#mcGoal', pane)?.value) || 3500000;
    const iterations = parseInt(App.utils.qs('#mcIterations', pane)?.value, 10) || 1000;

    const res = App.calc.runMonteCarlo({
      initialCapital: initial,
      monthlyContribution: monthly,
      expectedReturnPct: expectedReturn,
      volatilityPct: vol,
      years,
      iterations,
      inflationPct: inflation,
      targetGoal: goal
    });

    // Draw KPIs
    const kpiHost = App.utils.qs('#mcKpiContainer', pane);
    if (kpiHost) {
      const goalBadge = res.goalProbability !== null
        ? `<div class="kpi ${res.goalProbability >= 70 ? 'c-teal' : res.goalProbability >= 40 ? 'c-gold' : 'c-red'}">
            <div class="kpi-label">Goal Reach Probability (₹${(goal / 100000).toFixed(1)}L)</div>
            <div class="kpi-value">${res.goalProbability.toFixed(1)}%</div>
          </div>`
        : '';

      kpiHost.innerHTML = `
        <div class="grid-4">
          <div class="kpi c-blue"><div class="kpi-label">Total Capital Contributed</div><div class="kpi-value">${App.utils.fmtMoney(res.totalDeposited)}</div></div>
          <div class="kpi c-teal"><div class="kpi-label">Median Outcome (50th %ile)</div><div class="kpi-value">${App.utils.fmtMoney(res.medianFinal)}</div></div>
          <div class="kpi c-gold"><div class="kpi-label">Optimistic (90th %ile)</div><div class="kpi-value">${App.utils.fmtMoney(res.bestCase90th)}</div></div>
          <div class="kpi c-red"><div class="kpi-label">Conservative Stress (10th %ile)</div><div class="kpi-value">${App.utils.fmtMoney(res.worstCase10th)}</div></div>
        </div>
        <div class="grid-3" style="margin-top:12px">
          ${goalBadge}
          <div class="kpi c-purple">
            <div class="kpi-label">Value at Risk (VaR 95% Worst Case)</div>
            <div class="kpi-value">${App.utils.fmtMoney(res.var95Value)}</div>
          </div>
          <div class="kpi c-gold">
            <div class="kpi-label">Real Wealth Multiplier (Median)</div>
            <div class="kpi-value">${(res.medianFinal / (res.totalDeposited || 1)).toFixed(2)}x</div>
          </div>
        </div>
      `;
    }

    // Render Fan Chart with Chart.js
    const canvas = App.utils.qs('#chMonteCarlo', pane);
    if (canvas && window.Chart) {
      if (mcChartInstance) {
        mcChartInstance.destroy();
      }

      mcChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: res.timeLabels,
          datasets: [
            {
              label: '90th Percentile (Bull Case)',
              data: res.p90,
              borderColor: 'rgba(22, 201, 163, 0.9)',
              backgroundColor: 'rgba(22, 201, 163, 0.08)',
              borderWidth: 1.5,
              fill: false,
              tension: 0.25,
              pointRadius: 0
            },
            {
              label: '75th Percentile',
              data: res.p75,
              borderColor: 'rgba(76, 155, 232, 0.8)',
              backgroundColor: 'rgba(76, 155, 232, 0.12)',
              borderWidth: 1.5,
              fill: '-1',
              tension: 0.25,
              pointRadius: 0
            },
            {
              label: '50th Percentile (Median Expected)',
              data: res.p50,
              borderColor: '#c9a84c',
              backgroundColor: 'transparent',
              borderWidth: 3,
              tension: 0.25,
              pointRadius: 2,
              pointBackgroundColor: '#c9a84c'
            },
            {
              label: '25th Percentile',
              data: res.p25,
              borderColor: 'rgba(243, 156, 18, 0.7)',
              backgroundColor: 'rgba(243, 156, 18, 0.10)',
              borderWidth: 1.5,
              fill: '-2',
              tension: 0.25,
              pointRadius: 0
            },
            {
              label: '10th Percentile (Bear Case)',
              data: res.p10,
              borderColor: 'rgba(255, 107, 107, 0.9)',
              backgroundColor: 'rgba(255, 107, 107, 0.12)',
              borderWidth: 1.5,
              fill: '-1',
              tension: 0.25,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#8496ac', boxWidth: 12, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${App.utils.fmtMoney(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8496ac' } },
            y: {
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: {
                color: '#8496ac',
                callback: (v) => App.utils.fmtMoney(v)
              }
            }
          }
        }
      });
    }

    // Render Table
    const tbl = App.utils.qs('#mcPercentileTable', pane);
    if (tbl) {
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>Scenario Metric</th>
            <th>1-Year Value</th>
            <th>3-Year Value</th>
            <th>Final Target Horizon (${years}Y)</th>
            <th>Real Annualized CAGR</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b style="color:var(--teal)">90th %ile (Top 10% Bull Outcome)</b></td>
            <td>${App.utils.fmtMoney(res.p90[Math.min(4, res.p90.length - 1)])}</td>
            <td>${App.utils.fmtMoney(res.p90[Math.min(12, res.p90.length - 1)])}</td>
            <td><b style="color:var(--teal)">${App.utils.fmtMoney(res.bestCase90th)}</b></td>
            <td>${(((Math.pow(res.bestCase90th / (res.totalDeposited || 1), 1 / years) - 1) * 100) + inflation).toFixed(1)}%</td>
          </tr>
          <tr>
            <td><b style="color:var(--gold)">50th %ile (Median Expected Trajectory)</b></td>
            <td>${App.utils.fmtMoney(res.p50[Math.min(4, res.p50.length - 1)])}</td>
            <td>${App.utils.fmtMoney(res.p50[Math.min(12, res.p50.length - 1)])}</td>
            <td><b style="color:var(--gold)">${App.utils.fmtMoney(res.medianFinal)}</b></td>
            <td>${(((Math.pow(res.medianFinal / (res.totalDeposited || 1), 1 / years) - 1) * 100) + inflation).toFixed(1)}%</td>
          </tr>
          <tr>
            <td><b style="color:var(--red)">10th %ile (Bottom 10% Downside Stress)</b></td>
            <td>${App.utils.fmtMoney(res.p10[Math.min(4, res.p10.length - 1)])}</td>
            <td>${App.utils.fmtMoney(res.p10[Math.min(12, res.p10.length - 1)])}</td>
            <td><b style="color:var(--red)">${App.utils.fmtMoney(res.worstCase10th)}</b></td>
            <td>${(((Math.pow(Math.max(1, res.worstCase10th) / (res.totalDeposited || 1), 1 / years) - 1) * 100) + inflation).toFixed(1)}%</td>
          </tr>
        </tbody>
      `;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Compare Deals Tab
  // -------------------------------------------------------------------------
  async function renderCompareTab(host) {
    const [deals, metrics] = await Promise.all([App.api.listDeals(), App.api.listDealMetrics()]);
    const metricsById = {}; metrics.forEach((m) => { metricsById[m.deal_id] = m; });
    host.innerHTML = `
      <div class="hint" style="margin-bottom:10px">Select two or more deals to compare side by side.</div>
      <select multiple class="search-input" id="cmpSelect" style="height:120px;width:100%;margin-bottom:12px">
        ${deals.map((d) => `<option value="${d.id}">${App.utils.escapeHtml(d.deal_name)} — ${App.utils.fmtMoney(d.invested_amount)}</option>`).join('')}
      </select>
      <div style="margin-bottom:12px">
        <label class="hint">Sort by </label>
        <select class="search-input" id="cmpSort" style="width:auto">
          <option value="roi">ROI</option><option value="expectedIncome">Expected Income</option><option value="tenureMonths">Tenure</option>
          <option value="risk">Risk</option><option value="maturity">Maturity</option><option value="reliability">Reliability</option>
        </select>
      </div>
      <div class="table-scroll"><table class="data" id="cmpTable"></table></div>`;

    function draw() {
      const selectedIds = App.utils.qsa('option:checked', App.utils.qs('#cmpSelect', host)).map((o) => Number(o.value));
      const sortKey = App.utils.qs('#cmpSort', host).value;
      const pairs = selectedIds.map((id) => ({ deal: deals.find((d) => d.id === id), metrics: metricsById[id] }));
      const rows = App.calc.compareDeals(pairs).sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0) || String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')));
      App.utils.qs('#cmpTable', host).innerHTML = `<thead><tr><th>Deal</th><th>Amount</th><th>ROI</th><th>Tenure</th><th>Frequency</th><th>Expected Income</th><th>Risk</th><th>Reliability</th><th>Maturity</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${App.utils.escapeHtml(r.name)}</td><td>${App.utils.fmtMoney(r.amount)}</td><td>${App.utils.fmtPct(r.roi)}</td><td>${r.tenureMonths ?? '—'}mo</td><td>${r.frequency}</td><td>${App.utils.fmtMoney(r.expectedIncome)}</td><td>${r.risk || '—'}</td><td>${App.utils.fmtPct(r.reliability, 0)}</td><td>${App.utils.fmtDate(r.maturity)}</td></tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:16px">Select deals above to compare.</td></tr>'}</tbody>`;
    }
    App.utils.qs('#cmpSelect', host).addEventListener('change', draw);
    App.utils.qs('#cmpSort', host).addEventListener('change', draw);
    draw();
  }

  App.router.register('whatif', renderWhatIfView);
})();
