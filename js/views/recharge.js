/* Recharge Intelligence India — Integrated View inside Investment OS
   Provides authentic, source-verified comparison of prepaid mobile recharge
   plans across Reliance Jio, Bharti Airtel, Vodafone Idea (Vi), and BSNL.
   Includes a direct launcher to open in a dedicated browser tab at /recharge.
*/
window.App = window.App || {};

(function () {
  let rechargeState = {
    plans: [],
    selectedProvider: 'all',
    selectedCircle: 'National',
    selectedCategory: 'all',
    searchQuery: '',
    maxPrice: 4000,
    minValidity: 1,
    dataAllowanceFilter: 'all',
    require5G: false,
    sortBy: 'value_score',
    pinnedPlanIds: new Set(),
    lastRefreshedAt: null,
    isRefreshing: false
  };

  const TELECOM_CIRCLES = [
    'National',
    'Delhi NCR',
    'Mumbai',
    'Maharashtra & Goa',
    'Karnataka',
    'Tamil Nadu & Chennai',
    'Andhra Pradesh & Telangana',
    'Gujarat',
    'Kerala',
    'UP East',
    'UP West',
    'Kolkata & West Bengal',
    'Punjab',
    'Rajasthan',
    'Madhya Pradesh & CG'
  ];

  async function fetchPlansData(forceRefresh = false) {
    try {
      const res = await fetch(`/api/plans${forceRefresh ? '?refresh=true' : ''}`);
      const json = await res.json();
      if (json.success && json.plans) {
        rechargeState.plans = json.plans;
        rechargeState.lastRefreshedAt = json.cachedAt;
      }
    } catch (e) {
      console.warn('Could not fetch plans:', e);
    }
  }

  function getFilteredPlans() {
    let list = [...rechargeState.plans];

    if (rechargeState.selectedProvider !== 'all') {
      list = list.filter(p => p.provider.toLowerCase() === rechargeState.selectedProvider.toLowerCase());
    }

    list = list.filter(p => p.price <= rechargeState.maxPrice);
    list = list.filter(p => p.validityDays >= rechargeState.minValidity);

    if (rechargeState.selectedCategory !== 'all') {
      if (rechargeState.selectedCategory === 'trai_mandated') {
        list = list.filter(p => p.validityDays === 30 || p.category === 'trai_mandated');
      } else {
        list = list.filter(p => p.category === rechargeState.selectedCategory);
      }
    }

    if (rechargeState.selectedCircle && rechargeState.selectedCircle !== 'National') {
      list = list.filter(p => !p.circleScope || p.circleScope === 'National' || p.circleScope.toLowerCase().includes(rechargeState.selectedCircle.toLowerCase()));
    }

    if (rechargeState.dataAllowanceFilter !== 'all') {
      if (rechargeState.dataAllowanceFilter === '1.5') {
        list = list.filter(p => p.dailyDataGB === 1.5);
      } else if (rechargeState.dataAllowanceFilter === '2.0') {
        list = list.filter(p => p.dailyDataGB && p.dailyDataGB >= 2.0);
      } else if (rechargeState.dataAllowanceFilter === 'voice_only') {
        list = list.filter(p => p.dailyDataGB === null);
      }
    }

    if (rechargeState.require5G) {
      list = list.filter(p => p.is5GEligible === true);
    }

    if (rechargeState.searchQuery) {
      const q = rechargeState.searchQuery.toLowerCase().trim();
      list = list.filter(p => {
        const matchPrice = String(p.price).includes(q);
        const matchProvider = p.provider.toLowerCase().includes(q);
        const matchCalling = (p.calling || '').toLowerCase().includes(q);
        const matchNotes = (p.notes || '').toLowerCase().includes(q);
        const matchPerks = (p.additionalBenefits || []).some(b => b.toLowerCase().includes(q));
        return matchPrice || matchProvider || matchCalling || matchNotes || matchPerks;
      });
    }

    list.sort((a, b) => {
      switch (rechargeState.sortBy) {
        case 'value_score': return b.valueScore - a.valueScore;
        case 'price_asc': return a.price - b.price;
        case 'price_desc': return b.price - a.price;
        case 'validity_desc': return b.validityDays - a.validityDays;
        case 'cost_per_day_asc': return a.costPerDay - b.costPerDay;
        case 'cost_per_gb_asc':
          if (!a.costPerGB) return 1;
          if (!b.costPerGB) return -1;
          return a.costPerGB - b.costPerGB;
        case 'daily_data_desc': return (b.dailyDataGB || 0) - (a.dailyDataGB || 0);
        default: return b.valueScore - a.valueScore;
      }
    });

    return list;
  }

  function openComparisonModal() {
    const pinned = rechargeState.plans.filter(p => rechargeState.pinnedPlanIds.has(p.id));
    if (!pinned.length) {
      App.utils.toast('Select at least 1 plan to compare.', 'info');
      return;
    }

    const html = `
      <div style="overflow-x:auto">
        <table class="table" style="width:100%;font-size:12.5px;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border2);background:var(--fill-2)">
              <th style="padding:10px;text-align:left">Metric</th>
              ${pinned.map(p => `
                <th style="padding:10px;text-align:left;min-width:130px">
                  <div style="font-weight:700;color:var(--gold)">${p.provider}</div>
                  <div style="font-size:16px;font-weight:800;color:var(--text)">₹${p.price}</div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Validity</td>
              ${pinned.map(p => `<td style="padding:8px 10px"><strong>${p.validityDays} Days</strong></td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Daily Data</td>
              ${pinned.map(p => `<td style="padding:8px 10px">${p.dailyDataGB ? p.dailyDataGB + ' GB/day' : 'No Daily Cap'}</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Total Data</td>
              ${pinned.map(p => `<td style="padding:8px 10px">${p.totalDataGB ? p.totalDataGB + ' GB' : '—'}</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Cost / Day</td>
              ${pinned.map(p => `<td style="padding:8px 10px;color:var(--teal);font-weight:700">₹${p.costPerDay}</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Cost / GB</td>
              ${pinned.map(p => `<td style="padding:8px 10px">${p.costPerGB ? '₹' + p.costPerGB : 'N/A'}</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">5G Benefits</td>
              ${pinned.map(p => `<td style="padding:8px 10px">${p.is5GEligible ? '⚡ Unlimited 5G' : 'Standard 4G'}</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Calling</td>
              ${pinned.map(p => `<td style="padding:8px 10px">${p.calling}</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">SMS</td>
              ${pinned.map(p => `<td style="padding:8px 10px">${p.sms}</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Value Score</td>
              ${pinned.map(p => `<td style="padding:8px 10px;font-weight:700;color:var(--gold)">${p.valueScore} / 100</td>`).join('')}
            </tr>
            <tr style="border-bottom:1px solid var(--border2)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Perks</td>
              ${pinned.map(p => `<td style="padding:8px 10px">${(p.additionalBenefits || []).join(', ') || 'None'}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:8px 10px;font-weight:600;color:var(--text2)">Official Recharge</td>
              ${pinned.map(p => `<td style="padding:8px 10px"><a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-gold">Recharge ↗</a></td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;

    App.ui.open({
      title: '⚖️ Side-by-Side Plan Comparison',
      bodyHtml: html,
      actions: [
        { label: 'Clear Pinned', className: 'btn-outline', onClick: () => { rechargeState.pinnedPlanIds.clear(); App.ui.close(); renderRechargeView(); } },
        { label: 'Close', className: 'btn-gold', onClick: App.ui.close }
      ]
    });
  }

  async function openDiagnosticsModal() {
    try {
      const res = await fetch('/api/diagnostics');
      const diag = await res.json();
      const html = `
        <div style="font-size:12.5px">
          <div style="background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;padding:12px;margin-bottom:14px">
            <div><strong>Cache Status:</strong> ${diag.cacheState.totalPlansCached} verified tariffs cached at ${new Date(diag.cacheState.cachedAt).toLocaleTimeString()}</div>
            <div style="margin-top:4px"><strong>TTL Window:</strong> ${diag.cacheState.ttlMinutes} minutes before auto-refresh</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${diag.providers.map(p => `
              <div style="background:var(--card);border:1px solid var(--border2);border-radius:8px;padding:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <strong>${p.name}</strong>
                  <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(22,201,163,0.15);color:var(--teal);font-weight:700">
                    ● ${p.status} (${p.latencyMs}ms)
                  </span>
                </div>
                <div style="font-size:11.5px;color:var(--text3);margin-bottom:4px;word-break:break-all">
                  Gateway: <a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">${p.sourceUrl}</a>
                </div>
                <div style="font-size:11.5px;color:var(--text2)">
                  Indexed Plans: <strong>${p.itemCount}</strong> • Last Verified: <strong>${new Date(p.lastChecked).toLocaleTimeString()}</strong>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      App.ui.open({
        title: '⚡ Telecom Gateway Health & Diagnostics',
        bodyHtml: html,
        actions: [{ label: 'Close', className: 'btn-gold', onClick: App.ui.close }]
      });
    } catch (e) {
      App.utils.toast('Failed to load diagnostics: ' + e.message, 'err');
    }
  }

  async function renderRechargeView() {
    const pane = App.utils.qs('#pane-recharge');
    if (!pane) return;

    if (!rechargeState.plans.length) {
      pane.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading verified telecom tariffs from Jio, Airtel, Vi, and BSNL...</div>';
      await fetchPlansData();
    }

    const plans = rechargeState.plans;
    const validPrices = plans.map(p => p.price);
    const validValidities = plans.map(p => p.validityDays);
    const minPrice = validPrices.length ? Math.min(...validPrices) : 0;
    const maxValidity = validValidities.length ? Math.max(...validValidities) : 0;
    const topValuePlan = [...plans].sort((a, b) => b.valueScore - a.valueScore)[0];
    const filtered = getFilteredPlans();

    pane.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px">
        <div>
          <h2 style="font-size:22px;color:var(--text);display:flex;align-items:center;gap:8px">
            <span>⚡</span> Recharge Intelligence India
          </h2>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">
            Source-verified prepaid mobile recharge tariffs across Reliance Jio, Bharti Airtel, Vi, and BSNL.
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <a href="/recharge" target="_blank" rel="noopener noreferrer" class="btn btn-gold" style="text-decoration:none" title="Open full recharge intelligence suite in a new browser tab">
            Open in New Tab ↗
          </a>
          <button class="btn btn-outline" id="btnRechargeRefresh" title="Re-query official telecom feeds">
            ⟳ Refresh Live
          </button>
          <button class="btn btn-outline" id="btnRechargeDiagnostics" title="Inspect operator endpoints & latency">
            ⚡ Diagnostics
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
        <div class="kpi">
          <div style="font-size:11px;text-transform:uppercase;color:var(--text3);font-weight:600">Verified Tariffs</div>
          <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px">${plans.length} Plans</div>
          <div style="font-size:11px;color:var(--text2)">Jio, Airtel, Vi & BSNL</div>
        </div>
        <div class="kpi">
          <div style="font-size:11px;text-transform:uppercase;color:var(--text3);font-weight:600">Lowest Entry Price</div>
          <div style="font-size:22px;font-weight:700;color:var(--teal);margin-top:4px">₹${minPrice}</div>
          <div style="font-size:11px;color:var(--text2)">National active pack</div>
        </div>
        <div class="kpi">
          <div style="font-size:11px;text-transform:uppercase;color:var(--text3);font-weight:600">Longest Validity</div>
          <div style="font-size:22px;font-weight:700;color:var(--blue);margin-top:4px">${maxValidity} Days</div>
          <div style="font-size:11px;color:var(--text2)">Annual long-stay pack</div>
        </div>
        <div class="kpi">
          <div style="font-size:11px;text-transform:uppercase;color:var(--text3);font-weight:600">Top Value Score</div>
          <div style="font-size:22px;font-weight:700;color:var(--gold);margin-top:4px">${topValuePlan ? '₹' + topValuePlan.price : '—'}</div>
          <div style="font-size:11px;color:var(--text2)">${topValuePlan ? topValuePlan.provider + ' (' + topValuePlan.valueScore + '/100)' : '—'}</div>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div class="panel" style="padding:16px;margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="rechargeProviderBtns">
            <button class="chip ${rechargeState.selectedProvider === 'all' ? 'active' : ''}" data-p="all">All Operators</button>
            <button class="chip ${rechargeState.selectedProvider === 'jio' ? 'active' : ''}" data-p="jio">🔵 Jio</button>
            <button class="chip ${rechargeState.selectedProvider === 'airtel' ? 'active' : ''}" data-p="airtel">🔴 Airtel</button>
            <button class="chip ${rechargeState.selectedProvider === 'vi' ? 'active' : ''}" data-p="vi">🟡 Vi</button>
            <button class="chip ${rechargeState.selectedProvider === 'bsnl' ? 'active' : ''}" data-p="bsnl">🔷 BSNL</button>
          </div>

          <button class="btn btn-outline btn-sm" id="btnRechargeReset">Reset Filters</button>
        </div>

        <div style="margin-bottom:12px">
          <input type="text" id="rechargeSearchInput" placeholder="Search by plan price (e.g. 299), data allowance (e.g. 1.5 GB), 5G, or perks..."
            value="${App.utils.escapeHtml(rechargeState.searchQuery)}"
            style="width:100%;padding:9px 12px;background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:12.5px;outline:none">
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
          <div>
            <label style="font-size:10.5px;text-transform:uppercase;color:var(--text3);font-weight:600;display:block;margin-bottom:4px">Circle Scope</label>
            <select id="rechargeCircleSelect" style="width:100%;padding:8px 10px;background:var(--card);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:12px">
              ${TELECOM_CIRCLES.map(c => `<option value="${c}" ${rechargeState.selectedCircle === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>

          <div>
            <label style="font-size:10.5px;text-transform:uppercase;color:var(--text3);font-weight:600;display:block;margin-bottom:4px">Pack Category</label>
            <select id="rechargeCategorySelect" style="width:100%;padding:8px 10px;background:var(--card);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:12px">
              <option value="all" ${rechargeState.selectedCategory === 'all' ? 'selected' : ''}>All Categories</option>
              <option value="daily_data" ${rechargeState.selectedCategory === 'daily_data' ? 'selected' : ''}>Daily Data Packs (1.5GB/2GB)</option>
              <option value="voice_only" ${rechargeState.selectedCategory === 'voice_only' ? 'selected' : ''}>Voice & Budget Focus</option>
              <option value="annual" ${rechargeState.selectedCategory === 'annual' ? 'selected' : ''}>Annual (365 Days)</option>
              <option value="trai_mandated" ${rechargeState.selectedCategory === 'trai_mandated' ? 'selected' : ''}>TRAI 30-Day Calendar Month</option>
            </select>
          </div>

          <div>
            <label style="font-size:10.5px;text-transform:uppercase;color:var(--text3);font-weight:600;display:block;margin-bottom:4px">Daily Data Quota</label>
            <select id="rechargeDataSelect" style="width:100%;padding:8px 10px;background:var(--card);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:12px">
              <option value="all" ${rechargeState.dataAllowanceFilter === 'all' ? 'selected' : ''}>Any Quota</option>
              <option value="1.5" ${rechargeState.dataAllowanceFilter === '1.5' ? 'selected' : ''}>1.5 GB / Day</option>
              <option value="2.0" ${rechargeState.dataAllowanceFilter === '2.0' ? 'selected' : ''}>2.0+ GB / Day</option>
              <option value="voice_only" ${rechargeState.dataAllowanceFilter === 'voice_only' ? 'selected' : ''}>No Daily Cap / Lump Sum</option>
            </select>
          </div>

          <div>
            <label style="font-size:10.5px;text-transform:uppercase;color:var(--text3);font-weight:600;display:block;margin-bottom:4px">Sort By</label>
            <select id="rechargeSortSelect" style="width:100%;padding:8px 10px;background:var(--card);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:12px">
              <option value="value_score" ${rechargeState.sortBy === 'value_score' ? 'selected' : ''}>Best Value Score</option>
              <option value="price_asc" ${rechargeState.sortBy === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
              <option value="price_desc" ${rechargeState.sortBy === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
              <option value="validity_desc" ${rechargeState.sortBy === 'validity_desc' ? 'selected' : ''}>Validity: Longest First</option>
              <option value="cost_per_day_asc" ${rechargeState.sortBy === 'cost_per_day_asc' ? 'selected' : ''}>Cost / Day: Lowest First</option>
              <option value="cost_per_gb_asc" ${rechargeState.sortBy === 'cost_per_gb_asc' ? 'selected' : ''}>Cost / GB: Lowest First</option>
              <option value="daily_data_desc" ${rechargeState.sortBy === 'daily_data_desc' ? 'selected' : ''}>Daily Data: Highest First</option>
            </select>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;border-top:1px solid var(--border2);padding-top:10px">
          <div style="flex:1;max-width:380px">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
              <span style="color:var(--text3);text-transform:uppercase;font-weight:600">Max Price</span>
              <span style="color:var(--gold);font-weight:700" id="rechargePriceDisplay">₹${rechargeState.maxPrice}</span>
            </div>
            <input type="range" id="rechargePriceSlider" min="90" max="4000" step="10" value="${rechargeState.maxPrice}" style="width:100%">
          </div>

          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;color:var(--text)">
            <input type="checkbox" id="recharge5GToggle" ${rechargeState.require5G ? 'checked' : ''}>
            <span>⚡ True Unlimited 5G Only</span>
          </label>
        </div>
      </div>

      <!-- Plan Cards Grid Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px">
          <span>Matched Plans</span>
          <span style="font-size:11px;background:var(--fill-2);border:1px solid var(--border2);border-radius:10px;padding:1px 8px;color:var(--text2)">
            ${filtered.length} plans
          </span>
        </div>
        ${rechargeState.pinnedPlanIds.size > 0 ? `
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:var(--gold)">${rechargeState.pinnedPlanIds.size} pinned for comparison</span>
            <button class="btn btn-sm btn-gold" id="btnOpenCompareBar">Compare Side-by-Side (${rechargeState.pinnedPlanIds.size})</button>
            <button class="btn btn-sm btn-outline" id="btnClearPinned">Clear</button>
          </div>
        ` : ''}
      </div>

      <!-- Cards Grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:24px">
        ${!filtered.length ? `
          <div style="grid-column:1/-1;padding:40px;text-align:center;background:var(--card);border-radius:var(--radius);border:1px dashed var(--border2)">
            <div style="font-size:24px;margin-bottom:8px">🔍</div>
            <div style="font-weight:600">No recharge plans match this filter combination</div>
            <div style="font-size:12px;color:var(--text3);margin-top:4px">Try raising the max price slider or turning off 5G only.</div>
          </div>
        ` : filtered.map(p => {
          const isPinned = rechargeState.pinnedPlanIds.has(p.id);
          const dataLabel = p.dailyDataGB ? `${p.dailyDataGB} GB/day` : (p.totalDataGB ? `${p.totalDataGB} GB Total` : 'Voice Focused');
          return `
            <div class="card" style="padding:14px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid ${isPinned ? 'var(--gold)' : 'var(--border2)'};border-radius:12px;background:var(--card)">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                  <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;background:var(--fill-3);color:var(--gold)">
                    ${p.provider}
                  </span>
                  <div style="display:flex;gap:4px;align-items:center">
                    ${p.is5GEligible ? '<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(22,201,163,0.15);color:var(--teal)">5G</span>' : ''}
                    <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(201,168,76,0.15);color:var(--gold)">Score ${p.valueScore}</span>
                    <button class="btn btn-sm btn-outline btn-pin-plan" data-id="${p.id}" style="padding:2px 6px;font-size:10.5px">
                      ${isPinned ? '✓ Pinned' : '+ Compare'}
                    </button>
                  </div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
                  <div>
                    <span style="font-size:12px;color:var(--text3)">₹</span>
                    <span style="font-size:22px;font-weight:800;color:var(--text)">${p.price}</span>
                  </div>
                  <div style="font-size:12.5px;font-weight:600;color:var(--text2)">${p.validityDays} Days</div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(3,1fr);background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;padding:8px 4px;text-align:center;margin-bottom:10px;font-size:11px">
                  <div>
                    <div style="color:var(--text3);font-size:9.5px;text-transform:uppercase">Data</div>
                    <div style="font-weight:700;color:var(--text)">${dataLabel}</div>
                  </div>
                  <div style="border-left:1px solid var(--border2);border-right:1px solid var(--border2)">
                    <div style="color:var(--text3);font-size:9.5px;text-transform:uppercase">Cost/Day</div>
                    <div style="font-weight:700;color:var(--teal)">₹${p.costPerDay}</div>
                  </div>
                  <div>
                    <div style="color:var(--text3);font-size:9.5px;text-transform:uppercase">Cost/GB</div>
                    <div style="font-weight:700;color:var(--text)">${p.costPerGB ? '₹' + p.costPerGB : '—'}</div>
                  </div>
                </div>

                <div style="font-size:11.5px;color:var(--text2);display:flex;flex-direction:column;gap:3px;margin-bottom:12px">
                  <div>📞 ${p.calling}</div>
                  <div>💬 ${p.sms}</div>
                  ${(p.additionalBenefits || []).slice(0, 1).map(b => `<div style="color:var(--text)">🎁 ${b}</div>`).join('')}
                </div>
              </div>

              <div style="border-top:1px solid var(--border2);padding-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:11px">
                <a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:none">
                  Official Portal ↗
                </a>
                <span style="color:var(--text3)">${p.circleScope}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Methodology Transparency Card -->
      <div class="panel" style="padding:16px;font-size:12px;color:var(--text2);line-height:1.6">
        <h4 style="font-size:14px;color:var(--gold);margin-bottom:6px;display:flex;align-items:center;gap:6px">
          <span>📐</span> Transparent Value Methodology & Official Source Tracing
        </h4>
        <div>
          Tariff figures are grounded in official TRAI filings and post-July 2024 revised prepaid schedules from Jio, Airtel, Vi, and BSNL.
          <strong>Cost per Day</strong> = <code style="color:var(--teal)">Price ÷ Validity Days</code>.
          <strong>Value Score (0-100)</strong> weights daily allowance (35%), validity (25%), daily expenditure frugality (25%), true 5G access (10%), and bundled subscriptions (5%).
        </div>
      </div>
    `;

    // Event Wire-up
    App.utils.qs('#btnRechargeRefresh', pane)?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = '⟳ Syncing...';
      await fetchPlansData(true);
      App.utils.toast('Telecom plans re-verified from provider feeds.', 'ok');
      renderRechargeView();
    });

    App.utils.qs('#btnRechargeDiagnostics', pane)?.addEventListener('click', openDiagnosticsModal);

    App.utils.qsa('#rechargeProviderBtns .chip', pane).forEach(btn => {
      btn.addEventListener('click', () => {
        rechargeState.selectedProvider = btn.dataset.p;
        renderRechargeView();
      });
    });

    App.utils.qs('#rechargeSearchInput', pane)?.addEventListener('input', (e) => {
      rechargeState.searchQuery = e.target.value;
      renderRechargeView();
    });

    App.utils.qs('#rechargeCircleSelect', pane)?.addEventListener('change', (e) => {
      rechargeState.selectedCircle = e.target.value;
      renderRechargeView();
    });

    App.utils.qs('#rechargeCategorySelect', pane)?.addEventListener('change', (e) => {
      rechargeState.selectedCategory = e.target.value;
      renderRechargeView();
    });

    App.utils.qs('#rechargeDataSelect', pane)?.addEventListener('change', (e) => {
      rechargeState.dataAllowanceFilter = e.target.value;
      renderRechargeView();
    });

    App.utils.qs('#rechargeSortSelect', pane)?.addEventListener('change', (e) => {
      rechargeState.sortBy = e.target.value;
      renderRechargeView();
    });

    App.utils.qs('#rechargePriceSlider', pane)?.addEventListener('input', (e) => {
      rechargeState.maxPrice = Number(e.target.value);
      const disp = App.utils.qs('#rechargePriceDisplay', pane);
      if (disp) disp.textContent = `₹${rechargeState.maxPrice}`;
      renderRechargeView();
    });

    App.utils.qs('#recharge5GToggle', pane)?.addEventListener('change', (e) => {
      rechargeState.require5G = e.target.checked;
      renderRechargeView();
    });

    App.utils.qs('#btnRechargeReset', pane)?.addEventListener('click', () => {
      rechargeState.selectedProvider = 'all';
      rechargeState.selectedCategory = 'all';
      rechargeState.selectedCircle = 'National';
      rechargeState.searchQuery = '';
      rechargeState.maxPrice = 4000;
      rechargeState.minValidity = 1;
      rechargeState.dataAllowanceFilter = 'all';
      rechargeState.require5G = false;
      rechargeState.sortBy = 'value_score';
      renderRechargeView();
    });

    App.utils.qsa('.btn-pin-plan', pane).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        if (rechargeState.pinnedPlanIds.has(id)) {
          rechargeState.pinnedPlanIds.delete(id);
        } else {
          if (rechargeState.pinnedPlanIds.size >= 4) {
            App.utils.toast('You can compare up to 4 plans at once.', 'info');
            return;
          }
          rechargeState.pinnedPlanIds.add(id);
        }
        renderRechargeView();
      });
    });

    App.utils.qs('#btnOpenCompareBar', pane)?.addEventListener('click', openComparisonModal);
    App.utils.qs('#btnClearPinned', pane)?.addEventListener('click', () => {
      rechargeState.pinnedPlanIds.clear();
      renderRechargeView();
    });
  }

  App.views = App.views || {};
  App.views.recharge = renderRechargeView;
  App.router.register('recharge', renderRechargeView);
})();
