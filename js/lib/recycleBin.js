/* Universal Portfolio Recycle Bin & Soft-Delete Recovery Engine
   Protects all investment asset classes: Deals, SIPs/Recurring, Gold, Accounts/FDs,
   Expenses, and Liabilities. Records audit trails (who, when, why) and enables 1-click restore. */
window.App = window.App || {};

App.recycleBin = (function () {
  const STORAGE_KEY = 'ios_portfolio_recycle_bin_v1';
  const PRUNE_KEY = 'ios_recycle_bin_auto_prune_90d';

  function isAutoPruneEnabled() {
    try {
      const v = localStorage.getItem(PRUNE_KEY);
      return v === null ? true : v === 'true';
    } catch (_) {
      return true;
    }
  }

  function setAutoPruneEnabled(enabled) {
    try {
      localStorage.setItem(PRUNE_KEY, enabled ? 'true' : 'false');
    } catch (_) {}
  }

  function getTrashStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) items = [];

      // Auto-prune items older than 90 days if enabled
      if (isAutoPruneEnabled() && items.length > 0) {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const fresh = items.filter((it) => {
          const t = new Date(it.deletedAt).getTime();
          return !isNaN(t) && t >= cutoff;
        });
        if (fresh.length !== items.length) {
          items = fresh;
          saveTrashStore(items);
        }
      }
      return items;
    } catch (_) {
      return [];
    }
  }

  function saveTrashStore(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('[RecycleBin] Save notice:', e);
    }
  }

  function normalizeItemType(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('deal') || t.includes('investment')) return 'Deal';
    if (t.includes('recur') || t.includes('sip') || t.includes('systematic')) return 'Recurring';
    if (t.includes('gold') || t.includes('bullion') || t.includes('silver') || t.includes('sgb')) return 'Gold';
    if (t.includes('account') || t.includes('deposit') || t.includes('fd') || t.includes('savings') || t.includes('bank')) return 'Account';
    if (t.includes('expense') || t.includes('vendor') || t.includes('project')) return 'Expense';
    if (t.includes('liab') || t.includes('loan') || t.includes('debt') || t.includes('card')) return 'Liability';
    return 'Investment';
  }

  // Soft-delete an investment and archive it into the Recycle Bin
  async function moveToTrash(itemType, item, options = {}) {
    const userEmail = (App.state && App.state.profile && (App.state.profile.email || App.state.profile.full_name)) || 'Portfolio User';
    const now = new Date().toISOString();
    const trashId = 'trash_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const normalized = normalizeItemType(itemType);

    const name = item.deal_name || item.account_name || item.name || item.title || item.liability_name || item.item_name || 'Unnamed Item';
    const value = Number(
      item.invested_amount || item.current_balance || item.principal_amount ||
      item.total_cost || item.amount || item.outstanding_amount || item.balance || 0
    );

    const trashEntry = {
      id: trashId,
      itemType: normalized,
      subType: item.account_type || item.investment_type || item.category || item.liability_type || item.asset_type || normalized,
      itemId: item.id,
      itemName: name,
      itemValue: value,
      institution: item.institution || item.platform_name || item.platform || item.provider || item.lender || '',
      deletedAt: now,
      deletedBy: userEmail,
      deletedReason: options.reason || 'User requested deletion',
      rawItem: JSON.parse(JSON.stringify(item)),
    };

    const store = getTrashStore();
    store.unshift(trashEntry);
    if (store.length > 200) store.length = 200;
    saveTrashStore(store);

    // Record audit trail in Supabase audit_logs if available
    try {
      if (App.api && App.api.insertRow) {
        App.api.insertRow('audit_logs', {
          table_name: normalized.toLowerCase() + '_recycle_bin',
          record_id: String(item.id),
          action: 'SOFT_DELETE',
          old_value: trashEntry,
          source: 'UniversalRecycleBin',
        }).catch(() => {});
      }
    } catch (_) {}

    return trashEntry;
  }

  function listTrash() {
    return getTrashStore();
  }

  // Restore any deleted investment item back to its active ledger
  async function restoreItem(trashId) {
    const store = getTrashStore();
    const idx = store.findIndex((t) => t.id === trashId);
    if (idx === -1) throw new Error('Item not found in Recycle Bin.');

    const entry = store[idx];
    const raw = entry.rawItem;
    const type = entry.itemType;

    if (type === 'Account') {
      const payload = {
        account_name: raw.account_name || entry.itemName,
        account_type: raw.account_type || 'Savings',
        current_balance: Number(raw.current_balance || raw.balance || entry.itemValue || 0),
        opening_balance: Number(raw.opening_balance || raw.current_balance || 0),
        institution: raw.institution || '',
        account_number_masked: raw.account_number_masked || '',
        currency: raw.currency || 'INR',
        notes: (raw.notes || '') + ' [Restored from Recycle Bin on ' + new Date().toLocaleDateString() + ']',
        is_active: true,
      };
      if (raw.interest_rate) payload.interest_rate = raw.interest_rate;
      if (raw.start_date) payload.start_date = raw.start_date;
      if (raw.maturity_date) payload.maturity_date = raw.maturity_date;
      if (raw.maturity_amount) payload.maturity_amount = raw.maturity_amount;

      await App.api.createAccount(payload);
    } else if (type === 'Deal') {
      const dealPayload = Object.assign({}, raw);
      delete dealPayload.id;
      delete dealPayload.created_at;
      delete dealPayload.updated_at;
      dealPayload.notes = (dealPayload.notes || '') + ' [Restored from Recycle Bin]';
      await App.api.createDeal(dealPayload);
    } else if (type === 'Recurring') {
      const recPayload = Object.assign({}, raw);
      delete recPayload.id;
      delete recPayload.created_at;
      delete recPayload.updated_at;
      await App.api.createRecurringItem(recPayload);
    } else if (type === 'Gold') {
      const goldPayload = Object.assign({}, raw);
      delete goldPayload.id;
      delete goldPayload.created_at;
      delete goldPayload.updated_at;
      await App.api.createGoldPurchase(goldPayload);
    } else if (type === 'Liability') {
      const liabPayload = Object.assign({}, raw);
      delete liabPayload.id;
      delete liabPayload.created_at;
      delete liabPayload.updated_at;
      await App.api.createLiability(liabPayload);
    } else if (type === 'Expense') {
      const expPayload = Object.assign({}, raw);
      delete expPayload.id;
      delete expPayload.created_at;
      delete expPayload.updated_at;
      if (App.api.createExpenseTransaction) {
        await App.api.createExpenseTransaction(expPayload);
      } else if (App.api.createExpenseProject) {
        await App.api.createExpenseProject(expPayload);
      }
    }

    // Remove from trash after successful restoration
    store.splice(idx, 1);
    saveTrashStore(store);

    return entry;
  }

  function purgeItem(trashId) {
    const store = getTrashStore().filter((t) => t.id !== trashId);
    saveTrashStore(store);
  }

  function emptyTrash() {
    saveTrashStore([]);
  }

  // Opens interactive Universal Recycle Bin UI modal with tabs and auto-prune
  function openTrashModal(onRestoreCallback) {
    let currentTab = 'ALL';

    function getItemsForTab(items, tab) {
      if (tab === 'ALL') return items;
      return items.filter((it) => it.itemType.toUpperCase() === tab.toUpperCase());
    }

    function renderModal(modalBody) {
      const allItems = listTrash();
      const countDeals = allItems.filter((i) => i.itemType === 'Deal').length;
      const countRec = allItems.filter((i) => i.itemType === 'Recurring').length;
      const countGold = allItems.filter((i) => i.itemType === 'Gold').length;
      const countAcct = allItems.filter((i) => i.itemType === 'Account').length;
      const countExp = allItems.filter((i) => i.itemType === 'Expense').length;
      const countLiab = allItems.filter((i) => i.itemType === 'Liability').length;

      const displayItems = getItemsForTab(allItems, currentTab);
      const autoPrune = isAutoPruneEnabled();

      modalBody.innerHTML = `
        <div style="margin-bottom:14px">
          <!-- Category Tabs -->
          <div class="chip-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
            <button class="chip ${currentTab === 'ALL' ? 'active' : ''}" data-trash-tab="ALL">All Items (${allItems.length})</button>
            <button class="chip ${currentTab === 'DEAL' ? 'active' : ''}" data-trash-tab="DEAL">Deals (${countDeals})</button>
            <button class="chip ${currentTab === 'RECURRING' ? 'active' : ''}" data-trash-tab="RECURRING">SIPs &amp; Recurring (${countRec})</button>
            <button class="chip ${currentTab === 'GOLD' ? 'active' : ''}" data-trash-tab="GOLD">Gold (${countGold})</button>
            <button class="chip ${currentTab === 'ACCOUNT' ? 'active' : ''}" data-trash-tab="ACCOUNT">Accounts &amp; FDs (${countAcct})</button>
            <button class="chip ${currentTab === 'EXPENSE' ? 'active' : ''}" data-trash-tab="EXPENSE">Expenses (${countExp})</button>
            <button class="chip ${currentTab === 'LIABILITY' ? 'active' : ''}" data-trash-tab="LIABILITY">Liabilities (${countLiab})</button>
          </div>

          <!-- Controls Toolbar -->
          <div style="display:flex;justify-content:space-between;align-items:center;background:var(--fill-1);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);cursor:pointer;user-select:none;margin:0">
              <input type="checkbox" id="chkRecycleBinAutoPrune" ${autoPrune ? 'checked' : ''} style="cursor:pointer">
              <span>Automatically prune items deleted more than <b>90 days</b> ago</span>
            </label>
            <button class="btn btn-outline btn-sm" id="btnEmptyRecycleBinUniversal" style="color:var(--red);border-color:rgba(217,83,79,0.3);font-size:11px" ${allItems.length === 0 ? 'disabled' : ''}>
              &#128465; Empty Recycle Bin
            </button>
          </div>

          <!-- Items Table or Empty State -->
          ${displayItems.length === 0 ? `
            <div style="text-align:center;padding:48px 16px;color:var(--text3);background:var(--bg2);border:1px solid var(--border);border-radius:10px">
              <div style="font-size:36px;margin-bottom:10px">🗑️</div>
              <div style="font-weight:600;font-size:14px;color:var(--text)">No items in ${currentTab === 'ALL' ? 'the Recycle Bin' : currentTab}</div>
              <div style="font-size:12px;margin-top:6px;max-width:400px;margin-left:auto;margin-right:auto">
                Any deals, SIPs, gold purchases, fixed deposits, or accounts deleted in the future will be stored here with full audit history for 1-click restoration.
              </div>
            </div>
          ` : `
            <div class="table-scroll" style="max-height:55vh;border:1px solid var(--border);border-radius:8px">
              <table class="data" style="width:100%;font-size:12px;margin:0">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Type / Subtype</th>
                    <th style="text-align:right">Value / Balance</th>
                    <th>Deleted When</th>
                    <th>Deleted By</th>
                    <th style="text-align:center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${displayItems.map((it) => `
                    <tr>
                      <td>
                        <b>${App.utils.escapeHtml(it.itemName)}</b>
                        ${it.institution ? `<div style="font-size:10px;color:var(--text3)">${App.utils.escapeHtml(it.institution)}</div>` : ''}
                      </td>
                      <td>
                        <span class="badge" style="background:rgba(255,255,255,0.06);font-size:10px;color:var(--text2)">${App.utils.escapeHtml(it.itemType)}</span>
                        ${it.subType && it.subType !== it.itemType ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${App.utils.escapeHtml(it.subType)}</div>` : ''}
                      </td>
                      <td style="text-align:right;font-weight:700;color:var(--gold)">${App.utils.fmtMoney(it.itemValue)}</td>
                      <td style="font-size:11px;color:var(--text2);white-space:nowrap">${App.utils.fmtDateTime ? App.utils.fmtDateTime(it.deletedAt) : new Date(it.deletedAt).toLocaleString()}</td>
                      <td style="font-size:11px;color:var(--text3);white-space:nowrap">${App.utils.escapeHtml(it.deletedBy)}</td>
                      <td style="text-align:center;white-space:nowrap">
                        <button class="btn btn-gold btn-sm" data-restore-trash-id="${it.id}" style="padding:2px 8px;font-size:11px">&#8617; Restore</button>
                        <button class="btn btn-outline btn-sm" data-purge-trash-id="${it.id}" style="padding:2px 6px;font-size:11px;color:var(--red);margin-left:4px" title="Permanently delete">&times;</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      // Wire tab switching
      modalBody.querySelectorAll('[data-trash-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
          currentTab = tabBtn.dataset.trashTab;
          renderModal(modalBody);
        });
      });

      // Wire auto-prune checkbox
      const chkPrune = modalBody.querySelector('#chkRecycleBinAutoPrune');
      if (chkPrune) {
        chkPrune.addEventListener('change', () => {
          setAutoPruneEnabled(chkPrune.checked);
          App.utils.toast(chkPrune.checked ? '90-day auto-purge enabled.' : 'Auto-purge disabled; items kept indefinitely.', 'ok');
          renderModal(modalBody);
        });
      }

      // Wire restore buttons
      modalBody.querySelectorAll('[data-restore-trash-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.restoreTrashId;
          btn.disabled = true;
          btn.textContent = 'Restoring...';
          try {
            const restored = await restoreItem(id);
            App.utils.toast(`"${restored.itemName}" successfully restored to portfolio!`, 'ok');
            renderModal(modalBody);
            if (typeof onRestoreCallback === 'function') onRestoreCallback();
          } catch (e) {
            App.utils.toast('Restore failed: ' + (e.message || e), 'err');
            btn.disabled = false;
            btn.textContent = '↩ Restore';
          }
        });
      });

      // Wire purge buttons
      modalBody.querySelectorAll('[data-purge-trash-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.purgeTrashId;
          const item = allItems.find((t) => t.id === id);
          App.ui.confirmTwoStepDelete({
            title: 'Permanently Purge Record',
            itemName: item ? item.itemName : 'this record',
            itemType: item ? item.itemType : 'Archive',
            warningText: 'This will permanently destroy this archive. It cannot be recovered.',
            onConfirm: () => {
              purgeItem(id);
              App.utils.toast('Item permanently purged.');
              renderModal(modalBody);
            },
          });
        });
      });

      // Wire Empty Trash button
      modalBody.querySelector('#btnEmptyRecycleBinUniversal')?.addEventListener('click', () => {
        App.ui.confirmTwoStepDelete({
          title: 'Empty Portfolio Recycle Bin',
          itemName: 'EMPTY TRASH',
          itemType: 'Recycle Bin',
          warningText: 'This will permanently erase all archived investments in the Recycle Bin.',
          onConfirm: () => {
            emptyTrash();
            App.utils.toast('Recycle Bin emptied.');
            renderModal(modalBody);
          },
        });
      });
    }

    App.ui.open({
      title: '🗑️ Universal Portfolio Recycle Bin (Recover Deleted Investments)',
      small: false,
      bodyHtml: `<div id="universalTrashModalContainer"></div>`,
      onMount: (modalBody) => {
        const container = App.utils.qs('#universalTrashModalContainer', modalBody);
        if (container) renderModal(container);
      },
      actions: [
        { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  return {
    moveToTrash,
    listTrash,
    restoreItem,
    purgeItem,
    emptyTrash,
    openTrashModal,
    isAutoPruneEnabled,
    setAutoPruneEnabled,
  };
})();
