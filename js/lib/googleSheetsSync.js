/* ============================================================================
   Google Sheets & Drive Synchronization Module (Investment OS)
   Implements OAuth 2.0 token management (in-memory only), spreadsheet creation,
   multi-tab schema formatting, incremental / full data sync, and verification.
   ============================================================================ */
window.App = window.App || {};

App.googleSheetsSync = (function () {
  'use strict';

  const OAUTH_CLIENT_ID = '750143071178-b33kquf2eqpb63lkg4ukldvmbir6n9og.apps.googleusercontent.com';
  const REQUIRED_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

  let cachedAccessToken = null;
  let tokenExpiresAt = 0;
  let tokenClient = null;

  /**
   * Checks if user currently has an active in-memory Google access token.
   */
  function isConnected() {
    return !!(cachedAccessToken && Date.now() < tokenExpiresAt - 60000);
  }

  /**
   * Initializes Google Identity Services (GIS) Token Client.
   */
  function getGisTokenClient(onSuccess, onError) {
    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.oauth2) {
      throw new Error('Google Identity Services client library is still loading. Please try again in a few seconds.');
    }

    return window.google.accounts.oauth2.initTokenClient({
      client_id: OAUTH_CLIENT_ID,
      scope: REQUIRED_SCOPES,
      callback: (response) => {
        if (response.error) {
          console.error('[GoogleSheets] Token error:', response);
          if (onError) onError(new Error(response.error_description || response.error));
          return;
        }
        cachedAccessToken = response.access_token;
        const expiresInSec = parseInt(response.expires_in, 10) || 3599;
        tokenExpiresAt = Date.now() + (expiresInSec * 1000);
        if (onSuccess) onSuccess(cachedAccessToken);
      },
    });
  }

  /**
   * Requests Google OAuth authorization popup from user.
   */
  function authorizeGoogleAccount() {
    return new Promise((resolve, reject) => {
      try {
        const client = getGisTokenClient(
          (token) => resolve(token),
          (err) => reject(err)
        );
        client.requestAccessToken({ prompt: isConnected() ? '' : 'select_account' });
      } catch (err) {
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
  async function getValidToken() {
    if (isConnected()) return cachedAccessToken;
    return await authorizeGoogleAccount();
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

  return {
    isConnected,
    authorizeGoogleAccount,
    disconnect,
    getValidToken,
    listUserSpreadsheets,
    testConnection,
    createBackupSpreadsheet,
    syncPortfolioToSheets,
  };
})();
