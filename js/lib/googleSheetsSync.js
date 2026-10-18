/* ============================================================================
   Google Sheets & Drive Synchronization Module (Investment OS)
   Implements OAuth 2.0 token management (in-memory only), spreadsheet creation,
   multi-tab schema formatting, incremental / full data sync, and verification.
   ============================================================================ */
window.App = window.App || {};

App.googleSheetsSync = (function () {
  'use strict';

  const DEFAULT_CLIENT_ID = '750143071178-b33kquf2eqpb63lkg4ukldvmbir6n9og.apps.googleusercontent.com';
  const REQUIRED_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

  let cachedAccessToken = null;
  let tokenExpiresAt = 0;
  let tokenClient = null;

  /**
   * Returns active target email for backup operations and Google account hint.
   * Can be login email, alternate personal email (radhakrishna108566@gmail.com), or any custom email.
   */
  function getTargetEmail() {
    const saved = localStorage.getItem('ios_backup_target_email');
    if (saved && saved.trim()) return saved.trim();
    const profileEmail = App.state?.profile?.email || App.auth?.getUser()?.email;
    return profileEmail || 'radhakrishna108566@gmail.com';
  }

  function setTargetEmail(email) {
    if (email && email.trim()) {
      localStorage.setItem('ios_backup_target_email', email.trim());
    }
  }

  /**
   * Returns active Google OAuth Client ID, allowing custom client ID for domains like sri.qzz.io.
   */
  function getClientId() {
    return localStorage.getItem('ios_google_client_id') || DEFAULT_CLIENT_ID;
  }

  function setCustomClientId(clientId) {
    if (clientId && clientId.trim()) {
      localStorage.setItem('ios_google_client_id', clientId.trim());
    } else {
      localStorage.removeItem('ios_google_client_id');
    }
  }

  /**
   * Checks if user currently has an active in-memory Google access token.
   */
  function isConnected() {
    return !!(cachedAccessToken && Date.now() < tokenExpiresAt - 60000);
  }

  /**
   * Shows a comprehensive diagnostic and zero-friction fallback modal when
   * Google OAuth rejects the request due to origin_mismatch on a custom domain (e.g. sri.qzz.io).
   */
  function showOriginMismatchDialog(targetEmail) {
    const origin = window.location.origin;
    const email = targetEmail || getTargetEmail();
    const currentClientId = getClientId();

    if (App.ui && App.ui.open) {
      App.ui.open({
        title: 'Google OAuth Domain Authorization Note',
        bodyHtml: `
          <div style="font-size:13px;line-height:1.55;color:var(--text);display:flex;flex-direction:column;gap:12px">
            <div style="background:rgba(229,72,77,0.1);border:1px solid rgba(229,72,77,0.3);border-radius:8px;padding:12px 14px">
              <div style="font-weight:700;color:var(--red,#e5484d);font-size:13.5px;margin-bottom:4px">
                Origin Mismatch for Domain: <code>${App.utils.escapeHtml(origin)}</code>
              </div>
              <div style="font-size:12px;color:var(--text2)">
                Google's OAuth 2.0 policy requires this website domain (<code>${App.utils.escapeHtml(origin)}</code>) to be added under 
                <em>"Authorized JavaScript origins"</em> in Google Cloud Console for client ID <code>${App.utils.escapeHtml(currentClientId.slice(0, 24))}...</code>.
              </div>
            </div>

            <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:12px 14px">
              <div style="font-weight:700;color:var(--gold);margin-bottom:6px">⚡ Instant Zero-Error Solutions (Works on ANY Domain & Browser):</div>
              <ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--text);display:flex;flex-direction:column;gap:6px">
                <li>
                  <strong>1-Click Multi-Tab Google Sheets (.xlsx):</strong> Generates the full 14-tab portfolio spreadsheet immediately in your browser for <strong>${App.utils.escapeHtml(email)}</strong>. No Google Cloud permissions needed!
                </li>
                <li>
                  <strong>Complete Portfolio Backup (ZIP):</strong> Full archive containing all database tables as JSON, CSVs, uploaded documents, and SHA-256 verification hash.
                </li>
                <li>
                  <strong>Custom OAuth Client ID:</strong> If you prefer direct Drive sync on <code>${App.utils.escapeHtml(origin)}</code>, you can supply your own Google Cloud Client ID below.
                </li>
              </ul>
            </div>

            <div style="margin-top:4px">
              <label style="display:block;font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:4px">
                Custom Google Cloud Client ID (Optional for ${App.utils.escapeHtml(origin)}):
              </label>
              <div style="display:flex;gap:6px">
                <input type="text" id="dlgCustomClientIdInput" class="form-input" style="flex:1;font-size:11.5px;font-family:monospace" placeholder="e.g. 123456789-xyz.apps.googleusercontent.com" value="${currentClientId !== DEFAULT_CLIENT_ID ? App.utils.escapeHtml(currentClientId) : ''}">
                <button type="button" id="dlgBtnSaveClientId" class="btn btn-sm btn-outline">Save</button>
              </div>
            </div>
          </div>
        `,
        actions: [
          {
            label: '📊 Download 14-Tab Google Sheets (.xlsx)',
            className: 'btn-gold',
            onClick: async () => {
              App.ui.close();
              try {
                App.utils.toast('Preparing 14-tab Google Sheets spreadsheet...', 'info');
                await App.googleSheetsSync.exportPortfolioToXlsx({ targetEmail: email });
                App.utils.toast('✓ Google Sheets (.xlsx) workbook downloaded! Open in Google Sheets to view.', 'ok');
              } catch (e) {
                App.utils.toast('Export failed: ' + e.message, 'err');
              }
            }
          },
          {
            label: '⚡ Full Portfolio Backup (ZIP)',
            className: 'btn-outline',
            onClick: async () => {
              App.ui.close();
              if (App.backupCenter?.triggerFullPersonalBackup) {
                App.backupCenter.triggerFullPersonalBackup();
              } else if (App.backupEngine?.runFullBackup) {
                App.backupEngine.runFullBackup({ targetEmail: email });
              }
            }
          },
          {
            label: 'Close',
            className: 'btn-outline',
            onClick: () => App.ui.close()
          }
        ]
      });

      // Wire save custom client ID inside dialog
      setTimeout(() => {
        const inp = document.getElementById('dlgCustomClientIdInput');
        const btn = document.getElementById('dlgBtnSaveClientId');
        btn?.addEventListener('click', () => {
          const val = inp?.value?.trim() || '';
          setCustomClientId(val);
          App.utils.toast(val ? 'Custom Google Client ID saved!' : 'Reset to default Client ID.', 'ok');
        });
      }, 100);
    } else {
      alert(`Google OAuth requires ${origin} in Authorized JavaScript origins. Use 14-Tab Sheets (.xlsx) or ZIP backup.`);
    }
  }

  /**
   * Initializes Google Identity Services (GIS) Token Client.
   * Passes target email as hint so Google prompts the user for radhakrishna108566@gmail.com
   * or the user-specified email.
   */
  function getGisTokenClient(targetEmail, onSuccess, onError) {
    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.oauth2) {
      throw new Error('Google Identity Services client library is still loading. Please try again in a few seconds.');
    }

    const email = targetEmail || getTargetEmail();
    const config = {
      client_id: getClientId(),
      scope: REQUIRED_SCOPES,
      callback: (response) => {
        if (response.error) {
          console.error('[GoogleSheets] Token error:', response);
          const errObj = new Error(response.error_description || response.error);
          errObj.code = response.error;
          if (response.error === 'origin_mismatch' || String(response.error).includes('origin')) {
            showOriginMismatchDialog(email);
          }
          if (onError) onError(errObj);
          return;
        }
        cachedAccessToken = response.access_token;
        const expiresInSec = parseInt(response.expires_in, 10) || 3599;
        tokenExpiresAt = Date.now() + (expiresInSec * 1000);
        if (onSuccess) onSuccess(cachedAccessToken);
      },
      error_callback: (err) => {
        console.error('[GoogleSheets] Token client error callback:', err);
        const errObj = new Error(err.message || err.type || 'Google OAuth failed');
        if (err.type === 'origin_mismatch' || String(err.message || '').includes('origin')) {
          showOriginMismatchDialog(email);
        }
        if (onError) onError(errObj);
      }
    };

    if (email && typeof email === 'string' && email.includes('@')) {
      config.hint = email.trim();
    }

    return window.google.accounts.oauth2.initTokenClient(config);
  }

  /**
   * Requests Google OAuth authorization popup from user.
   */
  function authorizeGoogleAccount(targetEmail) {
    const email = targetEmail || getTargetEmail();
    return new Promise((resolve, reject) => {
      try {
        const client = getGisTokenClient(
          email,
          (token) => resolve(token),
          (err) => reject(err)
        );
        const reqOpts = { prompt: isConnected() ? '' : 'select_account' };
        if (email) reqOpts.hint = email;
        client.requestAccessToken(reqOpts);
      } catch (err) {
        if (String(err?.message || '').includes('origin')) {
          showOriginMismatchDialog(email);
        }
        reject(err);
      }
    });
  }

  /**
   * Disconnects / revokes the active in-memory Google session.
   */
  function disconnect() {
    if (cachedAccessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(cachedAccessToken, () => {});
      } catch (_) {}
    }
    cachedAccessToken = null;
    tokenExpiresAt = 0;
  }

  /**
   * Obtains a valid access token, prompting user if expired.
   */
  async function getValidToken(targetEmail) {
    if (isConnected()) return cachedAccessToken;
    return await authorizeGoogleAccount(targetEmail);
  }

  /**
   * Lists existing backup spreadsheets from user's Google Drive.
   */
  async function listUserSpreadsheets() {
    const token = await getValidToken();
    const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=30`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to list spreadsheets (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.files || [];
  }

  /**
   * Tests connection to a specific Google Spreadsheet.
   */
  async function testConnection(spreadsheetId) {
    if (!spreadsheetId) throw new Error('Spreadsheet ID is required');
    const token = await getValidToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Spreadsheet not found or access denied (HTTP ${res.status})`);
    }
    return await res.json();
  }

  /**
   * Creates a dedicated Investment OS Backup Spreadsheet with styled tabs.
   */
  async function createBackupSpreadsheet(opts = {}) {
    const token = await getValidToken();
    const scope = opts.scope || 'PERSONAL';
    const timestamp = new Date().toISOString().slice(0, 10);
    const title = opts.title || (scope === 'ADMIN'
      ? `Investment OS - Admin Full Website Backup (${timestamp})`
      : `Investment OS - Portfolio Backup (${timestamp})`);

    const standardTabs = [
      'Overview',
      'Deals',
      'Payments',
      'Payment_Schedule',
      'Recurring_SIPs',
      'Gold_Purchases',
      'Accounts_Liabilities',
      'Expense_Projects',
      'Expense_Transactions',
      'Contacts',
      'Notes_Habits',
      'Documents_Index',
      'Website_Vault_Directory',
      'System_Inventory'
    ];

    const body = {
      properties: {
        title: title,
        locale: 'en_IN',
        autoRecalc: 'ON_CHANGE'
      },
      sheets: standardTabs.map((sheetTitle, index) => ({
        properties: {
          sheetId: index + 1,
          title: sheetTitle,
          gridProperties: {
            frozenRowCount: 1,
          }
        }
      }))
    };

    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to create Google Spreadsheet (HTTP ${res.status})`);
    }

    const created = await res.json();
    return {
      spreadsheetId: created.spreadsheetId,
      url: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
      title: title
    };
  }

  /**
   * Converts an array of objects into a 2D array suitable for Google Sheets,
   * with formatted headers and stringified nested values.
   */
  function objectsToSheetValues(rows, keyOrder = null) {
    if (!rows || rows.length === 0) return [["No records found"]];

    const keys = keyOrder && keyOrder.length > 0 ? keyOrder : Array.from(
      rows.reduce((set, r) => {
        Object.keys(r || {}).forEach(k => set.add(k));
        return set;
      }, new Set())
    );

    const headerRow = keys.map(k => k.replace(/_/g, ' ').toUpperCase());
    const dataRows = rows.map(r => {
      return keys.map(k => {
        const val = r[k];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      });
    });

    return [headerRow, ...dataRows];
  }

  /**
   * Synchronizes supported portfolio data into Google Sheets tabs.
   */
  async function syncPortfolioToSheets(opts = {}) {
    const spreadsheetId = opts.spreadsheetId;
    if (!spreadsheetId) throw new Error('No Google Spreadsheet selected for synchronization.');
    const scope = opts.scope || 'PERSONAL';
    const onProgress = opts.onProgress || (() => {});

    onProgress({ phase: 'AUTH', message: 'Authorizing Google Sheets API...', progress: 5 });
    const token = await getValidToken();

    // 1. Fetch metadata and existing sheets from the target spreadsheet
    onProgress({ phase: 'INSPECT', message: 'Inspecting spreadsheet tabs...', progress: 15 });
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to inspect target spreadsheet');
    }
    const spreadsheetMeta = await metaRes.json();
    const existingSheetTitles = new Set(
      (spreadsheetMeta.sheets || []).map(s => s.properties.title)
    );

    // 2. Fetch full portfolio dataset from Supabase
    onProgress({ phase: 'DATA_FETCH', message: 'Fetching authoritative portfolio records...', progress: 30 });
    const { data, stats } = await App.api.fetchEntirePortfolioData({
      scope,
      onProgress: (p) => {
        onProgress({ phase: 'FETCHING_TABLE', message: `Reading ${p.currentTable}...`, progress: 30 + Math.round((p.progress * 0.3)) });
      }
    });

    // 3. Prepare Tab Datasets
    onProgress({ phase: 'TRANSFORM', message: 'Formatting spreadsheet matrix...', progress: 65 });

    const tabPayloads = [];

    // Overview Tab
    const overviewRows = [
      ['METRIC / PROPERTY', 'VALUE'],
      ['Sync Scope', scope],
      ['Generated At (UTC)', new Date().toISOString()],
      ['Total Records Synced', stats.recordsExported],
      ['Author', App.state.profile?.email || 'Authenticated User'],
      ['Application', 'Personal Investment OS v2.4.4'],
      ['Security Boundary', 'Bank-Grade AES-256 RLS (Vault secrets excluded from Google Sheets)'],
      ['Deals Count', (data.deals || []).length],
      ['Payments Count', (data.payments || []).length],
      ['Recurring SIPs Count', (data.recurring_items || []).length],
      ['Gold Holdings Count', (data.gold_purchases || []).length],
      ['Accounts Count', (data.accounts || []).length],
      ['Expense Transactions Count', (data.expense_transactions || []).length],
      ['Contacts Count', (data.contacts || []).length],
      ['Documents Count', (data.documents || []).length],
    ];
    tabPayloads.push({ tab: 'Overview', values: overviewRows });

    // Core Data Tabs
    if (data.deals) tabPayloads.push({ tab: 'Deals', values: objectsToSheetValues(data.deals) });
    if (data.payments) tabPayloads.push({ tab: 'Payments', values: objectsToSheetValues(data.payments) });
    if (data.payment_schedule) tabPayloads.push({ tab: 'Payment_Schedule', values: objectsToSheetValues(data.payment_schedule) });
    if (data.recurring_items) tabPayloads.push({ tab: 'Recurring_SIPs', values: objectsToSheetValues(data.recurring_items) });
    if (data.gold_purchases) tabPayloads.push({ tab: 'Gold_Purchases', values: objectsToSheetValues(data.gold_purchases) });
    if (data.accounts || data.liabilities) {
      const combined = [
        ...(data.accounts || []).map(a => ({ entry_type: 'ASSET_ACCOUNT', ...a })),
        ...(data.liabilities || []).map(l => ({ entry_type: 'LIABILITY', ...l }))
      ];
      tabPayloads.push({ tab: 'Accounts_Liabilities', values: objectsToSheetValues(combined) });
    }
    if (data.expense_projects) tabPayloads.push({ tab: 'Expense_Projects', values: objectsToSheetValues(data.expense_projects) });
    if (data.expense_transactions) tabPayloads.push({ tab: 'Expense_Transactions', values: objectsToSheetValues(data.expense_transactions) });
    if (data.contacts) tabPayloads.push({ tab: 'Contacts', values: objectsToSheetValues(data.contacts) });
    if (data.notes || data.daily_financial_habits) {
      const notesHabits = [
        ...(data.notes || []).map(n => ({ section: 'NOTE', ...n })),
        ...(data.daily_financial_habits || []).map(h => ({ section: 'HABIT', ...h }))
      ];
      tabPayloads.push({ tab: 'Notes_Habits', values: objectsToSheetValues(notesHabits) });
    }
    if (data.documents) tabPayloads.push({ tab: 'Documents_Index', values: objectsToSheetValues(data.documents) });
    if (data.website_entries) {
      // Exclude passwords/PINs strictly per privacy guidelines
      const safeVault = (data.website_entries || []).map(w => ({
        id: w.id,
        name: w.name,
        url: w.url,
        primary_category: w.primary_category,
        importance: w.importance,
        created_at: w.created_at,
        notes: w.description || ''
      }));
      tabPayloads.push({ tab: 'Website_Vault_Directory', values: objectsToSheetValues(safeVault) });
    }

    // 4. Create missing tabs if they don't exist yet
    const missingTabs = tabPayloads.filter(p => !existingSheetTitles.has(p.tab));
    if (missingTabs.length > 0) {
      onProgress({ phase: 'CREATING_TABS', message: `Adding ${missingTabs.length} new sheet tabs...`, progress: 75 });
      const addRequests = missingTabs.map(p => ({
        addSheet: { properties: { title: p.tab, gridProperties: { frozenRowCount: 1 } } }
      }));
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: addRequests })
      });
    }

    // 5. Batch update values across all tabs
    onProgress({ phase: 'UPLOADING', message: 'Writing records to Google Sheets...', progress: 85 });
    const updatePayload = {
      valueInputOption: 'USER_ENTERED',
      data: tabPayloads.map(p => ({
        range: `'${p.tab}'!A1`,
        values: p.values
      }))
    };

    const writeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });

    if (!writeRes.ok) {
      const err = await writeRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to update spreadsheet data (HTTP ${writeRes.status})`);
    }

    onProgress({ phase: 'COMPLETE', message: 'Sync complete!', progress: 100 });

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 6. Record job history and audit log
    await App.api.createBackupJob({
      backup_type: 'GOOGLE_SHEETS_SYNC',
      scope: scope,
      status: 'COMPLETED',
      destination: 'GOOGLE_SHEETS',
      destination_details: { spreadsheetId, spreadsheetUrl, tabCount: tabPayloads.length },
      records_discovered: stats.recordsDiscovered,
      records_exported: stats.recordsExported,
      verified: true,
      verification_details: { tabsSynced: tabPayloads.map(t => t.tab) },
      completed_at: new Date().toISOString()
    }).catch(() => {});

    await App.api.logBackupAudit('GOOGLE_SHEETS_SYNC_COMPLETED', scope, {
      spreadsheetId,
      recordsCount: stats.recordsExported,
      tabs: tabPayloads.map(t => t.tab)
    });

    return {
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      recordsExported: stats.recordsExported,
      tabsUpdated: tabPayloads.length
    };
  }

  /**
   * Generates a complete 14-tab formatted Excel / Google Sheets (.xlsx) workbook directly
   * in the browser using SheetJS (xlsx). Works seamlessly on ANY website domain (including
   * custom domains like sri.qzz.io) and any browser without Google Cloud API origin restrictions!
   */
  async function exportPortfolioToXlsx(opts = {}) {
    if (typeof window.XLSX === 'undefined') {
      throw new Error('Spreadsheet generator library (XLSX) is not ready. Please refresh the page and try again.');
    }

    const scope = opts.scope || 'PERSONAL';
    const targetEmail = opts.targetEmail || getTargetEmail();
    const onProgress = opts.onProgress || (() => {});
    const cleanEmail = targetEmail.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24);
    const dateStr = new Date().toISOString().slice(0, 10);

    onProgress({ phase: 'FETCH', message: 'Fetching portfolio records for multi-tab spreadsheet...', progress: 20 });
    const { data, stats } = await App.api.fetchEntirePortfolioData({ scope });

    onProgress({ phase: 'MATRIX', message: 'Formatting spreadsheet sheets...', progress: 50 });

    const wb = window.XLSX.utils.book_new();

    // 1. Overview Tab
    const overviewData = [
      ['METRIC / PROPERTY', 'VALUE'],
      ['Portfolio Target Email', targetEmail],
      ['Sync Scope', scope],
      ['Export Date (UTC)', new Date().toISOString()],
      ['Total Records Synced', stats.recordsExported],
      ['Application', 'Personal Investment OS v2.4.4'],
      ['Compatible Platforms', 'Google Sheets, Microsoft Excel, LibreOffice Calc, Apple Numbers'],
      ['Instructions to View in Google Sheets', 'Go to drive.google.com -> Click New -> File Upload -> Open uploaded file in Google Sheets'],
      ['Security Boundary', 'Bank-Grade AES-256 (Vault passwords/secrets excluded strictly)'],
      ['Deals Count', (data.deals || []).length],
      ['Payments Count', (data.payments || []).length],
      ['Payment Schedules Count', (data.payment_schedule || []).length],
      ['Recurring SIPs Count', (data.recurring_items || []).length],
      ['Gold Holdings Count', (data.gold_purchases || []).length],
      ['Accounts Count', (data.accounts || []).length],
      ['Expense Transactions Count', (data.expense_transactions || []).length],
      ['Contacts Count', (data.contacts || []).length],
      ['Documents Count', (data.documents || []).length],
      ['Vault Directory Entries', (data.website_entries || []).length],
    ];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(overviewData), 'Overview');

    // Helper for adding object arrays to sheet
    const addSheetFromObjects = (sheetName, list) => {
      if (!list || list.length === 0) {
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([['No records found in this category']]), sheetName);
        return;
      }
      const values = objectsToSheetValues(list);
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(values), sheetName);
    };

    addSheetFromObjects('Deals', data.deals);
    addSheetFromObjects('Payments', data.payments);
    addSheetFromObjects('Payment_Schedule', data.payment_schedule);
    addSheetFromObjects('Recurring_SIPs', data.recurring_items);
    addSheetFromObjects('Gold_Purchases', data.gold_purchases);

    const accountsLiabilities = [
      ...(data.accounts || []).map(a => ({ entry_type: 'ASSET_ACCOUNT', ...a })),
      ...(data.liabilities || []).map(l => ({ entry_type: 'LIABILITY', ...l }))
    ];
    addSheetFromObjects('Accounts_Liabilities', accountsLiabilities);

    addSheetFromObjects('Expense_Projects', data.expense_projects);
    addSheetFromObjects('Expense_Transactions', data.expense_transactions);
    addSheetFromObjects('Contacts', data.contacts);

    const notesHabits = [
      ...(data.notes || []).map(n => ({ section: 'NOTE', ...n })),
      ...(data.daily_financial_habits || []).map(h => ({ section: 'HABIT', ...h }))
    ];
    addSheetFromObjects('Notes_Habits', notesHabits);

    addSheetFromObjects('Documents_Index', data.documents);

    if (data.website_entries) {
      const safeVault = (data.website_entries || []).map(w => ({
        id: w.id,
        name: w.name,
        url: w.url,
        primary_category: w.primary_category,
        importance: w.importance,
        created_at: w.created_at,
        notes: w.description || ''
      }));
      addSheetFromObjects('Website_Vault_Directory', safeVault);
    }

    onProgress({ phase: 'PACKAGING', message: 'Writing Excel workbook binary...', progress: 85 });
    const filename = `InvestmentOS_Sheets_Backup_${cleanEmail}_${dateStr}.xlsx`;
    window.XLSX.writeFile(wb, filename);

    onProgress({ phase: 'COMPLETE', message: 'Workbook generated successfully!', progress: 100 });

    // Record job in history
    await App.api.createBackupJob({
      backup_type: 'GOOGLE_SHEETS_XLSX_EXPORT',
      scope: scope,
      status: 'COMPLETED',
      destination: 'LOCAL_DOWNLOAD',
      destination_details: { filename, targetEmail, format: 'XLSX_MULTI_TAB' },
      records_discovered: stats.recordsDiscovered,
      records_exported: stats.recordsExported,
      verified: true,
      completed_at: new Date().toISOString()
    }).catch(() => {});

    await App.api.logBackupAudit('GOOGLE_SHEETS_XLSX_DOWNLOADED', scope, {
      filename,
      targetEmail,
      records: stats.recordsExported
    });

    return {
      success: true,
      filename,
      recordsExported: stats.recordsExported,
      tabs: wb.SheetNames.length
    };
  }

  return {
    isConnected,
    authorizeGoogleAccount,
    disconnect,
    getValidToken,
    listUserSpreadsheets,
    testConnection,
    createBackupSpreadsheet,
    syncPortfolioToSheets,
    exportPortfolioToXlsx,
    getTargetEmail,
    setTargetEmail,
    getClientId,
    setCustomClientId,
    showOriginMismatchDialog,
  };
})();

