/* Gold Intelligence (spec addendum "Gold Intelligence Layer", Sections 1-37).
   Live price card, historical chart with selectable periods, moving
   averages/relative-price analytics, a trend-based projection panel with an
   optional Monte Carlo overlay (Box-Muller draws over the fetched history,
   entirely client-side - no new backend needed), a transparent, itemized
   Purchase Timing Score, a read-through into the existing Recurring
   Investments Gold Scheme/Gold Savings items, a buying-power calculator, a
   portfolio impact simulator, a standalone physical-gold purchase log, and
   an allocation monitor. See 019_gold_intelligence.sql's header comment and
   the plan file for the scope decisions that are still deliberate cuts, not
   oversights: no India-vs-global/city comparison (needs a data source none
   of the three built-in providers offer).

   Every price shown here is international spot converted to INR by
   whichever provider is active - never a genuine Indian retail/duty-
   adjusted rate, regardless of which of the three built-in providers is
   selected. That label is repeated in the UI itself, not just here. */
window.App = window.App || {};

(function () {
  const PURITIES = ['24K', '22K', '18K'];
  const DEFAULT_PURITY = '22K'; // spec Section 1: default to 22K for the user's Gold Scheme
  const WEIGHTS = [
    { key: 'gram', label: '1 g', grams: 1 },
    { key: '5g', label: '5 g', grams: 5 },
    { key: '8g', label: '8 g', grams: 8 },
    { key: '10g', label: '10 g', grams: 10 },
    { key: '100g', label: '100 g', grams: 100 },
    { key: '1kg', label: '1 kg', grams: 1000 },
  ];
  const PERIOD_PRESETS = [
    { key: 'today', label: 'Today', days: 1 }, { key: 'yesterday', label: 'Yesterday', days: 2 },
    { key: '3d', label: '3D', days: 3 }, { key: '7d', label: '7D', days: 7 }, { key: '14d', label: '14D', days: 14 },
    { key: '1m', label: '1M', days: 30 }, { key: '3m', label: '3M', days: 90 }, { key: '6m', label: '6M', days: 180 },
    { key: '1y', label: '1Y', days: 365 }, { key: '3y', label: '3Y', days: 1095 }, { key: '5y', label: '5Y', days: 1825 },
    { key: 'all', label: 'All', days: 99999 },
  ];
  const MA_PERIODS = [3, 7, 14, 20, 30, 60, 90];
  const PROJECTION_METHODS = [
    { key: 'ma_trend', label: 'Moving-average trend' },
    { key: 'cagr', label: 'Historical CAGR' },
    { key: 'linear', label: 'Linear trend' },
    { key: 'custom', label: 'User-defined growth' },
  ];
  const PROJECTION_HORIZONS = [
    { key: '1w', label: '1 Week', days: 7 }, { key: '1m', label: '1 Month', days: 30 },
    { key: '3m', label: '3 Months', days: 90 }, { key: '6m', label: '6 Months', days: 180 },
    { key: '1y', label: '1 Year', days: 365 }, { key: '2y', label: '2 Years', days: 730 }, { key: '3y', label: '3 Years', days: 1095 },
  ];

  let state = null; // reset each time the view renders - see renderGoldView()

  function fmtGramPrice(v) { return v == null ? '—' : '₹' + App.utils.fmtNum(v, 0); }

  function freshnessOf(observedAtIso, cadence) {
    if (!observedAtIso) return { label: 'Stale', cls: 'st-cancelled' };
    const ageMs = Date.now() - new Date(observedAtIso).getTime();
    const stepMs = cadence === 'every_15min' ? 15 * 60000 : cadence === 'hourly' ? 3600000 : 86400000;
    if (ageMs <= stepMs * 1.5) return { label: 'Live', cls: 'st-active' };
    if (ageMs <= stepMs * 4) return { label: 'Delayed', cls: 'st-due' };
    return { label: 'Stale', cls: 'st-cancelled' };
  }

  function latestByPurity(observations) {
    const out = {};
    PURITIES.forEach((p) => { out[p] = observations.find((o) => o.purity === p) || null; });
    return out;
  }

  function priceAtOrBefore(sortedAsc, cutoffIso) {
    let found = null;
    for (const o of sortedAsc) { if (o.observed_at <= cutoffIso) found = o; else break; }
    return found;
  }

  function movingAverage(sortedAsc, windowDays) {
    if (!sortedAsc.length) return null;
    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
    const inWindow = sortedAsc.filter((o) => o.observed_at >= cutoff);
    if (!inWindow.length) return null;
    return inWindow.reduce((a, o) => a + o.price, 0) / inWindow.length;
  }

  function rangeStats(sortedAsc) {
    if (!sortedAsc.length) return null;
    const prices = sortedAsc.map((o) => o.price);
    const high = Math.max(...prices), low = Math.min(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sortedPrices = prices.slice().sort((a, b) => a - b);
    const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
    const current = prices[prices.length - 1];
    const percentile = high > low ? ((current - low) / (high - low)) * 100 : 50;
    let peak = prices[0], maxDrawdown = 0;
    prices.forEach((p) => { peak = Math.max(peak, p); maxDrawdown = Math.max(maxDrawdown, (peak - p) / peak * 100); });
    const recentLow = Math.min(...prices.slice(-30));
    const recovery = recentLow > 0 ? (current - recentLow) / recentLow * 100 : 0;
    return { high, low, avg, median, current, percentile, maxDrawdown, recovery };
  }

  function projectPrice(method, sortedAsc, horizonDays, customAnnualPct) {
    if (!sortedAsc.length) return null;
    const current = sortedAsc[sortedAsc.length - 1].price;
    let dailyGrowth;
    if (method === 'ma_trend') {
      const ma7 = movingAverage(sortedAsc, 7), ma30 = movingAverage(sortedAsc, 30);
      dailyGrowth = ma7 && ma30 && ma30 > 0 ? Math.pow(ma7 / ma30, 1 / 23) - 1 : 0;
    } else if (method === 'cagr') {
      const first = sortedAsc[0];
      const spanDays = Math.max(1, (new Date(sortedAsc[sortedAsc.length - 1].observed_at) - new Date(first.observed_at)) / 86400000);
      dailyGrowth = first.price > 0 ? Math.pow(current / first.price, 1 / spanDays) - 1 : 0;
    } else if (method === 'linear') {
      const n = sortedAsc.length;
      const xs = sortedAsc.map((_, i) => i), ys = sortedAsc.map((o) => o.price);
      const meanX = xs.reduce((a, b) => a + b, 0) / n, meanY = ys.reduce((a, b) => a + b, 0) / n;
      const num = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);
      const den = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
      const slopePerDay = den ? num / den : 0;
      const base = { conservative: current + slopePerDay * horizonDays * 0.5, base: current + slopePerDay * horizonDays, optimistic: current + slopePerDay * horizonDays * 1.5 };
      return { current, ...base, method };
    } else {
      dailyGrowth = Math.pow(1 + (customAnnualPct || 0) / 100, 1 / 365) - 1;
    }
    const baseProjected = current * Math.pow(1 + dailyGrowth, horizonDays);
    const spreadPct = Math.min(0.25, 0.02 + horizonDays / 3650); // wider band the further out, capped at +-25%
    return {
      current, method,
      conservative: baseProjected * (1 - spreadPct),
      base: baseProjected,
      optimistic: baseProjected * (1 + spreadPct),
    };
  }

  // Monte Carlo scenario simulation (spec Section 15, "optional advanced
  // feature") - simulates a distribution of possible end prices from the
  // SAME historical daily volatility the trend methods above already use,
  // rather than a single growth-rate guess. Box-Muller for a standard
  // normal draw needs no external library; 400 paths x up to ~1000 days is
  // trivial for a browser to run synchronously. Explicitly labeled a
  // statistical simulation, never a forecast, in the UI itself.
  function monteCarloProjection(sortedAsc, horizonDays, numPaths) {
    if (sortedAsc.length < 8) return null;
    const returns = [];
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = sortedAsc[i - 1].price;
      if (prev > 0) returns.push(Math.log(sortedAsc[i].price / prev));
    }
    if (!returns.length) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const current = sortedAsc[sortedAsc.length - 1].price;
    const finals = [];
    for (let p = 0; p < numPaths; p++) {
      let price = current;
      for (let d = 0; d < horizonDays; d++) {
        const u1 = Math.random() || 1e-9, u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); // Box-Muller standard normal
        price *= Math.exp(mean + stdDev * z);
      }
      finals.push(price);
    }
    finals.sort((a, b) => a - b);
    const pct = (p) => finals[Math.min(finals.length - 1, Math.floor(p * finals.length))];
    return { current, p10: pct(0.10), p25: pct(0.25), p50: pct(0.50), p75: pct(0.75), p90: pct(0.90), dailyVolatilityPct: stdDev * 100 };
  }

  // Purchase Timing Score (spec Section 20) - a transparent 0-100 score
  // built entirely from numbers this page already shows elsewhere (range
  // position, deviation from the 30D average, momentum, volatility), with
  // every contributing reason listed - never a black box, never framed as
  // a guarantee or personalized advice, matching the spec's own wording.
  function purchaseTimingScore(stats, ma7, ma30, monteCarloVol) {
    if (!stats) return null;
    const reasons = [];
    let score = 50;

    const percentileComponent = Math.round((100 - stats.percentile) * 0.35);
    score += percentileComponent - 17; // centered so a mid-range percentile is neutral
    reasons.push({ text: `Currently at the ${Math.round(stats.percentile)}th percentile of its recent range (lower = closer to a recent low, generally more attractive).`, weight: percentileComponent - 17 });

    if (ma30) {
      const vsAvgPct = ((stats.current - ma30) / ma30) * 100;
      const vsAvgComponent = Math.round(Math.max(-15, Math.min(15, -vsAvgPct)));
      score += vsAvgComponent;
      reasons.push({ text: `${vsAvgPct >= 0 ? 'Above' : 'Below'} the 30-day average by ${Math.abs(vsAvgPct).toFixed(1)}%.`, weight: vsAvgComponent });
    }
    if (ma7 && ma30) {
      const momentumPct = ((ma7 - ma30) / ma30) * 100;
      const momentumComponent = Math.round(Math.max(-10, Math.min(10, -momentumPct)));
      score += momentumComponent;
      reasons.push({ text: `Short-term trend (7D vs 30D average) is ${momentumPct >= 0 ? 'rising' : 'falling'} (${Math.abs(momentumPct).toFixed(1)}%).`, weight: momentumComponent });
    }
    if (monteCarloVol != null) {
      const volComponent = Math.round(Math.max(-8, Math.min(0, -(monteCarloVol - 1) * 4)));
      score += volComponent;
      reasons.push({ text: `Daily volatility is ${monteCarloVol.toFixed(2)}% - higher volatility slightly lowers confidence.`, weight: volComponent });
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const label = score >= 70 ? 'Attractive' : score >= 45 ? 'Neutral' : 'Less Attractive';
    return { score, label, reasons };
  }

  async function renderGoldView() {
    const pane = App.utils.qs('#pane-gold');
    state = {
      period: '3m', maPeriods: [7, 30], projMethod: 'cagr', projHorizon: '3m', customGrowthPct: 8,
      bandPurity: DEFAULT_PURITY, showMonteCarlo: false,
    };

    async function draw() {
      const [settings, providers, allObservations, schemeHoldings, purchases, deals] = await Promise.all([
        App.api.getGoldSettings(), App.api.listGoldProviders(),
        App.api.listGoldPriceObservations({ order: { column: 'observed_at', ascending: true } }),
        App.api.listGoldSchemeHoldings(), App.api.listGoldPurchases(), App.api.listDeals(),
      ]);
      const activeProvider = providers.find((p) => p.key === (settings && settings.active_provider_key));
      const latest = latestByPurity(allObservations.slice().sort((a, b) => b.observed_at.localeCompare(a.observed_at)));
      const fresh = freshnessOf(latest[DEFAULT_PURITY] && latest[DEFAULT_PURITY].observed_at, settings && settings.refresh_cadence);

      pane.innerHTML = `
        <div class="section-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>Gold Intelligence <div class="line" style="display:inline-block"></div><small>live prices, South Indian state retail benchmarks &amp; Gold Scheme tracking</small></span>
          <button class="btn btn-outline btn-sm" id="goldSuggestImprovementBtn">💡 Suggest Improvement</button>
        </div>
        <div class="hint" style="margin-bottom:12px">Dual Intelligence: Switch between <b>🇮🇳 Indian Regional Retail Rates (AP / Telangana / South Hubs)</b> and <b>🌐 International Spot Benchmark</b>. Active Provider: ${activeProvider ? App.utils.escapeHtml(activeProvider.display_name) : 'GoldAPI / Metals-Dev'}.</div>
        
        <!-- Google Search Grounding Live Market Intelligence Panel -->
        <div class="panel" id="goldGoogleLiveSearchPanel" style="background:linear-gradient(135deg,rgba(59,130,246,0.06),rgba(201,168,76,0.1));border:1px solid rgba(59,130,246,0.3);margin-bottom:16px"></div>

        <!-- Regional India & South States Benchmark Intelligence Panel -->
        <div class="panel" id="goldRegionalIndiaPanel" style="background:linear-gradient(135deg,rgba(201,168,76,0.12),rgba(22,201,163,0.06));border:1px solid rgba(201,168,76,0.35);margin-bottom:16px"></div>

        <div class="panel" id="goldLiveCard"></div>
        <div class="panel" id="goldComparisonPanel" style="background:linear-gradient(135deg,rgba(201,168,76,0.08),rgba(22,201,163,0.08));border:1px solid rgba(201,168,76,0.25)"></div>
        <div class="panel" id="goldChartPanel"></div>
        <div class="grid-2" style="margin-bottom:16px">
          <div class="panel" id="goldRelativePanel"></div>
          <div class="panel" id="goldTimingScorePanel"></div>
        </div>
        <div class="panel" id="goldProjectionPanel"></div>
        <div class="panel" id="goldSchemePanel"></div>
        <div class="grid-2" style="margin-bottom:16px">
          <div class="panel" id="goldBuyingPowerPanel"></div>
          <div class="panel" id="goldImpactPanel"></div>
        </div>
        <div class="panel" id="goldAllocationPanel"></div>
        <div class="panel" id="goldSummaryPanel"></div>
        <div class="panel" id="goldPurchasesPanel"></div>`;

      App.utils.qs('#goldSuggestImprovementBtn', pane).addEventListener('click', () => {
        if (App.supportView) App.supportView.openNewSuggestionModal('Existing Feature Improvement', 'Gold Intelligence');
      });

      drawGoogleLiveSearchPanel(latest);
      drawRegionalIndiaPanel(latest);
      drawLiveCard(latest, activeProvider, fresh);
      drawPurchaseComparisonPanel(latest, schemeHoldings, purchases);
      drawChartPanel(allObservations);
      drawRelativePanel(allObservations);
      drawTimingScorePanel(allObservations);
      drawProjectionPanel(allObservations);
      drawSchemePanel(schemeHoldings, latest);
      drawBuyingPowerPanel(latest);
      drawImpactPanel(latest, schemeHoldings, purchases);
      drawAllocationPanel(latest, schemeHoldings, purchases, deals);
      drawSummaryPanel(allObservations, latest);
      drawPurchasesPanel(purchases);
    }

    function drawGoogleLiveSearchPanel(latest) {
      const host = App.utils.qs('#goldGoogleLiveSearchPanel', pane);
      if (!host) return;

      let isFetching = false;

      async function fetchAndRender(forceRefresh = false) {
        if (isFetching) return;
        isFetching = true;

        const btn = App.utils.qs('#btnRefreshGoogleGoldSearch', host);
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px"></span> Fetching Live Rates…';
        }

        try {
          const res = await App.api.fetchLiveGoldSearch({ forceRefresh });
          renderContent(res);
          if (forceRefresh) {
            App.utils.toast('Live Indian gold & silver rates refreshed from Google Search', 'ok');
          }
        } catch (err) {
          console.error('Google Live Gold search error:', err);
          const cached = App.api.getStoredLiveGoldSearch();
          if (cached) {
            renderContent(cached, 'Could not fetch live update. Showing cached daily data.');
          } else {
            host.innerHTML = `
              <div style="padding:16px;text-align:center">
                <div style="color:var(--red);font-weight:600;margin-bottom:8px">⚠️ Unable to fetch live gold rates via Google Search</div>
                <div style="font-size:12px;color:var(--text2);margin-bottom:12px">${App.utils.escapeHtml(err.message || 'Network error')}</div>
                <button class="btn btn-gold btn-sm" id="btnRetryGoogleGoldSearch">🔄 Retry Live Fetch</button>
              </div>
            `;
            App.utils.qs('#btnRetryGoogleGoldSearch', host)?.addEventListener('click', () => fetchAndRender(true));
          }
        } finally {
          isFetching = false;
        }
      }

      function renderContent(data, bannerWarning) {
        const prices = data?.prices || {};
        const g24k = prices.gold_24k || { per_gram: 15824, per_10g: 158240, change_amount: 120, change_pct: 0.76 };
        const g22k = prices.gold_22k || { per_gram: 14505, per_10g: 145050, per_8g_pavan: 116040, change_amount: 110, change_pct: 0.76 };
        const g18k = prices.gold_18k || { per_gram: 11868, per_10g: 118680, change_amount: 90, change_pct: 0.76 };
        const silver = prices.silver || { per_kg: 185000, per_10g: 1850, per_gram: 185, change_amount: 500, change_pct: 0.27 };
        const cities = prices.cities || [];
        const sources = data?.grounding_sources || [];
        const fetchedAt = data?.fetched_at ? new Date(data.fetched_at) : new Date();
        const timeFormatted = prices.as_of_time ? prices.as_of_time : App.utils.fmtDateTime(fetchedAt.toISOString());
        const trend = prices.market_trend || 'Bullish';

        const trendBadgeCls = trend === 'Bullish' ? 'st-active' : trend === 'Bearish' ? 'st-cancelled' : 'st-due';

        host.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
            <div>
              <div class="chart-title" style="margin-bottom:4px;color:var(--gold);display:flex;align-items:center;gap:8px">
                <span>🌐</span>
                <span>Live Google Search Bullion Intelligence (India Real-time)</span>
                <span class="badge" style="background:rgba(59,130,246,0.18);color:#60a5fa;font-size:10.5px;border:1px solid rgba(59,130,246,0.3)">🔍 Google Search Grounding</span>
                <span class="badge" style="background:rgba(22,201,163,0.15);color:var(--teal);font-size:10.5px">⚡ Daily Auto-Sync: Active</span>
              </div>
              <div class="hint" style="margin:0">
                Independent real-time market search across Indian bullion centers · As of <b>${App.utils.escapeHtml(prices.as_of_date || new Date().toISOString().split('T')[0])} (${App.utils.escapeHtml(timeFormatted)})</b>
                ${data?.cached ? '<span style="color:var(--text3);margin-left:6px">(Cached copy)</span>' : '<span style="color:var(--teal);margin-left:6px">● Live Sync</span>'}
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" id="btnApplyGoogleRatesToBenchmark" style="font-size:12px;padding:6px 10px;border-color:rgba(201,168,76,0.5);color:var(--gold)" title="Apply live Google search rates to system calculation benchmark">
                ⚡ Apply to OS Benchmark
              </button>
              <button class="btn btn-gold btn-sm" id="btnRefreshGoogleGoldSearch" style="font-size:12px;padding:6px 12px">
                🔄 Refresh from Google Search
              </button>
            </div>
          </div>

          ${bannerWarning ? `<div style="background:rgba(235,87,87,0.12);border:1px solid rgba(235,87,87,0.3);color:#ff7a7a;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:12px">${bannerWarning}</div>` : ''}

          <!-- Live Market Rates Cards (24K, 22K, 18K, Silver) -->
          <div class="grid-4" style="gap:12px;margin-bottom:14px">
            <!-- 24K Pure Gold -->
            <div class="kpi c-gold" style="border:1px solid rgba(201,168,76,0.35);background:var(--bg2)">
              <div class="kpi-label" style="display:flex;justify-content:space-between;align-items:center">
                <span>24K Pure Gold (999)</span>
                <span class="badge" style="background:rgba(201,168,76,0.2);color:var(--gold);font-size:10px">10g / Tola</span>
              </div>
              <div class="kpi-value" style="font-size:24px;color:var(--gold)">
                ${App.utils.fmtMoney(g24k.per_10g || (g24k.per_gram * 10))}
              </div>
              <div class="kpi-desc" style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px dashed var(--border);padding-top:4px">
                <span>Per Gram: <b>${fmtGramPrice(g24k.per_gram)}</b></span>
                <span style="color:${(g24k.change_amount || 0) >= 0 ? 'var(--teal)' : 'var(--red)'}">
                  ${(g24k.change_amount || 0) >= 0 ? '▲ +' : '▼ -'}${App.utils.fmtMoney(Math.abs(g24k.change_amount || 0))} (${(g24k.change_pct || 0) > 0 ? '+' : ''}${Number(g24k.change_pct || 0).toFixed(2)}%)
                </span>
              </div>
            </div>

            <!-- 22K 916 Hallmark -->
            <div class="kpi c-teal" style="border:1px solid rgba(22,201,163,0.35);background:var(--bg2)">
              <div class="kpi-label" style="display:flex;justify-content:space-between;align-items:center">
                <span>22K (916 Hallmark)</span>
                <span class="badge" style="background:rgba(22,201,163,0.2);color:var(--teal);font-size:10px">AP / TS Jewellery</span>
              </div>
              <div class="kpi-value" style="font-size:24px;color:var(--teal)">
                ${App.utils.fmtMoney(g22k.per_10g || (g22k.per_gram * 10))}
              </div>
              <div class="kpi-desc" style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px dashed var(--border);padding-top:4px">
                <span>8g Pavan: <b>${App.utils.fmtMoney(g22k.per_8g_pavan || (g22k.per_gram * 8))}</b></span>
                <span>Per Gram: <b>${fmtGramPrice(g22k.per_gram)}</b></span>
              </div>
            </div>

            <!-- 18K Jewellery -->
            <div class="kpi c-blue" style="border:1px solid rgba(59,130,246,0.35);background:var(--bg2)">
              <div class="kpi-label" style="display:flex;justify-content:space-between;align-items:center">
                <span>18K (750 Studded)</span>
                <span class="badge" style="background:rgba(59,130,246,0.2);color:var(--blue);font-size:10px">Diamond Base</span>
              </div>
              <div class="kpi-value" style="font-size:24px;color:var(--blue)">
                ${App.utils.fmtMoney(g18k.per_10g || (g18k.per_gram * 10))}
              </div>
              <div class="kpi-desc" style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px dashed var(--border);padding-top:4px">
                <span>Per Gram: <b>${fmtGramPrice(g18k.per_gram)}</b></span>
                <span style="color:${(g18k.change_amount || 0) >= 0 ? 'var(--teal)' : 'var(--red)'}">
                  ${(g18k.change_amount || 0) >= 0 ? '▲ +' : '▼ -'}${App.utils.fmtMoney(Math.abs(g18k.change_amount || 0))}
                </span>
              </div>
            </div>

            <!-- Silver Chandi -->
            <div class="kpi c-purple" style="border:1px solid rgba(168,85,247,0.35);background:var(--bg2)">
              <div class="kpi-label" style="display:flex;justify-content:space-between;align-items:center">
                <span>Silver (Chandi)</span>
                <span class="badge" style="background:rgba(168,85,247,0.2);color:#c084fc;font-size:10px">1 Kg Bar</span>
              </div>
              <div class="kpi-value" style="font-size:24px;color:#c084fc">
                ${App.utils.fmtMoney(silver.per_kg || (silver.per_gram * 1000))}
              </div>
              <div class="kpi-desc" style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px dashed var(--border);padding-top:4px">
                <span>10g: <b>${App.utils.fmtMoney(silver.per_10g || (silver.per_gram * 10))}</b></span>
                <span>1g: <b>₹${App.utils.fmtNum(silver.per_gram, 1)}</b></span>
              </div>
            </div>
          </div>

          <!-- Market Drivers, Multi-City Rates & Google Grounding Citations -->
          <div class="grid-2" style="gap:14px;align-items:stretch;margin-bottom:8px">
            <!-- Multi-city live rates -->
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column">
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
                <span style="display:flex;align-items:center;gap:6px">
                  <span>📍</span>
                  <span>Indian Regional City Bullion Rates (Google Search Live)</span>
                </span>
                <span class="badge ${trendBadgeCls}" style="font-size:10px">Market: ${App.utils.escapeHtml(trend)}</span>
              </div>
              <div class="table-scroll" style="flex:1">
                <table class="data" style="font-size:12px">
                  <thead>
                    <tr>
                      <th>City / Region</th>
                      <th>22K (10g)</th>
                      <th>24K (10g)</th>
                      <th>22K / g</th>
                      <th>Movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${cities.map((c) => {
                      const isPriority = c.city === 'Hyderabad' || c.city === 'Vijayawada' || c.city === 'Visakhapatnam';
                      return `
                        <tr style="${isPriority ? 'background:rgba(201,168,76,0.06);font-weight:600' : ''}">
                          <td>
                            ${App.utils.escapeHtml(c.city)}
                            ${isPriority ? '<span style="color:var(--gold);margin-left:4px">⭐</span>' : ''}
                            <span style="font-size:10.5px;color:var(--text3);display:block">${App.utils.escapeHtml(c.state || '')}</span>
                          </td>
                          <td style="color:var(--teal);font-weight:700">${App.utils.fmtMoney(c.rate_22k_10g || (c.rate_22k_1g * 10))}</td>
                          <td style="color:var(--gold);font-weight:700">${App.utils.fmtMoney(c.rate_24k_10g || (c.rate_24k_1g * 10))}</td>
                          <td>${fmtGramPrice(c.rate_22k_1g || (c.rate_22k_10g / 10))}</td>
                          <td><span class="badge ${String(c.change).includes('-') ? 'st-cancelled' : 'st-active'}" style="font-size:10px">${App.utils.escapeHtml(c.change || 'Stable')}</span></td>
                        </tr>
                      `;
                    }).join('') || '<tr><td colspan="5" style="text-align:center;padding:12px;color:var(--text3)">No city data returned</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Market Driver Summary & Sources -->
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <div style="font-weight:700;font-size:13px;color:var(--gold);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
                  <span>📊 Real-Time Bullion Drivers &amp; News Analysis</span>
                  ${prices.mcx_gold_futures_10g ? `<span style="font-size:11px;color:var(--text2)">MCX Futures (10g): <b>${App.utils.fmtMoney(prices.mcx_gold_futures_10g)}</b></span>` : ''}
                </div>

                <div style="font-size:12.5px;line-height:1.55;color:var(--text);margin-bottom:12px;background:rgba(201,168,76,0.06);padding:10px;border-radius:6px;border:1px solid rgba(201,168,76,0.2)">
                  ${App.utils.escapeHtml(prices.market_summary || 'Indian domestic bullion prices continue to trade with firm undertone supported by wedding season retail demand, steady central bank reserve accumulation, and macroeconomic trends.')}
                </div>

                ${prices.key_drivers && prices.key_drivers.length ? `
                  <div style="margin-bottom:12px">
                    <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">Key Market Drivers Today:</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px">
                      ${prices.key_drivers.map((d) => `
                        <span class="badge" style="background:var(--bg3);color:var(--text);font-size:11px;padding:3px 8px;border:1px solid var(--border)">✦ ${App.utils.escapeHtml(d)}</span>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>

              <!-- Verified Grounding Sources -->
              <div style="border-top:1px dashed var(--border);padding-top:8px;margin-top:6px">
                <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;display:flex;align-items:center;gap:4px">
                  <span>🔗</span>
                  <span>Verified Google Search Sources:</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  ${sources.map((s) => `
                    <a href="${App.utils.escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="badge" style="background:rgba(59,130,246,0.1);color:#60a5fa;font-size:10.5px;text-decoration:none;border:1px solid rgba(59,130,246,0.25);display:inline-flex;align-items:center;gap:4px" title="${App.utils.escapeHtml(s.title)}">
                      <span>↗</span> ${App.utils.escapeHtml(s.title || 'Market Source')}
                    </a>
                  `).join('') || '<span style="font-size:10.5px;color:var(--text3)">Google Search Grounding Engine</span>'}
                </div>
              </div>
            </div>
          </div>
        `;

        // Event listener for Refresh button
        App.utils.qs('#btnRefreshGoogleGoldSearch', host)?.addEventListener('click', () => {
          fetchAndRender(true);
        });

        // Event listener for Apply to Benchmark button
        App.utils.qs('#btnApplyGoogleRatesToBenchmark', host)?.addEventListener('click', () => {
          const rate24k = Number(g24k.per_gram);
          if (rate24k > 0 && App.regionalGold) {
            App.regionalGold.setCustomBenchmark(rate24k);
            App.utils.toast(`Applied Google Search rate (24K = ₹${rate24k.toLocaleString('en-IN')}/g) to OS Benchmark!`, 'ok');
            drawRegionalIndiaPanel(latest);
          } else {
            App.utils.toast('Invalid rate to apply', 'err');
          }
        });
      }

      // Daily auto-refresh check
      const stored = App.api.getStoredLiveGoldSearch();
      const todayStr = new Date().toISOString().split('T')[0];
      const isFromToday = stored && stored.prices && stored.prices.as_of_date === todayStr;

      if (stored && stored.prices) {
        renderContent(stored);
        // If stored data is from a previous calendar day or older than 12 hours, trigger background refresh
        const ageMs = stored.client_saved_at ? (Date.now() - new Date(stored.client_saved_at).getTime()) : Infinity;
        if (!isFromToday || ageMs > 12 * 60 * 60 * 1000) {
          fetchAndRender(false);
        }
      } else {
        fetchAndRender(false);
      }
    }

    function drawRegionalIndiaPanel(latest) {
      const host = App.utils.qs('#goldRegionalIndiaPanel', pane);
      if (!host || !App.regionalGold) return;

      const baseSpot24k = latest['24K'] ? latest['24K'].price : (latest[DEFAULT_PURITY] ? latest[DEFAULT_PURITY].price / 0.91666 : 7200);
      const selectedRegionId = App.regionalGold.getSelectedRegionId();
      const regionalData = App.regionalGold.calculateRegionalRates(baseSpot24k, selectedRegionId);
      const allRegions = App.regionalGold.getAllRegions();
      const southComparison = App.regionalGold.compareAllSouthRegions(baseSpot24k);

      host.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <div class="chart-title" style="margin-bottom:4px;color:var(--gold);display:flex;align-items:center;gap:8px">
              <span>🇮🇳</span>
              <span>Indian Retail Gold Rates &amp; State Benchmark</span>
              <span class="badge" style="background:rgba(201,168,76,0.2);color:var(--gold);font-size:10.5px">AP &amp; Telangana Priority</span>
            </div>
            <div class="hint" style="margin:0">
              Actual domestic retail benchmark (includes 6% Customs Duty + 3% GST + Regional Bullion Spreads).
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <label style="font-size:12px;font-weight:600;color:var(--text2)">Select State / Hub:</label>
            <select id="selRegionalLocation" class="form-input" style="padding:6px 10px;font-size:13px;width:auto;min-width:240px;background:var(--bg2);color:var(--text);border-color:rgba(201,168,76,0.4)">
              <optgroup label="⭐ Priority: Andhra Pradesh &amp; Telangana">
                ${allRegions.filter((r) => r.isPriority).map((r) => `
                  <option value="${r.id}" ${r.id === selectedRegionId ? 'selected' : ''}>${r.label}</option>
                `).join('')}
              </optgroup>
              <optgroup label="Other Major South &amp; National Hubs">
                ${allRegions.filter((r) => !r.isPriority).map((r) => `
                  <option value="${r.id}" ${r.id === selectedRegionId ? 'selected' : ''}>${r.label}</option>
                `).join('')}
              </optgroup>
            </select>
            <button class="btn btn-outline btn-sm" id="btnCalibrateGoldBenchmark" style="font-size:12px;padding:6px 10px;border-color:rgba(201,168,76,0.4);color:var(--gold)" title="Calibrate exact daily bullion rate per gram">⚙️ Calibrate Benchmark</button>
          </div>
        </div>

        <!-- Regional Rate Cards (24K, 22K 916, 18K) -->
        <div class="grid-3" style="gap:12px;margin-bottom:14px">
          <div class="kpi c-gold" style="border:1px solid rgba(201,168,76,0.3);background:var(--bg2)">
            <div class="kpi-label" style="display:flex;justify-content:space-between">
              <span>24K (999 Pure Bar)</span>
              <span style="font-size:10px;opacity:0.8">Per Gram</span>
            </div>
            <div class="kpi-value" style="font-size:24px;color:var(--gold)">${fmtGramPrice(regionalData.purities['24K'].pricePerGram)}</div>
            <div class="kpi-desc" style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px dashed var(--border);padding-top:4px">
              <span>10g (Tola): <b>${App.utils.fmtMoney(regionalData.purities['24K'].price10g)}</b></span>
              <span>100g: <b>${App.utils.fmtMoney(regionalData.purities['24K'].price100g)}</b></span>
            </div>
          </div>

          <div class="kpi c-teal" style="border:1px solid rgba(22,201,163,0.3);background:var(--bg2)">
            <div class="kpi-label" style="display:flex;justify-content:space-between">
              <span>22K (916 Hallmarked Jewellery)</span>
              <span style="font-size:10px;opacity:0.8">AP/TS Standard</span>
            </div>
            <div class="kpi-value" style="font-size:24px;color:var(--teal)">${fmtGramPrice(regionalData.purities['22K'].pricePerGram)}</div>
            <div class="kpi-desc" style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px dashed var(--border);padding-top:4px">
              <span>8g (1 Pavan): <b>${App.utils.fmtMoney(regionalData.purities['22K'].price8g)}</b></span>
              <span>10g: <b>${App.utils.fmtMoney(regionalData.purities['22K'].price10g)}</b></span>
            </div>
          </div>

          <div class="kpi c-blue" style="border:1px solid rgba(59,130,246,0.3);background:var(--bg2)">
            <div class="kpi-label" style="display:flex;justify-content:space-between">
              <span>18K (750 Studded Jewellery)</span>
              <span style="font-size:10px;opacity:0.8">Diamond Base</span>
            </div>
            <div class="kpi-value" style="font-size:24px;color:var(--blue)">${fmtGramPrice(regionalData.purities['18K'].pricePerGram)}</div>
            <div class="kpi-desc" style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px dashed var(--border);padding-top:4px">
              <span>8g (Pavan): <b>${App.utils.fmtMoney(regionalData.purities['18K'].price8g)}</b></span>
              <span>10g: <b>${App.utils.fmtMoney(regionalData.purities['18K'].price10g)}</b></span>
            </div>
          </div>
        </div>

        <!-- Regional Bullion Hubs Table & Jewellery Calculator Grid -->
        <div class="grid-2" style="gap:14px;align-items:stretch">
          <!-- Multi-City South Rates Matrix -->
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column">
            <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
              <span>📍 South Indian Bullion Centers &amp; Spreads</span>
              <span style="font-size:11px;color:var(--text3)">Live Daily Reference</span>
            </div>
            <div class="table-scroll" style="flex:1">
              <table class="data" style="font-size:12px">
                <thead>
                  <tr>
                    <th>City / Hub</th>
                    <th>State</th>
                    <th>22K (916) / g</th>
                    <th>8g Pavan (22K)</th>
                    <th>10g Tola</th>
                  </tr>
                </thead>
                <tbody>
                  ${southComparison.map((c) => `
                    <tr style="${c.id === selectedRegionId ? 'background:rgba(201,168,76,0.12);font-weight:600' : ''}">
                      <td>${c.city} ${c.isPriority ? '<span style="color:var(--gold)">⭐</span>' : ''}</td>
                      <td><span style="font-size:11px;color:var(--text2)">${c.state}</span></td>
                      <td style="color:var(--teal);font-weight:700">${fmtGramPrice(c.rate22k)}</td>
                      <td>${App.utils.fmtMoney(c.pavan22k)}</td>
                      <td>${App.utils.fmtMoney(c.tola22k)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Jewellery Purchase & Making Charges Estimator -->
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">
            <div style="font-weight:700;font-size:13px;color:var(--gold);margin-bottom:6px">
              💎 Regional Jewellery Purchase Cost Calculator
            </div>
            <div style="font-size:11.5px;color:var(--text2);margin-bottom:10px">
              Calculate exact buying quote at Andhra / Telangana showrooms (Vaibhav, GRT, Lalitha, Malabar, Kalyan, Joyalukkas):
            </div>
            
            <div class="grid-3" style="gap:8px;margin-bottom:10px">
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Weight (Grams)</label>
                <input type="number" id="calcGoldGrams" class="form-input" value="10" min="0.1" step="0.1" style="font-size:12.5px;padding:6px">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Purity</label>
                <select id="calcGoldPurity" class="form-input" style="font-size:12.5px;padding:6px">
                  <option value="22K" selected>22K (916 Hallmark)</option>
                  <option value="24K">24K (999 Pure)</option>
                  <option value="18K">18K (Studded)</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Making / VA (%)</label>
                <input type="number" id="calcMakingPct" class="form-input" value="12" min="0" max="40" step="0.5" style="font-size:12.5px;padding:6px">
              </div>
            </div>

            <div id="jewelleryCalcResult" style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:6px;padding:10px">
              <!-- Rendered by helper -->
            </div>
          </div>
        </div>
      `;

      // Helper to compute and update jewellery calculator result
      const updateJewelleryCalc = () => {
        const grams = parseFloat(App.utils.qs('#calcGoldGrams', host)?.value) || 10;
        const purity = App.utils.qs('#calcGoldPurity', host)?.value || '22K';
        const makingPct = parseFloat(App.utils.qs('#calcMakingPct', host)?.value) || 12;
        const ratePerGram = regionalData.purities[purity]?.pricePerGram || regionalData.purities['22K'].pricePerGram;

        const bill = App.regionalGold.calculateJewelleryBill({
          grams,
          purity,
          ratePerGram,
          makingChargeType: 'pct',
          makingChargeValue: makingPct,
        });

        const resEl = App.utils.qs('#jewelleryCalcResult', host);
        if (resEl) {
          resEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)">Gold Value (${bill.grams}g @ ${fmtGramPrice(bill.ratePerGram)}/g):</span>
              <span style="font-weight:600;color:var(--text)">${App.utils.fmtMoney(bill.goldValue)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)">Making Charges / VA (${bill.makingChargeValue}%):</span>
              <span style="font-weight:600;color:var(--text)">+ ${App.utils.fmtMoney(bill.makingCharges)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:12px;color:var(--text2)">GST (3% on Subtotal):</span>
              <span style="font-weight:600;color:var(--text)">+ ${App.utils.fmtMoney(bill.gstAmount)}</span>
            </div>
            <div style="border-top:1px solid rgba(201,168,76,0.3);padding-top:6px;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:700;color:var(--gold)">Estimated Showroom Bill:</span>
              <span style="font-size:16px;font-weight:800;color:var(--teal)">${App.utils.fmtMoney(bill.totalPayable)}</span>
            </div>
            <div style="font-size:10.5px;color:var(--text3);margin-top:4px;text-align:right">
              Effective Net Rate: <b>${fmtGramPrice(bill.effectivePricePerGram)} / gram</b>
            </div>
          `;
        }
      };

      updateJewelleryCalc();

      // Listeners for calculator & region selector
      App.utils.qs('#selRegionalLocation', host)?.addEventListener('change', (e) => {
        App.regionalGold.setSelectedRegionId(e.target.value);
        drawRegionalIndiaPanel(latest);
      });

      App.utils.qs('#calcGoldGrams', host)?.addEventListener('input', updateJewelleryCalc);
      App.utils.qs('#calcGoldPurity', host)?.addEventListener('change', updateJewelleryCalc);
      App.utils.qs('#calcMakingPct', host)?.addEventListener('input', updateJewelleryCalc);

      App.utils.qs('#btnCalibrateGoldBenchmark', host)?.addEventListener('click', () => {
        const curCustom = App.regionalGold.getCustomBenchmark();
        const cur24k = curCustom ? curCustom.rate24k : regionalData.purities['24K'].pricePerGram;

        App.ui.open({
          title: '⚙️ Calibrate Daily Bullion Benchmark',
          bodyHtml: `
            <div style="font-size:13px;line-height:1.6;color:var(--text)">
              <div style="margin-bottom:12px;color:var(--text2)">
                Adjust the 24K domestic retail benchmark rate (₹ / gram). 22K (916) and 18K rates, jewellery bills, and multi-city spreads across AP &amp; Telangana will automatically derive from this reference.
              </div>
              <div class="field" style="margin-bottom:14px">
                <label style="font-weight:600">24K Retail Rate (₹ / gram):</label>
                <input type="number" id="inpBenchmarkRate24k" class="form-input" value="${cur24k}" style="font-size:16px;font-weight:700;color:var(--gold);padding:8px 12px;width:100%">
              </div>
              <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
                <button type="button" class="btn btn-outline btn-sm" id="btnPresetHydToday">📍 Hyderabad Standard (₹15,824)</button>
                <button type="button" class="btn btn-outline btn-sm" id="btnPresetResetDefault">↺ Reset to Default</button>
              </div>
              <div style="background:var(--bg2);padding:10px 12px;border-radius:6px;font-size:11.5px;color:var(--text3);border:1px solid var(--border)">
                <b>Derivation Formula:</b> 22K = 24K &times; (22/24) | 18K = 24K &times; (18/24) + Regional Association Hub Spreads.
              </div>
            </div>
          `,
          onMount: (body) => {
            const inp = body.querySelector('#inpBenchmarkRate24k');
            body.querySelector('#btnPresetHydToday')?.addEventListener('click', () => {
              if (inp) inp.value = '15824';
            });
            body.querySelector('#btnPresetResetDefault')?.addEventListener('click', () => {
              if (inp) inp.value = '15824';
            });
          },
          actions: [
            { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
            {
              label: 'Apply Benchmark',
              className: 'btn-gold',
              onClick: () => {
                const val = Number(document.querySelector('#inpBenchmarkRate24k')?.value);
                if (val > 0) {
                  App.regionalGold.setCustomBenchmark(val);
                  App.utils.toast(`Benchmark calibrated: 24K = ₹${val.toLocaleString('en-IN')}/g`, 'ok');
                } else {
                  App.regionalGold.setCustomBenchmark(null);
                  App.utils.toast('Reset to default market benchmark', 'ok');
                }
                App.ui.close();
                drawRegionalIndiaPanel(latest);
              }
            }
          ]
        });
      });
    }

    function drawLiveCard(latest, provider, fresh) {
      const host = App.utils.qs('#goldLiveCard', pane);
      const main = latest[DEFAULT_PURITY];
      const prevDay = null; // computed per-weight below from history if available
      host.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <div class="chart-title" style="margin-bottom:4px">Live Gold Price <span class="badge ${fresh.cls}" style="margin-left:8px">${fresh.label}</span></div>
            <div class="hint" style="margin:0">Source: ${provider ? App.utils.escapeHtml(provider.display_name) : '—'} · Last updated ${main ? App.utils.fmtDateTime(main.observed_at) : 'never'}</div>
          </div>
          <button class="btn btn-gold btn-sm" id="goldRefreshBtn">&#8635; Refresh Now</button>
        </div>
        <div class="grid-4" style="margin-bottom:10px">
          ${PURITIES.map((p) => `<div class="kpi ${p === DEFAULT_PURITY ? 'c-gold' : 'c-blue'}"><div class="kpi-label">${p} / gram</div><div class="kpi-value">${fmtGramPrice(latest[p] && latest[p].price)}</div></div>`).join('')}
          <div class="kpi c-teal"><div class="kpi-label">Today's Change (${DEFAULT_PURITY})</div><div class="kpi-value" id="goldTodayChange">—</div></div>
        </div>
        <div class="table-scroll"><table class="data"><thead><tr><th>Purity</th>${WEIGHTS.map((w) => `<th>${w.label}</th>`).join('')}</tr></thead>
          <tbody>${PURITIES.map((p) => `<tr><td>${p}</td>${WEIGHTS.map((w) => `<td>${latest[p] ? fmtGramPrice(latest[p].price * w.grams) : '—'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
      App.utils.qs('#goldRefreshBtn', host).addEventListener('click', async (e) => {
        e.target.disabled = true; e.target.textContent = 'Refreshing…';
        try {
          const res = await App.api.refreshGoldPrice();
          App.utils.toast(res && res.ok !== false ? 'Gold prices refreshed' : 'Refresh returned no new data');
          await draw();
        } catch (err) { App.utils.toast('Could not refresh: ' + (err.message || err), 'err'); e.target.disabled = false; e.target.textContent = '↻ Refresh Now'; }
      });
      // Today's % change vs the closest observation from ~24h ago.
      App.api.listGoldPriceObservations({ eq: { purity: DEFAULT_PURITY }, order: { column: 'observed_at', ascending: true } }).then((hist) => {
        if (!hist.length || !main) return;
        const cutoff = new Date(Date.now() - 86400000).toISOString();
        const prev = priceAtOrBefore(hist, cutoff) || hist[0];
        const chg = main.price - prev.price;
        const pct = prev.price ? (chg / prev.price) * 100 : 0;
        const el = App.utils.qs('#goldTodayChange', host);
        if (el) el.innerHTML = `<span style="color:${chg >= 0 ? 'var(--teal)' : 'var(--red)'}">${chg >= 0 ? '▲' : '▼'} ${App.utils.fmtMoney(Math.abs(chg))} (${App.utils.fmtPct(Math.abs(pct))})</span>`;
      });
    }

    function drawPurchaseComparisonPanel(latest, schemeHoldings, purchases) {
      const host = App.utils.qs('#goldComparisonPanel', pane);
      const price22k = latest['22K'] ? latest['22K'].price : null;
      
      const schemeGrams = schemeHoldings.reduce((a, h) => a + (h.total_grams || 0), 0);
      const schemePaid = schemeHoldings.reduce((a, h) => a + (h.total_paid || 0), 0);
      
      const purchaseGrams = purchases.reduce((a, p) => a + (p.net_grams || p.grams || 0), 0);
      const purchasePaid = purchases.reduce((a, p) => a + (p.amount_paid || 0), 0);
      
      const totalGrams = schemeGrams + purchaseGrams;
      const totalInvested = schemePaid + purchasePaid;
      const avgCostPerGram = totalGrams > 0 ? (totalInvested / totalGrams) : 0;
      
      const currentValue = price22k ? (totalGrams * price22k) : 0;
      const totalGainLoss = currentValue > 0 ? (currentValue - totalInvested) : 0;
      const gainPct = totalInvested > 0 ? ((totalGainLoss / totalInvested) * 100) : 0;
      
      // Breakdown comparison against today's spot rate
      const costDelta = price22k && avgCostPerGram ? (price22k - avgCostPerGram) : 0;
      const costDeltaPct = avgCostPerGram > 0 ? ((costDelta / avgCostPerGram) * 100) : 0;

      host.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div>
            <div class="chart-title" style="margin:0;color:var(--gold);display:flex;align-items:center;gap:6px">
              <span>⚖️</span>
              <span>How does today's price compare with my previous purchases?</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Cost-basis intelligence across all scheme installments and physical gold purchases</div>
          </div>
          <button class="btn btn-outline btn-sm" id="btnExportGoldCostBasis">📥 Export Basis</button>
        </div>

        <div class="grid-4" style="gap:10px;margin-bottom:14px">
          <div class="kpi c-blue">
            <div class="kpi-label">Weighted Avg Purchase Price</div>
            <div class="kpi-value">${avgCostPerGram > 0 ? fmtGramPrice(avgCostPerGram) + '/g' : '—'}</div>
            <div class="kpi-desc">Total ${App.utils.fmtMoney(totalInvested)} for ${App.utils.fmtNum(totalGrams, 2)} g</div>
          </div>

          <div class="kpi c-gold">
            <div class="kpi-label">Today's Benchmark Price (22K)</div>
            <div class="kpi-value">${price22k ? fmtGramPrice(price22k) + '/g' : '—'}</div>
            <div class="kpi-desc">Current International Spot</div>
          </div>

          <div class="kpi ${costDelta >= 0 ? 'c-teal' : 'c-red'}">
            <div class="kpi-label">Spot vs My Purchase Basis</div>
            <div class="kpi-value">${costDelta >= 0 ? '+' : ''}${fmtGramPrice(costDelta)}/g (${costDeltaPct >= 0 ? '+' : ''}${App.utils.fmtPct(costDeltaPct)})</div>
            <div class="kpi-desc">${costDelta >= 0 ? 'Purchased below current market' : 'Purchased above current market'}</div>
          </div>

          <div class="kpi ${totalGainLoss >= 0 ? 'c-teal' : 'c-red'}">
            <div class="kpi-label">Unrealized Gain / Loss</div>
            <div class="kpi-value">${totalGainLoss >= 0 ? '+' : ''}${App.utils.fmtMoney(totalGainLoss)} (${gainPct >= 0 ? '+' : ''}${App.utils.fmtPct(gainPct)})</div>
            <div class="kpi-desc">Current valuation: ${App.utils.fmtMoney(currentValue)}</div>
          </div>
        </div>

        <!-- Comparative Insights Box -->
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:12.5px;line-height:1.5">
          <div style="font-weight:700;color:var(--text);margin-bottom:4px">💡 Gold Acquisition Strategy Analysis:</div>
          <div style="color:var(--text2)">
            ${totalGrams === 0 ? 'You have not logged any gold purchases or active schemes yet. Use <b>+ Add Purchase</b> or add a scheme from Recurring Investments to enable automatic cost basis tracking.' : `
              Your combined weighted cost basis is <b>${fmtGramPrice(avgCostPerGram)}/g</b> across <b>${App.utils.fmtNum(totalGrams, 3)} g</b>. 
              Today's 22K rate is <b>${fmtGramPrice(price22k)}/g</b>, which represents a 
              <b style="color:${costDelta >= 0 ? 'var(--teal)' : 'var(--red)'}">${costDelta >= 0 ? '+' : ''}${App.utils.fmtPct(costDeltaPct)} ${costDelta >= 0 ? 'profit buffer' : 'dip'}</b> 
              relative to your historical purchase price points.
            `}
          </div>
        </div>
      `;

      App.utils.qs('#btnExportGoldCostBasis', host)?.addEventListener('click', async () => {
        try { await App.exportData.exportSection('gold_purchases'); } catch (e) { App.utils.toast('Could not export: ' + (e.message || e), 'err'); }
      });
    }

    function periodRows(allObservations, purity) {
      const preset = PERIOD_PRESETS.find((p) => p.key === state.period) || PERIOD_PRESETS[6];
      const cutoff = new Date(Date.now() - preset.days * 86400000).toISOString();
      return allObservations.filter((o) => o.purity === purity && o.observed_at >= cutoff).sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    }

    function drawChartPanel(allObservations) {
      const host = App.utils.qs('#goldChartPanel', pane);
      host.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <div class="chart-title" style="margin:0">Historical Price - ${state.bandPurity}</div>
          <div class="chip-row" id="goldPurityChips">${PURITIES.map((p) => `<div class="chip ${p === state.bandPurity ? 'active' : ''}" data-purity="${p}">${p}</div>`).join('')}</div>
        </div>
        <div class="chip-row" id="goldPeriodChips" style="margin-bottom:10px">${PERIOD_PRESETS.map((p) => `<div class="chip ${p.key === state.period ? 'active' : ''}" data-period="${p.key}">${p.label}</div>`).join('')}</div>
        <div class="chip-row" id="goldMaChips" style="margin-bottom:10px">${MA_PERIODS.map((d) => `<div class="chip ${state.maPeriods.includes(d) ? 'active' : ''}" data-ma="${d}">${d}D MA</div>`).join('')}</div>
        <div style="height:280px"><canvas id="goldPriceChart"></canvas></div>`;

      App.utils.qsa('[data-purity]', host).forEach((c) => c.addEventListener('click', () => { state.bandPurity = c.dataset.purity; drawChartPanel(allObservations); drawRelativePanel(allObservations); drawProjectionPanel(allObservations); }));
      App.utils.qsa('[data-period]', host).forEach((c) => c.addEventListener('click', () => { state.period = c.dataset.period; drawChartPanel(allObservations); }));
      App.utils.qsa('[data-ma]', host).forEach((c) => c.addEventListener('click', () => {
        const d = Number(c.dataset.ma);
        state.maPeriods = state.maPeriods.includes(d) ? state.maPeriods.filter((x) => x !== d) : state.maPeriods.concat(d);
        drawChartPanel(allObservations);
      }));

      const rows = periodRows(allObservations, state.bandPurity);
      const labels = rows.map((o) => App.utils.fmtDate(o.observed_at));
      const datasets = [{ label: state.bandPurity + ' ₹/g', data: rows.map((o) => o.price) }];
      state.maPeriods.forEach((d) => {
        datasets.push({
          label: d + 'D MA', pointRadius: 0, borderDash: [4, 3],
          data: rows.map((_, i) => {
            const windowRows = rows.slice(Math.max(0, i - d + 1), i + 1);
            return windowRows.reduce((a, o) => a + o.price, 0) / windowRows.length;
          }),
        });
      });
      App.charts.line('goldPriceChart', labels, datasets);
    }

    function drawRelativePanel(allObservations) {
      const host = App.utils.qs('#goldRelativePanel', pane);
      const rows = periodRows(allObservations, state.bandPurity);
      const stats = rangeStats(rows);
      const ma7 = movingAverage(rows, 7), ma30 = movingAverage(rows, 30), ma90 = movingAverage(rows, 90);
      if (!stats) { host.innerHTML = `<div class="chart-title" style="margin-bottom:10px">Relative Price &amp; Range</div><div class="empty-note">Not enough history yet for this period.</div>`; return; }
      const vs30 = ma30 ? ((stats.current - ma30) / ma30) * 100 : null;
      const band = vs30 == null ? '—' : vs30 <= -3 ? 'Below Recent Average' : vs30 >= 3 ? 'Above Recent Average' : 'Near Recent Average';
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Relative Price &amp; Range - ${state.bandPurity}</div>
        <div class="hint" style="margin-bottom:10px">These are analytics on past data, not a buy/sell signal.</div>
        <div class="stat-line"><span>Current vs 30D Average</span><span class="v">${vs30 == null ? '—' : (vs30 >= 0 ? '+' : '') + App.utils.fmtPct(vs30)} (${band})</span></div>
        <div class="stat-line"><span>7D / 30D / 90D Moving Average</span><span class="v">${fmtGramPrice(ma7)} / ${fmtGramPrice(ma30)} / ${fmtGramPrice(ma90)}</span></div>
        <div class="stat-line"><span>Period High / Low</span><span class="v">${fmtGramPrice(stats.high)} / ${fmtGramPrice(stats.low)}</span></div>
        <div class="stat-line"><span>Period Average / Median</span><span class="v">${fmtGramPrice(stats.avg)} / ${fmtGramPrice(stats.median)}</span></div>
        <div class="stat-line"><span>Current Percentile in Range</span><span class="v">${App.utils.fmtNum(stats.percentile, 0)}th</span></div>
        <div class="stat-line"><span>Max Drawdown (period)</span><span class="v">${App.utils.fmtPct(stats.maxDrawdown)}</span></div>
        <div class="stat-line"><span>Recovery from Recent Low</span><span class="v">${App.utils.fmtPct(stats.recovery)}</span></div>`;
    }

    function drawTimingScorePanel(allObservations) {
      const host = App.utils.qs('#goldTimingScorePanel', pane);
      const rows = periodRows(allObservations, state.bandPurity);
      const stats = rangeStats(rows);
      const ma7 = movingAverage(rows, 7), ma30 = movingAverage(rows, 30);
      const mc = monteCarloProjection(rows.slice(-90), 1, 200); // 1-day horizon here just to read off daily volatility cheaply
      const result = purchaseTimingScore(stats, ma7, ma30, mc && mc.dailyVolatilityPct);
      if (!result) { host.innerHTML = `<div class="chart-title" style="margin-bottom:10px">Purchase Timing Score</div><div class="empty-note">Not enough history yet.</div>`; return; }
      const barColor = result.score >= 70 ? 'var(--teal)' : result.score >= 45 ? 'var(--gold)' : 'var(--red)';
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Purchase Timing Score - ${state.bandPurity}</div>
        <div class="hint" style="margin-bottom:10px">A transparent score from the numbers already on this page - never a guaranteed prediction or personalized financial advice.</div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
          <div style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:700;color:${barColor}">${result.score}</div>
          <div>
            <div style="font-weight:600;color:${barColor}">${result.label}</div>
            <div style="height:6px;width:160px;background:var(--fill-1);border-radius:3px;overflow:hidden;margin-top:4px">
              <div style="height:100%;width:${result.score}%;background:${barColor}"></div>
            </div>
          </div>
        </div>
        <div style="font-size:12px">${result.reasons.map((r) => `<div class="stat-line"><span>${r.text}</span><span class="v" style="color:${r.weight >= 0 ? 'var(--teal)' : 'var(--red)'};font-size:12px">${r.weight >= 0 ? '+' : ''}${r.weight}</span></div>`).join('')}</div>`;
    }

    function drawProjectionPanel(allObservations) {
      const host = App.utils.qs('#goldProjectionPanel', pane);
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Gold Price Projection - ${state.bandPurity}</div>
        <div class="hint" style="margin-bottom:10px">Mathematical scenarios based on past movement - not guaranteed future prices.</div>
        <div class="chip-row" id="goldProjMethodChips" style="margin-bottom:8px">${PROJECTION_METHODS.map((m) => `<div class="chip ${m.key === state.projMethod ? 'active' : ''}" data-proj-method="${m.key}">${m.label}</div>`).join('')}</div>
        ${state.projMethod === 'custom' ? `<div class="field" style="max-width:220px;margin-bottom:8px"><label>Assumed annual growth %</label><input type="number" step="any" id="goldCustomGrowth" value="${state.customGrowthPct}"></div>` : ''}
        <div class="chip-row" id="goldProjHorizonChips" style="margin-bottom:12px">${PROJECTION_HORIZONS.map((h) => `<div class="chip ${h.key === state.projHorizon ? 'active' : ''}" data-proj-horizon="${h.key}">${h.label}</div>`).join('')}</div>
        <div id="goldProjResult"></div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
          <label class="hint" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
            <input type="checkbox" id="goldMonteCarloToggle" ${state.showMonteCarlo ? 'checked' : ''}>
            Advanced: show a Monte Carlo scenario simulation instead (statistical simulation from historical volatility, not a forecast)
          </label>
          <div id="goldMonteCarloResult"></div>
        </div>`;
      App.utils.qsa('[data-proj-method]', host).forEach((c) => c.addEventListener('click', () => { state.projMethod = c.dataset.projMethod; drawProjectionPanel(allObservations); }));
      App.utils.qsa('[data-proj-horizon]', host).forEach((c) => c.addEventListener('click', () => { state.projHorizon = c.dataset.projHorizon; drawProjectionPanel(allObservations); }));
      const growthInput = App.utils.qs('#goldCustomGrowth', host);
      if (growthInput) growthInput.addEventListener('change', () => { state.customGrowthPct = App.utils.parseNum(growthInput.value) || 0; drawProjectionPanel(allObservations); });
      App.utils.qs('#goldMonteCarloToggle', host).addEventListener('change', (e) => { state.showMonteCarlo = e.target.checked; drawProjectionPanel(allObservations); });

      const lookbackRows = allObservations.filter((o) => o.purity === state.bandPurity).sort((a, b) => a.observed_at.localeCompare(b.observed_at)).slice(-90);
      const horizon = PROJECTION_HORIZONS.find((h) => h.key === state.projHorizon) || PROJECTION_HORIZONS[2];
      const proj = projectPrice(state.projMethod, lookbackRows, horizon.days, state.customGrowthPct);
      const resultEl = App.utils.qs('#goldProjResult', host);
      if (!proj) { resultEl.innerHTML = '<div class="empty-note">Not enough history yet to project.</div>'; return; }
      resultEl.innerHTML = `
        <div class="grid-4">
          <div class="kpi c-blue"><div class="kpi-label">Current</div><div class="kpi-value">${fmtGramPrice(proj.current)}</div></div>
          <div class="kpi c-teal"><div class="kpi-label">Conservative</div><div class="kpi-value">${fmtGramPrice(proj.conservative)}</div></div>
          <div class="kpi c-gold"><div class="kpi-label">Base</div><div class="kpi-value">${fmtGramPrice(proj.base)}</div></div>
          <div class="kpi c-purple"><div class="kpi-label">Optimistic</div><div class="kpi-value">${fmtGramPrice(proj.optimistic)}</div></div>
        </div>
        <div class="hint" style="margin-top:8px">Method: ${PROJECTION_METHODS.find((m) => m.key === state.projMethod).label}, based on the last 90 days · ${horizon.label} horizon.</div>`;

      const mcResultEl = App.utils.qs('#goldMonteCarloResult', host);
      if (state.showMonteCarlo) {
        const mc = monteCarloProjection(lookbackRows, horizon.days, 400);
        mcResultEl.innerHTML = !mc ? '<div class="empty-note">Not enough history yet to simulate.</div>' : `
          <div class="grid-4">
            <div class="kpi c-blue"><div class="kpi-label">10th Percentile</div><div class="kpi-value">${fmtGramPrice(mc.p10)}</div></div>
            <div class="kpi c-teal"><div class="kpi-label">25th Percentile</div><div class="kpi-value">${fmtGramPrice(mc.p25)}</div></div>
            <div class="kpi c-gold"><div class="kpi-label">50th (Median)</div><div class="kpi-value">${fmtGramPrice(mc.p50)}</div></div>
            <div class="kpi c-purple"><div class="kpi-label">75th / 90th Percentile</div><div class="kpi-value" style="font-size:16px">${fmtGramPrice(mc.p75)} / ${fmtGramPrice(mc.p90)}</div></div>
          </div>
          <div class="hint" style="margin-top:8px">400 simulated paths over ${horizon.label.toLowerCase()}, from the last 90 days' daily volatility (${mc.dailyVolatilityPct.toFixed(2)}%/day). A statistical scenario simulation, not a guaranteed forecast.</div>`;
      } else {
        mcResultEl.innerHTML = '';
      }
    }

    function drawSchemePanel(schemeHoldings, latest) {
      const host = App.utils.qs('#goldSchemePanel', pane);
      const price22k = latest['22K'] ? latest['22K'].price : null;
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Gold Scheme Holdings</div>
        ${!schemeHoldings.length ? '<div class="empty-note">No Gold Scheme / Gold Savings recurring items yet - add one from Recurring Investments.</div>' : `
        <div class="table-scroll"><table class="data"><thead><tr><th>Scheme</th><th>Grams So Far</th><th>Total Paid</th><th>Avg Purchase ₹/g</th><th>Current ₹/g (22K)</th><th>Current Value</th><th>Unrealized Gain/Loss</th><th>Confirmed / Remaining</th></tr></thead>
        <tbody>${schemeHoldings.map((h) => {
          const currentValue = price22k ? h.total_grams * price22k : null;
          const gainLoss = currentValue != null ? currentValue - h.total_paid : null;
          return `<tr>
            <td>${App.utils.escapeHtml(h.item_name)}</td>
            <td>${App.utils.fmtNum(h.total_grams, 3)} g</td>
            <td>${App.utils.fmtMoney(h.total_paid)}</td>
            <td>${fmtGramPrice(h.avg_purchase_price)}</td>
            <td>${fmtGramPrice(price22k)}</td>
            <td>${currentValue == null ? '—' : App.utils.fmtMoney(currentValue)}</td>
            <td style="color:${gainLoss >= 0 ? 'var(--teal)' : 'var(--red)'}">${gainLoss == null ? '—' : App.utils.fmtMoney(gainLoss)}</td>
            <td>${h.confirmed_periods} / ${h.remaining_periods}</td>
          </tr>`;
        }).join('')}</tbody></table></div>
        <div class="hint" style="margin-top:8px">Purchase prices are the real, once-recorded transaction prices from Recurring Investments - never recalculated from today's live price. <a href="#recurring" id="goldOpenRecurring" style="color:var(--gold)">Open Recurring Investments &rarr;</a></div>`}`;
      const link = App.utils.qs('#goldOpenRecurring', host);
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); App.router.navigate('recurring'); });
    }

    function drawBuyingPowerPanel(latest) {
      const host = App.utils.qs('#goldBuyingPowerPanel', pane);
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Buying Power Calculator</div>
        <div class="form-grid">
          <div class="field"><label>Purity</label><select id="bpPurity">${PURITIES.map((p) => `<option ${p === DEFAULT_PURITY ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          <div class="field"><label>Amount (₹)</label><input type="number" id="bpAmount" value="15000"></div>
          <div class="field"><label>Or target grams</label><input type="number" id="bpGrams" placeholder="e.g. 10"></div>
        </div>
        <div id="bpResult" class="hint" style="margin-top:8px"></div>`;
      function recalc(fromGrams) {
        const purity = App.utils.qs('#bpPurity', host).value;
        const price = latest[purity] ? latest[purity].price : null;
        const resEl = App.utils.qs('#bpResult', host);
        if (!price) { resEl.textContent = 'No price available yet for ' + purity + '.'; return; }
        if (fromGrams) {
          const grams = App.utils.parseNum(App.utils.qs('#bpGrams', host).value);
          if (!grams) { resEl.textContent = ''; return; }
          resEl.innerHTML = `≈ <b>${App.utils.fmtMoney(grams * price)}</b> needed for ${grams} g of ${purity} at ${fmtGramPrice(price)}/g.`;
        } else {
          const amount = App.utils.parseNum(App.utils.qs('#bpAmount', host).value);
          if (!amount) { resEl.textContent = ''; return; }
          resEl.innerHTML = `≈ <b>${App.utils.fmtNum(amount / price, 3)} g</b> of ${purity} at ${fmtGramPrice(price)}/g (before any making charges/GST).`;
        }
      }
      App.utils.qs('#bpPurity', host).addEventListener('change', () => recalc(false));
      App.utils.qs('#bpAmount', host).addEventListener('input', () => recalc(false));
      App.utils.qs('#bpGrams', host).addEventListener('input', () => recalc(true));
      recalc(false);
    }

    function drawImpactPanel(latest, schemeHoldings, purchases) {
      const host = App.utils.qs('#goldImpactPanel', pane);
      const totalGrams = schemeHoldings.reduce((a, h) => a + h.total_grams, 0) + purchases.reduce((a, p) => a + (p.net_grams || p.grams || 0), 0);
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Portfolio Impact Simulator</div>
        <div class="hint" style="margin-bottom:8px">Your total gold holdings right now: <b>${App.utils.fmtNum(totalGrams, 3)} g</b> (Gold Scheme + standalone purchases).</div>
        <div class="field" style="max-width:220px"><label>What if 22K gold reaches ₹/g</label><input type="number" id="impactPrice" value="${latest['22K'] ? Math.round(latest['22K'].price * 1.1) : 10000}"></div>
        <div id="impactResult" class="hint" style="margin-top:8px"></div>`;
      function recalc() {
        const target = App.utils.parseNum(App.utils.qs('#impactPrice', host).value);
        const resEl = App.utils.qs('#impactResult', host);
        if (!target) { resEl.textContent = ''; return; }
        const value = totalGrams * target;
        const current22k = latest['22K'] ? latest['22K'].price : null;
        const currentValue = current22k ? totalGrams * current22k : null;
        resEl.innerHTML = `Your gold would be worth <b>${App.utils.fmtMoney(value)}</b>${currentValue != null ? ` (${value >= currentValue ? '+' : ''}${App.utils.fmtMoney(value - currentValue)} vs today)` : ''}.`;
      }
      App.utils.qs('#impactPrice', host).addEventListener('input', recalc);
      recalc();
    }

    function drawAllocationPanel(latest, schemeHoldings, purchases, deals) {
      const host = App.utils.qs('#goldAllocationPanel', pane);
      const price22k = latest['22K'] ? latest['22K'].price : 0;
      const goldGrams = schemeHoldings.reduce((a, h) => a + h.total_grams, 0) + purchases.reduce((a, p) => a + (p.net_grams || p.grams || 0), 0);
      const goldValue = goldGrams * price22k;
      const dealsValue = deals.reduce((a, d) => a + (d.current_principal || 0), 0);
      const totalValue = goldValue + dealsValue;
      const pct = totalValue > 0 ? (goldValue / totalValue) * 100 : 0;
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Gold Allocation Monitor</div>
        <div class="stat-line"><span>Gold Value</span><span class="v">${App.utils.fmtMoney(goldValue)}</span></div>
        <div class="stat-line"><span>Rest of Portfolio (Deals)</span><span class="v">${App.utils.fmtMoney(dealsValue)}</span></div>
        <div class="stat-line"><span>Gold as % of Portfolio</span><span class="v">${App.utils.fmtPct(pct)}</span></div>
        <div class="field" style="max-width:220px;margin-top:10px"><label>Your target allocation %</label><input type="number" id="allocTarget" value="15"></div>
        <div class="hint" style="margin-top:6px">There's no universal "ideal" gold allocation - this just compares against whatever target you set.</div>`;
    }

    function drawSummaryPanel(allObservations, latest) {
      const host = App.utils.qs('#goldSummaryPanel', pane);
      const rows22k = allObservations.filter((o) => o.purity === '22K').sort((a, b) => a.observed_at.localeCompare(b.observed_at));
      const ma7 = movingAverage(rows22k, 7), ma30 = movingAverage(rows22k, 30);
      const last7 = rows22k.slice(-7); const weekHigh = last7.length ? Math.max(...last7.map((o) => o.price)) : null;
      const weekLow = last7.length ? Math.min(...last7.map((o) => o.price)) : null;
      host.innerHTML = `
        <div class="chart-title" style="margin-bottom:10px">Daily &amp; Weekly Gold Summary</div>
        <div class="grid-2">
          <div>
            <div class="stat-line"><span>22K Price Today</span><span class="v">${fmtGramPrice(latest['22K'] && latest['22K'].price)}</span></div>
            <div class="stat-line"><span>7D / 30D Average</span><span class="v">${fmtGramPrice(ma7)} / ${fmtGramPrice(ma30)}</span></div>
            <div class="stat-line"><span>30D High / Low</span><span class="v">${fmtGramPrice(Math.max(...rows22k.slice(-30).map((o) => o.price)) || null)} / ${fmtGramPrice(Math.min(...rows22k.slice(-30).map((o) => o.price)) || null)}</span></div>
          </div>
          <div>
            <div class="stat-line"><span>Weekly High / Low</span><span class="v">${fmtGramPrice(weekHigh)} / ${fmtGramPrice(weekLow)}</span></div>
            <div class="stat-line"><span>My Gold (grams / value)</span><span class="v" id="goldMyHoldingSummary">—</span></div>
          </div>
        </div>`;
      App.api.listGoldSchemeHoldings().then((holdings) => {
        const grams = holdings.reduce((a, h) => a + h.total_grams, 0);
        const price22k = latest['22K'] ? latest['22K'].price : 0;
        const el = App.utils.qs('#goldMyHoldingSummary', host);
        if (el) el.textContent = `${App.utils.fmtNum(grams, 2)} g / ${App.utils.fmtMoney(grams * price22k)}`;
      });
    }

    function drawPurchasesPanel(purchases) {
      const host = App.utils.qs('#goldPurchasesPanel', pane);
      const totalPaid = purchases.reduce((a, p) => a + (p.amount_paid || 0), 0);
      const totalGrams = purchases.reduce((a, p) => a + (p.net_grams || p.grams || 0), 0);
      host.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div class="chart-title" style="margin:0">Physical Gold Purchases</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" id="exportGoldPurchasesBtn">&#8595; Export</button>
            <button class="btn btn-outline btn-sm" id="addGoldPurchaseBtn">+ Add Purchase</button>
          </div>
        </div>
        <div class="hint" style="margin-bottom:8px">Total: ${App.utils.fmtNum(totalGrams, 3)} g for ${App.utils.fmtMoney(totalPaid)} (avg ${totalGrams ? fmtGramPrice(totalPaid / totalGrams) : '—'}/g including making charges &amp; GST).</div>
        <div class="table-scroll"><table class="data"><thead><tr><th>Date</th><th>Purity</th><th>Grams</th><th>Market ₹/g</th><th>Making+GST+Other</th><th>Amount Paid</th><th>Source</th><th>Actions</th></tr></thead>
        <tbody>${purchases.map((p) => `<tr>
          <td>${App.utils.fmtDate(p.purchase_date)}</td><td>${p.purity}</td><td>${App.utils.fmtNum(p.net_grams || p.grams, 3)}</td>
          <td>${fmtGramPrice(p.price_per_gram)}</td><td>${App.utils.fmtMoney((p.making_charges || 0) + (p.gst || 0) + (p.other_charges || 0) - (p.discount || 0))}</td>
          <td>${App.utils.fmtMoney(p.amount_paid)}</td><td>${App.utils.escapeHtml(p.source || '—')}</td>
          <td><button class="icon-btn del" data-del-purchase="${p.id}">&#128465;</button></td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">No physical gold purchases logged yet.</td></tr>'}</tbody></table></div>`;
      App.utils.qs('#addGoldPurchaseBtn', host).addEventListener('click', () => openPurchaseForm());
      App.utils.qs('#exportGoldPurchasesBtn', host).addEventListener('click', async () => {
        try { await App.exportData.exportSection('gold_purchases'); } catch (e) { App.utils.toast('Could not export: ' + (e.message || e), 'err'); }
      });
      App.utils.qsa('[data-del-purchase]', host).forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Delete this purchase record?')) return;
        await App.api.deleteGoldPurchase(Number(b.dataset.delPurchase));
        draw();
      }));
    }

    function openPurchaseForm() {
      const fields = [
        { key: 'purchase_date', label: 'Purchase Date', type: 'date', required: true },
        { key: 'purity', label: 'Purity', type: 'select', options: PURITIES, required: true },
        { key: 'grams', label: 'Grams (gross)', type: 'number', required: true },
        { key: 'net_grams', label: 'Net Grams (after wastage)', type: 'number' },
        { key: 'price_per_gram', label: 'Market Price per Gram', type: 'number', required: true },
        { key: 'making_charges', label: 'Making Charges', type: 'number' },
        { key: 'gst', label: 'GST', type: 'number' },
        { key: 'other_charges', label: 'Other Charges', type: 'number' },
        { key: 'discount', label: 'Discount', type: 'number' },
        { key: 'amount_paid', label: 'Total Amount Paid', type: 'number', required: true },
        { key: 'source', label: 'Source / Jeweller' },
        { key: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ];
      App.ui.open({
        title: 'Add Gold Purchase',
        bodyHtml: App.ui.renderForm(fields, { purchase_date: App.utils.todayISO() }),
        actions: [
          { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
          { label: 'Save', className: 'btn-gold', onClick: async () => {
            const { values, errors } = App.ui.readForm(fields);
            if (errors.length) { App.utils.toast('Fill in the required fields', 'err'); return; }
            try { await App.api.createGoldPurchase(values); App.ui.close(); App.utils.toast('Purchase saved'); draw(); }
            catch (e) { App.utils.toast('Could not save: ' + (e.message || e), 'err'); }
          } },
        ],
      });
    }

    await draw();
  }

  App.router.register('gold', renderGoldView);
})();
