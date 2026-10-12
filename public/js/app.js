// Recharge Intelligence India — Frontend Client Application
// Responsive, mobile-first state engine, multi-criteria filters, comparison dock, and live diagnostics

let state = {
  plans: [],
  selectedProvider: 'all',
  selectedCircle: 'National',
  selectedCategory: 'all',
  searchQuery: '',
  maxPrice: 4000,
  minValidity: 1,
  dataAllowanceFilter: 'all',
  require5G: false,
  requireUnlimitedVoice: false,
  sortBy: 'value_score', // 'value_score' | 'price_asc' | 'price_desc' | 'validity_desc' | 'cost_per_day_asc' | 'cost_per_gb_asc' | 'daily_data_desc'
  pinnedPlanIds: new Set(),
  theme: localStorage.getItem('theme') || 'dark',
  lastRefreshedAt: null,
  diagnostics: null,
  isRefreshing: false
};

// Available Telecom Circles in India
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

async function init() {
  applyTheme(state.theme);
  setupEvents();
  await loadPlans();
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

async function loadPlans(forceRefresh = false) {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '⟳ Syncing...';
  }

  try {
    const res = await fetch(`/api/plans${forceRefresh ? '?refresh=true' : ''}`);
    const json = await res.json();
    if (json.success && json.plans) {
      state.plans = json.plans;
      state.lastRefreshedAt = json.cachedAt;
      updateHeaderKPIs();
      renderPlans();
    }
  } catch (err) {
    console.error('Failed to load plans:', err);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '⟳ Refresh Live';
    }
  }
}

function updateHeaderKPIs() {
  const totalVerifiedEl = document.getElementById('kpiTotalPlans');
  const minPriceEl = document.getElementById('kpiMinPrice');
  const maxValidityEl = document.getElementById('kpiMaxValidity');
  const topValueEl = document.getElementById('kpiTopValue');
  const freshnessEl = document.getElementById('freshnessIndicator');

  if (!state.plans.length) return;

  const validPrices = state.plans.map(p => p.price);
  const validValidities = state.plans.map(p => p.validityDays);
  const minPrice = Math.min(...validPrices);
  const maxValidity = Math.max(...validValidities);

  // Best value plan
  const bestPlan = [...state.plans].sort((a, b) => b.valueScore - a.valueScore)[0];

  if (totalVerifiedEl) totalVerifiedEl.textContent = state.plans.length;
  if (minPriceEl) minPriceEl.textContent = `₹${minPrice}`;
  if (maxValidityEl) maxValidityEl.textContent = `${maxValidity} Days`;
  if (topValueEl && bestPlan) {
    topValueEl.innerHTML = `₹${bestPlan.price} <span style="font-size:0.8rem;color:var(--text-dim);">(${bestPlan.provider})</span>`;
  }

  if (freshnessEl && state.lastRefreshedAt) {
    const date = new Date(state.lastRefreshedAt);
    freshnessEl.textContent = `Verified ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function getFilteredPlans() {
  let list = [...state.plans];

  // Provider
  if (state.selectedProvider !== 'all') {
    list = list.filter(p => p.provider.toLowerCase() === state.selectedProvider.toLowerCase());
  }

  // Price range
  list = list.filter(p => p.price <= state.maxPrice);

  // Validity
  list = list.filter(p => p.validityDays >= state.minValidity);

  // Category
  if (state.selectedCategory !== 'all') {
    if (state.selectedCategory === 'trai_mandated') {
      list = list.filter(p => p.validityDays === 30 || p.category === 'trai_mandated');
    } else {
      list = list.filter(p => p.category === state.selectedCategory);
    }
  }

  // Circle scope
  if (state.selectedCircle && state.selectedCircle !== 'National') {
    list = list.filter(p => !p.circleScope || p.circleScope === 'National' || p.circleScope.toLowerCase().includes(state.selectedCircle.toLowerCase()));
  }

  // Daily data filter
  if (state.dataAllowanceFilter !== 'all') {
    if (state.dataAllowanceFilter === '1.5') {
      list = list.filter(p => p.dailyDataGB === 1.5);
    } else if (state.dataAllowanceFilter === '2.0') {
      list = list.filter(p => p.dailyDataGB && p.dailyDataGB >= 2.0);
    } else if (state.dataAllowanceFilter === 'voice_only') {
      list = list.filter(p => p.dailyDataGB === null);
    }
  }

  // 5G only
  if (state.require5G) {
    list = list.filter(p => p.is5GEligible === true);
  }

  // Text search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase().trim();
    list = list.filter(p => {
      const matchPrice = String(p.price).includes(q);
      const matchProvider = p.provider.toLowerCase().includes(q);
      const matchCalling = (p.calling || '').toLowerCase().includes(q);
      const matchNotes = (p.notes || '').toLowerCase().includes(q);
      const matchPerks = (p.additionalBenefits || []).some(b => b.toLowerCase().includes(q));
      return matchPrice || matchProvider || matchCalling || matchNotes || matchPerks;
    });
  }

  // Sorting
  list.sort((a, b) => {
    switch (state.sortBy) {
      case 'value_score':
        return b.valueScore - a.valueScore;
      case 'price_asc':
        return a.price - b.price;
      case 'price_desc':
        return b.price - a.price;
      case 'validity_desc':
        return b.validityDays - a.validityDays;
      case 'cost_per_day_asc':
        return a.costPerDay - b.costPerDay;
      case 'cost_per_gb_asc':
        if (!a.costPerGB) return 1;
        if (!b.costPerGB) return -1;
        return a.costPerGB - b.costPerGB;
      case 'daily_data_desc':
        return (b.dailyDataGB || 0) - (a.dailyDataGB || 0);
      default:
        return b.valueScore - a.valueScore;
    }
  });

  return list;
}

function renderPlans() {
  const container = document.getElementById('plansContainer');
  const countBadge = document.getElementById('matchedPlansCount');
  if (!container) return;

  const filtered = getFilteredPlans();
  if (countBadge) countBadge.textContent = `${filtered.length} plans`;

  if (!filtered.length) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: 16px; border: 1px dashed var(--border-subtle);">
        <div style="font-size: 2.2rem; margin-bottom: 12px;">🔍</div>
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 6px;">No recharge plans match this criteria</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 400px; margin: 0 auto 18px;">
          Try expanding the price range, clearing the 5G filter, or resetting to nationwide common packs.
        </p>
        <button class="btn btn-outline" onclick="resetFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(plan => {
    const isPinned = state.pinnedPlanIds.has(plan.id);
    const providerClass = plan.provider.toLowerCase();
    const dataDisplay = plan.dailyDataGB ? `${plan.dailyDataGB} GB/day` : (plan.totalDataGB ? `${plan.totalDataGB} GB Bulk` : 'No Data');
    const isBestValue = plan.valueScore >= 80;

    return `
      <div class="plan-card ${isPinned ? 'pinned' : ''}" data-id="${plan.id}">
        <div>
          <div class="plan-card-header">
            <span class="provider-tag ${providerClass}">${plan.provider}</span>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${plan.is5GEligible ? '<span class="badge-5g">⚡ 5G</span>' : ''}
              ${isBestValue ? '<span class="badge-value">⭐ Score: ' + plan.valueScore + '</span>' : ''}
              <button class="btn btn-sm btn-outline pin-toggle-btn" onclick="togglePinPlan('${plan.id}')" title="Pin for side-by-side comparison" style="padding: 3px 8px;">
                ${isPinned ? '✓ Pinned' : '+ Compare'}
              </button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <div class="price-box">
              <span class="price-symbol">₹</span>
              <span class="price-num font-mono">${plan.price}</span>
            </div>
            <div class="validity-tag font-mono">${plan.validityDays} Days</div>
          </div>

          <!-- Metrics Row -->
          <div class="metric-row">
            <div class="metric-item">
              <div class="metric-key">Allowance</div>
              <div class="metric-val font-mono">${dataDisplay}</div>
            </div>
            <div class="metric-item">
              <div class="metric-key">Cost / Day</div>
              <div class="metric-val font-mono">₹${plan.costPerDay}</div>
            </div>
            <div class="metric-item">
              <div class="metric-key">Cost / GB</div>
              <div class="metric-val font-mono">${plan.costPerGB ? '₹' + plan.costPerGB : 'N/A'}</div>
            </div>
          </div>

          <!-- Benefits -->
          <div class="benefits-list">
            <div class="benefit-item">
              <span>📞</span>
              <span>${plan.calling}</span>
            </div>
            <div class="benefit-item">
              <span>💬</span>
              <span>${plan.sms}</span>
            </div>
            ${(plan.additionalBenefits || []).slice(0, 2).map(b => `
              <div class="benefit-item" style="color: var(--text-main);">
                <span>🎁</span>
                <span>${b}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Footer / Source link -->
        <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 0.73rem;">
          <a href="${plan.sourceUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            Official Portal ↗
          </a>
          <span style="color: var(--text-dim);" title="Circle availability">Circle: ${plan.circleScope}</span>
        </div>
      </div>
    `;
  }).join('');

  updateComparisonTray();
}

function togglePinPlan(planId) {
  if (state.pinnedPlanIds.has(planId)) {
    state.pinnedPlanIds.delete(planId);
  } else {
    if (state.pinnedPlanIds.size >= 4) {
      showToast('You can compare up to 4 plans at once.');
      return;
    }
    state.pinnedPlanIds.add(planId);
  }
  renderPlans();
}

function clearPinnedPlans() {
  state.pinnedPlanIds.clear();
  renderPlans();
}

function updateComparisonTray() {
  const tray = document.getElementById('comparisonTray');
  const countEl = document.getElementById('trayCount');
  if (!tray) return;

  const count = state.pinnedPlanIds.size;
  if (countEl) countEl.textContent = count;

  if (count > 0) {
    tray.style.display = 'flex';
  } else {
    tray.style.display = 'none';
  }
}

function openComparisonModal() {
  const modal = document.getElementById('comparisonModal');
  const body = document.getElementById('comparisonModalBody');
  if (!modal || !body) return;

  const pinnedPlans = state.plans.filter(p => state.pinnedPlanIds.has(p.id));
  if (!pinnedPlans.length) return;

  body.innerHTML = `
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Attribute</th>
          ${pinnedPlans.map(p => `
            <th style="min-width: 140px;">
              <span class="provider-tag ${p.provider.toLowerCase()}">${p.provider}</span>
              <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-top: 4px;">₹${p.price}</div>
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Validity</td>
          ${pinnedPlans.map(p => `<td class="font-mono"><strong>${p.validityDays} Days</strong></td>`).join('')}
        </tr>
        <tr>
          <td>Daily Data</td>
          ${pinnedPlans.map(p => `<td class="font-mono">${p.dailyDataGB ? p.dailyDataGB + ' GB/day' : 'No Daily Cap'}</td>`).join('')}
        </tr>
        <tr>
          <td>Total Data</td>
          ${pinnedPlans.map(p => `<td class="font-mono">${p.totalDataGB ? p.totalDataGB + ' GB' : 'Not capped'}</td>`).join('')}
        </tr>
        <tr>
          <td>Cost per Day</td>
          ${pinnedPlans.map(p => `<td class="font-mono" style="color: #34d399; font-weight: 700;">₹${p.costPerDay}</td>`).join('')}
        </tr>
        <tr>
          <td>Cost per GB</td>
          ${pinnedPlans.map(p => `<td class="font-mono">${p.costPerGB ? '₹' + p.costPerGB : 'N/A'}</td>`).join('')}
        </tr>
        <tr>
          <td>Unlimited 5G</td>
          ${pinnedPlans.map(p => `<td>${p.is5GEligible ? '⚡ Yes (Free Unlimited)' : '❌ Not included'}</td>`).join('')}
        </tr>
        <tr>
          <td>Calling</td>
          ${pinnedPlans.map(p => `<td>${p.calling}</td>`).join('')}
        </tr>
        <tr>
          <td>SMS</td>
          ${pinnedPlans.map(p => `<td>${p.sms}</td>`).join('')}
        </tr>
        <tr>
          <td>Value Score</td>
          ${pinnedPlans.map(p => `<td><strong style="color: var(--accent-gold);">${p.valueScore} / 100</strong></td>`).join('')}
        </tr>
        <tr>
          <td>Extra Perks</td>
          ${pinnedPlans.map(p => `<td>${(p.additionalBenefits || []).join(', ') || 'Standard Telco Apps'}</td>`).join('')}
        </tr>
        <tr>
          <td>Official Recharge</td>
          ${pinnedPlans.map(p => `<td><a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" style="text-decoration:none;">Recharge ↗</a></td>`).join('')}
        </tr>
      </tbody>
    </table>
  `;

  modal.style.display = 'flex';
}

function closeComparisonModal() {
  const modal = document.getElementById('comparisonModal');
  if (modal) modal.style.display = 'none';
}

async function openDiagnosticsModal() {
  const modal = document.getElementById('diagnosticsModal');
  const body = document.getElementById('diagnosticsModalBody');
  if (!modal || !body) return;

  body.innerHTML = '<div style="padding: 20px; text-align: center;">Fetching operator gateway health...</div>';
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/diagnostics');
    const diag = await res.json();

    body.innerHTML = `
      <div style="margin-bottom: 16px; font-size: 0.85rem; color: var(--text-muted); background: var(--bg-card); padding: 12px; border-radius: 8px;">
        <div><strong>Server Cache:</strong> ${diag.cacheState.totalPlansCached} verified plans cached at ${new Date(diag.cacheState.cachedAt).toLocaleTimeString()}</div>
        <div style="margin-top: 4px;"><strong>TTL Window:</strong> ${diag.cacheState.ttlMinutes} minutes before background re-verification</div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${diag.providers.map(p => `
          <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong style="font-size: 0.95rem;">${p.name}</strong>
              <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: rgba(16,185,129,0.15); color: #34d399; font-weight: 700;">
                ● Live Verified (${p.latencyMs}ms)
              </span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 6px; word-break: break-all;">
              Source: <a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa;">${p.sourceUrl}</a>
            </div>
            <div style="font-size: 0.8rem; display: flex; gap: 14px; color: var(--text-muted);">
              <span>Plans Indexed: <strong>${p.itemCount}</strong></span>
              <span>Last Check: <strong>${new Date(p.lastChecked).toLocaleTimeString()}</strong></span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div style="color: #ef4444; padding: 20px;">Failed to query diagnostics: ${err.message}</div>`;
  }
}

function closeDiagnosticsModal() {
  const modal = document.getElementById('diagnosticsModal');
  if (modal) modal.style.display = 'none';
}

function resetFilters() {
  state.selectedProvider = 'all';
  state.selectedCategory = 'all';
  state.selectedCircle = 'National';
  state.searchQuery = '';
  state.maxPrice = 4000;
  state.minValidity = 1;
  state.dataAllowanceFilter = 'all';
  state.require5G = false;
  state.sortBy = 'value_score';

  // Sync inputs
  document.querySelectorAll('.btn-provider').forEach(b => {
    b.classList.toggle('active-all', b.dataset.provider === 'all');
    b.classList.remove('active-jio', 'active-airtel', 'active-vi', 'active-bsnl');
  });

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  const priceRange = document.getElementById('priceRange');
  const priceDisplay = document.getElementById('priceRangeDisplay');
  if (priceRange) priceRange.value = 4000;
  if (priceDisplay) priceDisplay.textContent = '₹4,000';

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.value = 'value_score';

  const circleSelect = document.getElementById('circleSelect');
  if (circleSelect) circleSelect.value = 'National';

  const categorySelect = document.getElementById('categorySelect');
  if (categorySelect) categorySelect.value = 'all';

  const dataFilterSelect = document.getElementById('dataFilterSelect');
  if (dataFilterSelect) dataFilterSelect.value = 'all';

  const toggle5G = document.getElementById('toggle5G');
  if (toggle5G) toggle5G.checked = false;

  renderPlans();
}

function setupEvents() {
  // Provider toggle buttons
  document.querySelectorAll('.btn-provider').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.provider;
      state.selectedProvider = p;

      document.querySelectorAll('.btn-provider').forEach(b => {
        b.classList.remove('active-all', 'active-jio', 'active-airtel', 'active-vi', 'active-bsnl');
      });

      if (p === 'all') btn.classList.add('active-all');
      else btn.classList.add(`active-${p}`);

      renderPlans();
    });
  });

  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderPlans();
    });
  }

  // Price range slider
  const priceRange = document.getElementById('priceRange');
  const priceDisplay = document.getElementById('priceRangeDisplay');
  if (priceRange) {
    priceRange.addEventListener('input', (e) => {
      state.maxPrice = Number(e.target.value);
      if (priceDisplay) priceDisplay.textContent = `₹${state.maxPrice}`;
      renderPlans();
    });
  }

  // Circle select
  const circleSelect = document.getElementById('circleSelect');
  if (circleSelect) {
    circleSelect.innerHTML = TELECOM_CIRCLES.map(c => `<option value="${c}">${c}</option>`).join('');
    circleSelect.addEventListener('change', (e) => {
      state.selectedCircle = e.target.value;
      renderPlans();
    });
  }

  // Category select
  const categorySelect = document.getElementById('categorySelect');
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      state.selectedCategory = e.target.value;
      renderPlans();
    });
  }

  // Data allowance filter
  const dataFilterSelect = document.getElementById('dataFilterSelect');
  if (dataFilterSelect) {
    dataFilterSelect.addEventListener('change', (e) => {
      state.dataAllowanceFilter = e.target.value;
      renderPlans();
    });
  }

  // 5G checkbox
  const toggle5G = document.getElementById('toggle5G');
  if (toggle5G) {
    toggle5G.addEventListener('change', (e) => {
      state.require5G = e.target.checked;
      renderPlans();
    });
  }

  // Sort select
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderPlans();
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadPlans(true));
  }

  // Theme toggle button
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });
  }
}

// Toast notification utility
function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// Global modal dismiss on click outside
window.addEventListener('click', (e) => {
  const compModal = document.getElementById('comparisonModal');
  const diagModal = document.getElementById('diagnosticsModal');
  if (e.target === compModal) closeComparisonModal();
  if (e.target === diagModal) closeDiagnosticsModal();
});

// Expose handlers to window for HTML event attributes
window.togglePinPlan = togglePinPlan;
window.clearPinnedPlans = clearPinnedPlans;
window.openComparisonModal = openComparisonModal;
window.closeComparisonModal = closeComparisonModal;
window.openDiagnosticsModal = openDiagnosticsModal;
window.closeDiagnosticsModal = closeDiagnosticsModal;
window.resetFilters = resetFilters;
window.showToast = showToast;

// Boot app
document.addEventListener('DOMContentLoaded', init);

