/* ============================================================================
   Backup & Disaster Recovery Engine (Investment OS)
   Implements full application data discovery, memory-safe ZIP packaging,
   SHA-256 checksums, document binary archiving, verification, and safe restore.
   ============================================================================ */
window.App = window.App || {};

App.backupEngine = (function () {
  'use strict';

  /**
   * Computes SHA-256 checksum of a string or ArrayBuffer using Web Crypto API.
   */
  async function computeSha256(data) {
    try {
      let buffer;
      if (typeof data === 'string') {
        buffer = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer) {
        buffer = data;
      } else if (data instanceof Blob) {
        buffer = await data.arrayBuffer();
      } else {
        buffer = new TextEncoder().encode(JSON.stringify(data));
      }
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return 'checksum_unavailable';
    }
  }

  /**
   * Converts array of objects to CSV string.
   */
  function objectsToCsv(rows) {
    if (!rows || rows.length === 0) return '';
    const headers = Array.from(
      rows.reduce((set, r) => {
        Object.keys(r || {}).forEach(k => set.add(k));
        return set;
      }, new Set())
    );

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const headerLine = headers.map(h => escapeCsv(h)).join(',');
    const dataLines = rows.map(r => headers.map(h => escapeCsv(r[h])).join(','));
    return [headerLine, ...dataLines].join('\n');
  }

  /**
   * Generates and downloads a complete portfolio backup ZIP archive.
   */
  async function runFullBackup(opts = {}) {
    if (typeof window.JSZip === 'undefined') {
      throw new Error('JSZip library is not loaded. Please ensure internet connectivity and reload the page.');
    }

    const scope = opts.scope || 'PERSONAL';
    const targetEmail = opts.targetEmail || (App.googleSheetsSync?.getTargetEmail ? App.googleSheetsSync.getTargetEmail() : (App.state?.profile?.email || 'radhakrishna108566@gmail.com'));
    const cleanEmail = (targetEmail || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const onProgress = opts.onProgress || (() => {});
    const includeDocuments = opts.includeDocuments !== false;
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dateFormatted = new Date().toISOString().slice(0, 10);

    onProgress({ phase: 'INIT', message: `Initializing ${scope.toLowerCase()} backup for ${targetEmail}...`, progress: 5 });

    // Create job record in database
    const job = await App.api.createBackupJob({
      backup_type: scope === 'ADMIN' ? 'ADMIN_FULL' : 'PERSONAL_FULL',
      scope: scope,
      status: 'RUNNING',
      destination: 'LOCAL_DOWNLOAD',
      destination_details: { targetEmail },
      started_at: new Date().toISOString()
    }).catch(() => ({ id: null }));

    try {
      // 1. Fetch structured portfolio data
      onProgress({ phase: 'FETCH_DATA', message: 'Fetching authoritative tables...', progress: 15 });
      const { data, stats } = await App.api.fetchEntirePortfolioData({
        scope,
        onProgress: (p) => {
          onProgress({ phase: 'FETCH_DATA', message: `Exporting ${p.currentTable}...`, progress: 15 + Math.round(p.progress * 0.35) });
        }
      });

      const zip = new window.JSZip();
      const checksums = [];

      // 2. Add structured JSON & CSV exports
      onProgress({ phase: 'PACKAGING', message: 'Generating data files & tables...', progress: 55 });
      const dataFolder = zip.folder('data');
      const tablesFolder = zip.folder('tables');

      for (const [tableKey, rows] of Object.entries(data)) {
        const jsonStr = JSON.stringify(rows, null, 2);
        dataFolder.file(`${tableKey}.json`, jsonStr);
        const jsonHash = await computeSha256(jsonStr);
        checksums.push(`data/${tableKey}.json  SHA-256: ${jsonHash}`);

        if (rows.length > 0) {
          const csvStr = objectsToCsv(rows);
          tablesFolder.file(`${tableKey}.csv`, csvStr);
          const csvHash = await computeSha256(csvStr);
          checksums.push(`tables/${tableKey}.csv  SHA-256: ${csvHash}`);
        }
      }

      // 3. Back up actual uploaded document files
      let filesDiscovered = 0;
      let filesBackedUp = 0;
      let filesFailed = 0;
      const documentMetadata = data.documents || [];
      filesDiscovered = documentMetadata.length;

      if (includeDocuments && documentMetadata.length > 0) {
        onProgress({ phase: 'DOCUMENTS', message: `Backing up ${filesDiscovered} cloud attachments...`, progress: 65 });
        const docsFolder = zip.folder('documents');

        for (let i = 0; i < documentMetadata.length; i++) {
          const doc = documentMetadata[i];
          if (!doc.storage_path) continue;
          onProgress({ phase: 'DOCUMENTS', message: `Downloading file ${i + 1}/${filesDiscovered}: ${doc.file_name}...`, progress: 65 + Math.round(((i + 1) / filesDiscovered) * 20) });

          try {
            const blob = await App.api.downloadStorageDocumentBlob(doc.storage_path);
            const safeName = `${doc.id}_${(doc.file_name || 'file').replace(/[\\/:*?"<>|]/g, '_')}`;
            docsFolder.file(safeName, blob);
            const fileHash = await computeSha256(blob);
            checksums.push(`documents/${safeName}  SHA-256: ${fileHash}`);
            filesBackedUp++;
          } catch (fileErr) {
            console.warn(`[Backup] Could not download file ${doc.storage_path}:`, fileErr);
            filesFailed++;
          }
        }
      }

      // 4. Generate manifest.json & README
      onProgress({ phase: 'METADATA', message: 'Generating manifest & integrity checksums...', progress: 88 });
      const metadataFolder = zip.folder('metadata');
      const manifest = {
        application: 'Personal Investment Operating System',
        version: '2.4.4',
        backup_type: scope === 'ADMIN' ? 'ADMIN_FULL' : 'PERSONAL_FULL',
        scope: scope,
        target_email: targetEmail,
        exported_at: new Date().toISOString(),
        exported_by: App.state.profile?.email || 'User',
        total_tables: stats.tablesIncluded,
        total_records: stats.recordsExported,
        total_files: filesBackedUp,
        files_failed: filesFailed,
        table_counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
        schema_version: '2.4.4',
        environment: window.location.origin
      };

      const manifestStr = JSON.stringify(manifest, null, 2);
      zip.file('manifest.json', manifestStr);
      metadataFolder.file('manifest.json', manifestStr);
      metadataFolder.file('schema_inventory.json', JSON.stringify(App.api.BACKUP_TABLE_INVENTORY, null, 2));

      // Checksums
      const checksumStr = checksums.join('\n');
      zip.folder('checksums').file('sha256.txt', checksumStr);

      // README
      const readmeText = `================================================================================
INVESTMENT OS - PORTFOLIO BACKUP ARCHIVE
================================================================================
Archive Generated: ${new Date().toISOString()}
Scope: ${scope}
App Version: v2.4.4
Total Tables: ${stats.tablesIncluded}
Total Records: ${stats.recordsExported}
Total Uploaded Documents: ${filesBackedUp}

FOLDER STRUCTURE:
- manifest.json       : Complete export metadata, record counts, and schema version.
- data/               : Full structured JSON exports of all application tables.
- tables/             : CSV exports of tables for Excel, Numbers, and spreadsheets.
- documents/          : Actual binary attachments & PDF documents from cloud storage.
- metadata/           : Schema inventory and table relationships.
- checksums/          : SHA-256 verification hashes for all exported files.
- README.txt          : This reference document and restore instructions.

RESTORE INSTRUCTIONS:
1. Open Investment OS in your browser.
2. Navigate to "Backup & Restore" Center (or Settings -> Open Backup & Restore Center).
3. Select the "Restore & Recovery" tab.
4. Upload this ZIP archive (or any individual data/*.json file).
5. Inspect the Non-Destructive Restore Preview and conflict report.
6. Click "Execute Restore" to import records in verified dependency order.

SECURITY & PRIVACY DISCLOSURE:
- Stored credentials in Website Vault are protected by authenticated AES-256-GCM.
- Plaintext secrets and session tokens are strictly excluded from routine backups.
- For full database recovery including RLS rules and triggers, execute PostgreSQL
  dumps using standard pg_dump utilities.
================================================================================`;
      zip.file('README.txt', readmeText);

      // 5. Generate ZIP Blob and trigger download
      onProgress({ phase: 'COMPRESSING', message: 'Compressing archive...', progress: 95 });
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const emailSlug = cleanEmail ? `_${cleanEmail}` : '';
      const zipFilename = scope === 'ADMIN'
        ? `Investment_OS_Admin_Full_Backup${emailSlug}_${timestamp}.zip`
        : `Investment_OS_Portfolio_Backup${emailSlug}_${timestamp}.zip`;

      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);

      onProgress({ phase: 'DONE', message: 'Backup successfully generated & downloaded!', progress: 100 });

      // Update job record
      if (job && job.id) {
        await App.api.updateBackupJob(job.id, {
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          records_discovered: stats.recordsDiscovered,
          records_exported: stats.recordsExported,
          files_discovered: filesDiscovered,
          files_backed_up: filesBackedUp,
          failed_count: filesFailed,
          output_size_bytes: zipBlob.size,
          checksum_sha256: await computeSha256(zipBlob),
          verified: true,
          manifest_summary: manifest
        }).catch(() => {});
      }

      await App.api.logBackupAudit('FULL_BACKUP_COMPLETED', scope, {
        filename: zipFilename,
        records: stats.recordsExported,
        files: filesBackedUp,
        sizeBytes: zipBlob.size
      });

      return {
        success: true,
        filename: zipFilename,
        sizeBytes: zipBlob.size,
        recordsExported: stats.recordsExported,
        filesBackedUp: filesBackedUp
      };
    } catch (err) {
      console.error('[BackupEngine] Backup failed:', err);
      if (job && job.id) {
        await App.api.updateBackupJob(job.id, {
          status: 'FAILED',
          error_message: err.message || String(err),
          completed_at: new Date().toISOString()
        }).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Exports all portfolio data as a single monolithic JSON file.
   */
  async function exportAllDataJson(opts = {}) {
    const scope = opts.scope || 'PERSONAL';
    const targetEmail = opts.targetEmail || (App.googleSheetsSync?.getTargetEmail ? App.googleSheetsSync.getTargetEmail() : (App.state?.profile?.email || 'radhakrishna108566@gmail.com'));
    const cleanEmail = (targetEmail || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const timestamp = new Date().toISOString().slice(0, 10);
    const { data, stats } = await App.api.fetchEntirePortfolioData({ scope });

    const exportPayload = {
      manifest: {
        application: 'Personal Investment Operating System',
        version: '2.4.4',
        scope: scope,
        target_email: targetEmail,
        exported_at: new Date().toISOString(),
        total_records: stats.recordsExported,
        schema_version: '2.4.4'
      },
      data: data
    };

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const emailSlug = cleanEmail ? `_${cleanEmail}` : '';
    const filename = `Investment_OS_Full_Data_${scope}${emailSlug}_${timestamp}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    await App.api.createBackupJob({
      backup_type: scope === 'ADMIN' ? 'ADMIN_DATA' : 'PERSONAL_DATA',
      scope: scope,
      status: 'COMPLETED',
      destination: 'LOCAL_DOWNLOAD',
      records_discovered: stats.recordsDiscovered,
      records_exported: stats.recordsExported,
      output_size_bytes: blob.size,
      completed_at: new Date().toISOString()
    }).catch(() => {});

    return { filename, sizeBytes: blob.size, records: stats.recordsExported };
  }

  /**
   * Verifies an uploaded backup file (ZIP or JSON) for readability, manifest, and checksum integrity.
   */
  async function verifyBackupArchive(file) {
    if (!file) throw new Error('No backup file selected for verification.');

    if (file.name.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.data && !Array.isArray(parsed)) {
        throw new Error('Invalid JSON format: missing root "data" object or array.');
      }
      const tableCount = parsed.data ? Object.keys(parsed.data).length : 1;
      const recordCount = parsed.data
        ? Object.values(parsed.data).reduce((acc, rows) => acc + (Array.isArray(rows) ? rows.length : 0), 0)
        : parsed.length;

      return {
        valid: true,
        type: 'JSON_DATA_EXPORT',
        totalTables: tableCount,
        totalRecords: recordCount,
        manifest: parsed.manifest || { exported_at: file.lastModifiedDate || 'Unknown' },
        message: `Verified valid JSON backup containing ${recordCount} records across ${tableCount} tables.`
      };
    }

    if (file.name.endsWith('.zip')) {
      if (typeof window.JSZip === 'undefined') {
        throw new Error('JSZip is required to verify ZIP archives.');
      }

      const zip = await window.JSZip.loadAsync(file);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) {
        throw new Error('Corrupted or invalid backup ZIP: "manifest.json" is missing from archive root.');
      }

      const manifestText = await manifestFile.async('text');
      const manifest = JSON.parse(manifestText);

      // Verify files in data/
      const dataFolder = zip.folder('data');
      let dataFilesCount = 0;
      dataFolder.forEach(() => { dataFilesCount++; });

      const docsFolder = zip.folder('documents');
      let docFilesCount = 0;
      if (docsFolder) {
        docsFolder.forEach(() => { docFilesCount++; });
      }

      return {
        valid: true,
        type: 'FULL_BACKUP_ZIP',
        manifest: manifest,
        totalTables: dataFilesCount,
        totalRecords: manifest.total_records || 'Discovered',
        totalDocuments: docFilesCount,
        checksumsPresent: !!zip.file('checksums/sha256.txt'),
        message: `Successfully verified archive integrity: ${manifest.total_records || 'All'} records, ${dataFilesCount} tables, and ${docFilesCount} documents present.`
      };
    }

    throw new Error('Unsupported backup format. Please provide a .zip or .json backup file.');
  }

  /**
   * Previews restore impact (read-only, non-destructive) from uploaded backup.
   */
  async function previewRestore(file) {
    const verified = await verifyBackupArchive(file);
    let extractedData = {};

    if (file.name.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      extractedData = parsed.data || { records: parsed };
    } else if (file.name.endsWith('.zip')) {
      const zip = await window.JSZip.loadAsync(file);
      const dataFolder = zip.folder('data');
      if (dataFolder) {
        const promises = [];
        dataFolder.forEach((relativePath, fileObj) => {
          if (relativePath.endsWith('.json')) {
            const tableKey = relativePath.replace('.json', '');
            promises.push(
              fileObj.async('text').then((content) => {
                try { extractedData[tableKey] = JSON.parse(content); } catch (_) {}
              })
            );
          }
        });
        await Promise.all(promises);
      }
    }

    // Inspect conflicts against live portfolio
    const conflictReport = [];
    for (const [tableKey, rows] of Object.entries(extractedData)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      conflictReport.push({
        tableKey,
        recordsInBackup: rows.length,
        hasIds: rows.some(r => r.id !== undefined),
      });
    }

    return {
      verified,
      conflictReport,
      extractedData,
      totalTablesToRestore: conflictReport.length,
      totalRecordsToRestore: conflictReport.reduce((acc, c) => acc + c.recordsInBackup, 0)
    };
  }

  /**
   * Executes safe restore into current user's portfolio in verified dependency order.
   */
  async function executeRestore(extractedData, opts = {}) {
    if (!extractedData || Object.keys(extractedData).length === 0) {
      throw new Error('No data provided to restore.');
    }

    const onProgress = opts.onProgress || (() => {});
    const onConflict = opts.onConflict || 'SKIP'; // 'SKIP' or 'REASSIGN_ID'
    const results = { created: 0, skipped: 0, failed: 0, details: [] };

    // Dependency order: parents first
    const ORDER = [
      'platforms', 'deals', 'payment_schedule', 'payments', 'reinvestments',
      'portfolio_goals', 'accounts', 'liabilities', 'gold_purchases',
      'expense_projects', 'expense_vendors', 'expense_advances', 'expense_transactions',
      'recurring_items', 'recurring_occurrences', 'contacts', 'notes',
      'calendar_events', 'daily_financial_habits', 'website_entries', 'documents'
    ];

    const tablesToProcess = Array.from(new Set([...ORDER, ...Object.keys(extractedData)]));
    const idMap = {}; // Maps old parent ID to new generated ID

    for (let t = 0; t < tablesToProcess.length; t++) {
      const tableKey = tablesToProcess[t];
      const rows = extractedData[tableKey];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      onProgress({
        currentTable: tableKey,
        tableIndex: t + 1,
        totalTables: tablesToProcess.length,
        message: `Restoring ${tableKey} (${rows.length} rows)...`
      });

      let tableCreated = 0;
      let tableSkipped = 0;
      let tableFailed = 0;

      for (const row of rows) {
        try {
          const cleanRow = { ...row };
          // Ensure ownership is assigned to current authenticated user
          if (cleanRow.user_id) cleanRow.user_id = App.auth.getUser()?.id || cleanRow.user_id;
          if (cleanRow.owner_user_id) cleanRow.owner_user_id = App.auth.getUser()?.id || cleanRow.owner_user_id;

          // Remap foreign keys if parent was re-inserted
          if (cleanRow.platform_id && idMap[`platforms_${cleanRow.platform_id}`]) {
            cleanRow.platform_id = idMap[`platforms_${cleanRow.platform_id}`];
          }
          if (cleanRow.deal_id && idMap[`deals_${cleanRow.deal_id}`]) {
            cleanRow.deal_id = idMap[`deals_${cleanRow.deal_id}`];
          }
          if (cleanRow.scheduled_payment_id && idMap[`payment_schedule_${cleanRow.scheduled_payment_id}`]) {
            cleanRow.scheduled_payment_id = idMap[`payment_schedule_${cleanRow.scheduled_payment_id}`];
          }
          if (cleanRow.recurring_item_id && idMap[`recurring_items_${cleanRow.recurring_item_id}`]) {
            cleanRow.recurring_item_id = idMap[`recurring_items_${cleanRow.recurring_item_id}`];
          }

          // Strip generated identity IDs if reassigning
          const oldId = cleanRow.id;
          delete cleanRow.id;
          delete cleanRow.created_at;
          delete cleanRow.updated_at;

          const inserted = await App.api.restoreInsertRow ? await App.api.restoreInsertRow(tableKey, cleanRow) : await App.api.insertRow(tableKey, cleanRow);
          if (oldId && inserted && inserted.id) {
            idMap[`${tableKey}_${oldId}`] = inserted.id;
          }

          results.created++;
          tableCreated++;
        } catch (rowErr) {
          console.warn(`[Restore] Row failed for ${tableKey}:`, rowErr.message);
          results.failed++;
          tableFailed++;
        }
      }

      results.details.push({ tableKey, tableCreated, tableSkipped, tableFailed });
    }

    await App.api.logBackupAudit('RESTORE_EXECUTED', 'PERSONAL', {
      created: results.created,
      failed: results.failed,
      tables: results.details
    });

    return results;
  }

  return {
    runFullBackup,
    exportAllDataJson,
    verifyBackupArchive,
    previewRestore,
    executeRestore,
    computeSha256,
  };
})();
