/* Documents (spec Section 29) - Cloud Storage-backed file & vault management. */
window.App = window.App || {};

(function () {
  const DOC_TYPES = [
    'Investment Agreement',
    'Payment Receipt',
    'Lender Statement',
    'Bank Statement',
    'Maturity Statement',
    'Tax Certificate',
    'Screenshot',
    'Support Ticket Attachment',
    'Other'
  ];

  let currentViewMode = 'grid'; // 'grid' | 'table'
  let currentFilterType = 'All';
  let currentFilterDeal = 'All';
  let currentSearchQuery = '';
  let currentSortBy = 'date-desc';

  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + (sizes[i] || 'MB');
  }

  function getFileIcon(mime, filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return '🖼️';
    if (mime === 'application/pdf' || ext === 'pdf') return '📄';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
    if (['doc', 'docx', 'txt'].includes(ext)) return '📝';
    if (['zip', 'tar', 'gz', 'rar'].includes(ext)) return '📦';
    return '📁';
  }

  function isPreviewSupported(mime, filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return true;
    if (mime === 'application/pdf' || ext === 'pdf') return true;
    return false;
  }

  // ---- Safe browser download handler ----
  async function triggerDownload(storagePath, originalFileName) {
    try {
      App.utils.toast('Preparing download...', 'info');
      const downloadUrl = await App.api.getDocumentDownloadUrl(storagePath, originalFileName);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = originalFileName || 'document';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 200);
      App.utils.toast('Download started', 'ok');
    } catch (err) {
      console.error('Download failed:', err);
      App.utils.toast('Download failed: ' + (err.message || err), 'err');
    }
  }

  // ---- In-App Secure Preview Modal ----
  async function openPreviewModal(doc, dealName) {
    App.utils.toast('Loading preview...', 'info');
    try {
      const previewUrl = await App.api.getDocumentPreviewUrl(doc.storage_path);
      const isImg = (doc.mime_type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.file_name);
      const isPdf = doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.file_name);

      let contentHtml = '';
      if (isImg) {
        contentHtml = `
          <div style="text-align:center;max-height:65vh;overflow:auto;background:var(--bg3);border-radius:10px;padding:12px">
            <img src="${previewUrl}" alt="${App.utils.escapeHtml(doc.file_name)}" style="max-width:100%;max-height:60vh;object-fit:contain;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.3)">
          </div>`;
      } else if (isPdf) {
        contentHtml = `
          <div style="height:65vh;width:100%;border-radius:10px;overflow:hidden;background:var(--bg3)">
            <iframe src="${previewUrl}#toolbar=1" style="width:100%;height:100%;border:none" title="${App.utils.escapeHtml(doc.file_name)}"></iframe>
          </div>`;
      } else {
        contentHtml = `
          <div style="text-align:center;padding:48px 24px;background:var(--bg3);border-radius:10px">
            <div style="font-size:48px;margin-bottom:12px">${getFileIcon(doc.mime_type, doc.file_name)}</div>
            <div style="font-size:16px;font-weight:600;margin-bottom:6px">${App.utils.escapeHtml(doc.file_name)}</div>
            <div style="color:var(--text2);font-size:13px;margin-bottom:18px">Browser preview is not available for this file type (${doc.mime_type || 'binary'}).</div>
            <button class="btn btn-gold btn-sm" id="btnPreviewDownloadDirect">⬇ Download to View</button>
          </div>`;
      }

      const metaDetails = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-top:14px;padding:12px;background:var(--card2);border-radius:8px;font-size:12px">
          <div><span style="color:var(--text3)">Type:</span> <b style="color:var(--text)">${App.utils.escapeHtml(doc.document_type || 'Other')}</b></div>
          <div><span style="color:var(--text3)">Size:</span> <b style="color:var(--text)">${formatBytes(doc.file_size_bytes)}</b></div>
          <div><span style="color:var(--text3)">Date:</span> <b style="color:var(--text)">${App.utils.fmtDate(doc.document_date || doc.created_at)}</b></div>
          <div><span style="color:var(--text3)">Deal:</span> <b style="color:var(--text)">${App.utils.escapeHtml(dealName || 'General')}</b></div>
          ${doc.document_reference ? `<div><span style="color:var(--text3)">Ref:</span> <b style="color:var(--text)">${App.utils.escapeHtml(doc.document_reference)}</b></div>` : ''}
        </div>
        ${doc.notes ? `<div style="margin-top:8px;font-size:12px;color:var(--text2);background:var(--card2);padding:10px;border-radius:8px"><b>Notes:</b> ${App.utils.escapeHtml(doc.notes)}</div>` : ''}
      `;

      App.ui.open({
        title: `Preview: ${App.utils.escapeHtml(doc.file_name)}`,
        bodyHtml: contentHtml + metaDetails,
        actions: [
          { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
          {
            label: '⬇ Download File',
            className: 'btn-gold',
            onClick: () => {
              triggerDownload(doc.storage_path, doc.file_name);
            }
          }
        ]
      });

      const btnDirect = document.querySelector('#btnPreviewDownloadDirect');
      if (btnDirect) {
        btnDirect.addEventListener('click', () => {
          triggerDownload(doc.storage_path, doc.file_name);
        });
      }
    } catch (err) {
      console.error('Preview failed:', err);
      App.utils.toast('Preview unavailable: ' + (err.message || err), 'err');
    }
  }

  // ---- Edit Document Metadata Modal ----
  async function openEditModal(doc, deals, onSaved) {
    const dealOptions = [{ value: '', label: '(general, not deal-specific)' }].concat(
      deals.map((d) => ({ value: String(d.id), label: d.deal_name }))
    );

    const fields = [
      { key: 'file_name', label: 'File Name', required: true, value: doc.file_name },
      { key: 'deal_id', label: 'Linked Deal', type: 'select', options: dealOptions, value: doc.deal_id ? String(doc.deal_id) : '' },
      { key: 'document_type', label: 'Document Type', required: true, type: 'select', options: DOC_TYPES, value: doc.document_type || 'Other' },
      { key: 'document_date', label: 'Document Date', type: 'date', value: doc.document_date ? doc.document_date.substring(0, 10) : '' },
      { key: 'document_reference', label: 'Reference / Invoice #', value: doc.document_reference || '' },
      { key: 'notes', label: 'Notes / Description', type: 'textarea', span: 2, value: doc.notes || doc.description || '' },
    ];

    App.ui.open({
      title: 'Edit Document Details',
      bodyHtml: App.ui.renderForm(fields),
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Save Changes',
          className: 'btn-gold',
          onClick: async () => {
            const { values, errors } = App.ui.readForm(fields);
            if (errors.length) {
              App.utils.toast('Please check required fields', 'err');
              return;
            }
            try {
              const patch = {
                file_name: values.file_name.trim() || doc.file_name,
                deal_id: values.deal_id ? Number(values.deal_id) : null,
                document_type: values.document_type,
                document_date: values.document_date || null,
                document_reference: values.document_reference?.trim() || null,
                notes: values.notes?.trim() || null
              };
              await App.api.updateDocument(doc.id, patch);
              App.utils.toast('Document metadata updated', 'ok');
              App.ui.close();
              if (onSaved) onSaved();
            } catch (err) {
              App.utils.toast('Update failed: ' + (err.message || err), 'err');
            }
          }
        }
      ]
    });
  }

  // ---- Multi-File Upload Queue Modal ----
  function openMultiUploadModal(deals, onUploadComplete) {
    let queuedFiles = [];

    const dealOptionsHtml = `<option value="">(general, not deal-specific)</option>` +
      deals.map((d) => `<option value="${d.id}">${App.utils.escapeHtml(d.deal_name)}</option>`).join('');

    const typeOptionsHtml = DOC_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');

    const modalBody = `
      <div id="docUploadModalContainer" style="display:flex;flex-direction:column;gap:16px">
        <!-- Drag & Drop Dropzone -->
        <div id="modalDropzone" style="border:2px dashed var(--gold);border-radius:12px;padding:24px 16px;text-align:center;background:var(--fill-1);cursor:pointer;transition:all .2s ease">
          <div style="font-size:32px;margin-bottom:6px">☁️</div>
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">Drag & Drop Documents Here</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Supports PDF, Images (PNG, JPG), Statements, Spreadsheets (up to 50 MB each)</div>
          <button type="button" class="btn btn-outline btn-sm" id="btnModalBrowse">Browse Files</button>
          <input type="file" id="modalFileInput" multiple style="display:none">
        </div>

        <!-- Global Batch Settings (Defaults applied to new files) -->
        <div style="background:var(--card2);padding:12px;border-radius:10px;border:1px solid var(--border2);display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Batch Deal Link</label>
            <select class="input" id="batchDealSelect" style="width:100%;font-size:12px;padding:6px 10px">${dealOptionsHtml}</select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Batch Document Type</label>
            <select class="input" id="batchTypeSelect" style="width:100%;font-size:12px;padding:6px 10px">${typeOptionsHtml}</select>
          </div>
        </div>

        <!-- File Queue List -->
        <div id="modalQueueContainer" style="max-height:40vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
          <div id="modalQueueEmpty" style="text-align:center;color:var(--text3);font-size:13px;padding:20px 0">No files selected yet.</div>
        </div>
      </div>
    `;

    App.ui.open({
      title: 'Upload Documents to Vault',
      bodyHtml: modalBody,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        { label: 'Upload All', className: 'btn-gold', id: 'btnModalUploadSubmit', onClick: startQueueUpload }
      ]
    });

    const dropzone = document.querySelector('#modalDropzone');
    const fileInput = document.querySelector('#modalFileInput');
    const browseBtn = document.querySelector('#btnModalBrowse');
    const queueList = document.querySelector('#modalQueueContainer');
    const batchDealSelect = document.querySelector('#batchDealSelect');
    const batchTypeSelect = document.querySelector('#batchTypeSelect');

    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = 'var(--fill-3)';
        dropzone.style.borderColor = 'var(--gold2)';
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.background = 'var(--fill-1)';
        dropzone.style.borderColor = 'var(--gold)';
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt ? dt.files : null;
      if (files && files.length) {
        addFilesToQueue(Array.from(files));
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        addFilesToQueue(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });

    function addFilesToQueue(files) {
      const MAX_SIZE = 52428800; // 50MB
      const defaultDeal = batchDealSelect.value;
      const defaultType = batchTypeSelect.value;

      files.forEach((f) => {
        if (f.size > MAX_SIZE) {
          App.utils.toast(`File "${f.name}" is over 50MB limit and was skipped.`, 'err');
          return;
        }

        const queueItem = {
          id: 'q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          file: f,
          name: f.name,
          size: f.size,
          dealId: defaultDeal,
          documentType: defaultType,
          status: 'queued', // queued | uploading | completed | failed
          errorMsg: null
        };
        queuedFiles.push(queueItem);
      });

      renderQueue();
    }

    function renderQueue() {
      if (!queuedFiles.length) {
        queueList.innerHTML = `<div id="modalQueueEmpty" style="text-align:center;color:var(--text3);font-size:13px;padding:20px 0">No files selected yet.</div>`;
        return;
      }

      queueList.innerHTML = queuedFiles.map((item, idx) => {
        const isCompleted = item.status === 'completed';
        const isFailed = item.status === 'failed';
        const isUploading = item.status === 'uploading';

        return `
          <div class="card" style="padding:10px 12px;background:var(--card);border:1px solid ${isFailed ? 'var(--red)' : isCompleted ? 'var(--teal)' : 'var(--border2)'};display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="display:flex;align-items:center;gap:8px;overflow:hidden">
                <span style="font-size:18px">${getFileIcon(item.file.type, item.name)}</span>
                <div style="overflow:hidden">
                  <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${App.utils.escapeHtml(item.name)}">${App.utils.escapeHtml(item.name)}</div>
                  <div style="font-size:11px;color:var(--text3)">${formatBytes(item.size)}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <span class="badge" style="font-size:10px;text-transform:uppercase;background:${isCompleted ? 'rgba(22,201,163,0.15)' : isFailed ? 'rgba(255,107,107,0.15)' : isUploading ? 'rgba(76,155,232,0.15)' : 'var(--fill-2)'};color:${isCompleted ? 'var(--teal)' : isFailed ? 'var(--red)' : isUploading ? 'var(--blue)' : 'var(--text2)'}">
                  ${item.status}
                </span>
                ${!isUploading && !isCompleted ? `
                  <button type="button" class="icon-btn del btnRemoveQueue" data-id="${item.id}" style="width:24px;height:24px;font-size:12px" title="Remove">&#10005;</button>
                ` : ''}
              </div>
            </div>

            <!-- Per-file metadata inputs (only when queued or failed) -->
            ${!isCompleted && !isUploading ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
                <select class="input queueDealSelect" data-id="${item.id}" style="font-size:11px;padding:4px 6px">
                  <option value="">(general, not deal-specific)</option>
                  ${deals.map((d) => `<option value="${d.id}" ${String(d.id) === String(item.dealId) ? 'selected' : ''}>${App.utils.escapeHtml(d.deal_name)}</option>`).join('')}
                </select>
                <select class="input queueTypeSelect" data-id="${item.id}" style="font-size:11px;padding:4px 6px">
                  ${DOC_TYPES.map((t) => `<option value="${t}" ${t === item.documentType ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
            ` : ''}

            ${isFailed ? `<div style="font-size:11px;color:var(--red);margin-top:2px">${App.utils.escapeHtml(item.errorMsg || 'Upload failed')}</div>` : ''}
          </div>
        `;
      }).join('');

      // Wire remove buttons
      queueList.querySelectorAll('.btnRemoveQueue').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          queuedFiles = queuedFiles.filter((q) => q.id !== id);
          renderQueue();
        });
      });

      // Wire select updates
      queueList.querySelectorAll('.queueDealSelect').forEach((sel) => {
        sel.addEventListener('change', () => {
          const item = queuedFiles.find((q) => q.id === sel.dataset.id);
          if (item) item.dealId = sel.value;
        });
      });

      queueList.querySelectorAll('.queueTypeSelect').forEach((sel) => {
        sel.addEventListener('change', () => {
          const item = queuedFiles.find((q) => q.id === sel.dataset.id);
          if (item) item.documentType = sel.value;
        });
      });
    }

    async function startQueueUpload() {
      const pendingItems = queuedFiles.filter((q) => q.status === 'queued' || q.status === 'failed');
      if (!pendingItems.length) {
        App.utils.toast('No pending files to upload.', 'info');
        return;
      }

      const uploadBtn = document.querySelector('#btnModalUploadSubmit');
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerText = 'Uploading...';
      }

      let successCount = 0;
      let failCount = 0;

      for (const item of pendingItems) {
        item.status = 'uploading';
        item.errorMsg = null;
        renderQueue();

        try {
          await App.api.uploadDocument(item.file, {
            dealId: item.dealId ? Number(item.dealId) : null,
            documentType: item.documentType,
            documentDate: new Date().toISOString().substring(0, 10),
            notes: ''
          });
          item.status = 'completed';
          successCount++;
        } catch (err) {
          console.error('Upload error for', item.name, err);
          item.status = 'failed';
          item.errorMsg = err.message || 'Upload failed';
          failCount++;
        }
        renderQueue();
      }

      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerText = 'Upload All';
      }

      if (successCount > 0 && failCount === 0) {
        App.utils.toast(`Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}!`, 'ok');
        App.ui.close();
        if (onUploadComplete) onUploadComplete();
      } else if (successCount > 0 && failCount > 0) {
        App.utils.toast(`Uploaded ${successCount} file(s), but ${failCount} failed. You can retry.`, 'warn');
        if (onUploadComplete) onUploadComplete();
      } else {
        App.utils.toast('Uploads failed. Please check error messages and try again.', 'err');
      }
    }
  }

  // ---- Main Documents View Renderer ----
  async function renderDocumentsView() {
    const pane = App.utils.qs('#pane-documents');
    if (!pane) return;

    pane.innerHTML = `
      <div class="section-title">
        Documents &amp; Vault
        <div class="line"></div>
        <small>cloud-secured agreements, receipts, bank statements &amp; records</small>
      </div>

      <!-- Quick Stats Ribbon -->
      <div class="kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px" id="docStatsRibbon">
        <div class="kpi">
          <div class="label">Total Documents</div>
          <div class="val" id="statDocTotalCount">—</div>
          <div class="sub">Stored in Cloud Vault</div>
        </div>
        <div class="kpi">
          <div class="label">Cloud Storage Used</div>
          <div class="val" id="statDocTotalStorage">—</div>
          <div class="sub">Encrypted Storage</div>
        </div>
        <div class="kpi">
          <div class="label">Agreements &amp; Contracts</div>
          <div class="val" id="statDocAgreements">—</div>
          <div class="sub">Legal &amp; Term Sheets</div>
        </div>
        <div class="kpi">
          <div class="label">Receipts &amp; Statements</div>
          <div class="val" id="statDocReceipts">—</div>
          <div class="sub">Payment Confirmations</div>
        </div>
      </div>

      <!-- Main Documents Panel -->
      <div class="panel">
        <!-- Control Header & Filters -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <!-- Left: Search & Filter Controls -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:1;min-width:280px">
            <input type="text" class="search-input" id="docSearchInput" placeholder="🔍 Search documents, references, notes..." style="max-width:260px;min-width:180px">
            <select class="search-input" id="docTypeFilter" style="max-width:180px">
              <option value="All">All Types</option>
              ${DOC_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <select class="search-input" id="docDealFilter" style="max-width:180px">
              <option value="All">All Deals</option>
              <option value="General">(General / Non-deal)</option>
            </select>
            <select class="search-input" id="docSortFilter" style="max-width:170px">
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="name-asc">Name (A – Z)</option>
              <option value="name-desc">Name (Z – A)</option>
              <option value="size-desc">Size (Largest)</option>
              <option value="size-asc">Size (Smallest)</option>
            </select>
          </div>

          <!-- Right: Actions & View Switcher -->
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <div style="display:flex;background:var(--bg3);border-radius:8px;padding:2px;border:1px solid var(--border2)">
              <button class="btn btn-sm ${currentViewMode === 'grid' ? 'btn-gold' : 'btn-ghost'}" id="btnViewGrid" title="Grid View" style="padding:4px 10px;font-size:13px">▦ Grid</button>
              <button class="btn btn-sm ${currentViewMode === 'table' ? 'btn-gold' : 'btn-ghost'}" id="btnViewTable" title="Table View" style="padding:4px 10px;font-size:13px">☰ List</button>
            </div>
            <button class="btn btn-outline btn-sm" id="btnScanDocDocuments">🤖 AI Scanner</button>
            <button class="btn btn-gold btn-sm" id="uploadDocBtn">+ Upload Documents</button>
          </div>
        </div>

        <!-- Inline Quick Drag & Drop Banner -->
        <div id="inlineDropzone" style="border:2px dashed var(--border);border-radius:12px;padding:16px;text-align:center;background:var(--fill-1);margin-bottom:16px;cursor:pointer;transition:all .2s ease">
          <span style="font-size:18px;margin-right:6px">☁️</span>
          <span style="font-size:13px;font-weight:600;color:var(--text)">Drag &amp; drop files here to quickly upload</span>
          <span style="font-size:12px;color:var(--text2);margin-left:6px">(or click to open the multi-file uploader)</span>
        </div>

        <!-- Document Content Container -->
        <div id="docsContentArea">
          <div style="text-align:center;padding:40px;color:var(--text3)">Loading documents from cloud vault...</div>
        </div>
      </div>
    `;

    // Fetch deals and populate deal filter
    let deals = [];
    try {
      deals = await App.api.listDeals();
    } catch (_) {
      deals = [];
    }

    const dealsById = {};
    const dealFilterSel = App.utils.qs('#docDealFilter', pane);
    deals.forEach((d) => {
      dealsById[d.id] = d;
      const opt = document.createElement('option');
      opt.value = String(d.id);
      opt.textContent = d.deal_name;
      dealFilterSel.appendChild(opt);
    });

    // Wire main buttons
    App.utils.qs('#uploadDocBtn', pane).addEventListener('click', () => openMultiUploadModal(deals, draw));
    App.utils.qs('#inlineDropzone', pane).addEventListener('click', () => openMultiUploadModal(deals, draw));

    App.utils.qs('#btnScanDocDocuments', pane)?.addEventListener('click', () => {
      if (App.docScanner && App.docScanner.openScannerModal) {
        App.docScanner.openScannerModal(async () => {
          App.utils.toast('Agreement analyzed & saved to vault.', 'ok');
          draw();
        });
      }
    });

    // Wire view toggles
    App.utils.qs('#btnViewGrid', pane).addEventListener('click', () => {
      if (currentViewMode !== 'grid') {
        currentViewMode = 'grid';
        App.utils.qs('#btnViewGrid', pane).className = 'btn btn-sm btn-gold';
        App.utils.qs('#btnViewTable', pane).className = 'btn btn-sm btn-ghost';
        draw();
      }
    });

    App.utils.qs('#btnViewTable', pane).addEventListener('click', () => {
      if (currentViewMode !== 'table') {
        currentViewMode = 'table';
        App.utils.qs('#btnViewTable', pane).className = 'btn btn-sm btn-gold';
        App.utils.qs('#btnViewGrid', pane).className = 'btn btn-sm btn-ghost';
        draw();
      }
    });

    // Wire filters & search
    App.utils.qs('#docSearchInput', pane).addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim().toLowerCase();
      draw();
    });

    App.utils.qs('#docTypeFilter', pane).addEventListener('change', (e) => {
      currentFilterType = e.target.value;
      draw();
    });

    App.utils.qs('#docDealFilter', pane).addEventListener('change', (e) => {
      currentFilterDeal = e.target.value;
      draw();
    });

    App.utils.qs('#docSortFilter', pane).addEventListener('change', (e) => {
      currentSortBy = e.target.value;
      draw();
    });

    // Inline dragover handling
    const inlineDropzone = App.utils.qs('#inlineDropzone', pane);
    ['dragenter', 'dragover'].forEach((eventName) => {
      inlineDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        inlineDropzone.style.borderColor = 'var(--gold2)';
        inlineDropzone.style.background = 'var(--fill-3)';
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      inlineDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        inlineDropzone.style.borderColor = 'var(--border)';
        inlineDropzone.style.background = 'var(--fill-1)';
      });
    });

    inlineDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        openMultiUploadModal(deals, draw);
      }
    });

    // Main Draw Function
    async function draw() {
      const contentArea = App.utils.qs('#docsContentArea', pane);
      let allDocs = [];

      try {
        allDocs = await App.api.listDocuments();
      } catch (err) {
        contentArea.innerHTML = `
          <div style="text-align:center;padding:36px;color:var(--red)">
            <div style="font-size:24px;margin-bottom:8px">⚠️</div>
            <div style="font-weight:600;margin-bottom:4px">Could not load documents</div>
            <div style="font-size:13px;color:var(--text2)">${App.utils.escapeHtml(err.message || err)}</div>
            <button class="btn btn-outline btn-sm" id="btnRetryLoadDocs" style="margin-top:12px">Retry</button>
          </div>`;
        App.utils.qs('#btnRetryLoadDocs', pane)?.addEventListener('click', draw);
        return;
      }

      // Update Ribbon Stats
      const totalBytes = allDocs.reduce((acc, d) => acc + (Number(d.file_size_bytes) || 0), 0);
      const agreementsCount = allDocs.filter((d) => (d.document_type || '').includes('Agreement')).length;
      const receiptsCount = allDocs.filter((d) => (d.document_type || '').includes('Receipt') || (d.document_type || '').includes('Statement')).length;

      App.utils.qs('#statDocTotalCount', pane).textContent = allDocs.length;
      App.utils.qs('#statDocTotalStorage', pane).textContent = formatBytes(totalBytes);
      App.utils.qs('#statDocAgreements', pane).textContent = agreementsCount;
      App.utils.qs('#statDocReceipts', pane).textContent = receiptsCount;

      // Filter docs
      let filtered = allDocs.filter((d) => {
        if (currentFilterType !== 'All' && d.document_type !== currentFilterType) return false;
        if (currentFilterDeal === 'General' && d.deal_id) return false;
        if (currentFilterDeal !== 'All' && currentFilterDeal !== 'General' && String(d.deal_id) !== String(currentFilterDeal)) return false;
        if (currentSearchQuery) {
          const hay = `${d.file_name} ${d.document_type} ${d.document_reference || ''} ${d.notes || ''} ${d.description || ''} ${(dealsById[d.deal_id] || {}).deal_name || ''}`.toLowerCase();
          if (!hay.includes(currentSearchQuery)) return false;
        }
        return true;
      });

      // Sort docs
      filtered.sort((a, b) => {
        if (currentSortBy === 'date-desc') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        if (currentSortBy === 'date-asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        if (currentSortBy === 'name-asc') return (a.file_name || '').localeCompare(b.file_name || '');
        if (currentSortBy === 'name-desc') return (b.file_name || '').localeCompare(a.file_name || '');
        if (currentSortBy === 'size-desc') return (Number(b.file_size_bytes) || 0) - (Number(a.file_size_bytes) || 0);
        if (currentSortBy === 'size-asc') return (Number(a.file_size_bytes) || 0) - (Number(b.file_size_bytes) || 0);
        return 0;
      });

      if (!filtered.length) {
        contentArea.innerHTML = `
          <div style="text-align:center;padding:48px 16px;color:var(--text3)">
            <div style="font-size:36px;margin-bottom:8px">📭</div>
            <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px">No documents found</div>
            <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
              ${allDocs.length ? 'No documents match your active search or filter criteria.' : 'Your cloud document vault is empty. Upload your first agreement or statement!'}
            </div>
            <button class="btn btn-gold btn-sm" id="btnEmptyUpload">+ Upload Document</button>
          </div>`;
        App.utils.qs('#btnEmptyUpload', contentArea)?.addEventListener('click', () => openMultiUploadModal(deals, draw));
        return;
      }

      // Render View Mode (Grid vs Table)
      if (currentViewMode === 'grid') {
        contentArea.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:14px">
            ${filtered.map((d) => {
              const deal = dealsById[d.deal_id];
              const dealName = deal ? deal.deal_name : 'General';
              const canPreview = isPreviewSupported(d.mime_type, d.file_name);
              const isImg = (d.mime_type || '').startsWith('image/');

              return `
                <div class="card doc-card" data-id="${d.id}" style="padding:14px;background:var(--card);border:1px solid var(--border2);border-radius:12px;display:flex;flex-direction:column;justify-content:space-between;transition:transform .15s ease, border-color .15s ease;position:relative">
                  <div>
                    <!-- Top Bar: Icon + Type Badge -->
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                      <div style="width:40px;height:40px;border-radius:10px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:20px;border:1px solid var(--border2)">
                        ${getFileIcon(d.mime_type, d.file_name)}
                      </div>
                      <span class="badge" style="font-size:10px;background:rgba(201,168,76,0.12);color:var(--gold);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${App.utils.escapeHtml(d.document_type || 'Other')}
                      </span>
                    </div>

                    <!-- File Name & Deal -->
                    <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;word-break:break-word;line-height:1.3" title="${App.utils.escapeHtml(d.file_name)}">
                      ${App.utils.escapeHtml(d.file_name)}
                    </div>
                    <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
                      ${deal ? `💼 <span style="color:var(--gold)">${App.utils.escapeHtml(dealName)}</span>` : '📁 General'}
                    </div>

                    <!-- Details Row -->
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);padding-top:8px;border-top:1px solid var(--border2)">
                      <span>${formatBytes(d.file_size_bytes)}</span>
                      <span>${App.utils.fmtDate(d.document_date || d.created_at)}</span>
                    </div>

                    ${d.document_reference ? `
                      <div style="font-size:11px;color:var(--text3);margin-top:4px">
                        Ref: <b style="color:var(--text2)">${App.utils.escapeHtml(d.document_reference)}</b>
                      </div>
                    ` : ''}
                  </div>

                  <!-- Action Buttons -->
                  <div style="display:flex;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border2)">
                    <button class="btn btn-outline btn-sm btnDocPreview" data-id="${d.id}" style="flex:1;padding:4px 8px;font-size:12px" title="Preview">
                      👁 Preview
                    </button>
                    <button class="btn btn-gold btn-sm btnDocDownload" data-id="${d.id}" data-path="${App.utils.escapeHtml(d.storage_path)}" data-name="${App.utils.escapeHtml(d.file_name)}" style="flex:1;padding:4px 8px;font-size:12px" title="Download">
                      ⬇ Download
                    </button>
                    <button class="icon-btn btnDocEdit" data-id="${d.id}" style="width:28px;height:28px;font-size:13px" title="Edit Metadata">
                      ✏️
                    </button>
                    <button class="icon-btn del btnDocDelete" data-id="${d.id}" data-path="${App.utils.escapeHtml(d.storage_path)}" style="width:28px;height:28px;font-size:13px" title="Delete">
                      🗑️
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else {
        // Table / List View
        contentArea.innerHTML = `
          <div class="table-scroll">
            <table class="data" id="docsTable">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Deal</th>
                  <th>Date</th>
                  <th>Size</th>
                  <th>Reference</th>
                  <th style="text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map((d) => {
                  const deal = dealsById[d.deal_id];
                  return `
                    <tr>
                      <td style="font-weight:500;display:flex;align-items:center;gap:8px">
                        <span style="font-size:16px">${getFileIcon(d.mime_type, d.file_name)}</span>
                        <span style="word-break:break-all">${App.utils.escapeHtml(d.file_name)}</span>
                      </td>
                      <td>
                        <span class="badge" style="font-size:11px;background:rgba(201,168,76,0.12);color:var(--gold)">
                          ${App.utils.escapeHtml(d.document_type || 'Other')}
                        </span>
                      </td>
                      <td>${App.utils.escapeHtml(deal ? deal.deal_name : '—')}</td>
                      <td>${App.utils.fmtDate(d.document_date || d.created_at)}</td>
                      <td style="color:var(--text3)">${formatBytes(d.file_size_bytes)}</td>
                      <td>${App.utils.escapeHtml(d.document_reference || '—')}</td>
                      <td class="row-actions" style="text-align:right">
                        <button class="icon-btn btnDocPreview" data-id="${d.id}" title="Preview">👁</button>
                        <button class="icon-btn btnDocDownload" data-id="${d.id}" data-path="${App.utils.escapeHtml(d.storage_path)}" data-name="${App.utils.escapeHtml(d.file_name)}" title="Download">⬇</button>
                        <button class="icon-btn btnDocEdit" data-id="${d.id}" title="Edit Metadata">✏️</button>
                        <button class="icon-btn del btnDocDelete" data-id="${d.id}" data-path="${App.utils.escapeHtml(d.storage_path)}" title="Delete">🗑️</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      // Attach Event Handlers to all Action Buttons
      contentArea.querySelectorAll('.btnDocPreview').forEach((btn) => {
        btn.addEventListener('click', () => {
          const doc = allDocs.find((d) => String(d.id) === String(btn.dataset.id));
          if (doc) {
            const dealName = doc.deal_id && dealsById[doc.deal_id] ? dealsById[doc.deal_id].deal_name : 'General';
            openPreviewModal(doc, dealName);
          }
        });
      });

      contentArea.querySelectorAll('.btnDocDownload').forEach((btn) => {
        btn.addEventListener('click', () => {
          triggerDownload(btn.dataset.path, btn.dataset.name);
        });
      });

      contentArea.querySelectorAll('.btnDocEdit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const doc = allDocs.find((d) => String(d.id) === String(btn.dataset.id));
          if (doc) {
            openEditModal(doc, deals, draw);
          }
        });
      });

      contentArea.querySelectorAll('.btnDocDelete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const docId = Number(btn.dataset.id);
          const storagePath = btn.dataset.path;
          if (!confirm('Are you sure you want to permanently delete this document? The file will be removed from secure cloud storage.')) {
            return;
          }
          try {
            App.utils.toast('Deleting document...', 'info');
            await App.api.deleteDocument(docId, storagePath);
            App.utils.toast('Document deleted successfully', 'ok');
            draw();
          } catch (err) {
            console.error('Delete failed:', err);
            App.utils.toast('Could not delete: ' + (err.message || err), 'err');
          }
        });
      });
    }

    await draw();
  }

  App.router.register('documents', renderDocumentsView);
})();
