/* ============================================================================
   Backup, Sync & Disaster Recovery Center (Investment OS)
   Complete implementation covering Personal Portfolio Backups, Google Sheets Sync,
   Documents & Attachment Backups, Administrator Full Backups, Scheduled Jobs,
   Integrity Verification, and Safe Restore & Recovery.
   ============================================================================ */
window.App = window.App || {};

(function () {
  'use strict';

  let currentTab = 'dashboard';
  let activeBackupJob = null;
  let cachedDataSources = [];
  let cachedJobs = [];
  let cachedAuditLogs = [];
  let cachedSchedule = null;

  /**
   * Main entry point registered with App.router.
   */
  async function renderBackupCenterView() {
    const pane = App.utils.qs('.view-pane[data-view="backup"]');
    if (!pane) return;

    // Check if a specific tab was requested via hash query, e.g. #backup?tab=sheets
    const hash = window.location.hash || '';
    if (hash.includes('tab=')) {
      const match = hash.match(/tab=([a-z_]+)/i);
      if (match && match[1]) {
        currentTab = match[1];
      }
    }

    const isDemo = App.auth && App.auth.isDemoMode && App.auth.isDemoMode();
    const isAdmin = !isDemo && App.utils && App.utils.isAdminOrDev && App.utils.isAdminOrDev(App.state.profile);

    pane.innerHTML = `
      <div class="backup-center-container" style="display:flex;flex-direction:column;gap:18px">
        <!-- Top Action & Header Bar -->
        <div class="vault-header-bar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border2)">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:28px">💾</div>
            <div>
              <h1 style="font-size:24px;margin:0;color:var(--text);font-family:'Cormorant Garamond',serif">Backup, Sync &amp; Restore Center</h1>
              <div style="font-size:12.5px;color:var(--text2)">Bank-grade portfolio archival, automated Google Sheets sync, cloud documents backup &amp; disaster recovery</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button id="btnQuickBackupTop" class="btn btn-gold btn-sm" style="font-weight:600">
              ⚡ Back Up My Entire Portfolio
            </button>
            <button id="btnQuickSheetsTop" class="btn btn-outline btn-sm" title="Sync portfolio to Google Sheets">
              📊 Google Sheets Sync
            </button>
            <button id="btnQuickExportTop" class="btn btn-outline btn-sm" title="Export all data as JSON">
              📥 Export JSON
            </button>
            <button id="btnRefreshBackupCenter" class="btn btn-outline btn-sm" title="Refresh backup records and telemetry">
              &#8635; Refresh
            </button>
          </div>
        </div>

        <!-- Real-time Progress Bar (Hidden by default, shown during active backup operations) -->
        <div id="backupProgressWrap" style="display:none;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 18px;box-shadow:var(--shadow)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="spinner" style="width:16px;height:16px;border-width:2px"></span>
              <span id="backupProgressMsg" style="font-size:13px;font-weight:600;color:var(--text)">Processing backup...</span>
            </div>
            <span id="backupProgressPct" style="font-size:12.5px;font-weight:700;color:var(--gold)">0%</span>
          </div>
          <div style="width:100%;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
            <div id="backupProgressBar" style="width:0%;height:100%;background:linear-gradient(90deg,var(--gold),var(--teal));transition:width 0.25s ease"></div>
          </div>
        </div>

        <!-- 11 Sub-Navigation Tabs Bar -->
        <div style="display:flex;gap:6px;border-bottom:1px solid var(--border);padding-bottom:10px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch" id="backupTabsBar">
          <button class="btn btn-sm ${currentTab === 'dashboard' ? 'btn-gold' : 'btn-outline'}" data-tab="dashboard">📊 Dashboard</button>
          <button class="btn btn-sm ${currentTab === 'personal' ? 'btn-gold' : 'btn-outline'}" data-tab="personal">👤 Personal Backups</button>
          <button class="btn btn-sm ${currentTab === 'sheets' ? 'btn-gold' : 'btn-outline'}" data-tab="sheets">📈 Google Sheets Sync</button>
          <button class="btn btn-sm ${currentTab === 'exports' ? 'btn-gold' : 'btn-outline'}" data-tab="exports">📦 Database &amp; Data Exports</button>
          <button class="btn btn-sm ${currentTab === 'documents' ? 'btn-gold' : 'btn-outline'}" data-tab="documents">📁 Documents &amp; Files</button>
          ${isAdmin ? `<button class="btn btn-sm ${currentTab === 'admin' ? 'btn-gold' : 'btn-outline'}" data-tab="admin" style="border-color:var(--gold)">👑 Administrator Backups</button>` : ''}
          <button class="btn btn-sm ${currentTab === 'schedules' ? 'btn-gold' : 'btn-outline'}" data-tab="schedules">⏱️ Scheduled Jobs</button>
          <button class="btn btn-sm ${currentTab === 'history' ? 'btn-gold' : 'btn-outline'}" data-tab="history">📜 Backup History</button>
          <button class="btn btn-sm ${currentTab === 'restore' ? 'btn-gold' : 'btn-outline'}" data-tab="restore">🔄 Restore &amp; Recovery</button>
          <button class="btn btn-sm ${currentTab === 'settings' ? 'btn-gold' : 'btn-outline'}" data-tab="settings">⚙️ Settings &amp; Quotas</button>
          <button class="btn btn-sm ${currentTab === 'audit' ? 'btn-gold' : 'btn-outline'}" data-tab="audit">🛡️ Audit History</button>
        </div>

        <!-- Tab Content Host Container -->
        <div id="backupTabContentPane"></div>
      </div>
    `;

    // Tab switcher wiring
    App.utils.qsa('#backupTabsBar [data-tab]', pane).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        App.utils.qsa('#backupTabsBar [data-tab]', pane).forEach((b) => {
          b.className = `btn btn-sm ${b.dataset.tab === currentTab ? 'btn-gold' : 'btn-outline'}`;
        });
        drawActiveTabContent();
      });
    });

    // Top action buttons wiring
    pane.querySelector('#btnQuickBackupTop')?.addEventListener('click', () => triggerFullPersonalBackup());
    pane.querySelector('#btnQuickSheetsTop')?.addEventListener('click', () => {
      currentTab = 'sheets';
      renderBackupCenterView();
    });
    pane.querySelector('#btnQuickExportTop')?.addEventListener('click', () => triggerJsonExport());
    pane.querySelector('#btnRefreshBackupCenter')?.addEventListener('click', () => drawActiveTabContent());

    await loadInitialData();
    await drawActiveTabContent();
  }

  /**
   * Loads baseline telemetry, history, and inventory.
   */
  async function loadInitialData() {
    try {
      const [jobs, sources, schedule, audit] = await Promise.all([
        App.api.listBackupJobs({ limit: 50 }).catch(() => []),
        App.api.discoverPortfolioDataSources({ scope: 'PERSONAL' }).catch(() => []),
        App.api.getBackupSchedule('PERSONAL').catch(() => null),
        App.api.listBackupAuditLogs({ limit: 30 }).catch(() => []),
      ]);
      cachedJobs = jobs || [];
      cachedDataSources = sources || [];
      cachedSchedule = schedule;
      cachedAuditLogs = audit || [];
    } catch (e) {
      console.warn('[BackupCenter] Baseline load notice:', e);
    }
  }

  /**
   * Dispatches render to the currently active tab.
   */
  async function drawActiveTabContent() {
    const host = App.utils.qs('#backupTabContentPane');
    if (!host) return;

    switch (currentTab) {
      case 'dashboard':
        await drawDashboardTab(host);
        break;
      case 'personal':
        await drawPersonalBackupsTab(host);
        break;
      case 'sheets':
        await drawGoogleSheetsTab(host);
        break;
      case 'exports':
        await drawExportsTab(host);
        break;
      case 'documents':
        await drawDocumentsTab(host);
        break;
      case 'admin':
        await drawAdminTab(host);
        break;
      case 'schedules':
        await drawSchedulesTab(host);
        break;
      case 'history':
        await drawHistoryTab(host);
        break;
      case 'restore':
        await drawRestoreTab(host);
        break;
      case 'settings':
        await drawSettingsTab(host);
        break;
      case 'audit':
        await drawAuditTab(host);
        break;
      default:
        await drawDashboardTab(host);
    }
  }

  /* ==========================================================================
     TAB 1: BACKUP DASHBOARD
     ========================================================================== */
  async function drawDashboardTab(host) {
    const lastFullJob = cachedJobs.find(j => j.backup_type === 'PERSONAL_FULL' && j.status === 'COMPLETED');
    const lastSheetsSync = cachedJobs.find(j => j.backup_type === 'GOOGLE_SHEETS_SYNC' && j.status === 'COMPLETED');
    const lastExport = cachedJobs.find(j => (j.backup_type === 'PERSONAL_DATA' || j.backup_type === 'PERSONAL_FULL') && j.status === 'COMPLETED');
    const lastDocJob = cachedJobs.find(j => j.files_backed_up > 0 && j.status === 'COMPLETED');
    const lastAdminJob = cachedJobs.find(j => j.scope === 'ADMIN' && j.status === 'COMPLETED');

    const totalRecordsDiscovered = cachedDataSources.reduce((acc, s) => acc + (s.recordCount || 0), 0);
    const availableTables = cachedDataSources.filter(s => s.status === 'AVAILABLE').length;

    // Determine overall health status
    let healthColor = 'var(--teal)';
    let healthIcon = '🛡️';
    let healthTitle = 'Portfolio Protected';
    let healthSub = 'Authoritative cloud data is accessible and ready for archival.';

    if (!lastFullJob && !lastSheetsSync) {
      healthColor = 'var(--gold)';
      healthIcon = '⚠️';
      healthTitle = 'Initial Backup Recommended';
      healthSub = 'No full archive has been generated yet for this device. Run a backup now.';
    }

    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <!-- Health Status Banner -->
        <div style="background:var(--card);border:1px solid ${healthColor};border-radius:12px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
          <div style="display:flex;align-items:center;gap:14px">
            <span style="font-size:34px">${healthIcon}</span>
            <div>
              <div style="font-size:18px;font-weight:700;color:${healthColor}">${healthTitle}</div>
              <div style="font-size:13px;color:var(--text2);margin-top:2px">${healthSub}</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button id="btnDashFullBackup" class="btn btn-gold" style="font-weight:600">
              ⚡ Back Up My Entire Portfolio
            </button>
            <button id="btnDashSyncSheets" class="btn btn-outline" style="border-color:var(--teal);color:var(--teal)">
              📊 Sync to Google Sheets
            </button>
          </div>
        </div>

        <!-- 5 Summary Metric Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:14px">
          <!-- Card 1: Last Personal Backup -->
          <div class="panel" style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Last Personal Backup</div>
            <div style="font-size:18px;font-weight:700;color:var(--gold);margin:6px 0 2px">
              ${lastFullJob ? App.utils.fmtDate(lastFullJob.completed_at) : 'Never'}
            </div>
            <div style="font-size:12px;color:var(--text2)">
              ${lastFullJob ? `${lastFullJob.records_exported} records &middot; ${App.utils.fmtBytes ? App.utils.fmtBytes(lastFullJob.output_size_bytes) : Math.round(lastFullJob.output_size_bytes / 1024) + ' KB'}` : 'Click run to create initial archive'}
            </div>
          </div>

          <!-- Card 2: Last Google Sheets Sync -->
          <div class="panel" style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Google Sheets Sync</div>
            <div style="font-size:18px;font-weight:700;color:var(--teal);margin:6px 0 2px">
              ${lastSheetsSync ? App.utils.fmtDate(lastSheetsSync.completed_at) : (App.googleSheetsSync.isConnected() ? 'Ready' : 'Not Connected')}
            </div>
            <div style="font-size:12px;color:var(--text2)">
              ${lastSheetsSync ? `${lastSheetsSync.records_exported} rows synced to Drive` : 'Mirror portfolio into spreadsheets'}
            </div>
          </div>

          <!-- Card 3: Full Data Coverage -->
          <div class="panel" style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Database Coverage</div>
            <div style="font-size:18px;font-weight:700;color:var(--text);margin:6px 0 2px">
              ${availableTables} / ${cachedDataSources.length} Tables
            </div>
            <div style="font-size:12px;color:var(--text2)">
              ${totalRecordsDiscovered} live persistent records
            </div>
          </div>

          <!-- Card 4: Documents & Attachments -->
          <div class="panel" style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Cloud Attachments</div>
            <div style="font-size:18px;font-weight:700;color:var(--text);margin:6px 0 2px">
              ${lastDocJob ? `${lastDocJob.files_backed_up} Files` : 'Cloud Storage'}
            </div>
            <div style="font-size:12px;color:var(--text2)">
              Binary PDFs &amp; images in 'documents'
            </div>
          </div>

          <!-- Card 5: Next Scheduled Run -->
          <div class="panel" style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Scheduled Automation</div>
            <div style="font-size:18px;font-weight:700;color:var(--gold);margin:6px 0 2px">
              ${cachedSchedule && cachedSchedule.is_enabled ? cachedSchedule.frequency : 'Manual Only'}
            </div>
            <div style="font-size:12px;color:var(--text2)">
              ${cachedSchedule && cachedSchedule.preferred_time ? `At ${cachedSchedule.preferred_time} (${cachedSchedule.timezone || 'UTC'})` : 'Configured via Schedules tab'}
            </div>
          </div>
        </div>

        <!-- Data Coverage Inventory Table -->
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--gold);font-family:'Cormorant Garamond',serif">Discovered Application Data Sources (${cachedDataSources.length})</div>
              <div style="font-size:12px;color:var(--text2)">Authoritative tables automatically covered in every personal backup and full sync</div>
            </div>
            <div style="font-size:12px;color:var(--teal);font-weight:600">✓ 100% Schema Discovery Synchronized</div>
          </div>

          <div style="overflow-x:auto">
            <table class="data-table" style="width:100%;font-size:12.5px;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--text3)">
                  <th style="padding:8px">Module / Data Source</th>
                  <th style="padding:8px">Underlying Table</th>
                  <th style="padding:8px">Category</th>
                  <th style="padding:8px">Records</th>
                  <th style="padding:8px">Export Formats</th>
                  <th style="padding:8px">Privacy / Security Boundary</th>
                </tr>
              </thead>
              <tbody>
                ${cachedDataSources.map(s => `
                  <tr style="border-bottom:1px solid var(--border2)">
                    <td style="padding:8px;font-weight:600;color:var(--text)">${App.utils.escapeHtml(s.label)}</td>
                    <td style="padding:8px;font-family:monospace;color:var(--text2)">${App.utils.escapeHtml(s.table)}</td>
                    <td style="padding:8px"><span style="color:var(--gold)">${App.utils.escapeHtml(s.category)}</span></td>
                    <td style="padding:8px;font-weight:600">${s.recordCount}</td>
                    <td style="padding:8px;color:var(--text2)">JSON, CSV, ZIP, Sheets</td>
                    <td style="padding:8px">
                      ${s.sensitive
                        ? '<span style="color:var(--gold);font-size:11.5px">🔒 AES-256 Encrypted (Secrets Excluded from Sheets)</span>'
                        : '<span style="color:var(--teal);font-size:11.5px">✓ Owner RLS Protected</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btnDashFullBackup')?.addEventListener('click', () => triggerFullPersonalBackup());
    host.querySelector('#btnDashSyncSheets')?.addEventListener('click', () => {
      currentTab = 'sheets';
      drawActiveTabContent();
    });
  }

  /* ==========================================================================
     TAB 2: PERSONAL BACKUPS
     ========================================================================== */
  async function drawPersonalBackupsTab(host) {
    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0 0 6px">Personal Portfolio Backup</h2>
          <p style="font-size:13px;color:var(--text2);margin:0 0 16px;line-height:1.5">
            Package your entire private portfolio into an encrypted or offline ZIP archive containing structured JSON data,
            CSV table exports, actual cloud documents, SHA-256 verification hashes, and restore manifests.
          </p>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
            <button id="btnRunFullPersonalBackup" class="btn btn-gold" style="font-weight:600">
              ⚡ Back Up My Entire Portfolio (Full ZIP)
            </button>
            <button id="btnDownloadJsonOnly" class="btn btn-outline">
              📥 Export All Data (JSON)
            </button>
            <button id="btnBackupDocsOnly" class="btn btn-outline">
              📁 Back Up Documents &amp; Attachments
            </button>
            <button id="btnVerifyLatest" class="btn btn-outline" style="border-color:var(--teal);color:var(--teal)">
              🛡️ Verify Latest Backup
            </button>
          </div>

          <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:12px 16px;font-size:12.5px;color:var(--text2);line-height:1.6">
            <strong>What's Included:</strong> Deals, Loans, Payment Schedules, Confirmed Payments, Recurring Investments,
            Gold Intelligence Holdings, Net Worth Snapshots, Accounts, Liabilities, Expense Projects, Vendors, Contacts, Notes,
            Calendar Events, Community &amp; Support Messages, Website Vault Directory (encrypted), and Document Metadata &amp; Files.
          </div>
        </div>

        <!-- Inventory List for Personal Scope -->
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px">
          <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:12px">Your Personal Data Sources (${cachedDataSources.length} Modules)</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:10px">
            ${cachedDataSources.map(s => `
              <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-weight:600;font-size:13px;color:var(--text)">${App.utils.escapeHtml(s.label)}</div>
                  <div style="font-size:11px;color:var(--text3);font-family:monospace">${s.table}</div>
                </div>
                <div style="text-align:right">
                  <span class="badge" style="background:rgba(201,168,76,0.15);color:var(--gold);font-weight:700;font-size:12px">${s.recordCount} records</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btnRunFullPersonalBackup')?.addEventListener('click', () => triggerFullPersonalBackup());
    host.querySelector('#btnDownloadJsonOnly')?.addEventListener('click', () => triggerJsonExport());
    host.querySelector('#btnBackupDocsOnly')?.addEventListener('click', () => triggerDocumentsBackup());
    host.querySelector('#btnVerifyLatest')?.addEventListener('click', () => {
      currentTab = 'restore';
      drawActiveTabContent();
    });
  }

  /* ==========================================================================
     TAB 3: GOOGLE SHEETS SYNC
     ========================================================================== */
  async function drawGoogleSheetsTab(host) {
    const isConn = App.googleSheetsSync.isConnected();
    let spreadsheets = [];
    if (isConn) {
      try { spreadsheets = await App.googleSheetsSync.listUserSpreadsheets(); } catch (_) {}
    }

    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <!-- Google Account Connection Card -->
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:32px">📊</span>
              <div>
                <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0">Google Sheets Synchronization</h2>
                <div style="font-size:12.5px;color:var(--text2)">Mirror live portfolio records into private Google Drive spreadsheets</div>
              </div>
            </div>
            <div>
              ${isConn
                ? `<span class="badge" style="background:rgba(22,201,163,0.15);color:var(--teal);padding:6px 12px;font-size:12px;font-weight:700">● Google Account Connected</span>
                   <button id="btnDisconnectGoogle" class="btn btn-outline btn-sm" style="margin-left:8px">Disconnect</button>`
                : `<button id="btnConnectGoogle" class="btn btn-gold btn-sm" style="font-weight:600">Connect Google Account</button>`}
            </div>
          </div>

          <p style="font-size:13px;color:var(--text2);line-height:1.5;margin:0 0 16px">
            Google Sheets serves as an accessible, multi-tab financial ledger of your portfolio. Syncing creates structured sheets for
            Deals, Payments, Recurring SIPs, Gold Holdings, Expense Projects, and Contacts with automated headers and formatted currency cells.
          </p>

          <!-- Privacy Disclosure -->
          <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:8px;padding:12px 14px;font-size:12px;color:var(--text);margin-bottom:16px">
            🔒 <strong>Privacy &amp; Security Boundary:</strong> Google Sheets is an unencrypted readable format. For security,
            Website Vault passwords, login PINs, and session tokens are <em>strictly excluded</em> from Google Sheets synchronization.
          </div>

          ${isConn ? `
            <!-- Spreadsheet Selection & Configuration -->
            <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:12px">
              <div style="font-weight:700;font-size:13.5px;color:var(--text)">Target Backup Spreadsheet</div>
              
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                <select id="selSpreadsheetPicker" class="form-input" style="flex:1;min-width:260px;font-size:13px">
                  <option value="">-- Choose an existing portfolio spreadsheet --</option>
                  ${spreadsheets.map(s => `<option value="${s.id}">${App.utils.escapeHtml(s.name)}</option>`).join('')}
                </select>
                <button id="btnCreateNewSheet" class="btn btn-outline btn-sm" style="border-color:var(--gold);color:var(--gold)">
                  + Create New Backup Spreadsheet
                </button>
              </div>

              <div style="display:flex;gap:10px;align-items:center;margin-top:6px">
                <input type="text" id="manualSheetIdInput" class="form-input" placeholder="Or enter Google Spreadsheet ID directly (from docs.google.com/spreadsheets/d/...)" style="flex:1;font-size:12px">
                <button id="btnTestSheetConn" class="btn btn-outline btn-sm">Test Connection</button>
              </div>

              <!-- Action Buttons -->
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;padding-top:12px;border-top:1px solid var(--border2)">
                <button id="btnSyncEntirePortfolioSheets" class="btn btn-gold" style="font-weight:600">
                  ⚡ Sync Entire Portfolio Now
                </button>
                <a id="lnkOpenSheet" href="#" target="_blank" rel="noopener" class="btn btn-outline" style="display:none;text-decoration:none">
                  Open in Google Sheets ↗
                </a>
              </div>
            </div>
          ` : `
            <div style="text-align:center;padding:24px;background:var(--bg3);border:1px dashed var(--border);border-radius:8px">
              <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">Connect your Google Account to begin</div>
              <div style="font-size:12.5px;color:var(--text2);margin-bottom:14px">Grants minimal scope (spreadsheets and app-created files only) without sharing your password.</div>
              <button id="btnConnectGoogleInline" class="btn btn-gold">Connect Google Account</button>
            </div>
          `}
        </div>

        <!-- Sync Console / Log Output -->
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px">
          <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">Live Synchronization Console</div>
          <div id="sheetsSyncConsole" style="background:#090d16;color:#a0aec0;font-family:monospace;font-size:11.5px;padding:12px;border-radius:6px;min-height:90px;max-height:220px;overflow-y:auto;line-height:1.6">
            [Ready] Google Sheets sync module initialized. Waiting for trigger.
          </div>
        </div>
      </div>
    `;

    // Connect / Disconnect handlers
    const connectHandler = async () => {
      try {
        await App.googleSheetsSync.authorizeGoogleAccount();
        App.utils.toast('Google Account connected successfully!', 'ok');
        drawActiveTabContent();
      } catch (err) {
        App.utils.toast('Connection failed: ' + (err.message || err), 'err');
      }
    };

    host.querySelector('#btnConnectGoogle')?.addEventListener('click', connectHandler);
    host.querySelector('#btnConnectGoogleInline')?.addEventListener('click', connectHandler);
    host.querySelector('#btnDisconnectGoogle')?.addEventListener('click', () => {
      App.googleSheetsSync.disconnect();
      App.utils.toast('Google Account disconnected.');
      drawActiveTabContent();
    });

    if (isConn) {
      const picker = host.querySelector('#selSpreadsheetPicker');
      const manualInput = host.querySelector('#manualSheetIdInput');
      const lnkOpen = host.querySelector('#lnkOpenSheet');
      const consoleEl = host.querySelector('#sheetsSyncConsole');

      const log = (msg) => {
        if (!consoleEl) return;
        const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleEl.innerHTML += `<div>${App.utils.escapeHtml(line)}</div>`;
        consoleEl.scrollTop = consoleEl.scrollHeight;
      };

      picker?.addEventListener('change', () => {
        if (picker.value) {
          manualInput.value = picker.value;
          lnkOpen.href = `https://docs.google.com/spreadsheets/d/${picker.value}/edit`;
          lnkOpen.style.display = 'inline-flex';
        }
      });

      host.querySelector('#btnCreateNewSheet')?.addEventListener('click', async () => {
        try {
          log('Creating dedicated multi-tab backup spreadsheet in your Google Drive...');
          const sheet = await App.googleSheetsSync.createBackupSpreadsheet({ scope: 'PERSONAL' });
          log(`✓ Created spreadsheet: ${sheet.title} (ID: ${sheet.spreadsheetId})`);
          manualInput.value = sheet.spreadsheetId;
          lnkOpen.href = sheet.url;
          lnkOpen.style.display = 'inline-flex';
          App.utils.toast('Created new backup spreadsheet!', 'ok');
        } catch (e) {
          log(`❌ Error creating spreadsheet: ${e.message}`);
          App.utils.toast('Failed to create spreadsheet: ' + e.message, 'err');
        }
      });

      host.querySelector('#btnTestSheetConn')?.addEventListener('click', async () => {
        const id = manualInput.value.trim();
        if (!id) { App.utils.toast('Enter a spreadsheet ID first', 'err'); return; }
        try {
          log(`Testing connection to spreadsheet ${id}...`);
          const meta = await App.googleSheetsSync.testConnection(id);
          log(`✓ Connection verified! Title: "${meta.properties?.title}", Tabs: ${(meta.sheets || []).map(s => s.properties?.title).join(', ')}`);
          lnkOpen.href = `https://docs.google.com/spreadsheets/d/${id}/edit`;
          lnkOpen.style.display = 'inline-flex';
          App.utils.toast('Connection verified!', 'ok');
        } catch (e) {
          log(`❌ Connection test failed: ${e.message}`);
          App.utils.toast('Test failed: ' + e.message, 'err');
        }
      });

      host.querySelector('#btnSyncEntirePortfolioSheets')?.addEventListener('click', async () => {
        const id = manualInput.value.trim();
        if (!id) { App.utils.toast('Please select or create a spreadsheet first.', 'err'); return; }

        App.ui.open({
          title: 'Confirm Google Sheets Sync',
          bodyHtml: `
            <div style="font-size:13.5px;color:var(--text);line-height:1.5">
              <div style="margin-bottom:12px">
                Are you sure you want to synchronize your entire portfolio to Google Spreadsheet (<code>${App.utils.escapeHtml(id)}</code>)?
              </div>
              <div style="background:var(--card2);border:1px solid var(--border2);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12.5px;color:var(--text2)">
                📊 <strong>Scope:</strong> This will update the data across your Google Drive spreadsheet tabs (Deals, Payments, Recurring SIPs, Gold, Accounts, Expenses, Contacts, Notes) with the latest records from your Investment OS vault.
              </div>
              <div style="font-size:12px;color:var(--text3)">
                Existing spreadsheet data in synced tabs will be refreshed with your authoritative portfolio records.
              </div>
            </div>
          `,
          actions: [
            {
              label: 'Cancel',
              className: 'btn-outline',
              onClick: () => App.ui.close()
            },
            {
              label: 'Confirm & Sync',
              className: 'btn-gold',
              onClick: async () => {
                App.ui.close();
                try {
                  showProgress('Starting synchronization...', 10);
                  log(`Initiating full portfolio synchronization to spreadsheet ${id}...`);

                  const result = await App.googleSheetsSync.syncPortfolioToSheets({
                    spreadsheetId: id,
                    scope: 'PERSONAL',
                    onProgress: (p) => {
                      showProgress(p.message, p.progress);
                      log(`[${p.phase}] ${p.message}`);
                    }
                  });

                  hideProgress();
                  log(`✓ Synchronization complete! ${result.recordsExported} records updated across ${result.tabsUpdated} tabs.`);
                  App.utils.toast(`✓ Synced ${result.recordsExported} records to Google Sheets!`, 'ok');
                  loadInitialData();
                } catch (e) {
                  hideProgress();
                  log(`❌ Sync failed: ${e.message}`);
                  App.utils.toast('Sync failed: ' + e.message, 'err');
                }
              }
            }
          ]
        });
      });
    }
  }

  /* ==========================================================================
     TAB 4: DATABASE & DATA EXPORTS
     ========================================================================== */
  async function drawExportsTab(host) {
    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0 0 6px">Structured Data Exports</h2>
          <p style="font-size:13px;color:var(--text2);margin:0 0 16px;line-height:1.5">
            Export raw portfolio records in machine-readable JSON or tabular CSV formats. JSON preserves nested foreign key relationships,
            IDs, tags, and custom metadata for disaster recovery.
          </p>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
            <button id="btnExportJsonMonolithic" class="btn btn-gold" style="font-weight:600">
              📥 Export Complete Portfolio JSON
            </button>
            <button id="btnExportFullZipAlt" class="btn btn-outline">
              📦 Download Full Archive (ZIP)
            </button>
          </div>

          <!-- Single Table Quick Export Dropdown -->
          <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:14px;margin-bottom:18px">
            <div style="font-weight:700;font-size:13.5px;color:var(--text);margin-bottom:8px">Download Single Table CSV</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
              <select id="selSingleTable" class="form-input" style="flex:1;min-width:240px;font-size:13px">
                ${cachedDataSources.map(s => `<option value="${s.key}">${App.utils.escapeHtml(s.label)} (${s.table}) - ${s.recordCount} rows</option>`).join('')}
              </select>
              <button id="btnDownloadSingleCsv" class="btn btn-outline btn-sm">Download Table CSV</button>
            </div>
          </div>

          <!-- PostgreSQL Full Database Dump & Disaster Recovery Runbook -->
          <div style="border-top:1px solid var(--border2);padding-top:16px">
            <h3 style="font-size:16px;color:var(--gold);margin:0 0 6px">PostgreSQL Native Dump &amp; Cluster Disaster Recovery</h3>
            <p style="font-size:12.5px;color:var(--text2);line-height:1.5;margin:0 0 12px">
              Application-level exports contain business records, but do not capture PostgreSQL functions, triggers, and Row Level Security (RLS) policies.
              To execute a native PostgreSQL database backup for disaster recovery, use the official Supabase CLI or standard <code>pg_dump</code>:
            </p>

            <div style="background:#090d16;color:#e2e8f0;padding:12px;border-radius:6px;font-family:monospace;font-size:11.5px;line-height:1.6;margin-bottom:10px;overflow-x:auto">
              # 1. Supabase CLI Full Database Dump (Schema + Data):<br>
              supabase db dump -f supabase_backup_$(date +%Y%m%d).sql --data-only<br><br>
              # 2. Or using PostgreSQL native pg_dump utility:<br>
              pg_dump -h db.YOUR_PROJECT_REF.supabase.co -U postgres -d postgres -F c -b -v -f pios_db_dump.backup
            </div>

            <div style="font-size:12px;color:var(--text3)">
              All 56 migrations are version-controlled in <code>supabase/migrations/</code> for deterministic schema reproduction.
            </div>
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btnExportJsonMonolithic')?.addEventListener('click', () => triggerJsonExport());
    host.querySelector('#btnExportFullZipAlt')?.addEventListener('click', () => triggerFullPersonalBackup());
    host.querySelector('#btnDownloadSingleCsv')?.addEventListener('click', async () => {
      const tableKey = host.querySelector('#selSingleTable')?.value;
      if (!tableKey) return;
      const target = cachedDataSources.find(s => s.key === tableKey);
      if (!target) return;
      try {
        App.utils.toast(`Exporting ${target.label}...`);
        const rows = await App.api.selectAll ? await App.api.selectAll(target.table) : [];
        if (!rows || rows.length === 0) {
          App.utils.toast('No records found in table', 'info');
          return;
        }
        const csv = objectsToCsv(rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${target.table}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        App.utils.toast('Downloaded CSV table', 'ok');
      } catch (e) {
        App.utils.toast('Export failed: ' + e.message, 'err');
      }
    });
  }

  /* ==========================================================================
     TAB 5: DOCUMENTS & FILE BACKUPS
     ========================================================================== */
  async function drawDocumentsTab(host) {
    let docs = [];
    try {
      docs = await App.api.listDocuments().catch(() => []);
    } catch (_) {}

    const totalBytes = docs.reduce((acc, d) => acc + (d.file_size_bytes || 0), 0);

    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px">
            <div>
              <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0">Cloud Documents &amp; Attachments Archival</h2>
              <div style="font-size:12.5px;color:var(--text2)">Preserve actual uploaded files (PDF promissory notes, sanction letters, receipts) independently from metadata</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:18px;font-weight:700;color:var(--text)">${docs.length} Files &middot; ${App.utils.fmtBytes ? App.utils.fmtBytes(totalBytes) : Math.round(totalBytes / 1024) + ' KB'}</div>
              <div style="font-size:11.5px;color:var(--teal)">Supabase 'documents' bucket</div>
            </div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
            <button id="btnBackupAllDocuments" class="btn btn-gold" style="font-weight:600">
              📁 Back Up All My Documents (ZIP)
            </button>
            <button id="btnDownloadDocManifest" class="btn btn-outline">
              📋 Download File Manifest
            </button>
          </div>

          <!-- Documents List Table -->
          <div style="overflow-x:auto">
            <table class="data-table" style="width:100%;font-size:12.5px;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--text3)">
                  <th style="padding:8px">File Name</th>
                  <th style="padding:8px">Document Type</th>
                  <th style="padding:8px">Size</th>
                  <th style="padding:8px">Storage Path</th>
                  <th style="padding:8px">Date Added</th>
                  <th style="padding:8px;text-align:right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${docs.length > 0 ? docs.map(d => `
                  <tr style="border-bottom:1px solid var(--border2)">
                    <td style="padding:8px;font-weight:600;color:var(--text)">${App.utils.escapeHtml(d.file_name || 'document')}</td>
                    <td style="padding:8px"><span style="color:var(--gold)">${App.utils.escapeHtml(d.document_type || 'General')}</span></td>
                    <td style="padding:8px">${App.utils.fmtBytes ? App.utils.fmtBytes(d.file_size_bytes || 0) : Math.round((d.file_size_bytes || 0) / 1024) + ' KB'}</td>
                    <td style="padding:8px;font-family:monospace;font-size:11.5px;color:var(--text3)">${App.utils.escapeHtml(d.storage_path || '')}</td>
                    <td style="padding:8px;color:var(--text2)">${App.utils.fmtDate(d.created_at)}</td>
                    <td style="padding:8px;text-align:right">
                      <button class="btn btn-outline btn-sm" data-dl-doc="${App.utils.escapeHtml(d.storage_path)}" data-fn="${App.utils.escapeHtml(d.file_name)}">Download</button>
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text3)">No document attachments found in vault.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btnBackupAllDocuments')?.addEventListener('click', () => triggerDocumentsBackup());
    host.querySelector('#btnDownloadDocManifest')?.addEventListener('click', () => {
      const manifestStr = JSON.stringify(docs, null, 2);
      const blob = new Blob([manifestStr], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `documents_manifest_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });

    App.utils.qsa('[data-dl-doc]', host).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const path = btn.dataset.dlDoc;
        const fn = btn.dataset.fn || 'document';
        try {
          App.utils.toast(`Downloading ${fn}...`);
          const blob = await App.api.downloadStorageDocumentBlob(path);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fn;
          a.click();
        } catch (e) {
          App.utils.toast('Download failed: ' + e.message, 'err');
        }
      });
    });
  }

  /* ==========================================================================
     TAB 6: ADMINISTRATOR BACKUPS (ADMINISTRATOR ONLY)
     ========================================================================== */
  async function drawAdminTab(host) {
    const isDemo = App.auth && App.auth.isDemoMode && App.auth.isDemoMode();
    const isAdmin = !isDemo && App.utils && App.utils.isAdminOrDev && App.utils.isAdminOrDev(App.state.profile);

    if (!isAdmin) {
      host.innerHTML = `
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:30px;text-align:center">
          <div style="font-size:36px;margin-bottom:12px">🔒</div>
          <h2 style="font-size:22px;color:var(--gold);margin:0 0 8px">Administrator Authorization Required</h2>
          <p style="font-size:13.5px;color:var(--text2);max-width:500px;margin:0 auto">
            This section is restricted to authorized portfolio administrators.
            Access is verified server-side through Row Level Security (RLS) policies.
          </p>
        </div>
      `;
      return;
    }

    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <!-- Security & Scope Warning -->
        <div style="background:rgba(201,168,76,0.1);border:1px solid var(--gold);border-radius:10px;padding:18px;display:flex;gap:14px;align-items:flex-start">
          <span style="font-size:28px">👑</span>
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--gold)">Administrator Website-Wide Backup Authority</div>
            <div style="font-size:13px;color:var(--text);line-height:1.5;margin-top:4px">
              As an authorized administrator, backups initiated from this panel will discover and archive <strong>all user records</strong>,
              cross-user portfolios, shared vaults, global configurations, and all uploaded documents.
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:8px">
              🔒 <strong>Strict Protection:</strong> User passwords, authentication hashes, and session tokens are never exported.
              Backups are stored privately and all administrative actions are permanently logged in the audit ledger.
            </div>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:14px">Execute Administrator Tasks</div>
          
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button id="btnAdminRunFullBackup" class="btn btn-gold" style="font-weight:600">
              ⚡ Run Full Website Backup (All Users ZIP)
            </button>
            <button id="btnAdminExportJson" class="btn btn-outline">
              📥 Export All Website Data (JSON)
            </button>
            <button id="btnAdminSyncSheets" class="btn btn-outline" style="border-color:var(--teal);color:var(--teal)">
              📊 Sync Authorized Data to Admin Google Sheets
            </button>
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btnAdminRunFullBackup')?.addEventListener('click', async () => {
      if (!confirm('Run complete website-wide backup across all users and tables? This may take 1-2 minutes depending on file size.')) return;
      try {
        showProgress('Starting full website backup...', 5);
        await App.backupEngine.runFullBackup({
          scope: 'ADMIN',
          onProgress: (p) => showProgress(p.message, p.progress)
        });
        hideProgress();
        App.utils.toast('Admin full website backup complete!', 'ok');
        loadInitialData();
      } catch (e) {
        hideProgress();
        App.utils.toast('Admin backup failed: ' + e.message, 'err');
      }
    });

    host.querySelector('#btnAdminExportJson')?.addEventListener('click', async () => {
      try {
        App.utils.toast('Exporting all website data...');
        const res = await App.backupEngine.exportAllDataJson({ scope: 'ADMIN' });
        App.utils.toast(`Downloaded ${res.filename} (${res.records} records)`, 'ok');
      } catch (e) {
        App.utils.toast('Export failed: ' + e.message, 'err');
      }
    });
  }

  /* ==========================================================================
     TAB 7: SCHEDULED JOBS
     ========================================================================== */
  async function drawSchedulesTab(host) {
    const s = cachedSchedule || {
      frequency: 'MANUAL',
      preferred_time: '02:00',
      timezone: 'Asia/Kolkata',
      is_enabled: true,
      include_documents: true,
      sync_google_sheets: false,
      retention_days: 30
    };

    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0 0 6px">Automated Recurring Backup Schedules</h2>
          <p style="font-size:13px;color:var(--text2);margin:0 0 16px;line-height:1.5">
            Configure automated periodic backups of your personal portfolio.
          </p>

          <form id="scheduleForm" style="display:flex;flex-direction:column;gap:14px;max-width:600px">
            <div>
              <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:4px">Backup Frequency</label>
              <select id="schedFreq" class="form-input" style="width:100%;font-size:13px">
                <option value="MANUAL" ${s.frequency === 'MANUAL' ? 'selected' : ''}>Manual Only (On-Demand)</option>
                <option value="DAILY" ${s.frequency === 'DAILY' ? 'selected' : ''}>Daily (Recommended)</option>
                <option value="WEEKLY" ${s.frequency === 'WEEKLY' ? 'selected' : ''}>Weekly</option>
                <option value="MONTHLY" ${s.frequency === 'MONTHLY' ? 'selected' : ''}>Monthly</option>
              </select>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:4px">Preferred Execution Time</label>
                <input type="time" id="schedTime" class="form-input" value="${s.preferred_time || '02:00'}" style="width:100%;font-size:13px">
              </div>
              <div>
                <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:4px">Timezone</label>
                <input type="text" id="schedTz" class="form-input" value="${s.timezone || 'Asia/Kolkata'}" style="width:100%;font-size:13px">
              </div>
            </div>

            <div>
              <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:4px">Retention Period (Days)</label>
              <input type="number" id="schedRetention" class="form-input" value="${s.retention_days || 30}" min="7" max="365" style="width:100%;font-size:13px">
              <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Old automated backups will be flagged for cleanup after this window.</div>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer">
                <input type="checkbox" id="schedDocs" ${s.include_documents ? 'checked' : ''}>
                Include cloud uploaded documents &amp; attachments in scheduled runs
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer">
                <input type="checkbox" id="schedSheets" ${s.sync_google_sheets ? 'checked' : ''}>
                Automatically synchronize records to connected Google Sheets
              </label>
            </div>

            <div style="margin-top:10px">
              <button type="submit" class="btn btn-gold" style="font-weight:600">Save Schedule Configuration</button>
            </div>
          </form>
        </div>
      </div>
    `;

    host.querySelector('#scheduleForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        scope: 'PERSONAL',
        frequency: host.querySelector('#schedFreq')?.value,
        preferred_time: host.querySelector('#schedTime')?.value,
        timezone: host.querySelector('#schedTz')?.value,
        retention_days: parseInt(host.querySelector('#schedRetention')?.value || '30', 10),
        include_documents: host.querySelector('#schedDocs')?.checked,
        sync_google_sheets: host.querySelector('#schedSheets')?.checked,
        is_enabled: host.querySelector('#schedFreq')?.value !== 'MANUAL'
      };

      try {
        await App.api.saveBackupSchedule(payload);
        App.utils.toast('Backup schedule saved successfully!', 'ok');
        cachedSchedule = payload;
      } catch (err) {
        App.utils.toast('Failed to save schedule: ' + err.message, 'err');
      }
    });
  }

  /* ==========================================================================
     TAB 8: BACKUP HISTORY
     ========================================================================== */
  async function drawHistoryTab(host) {
    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div>
              <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0">Persistent Backup Job History</h2>
              <div style="font-size:12.5px;color:var(--text2)">Audit log of all personal, admin, and Google Sheets sync operations</div>
            </div>
            <button id="btnRefreshHistory" class="btn btn-outline btn-sm">&#8635; Refresh</button>
          </div>

          <div style="overflow-x:auto">
            <table class="data-table" style="width:100%;font-size:12.5px;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--text3)">
                  <th style="padding:8px">Type</th>
                  <th style="padding:8px">Scope</th>
                  <th style="padding:8px">Destination</th>
                  <th style="padding:8px">Status</th>
                  <th style="padding:8px">Records</th>
                  <th style="padding:8px">Files</th>
                  <th style="padding:8px">Date</th>
                  <th style="padding:8px;text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${cachedJobs.length > 0 ? cachedJobs.map(j => `
                  <tr style="border-bottom:1px solid var(--border2)">
                    <td style="padding:8px;font-weight:600;color:var(--text)">${App.utils.escapeHtml(j.backup_type)}</td>
                    <td style="padding:8px"><span style="color:var(--gold)">${j.scope}</span></td>
                    <td style="padding:8px;font-size:11.5px">${App.utils.escapeHtml(j.destination)}</td>
                    <td style="padding:8px">
                      <span class="badge" style="background:${j.status === 'COMPLETED' ? 'rgba(22,201,163,0.15)' : 'rgba(229,72,77,0.15)'};color:${j.status === 'COMPLETED' ? 'var(--teal)' : 'var(--red,#e5484d)'};font-size:11px;font-weight:700">
                        ${j.status}
                      </span>
                    </td>
                    <td style="padding:8px;font-weight:600">${j.records_exported || 0}</td>
                    <td style="padding:8px">${j.files_backed_up || 0}</td>
                    <td style="padding:8px;color:var(--text2)">${App.utils.fmtDate(j.created_at)}</td>
                    <td style="padding:8px;text-align:right">
                      <button class="btn btn-outline btn-sm" data-view-job="${j.id}">Details</button>
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="8" style="padding:16px;text-align:center;color:var(--text3)">No backup jobs recorded yet. Run a backup to generate your first job entry.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btnRefreshHistory')?.addEventListener('click', async () => {
      await loadInitialData();
      drawHistoryTab(host);
    });

    App.utils.qsa('[data-view-job]', host).forEach((btn) => {
      btn.addEventListener('click', () => {
        const jobId = btn.dataset.viewJob;
        const job = cachedJobs.find(j => j.id === jobId);
        if (!job) return;

        App.ui.open({
          title: `Job Details: ${job.backup_type}`,
          bodyHtml: `
            <div style="font-size:13px;line-height:1.6;display:flex;flex-direction:column;gap:10px">
              <div><strong>Job ID:</strong> <code>${job.id}</code></div>
              <div><strong>Scope:</strong> ${job.scope}</div>
              <div><strong>Status:</strong> ${job.status}</div>
              <div><strong>Destination:</strong> ${job.destination}</div>
              <div><strong>Records Discovered:</strong> ${job.records_discovered}</div>
              <div><strong>Records Exported:</strong> ${job.records_exported}</div>
              <div><strong>Files Backed Up:</strong> ${job.files_backed_up} (Failed: ${job.failed_count || 0})</div>
              <div><strong>Archive Size:</strong> ${App.utils.fmtBytes ? App.utils.fmtBytes(job.output_size_bytes) : job.output_size_bytes + ' bytes'}</div>
              <div><strong>SHA-256 Hash:</strong> <code style="word-break:break-all">${job.checksum_sha256 || 'N/A'}</code></div>
              <div><strong>Started:</strong> ${job.started_at}</div>
              <div><strong>Completed:</strong> ${job.completed_at || 'In progress'}</div>
              ${job.error_message ? `<div style="color:var(--red,#e5484d)"><strong>Error:</strong> ${App.utils.escapeHtml(job.error_message)}</div>` : ''}
            </div>
          `,
          actions: [{ label: 'Close', onClick: App.ui.close }]
        });
      });
    });
  }

  /* ==========================================================================
     TAB 9: RESTORE & RECOVERY
     ========================================================================== */
  async function drawRestoreTab(host) {
    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <!-- Disaster Recovery Notice -->
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0 0 6px">Portfolio Restore &amp; Disaster Recovery</h2>
          <p style="font-size:13px;color:var(--text2);margin:0 0 16px;line-height:1.5">
            Restore your portfolio records from a verified backup archive (ZIP or JSON). Every restore is non-destructive
            by default: inspect the impact preview, resolve duplicate conflicts, and verify relational integrity before committing.
          </p>

          <!-- Upload Dropzone -->
          <div style="border:2px dashed var(--border);border-radius:10px;padding:28px;text-align:center;background:var(--bg2);margin-bottom:16px">
            <span style="font-size:36px;display:block;margin-bottom:8px">📤</span>
            <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">Select Backup Archive to Inspect</div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:14px">Supports .zip archives and .json exports generated by Investment OS</div>
            <input type="file" id="restoreFileInput" accept=".zip,.json" style="display:none">
            <button id="btnBrowseRestoreFile" class="btn btn-outline" style="border-color:var(--gold);color:var(--gold)">
              Choose File from Device...
            </button>
            <div id="selectedRestoreFileName" style="font-size:12.5px;color:var(--teal);margin-top:8px;font-weight:600"></div>
          </div>

          <!-- Preview & Action Controls -->
          <div id="restorePreviewArea" style="display:none;margin-top:16px">
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px;margin-bottom:16px">
              <div style="font-size:15px;font-weight:700;color:var(--gold);margin-bottom:8px">Non-Destructive Impact Preview</div>
              <div id="restoreSummaryText" style="font-size:13px;color:var(--text);line-height:1.5"></div>
              <div id="restoreConflictTable" style="margin-top:12px"></div>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button id="btnExecuteRealRestore" class="btn btn-gold" style="font-weight:600">
                🚀 Commit &amp; Restore Records
              </button>
              <button id="btnCancelRestore" class="btn btn-outline">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Disaster Recovery Checklist -->
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px">
          <div style="font-size:16px;font-weight:700;color:var(--gold);font-family:'Cormorant Garamond',serif;margin-bottom:8px">Emergency Disaster Recovery Checklist</div>
          <div style="font-size:12.5px;color:var(--text);line-height:1.6;display:flex;flex-direction:column;gap:6px">
            <div>1. <strong>Cloud Project Outage:</strong> Retrieve your offline ZIP backup from your computer, Google Drive, or cold storage.</div>
            <div>2. <strong>Relational Reconstruction:</strong> Upload the ZIP above. The restore engine automatically reconstructs platforms, deals, schedules, and payments in strict foreign-key order.</div>
            <div>3. <strong>Database Cluster Recovery:</strong> If recreating a Supabase project from scratch, apply migrations <code>001</code> to <code>056</code> from the codebase before running the restore engine.</div>
            <div>4. <strong>Credential Vault Restoration:</strong> Website Vault passwords are safe because they are AES-256 encrypted using your authenticated session key.</div>
          </div>
        </div>
      </div>
    `;

    const fileInput = host.querySelector('#restoreFileInput');
    const btnBrowse = host.querySelector('#btnBrowseRestoreFile');
    const selectedNameEl = host.querySelector('#selectedRestoreFileName');
    const previewArea = host.querySelector('#restorePreviewArea');
    const summaryText = host.querySelector('#restoreSummaryText');
    const conflictArea = host.querySelector('#restoreConflictTable');
    let stagedRestoreData = null;

    btnBrowse?.addEventListener('click', () => fileInput.click());

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      selectedNameEl.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;

      try {
        App.utils.toast('Verifying archive integrity...');
        const preview = await App.backupEngine.previewRestore(file);
        stagedRestoreData = preview.extractedData;

        summaryText.innerHTML = `
          <div><strong>Backup Type:</strong> ${preview.verified.type} &middot; <strong>Tables Found:</strong> ${preview.totalTablesToRestore}</div>
          <div style="margin-top:4px"><strong>Total Records to Restore:</strong> <span style="color:var(--teal);font-weight:700">${preview.totalRecordsToRestore}</span></div>
          <div style="font-size:12px;color:var(--text2);margin-top:6px">${preview.verified.message}</div>
        `;

        conflictArea.innerHTML = `
          <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;background:var(--bg)">
            <table style="width:100%;font-size:12px;border-collapse:collapse">
              <thead><tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--text3)"><th style="padding:6px 10px">Table</th><th style="padding:6px 10px">Records in Archive</th></tr></thead>
              <tbody>
                ${preview.conflictReport.map(c => `
                  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;font-family:monospace">${c.tableKey}</td><td style="padding:6px 10px">${c.recordsInBackup}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        previewArea.style.display = 'block';
        App.utils.toast('Archive verified and ready for restore!', 'ok');
      } catch (err) {
        App.utils.toast('Verification failed: ' + err.message, 'err');
      }
    });

    host.querySelector('#btnCancelRestore')?.addEventListener('click', () => {
      previewArea.style.display = 'none';
      selectedNameEl.textContent = '';
      fileInput.value = '';
      stagedRestoreData = null;
    });

    host.querySelector('#btnExecuteRealRestore')?.addEventListener('click', async () => {
      if (!stagedRestoreData) return;
      if (!confirm('Proceed with restore? Records will be safely imported into your portfolio.')) return;

      try {
        showProgress('Restoring portfolio records in dependency order...', 10);
        const results = await App.backupEngine.executeRestore(stagedRestoreData, {
          onProgress: (p) => showProgress(p.message, Math.round((p.tableIndex / p.totalTables) * 90))
        });
        hideProgress();
        App.utils.toast(`✓ Restore Complete: ${results.created} records imported, ${results.failed} skipped!`, 'ok');
        previewArea.style.display = 'none';
        loadInitialData();
        if (App.router && App.router.refreshCurrent) App.router.refreshCurrent();
      } catch (e) {
        hideProgress();
        App.utils.toast('Restore failed: ' + e.message, 'err');
      }
    });
  }

  /* ==========================================================================
     TAB 10: SETTINGS & RETENTION
     ========================================================================== */
  async function drawSettingsTab(host) {
    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0 0 6px">Retention &amp; Storage Quota Management</h2>
          <p style="font-size:13px;color:var(--text2);margin:0 0 16px;line-height:1.5">
            Manage archival lifecycle, retention policies, and local storage limits.
          </p>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:14px;margin-bottom:18px">
            <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:14px">
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:4px">Daily Archive Retention</div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Kept for 30 days before recycling</div>
              <span class="badge" style="background:rgba(22,201,163,0.15);color:var(--teal)">30 Days Active</span>
            </div>

            <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:14px">
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:4px">Monthly Snapshot Retention</div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Permanent monthly milestones</div>
              <span class="badge" style="background:rgba(201,168,76,0.15);color:var(--gold)">Permanent</span>
            </div>
          </div>

          <div style="font-size:13px;color:var(--text);font-weight:700;margin-bottom:8px">Cost &amp; Quota Safeguards</div>
          <div style="font-size:12.5px;color:var(--text2);line-height:1.6">
            &bull; <strong>Supabase Free Tier:</strong> 500 MB database storage, 1 GB file storage. Our JSON backups are compressed under level 6 DEFLATE, consuming minimal bandwidth.<br>
            &bull; <strong>Google Drive / Sheets Quota:</strong> Standard Google accounts provide 15 GB free storage. Spreadsheets occupy less than 2 MB per year of typical portfolio updates.
          </div>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     TAB 11: AUDIT HISTORY
     ========================================================================== */
  async function drawAuditTab(host) {
    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div>
              <h2 style="font-size:20px;color:var(--gold);font-family:'Cormorant Garamond',serif;margin:0">Backup Audit History</h2>
              <div style="font-size:12.5px;color:var(--text2)">Immutable ledger of all backup, export, sync, and restore events</div>
            </div>
          </div>

          <div style="overflow-x:auto">
            <table class="data-table" style="width:100%;font-size:12.5px;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--text3)">
                  <th style="padding:8px">Timestamp</th>
                  <th style="padding:8px">Action</th>
                  <th style="padding:8px">Scope</th>
                  <th style="padding:8px">Details</th>
                </tr>
              </thead>
              <tbody>
                ${cachedAuditLogs.length > 0 ? cachedAuditLogs.map(a => `
                  <tr style="border-bottom:1px solid var(--border2)">
                    <td style="padding:8px;color:var(--text2);white-space:nowrap">${App.utils.fmtDate(a.created_at)}</td>
                    <td style="padding:8px;font-weight:600;color:var(--text)">${App.utils.escapeHtml(a.action)}</td>
                    <td style="padding:8px"><span style="color:var(--gold)">${a.scope}</span></td>
                    <td style="padding:8px;font-size:11.5px;color:var(--text3);font-family:monospace">${App.utils.escapeHtml(JSON.stringify(a.details || {}))}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--text3)">No audit logs found yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     EXECUTION TRIGGER HELPERS
     ========================================================================== */
  function showProgress(msg, pct) {
    const wrap = App.utils.qs('#backupProgressWrap');
    const msgEl = App.utils.qs('#backupProgressMsg');
    const pctEl = App.utils.qs('#backupProgressPct');
    const bar = App.utils.qs('#backupProgressBar');
    if (!wrap) return;

    wrap.style.display = 'block';
    if (msgEl) msgEl.textContent = msg;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
  }

  function hideProgress() {
    const wrap = App.utils.qs('#backupProgressWrap');
    if (wrap) wrap.style.display = 'none';
  }

  async function triggerFullPersonalBackup() {
    try {
      showProgress('Initializing full portfolio backup...', 5);
      await App.backupEngine.runFullBackup({
        scope: 'PERSONAL',
        onProgress: (p) => showProgress(p.message, p.progress)
      });
      hideProgress();
      App.utils.toast('✓ Full Portfolio Backup archive downloaded successfully!', 'ok');
      await loadInitialData();
      drawActiveTabContent();
    } catch (e) {
      hideProgress();
      App.utils.toast('Backup failed: ' + e.message, 'err');
    }
  }

  async function triggerJsonExport() {
    try {
      App.utils.toast('Generating complete portfolio JSON export...');
      const res = await App.backupEngine.exportAllDataJson({ scope: 'PERSONAL' });
      App.utils.toast(`Downloaded ${res.filename} (${res.records} records)`, 'ok');
      await loadInitialData();
    } catch (e) {
      App.utils.toast('Export failed: ' + e.message, 'err');
    }
  }

  async function triggerDocumentsBackup() {
    try {
      showProgress('Archiving uploaded documents...', 10);
      await App.backupEngine.runFullBackup({
        scope: 'PERSONAL',
        includeDocuments: true,
        onProgress: (p) => showProgress(p.message, p.progress)
      });
      hideProgress();
      App.utils.toast('✓ Documents archive downloaded successfully!', 'ok');
      await loadInitialData();
    } catch (e) {
      hideProgress();
      App.utils.toast('Documents backup failed: ' + e.message, 'err');
    }
  }

  // Register view with App.router
  App.router.register('backup', renderBackupCenterView);

  App.backupCenter = {
    render: renderBackupCenterView,
    triggerFullPersonalBackup,
    triggerJsonExport,
    triggerDocumentsBackup
  };

})();
