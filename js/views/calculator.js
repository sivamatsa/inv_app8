/* Financial Quantitative Calculators Suite:
   1. Interest Calculator (Monthly & Yearly simple vs compound)
   2. Loan EMI Calculator (Amortization schedule)
   3. Sharpe & Sortino Ratio Calculator (Risk-adjusted return metrics)
   4. Asset Allocation & Rebalancing Drift Advisor (Target vs Current drift triggers)
   5. Tax Bracket & Capital Gains Estimator (FY 24-25/25-26 New vs Old, STCG/LTCG, Advance tax)
   6. Waterfall & Multi-Tier Return Distribution (PE/Syndicate 4-tier waterfall with IRR/MOIC)
   7. Multi-Currency Auto-Conversion Engine (Live exchange rates & converter)
*/
window.App = window.App || {};

(function () {
  const TABS = [
    { key: 'tape', label: '🧮 Excel & Tape Scratchpad' },
    { key: 'interest', label: 'Interest Calculator' },
    { key: 'emi', label: 'EMI Calculator' },
    { key: 'sharpe', label: '📈 Sharpe & Sortino' },
    { key: 'rebalancing', label: '⚖️ Allocation & Drift' },
    { key: 'tax', label: '🧾 Tax & Capital Gains' },
    { key: 'waterfall', label: '🌊 Waterfall Returns' },
    { key: 'currency', label: '💱 Multi-Currency' },
  ];

  const QUICK_AMOUNTS = [10000, 25000, 50000, 100000, 200000, 500000, 1000000];
  const QUICK_MONTHS = [2, 5, 6, 7, 8, 10, 11];
  const QUICK_MONTHLY_RATES = [1.4, 1.5, 1.6, 1.65, 1.7, 1.75, 1.8, 1.9, 1.9999, 2, 2.1];
  const QUICK_YEARS = [1, 2, 3, 5, 7, 10, 15, 20];
  const QUICK_ANNUAL_RATES = [6, 7, 8, 9, 10, 12, 15, 18, 20, 24];

  const QUICK_LOAN_AMOUNTS = [100000, 300000, 500000, 1000000, 2000000, 5000000];
  const QUICK_LOAN_YEARS = [1, 2, 3, 5, 10, 15, 20, 30];
  const QUICK_LOAN_RATES = [7, 7.5, 8, 8.5, 9, 9.5, 10, 11, 12];

  let state = { tab: 'interest', mode: 'monthly' };

  function computePeriodBreakdown(principal, ratePct, periods) {
    const r = ratePct / 100;
    const simpleInterestPerPeriod = principal * r;
    let compoundBalance = principal;
    const rows = [];
    let cumulativeSimple = 0;
    for (let p = 1; p <= periods; p++) {
      cumulativeSimple += simpleInterestPerPeriod;
      const compoundInterestThisPeriod = compoundBalance * r;
      compoundBalance += compoundInterestThisPeriod;
      rows.push({
        period: p,
        simpleInterest: simpleInterestPerPeriod,
        cumulativeSimpleInterest: cumulativeSimple,
        simpleBalance: principal + cumulativeSimple,
        compoundInterest: compoundInterestThisPeriod,
        cumulativeCompoundInterest: compoundBalance - principal,
        compoundBalance,
      });
    }
    const totalSimpleInterest = simpleInterestPerPeriod * periods;
    const totalCompoundInterest = compoundBalance - principal;
    return {
      rows,
      simpleInterestPerPeriod,
      totalSimpleInterest,
      maturitySimple: principal + totalSimpleInterest,
      totalCompoundInterest,
      maturityCompound: compoundBalance,
      compoundingEffect: totalCompoundInterest - totalSimpleInterest,
    };
  }

  function computeEmi(principal, annualRatePct, months) {
    const r = annualRatePct / 12 / 100;
    const emi = r === 0 ? principal / months : principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
    const totalPayment = emi * months;
    const totalInterest = totalPayment - principal;
    let balance = principal;
    const rows = [];
    for (let m = 1; m <= months; m++) {
      const interestComponent = balance * r;
      const principalComponent = emi - interestComponent;
      balance = Math.max(0, balance - principalComponent);
      rows.push({ month: m, emi, interestComponent, principalComponent, balance });
    }
    return { emi, totalPayment, totalInterest, rows };
  }

  async function renderCalculatorView() {
    const pane = App.utils.qs('#pane-calculator');
    pane.innerHTML = `
      <div class="section-title">Quantitative Financial Engines <div class="line"></div><small>institutional modeling, risk ratios, tax optimization, and currency engines</small></div>
      <div class="chip-row" id="calcTabRow" style="margin-bottom:16px;overflow-x:auto;padding-bottom:4px">
        ${TABS.map((t) => `<div class="chip ${t.key === state.tab ? 'active' : ''}" data-calc-tab="${t.key}">${t.label}</div>`).join('')}
      </div>
      <div id="calcTabHost"></div>`;

    App.utils.qsa('[data-calc-tab]', pane).forEach((chip) => chip.addEventListener('click', () => {
      state.tab = chip.dataset.calcTab;
      App.utils.qsa('[data-calc-tab]', pane).forEach((c) => c.classList.toggle('active', c === chip));
      drawTab();
    }));

    async function drawTab() {
      const host = App.utils.qs('#calcTabHost', pane);
      if (state.tab === 'tape') await drawTapeTab(host);
      else if (state.tab === 'interest') await drawInterestTab(host);
      else if (state.tab === 'emi') await drawEmiTab(host);
      else if (state.tab === 'sharpe') await drawSharpeTab(host);
      else if (state.tab === 'rebalancing') await drawRebalancingTab(host);
      else if (state.tab === 'tax') await drawTaxTab(host);
      else if (state.tab === 'waterfall') await drawWaterfallTab(host);
      else if (state.tab === 'currency') await drawCurrencyTab(host);
    }

    // -----------------------------------------------------------------------
    // 0. Interactive Excel & Tape Scratchpad
    // -----------------------------------------------------------------------
    async function drawTapeTab(host) {
      host.innerHTML = `<div id="tapeScratchpadContainer"></div>`;
      if (App.tapeCalculator) {
        App.tapeCalculator.render(App.utils.qs('#tapeScratchpadContainer', host));
      }
    }

    // -----------------------------------------------------------------------
    // 1. Interest Tab
    // -----------------------------------------------------------------------
    async function drawInterestTab(host) {
      const isMonthly = state.mode === 'monthly';
      host.innerHTML = `
        <div class="panel">
          <div class="field" style="margin-bottom:12px">
            <label>Calculate by</label>
            <div style="display:flex;gap:18px;margin-top:4px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                <input type="radio" name="calcMode" value="monthly" ${isMonthly ? 'checked' : ''}> Monthly (months + monthly rate)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                <input type="radio" name="calcMode" value="yearly" ${!isMonthly ? 'checked' : ''}> Yearly (years + annual rate)
              </label>
            </div>
          </div>
          <div class="form-grid">
            <div class="field"><label>Principal Amount</label><input type="number" id="calcAmount" value="50000"></div>
            <div class="field"><label>${isMonthly ? 'Number of Months' : 'Number of Years'}</label><input type="number" step="1" id="calcPeriods" value="${isMonthly ? 6 : 1}"></div>
            <div class="field"><label>${isMonthly ? 'Monthly' : 'Annual'} Interest Rate %</label><input type="number" step="any" id="calcRate" value="${isMonthly ? 1.75 : 12}"></div>
            <div class="field"><label>&nbsp;</label><button class="btn btn-gold" id="calcRunBtn">Calculate</button></div>
          </div>
          <div class="hint" style="margin-bottom:6px">Common amounts</div>
          <div class="chip-row" id="quickAmounts" style="margin-bottom:12px">${QUICK_AMOUNTS.map((a) => `<div class="chip" data-amt="${a}">${App.utils.fmtMoney(a)}</div>`).join('')}</div>
          <div class="hint" style="margin-bottom:6px">Common ${isMonthly ? 'months' : 'years'}</div>
          <div class="chip-row" id="quickPeriods" style="margin-bottom:12px">${(isMonthly ? QUICK_MONTHS : QUICK_YEARS).map((p) => `<div class="chip" data-period="${p}">${p}${isMonthly ? 'mo' : 'yr'}</div>`).join('')}</div>
          <div class="hint" style="margin-bottom:6px">Common ${isMonthly ? 'monthly' : 'annual'} rates</div>
          <div class="chip-row" id="quickRates">${(isMonthly ? QUICK_MONTHLY_RATES : QUICK_ANNUAL_RATES).map((r) => `<div class="chip" data-rate="${r}">${r}%</div>`).join('')}</div>
        </div>
        <div id="calcResult"></div>`;

      App.utils.qsa('input[name="calcMode"]', host).forEach((r) => r.addEventListener('change', (e) => {
        state.mode = e.target.value;
        drawInterestTab(host);
      }));

      function bindQuickChips() {
        App.utils.qsa('[data-amt]', host).forEach((c) => c.addEventListener('click', () => {
          App.utils.qs('#calcAmount', host).value = c.dataset.amt;
          App.utils.qsa('[data-amt]', host).forEach((x) => x.classList.toggle('active', x === c));
          run();
        }));
        App.utils.qsa('[data-period]', host).forEach((c) => c.addEventListener('click', () => {
          App.utils.qs('#calcPeriods', host).value = c.dataset.period;
          App.utils.qsa('[data-period]', host).forEach((x) => x.classList.toggle('active', x === c));
          run();
        }));
        App.utils.qsa('[data-rate]', host).forEach((c) => c.addEventListener('click', () => {
          App.utils.qs('#calcRate', host).value = c.dataset.rate;
          App.utils.qsa('[data-rate]', host).forEach((x) => x.classList.toggle('active', x === c));
          run();
        }));
      }

      async function run() {
        const principal = App.utils.parseNum(App.utils.qs('#calcAmount', host).value) || 0;
        const periods = Math.max(0, Math.round(App.utils.parseNum(App.utils.qs('#calcPeriods', host).value) || 0));
        const rate = App.utils.parseNum(App.utils.qs('#calcRate', host).value) || 0;
        const b = computePeriodBreakdown(principal, rate, periods);
        const unit = isMonthly ? 'month' : 'year';
        const unitCap = isMonthly ? 'Month' : 'Year';

        const breakdownRows = b.rows.map((r) => `<tr>
          <td>${r.period}</td>
          <td>${App.utils.fmtMoney(r.simpleInterest)}</td>
          <td>${App.utils.fmtMoney(r.cumulativeSimpleInterest)}</td>
          <td>${App.utils.fmtMoney(r.simpleBalance)}</td>
          <td>${App.utils.fmtMoney(r.compoundInterest)}</td>
          <td>${App.utils.fmtMoney(r.compoundBalance)}</td>
          <td>${App.utils.fmtMoney(r.cumulativeCompoundInterest - r.cumulativeSimpleInterest)}</td>
        </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:14px">Enter a number of ${unit}s above.</td></tr>`;

        App.utils.qs('#calcResult', host).innerHTML = `
          <div class="grid-4">
            <div class="kpi c-gold"><div class="kpi-label">Interest / ${unitCap} (simple)</div><div class="kpi-value">${App.utils.fmtMoney(b.simpleInterestPerPeriod)}</div></div>
            <div class="kpi c-blue"><div class="kpi-label">Total Interest (${periods}${isMonthly ? 'mo' : 'yr'}, simple)</div><div class="kpi-value">${App.utils.fmtMoney(b.totalSimpleInterest)}</div></div>
            <div class="kpi c-teal"><div class="kpi-label">Maturity Value (simple)</div><div class="kpi-value">${App.utils.fmtMoney(b.maturitySimple)}</div></div>
            <div class="kpi c-purple"><div class="kpi-label">Maturity Value (compounded ${unit}ly)</div><div class="kpi-value">${App.utils.fmtMoney(b.maturityCompound)}</div></div>
          </div>
          <div class="panel">
            <div class="stat-line"><span>Total Interest (compounded ${unit}ly)</span><span class="v">${App.utils.fmtMoney(b.totalCompoundInterest)}</span></div>
            <div class="stat-line"><span>Compounding Effect (compound − simple, over ${periods} ${unit}${periods === 1 ? '' : 's'})</span><span class="v">${App.utils.fmtMoney(b.compoundingEffect)}</span></div>
          </div>
          <div class="panel">
            <div class="hint" style="margin-bottom:8px">${unitCap}-by-${unit} breakdown - Simple vs Compound</div>
            <div class="table-scroll" style="max-height:360px">
              <table class="data">
                <thead><tr>
                  <th>${unitCap}</th><th>Interest This ${unitCap} (simple)</th><th>Cumulative Interest (simple)</th><th>Balance (simple)</th>
                  <th>Interest This ${unitCap} (compound)</th><th>Balance (compound)</th><th>Difference So Far</th>
                </tr></thead>
                <tbody>${breakdownRows}</tbody>
              </table>
            </div>
          </div>`;
      }

      bindQuickChips();
      App.utils.qs('#calcRunBtn', host).addEventListener('click', run);
      await run();
    }

    // -----------------------------------------------------------------------
    // 2. EMI Tab
    // -----------------------------------------------------------------------
    async function drawEmiTab(host) {
      host.innerHTML = `
        <div class="panel">
          <div class="form-grid">
            <div class="field"><label>Loan Amount</label><input type="number" id="emiAmount" value="1000000"></div>
            <div class="field"><label>Tenure (Years)</label><input type="number" step="any" id="emiYears" value="5"></div>
            <div class="field"><label>Annual Interest Rate %</label><input type="number" step="any" id="emiRate" value="9"></div>
            <div class="field"><label>&nbsp;</label><button class="btn btn-gold" id="emiRunBtn">Calculate</button></div>
          </div>
          <div class="hint" style="margin-bottom:6px">Common loan amounts</div>
          <div class="chip-row" id="emiQuickAmounts" style="margin-bottom:12px">${QUICK_LOAN_AMOUNTS.map((a) => `<div class="chip" data-eamt="${a}">${App.utils.fmtMoney(a)}</div>`).join('')}</div>
          <div class="hint" style="margin-bottom:6px">Common tenures</div>
          <div class="chip-row" id="emiQuickYears" style="margin-bottom:12px">${QUICK_LOAN_YEARS.map((y) => `<div class="chip" data-eyears="${y}">${y}yr</div>`).join('')}</div>
          <div class="hint" style="margin-bottom:6px">Common rates</div>
          <div class="chip-row" id="emiQuickRates">${QUICK_LOAN_RATES.map((r) => `<div class="chip" data-erate="${r}">${r}%</div>`).join('')}</div>
        </div>
        <div id="emiResult"></div>`;

      App.utils.qsa('[data-eamt]', host).forEach((c) => c.addEventListener('click', () => {
        App.utils.qs('#emiAmount', host).value = c.dataset.eamt;
        App.utils.qsa('[data-eamt]', host).forEach((x) => x.classList.toggle('active', x === c));
        runEmi();
      }));
      App.utils.qsa('[data-eyears]', host).forEach((c) => c.addEventListener('click', () => {
        App.utils.qs('#emiYears', host).value = c.dataset.eyears;
        App.utils.qsa('[data-eyears]', host).forEach((x) => x.classList.toggle('active', x === c));
        runEmi();
      }));
      App.utils.qsa('[data-erate]', host).forEach((c) => c.addEventListener('click', () => {
        App.utils.qs('#emiRate', host).value = c.dataset.erate;
        App.utils.qsa('[data-erate]', host).forEach((x) => x.classList.toggle('active', x === c));
        runEmi();
      }));

      function runEmi() {
        const principal = App.utils.parseNum(App.utils.qs('#emiAmount', host).value) || 0;
        const years = App.utils.parseNum(App.utils.qs('#emiYears', host).value) || 0;
        const rate = App.utils.parseNum(App.utils.qs('#emiRate', host).value) || 0;
        const months = Math.max(0, Math.round(years * 12));
        if (!principal || !months) {
          App.utils.qs('#emiResult', host).innerHTML = '<div class="empty-note">Enter a loan amount and tenure above.</div>';
          return;
        }
        const e = computeEmi(principal, rate, months);
        const rows = e.rows.map((r) => `<tr>
          <td>${r.month}</td>
          <td>${App.utils.fmtMoney(r.emi)}</td>
          <td>${App.utils.fmtMoney(r.principalComponent)}</td>
          <td>${App.utils.fmtMoney(r.interestComponent)}</td>
          <td>${App.utils.fmtMoney(r.balance)}</td>
        </tr>`).join('');

        App.utils.qs('#emiResult', host).innerHTML = `
          <div class="grid-3">
            <div class="kpi c-gold"><div class="kpi-label">Monthly EMI</div><div class="kpi-value">${App.utils.fmtMoney(e.emi)}</div></div>
            <div class="kpi c-blue"><div class="kpi-label">Total Interest</div><div class="kpi-value">${App.utils.fmtMoney(e.totalInterest)}</div></div>
            <div class="kpi c-teal"><div class="kpi-label">Total Payment</div><div class="kpi-value">${App.utils.fmtMoney(e.totalPayment)}</div></div>
          </div>
          <div class="panel">
            <div class="hint" style="margin-bottom:8px">Amortization Schedule (${months} months)</div>
            <div class="table-scroll" style="max-height:360px">
              <table class="data">
                <thead><tr><th>Month</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      }

      App.utils.qs('#emiRunBtn', host).addEventListener('click', runEmi);
      runEmi();
    }

    // -----------------------------------------------------------------------
    // 3. Sharpe & Sortino Ratio Calculator
    // -----------------------------------------------------------------------
    async function drawSharpeTab(host) {
      const deals = await App.api.listDeals({ eq: { status: 'ACTIVE' } });
      const dealReturns = deals.filter((d) => d.annual_roi != null).map((d) => Number(d.annual_roi));

      host.innerHTML = `
        <div class="panel">
          <div style="font-weight:700;color:var(--gold);font-size:15px;margin-bottom:6px">📈 Modern Portfolio Theory: Sharpe &amp; Sortino Ratios</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:14px">
            Quantifies risk-adjusted excess returns. Sharpe divides by total volatility (&sigma;), while Sortino penalizes only downside volatility below your target threshold.
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">
            <div class="field">
              <label>Risk-Free Rate R<sub>f</sub> (% p.a.)</label>
              <input type="number" id="sharpeRf" value="6.5" step="0.1">
              <small class="hint">RBI Repo / 10Y T-Bill Benchmark</small>
            </div>
            <div class="field">
              <label>Target Minimum Acceptable Return (MAR %)</label>
              <input type="number" id="sharpeTarget" value="7.5" step="0.1">
              <small class="hint">Threshold for Sortino downside filter</small>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Annual Returns Sample (% comma separated or load from active deals)</label>
              <div style="display:flex;gap:8px;margin-bottom:6px">
                <input type="text" id="sharpeReturnsInput" value="${dealReturns.length ? dealReturns.join(', ') : '12, 14, 18, 9, 15, 21, 11, 16'}" style="flex:1">
                <button class="btn btn-outline btn-sm" id="btnLoadPortfolioReturns">Load Active Deals (${dealReturns.length})</button>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px">
            <button class="btn btn-gold" id="btnCalcSharpe">Compute Risk Ratios</button>
          </div>
        </div>
        <div id="sharpeResult"></div>
      `;

      App.utils.qs('#btnLoadPortfolioReturns', host)?.addEventListener('click', () => {
        if (dealReturns.length) {
          App.utils.qs('#sharpeReturnsInput', host).value = dealReturns.join(', ');
          runSharpe();
        } else {
          App.utils.toast('No active deals with recorded ROI found.', 'err');
        }
      });

      function runSharpe() {
        const rf = parseFloat(App.utils.qs('#sharpeRf', host)?.value) || 6.5;
        const target = parseFloat(App.utils.qs('#sharpeTarget', host)?.value) || 7.5;
        const rawArr = (App.utils.qs('#sharpeReturnsInput', host)?.value || '')
          .split(',')
          .map((s) => parseFloat(s.trim()))
          .filter((n) => !isNaN(n));

        if (rawArr.length < 2) {
          App.utils.toast('Enter at least 2 return data points.', 'err');
          return;
        }

        const res = App.calc.computeRatios(rawArr, rf, target);

        const sharpeGrade = res.sharpeRatio >= 2.0 ? 'Exceptional' : res.sharpeRatio >= 1.0 ? 'Good / Institutional' : res.sharpeRatio >= 0 ? 'Sub-Optimal' : 'Negative Excess Return';
        const sortinoGrade = res.sortinoRatio >= 2.5 ? 'Exceptional Downside Protection' : res.sortinoRatio >= 1.2 ? 'Solid Downside Risk Profile' : 'High Downside Exposure';

        App.utils.qs('#sharpeResult', host).innerHTML = `
          <div class="grid-4" style="margin-top:16px">
            <div class="kpi c-gold">
              <div class="kpi-label">Sharpe Ratio (Total Volatility)</div>
              <div class="kpi-value">${res.sharpeRatio.toFixed(2)}</div>
            </div>
            <div class="kpi c-teal">
              <div class="kpi-label">Sortino Ratio (Downside Only)</div>
              <div class="kpi-value">${res.sortinoRatio.toFixed(2)}</div>
            </div>
            <div class="kpi c-blue">
              <div class="kpi-label">Mean Annual Return (&mu;)</div>
              <div class="kpi-value">${App.utils.fmtPct(res.meanReturn)}</div>
            </div>
            <div class="kpi c-purple">
              <div class="kpi-label">Total Portfolio Volatility (&sigma;)</div>
              <div class="kpi-value">${App.utils.fmtPct(res.volatility)}</div>
            </div>
          </div>

          <div class="grid-3" style="margin-top:12px">
            <div class="kpi c-red">
              <div class="kpi-label">Downside Semi-Deviation (&sigma;<sub>d</sub>)</div>
              <div class="kpi-value">${App.utils.fmtPct(res.downsideDeviation)}</div>
            </div>
            <div class="kpi c-gold">
              <div class="kpi-label">Calmar Ratio (Return / Max DD)</div>
              <div class="kpi-value">${res.calmarRatio.toFixed(2)}</div>
            </div>
            <div class="kpi c-purple">
              <div class="kpi-label">Maximum Historic Drawdown</div>
              <div class="kpi-value">${App.utils.fmtPct(res.maxDrawdown)}</div>
            </div>
          </div>

          <div class="panel" style="margin-top:12px">
            <div class="stat-line"><span>Sharpe Verdict</span><span class="v" style="color:var(--gold)">${sharpeGrade}</span></div>
            <div class="stat-line"><span>Sortino Verdict</span><span class="v" style="color:var(--teal)">${sortinoGrade}</span></div>
            <div class="hint" style="margin-top:8px">
              <b>Interpretation:</b> A Sharpe ratio > 1.0 indicates that excess return adequately compensates for total volatility. Sortino ratio ignores upside surges and penalizes only negative variance below ${target}%, making it the preferred metric for asymmetric fixed-income and P2P investments.
            </div>
          </div>
        `;
      }

      App.utils.qs('#btnCalcSharpe', host)?.addEventListener('click', runSharpe);
      runSharpe();
    }

    // -----------------------------------------------------------------------
    // 4. Asset Allocation & Rebalancing Drift Advisor
    // -----------------------------------------------------------------------
    async function drawRebalancingTab(host) {
      const deals = await App.api.listDeals({ eq: { status: 'ACTIVE' } });
      let p2pVal = 0, fixedIncVal = 0, goldVal = 0, equityVal = 0, alternateVal = 0;

      deals.forEach((d) => {
        const amt = d.current_principal || 0;
        const type = (d.investment_type || '').toUpperCase();
        if (type.includes('P2P') || type.includes('PEER')) p2pVal += amt;
        else if (type.includes('GOLD') || type.includes('PRECIOUS')) goldVal += amt;
        else if (type.includes('EQUITY') || type.includes('MF') || type.includes('STOCK')) equityVal += amt;
        else if (type.includes('REAL') || type.includes('ALT')) alternateVal += amt;
        else fixedIncVal += amt;
      });

      // Default fallback values if portfolio empty
      if (fixedIncVal + p2pVal + goldVal + equityVal + alternateVal === 0) {
        fixedIncVal = 500000; p2pVal = 250000; goldVal = 150000; equityVal = 300000; alternateVal = 100000;
      }

      host.innerHTML = `
        <div class="panel">
          <div style="font-weight:700;color:var(--gold);font-size:15px;margin-bottom:6px">⚖️ Asset Allocation &amp; Portfolio Drift Advisor</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:14px">
            Establishes target asset allocation weights, detects percentage &amp; absolute drift triggers, and auto-generates minimal-friction rebalancing trade orders.
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px">
            <div class="field">
              <label>Rebalance Trigger Threshold (&plusmn;%)</label>
              <input type="number" id="rebThreshold" value="5" min="1" max="25">
            </div>
            <div class="field">
              <label>Available Fresh Cash for Inflow (₹)</label>
              <input type="number" id="rebCash" value="100000">
            </div>
          </div>

          <div class="hint" style="margin-bottom:8px"><b>Target Allocation Model vs Current Portfolio Holdings</b></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px">
            <div class="field"><label>Fixed Income / FDs (Target %)</label><input type="number" id="tgt_fixed" value="35"></div>
            <div class="field"><label>Fixed Income Current (₹)</label><input type="number" id="cur_fixed" value="${fixedIncVal}"></div>
            <div class="field"><label>P2P Lending (Target %)</label><input type="number" id="tgt_p2p" value="20"></div>
            <div class="field"><label>P2P Lending Current (₹)</label><input type="number" id="cur_p2p" value="${p2pVal}"></div>
            <div class="field"><label>Gold &amp; Precious Metals (Target %)</label><input type="number" id="tgt_gold" value="15"></div>
            <div class="field"><label>Gold Current (₹)</label><input type="number" id="cur_gold" value="${goldVal}"></div>
            <div class="field"><label>Equity &amp; Mutual Funds (Target %)</label><input type="number" id="tgt_equity" value="20"></div>
            <div class="field"><label>Equity Current (₹)</label><input type="number" id="cur_equity" value="${equityVal}"></div>
            <div class="field"><label>Alternate &amp; Real Estate (Target %)</label><input type="number" id="tgt_alt" value="10"></div>
            <div class="field"><label>Alternate Current (₹)</label><input type="number" id="cur_alt" value="${alternateVal}"></div>
          </div>

          <button class="btn btn-gold" id="btnRunRebalancing">Calculate Drift &amp; Rebalance Plan</button>
        </div>
        <div id="rebalancingResult"></div>
      `;

      function runRebalance() {
        const threshold = parseFloat(App.utils.qs('#rebThreshold', host)?.value) || 5;
        const freshCash = parseFloat(App.utils.qs('#rebCash', host)?.value) || 0;

        const currentHoldings = {
          'Fixed Income / Bonds': parseFloat(App.utils.qs('#cur_fixed', host)?.value) || 0,
          'P2P Lending': parseFloat(App.utils.qs('#cur_p2p', host)?.value) || 0,
          'Gold & Precious Metals': parseFloat(App.utils.qs('#cur_gold', host)?.value) || 0,
          'Equity & Mutual Funds': parseFloat(App.utils.qs('#cur_equity', host)?.value) || 0,
          'Alternate & Real Estate': parseFloat(App.utils.qs('#cur_alt', host)?.value) || 0,
        };

        const targetAllocations = {
          'Fixed Income / Bonds': parseFloat(App.utils.qs('#tgt_fixed', host)?.value) || 35,
          'P2P Lending': parseFloat(App.utils.qs('#tgt_p2p', host)?.value) || 20,
          'Gold & Precious Metals': parseFloat(App.utils.qs('#tgt_gold', host)?.value) || 15,
          'Equity & Mutual Funds': parseFloat(App.utils.qs('#tgt_equity', host)?.value) || 20,
          'Alternate & Real Estate': parseFloat(App.utils.qs('#tgt_alt', host)?.value) || 10,
        };

        const res = App.calc.computeRebalancing(currentHoldings, targetAllocations, freshCash, threshold);

        App.utils.qs('#rebalancingResult', host).innerHTML = `
          <div class="grid-3" style="margin-top:16px">
            <div class="kpi c-blue"><div class="kpi-label">Total Portfolio Net Worth</div><div class="kpi-value">${App.utils.fmtMoney(res.totalPortfolioVal)}</div></div>
            <div class="kpi ${res.rebalanceRequired ? 'c-red' : 'c-teal'}">
              <div class="kpi-label">Rebalance Action Triggered?</div>
              <div class="kpi-value">${res.rebalanceRequired ? '⚠️ YES (Threshold Breached)' : '✅ NO (Within Bands)'}</div>
            </div>
            <div class="kpi c-gold"><div class="kpi-label">Average Absolute Drift</div><div class="kpi-value">&plusmn;${res.totalDrift.toFixed(1)}%</div></div>
          </div>

          <div class="panel" style="margin-top:14px">
            <div class="chart-title" style="margin-bottom:8px">Asset Drift Breakdown &amp; Suggested Trade Execution</div>
            <div class="table-scroll">
              <table class="data">
                <thead>
                  <tr>
                    <th>Asset Category</th>
                    <th>Current Value</th>
                    <th>Current %</th>
                    <th>Target %</th>
                    <th>Drift %</th>
                    <th>Target Value</th>
                    <th>Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${res.rows.map((r) => `
                    <tr>
                      <td><b>${r.category}</b></td>
                      <td>${App.utils.fmtMoney(r.currentAmt)}</td>
                      <td>${r.currentPct.toFixed(1)}%</td>
                      <td>${r.targetPct.toFixed(1)}%</td>
                      <td style="color:${Math.abs(r.driftPct) >= threshold ? 'var(--red)' : 'var(--text)'};font-weight:bold">
                        ${r.driftPct > 0 ? '+' : ''}${r.driftPct.toFixed(1)}%
                      </td>
                      <td>${App.utils.fmtMoney(r.targetAmt)}</td>
                      <td>
                        <span class="status-badge" style="background:${r.adjustmentAmt > 50 ? 'rgba(22,201,163,0.15)' : r.adjustmentAmt < -50 ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.08)'};color:${r.adjustmentAmt > 50 ? 'var(--teal)' : r.adjustmentAmt < -50 ? 'var(--red)' : 'var(--text2)'}">
                          ${r.adjustmentAmt > 50 ? `+ Invest ${App.utils.fmtMoney(r.adjustmentAmt)}` : r.adjustmentAmt < -50 ? `- Trim ${App.utils.fmtMoney(-r.adjustmentAmt)}` : 'Hold / In-Band'}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      App.utils.qs('#btnRunRebalancing', host)?.addEventListener('click', runRebalance);
      runRebalance();
    }

    // -----------------------------------------------------------------------
    // 5. Tax Bracket & Capital Gains Estimator
    // -----------------------------------------------------------------------
    async function drawTaxTab(host) {
      host.innerHTML = `
        <div class="panel">
          <div style="font-weight:700;color:var(--gold);font-size:15px;margin-bottom:6px">🧾 Tax Bracket &amp; Capital Gains Estimator (FY 2024-25 / FY 2025-26)</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:14px">
            Computes income tax under New vs Old regimes, including Budget 2024 revised STCG (20%) and LTCG (12.5% > ₹1.25L exemption), Section 87A rebate, standard deduction, and Advance Tax calendar.
          </div>

          <div style="display:flex;gap:18px;margin-bottom:14px">
            <label style="cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px">
              <input type="radio" name="taxRegime" value="NEW" checked> New Tax Regime (Budget 2024/2025 Revised Slabs &amp; ₹75k Std Ded)
            </label>
            <label style="cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px">
              <input type="radio" name="taxRegime" value="OLD"> Old Tax Regime (With 80C/80D Deductions)
            </label>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">
            <div class="field"><label>Annual Salary / Business Income (₹)</label><input type="number" id="taxSalary" value="1200000"></div>
            <div class="field"><label>Interest Income from P2P &amp; FDs (₹)</label><input type="number" id="taxInterest" value="180000"></div>
            <div class="field"><label>Other Income (₹)</label><input type="number" id="taxOther" value="0"></div>
            <div class="field"><label>Equity STCG (< 12mo @ 20%) (₹)</label><input type="number" id="taxEqSTCG" value="60000"></div>
            <div class="field"><label>Equity LTCG (> 12mo @ 12.5%) (₹)</label><input type="number" id="taxEqLTCG" value="250000"></div>
            <div class="field"><label>Gold LTCG (> 24mo @ 12.5%) (₹)</label><input type="number" id="taxGoldLTCG" value="50000"></div>
            <div class="field"><label>Section 80C Deductions (Max 1.5L, Old only) (₹)</label><input type="number" id="tax80C" value="150000"></div>
            <div class="field"><label>Section 80D Health Insurance (Old only) (₹)</label><input type="number" id="tax80D" value="25000"></div>
            <div class="field"><label>TDS Already Deducted by Platforms (₹)</label><input type="number" id="taxTDS" value="45000"></div>
          </div>

          <button class="btn btn-gold" id="btnRunTax">Calculate Estimated Tax Liability</button>
        </div>
        <div id="taxResult"></div>
      `;

      function runTax() {
        const regime = App.utils.qs('input[name="taxRegime"]:checked', host)?.value || 'NEW';
        const res = App.calc.computeTaxLiability({
          salaryIncome: App.utils.qs('#taxSalary', host)?.value,
          interestIncome: App.utils.qs('#taxInterest', host)?.value,
          otherIncome: App.utils.qs('#taxOther', host)?.value,
          equitySTCG: App.utils.qs('#taxEqSTCG', host)?.value,
          equityLTCG: App.utils.qs('#taxEqLTCG', host)?.value,
          goldLTCG: App.utils.qs('#taxGoldLTCG', host)?.value,
          deductions80C: App.utils.qs('#tax80C', host)?.value,
          deductions80D: App.utils.qs('#tax80D', host)?.value,
          tdsDeducted: App.utils.qs('#taxTDS', host)?.value,
          regime
        });

        App.utils.qs('#taxResult', host).innerHTML = `
          <div class="grid-4" style="margin-top:16px">
            <div class="kpi c-red"><div class="kpi-label">Gross Total Tax + Cess</div><div class="kpi-value">${App.utils.fmtMoney(res.grossTotalTax)}</div></div>
            <div class="kpi c-blue"><div class="kpi-label">TDS Credit Available</div><div class="kpi-value">${App.utils.fmtMoney(res.tdsDeducted)}</div></div>
            <div class="kpi ${res.netTaxPayable > 0 ? 'c-gold' : 'c-teal'}">
              <div class="kpi-label">${res.netTaxPayable > 0 ? 'Net Tax Payable (Self-Assessment)' : 'Estimated Refund Due'}</div>
              <div class="kpi-value">${App.utils.fmtMoney(res.netTaxPayable > 0 ? res.netTaxPayable : res.refundDue)}</div>
            </div>
            <div class="kpi c-purple"><div class="kpi-label">Effective Overall Tax Rate</div><div class="kpi-value">${res.effectiveTaxRate.toFixed(1)}%</div></div>
          </div>

          <div class="grid-2" style="margin-top:14px">
            <div class="panel">
              <div class="chart-title" style="margin-bottom:8px">Detailed Tax Component Breakdown</div>
              <div class="stat-line"><span>Net Slab Taxable Income</span><span class="v">${App.utils.fmtMoney(res.netTaxableSlabIncome)}</span></div>
              <div class="stat-line"><span>Tax on Slab Income</span><span class="v">${App.utils.fmtMoney(res.slabTax)}</span></div>
              <div class="stat-line"><span>Equity STCG Tax (@ 20%)</span><span class="v">${App.utils.fmtMoney(res.taxEquitySTCG)}</span></div>
              <div class="stat-line"><span>Equity LTCG Tax (@ 12.5% above ₹1.25L)</span><span class="v">${App.utils.fmtMoney(res.taxEquityLTCG)}</span></div>
              <div class="stat-line"><span>Gold LTCG Tax (@ 12.5%)</span><span class="v">${App.utils.fmtMoney(res.taxGoldLTCG)}</span></div>
              <div class="stat-line"><span>Health &amp; Education Cess (4%)</span><span class="v">${App.utils.fmtMoney(res.cess)}</span></div>
            </div>

            <div class="panel">
              <div class="chart-title" style="margin-bottom:8px">📅 Advance Tax Installment Calendar</div>
              <div class="table-scroll">
                <table class="data">
                  <thead><tr><th>Due Date</th><th>Cumulative %</th><th>Cumulative Tax Due</th></tr></thead>
                  <tbody>
                    ${res.advanceTaxSchedule.map((s) => `
                      <tr>
                        <td><b>${s.date}</b></td>
                        <td>${s.pct}</td>
                        <td>${App.utils.fmtMoney(s.cumulativeDue)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              <div class="hint" style="margin-top:8px">Pay on or before each deadline via Income Tax Portal e-Pay Tax (Challan 280) to avoid Section 234B/234C interest penalties.</div>
            </div>
          </div>
        `;
      }

      App.utils.qsa('input[name="taxRegime"]', host).forEach((r) => r.addEventListener('change', runTax));
      App.utils.qs('#btnRunTax', host)?.addEventListener('click', runTax);
      runTax();
    }

    // -----------------------------------------------------------------------
    // 6. Waterfall & Multi-Tier Return Distribution
    // -----------------------------------------------------------------------
    async function drawWaterfallTab(host) {
      host.innerHTML = `
        <div class="panel">
          <div style="font-weight:700;color:var(--gold);font-size:15px;margin-bottom:6px">🌊 Private Equity &amp; Syndicate Waterfall Return Engine</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:14px">
            Simulates institutional 4-tier waterfall distribution: Tier 1 (Return of Principal) &rarr; Tier 2 (Preferred Hurdle Return) &rarr; Tier 3 (GP Catch-Up) &rarr; Tier 4 (Residual Carried Interest Split).
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px">
            <div class="field"><label>Total Exit / Liquidation Proceeds (₹)</label><input type="number" id="wfProceeds" value="3500000"></div>
            <div class="field"><label>Investor Invested Capital (LP) (₹)</label><input type="number" id="wfCapital" value="2000000"></div>
            <div class="field"><label>Preferred Hurdle Rate (% p.a.)</label><input type="number" id="wfHurdle" value="8" step="0.5"></div>
            <div class="field"><label>Deal Holding Tenure (Years)</label><input type="number" id="wfTenure" value="3" min="1" max="15"></div>
            <div class="field"><label>GP Catch-Up Rate (%)</label><input type="number" id="wfCatchUp" value="100"></div>
            <div class="field"><label>LP / GP Carried Split Ratio</label>
              <select class="search-input" id="wfCarrySplit" style="width:100%">
                <option value="80" selected>80% LP / 20% GP (Standard)</option>
                <option value="75">75% LP / 25% GP</option>
                <option value="70">70% LP / 30% GP</option>
                <option value="90">90% LP / 10% GP</option>
              </select>
            </div>
          </div>

          <button class="btn btn-gold" id="btnRunWaterfall">Simulate Waterfall Distribution</button>
        </div>
        <div id="waterfallResult"></div>
      `;

      function runWaterfall() {
        const proceeds = parseFloat(App.utils.qs('#wfProceeds', host)?.value) || 3500000;
        const capital = parseFloat(App.utils.qs('#wfCapital', host)?.value) || 2000000;
        const hurdle = parseFloat(App.utils.qs('#wfHurdle', host)?.value) || 8;
        const tenure = parseFloat(App.utils.qs('#wfTenure', host)?.value) || 3;
        const catchUp = parseFloat(App.utils.qs('#wfCatchUp', host)?.value) || 100;
        const lpSplit = parseFloat(App.utils.qs('#wfCarrySplit', host)?.value) || 80;

        const res = App.calc.computeWaterfallDistribution({
          totalProceeds: proceeds,
          investedCapital: capital,
          hurdleRatePct: hurdle,
          tenureYears: tenure,
          gpCatchUpPct: catchUp,
          lpCarriedInterestPct: lpSplit
        });

        App.utils.qs('#waterfallResult', host).innerHTML = `
          <div class="grid-4" style="margin-top:16px">
            <div class="kpi c-teal"><div class="kpi-label">Investor (LP) Total Payout</div><div class="kpi-value">${App.utils.fmtMoney(res.lpTotal)}</div></div>
            <div class="kpi c-gold"><div class="kpi-label">Sponsor (GP) Carried Interest</div><div class="kpi-value">${App.utils.fmtMoney(res.gpTotal)}</div></div>
            <div class="kpi c-blue"><div class="kpi-label">LP Multiple on Capital (MOIC)</div><div class="kpi-value">${res.lpMOIC.toFixed(2)}x</div></div>
            <div class="kpi c-purple"><div class="kpi-label">LP Realized Annualized IRR</div><div class="kpi-value">${res.lpIRR.toFixed(1)}%</div></div>
          </div>

          <div class="panel" style="margin-top:14px">
            <div class="chart-title" style="margin-bottom:8px">Step-by-Step Multi-Tier Waterfall Distribution</div>
            <div class="table-scroll">
              <table class="data">
                <thead>
                  <tr>
                    <th>Distribution Tier</th>
                    <th>Investor (LP) Share</th>
                    <th>Sponsor (GP) Share</th>
                    <th>Tier Total Distributed</th>
                    <th>Structure Logic</th>
                  </tr>
                </thead>
                <tbody>
                  ${res.tiers.map((t) => `
                    <tr>
                      <td><b>${t.name}</b></td>
                      <td style="color:var(--teal)">${App.utils.fmtMoney(t.lp)}</td>
                      <td style="color:var(--gold)">${App.utils.fmtMoney(t.gp)}</td>
                      <td><b>${App.utils.fmtMoney(t.total)}</b></td>
                      <td style="font-size:12px;color:var(--text2)">${t.desc}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      App.utils.qs('#btnRunWaterfall', host)?.addEventListener('click', runWaterfall);
      runWaterfall();
    }

    // -----------------------------------------------------------------------
    // 7. Multi-Currency Auto-Conversion Engine
    // -----------------------------------------------------------------------
    async function drawCurrencyTab(host) {
      const activeCurr = App.currency.getActiveCurrency();
      const allRates = App.currency.getAllRates();
      const meta = App.currency.CURRENCY_METADATA;

      host.innerHTML = `
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-weight:700;color:var(--gold);font-size:15px">💱 Multi-Currency Auto-Conversion Engine</div>
              <div style="font-size:12px;color:var(--text2)">Instant conversion and display currency switcher for multi-national portfolios (INR, USD, EUR, GBP, AED, SGD, CAD, AUD, JPY, CHF).</div>
            </div>
            <button class="btn btn-outline btn-sm" id="btnSyncLiveCurrencyRates">🔄 Sync Live Exchange Rates</button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
            <div class="field">
              <label>Amount</label>
              <input type="number" id="convAmount" value="100000">
            </div>
            <div class="field">
              <label>From Currency</label>
              <select class="search-input" id="convFrom">
                ${Object.keys(meta).map((k) => `<option value="${k}" ${k === 'INR' ? 'selected' : ''}>${meta[k].flag} ${k} - ${meta[k].name}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>To Currency</label>
              <select class="search-input" id="convTo">
                ${Object.keys(meta).map((k) => `<option value="${k}" ${k === 'USD' ? 'selected' : ''}>${meta[k].flag} ${k} - ${meta[k].name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="currencyConvResult" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:18px;text-align:center"></div>

          <div class="chart-title" style="margin-bottom:8px">Active Exchange Rates against Base INR (₹)</div>
          <div class="table-scroll">
            <table class="data" id="currencyRatesTable"></table>
          </div>
        </div>
      `;

      function runConversion() {
        const amt = parseFloat(App.utils.qs('#convAmount', host)?.value) || 0;
        const from = App.utils.qs('#convFrom', host)?.value || 'INR';
        const to = App.utils.qs('#convTo', host)?.value || 'USD';

        const converted = App.currency.convert(amt, from, to);
        const rate = App.currency.getExchangeRate(from, to);

        const fromMeta = meta[from] || meta.INR;
        const toMeta = meta[to] || meta.USD;

        App.utils.qs('#currencyConvResult', host).innerHTML = `
          <div style="font-size:13px;color:var(--text2);margin-bottom:4px">
            ${fromMeta.symbol}${amt.toLocaleString()} ${from} =
          </div>
          <div style="font-size:32px;font-weight:700;color:var(--gold);margin-bottom:6px">
            ${toMeta.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${to}
          </div>
          <div style="font-size:12px;color:var(--teal)">
            1 ${from} = ${rate.toFixed(4)} ${to} &bull; 1 ${to} = ${(1 / rate).toFixed(4)} ${from}
          </div>
        `;
      }

      function drawRatesTable() {
        const tbl = App.utils.qs('#currencyRatesTable', host);
        if (!tbl) return;
        tbl.innerHTML = `
          <thead>
            <tr>
              <th>Currency</th>
              <th>Symbol</th>
              <th>INR Exchange Rate (1 Unit =)</th>
              <th>1 INR (₹) Converts To</th>
              <th>Quick Switch</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(meta).map((code) => {
              const rateToINR = 1 / (allRates[code] || 1);
              const isSelected = code === App.currency.getActiveCurrency();
              return `
                <tr>
                  <td><b>${meta[code].flag} ${code}</b> - ${meta[code].name}</td>
                  <td>${meta[code].symbol}</td>
                  <td>${code === 'INR' ? '₹1.00' : '₹' + rateToINR.toFixed(2)}</td>
                  <td>${code === 'INR' ? '1.00' : (allRates[code] || 0).toFixed(4)} ${code}</td>
                  <td>
                    <button class="btn btn-sm ${isSelected ? 'btn-gold' : 'btn-outline'}" data-set-app-curr="${code}">
                      ${isSelected ? 'Active Default' : 'Set as App View'}
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        `;

        App.utils.qsa('[data-set-app-curr]', tbl).forEach((btn) => {
          btn.addEventListener('click', () => {
            const c = btn.dataset.setAppCurr;
            App.currency.setActiveCurrency(c);
            App.utils.toast(`Default portfolio display currency set to ${c}`);
            drawRatesTable();
          });
        });
      }

      App.utils.qs('#btnSyncLiveCurrencyRates', host)?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Syncing...';
        const res = await App.currency.fetchLiveRates();
        if (res.success) {
          App.utils.toast(`Live exchange rates updated (${res.count} currencies)`);
        } else {
          App.utils.toast('Using standard cached institutional rates', 'ok');
        }
        btn.disabled = false;
        btn.textContent = '🔄 Sync Live Exchange Rates';
        runConversion();
        drawRatesTable();
      });

      App.utils.qs('#convAmount', host)?.addEventListener('input', runConversion);
      App.utils.qs('#convFrom', host)?.addEventListener('change', runConversion);
      App.utils.qs('#convTo', host)?.addEventListener('change', runConversion);

      runConversion();
      drawRatesTable();
    }

    await drawTab();
  }

  App.router.register('calculator', renderCalculatorView);
})();
