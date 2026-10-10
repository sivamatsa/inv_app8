/* ============================================================================
   Website & Account Vault View (Investment OS)
   Centralized directory and credential-management system for all websites,
   portals, platforms, and services with multiple accounts per website,
   AES-256-GCM encryption, auto-lock, and zero-secret audit logging.
   ============================================================================ */
window.App = window.App || {};

App.views = App.views || {};

App.views.vault = (function () {
  'use strict';

  // Component state
  const state = {
    websites: [],
    groups: [],
    settings: {
      auto_lock_minutes: 15,
      mask_passwords_by_default: true,
      require_click_to_reveal: true,
      open_and_copy_behavior: 'BOTH',
      default_sort: 'name',
      default_view: 'card',
      password_review_interval_days: 90,
      security_disclosure_acknowledged: true,
    },
    selectedNav: 'overview', // 'overview', 'all', 'favorites', 'recent', 'archived', 'custom_groups', or slug
    searchQuery: '',
    filterImportance: 'ALL',
    filterMultiAccount: false,
    filterMissingInfo: false,
    filterReviewDue: false,
    filterRenewalDue: false,
    viewMode: 'card', // 'card' or 'table'
    sortBy: 'name', // 'name', 'recent_used', 'recent_added', 'importance', 'renewal'
    activeSelectedAccountMap: {}, // siteId -> accountId
    revealedPasswords: {}, // siteId_accId -> boolean
    loading: false,
  };

  // Helper: format relative or local date
  function formatDate(dStr) {
    if (!dStr) return '—';
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) {
      return dStr;
    }
  }

  // Load all vault data from Supabase / API
  async function loadData() {
    state.loading = true;
    try {
      const [websites, groups, settings] = await Promise.all([
        App.api.listWebsites(),
        App.api.listWebsiteGroups(),
        App.api.getVaultSettings(),
      ]);
      state.websites = websites || [];
      state.groups = groups || [];
      if (settings) {
        state.settings = Object.assign(state.settings, settings);
        if (state.settings.default_view) state.viewMode = state.settings.default_view;
        if (state.settings.default_sort) state.sortBy = state.settings.default_sort;
        if (state.settings.auto_lock_minutes !== undefined && App.vaultCrypto) {
          App.vaultCrypto.setAutoLockMinutes(state.settings.auto_lock_minutes);
        }
      }

      // Initialize selected account map with defaults
      state.websites.forEach((site) => {
        if (site.accounts && site.accounts.length) {
          const defaultAcc = site.accounts.find((a) => a.is_default) || site.accounts[0];
          state.activeSelectedAccountMap[site.id] = defaultAcc.id;
        }
      });
    } catch (err) {
      console.error('Failed to load website vault:', err);
      if (App.utils && App.utils.toast) {
        App.utils.toast('Failed to load vault: ' + (err.message || err), 'err');
      }
    } finally {
      state.loading = false;
    }
  }

  // Render the whole view container
  async function render() {
    const pane = App.utils.qs('.view-pane[data-view="vault"]');
    if (!pane) return;

    // Check if vault is locked
    if (App.vaultCrypto && App.vaultCrypto.isLocked()) {
      renderLockedState(pane);
      return;
    }

    await loadData();
    drawMain(pane);
  }

  // Render Vault Locked Screen
  function renderLockedState(pane) {
    pane.innerHTML = `
      <div class="vault-locked-screen fade-up" style="max-width:480px;margin:60px auto;padding:36px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);text-align:center;box-shadow:var(--shadow)">
        <div style="font-size:48px;margin-bottom:14px">🔒</div>
        <h2 style="font-size:24px;color:var(--gold);margin-bottom:8px">Website Vault is Locked</h2>
        <p style="font-size:13.5px;color:var(--text2);margin-bottom:24px;line-height:1.5">
          All stored credentials and sensitive account notes have been cleared from volatile memory to protect your privacy.
        </p>
        <button id="btnUnlockVaultNow" class="btn btn-gold" style="padding:10px 28px;font-size:14px;font-weight:600;margin-bottom:12px">
          🔓 Unlock Vault with Active Session
        </button>
        <div style="font-size:11.5px;color:var(--text3)">
          Protected by AES-256-GCM authenticated session derivation
        </div>
      </div>
    `;

    pane.querySelector('#btnUnlockVaultNow')?.addEventListener('click', async () => {
      if (App.vaultCrypto) {
        await App.vaultCrypto.unlockVault();
        render();
      }
    });
  }

  // Draw main vault interface
  function drawMain(pane) {
    pane.innerHTML = `
      <div class="vault-container" style="display:flex;flex-direction:column;gap:18px">
        <!-- Top Action & Navigation Bar -->
        <div class="vault-header-bar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border2)">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:24px">🔐</div>
            <div>
              <h1 style="font-size:22px;margin:0;color:var(--text);font-family:'Cormorant Garamond',serif">Website & Account Vault</h1>
              <div style="font-size:12px;color:var(--text2)">Centralized directory & credential manager &middot; ${state.websites.length} services &middot; Supabase synced</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button id="btnAddWebsiteTop" class="btn btn-gold btn-sm" style="font-weight:600">
              + Add Website
            </button>
            <button id="btnPasswordGenTop" class="btn btn-outline btn-sm" title="Generate cryptographically secure passwords">
              ⚡ Password Gen
            </button>
            <button id="btnImportExportTop" class="btn btn-outline btn-sm" title="Import from CSV/Excel or backup vault">
              📥 Import & Export
            </button>
            <button id="btnVaultAuditTop" class="btn btn-outline btn-sm" title="Inspect security audit history">
              🛡️ Audit Trail
            </button>
            <button id="btnVaultSettingsTop" class="btn btn-outline btn-sm" title="Vault auto-lock & preferences">
              ⚙️ Settings
            </button>
            <button id="btnLockVaultNow" class="btn btn-outline btn-sm" style="border-color:var(--red);color:var(--red)" title="Lock vault immediately">
              🔒 Lock
            </button>
          </div>
        </div>

        <!-- Layout Body: Navigation Sidebar + Main Workspace -->
        <div class="vault-body-layout" style="display:flex;gap:20px;align-items:flex-start">
          <!-- Vault Left Sidebar: Categories & Special Filters -->
          <div class="vault-nav-sidebar" style="width:240px;flex-shrink:0;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:0.8px;padding:4px 8px">
              Views
            </div>
            <div class="vault-nav-item ${state.selectedNav === 'overview' ? 'active' : ''}" data-nav="overview">
              <span>📊 Overview</span>
              <span class="vault-nav-badge">${state.websites.length}</span>
            </div>
            <div class="vault-nav-item ${state.selectedNav === 'all' ? 'active' : ''}" data-nav="all">
              <span>🌐 All Websites</span>
              <span class="vault-nav-badge">${state.websites.filter((s) => !s.is_archived).length}</span>
            </div>
            <div class="vault-nav-item ${state.selectedNav === 'favorites' ? 'active' : ''}" data-nav="favorites">
              <span>⭐ Favorites</span>
              <span class="vault-nav-badge">${state.websites.filter((s) => s.is_favorite && !s.is_archived).length}</span>
            </div>
            <div class="vault-nav-item ${state.selectedNav === 'recent' ? 'active' : ''}" data-nav="recent">
              <span>🕒 Recently Used</span>
              <span class="vault-nav-badge">${state.websites.filter((s) => s.last_opened_at && !s.is_archived).length}</span>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 8px 4px 8px;border-top:1px solid var(--border2);margin-top:6px">
              <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:0.8px">
                Categories & Groups
              </span>
              <button id="btnManageGroups" class="icon-btn" style="font-size:12px;opacity:0.8" title="Manage & Create Groups">⚙️</button>
            </div>
            <div class="vault-category-list" style="display:flex;flex-direction:column;gap:2px;max-height:360px;overflow-y:auto">
              ${renderCategoryNavItems()}
            </div>

            <div style="padding-top:10px;border-top:1px solid var(--border2);margin-top:6px">
              <div class="vault-nav-item ${state.selectedNav === 'archived' ? 'active' : ''}" data-nav="archived" style="color:var(--text3)">
                <span>📦 Archived</span>
                <span class="vault-nav-badge">${state.websites.filter((s) => s.is_archived).length}</span>
              </div>
            </div>
          </div>

          <!-- Vault Right Main Content Area -->
          <div class="vault-main-content" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
            <!-- If Overview is selected, render Dashboard Metrics -->
            ${state.selectedNav === 'overview' ? renderOverviewMetrics() : ''}

            <!-- Filter, Search, and Display Controls Toolbar -->
            <div class="vault-toolbar" style="background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:240px">
                <div style="position:relative;flex:1">
                  <input type="text" id="vaultSearchInput" class="form-input" placeholder="Search websites, domains, accounts, usernames, tags..." value="${App.utils.escapeHtml(state.searchQuery)}" style="width:100%;padding-left:32px;font-size:13px">
                  <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;opacity:0.6">🔍</span>
                </div>
                ${state.searchQuery ? `<button id="btnClearSearch" class="btn btn-outline btn-xs">Clear</button>` : ''}
              </div>

              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <!-- Sort Dropdown -->
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:12px;color:var(--text3)">Sort:</span>
                  <select id="vaultSortSelect" class="form-input" style="font-size:12px;padding:4px 8px;width:auto">
                    <option value="name" ${state.sortBy === 'name' ? 'selected' : ''}>Name (A-Z)</option>
                    <option value="recent_used" ${state.sortBy === 'recent_used' ? 'selected' : ''}>Recently Used</option>
                    <option value="recent_added" ${state.sortBy === 'recent_added' ? 'selected' : ''}>Recently Added</option>
                    <option value="importance" ${state.sortBy === 'importance' ? 'selected' : ''}>Importance</option>
                    <option value="renewal" ${state.sortBy === 'renewal' ? 'selected' : ''}>Upcoming Renewal</option>
                  </select>
                </div>

                <!-- View Mode Toggle -->
                <div style="display:flex;background:var(--bg2);border-radius:6px;border:1px solid var(--border2);overflow:hidden">
                  <button id="btnViewCards" class="icon-btn ${state.viewMode === 'card' ? 'active-view-btn' : ''}" style="padding:4px 10px;font-size:13px;border-radius:0" title="Card View">
                    🗂️ Cards
                  </button>
                  <button id="btnViewTable" class="icon-btn ${state.viewMode === 'table' ? 'active-view-btn' : ''}" style="padding:4px 10px;font-size:13px;border-radius:0" title="Compact Table View">
                    ☰ Table
                  </button>
                </div>
              </div>
            </div>

            <!-- Active Filter Chips / Status Banner -->
            ${renderActiveFilterBar()}

            <!-- Website Cards Grid or Table View -->
            <div id="vaultWebsitesListContainer">
              ${renderWebsitesList()}
            </div>
          </div>
        </div>
      </div>
    `;

    attachMainListeners(pane);
  }

  // Render Category Navigation Items with Counts
  function renderCategoryNavItems() {
    return state.groups.map((grp) => {
      const count = state.websites.filter((s) => {
        if (s.is_archived) return false;
        return (
          s.primary_category === grp.name ||
          (s.group_ids && s.group_ids.includes(grp.id))
        );
      }).length;

      const isSelected = state.selectedNav === grp.slug;
      return `
        <div class="vault-nav-item ${isSelected ? 'active' : ''}" data-nav="${App.utils.escapeHtml(grp.slug)}" title="${App.utils.escapeHtml(grp.name)}">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px">
            <span>${grp.icon || '📁'}</span>
            <span>${App.utils.escapeHtml(grp.name)}</span>
          </span>
          <span class="vault-nav-badge">${count}</span>
        </div>
      `;
    }).join('');
  }

  // Render Dashboard Overview Cards
  function renderOverviewMetrics() {
    const totalWebsites = state.websites.filter((s) => !s.is_archived).length;
    let totalAccounts = 0;
    let multiAccountCount = 0;
    let missingInfoCount = 0;
    let renewalUpcomingCount = 0;
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000);

    state.websites.forEach((s) => {
      if (s.is_archived) return;
      const accs = s.accounts || [];
      totalAccounts += accs.length;
      if (accs.length > 1) multiAccountCount++;

      accs.forEach((a) => {
        if (!a.username && !a.email_login && !a.mobile_login && !a.customer_id) missingInfoCount++;
        if (!a.encrypted_password && !a.password_plain) missingInfoCount++;
        if (a.subscription_renewal_date) {
          const rd = new Date(a.subscription_renewal_date);
          if (rd >= now && rd <= thirtyDaysLater) renewalUpcomingCount++;
        }
      });
      if (s.renewal_date) {
        const srd = new Date(s.renewal_date);
        if (srd >= now && srd <= thirtyDaysLater) renewalUpcomingCount++;
      }
    });

    const favoritesCount = state.websites.filter((s) => s.is_favorite && !s.is_archived).length;
    const recentlyUsedCount = state.websites.filter((s) => s.last_opened_at && !s.is_archived).length;

    return `
      <div class="kpi-grid grid-4" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:6px">
        <div class="kpi kpi-clickable" data-metric-filter="all" style="cursor:pointer;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:14px">
          <div class="kpi-sub" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Total Websites</div>
          <div class="kpi-val" style="font-size:22px;font-weight:700;color:var(--gold);margin:4px 0">${totalWebsites}</div>
          <div style="font-size:11px;color:var(--text2)">Active Services &middot; Click to view</div>
        </div>

        <div class="kpi kpi-clickable" data-metric-filter="accounts" style="cursor:pointer;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:14px">
          <div class="kpi-sub" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Total Accounts</div>
          <div class="kpi-val" style="font-size:22px;font-weight:700;color:var(--teal);margin:4px 0">${totalAccounts}</div>
          <div style="font-size:11px;color:var(--text2)">${multiAccountCount} portals have &gt;1 account</div>
        </div>

        <div class="kpi kpi-clickable" data-metric-filter="favorites" style="cursor:pointer;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:14px">
          <div class="kpi-sub" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Favorites</div>
          <div class="kpi-val" style="font-size:22px;font-weight:700;color:var(--gold2);margin:4px 0">${favoritesCount}</div>
          <div style="font-size:11px;color:var(--text2)">Quick-pinned portals</div>
        </div>

        <div class="kpi kpi-clickable" data-metric-filter="renewals" style="cursor:pointer;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:14px">
          <div class="kpi-sub" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Upcoming Renewals</div>
          <div class="kpi-val" style="font-size:22px;font-weight:700;color:${renewalUpcomingCount > 0 ? 'var(--gold)' : 'var(--text2)'};margin:4px 0">${renewalUpcomingCount}</div>
          <div style="font-size:11px;color:var(--text2)">Due in next 30 days</div>
        </div>
      </div>
    `;
  }

  // Active filter status bar
  function renderActiveFilterBar() {
    const isFiltered =
      state.filterMultiAccount ||
      state.filterMissingInfo ||
      state.filterRenewalDue ||
      state.filterImportance !== 'ALL';

    if (!isFiltered) return '';

    return `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;background:rgba(201,168,76,0.08);border:1px solid var(--border);border-radius:8px;padding:6px 12px">
        <span style="color:var(--gold);font-weight:600">Active Filters:</span>
        ${state.filterMultiAccount ? `<span class="badge" style="background:var(--card);border:1px solid var(--border2)">Multiple Accounts Only</span>` : ''}
        ${state.filterMissingInfo ? `<span class="badge" style="background:var(--card);border:1px solid var(--border2)">Missing Username/Password</span>` : ''}
        ${state.filterRenewalDue ? `<span class="badge" style="background:var(--card);border:1px solid var(--border2)">Renewal Due Soon</span>` : ''}
        ${state.filterImportance !== 'ALL' ? `<span class="badge" style="background:var(--card);border:1px solid var(--border2)">Importance: ${state.filterImportance}</span>` : ''}
        <button id="btnResetFilters" class="btn btn-outline btn-xs" style="margin-left:auto;padding:2px 8px">Reset Filters</button>
      </div>
    `;
  }

  // Filter and sort websites according to active state
  function getFilteredWebsites() {
    let list = state.websites.slice();

    // Navigation filter
    if (state.selectedNav === 'archived') {
      list = list.filter((s) => s.is_archived);
    } else {
      list = list.filter((s) => !s.is_archived);
      if (state.selectedNav === 'favorites') {
        list = list.filter((s) => s.is_favorite);
      } else if (state.selectedNav === 'recent') {
        list = list.filter((s) => s.last_opened_at);
      } else if (state.selectedNav !== 'overview' && state.selectedNav !== 'all') {
        const grp = state.groups.find((g) => g.slug === state.selectedNav);
        if (grp) {
          list = list.filter(
            (s) =>
              s.primary_category === grp.name ||
              (s.group_ids && s.group_ids.includes(grp.id))
          );
        }
      }
    }

    // Additional specific filters
    if (state.filterMultiAccount) {
      list = list.filter((s) => s.accounts && s.accounts.length > 1);
    }
    if (state.filterMissingInfo) {
      list = list.filter((s) => {
        const accs = s.accounts || [];
        if (!accs.length) return true;
        return accs.some(
          (a) =>
            (!a.username && !a.email_login && !a.mobile_login && !a.customer_id) ||
            (!a.encrypted_password && !a.password_plain)
        );
      });
    }
    if (state.filterRenewalDue) {
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000);
      list = list.filter((s) => {
        if (s.renewal_date && new Date(s.renewal_date) >= now && new Date(s.renewal_date) <= thirtyDaysLater) return true;
        return (s.accounts || []).some(
          (a) => a.subscription_renewal_date && new Date(a.subscription_renewal_date) >= now && new Date(a.subscription_renewal_date) <= thirtyDaysLater
        );
      });
    }
    if (state.filterImportance !== 'ALL') {
      list = list.filter((s) => s.importance === state.filterImportance);
    }

    // Search filter
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.trim().toLowerCase();
      list = list.filter((s) => {
        if ((s.name || '').toLowerCase().includes(q)) return true;
        if ((s.url || '').toLowerCase().includes(q)) return true;
        if ((s.provider_name || '').toLowerCase().includes(q)) return true;
        if ((s.primary_category || '').toLowerCase().includes(q)) return true;
        if ((s.description || '').toLowerCase().includes(q)) return true;
        if (Array.isArray(s.tags) && s.tags.some((t) => (t || '').toLowerCase().includes(q))) return true;

        // Search account credentials (safe identifiers)
        return (s.accounts || []).some((a) => {
          if ((a.display_name || '').toLowerCase().includes(q)) return true;
          if ((a.username || '').toLowerCase().includes(q)) return true;
          if ((a.email_login || '').toLowerCase().includes(q)) return true;
          if ((a.customer_id || '').toLowerCase().includes(q)) return true;
          if ((a.account_notes || '').toLowerCase().includes(q)) return true;
          return false;
        });
      });
    }

    // Sorting
    list.sort((a, b) => {
      // Pinned items float to top
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

      if (state.sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      } else if (state.sortBy === 'recent_used') {
        const da = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0;
        const db = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0;
        return db - da;
      } else if (state.sortBy === 'recent_added') {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      } else if (state.sortBy === 'importance') {
        const weight = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
        return (weight[b.importance] || 2) - (weight[a.importance] || 2);
      } else if (state.sortBy === 'renewal') {
        const da = a.renewal_date ? new Date(a.renewal_date).getTime() : 9999999999999;
        const db = b.renewal_date ? new Date(b.renewal_date).getTime() : 9999999999999;
        return da - db;
      }
      return 0;
    });

    return list;
  }

  // Render Websites List (Card or Table)
  function renderWebsitesList() {
    const list = getFilteredWebsites();
    if (!list.length) {
      return `
        <div class="panel" style="padding:48px 24px;text-align:center;color:var(--text2)">
          <div style="font-size:36px;margin-bottom:12px">🔍</div>
          <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px">No websites match your filter</div>
          <div style="font-size:13px;max-width:380px;margin:0 auto 16px auto">
            ${state.searchQuery ? `No records found matching "${App.utils.escapeHtml(state.searchQuery)}".` : 'There are no websites in this category yet.'}
          </div>
          <button id="btnEmptyAddWebsite" class="btn btn-gold btn-sm">+ Add Your First Website</button>
        </div>
      `;
    }

    if (state.viewMode === 'table') {
      return renderCompactTable(list);
    }
    return renderCardGrid(list);
  }

  // Render Card Grid
  function renderCardGrid(list) {
    return `
      <div class="vault-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px">
        ${list.map((site) => renderSingleCard(site)).join('')}
      </div>
    `;
  }

  // Render Individual Website Card
  function renderSingleCard(site) {
    const accounts = site.accounts || [];
    const activeAccId = state.activeSelectedAccountMap[site.id] || (accounts[0] ? accounts[0].id : null);
    const activeAccount = accounts.find((a) => a.id === activeAccId) || accounts[0] || null;

    const faviconUrl = site.favicon_url || (App.vaultCrypto ? App.vaultCrypto.getFaviconUrl(site.url) : '');
    const validatedUrl = App.vaultCrypto ? App.vaultCrypto.validateUrl(site.url) : { domain: site.url, isHttpWarning: false };
    const domainText = validatedUrl.domain || site.url;

    const isPasswordRevealed = activeAccount && state.revealedPasswords[`${site.id}_${activeAccount.id}`];

    return `
      <div class="vault-card" data-site-id="${site.id}" style="background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:16px;display:flex;flex-direction:column;gap:12px;position:relative;box-shadow:var(--shadow)">
        <!-- Top Row: Icon, Title, Domain, Pin/Fav -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <div class="vault-site-avatar" style="width:38px;height:38px;border-radius:9px;background:var(--bg3);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;border:1px solid var(--border2)">
              ${
                faviconUrl
                  ? `<img src="${App.utils.escapeHtml(faviconUrl)}" alt="" style="width:24px;height:24px;object-fit:contain" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span style="display:none;font-weight:700;color:var(--gold);font-size:14px">${(site.name || 'W').charAt(0).toUpperCase()}</span>`
                  : `<span style="font-weight:700;color:var(--gold);font-size:14px">${(site.name || 'W').charAt(0).toUpperCase()}</span>`
              }
            </div>
            <div style="min-width:0">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="vault-site-title" style="font-weight:700;font-size:14.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.utils.escapeHtml(site.name)}">
                  ${App.utils.escapeHtml(site.name)}
                </span>
                ${site.is_pinned ? `<span title="Pinned" style="font-size:11px">📌</span>` : ''}
              </div>
              <div style="font-size:11.5px;color:var(--text2);display:flex;align-items:center;gap:4px">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px" title="${App.utils.escapeHtml(domainText)}">${App.utils.escapeHtml(domainText)}</span>
                ${validatedUrl.isHttpWarning ? `<span title="Unencrypted HTTP protocol" style="color:var(--red);font-size:11px">⚠️ HTTP</span>` : ''}
              </div>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:4px">
            <button class="icon-btn btn-toggle-fav" data-site-id="${site.id}" style="font-size:15px;color:${site.is_favorite ? 'var(--gold)' : 'var(--text3)'}" title="${site.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">
              ${site.is_favorite ? '★' : '☆'}
            </button>
            <div class="dropdown-wrap" style="position:relative">
              <button class="icon-btn btn-card-menu" data-site-id="${site.id}" style="font-size:15px;opacity:0.8" title="More options">
                ⋮
              </button>
            </div>
          </div>
        </div>

        <!-- Category & Metadata Line -->
        <div style="font-size:11.5px;color:var(--text3);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="color:var(--gold);font-weight:600">${App.utils.escapeHtml(site.primary_category)}</span>
          ${site.provider_name ? `<span>&middot;</span><span>${App.utils.escapeHtml(site.provider_name)}</span>` : ''}
          ${site.importance && site.importance !== 'NORMAL' ? `<span>&middot;</span><span class="badge" style="font-size:10px;padding:1px 5px;background:${site.importance === 'CRITICAL' ? 'rgba(239,68,68,0.2)' : 'rgba(201,168,76,0.2)'};color:${site.importance === 'CRITICAL' ? 'var(--red)' : 'var(--gold)'}">${site.importance}</span>` : ''}
        </div>

        <!-- Account Picker Section (Multiple Accounts Support) -->
        <div class="vault-account-box" style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase">Account:</span>
              ${
                accounts.length > 1
                  ? `<select class="form-input sel-switch-account" data-site-id="${site.id}" style="font-size:11.5px;padding:2px 6px;width:auto;border-color:var(--border)">
                      ${accounts
                        .map(
                          (a) =>
                            `<option value="${a.id}" ${a.id === (activeAccount ? activeAccount.id : '') ? 'selected' : ''}>
                              ${App.utils.escapeHtml(a.display_name)} ${a.is_default ? '★ (Default)' : ''}
                            </option>`
                        )
                        .join('')}
                    </select>`
                  : `<span style="font-size:12px;font-weight:600;color:var(--text)">${activeAccount ? App.utils.escapeHtml(activeAccount.display_name) : 'No account added'}</span>`
              }
            </div>
            <span class="badge" style="font-size:10px;padding:1px 6px;background:var(--fill-2)">
              ${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}
            </span>
          </div>

          ${
            activeAccount
              ? `
            <!-- Identifier / Username Line -->
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;background:var(--bg);border-radius:6px;padding:4px 8px">
              <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
                <span style="opacity:0.6;font-size:11px">👤</span>
                <span class="vault-login-id" style="font-family:monospace;font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.utils.escapeHtml(activeAccount.username || activeAccount.email_login || activeAccount.customer_id || 'No username')}">
                  ${App.utils.escapeHtml(activeAccount.username || activeAccount.email_login || activeAccount.customer_id || 'No username saved')}
                </span>
              </div>
              <button class="btn btn-outline btn-xs btn-copy-username" data-site-id="${site.id}" data-acc-id="${activeAccount.id}" title="Copy Username / Login ID" style="padding:2px 6px;font-size:11px">
                📋 Copy
              </button>
            </div>

            <!-- Password Line -->
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;background:var(--bg);border-radius:6px;padding:4px 8px">
              <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
                <span style="opacity:0.6;font-size:11px">🔑</span>
                <span class="vault-password-val" data-site-id="${site.id}" data-acc-id="${activeAccount.id}" style="font-family:monospace;font-size:12px;color:var(--gold);letter-spacing:${isPasswordRevealed ? 'normal' : '2px'}">
                  ${isPasswordRevealed ? App.utils.escapeHtml(getAccountPasswordPlain(activeAccount)) : '••••••••••••'}
                </span>
              </div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-outline btn-xs btn-toggle-password" data-site-id="${site.id}" data-acc-id="${activeAccount.id}" title="${isPasswordRevealed ? 'Mask Password' : 'Click to Reveal Password'}" style="padding:2px 6px;font-size:11px">
                  ${isPasswordRevealed ? '🙈' : '👁️'}
                </button>
                <button class="btn btn-outline btn-xs btn-copy-password" data-site-id="${site.id}" data-acc-id="${activeAccount.id}" title="Copy Password" style="padding:2px 6px;font-size:11px">
                  📋 Copy
                </button>
              </div>
            </div>
          `
              : `
            <div style="text-align:center;padding:8px 0;font-size:11.5px;color:var(--text3)">
              No login credentials added yet.
              <button class="btn btn-outline btn-xs btn-add-first-acc" data-site-id="${site.id}" style="margin-top:4px">
                + Add Account Credentials
              </button>
            </div>
          `
          }
        </div>

        <!-- Quick Actions Footer Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:4px;border-top:1px solid var(--border2)">
          <div style="display:flex;gap:6px">
            <button class="btn btn-gold btn-xs btn-open-and-copy" data-site-id="${site.id}" data-acc-id="${activeAccount ? activeAccount.id : ''}" title="Copies password and opens official website in a new tab">
              ⚡ Open & Copy
            </button>
            <button class="btn btn-outline btn-xs btn-open-website" data-site-id="${site.id}" title="Open official URL">
              🌐 Open
            </button>
          </div>

          <div style="display:flex;gap:4px">
            <button class="icon-btn btn-add-account-to-site" data-site-id="${site.id}" title="Add Another Account" style="font-size:13px">
              ➕
            </button>
            <button class="icon-btn btn-edit-website" data-site-id="${site.id}" title="Edit Website & Accounts" style="font-size:13px">
              ✏️
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Render Compact Table View
  function renderCompactTable(list) {
    return `
      <div class="panel" style="overflow-x:auto;padding:0;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius)">
        <table class="table" style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="border-bottom:1px solid var(--border2);color:var(--text3);text-transform:uppercase;font-size:11px">
              <th style="padding:10px 14px;text-align:left">Website / Service</th>
              <th style="padding:10px 14px;text-align:left">Category</th>
              <th style="padding:10px 14px;text-align:left">Accounts</th>
              <th style="padding:10px 14px;text-align:left">Active Login ID</th>
              <th style="padding:10px 14px;text-align:left">Password</th>
              <th style="padding:10px 14px;text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list
              .map((site) => {
                const accounts = site.accounts || [];
                const activeAccId = state.activeSelectedAccountMap[site.id] || (accounts[0] ? accounts[0].id : null);
                const activeAccount = accounts.find((a) => a.id === activeAccId) || accounts[0] || null;
                const validatedUrl = App.vaultCrypto ? App.vaultCrypto.validateUrl(site.url) : { domain: site.url };
                const isPasswordRevealed = activeAccount && state.revealedPasswords[`${site.id}_${activeAccount.id}`];

                return `
                <tr style="border-bottom:1px solid var(--border2)">
                  <td style="padding:10px 14px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="font-weight:700;color:var(--text)">${App.utils.escapeHtml(site.name)}</span>
                      ${site.is_favorite ? '<span style="color:var(--gold);font-size:11px">★</span>' : ''}
                    </div>
                    <div style="font-size:11px;color:var(--text3)">${App.utils.escapeHtml(validatedUrl.domain || site.url)}</div>
                  </td>
                  <td style="padding:10px 14px;color:var(--gold)">
                    ${App.utils.escapeHtml(site.primary_category)}
                  </td>
                  <td style="padding:10px 14px">
                    ${
                      accounts.length > 1
                        ? `<select class="form-input sel-switch-account" data-site-id="${site.id}" style="font-size:11px;padding:2px 4px;width:auto">
                            ${accounts.map((a) => `<option value="${a.id}" ${a.id === (activeAccount ? activeAccount.id : '') ? 'selected' : ''}>${App.utils.escapeHtml(a.display_name)}</option>`).join('')}
                          </select>`
                        : `<span style="font-size:11.5px;color:var(--text2)">${activeAccount ? App.utils.escapeHtml(activeAccount.display_name) : '0 accounts'}</span>`
                    }
                  </td>
                  <td style="padding:10px 14px">
                    ${
                      activeAccount
                        ? `<div style="display:flex;align-items:center;gap:6px">
                            <span style="font-family:monospace;font-size:11.5px">${App.utils.escapeHtml(activeAccount.username || activeAccount.email_login || activeAccount.customer_id || '—')}</span>
                            <button class="icon-btn btn-copy-username" data-site-id="${site.id}" data-acc-id="${activeAccount.id}" title="Copy" style="font-size:11px">📋</button>
                          </div>`
                        : '—'
                    }
                  </td>
                  <td style="padding:10px 14px">
                    ${
                      activeAccount
                        ? `<div style="display:flex;align-items:center;gap:6px">
                            <span style="font-family:monospace;font-size:11.5px;color:var(--gold)">
                              ${isPasswordRevealed ? App.utils.escapeHtml(getAccountPasswordPlain(activeAccount)) : '••••••••'}
                            </span>
                            <button class="icon-btn btn-toggle-password" data-site-id="${site.id}" data-acc-id="${activeAccount.id}" title="Reveal/Mask" style="font-size:11px">
                              ${isPasswordRevealed ? '🙈' : '👁️'}
                            </button>
                            <button class="icon-btn btn-copy-password" data-site-id="${site.id}" data-acc-id="${activeAccount.id}" title="Copy Password" style="font-size:11px">📋</button>
                          </div>`
                        : '—'
                    }
                  </td>
                  <td style="padding:10px 14px;text-align:right">
                    <div style="display:flex;justify-content:flex-end;gap:6px">
                      <button class="btn btn-gold btn-xs btn-open-and-copy" data-site-id="${site.id}" data-acc-id="${activeAccount ? activeAccount.id : ''}" title="Open & Copy">
                        ⚡ Open & Copy
                      </button>
                      <button class="icon-btn btn-edit-website" data-site-id="${site.id}" title="Edit">✏️</button>
                    </div>
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Retrieve plain password for an account (from memory/cache or fallback)
  function getAccountPasswordPlain(account) {
    if (!account) return '';
    if (account.password_plain) return account.password_plain;
    if (account.encrypted_password) {
      try {
        return window.atob(account.encrypted_password);
      } catch (_) {
        return '••••••••';
      }
    }
    return '';
  }

  // Attach all DOM listeners for main view
  function attachMainListeners(pane) {
    // Navigation items
    pane.querySelectorAll('.vault-nav-item').forEach((el) => {
      el.addEventListener('click', () => {
        state.selectedNav = el.dataset.nav;
        pane.querySelectorAll('.vault-nav-item').forEach((i) => i.classList.remove('active'));
        el.classList.add('active');
        drawMain(pane);
      });
    });

    // KPI metric card click
    pane.querySelectorAll('.kpi-clickable').forEach((el) => {
      el.addEventListener('click', () => {
        const type = el.dataset.metricFilter;
        if (type === 'all') {
          state.selectedNav = 'all';
          state.filterMultiAccount = false;
          state.filterMissingInfo = false;
          state.filterRenewalDue = false;
        } else if (type === 'accounts') {
          state.selectedNav = 'all';
          state.filterMultiAccount = true;
        } else if (type === 'favorites') {
          state.selectedNav = 'favorites';
        } else if (type === 'renewals') {
          state.selectedNav = 'all';
          state.filterRenewalDue = true;
        }
        drawMain(pane);
      });
    });

    // Reset filters
    pane.querySelector('#btnResetFilters')?.addEventListener('click', () => {
      state.filterMultiAccount = false;
      state.filterMissingInfo = false;
      state.filterRenewalDue = false;
      state.filterImportance = 'ALL';
      drawMain(pane);
    });

    // Search input
    const searchInput = pane.querySelector('#vaultSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        const container = pane.querySelector('#vaultWebsitesListContainer');
        if (container) container.innerHTML = renderWebsitesList();
        attachCardActions(pane);
      });
    }

    pane.querySelector('#btnClearSearch')?.addEventListener('click', () => {
      state.searchQuery = '';
      drawMain(pane);
    });

    // Sort select
    pane.querySelector('#vaultSortSelect')?.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      const container = pane.querySelector('#vaultWebsitesListContainer');
      if (container) container.innerHTML = renderWebsitesList();
      attachCardActions(pane);
    });

    // View toggle buttons
    pane.querySelector('#btnViewCards')?.addEventListener('click', () => {
      state.viewMode = 'card';
      drawMain(pane);
    });
    pane.querySelector('#btnViewTable')?.addEventListener('click', () => {
      state.viewMode = 'table';
      drawMain(pane);
    });

    // Top action buttons
    pane.querySelector('#btnAddWebsiteTop')?.addEventListener('click', () => openAddEditWebsiteModal(null));
    pane.querySelector('#btnEmptyAddWebsite')?.addEventListener('click', () => openAddEditWebsiteModal(null));
    pane.querySelector('#btnPasswordGenTop')?.addEventListener('click', () => openPasswordGeneratorModal());
    pane.querySelector('#btnImportExportTop')?.addEventListener('click', () => openImportExportModal());
    pane.querySelector('#btnVaultAuditTop')?.addEventListener('click', () => openAuditTrailModal());
    pane.querySelector('#btnVaultSettingsTop')?.addEventListener('click', () => openVaultSettingsModal());
    pane.querySelector('#btnManageGroups')?.addEventListener('click', () => openManageGroupsModal());

    // Manual lock button
    pane.querySelector('#btnLockVaultNow')?.addEventListener('click', () => {
      if (App.vaultCrypto) {
        App.vaultCrypto.lockVault('User manual lock');
        renderLockedState(pane);
      }
    });

    attachCardActions(pane);
  }

  // Attach listeners for interactive card elements
  function attachCardActions(pane) {
    // Account switcher dropdown
    pane.querySelectorAll('.sel-switch-account').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const siteId = sel.dataset.siteId;
        state.activeSelectedAccountMap[siteId] = e.target.value;
        drawMain(pane);
      });
    });

    // Toggle favorite
    pane.querySelectorAll('.btn-toggle-fav').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const site = state.websites.find((s) => s.id === siteId);
        if (!site) return;
        site.is_favorite = !site.is_favorite;
        try {
          await App.api.updateWebsite(siteId, { is_favorite: site.is_favorite });
          drawMain(pane);
        } catch (err) {
          App.utils.toast('Failed to update favorite: ' + err.message, 'err');
        }
      });
    });

    // Copy Username
    pane.querySelectorAll('.btn-copy-username').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const accId = btn.dataset.accId;
        const site = state.websites.find((s) => s.id === siteId);
        const acc = site && site.accounts ? site.accounts.find((a) => a.id === accId) : null;
        if (!acc) return;
        const valToCopy = acc.username || acc.email_login || acc.mobile_login || acc.customer_id;
        if (App.vaultCrypto) {
          await App.vaultCrypto.copyToClipboard(valToCopy, 'Username / Login ID');
          App.api.logVaultAudit('CREDENTIAL_COPIED', 'account', acc.id, acc.display_name, { field: 'username' });
        }
      });
    });

    // Reveal / Mask Password
    pane.querySelectorAll('.btn-toggle-password').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const accId = btn.dataset.accId;
        const key = `${siteId}_${accId}`;
        state.revealedPasswords[key] = !state.revealedPasswords[key];
        drawMain(pane);
      });
    });

    // Copy Password
    pane.querySelectorAll('.btn-copy-password').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const accId = btn.dataset.accId;
        const site = state.websites.find((s) => s.id === siteId);
        const acc = site && site.accounts ? site.accounts.find((a) => a.id === accId) : null;
        if (!acc) return;
        const pwd = getAccountPasswordPlain(acc);
        if (App.vaultCrypto) {
          await App.vaultCrypto.copyToClipboard(pwd, 'Password');
          App.api.logVaultAudit('CREDENTIAL_COPIED', 'account', acc.id, acc.display_name, { field: 'password' });
        }
      });
    });

    // Open & Copy fluid workflow (Section 11)
    pane.querySelectorAll('.btn-open-and-copy').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const accId = btn.dataset.accId;
        const site = state.websites.find((s) => s.id === siteId);
        if (!site) return;
        const acc = site.accounts ? site.accounts.find((a) => a.id === accId) || site.accounts[0] : null;

        const valRes = App.vaultCrypto ? App.vaultCrypto.validateUrl(site.url) : { valid: true, url: site.url };
        if (!valRes.valid) {
          App.utils.toast('Cannot open website: ' + (valRes.error || 'Invalid URL'), 'err');
          return;
        }

        // 1. Copy credential (password if available, otherwise username)
        if (acc && App.vaultCrypto) {
          const pwd = getAccountPasswordPlain(acc);
          if (pwd) {
            await App.vaultCrypto.copyToClipboard(pwd, `Password for ${acc.display_name}`);
          } else {
            const userVal = acc.username || acc.email_login || acc.customer_id;
            await App.vaultCrypto.copyToClipboard(userVal, `Username for ${acc.display_name}`);
          }
        }

        // 2. Open website in new tab
        window.open(valRes.url, '_blank', 'noopener,noreferrer');

        // 3. Update last opened timestamp
        site.last_opened_at = new Date().toISOString();
        App.api.updateWebsite(site.id, { last_opened_at: site.last_opened_at }).catch(() => {});
        App.api.logVaultAudit('WEBSITE_OPENED', 'website', site.id, site.name, { action: 'open_and_copy' });
      });
    });

    // Open Website only
    pane.querySelectorAll('.btn-open-website').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const site = state.websites.find((s) => s.id === siteId);
        if (!site) return;
        const valRes = App.vaultCrypto ? App.vaultCrypto.validateUrl(site.url) : { valid: true, url: site.url };
        if (!valRes.valid) {
          App.utils.toast('Cannot open website: ' + (valRes.error || 'Invalid URL'), 'err');
          return;
        }
        window.open(valRes.url, '_blank', 'noopener,noreferrer');
        site.last_opened_at = new Date().toISOString();
        App.api.updateWebsite(site.id, { last_opened_at: site.last_opened_at }).catch(() => {});
        App.api.logVaultAudit('WEBSITE_OPENED', 'website', site.id, site.name, { action: 'open_only' });
      });
    });

    // Edit website
    pane.querySelectorAll('.btn-edit-website').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const site = state.websites.find((s) => s.id === siteId);
        if (site) openAddEditWebsiteModal(site);
      });
    });

    // Add account to site
    pane.querySelectorAll('.btn-add-account-to-site, .btn-add-first-acc').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const site = state.websites.find((s) => s.id === siteId);
        if (site) openAddEditAccountModal(site, null);
      });
    });

    // Card menu dropdown (Archive, delete, etc.)
    pane.querySelectorAll('.btn-card-menu').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const siteId = btn.dataset.siteId;
        const site = state.websites.find((s) => s.id === siteId);
        if (!site) return;
        openCardOptionsMenu(site, btn);
      });
    });
  }

  // Card Options Context Menu Modal / Sheet
  function openCardOptionsMenu(site, anchorEl) {
    App.ui.open({
      title: `${site.name} — Options`,
      small: true,
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
          <button id="optEditSite" class="btn btn-outline" style="justify-content:flex-start">
            ✏️ Edit Website Details
          </button>
          <button id="optAddAccount" class="btn btn-outline" style="justify-content:flex-start">
            ➕ Add Login Account
          </button>
          <button id="optTogglePin" class="btn btn-outline" style="justify-content:flex-start">
            📌 ${site.is_pinned ? 'Unpin Website' : 'Pin to Top'}
          </button>
          <button id="optToggleArchive" class="btn btn-outline" style="justify-content:flex-start">
            📦 ${site.is_archived ? 'Restore from Archive' : 'Archive Website'}
          </button>
          <button id="optDeleteSite" class="btn btn-outline" style="justify-content:flex-start;color:var(--red);border-color:var(--red)">
            🗑️ Delete Website & Accounts
          </button>
        </div>
      `,
      actions: [{ label: 'Close', onClick: () => App.ui.close() }],
    });

    const modal = document.querySelector('#sharedModal');
    if (!modal) return;

    modal.querySelector('#optEditSite')?.addEventListener('click', () => {
      App.ui.close();
      openAddEditWebsiteModal(site);
    });

    modal.querySelector('#optAddAccount')?.addEventListener('click', () => {
      App.ui.close();
      openAddEditAccountModal(site, null);
    });

    modal.querySelector('#optTogglePin')?.addEventListener('click', async () => {
      App.ui.close();
      try {
        await App.api.updateWebsite(site.id, { is_pinned: !site.is_pinned });
        site.is_pinned = !site.is_pinned;
        App.utils.toast(site.is_pinned ? 'Website pinned to top.' : 'Website unpinned.', 'ok');
        render();
      } catch (err) {
        App.utils.toast('Failed to pin website: ' + err.message, 'err');
      }
    });

    modal.querySelector('#optToggleArchive')?.addEventListener('click', async () => {
      App.ui.close();
      try {
        const nextArchived = !site.is_archived;
        await App.api.archiveWebsite(site.id, nextArchived);
        site.is_archived = nextArchived;
        App.utils.toast(nextArchived ? 'Website archived.' : 'Website restored.', 'ok');
        render();
      } catch (err) {
        App.utils.toast('Failed to archive: ' + err.message, 'err');
      }
    });

    modal.querySelector('#optDeleteSite')?.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete "${site.name}" and all associated login accounts? This action cannot be undone.`)) {
        App.ui.close();
        try {
          await App.api.deleteWebsite(site.id);
          App.utils.toast('Website deleted successfully.', 'ok');
          render();
        } catch (err) {
          App.utils.toast('Failed to delete: ' + err.message, 'err');
        }
      }
    });
  }

  // ==========================================================================
  // MODALS: Add / Edit Website & Accounts
  // ==========================================================================

  function openAddEditWebsiteModal(existingSite) {
    const isEdit = !!existingSite;
    const catOptions = state.groups.map(
      (g) => `<option value="${App.utils.escapeHtml(g.name)}" ${existingSite && existingSite.primary_category === g.name ? 'selected' : ''}>${g.icon || '📁'} ${App.utils.escapeHtml(g.name)}</option>`
    ).join('');

    App.ui.open({
      title: isEdit ? `Edit Website — ${existingSite.name}` : '+ Add Website to Vault',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="field">
            <label>Website / Service Name <span style="color:var(--red)">*</span></label>
            <input type="text" id="mWebName" class="form-input" placeholder="e.g. LenDenClub P2P Portal, SafeGold, Zerodha Kite" value="${isEdit ? App.utils.escapeHtml(existingSite.name) : ''}">
          </div>

          <div class="field">
            <label>Website Official URL <span style="color:var(--red)">*</span></label>
            <input type="url" id="mWebUrl" class="form-input" placeholder="https://www.example.com" value="${isEdit ? App.utils.escapeHtml(existingSite.url) : ''}">
            <div id="mWebUrlWarning" style="font-size:11px;color:var(--gold);display:none;margin-top:2px">⚠️ Note: HTTPS is strongly recommended for login portals.</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Primary Category</label>
              <select id="mWebCategory" class="form-input">
                ${catOptions}
              </select>
            </div>
            <div class="field">
              <label>Importance Level</label>
              <select id="mWebImportance" class="form-input">
                <option value="NORMAL" ${isEdit && existingSite.importance === 'NORMAL' ? 'selected' : ''}>Normal</option>
                <option value="HIGH" ${isEdit && existingSite.importance === 'HIGH' ? 'selected' : ''}>High</option>
                <option value="CRITICAL" ${isEdit && existingSite.importance === 'CRITICAL' ? 'selected' : ''}>Critical</option>
                <option value="LOW" ${isEdit && existingSite.importance === 'LOW' ? 'selected' : ''}>Low</option>
              </select>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Provider / Company Name (Optional)</label>
              <input type="text" id="mWebProvider" class="form-input" placeholder="e.g. Innofin Solutions Pvt Ltd" value="${isEdit && existingSite.provider_name ? App.utils.escapeHtml(existingSite.provider_name) : ''}">
            </div>
            <div class="field">
              <label>Tags (Comma-separated)</label>
              <input type="text" id="mWebTags" class="form-input" placeholder="e.g. investment, p2p, high-yield" value="${isEdit && existingSite.tags ? App.utils.escapeHtml(Array.isArray(existingSite.tags) ? existingSite.tags.join(', ') : existingSite.tags) : ''}">
            </div>
          </div>

          <div class="field">
            <label>Description & Notes</label>
            <textarea id="mWebDescription" class="form-input" rows="2" placeholder="General service overview, security policies, portal guidelines...">${isEdit && existingSite.description ? App.utils.escapeHtml(existingSite.description) : ''}</textarea>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Support URL or Help Desk</label>
              <input type="url" id="mWebSupportUrl" class="form-input" placeholder="https://..." value="${isEdit && existingSite.support_url ? App.utils.escapeHtml(existingSite.support_url) : ''}">
            </div>
            <div class="field">
              <label>Support Email / Phone</label>
              <input type="text" id="mWebSupportContact" class="form-input" placeholder="support@domain.com or phone" value="${isEdit && (existingSite.support_email || existingSite.support_phone) ? App.utils.escapeHtml(existingSite.support_email || existingSite.support_phone) : ''}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Registration Date</label>
              <input type="date" id="mWebRegDate" class="form-input" value="${isEdit && existingSite.registration_date ? existingSite.registration_date : ''}">
            </div>
            <div class="field">
              <label>Renewal / Expiry Date</label>
              <input type="date" id="mWebRenewalDate" class="form-input" value="${isEdit && existingSite.renewal_date ? existingSite.renewal_date : ''}">
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:16px;padding-top:4px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="mWebIsFavorite" ${isEdit && existingSite.is_favorite ? 'checked' : ''}> Mark as Favorite
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="mWebIsPinned" ${isEdit && existingSite.is_pinned ? 'checked' : ''}> Pin to Top
            </label>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', onClick: () => App.ui.close() },
        {
          label: isEdit ? 'Save Changes' : 'Create Website',
          primary: true,
          onClick: async () => {
            const name = (document.querySelector('#mWebName')?.value || '').trim();
            const rawUrl = (document.querySelector('#mWebUrl')?.value || '').trim();
            if (!name) {
              App.utils.toast('Website name is required.', 'err');
              return;
            }
            if (!rawUrl) {
              App.utils.toast('Website URL is required.', 'err');
              return;
            }

            const valRes = App.vaultCrypto ? App.vaultCrypto.validateUrl(rawUrl) : { valid: true, url: rawUrl };
            if (!valRes.valid) {
              App.utils.toast('Invalid URL: ' + (valRes.error || 'Please provide a valid HTTP/HTTPS URL'), 'err');
              return;
            }

            const category = document.querySelector('#mWebCategory')?.value || 'General';
            const importance = document.querySelector('#mWebImportance')?.value || 'NORMAL';
            const provider = (document.querySelector('#mWebProvider')?.value || '').trim();
            const tagsRaw = (document.querySelector('#mWebTags')?.value || '').trim();
            const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
            const description = (document.querySelector('#mWebDescription')?.value || '').trim();
            const supportUrl = (document.querySelector('#mWebSupportUrl')?.value || '').trim();
            const supportContact = (document.querySelector('#mWebSupportContact')?.value || '').trim();
            const regDate = document.querySelector('#mWebRegDate')?.value || null;
            const renewalDate = document.querySelector('#mWebRenewalDate')?.value || null;
            const isFav = document.querySelector('#mWebIsFavorite')?.checked || false;
            const isPinned = document.querySelector('#mWebIsPinned')?.checked || false;

            const payload = {
              name: name,
              url: valRes.url,
              primary_category: category,
              importance: importance,
              provider_name: provider,
              tags: tags,
              description: description,
              support_url: supportUrl,
              support_email: supportContact.includes('@') ? supportContact : null,
              support_phone: !supportContact.includes('@') ? supportContact : null,
              registration_date: regDate,
              renewal_date: renewalDate,
              is_favorite: isFav,
              is_pinned: isPinned,
            };

            try {
              if (isEdit) {
                await App.api.updateWebsite(existingSite.id, payload);
                App.utils.toast(`Website "${name}" updated.`, 'ok');
              } else {
                const created = await App.api.createWebsite(payload);
                App.utils.toast(`Website "${name}" added to vault.`, 'ok');
                // Prompt to add an initial login account right away!
                setTimeout(() => {
                  if (confirm(`Would you like to add a login account for "${name}" now?`)) {
                    openAddEditAccountModal(created, null);
                  }
                }, 300);
              }
              App.ui.close();
              render();
            } catch (err) {
              App.utils.toast('Failed to save website: ' + err.message, 'err');
            }
          },
        },
      ],
    });

    const urlInput = document.querySelector('#mWebUrl');
    const urlWarn = document.querySelector('#mWebUrlWarning');
    if (urlInput && urlWarn) {
      urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim().toLowerCase();
        urlWarn.style.display = val.startsWith('http://') ? 'block' : 'none';
      });
    }
  }

  // Add or Edit an Account under a Website
  function openAddEditAccountModal(site, existingAccount) {
    const isEdit = !!existingAccount;
    const currentPlainPwd = isEdit ? getAccountPasswordPlain(existingAccount) : '';

    App.ui.open({
      title: isEdit ? `Edit Account — ${existingAccount.display_name}` : `+ Add Account for ${site.name}`,
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:12px;color:var(--text2);background:var(--bg2);padding:8px 12px;border-radius:6px;border:1px solid var(--border2)">
            🌐 Website: <strong style="color:var(--text)">${App.utils.escapeHtml(site.name)}</strong> &middot; ${App.utils.escapeHtml(site.url)}
          </div>

          <div class="field">
            <label>Account Display Name <span style="color:var(--red)">*</span></label>
            <input type="text" id="mAccDisplayName" class="form-input" placeholder="e.g. Personal Investor, Admin Login, Secondary Account" value="${isEdit ? App.utils.escapeHtml(existingAccount.display_name) : 'Personal Account'}">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Username / User ID</label>
              <input type="text" id="mAccUsername" class="form-input" placeholder="e.g. siva_investor" value="${isEdit && existingAccount.username ? App.utils.escapeHtml(existingAccount.username) : ''}">
            </div>
            <div class="field">
              <label>Email Login</label>
              <input type="email" id="mAccEmail" class="form-input" placeholder="e.g. user@example.com" value="${isEdit && existingAccount.email_login ? App.utils.escapeHtml(existingAccount.email_login) : ''}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Mobile Number Login</label>
              <input type="tel" id="mAccMobile" class="form-input" placeholder="e.g. +91 98765 43210" value="${isEdit && existingAccount.mobile_login ? App.utils.escapeHtml(existingAccount.mobile_login) : ''}">
            </div>
            <div class="field">
              <label>Customer / Client / Account ID</label>
              <input type="text" id="mAccCustomerId" class="form-input" placeholder="e.g. LDC-98421, CRN-10928" value="${isEdit && existingAccount.customer_id ? App.utils.escapeHtml(existingAccount.customer_id) : ''}">
            </div>
          </div>

          <div class="field">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <label style="margin:0">Password / Secret</label>
              <button type="button" id="btnGenPasswordInline" class="btn btn-outline btn-xs" style="padding:2px 8px;font-size:11px">
                ⚡ Generate Secure Password
              </button>
            </div>
            <div style="position:relative;display:flex;align-items:center">
              <input type="password" id="mAccPassword" class="form-input" placeholder="••••••••••••" value="${App.utils.escapeHtml(currentPlainPwd)}" style="padding-right:70px">
              <button type="button" id="btnToggleModalPwd" class="icon-btn" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:13px;opacity:0.8" title="Reveal / Mask">
                👁️
              </button>
            </div>
            <div id="mPasswordStrengthBar" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Login Method</label>
              <select id="mAccLoginMethod" class="form-input">
                <option value="PASSWORD" ${isEdit && existingAccount.login_method === 'PASSWORD' ? 'selected' : ''}>Password Only</option>
                <option value="PASSWORD_2FA" ${isEdit && existingAccount.two_factor_enabled ? 'selected' : ''}>Password + 2FA / OTP</option>
                <option value="SSO_GOOGLE" ${isEdit && existingAccount.login_method === 'SSO_GOOGLE' ? 'selected' : ''}>Google SSO</option>
                <option value="SSO_APPLE" ${isEdit && existingAccount.login_method === 'SSO_APPLE' ? 'selected' : ''}>Apple SSO</option>
                <option value="BIOMETRIC" ${isEdit && existingAccount.login_method === 'BIOMETRIC' ? 'selected' : ''}>Biometric / Passkey</option>
                <option value="OTP" ${isEdit && existingAccount.login_method === 'OTP' ? 'selected' : ''}>Mobile OTP</option>
              </select>
            </div>
            <div class="field">
              <label>Account Purpose</label>
              <select id="mAccPurpose" class="form-input">
                <option value="PERSONAL" ${isEdit && existingAccount.account_purpose === 'PERSONAL' ? 'selected' : ''}>Personal</option>
                <option value="BUSINESS" ${isEdit && existingAccount.account_purpose === 'BUSINESS' ? 'selected' : ''}>Business / Professional</option>
                <option value="FAMILY" ${isEdit && existingAccount.account_purpose === 'FAMILY' ? 'selected' : ''}>Family / Shared</option>
                <option value="SECONDARY" ${isEdit && existingAccount.account_purpose === 'SECONDARY' ? 'selected' : ''}>Secondary / Backup</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label>Account Notes & Security Reminders</label>
            <textarea id="mAccNotes" class="form-input" rows="2" placeholder="e.g. Linked to ICICI salary account, requires SMS OTP, renewal date in November...">${isEdit && existingAccount.account_notes ? App.utils.escapeHtml(existingAccount.account_notes) : ''}</textarea>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Subscription Plan (Optional)</label>
              <input type="text" id="mAccSubPlan" class="form-input" placeholder="e.g. Pro Monthly, Premium Tier" value="${isEdit && existingAccount.subscription_plan ? App.utils.escapeHtml(existingAccount.subscription_plan) : ''}">
            </div>
            <div class="field">
              <label>Subscription Renewal Date</label>
              <input type="date" id="mAccSubRenewalDate" class="form-input" value="${isEdit && existingAccount.subscription_renewal_date ? existingAccount.subscription_renewal_date : ''}">
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:16px;padding-top:4px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="mAccIsDefault" ${isEdit ? (existingAccount.is_default ? 'checked' : '') : (site.accounts && site.accounts.length === 0 ? 'checked' : '')}> Default Account for this Website
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="mAccIs2FA" ${isEdit && existingAccount.two_factor_enabled ? 'checked' : ''}> 2FA Enabled
            </label>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', onClick: () => App.ui.close() },
        {
          label: isEdit ? 'Save Account' : 'Add Account',
          primary: true,
          onClick: async () => {
            const displayName = (document.querySelector('#mAccDisplayName')?.value || '').trim();
            if (!displayName) {
              App.utils.toast('Display name is required (e.g. Personal Account).', 'err');
              return;
            }
            const username = (document.querySelector('#mAccUsername')?.value || '').trim();
            const email = (document.querySelector('#mAccEmail')?.value || '').trim();
            const mobile = (document.querySelector('#mAccMobile')?.value || '').trim();
            const customerId = (document.querySelector('#mAccCustomerId')?.value || '').trim();
            const rawPassword = document.querySelector('#mAccPassword')?.value || '';
            const loginMethod = document.querySelector('#mAccLoginMethod')?.value || 'PASSWORD';
            const purpose = document.querySelector('#mAccPurpose')?.value || 'PERSONAL';
            const notes = (document.querySelector('#mAccNotes')?.value || '').trim();
            const subPlan = (document.querySelector('#mAccSubPlan')?.value || '').trim();
            const subRenewalDate = document.querySelector('#mAccSubRenewalDate')?.value || null;
            const isDefault = document.querySelector('#mAccIsDefault')?.checked || false;
            const is2FA = document.querySelector('#mAccIs2FA')?.checked || false;

            // Encrypt password if present using Web Crypto AES-256-GCM
            let encPwd = '';
            let pwdIv = '';
            if (rawPassword && App.vaultCrypto) {
              const encRes = await App.vaultCrypto.encrypt(rawPassword);
              encPwd = encRes.ciphertext;
              pwdIv = encRes.iv;
            }

            const payload = {
              website_id: site.id,
              display_name: displayName,
              username: username,
              email_login: email,
              mobile_login: mobile,
              customer_id: customerId,
              encrypted_password: encPwd,
              password_iv: pwdIv,
              password_plain: rawPassword, // Preserved in local/session memory
              login_method: loginMethod,
              account_purpose: purpose,
              account_notes: notes,
              subscription_plan: subPlan,
              subscription_renewal_date: subRenewalDate,
              is_default: isDefault,
              two_factor_enabled: is2FA,
            };

            try {
              if (isEdit) {
                await App.api.updateWebsiteAccount(existingAccount.id, payload);
                App.utils.toast(`Account "${displayName}" updated.`, 'ok');
              } else {
                await App.api.createWebsiteAccount(payload);
                App.utils.toast(`Account "${displayName}" added to ${site.name}.`, 'ok');
              }
              App.ui.close();
              render();
            } catch (err) {
              App.utils.toast('Failed to save account: ' + err.message, 'err');
            }
          },
        },
      ],
    });

    const pwdInput = document.querySelector('#mAccPassword');
    const toggleBtn = document.querySelector('#btnToggleModalPwd');
    const genBtn = document.querySelector('#btnGenPasswordInline');
    const strengthEl = document.querySelector('#mPasswordStrengthBar');

    if (toggleBtn && pwdInput) {
      toggleBtn.addEventListener('click', () => {
        pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
      });
    }

    if (genBtn && pwdInput) {
      genBtn.addEventListener('click', () => {
        if (App.vaultCrypto) {
          const gen = App.vaultCrypto.generatePassword({ length: 18 });
          pwdInput.value = gen.password;
          pwdInput.type = 'text';
          if (strengthEl) {
            strengthEl.textContent = `Strength: ${gen.rating} (${gen.entropyBits} bits of entropy)`;
            strengthEl.style.color = 'var(--teal)';
          }
        }
      });
    }

    if (pwdInput && strengthEl) {
      pwdInput.addEventListener('input', () => {
        if (App.vaultCrypto && pwdInput.value) {
          const evalRes = App.vaultCrypto.evaluatePasswordStrength(pwdInput.value);
          strengthEl.textContent = `Strength: ${evalRes.rating} (${evalRes.entropyBits} bits of entropy)`;
          strengthEl.style.color = evalRes.score >= 60 ? 'var(--teal)' : 'var(--gold)';
        } else {
          strengthEl.textContent = '';
        }
      });
    }
  }

  // ==========================================================================
  // UTILITIES: Password Generator Modal (Section 14)
  // ==========================================================================

  function openPasswordGeneratorModal() {
    let currentLength = 16;
    let useUpper = true;
    let useLower = true;
    let useNumbers = true;
    let useSymbols = true;
    let excludeAmbiguous = true;

    function generate() {
      if (!App.vaultCrypto) return { password: '', rating: '', entropyBits: 0 };
      return App.vaultCrypto.generatePassword({
        length: currentLength,
        uppercase: useUpper,
        lowercase: useLower,
        numbers: useNumbers,
        symbols: useSymbols,
        excludeAmbiguous: excludeAmbiguous,
      });
    }

    let result = generate();

    App.ui.open({
      title: '⚡ Cryptographically Secure Password Generator',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:10px">
            <span id="genResultText" style="font-family:monospace;font-size:16px;color:var(--gold);word-break:break-all;letter-spacing:1px;user-select:all">
              ${App.utils.escapeHtml(result.password)}
            </span>
            <div style="display:flex;gap:6px">
              <button id="btnRegenPassword" class="icon-btn" title="Generate New" style="font-size:15px">🔄</button>
              <button id="btnCopyGenerated" class="btn btn-gold btn-xs" style="padding:4px 10px">📋 Copy</button>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text2)">
            <span id="genStrengthText">Strength: <strong style="color:var(--teal)">${result.rating}</strong> (${result.entropyBits} bits entropy)</span>
            <span style="font-size:11px">Web Crypto API &middot; Never transmitted</span>
          </div>

          <!-- Length Slider -->
          <div class="field">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <label style="margin:0">Password Length</label>
              <strong id="genLengthDisplay" style="color:var(--gold)">${currentLength}</strong>
            </div>
            <input type="range" id="genLengthRange" min="8" max="48" value="${currentLength}" style="width:100%;accent-color:var(--gold)">
          </div>

          <!-- Options -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="chkUpper" ${useUpper ? 'checked' : ''}> Uppercase (A-Z)
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="chkLower" ${useLower ? 'checked' : ''}> Lowercase (a-z)
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="chkNumbers" ${useNumbers ? 'checked' : ''}> Numbers (0-9)
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="chkSymbols" ${useSymbols ? 'checked' : ''}> Symbols (!@#$%^&*)
            </label>
          </div>

          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;color:var(--text2)">
            <input type="checkbox" id="chkAmbiguous" ${excludeAmbiguous ? 'checked' : ''}> Avoid Ambiguous Characters (0, O, 1, l, I)
          </label>
        </div>
      `,
      actions: [{ label: 'Done', onClick: () => App.ui.close() }],
    });

    const modal = document.querySelector('#sharedModal');
    if (!modal) return;

    function refresh() {
      result = generate();
      const resEl = modal.querySelector('#genResultText');
      const stEl = modal.querySelector('#genStrengthText');
      if (resEl) resEl.textContent = result.password;
      if (stEl) stEl.innerHTML = `Strength: <strong style="color:var(--teal)">${result.rating}</strong> (${result.entropyBits} bits entropy)`;
    }

    modal.querySelector('#genLengthRange')?.addEventListener('input', (e) => {
      currentLength = parseInt(e.target.value, 10);
      const lenEl = modal.querySelector('#genLengthDisplay');
      if (lenEl) lenEl.textContent = currentLength;
      refresh();
    });

    modal.querySelector('#chkUpper')?.addEventListener('change', (e) => { useUpper = e.target.checked; refresh(); });
    modal.querySelector('#chkLower')?.addEventListener('change', (e) => { useLower = e.target.checked; refresh(); });
    modal.querySelector('#chkNumbers')?.addEventListener('change', (e) => { useNumbers = e.target.checked; refresh(); });
    modal.querySelector('#chkSymbols')?.addEventListener('change', (e) => { useSymbols = e.target.checked; refresh(); });
    modal.querySelector('#chkAmbiguous')?.addEventListener('change', (e) => { excludeAmbiguous = e.target.checked; refresh(); });

    modal.querySelector('#btnRegenPassword')?.addEventListener('click', refresh);
    modal.querySelector('#btnCopyGenerated')?.addEventListener('click', async () => {
      if (App.vaultCrypto) {
        await App.vaultCrypto.copyToClipboard(result.password, 'Generated password');
      }
    });
  }

  // ==========================================================================
  // UTILITIES: Manage Groups & Categories Modal (Section 5)
  // ==========================================================================

  function openManageGroupsModal() {
    App.ui.open({
      title: '📁 Manage Vault Categories & Groups',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg2);padding:10px 14px;border-radius:8px;border:1px solid var(--border2)">
            <div>
              <strong style="color:var(--text);font-size:13px">+ Create New Custom Group</strong>
              <div style="font-size:11.5px;color:var(--text3)">Add custom classification tags for your portals</div>
            </div>
            <button id="btnAddNewGroupForm" class="btn btn-gold btn-xs">+ Add Group</button>
          </div>

          <div id="newGroupInputRow" style="display:none;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px;flex-direction:column;gap:8px">
            <div style="display:grid;grid-template-columns:1fr 60px;gap:8px">
              <input type="text" id="mNewGroupName" class="form-input" placeholder="Group Name (e.g. Freelance Portals)">
              <input type="text" id="mNewGroupIcon" class="form-input" value="📁" style="text-align:center">
            </div>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button id="btnCancelNewGroup" class="btn btn-outline btn-xs">Cancel</button>
              <button id="btnSaveNewGroup" class="btn btn-gold btn-xs">Save Group</button>
            </div>
          </div>

          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:0.8px">
            Existing Groups (${state.groups.length})
          </div>

          <div class="groups-table-container" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
            ${state.groups
              .map(
                (grp) => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg2);padding:8px 12px;border-radius:6px;border:1px solid var(--border2)">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:16px">${grp.icon || '📁'}</span>
                  <span style="font-weight:600;font-size:13px;color:var(--text)">${App.utils.escapeHtml(grp.name)}</span>
                  ${grp.is_default ? `<span class="badge" style="font-size:10px;padding:1px 5px;background:var(--fill-2)">Default</span>` : ''}
                </div>
                <div style="display:flex;gap:4px">
                  ${
                    !grp.is_default
                      ? `<button class="btn btn-outline btn-xs btn-delete-custom-group" data-group-id="${grp.id}" style="color:var(--red);border-color:var(--red);padding:2px 6px">Delete</button>`
                      : ''
                  }
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `,
      actions: [{ label: 'Done', onClick: () => App.ui.close() }],
    });

    const modal = document.querySelector('#sharedModal');
    if (!modal) return;

    const row = modal.querySelector('#newGroupInputRow');
    modal.querySelector('#btnAddNewGroupForm')?.addEventListener('click', () => {
      if (row) row.style.display = 'flex';
    });
    modal.querySelector('#btnCancelNewGroup')?.addEventListener('click', () => {
      if (row) row.style.display = 'none';
    });

    modal.querySelector('#btnSaveNewGroup')?.addEventListener('click', async () => {
      const name = (modal.querySelector('#mNewGroupName')?.value || '').trim();
      const icon = (modal.querySelector('#mNewGroupIcon')?.value || '📁').trim();
      if (!name) {
        App.utils.toast('Group name is required.', 'err');
        return;
      }
      try {
        await App.api.createWebsiteGroup({ name, icon, display_order: state.groups.length + 1 });
        App.utils.toast(`Group "${name}" created.`, 'ok');
        App.ui.close();
        render();
      } catch (err) {
        App.utils.toast('Failed to create group: ' + err.message, 'err');
      }
    });

    modal.querySelectorAll('.btn-delete-custom-group').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const gid = btn.dataset.groupId;
        if (confirm('Delete this custom group? Websites assigned to it will NOT be deleted.')) {
          try {
            await App.api.deleteWebsiteGroup(gid);
            App.utils.toast('Group deleted.', 'ok');
            App.ui.close();
            render();
          } catch (err) {
            App.utils.toast('Failed to delete group: ' + err.message, 'err');
          }
        }
      });
    });
  }

  // ==========================================================================
  // UTILITIES: Import & Export Modal (Section 19)
  // ==========================================================================

  function openImportExportModal() {
    App.ui.open({
      title: '📥 Vault Import & Export Center',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:16px">
          <!-- Export Section -->
          <div class="panel" style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:14px">
            <div style="font-weight:700;font-size:13.5px;color:var(--text);margin-bottom:4px">
              📤 Export Vault Data
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
              Download your website directory records. Per security specifications, plaintext credentials are never exported automatically.
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="btnExportMetadataCsv" class="btn btn-outline btn-sm">
                📄 Export Metadata (CSV)
              </button>
              <button id="btnExportEncryptedBackup" class="btn btn-gold btn-sm">
                🔒 Download Encrypted Backup (JSON)
              </button>
            </div>
          </div>

          <!-- Import Section -->
          <div class="panel" style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:14px">
            <div style="font-weight:700;font-size:13.5px;color:var(--text);margin-bottom:4px">
              📥 Import Websites Directory
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
              Import website metadata from CSV file with column mapping and duplicate URL prevention.
            </div>
            <input type="file" id="vaultImportFileInput" accept=".csv,.json" style="margin-bottom:10px;font-size:12px">
            <div id="importPreviewArea" style="font-size:12px;color:var(--text3);margin-top:6px"></div>
          </div>
        </div>
      `,
      actions: [{ label: 'Close', onClick: () => App.ui.close() }],
    });

    const modal = document.querySelector('#sharedModal');
    if (!modal) return;

    // Export non-sensitive metadata CSV
    modal.querySelector('#btnExportMetadataCsv')?.addEventListener('click', () => {
      const rows = [
        ['Website Name', 'URL', 'Category', 'Provider', 'Accounts Count', 'Importance', 'Renewal Date'],
      ];
      state.websites.forEach((s) => {
        rows.push([
          s.name || '',
          s.url || '',
          s.primary_category || '',
          s.provider_name || '',
          (s.accounts || []).length,
          s.importance || '',
          s.renewal_date || '',
        ]);
      });
      const csvContent = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PIOS_Website_Vault_Metadata_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      App.api.logVaultAudit('BACKUP_EXPORTED', 'vault', null, 'Metadata CSV Export', { format: 'csv' });
      App.utils.toast('Metadata CSV exported successfully.', 'ok');
    });

    // Export encrypted JSON backup
    modal.querySelector('#btnExportEncryptedBackup')?.addEventListener('click', async () => {
      const payload = {
        app: 'Personal Investment OS Website Vault',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        websites: state.websites,
        groups: state.groups,
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PIOS_Vault_Encrypted_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      App.api.logVaultAudit('BACKUP_EXPORTED', 'vault', null, 'Encrypted JSON Backup', { count: state.websites.length });
      App.utils.toast('Encrypted backup downloaded safely.', 'ok');
    });

    // Import file handler
    const fileInput = modal.querySelector('#vaultImportFileInput');
    const previewEl = modal.querySelector('#importPreviewArea');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const content = event.target.result;
            if (file.name.endsWith('.json')) {
              const data = JSON.parse(content);
              if (data.websites && Array.isArray(data.websites)) {
                if (confirm(`Import ${data.websites.length} websites from backup?`)) {
                  for (const s of data.websites) {
                    try {
                      await App.api.createWebsite({
                        name: s.name,
                        url: s.url,
                        primary_category: s.primary_category || 'General',
                        description: s.description,
                        provider_name: s.provider_name,
                        importance: s.importance || 'NORMAL',
                      });
                    } catch (_) {}
                  }
                  App.utils.toast('Backup restore completed.', 'ok');
                  App.ui.close();
                  render();
                }
              }
            } else {
              // Parse CSV lines
              const lines = content.split('\n').filter((l) => l.trim().length > 0);
              previewEl.textContent = `Found ${lines.length - 1} records in CSV. Processing import...`;
              let importedCount = 0;
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
                if (cols[0] && cols[1]) {
                  try {
                    await App.api.createWebsite({
                      name: cols[0],
                      url: cols[1],
                      primary_category: cols[2] || 'General',
                      provider_name: cols[3] || '',
                    });
                    importedCount++;
                  } catch (_) {}
                }
              }
              App.utils.toast(`Successfully imported ${importedCount} websites.`, 'ok');
              App.ui.close();
              render();
            }
          } catch (err) {
            App.utils.toast('Failed to parse import file: ' + err.message, 'err');
          }
        };
        reader.readAsText(file);
      });
    }
  }

  // ==========================================================================
  // UTILITIES: Strict Non-Secret Audit History Modal (Section 20)
  // ==========================================================================

  async function openAuditTrailModal() {
    let logs = [];
    try {
      logs = await App.api.listVaultAudit(100);
    } catch (_) {}

    App.ui.open({
      title: '🛡️ Vault Security Audit History',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:12px;color:var(--text2);background:var(--bg2);padding:8px 12px;border-radius:6px;border:1px solid var(--border2)">
            🔒 In accordance with security architecture Section 20, passwords, decrypted notes, and keys are NEVER recorded in audit trails.
          </div>

          <div style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
            ${
              logs.length
                ? logs
                    .map(
                      (l) => `
              <div style="background:var(--card);border:1px solid var(--border2);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:12px">
                <div>
                  <strong style="color:var(--gold)">${App.utils.escapeHtml(l.event_type)}</strong> &middot; <span style="color:var(--text)">${App.utils.escapeHtml(l.entity_name || l.entity_type || '')}</span>
                </div>
                <div style="font-size:11px;color:var(--text3)">
                  ${new Date(l.created_at).toLocaleString()}
                </div>
              </div>
            `
                    )
                    .join('')
                : `<div style="text-align:center;padding:24px;color:var(--text3)">No security events recorded yet.</div>`
            }
          </div>
        </div>
      `,
      actions: [{ label: 'Close', onClick: () => App.ui.close() }],
    });
  }

  // ==========================================================================
  // UTILITIES: Vault Settings & Cryptography Disclosure (Section 4 & 21)
  // ==========================================================================

  function openVaultSettingsModal() {
    const disclosure = App.vaultCrypto ? App.vaultCrypto.getSecurityDisclosure() : {};

    App.ui.open({
      title: '⚙️ Vault Settings & Security Disclosure',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:14px">
          <!-- Auto-Lock Configuration -->
          <div class="panel" style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:14px">
            <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:4px">
              🔒 Inactivity Auto-Lock
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
              Automatically clears decrypted credentials from memory when inactive.
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <select id="mSettingAutoLock" class="form-input" style="width:auto;font-size:12.5px">
                <option value="5" ${state.settings.auto_lock_minutes === 5 ? 'selected' : ''}>5 Minutes</option>
                <option value="15" ${state.settings.auto_lock_minutes === 15 ? 'selected' : ''}>15 Minutes (Default)</option>
                <option value="30" ${state.settings.auto_lock_minutes === 30 ? 'selected' : ''}>30 Minutes</option>
                <option value="60" ${state.settings.auto_lock_minutes === 60 ? 'selected' : ''}>60 Minutes</option>
                <option value="0" ${state.settings.auto_lock_minutes === 0 ? 'selected' : ''}>Never (Session Only)</option>
              </select>
            </div>
          </div>

          <!-- Cryptography & Security Disclosure (Section 4.5) -->
          <div class="panel" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="font-weight:700;font-size:13px;color:var(--gold);margin-bottom:6px">
              🛡️ Cryptography & Security Disclosure
            </div>
            <div style="font-size:12px;color:var(--text);line-height:1.6;display:flex;flex-direction:column;gap:6px">
              <div>&bull; <strong>Standard:</strong> ${disclosure.cryptoStandard || 'AES-256-GCM + PBKDF2'}</div>
              <div>&bull; <strong>In Transit:</strong> ${disclosure.inTransit || 'TLS 1.3'}</div>
              <div>&bull; <strong>At Rest:</strong> ${disclosure.atRest || 'Supabase PostgreSQL with RLS'}</div>
              <div>&bull; <strong>Volatile Memory:</strong> ${disclosure.keyBoundary || 'Session-derived in-memory key'}</div>
              <div>&bull; <strong>Honest Backend Disclosure:</strong> ${disclosure.backendVisibilityDisclosure || ''}</div>
            </div>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', onClick: () => App.ui.close() },
        {
          label: 'Save Settings',
          primary: true,
          onClick: async () => {
            const autoLock = parseInt(document.querySelector('#mSettingAutoLock')?.value || '15', 10);
            state.settings.auto_lock_minutes = autoLock;
            if (App.vaultCrypto) {
              App.vaultCrypto.setAutoLockMinutes(autoLock);
            }
            try {
              await App.api.saveVaultSettings(state.settings);
              App.utils.toast('Vault settings saved.', 'ok');
              App.ui.close();
            } catch (err) {
              App.utils.toast('Failed to save settings: ' + err.message, 'err');
            }
          },
        },
      ],
    });
  }

  // Register router hook
  App.router.register('vault', render);

  // Initialize auto-lock timer
  if (App.vaultCrypto && App.vaultCrypto.initAutoLock) {
    App.vaultCrypto.initAutoLock();
  }

  return {
    render,
    openAddEditWebsiteModal,
    openPasswordGeneratorModal,
    openImportExportModal,
    openAuditTrailModal,
  };
})();
