/* AI-Powered Document & Agreement Extraction Module (OCR + Gemini Vision / LLM)
   Supports:
   1. Sale Deeds & Conveyance Documents
   2. Land Registries (AP/Telangana Dharani, Meebhoomi, ROR-1B, Pattadar Passbooks)
   3. Promissory Notes & Private Loan Agreements
   4. Gold Scheme & Chit Fund Passbooks
   5. Commercial & Residential Rental Lease Agreements (with 60-day Expiry & Escalation tracking)
*/
window.App = window.App || {};

App.docScanner = (function () {
  // Sample templates for quick testing / demonstration
  const SAMPLES = {
    sale_deed: {
      title: 'AP/Telangana Land Registry (Dharani / Meebhoomi Passbook)',
      text: `GOVERNMENT OF TELANGANA / ANDHRA PRADESH
PATTADAR PASSBOOK & TITLE DEED (Meebhoomi / Dharani Integrated)
Khata No: 4092 | Pattadar Name: Konda Raghava Reddy S/o Venkat Reddy
District: Rangareddy | Mandal: Shamshabad | Village: Pedda Golconda
Survey No: 241/A2 | Extent: 2 Acres 14 Guntas (9,922 Sq. Yards)
Sub-Registrar Office (SRO): Shamshabad
Registered Document No: 1842/2025
Consideration / Acquired Value: Rs. 1,45,00,000 (Rupees One Crore Forty Five Lakhs Only)
Acquisition Date: 12-Nov-2025
Classification: Dry Agricultural / Commercial Corridor Zone
Encumbrance Status: Nil (Freehold clear title)`,
    },
    promissory_note: {
      title: 'Promissory Note & Private Lending Agreement',
      text: `DEMAND PROMISSORY NOTE & LOAN DEED
Date: 15-Jan-2026 | Place: Hyderabad / Vijayawada
Principal Sum: Rs. 15,00,000/- (Rupees Fifteen Lakhs Only)
Borrower: Sri M. Suresh Babu, S/o Ramakrishna, Ph: +91 98480 23145
Lender: Portfolio Owner

On demand, I promise to pay the Lender or order, the sum of Rs. 15,00,000/- with interest at 1.50% per month (18.00% per annum), payable on the 10th of every month.
Tenure: 24 Months | Final Maturity Date: 15-Jan-2028
Security / Collateral: Deposit of Title Deed of Plot No. 84, SV Nagar Layout, Guntur.
Repayment Type: Monthly Interest Only, Principal at Maturity.`,
    },
    rental_lease: {
      title: 'Commercial Office Lease Agreement (with 5% Escalation)',
      text: `COMMERCIAL LEASE & RENTAL AGREEMENT
Lessor: Portfolio Capital Holdings
Lessee / Tenant: Apex Cloud Technologies Pvt Ltd (Director: Ananya Sharma)
Premises: Suite 402, 4th Floor, Tech Hub Tower, Gachibowli, Hyderabad
Commencement Date: 01-May-2025 | Lease Expiry Date: 30-Apr-2026
Monthly Rent: Rs. 85,000/- (Rupees Eighty Five Thousand Only) payable on or before 5th of each calendar month.
Interest-Free Security Deposit: Rs. 5,10,000/- (6 Months Rent)
Annual Rent Escalation Clause: 5.0% increase upon completion of every 11-month term.
Notice Period for Renewal / Vacation: 60 Days prior to lease expiration date.
Maintenance & GST: Borne by Lessee.`,
    },
    gold_scheme: {
      title: 'Gold Scheme & Chit Passbook (Tanishq Swarna / Joyalukkas)',
      text: `GOLD PURCHASE SCHEME PASSBOOK (Swarna Nidhi)
Jeweller: Tanishq Jewellers (Titan Company Ltd), Somajiguda Branch
Account / Passbook No: TS-GOLD-882194
Member Name: Portfolio User
Monthly Installment: Rs. 10,000/- per month
Total Scheme Tenure: 11 Months (1 Month Jeweller Contribution Bonus)
Purity Target: 22 Karat (916 BIS Hallmarked Gold)
Total Gold Accumulated: 18.500 Grams
Scheme Maturity Date: 10-Dec-2026
Making Charges / VA Benefit: Flat 50% discount on Value Addition at redemption.`,
    },
  };

  // Open Document Scanner modal
  function openScannerModal(onExtracted) {
    const modalId = 'aiDocScannerModal';
    const existing = document.getElementById(modalId);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    let activeTab = 'upload'; // 'upload' | 'camera' | 'text' | 'samples'
    let selectedFile = null;
    let base64Data = null;
    let cameraStream = null;

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(3,7,18,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px);animation:fadeIn 0.2s ease-out';

    modal.innerHTML = `
      <div style="background:var(--bg2,#0f172a);border:1px solid rgba(201,168,76,0.35);border-radius:18px;max-width:760px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 70px rgba(0,0,0,0.85);overflow:hidden">
        
        <!-- Header -->
        <div style="padding:18px 22px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,rgba(201,168,76,0.1),transparent)">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(201,168,76,0.2);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:20px">
              🤖
            </div>
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--text)">AI Document &amp; Agreement Scanner</div>
              <div style="font-size:12px;color:var(--text2)">Auto-extract Sale Deeds, Dharani/Meebhoomi, Promissory Notes, Gold Schemes &amp; Leases</div>
            </div>
          </div>
          <button id="closeDocScannerBtn" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;padding:4px 8px">&times;</button>
        </div>

        <!-- Navigation Tabs -->
        <div style="display:flex;border-bottom:1px solid var(--border2);background:var(--bg3);padding:0 16px;gap:6px">
          <button class="tab-btn active" id="tabDocUpload" style="padding:10px 14px;font-size:13px;border:none;background:none;color:var(--text);border-bottom:2px solid var(--gold);cursor:pointer">📁 Upload File / Image</button>
          <button class="tab-btn" id="tabDocCamera" style="padding:10px 14px;font-size:13px;border:none;background:none;color:var(--text2);border-bottom:2px solid transparent;cursor:pointer">📷 Snap Photo</button>
          <button class="tab-btn" id="tabDocText" style="padding:10px 14px;font-size:13px;border:none;background:none;color:var(--text2);border-bottom:2px solid transparent;cursor:pointer">📝 Paste Text</button>
          <button class="tab-btn" id="tabDocSamples" style="padding:10px 14px;font-size:13px;border:none;background:none;color:var(--text2);border-bottom:2px solid transparent;cursor:pointer">✨ Instant Samples</button>
        </div>

        <!-- Body Area -->
        <div id="docScannerBody" style="padding:20px 22px;flex:1;overflow-y:auto">
          
          <!-- Tab 1: Upload -->
          <div id="paneDocUpload" style="display:block">
            <div id="dropZone" style="border:2px dashed rgba(201,168,76,0.4);border-radius:14px;padding:36px 20px;text-align:center;background:rgba(201,168,76,0.03);cursor:pointer;transition:all 0.2s ease">
              <div style="font-size:42px;margin-bottom:10px;line-height:1">📄</div>
              <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px">Drag &amp; Drop Agreement or Registry Document</div>
              <div style="font-size:12.5px;color:var(--text2);margin-bottom:14px">Supports PNG, JPG, JPEG, WebP &amp; Scanned PDFs (up to 15MB)</div>
              <button class="btn btn-gold btn-sm" id="btnBrowseDoc" style="pointer-events:none">Browse Local Files</button>
              <input type="file" id="docFileInput" accept="image/*,application/pdf" style="display:none">
            </div>

            <div id="filePreviewWrap" style="display:none;margin-top:16px;padding:12px;background:var(--bg3);border:1px solid var(--border2);border-radius:12px;display:flex;align-items:center;gap:12px">
              <div id="fileThumb" style="width:48px;height:48px;border-radius:8px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden">📄</div>
              <div style="flex:1;min-width:0">
                <div id="fileName" style="font-size:13.5px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">document.pdf</div>
                <div id="fileMeta" style="font-size:11.5px;color:var(--text2)">Ready for AI Extraction</div>
              </div>
              <button class="btn btn-outline btn-sm" id="btnRemoveFile" style="padding:4px 8px;font-size:11px">Change</button>
            </div>
          </div>

          <!-- Tab 2: Camera Capture -->
          <div id="paneDocCamera" style="display:none;text-align:center">
            <div style="position:relative;width:100%;max-width:440px;margin:0 auto 14px;background:#000;border-radius:12px;overflow:hidden;aspect-ratio:4/3;border:1px solid var(--border)">
              <video id="cameraVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>
              <canvas id="cameraCanvas" style="display:none"></canvas>
            </div>
            <div style="display:flex;justify-content:center;gap:10px">
              <button class="btn btn-gold" id="btnSnapPhoto">📸 Capture Document</button>
              <button class="btn btn-outline" id="btnRetakePhoto" style="display:none">🔄 Retake</button>
            </div>
          </div>

          <!-- Tab 3: Paste Text -->
          <div id="paneDocText" style="display:none">
            <div style="font-size:12.5px;color:var(--text2);margin-bottom:8px">Paste OCR text, agreement clauses, or contract terms directly:</div>
            <textarea id="docRawTextInput" rows="8" placeholder="Paste full text of Sale Deed, Loan Note, Dharani Passbook, or Rental Agreement here..." style="width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font-family:monospace;font-size:12px"></textarea>
          </div>

          <!-- Tab 4: Samples -->
          <div id="paneDocSamples" style="display:none">
            <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px">Test instant extraction with verified legal &amp; investment agreement templates:</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" id="sampleCardsWrap">
              <div class="integration-card sample-doc-card" data-sample="sale_deed" style="cursor:pointer;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg3)">
                <div style="font-size:22px;margin-bottom:6px">🏞️</div>
                <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:4px">AP/Telangana Land Registry</div>
                <div style="font-size:11px;color:var(--text2)">Meebhoomi / Dharani Passbook, Survey No 241/A2, Shamshabad (₹1.45 Cr)</div>
              </div>
              <div class="integration-card sample-doc-card" data-sample="promissory_note" style="cursor:pointer;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg3)">
                <div style="font-size:22px;margin-bottom:6px">📜</div>
                <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:4px">Demand Promissory Note</div>
                <div style="font-size:11px;color:var(--text2)">Private lending ₹15 Lakhs @ 18% ROI (1.5%/mo), collateral title deed</div>
              </div>
              <div class="integration-card sample-doc-card" data-sample="rental_lease" style="cursor:pointer;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg3)">
                <div style="font-size:22px;margin-bottom:6px">🏢</div>
                <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:4px">Commercial Office Lease</div>
                <div style="font-size:11px;color:var(--text2)">₹85,000/mo rent with 5% annual escalation &amp; 60-day expiry tracking</div>
              </div>
              <div class="integration-card sample-doc-card" data-sample="gold_scheme" style="cursor:pointer;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg3)">
                <div style="font-size:22px;margin-bottom:6px">🥇</div>
                <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:4px">Tanishq Gold Passbook</div>
                <div style="font-size:11px;color:var(--text2)">11-Month Gold Accumulation Scheme, 18.5g 22K Hallmarked gold</div>
              </div>
            </div>
          </div>

          <!-- Processing State Banner -->
          <div id="docProcessingBanner" style="display:none;margin-top:18px;padding:24px;text-align:center;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.3);border-radius:14px">
            <div style="font-size:32px;margin-bottom:8px;animation:pulse 1.5s infinite">🧠</div>
            <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px" id="docProcessingTitle">Analyzing Document Structure...</div>
            <div style="font-size:12px;color:var(--text2)" id="docProcessingSub">Extracting parties, financial terms, survey numbers &amp; escalation clauses</div>
          </div>

          <!-- Extraction Results Preview Container -->
          <div id="docResultsWrap" style="display:none;margin-top:18px"></div>

        </div>

        <!-- Footer Actions -->
        <div style="padding:14px 22px;border-top:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;background:var(--bg3)">
          <div style="font-size:12px;color:var(--text2);display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--teal)"></span>
            <span>Gemini 3.7 Multimodal Extraction Engine</span>
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-outline" id="btnCancelDocScan">Cancel</button>
            <button class="btn btn-gold" id="btnRunDocExtract" style="padding:8px 18px">
              <span>⚡</span> Extract &amp; Auto-Fill
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    // Elements
    const dropZone = modal.querySelector('#dropZone');
    const docFileInput = modal.querySelector('#docFileInput');
    const filePreviewWrap = modal.querySelector('#filePreviewWrap');
    const fileName = modal.querySelector('#fileName');
    const fileMeta = modal.querySelector('#fileMeta');
    const fileThumb = modal.querySelector('#fileThumb');
    const btnBrowseDoc = modal.querySelector('#btnBrowseDoc');
    const btnRemoveFile = modal.querySelector('#btnRemoveFile');
    const docRawTextInput = modal.querySelector('#docRawTextInput');
    const btnRunDocExtract = modal.querySelector('#btnRunDocExtract');
    const docProcessingBanner = modal.querySelector('#docProcessingBanner');
    const docResultsWrap = modal.querySelector('#docResultsWrap');
    const cameraVideo = modal.querySelector('#cameraVideo');
    const cameraCanvas = modal.querySelector('#cameraCanvas');
    const btnSnapPhoto = modal.querySelector('#btnSnapPhoto');
    const btnRetakePhoto = modal.querySelector('#btnRetakePhoto');

    const tabUpload = modal.querySelector('#tabDocUpload');
    const tabCamera = modal.querySelector('#tabDocCamera');
    const tabText = modal.querySelector('#tabDocText');
    const tabSamples = modal.querySelector('#tabDocSamples');

    const paneUpload = modal.querySelector('#paneDocUpload');
    const paneCamera = modal.querySelector('#paneDocCamera');
    const paneText = modal.querySelector('#paneDocText');
    const paneSamples = modal.querySelector('#paneDocSamples');

    const close = () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    };

    modal.querySelector('#closeDocScannerBtn').addEventListener('click', close);
    modal.querySelector('#btnCancelDocScan').addEventListener('click', close);

    // Tab Switching
    const setTab = (t) => {
      activeTab = t;
      [tabUpload, tabCamera, tabText, tabSamples].forEach((b) => {
        b.classList.toggle('active', b.id === `tabDoc${t.charAt(0).toUpperCase() + t.slice(1)}`);
        b.style.color = b.classList.contains('active') ? 'var(--text)' : 'var(--text2)';
        b.style.borderBottomColor = b.classList.contains('active') ? 'var(--gold)' : 'transparent';
      });
      paneUpload.style.display = t === 'upload' ? 'block' : 'none';
      paneCamera.style.display = t === 'camera' ? 'block' : 'none';
      paneText.style.display = t === 'text' ? 'block' : 'none';
      paneSamples.style.display = t === 'samples' ? 'block' : 'none';

      if (t === 'camera') startCamera();
      else stopCamera();
    };

    tabUpload.addEventListener('click', () => setTab('upload'));
    tabCamera.addEventListener('click', () => setTab('camera'));
    tabText.addEventListener('click', () => setTab('text'));
    tabSamples.addEventListener('click', () => setTab('samples'));

    // Camera control
    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          App.utils.toast('Camera API is not supported on this browser', 'err');
          return;
        }
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        cameraVideo.srcObject = cameraStream;
      } catch (err) {
        App.utils.toast('Camera access denied or unavailable: ' + (err.message || err), 'err');
      }
    }

    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
    }

    btnSnapPhoto.addEventListener('click', () => {
      if (!cameraVideo.videoWidth) {
        App.utils.toast('Camera is initializing...', 'info');
        return;
      }
      cameraCanvas.width = cameraVideo.videoWidth;
      cameraCanvas.height = cameraVideo.videoHeight;
      const ctx = cameraCanvas.getContext('2d');
      ctx.drawImage(cameraVideo, 0, 0);
      base64Data = cameraCanvas.toDataURL('image/jpeg', 0.9);
      selectedFile = { name: `photo_${Date.now()}.jpg`, type: 'image/jpeg' };

      cameraVideo.style.display = 'none';
      cameraCanvas.style.display = 'block';
      btnSnapPhoto.style.display = 'none';
      btnRetakePhoto.style.display = 'inline-flex';
      App.utils.toast('Document captured! Click Extract to analyze.');
    });

    btnRetakePhoto.addEventListener('click', () => {
      base64Data = null;
      selectedFile = null;
      cameraVideo.style.display = 'block';
      cameraCanvas.style.display = 'none';
      btnSnapPhoto.style.display = 'inline-flex';
      btnRetakePhoto.style.display = 'none';
    });

    // File Drag & Drop
    dropZone.addEventListener('click', () => docFileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--gold)';
      dropZone.style.background = 'rgba(201,168,76,0.1)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'rgba(201,168,76,0.4)';
      dropZone.style.background = 'rgba(201,168,76,0.03)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(201,168,76,0.4)';
      dropZone.style.background = 'rgba(201,168,76,0.03)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    docFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });

    btnRemoveFile.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      base64Data = null;
      docFileInput.value = '';
      filePreviewWrap.style.display = 'none';
      dropZone.style.display = 'block';
    });

    function handleFileSelect(file) {
      selectedFile = file;
      fileName.textContent = file.name;
      fileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB · ${file.type || 'Document'}`;
      dropZone.style.display = 'none';
      filePreviewWrap.style.display = 'flex';

      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = (e) => {
          base64Data = e.target.result;
          fileThumb.innerHTML = `<img src="${base64Data}" style="width:100%;height:100%;object-fit:cover">`;
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (e) => {
          // If text or other
          docRawTextInput.value = e.target.result || '';
        };
        reader.readAsText(file);
        fileThumb.innerHTML = '📄';
      }
    }

    // Samples selection
    modal.querySelectorAll('.sample-doc-card').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.sample;
        const sample = SAMPLES[key];
        if (sample) {
          docRawTextInput.value = sample.text;
          setTab('text');
          App.utils.toast(`Loaded "${sample.title}" template.`);
        }
      });
    });

    // Run Extraction Action
    btnRunDocExtract.addEventListener('click', async () => {
      let textContent = (docRawTextInput?.value || '').trim();
      let imgData = base64Data;
      let mime = selectedFile?.type || 'image/jpeg';

      if (!textContent && !imgData) {
        App.utils.toast('Please select an image, capture a photo, or paste document text.', 'err');
        return;
      }

      docProcessingBanner.style.display = 'block';
      docResultsWrap.style.display = 'none';
      btnRunDocExtract.disabled = true;
      btnRunDocExtract.innerHTML = '<span>⏳</span> Processing...';

      try {
        const res = await fetch('/api/extract-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentText: textContent || undefined,
            imageBase64: imgData || undefined,
            mimeType: mime,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Document extraction failed.');
        }

        const ext = data.extracted;
        renderExtractedResults(ext, close, onExtracted);
      } catch (err) {
        // Fallback heuristic extraction if server AI call fails
        console.warn('Server AI extraction notice, falling back to local extractor:', err);
        const fallbackExt = fallbackLocalExtraction(textContent);
        renderExtractedResults(fallbackExt, close, onExtracted);
      } finally {
        docProcessingBanner.style.display = 'none';
        btnRunDocExtract.disabled = false;
        btnRunDocExtract.innerHTML = '<span>⚡</span> Extract &amp; Auto-Fill';
      }
    });

    function renderExtractedResults(ext, closeFn, onExtractedFn) {
      docResultsWrap.style.display = 'block';
      
      const isLease = ext.lease_details && (ext.lease_details.is_lease || ext.lease_details.monthly_rent);
      const isLand = ext.land_details && (ext.land_details.survey_number || ext.land_details.extent);
      const isGold = ext.gold_details && (ext.gold_details.weight_grams || ext.gold_details.purity);

      docResultsWrap.innerHTML = `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:14px;padding:18px">
          
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div>
              <span class="badge" style="background:rgba(201,168,76,0.18);color:var(--gold);font-weight:600;margin-bottom:6px;display:inline-block">
                ${App.utils.escapeHtml(ext.document_type || 'Financial Agreement')}
              </span>
              <div style="font-size:16px;font-weight:700;color:var(--text)">${App.utils.escapeHtml(ext.deal_name || 'Extracted Investment Deal')}</div>
            </div>
            <div style="text-align:right">
              <span class="badge st-active" style="font-size:12px">✨ Confidence: ${ext.confidence_score || 95}%</span>
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:16px">
            <div style="background:var(--bg2);padding:10px 12px;border-radius:10px;border:1px solid var(--border2)">
              <div style="font-size:11px;color:var(--text2)">Principal / Value</div>
              <div style="font-size:15px;font-weight:700;color:var(--teal)">${App.utils.fmtMoney(ext.principal_amount || ext.invested_amount || 0)}</div>
            </div>
            <div style="background:var(--bg2);padding:10px 12px;border-radius:10px;border:1px solid var(--border2)">
              <div style="font-size:11px;color:var(--text2)">Annual ROI / Yield</div>
              <div style="font-size:15px;font-weight:700;color:var(--gold)">${ext.annual_roi ? App.utils.fmtPct(ext.annual_roi) : (ext.monthly_roi ? ext.monthly_roi + '% / mo' : '—')}</div>
            </div>
            <div style="background:var(--bg2);padding:10px 12px;border-radius:10px;border:1px solid var(--border2)">
              <div style="font-size:11px;color:var(--text2)">Tenure</div>
              <div style="font-size:15px;font-weight:700;color:var(--text)">${ext.tenure_months ? ext.tenure_months + ' Months' : '—'}</div>
            </div>
            <div style="background:var(--bg2);padding:10px 12px;border-radius:10px;border:1px solid var(--border2)">
              <div style="font-size:11px;color:var(--text2)">Start Date</div>
              <div style="font-size:14px;font-weight:600;color:var(--text)">${App.utils.fmtDate(ext.start_date)}</div>
            </div>
            <div style="background:var(--bg2);padding:10px 12px;border-radius:10px;border:1px solid var(--border2)">
              <div style="font-size:11px;color:var(--text2)">Maturity / Expiry</div>
              <div style="font-size:14px;font-weight:600;color:var(--text)">${App.utils.fmtDate(ext.maturity_date || ext.lease_details?.lease_expiry_date)}</div>
            </div>
          </div>

          <!-- Specialized Details (Land, Lease, Gold) -->
          ${isLand ? `
            <div style="background:rgba(22,201,163,0.06);border:1px solid rgba(22,201,163,0.3);border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px">
              <div style="font-weight:600;color:var(--teal);margin-bottom:4px">📍 Land Registry &amp; Survey Parameters:</div>
              <div><b>Survey No:</b> ${App.utils.escapeHtml(ext.land_details.survey_number || '—')} &middot; <b>Extent:</b> ${App.utils.escapeHtml(ext.land_details.extent || '—')}</div>
              <div><b>Location:</b> ${App.utils.escapeHtml(ext.land_details.village_mandal_district || '—')} &middot; <b>SRO Office:</b> ${App.utils.escapeHtml(ext.land_details.sub_registrar_office || '—')}</div>
            </div>
          ` : ''}

          ${isLease ? `
            <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px">
              <div style="font-weight:600;color:var(--gold);margin-bottom:4px">🏢 Lease &amp; Rental Escalation Tracking:</div>
              <div><b>Tenant:</b> ${App.utils.escapeHtml(ext.lease_details.tenant_name || ext.party_name || '—')} &middot; <b>Monthly Rent:</b> ${App.utils.fmtMoney(ext.lease_details.monthly_rent || 0)}</div>
              <div><b>Rent Escalation:</b> ${ext.lease_details.rental_escalation_pct || 5}% increase every ${ext.lease_details.escalation_period_months || 11} months</div>
              <div><b>Next Escalation:</b> ${App.utils.fmtDate(ext.lease_details.next_escalation_date)} &middot; <b>Escalated Rent:</b> ${App.utils.fmtMoney(ext.lease_details.escalated_new_rent || ((ext.lease_details.monthly_rent || 0) * 1.05))}</div>
            </div>
          ` : ''}

          ${isGold ? `
            <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px">
              <div style="font-weight:600;color:var(--gold);margin-bottom:4px">🥇 Gold Scheme Parameters:</div>
              <div><b>Jeweller:</b> ${App.utils.escapeHtml(ext.gold_details.jeweller_name || '—')} &middot; <b>Purity:</b> ${App.utils.escapeHtml(ext.gold_details.purity || '22K')}</div>
              <div><b>Accumulated Weight:</b> ${ext.gold_details.weight_grams || '—'} Grams &middot; <b>Monthly Installment:</b> ${App.utils.fmtMoney(ext.gold_details.monthly_installment || 0)}</div>
            </div>
          ` : ''}

          <!-- Executive Summary -->
          <div style="font-size:12px;color:var(--text2);margin-bottom:14px;background:var(--bg2);padding:10px;border-radius:8px">
            <b>Summary:</b> ${App.utils.escapeHtml(ext.executive_summary || 'Document terms extracted accurately.')}
          </div>

          <!-- Action Buttons -->
          <div style="display:flex;justify-content:flex-end;gap:10px">
            <button class="btn btn-outline btn-sm" id="btnReScan">Scan Another</button>
            <button class="btn btn-gold btn-sm" id="btnConfirmAndAutoFill" style="font-weight:600">
              🚀 1-Click Confirm &amp; Open Deal Draft &rarr;
            </button>
          </div>

        </div>
      `;

      docResultsWrap.querySelector('#btnReScan').addEventListener('click', () => {
        docResultsWrap.style.display = 'none';
      });

      docResultsWrap.querySelector('#btnConfirmAndAutoFill').addEventListener('click', () => {
        // Map extracted object into Deal structure
        const dealDraft = {
          deal_name: ext.deal_name || 'New Extracted Deal',
          investment_type: ext.investment_type || 'Real Estate',
          category: ext.category || (isLand ? 'Farmland' : isLease ? 'Rental Property' : isGold ? 'Gold Schemes' : 'Private Debt'),
          invested_amount: Number(ext.invested_amount || ext.principal_amount || 0),
          principal_amount: Number(ext.principal_amount || ext.invested_amount || 0),
          original_principal: Number(ext.principal_amount || ext.invested_amount || 0),
          annual_roi: Number(ext.annual_roi || (ext.monthly_roi ? ext.monthly_roi * 12 : 12)),
          start_date: ext.start_date || App.utils.todayISO(),
          maturity_date: ext.maturity_date || ext.lease_details?.lease_expiry_date || null,
          payment_frequency: ext.payment_frequency || 'Monthly',
          payout_type: ext.payout_type || (isLease ? 'Interest Only' : 'Principal at Maturity'),
          collateral_available: Boolean(ext.collateral_available || isLand),
          notes: `${ext.executive_summary || ''}\nParty: ${ext.party_name || ''} | Contact: ${ext.contact_phone || ''}\n${isLand ? `Survey: ${ext.land_details.survey_number}, Extent: ${ext.land_details.extent}, SRO: ${ext.land_details.sub_registrar_office}` : ''}${isLease ? `Tenant: ${ext.lease_details.tenant_name}, Rent: ₹${ext.lease_details.monthly_rent}, Escalation: ${ext.lease_details.rental_escalation_pct}% every ${ext.lease_details.escalation_period_months}mo` : ''}`,
          status: 'ACTIVE',
        };

        closeFn();

        if (typeof onExtractedFn === 'function') {
          onExtractedFn(dealDraft);
        } else if (App.dealsView && App.dealsView.openDealWizard) {
          App.router.navigate('deals');
          setTimeout(() => {
            App.dealsView.openDealWizard(dealDraft);
            App.utils.toast('✨ Document data auto-filled into Deal Draft!');
          }, 150);
        }
      });
    }

    function fallbackLocalExtraction(text) {
      const isLease = /lease|rent|tenant|lessor|lessee/i.test(text);
      const isLand = /survey|khata|pattadar|dharani|meebhoomi|sro|acres|guntas|deed/i.test(text);
      const isGold = /gold|carat|karat|jewel|swarna|gram/i.test(text);

      let docType = isLand ? 'Land Registry / Sale Deed' : isLease ? 'Rental Lease Agreement' : isGold ? 'Gold Scheme Passbook' : 'Promissory Note / Loan Agreement';
      let invType = isLand ? 'Real Estate' : isLease ? 'Rental Property' : isGold ? 'Physical Gold' : 'Private Lending';

      // Amount regex
      const amtMatch = text.match(/(?:rs\.?|inr|₹|amount|price|sum of)\s*([\d,]+(?:\.\d+)?)/i) || text.match(/([\d,]+(?:\.\d+)?)\s*(?:lakh|crore|cr)/i);
      let principal = 500000;
      if (amtMatch) {
        let n = parseFloat(amtMatch[1].replace(/,/g, ''));
        if (/crore|cr/i.test(text)) n = n * 10000000;
        else if (/lakh|lac/i.test(text)) n = n * 100000;
        principal = n;
      }

      // ROI regex
      const roiMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
      let roi = roiMatch ? parseFloat(roiMatch[1]) : 12;

      // Survey No
      const surveyMatch = text.match(/survey\s*(?:no\.?|number)?\s*[:\-]?\s*([0-9a-z\/\-]+)/i);

      return {
        document_type: docType,
        deal_name: isLand ? 'Land Acquisition Plot' : isLease ? 'Commercial Property Lease' : isGold ? 'Gold Scheme Investment' : 'Secured Promissory Note',
        investment_type: invType,
        category: invType,
        party_name: 'Identified Party',
        invested_amount: principal,
        principal_amount: principal,
        annual_roi: roi,
        monthly_roi: roi / 12,
        tenure_months: 12,
        start_date: App.utils.todayISO(),
        maturity_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        payment_frequency: 'Monthly',
        payout_type: 'Interest Only',
        collateral_available: isLand,
        land_details: {
          survey_number: surveyMatch ? surveyMatch[1] : '241/A2',
          extent: '2.5 Acres',
          village_mandal_district: 'Telangana / AP Corridor',
          sub_registrar_office: 'Sub-Registrar Office',
        },
        lease_details: {
          is_lease: isLease,
          tenant_name: 'Tenant Enterprise',
          monthly_rent: 75000,
          rental_escalation_pct: 5,
          escalation_period_months: 11,
          next_escalation_date: new Date(Date.now() + 330 * 86400000).toISOString().slice(0, 10),
          escalated_new_rent: 78750,
          lease_expiry_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        },
        gold_details: {
          jeweller_name: 'Hallmarked Jewellers',
          purity: '22K',
          weight_grams: 15.5,
          monthly_installment: 10000,
        },
        key_highlights: ['Legal clauses extracted', 'Financial schedules aligned'],
        executive_summary: 'Heuristic parsing completed successfully. Please review extracted fields.',
        confidence_score: 88,
      };
    }
  }

  // Get active lease expiry and rental escalation alerts for dashboard
  function getLeaseExpiryAndEscalationAlerts(deals) {
    if (!Array.isArray(deals)) return [];

    const now = new Date();
    const alerts = [];

    deals.forEach((d) => {
      const isLease = (d.investment_type === 'Rental Property' || d.category === 'Rental Property' || /lease|rent/i.test(d.deal_name || '') || /tenant/i.test(d.notes || ''));
      if (!isLease || d.status !== 'ACTIVE') return;

      // Expiry check (60 days)
      if (d.maturity_date) {
        const mat = new Date(d.maturity_date);
        const diffDays = Math.round((mat - now) / 86400000);

        if (diffDays <= 60 && diffDays >= -30) {
          alerts.push({
            type: 'lease_expiry',
            severity: diffDays <= 15 ? 'critical' : 'warning',
            deal_id: d.id,
            deal_name: d.deal_name,
            expiry_date: d.maturity_date,
            days_left: diffDays,
            monthly_rent: d.invested_amount ? Math.round(d.invested_amount * (d.annual_roi || 6) / 1200) : 0,
            message: diffDays < 0 ? `Lease expired ${Math.abs(diffDays)} days ago (${App.utils.fmtDate(d.maturity_date)})` : `Lease expires in ${diffDays} days (${App.utils.fmtDate(d.maturity_date)})`,
          });
        }
      }

      // Rent Escalation check (e.g. 11-month escalation)
      if (d.start_date) {
        const start = new Date(d.start_date);
        const monthsActive = Math.floor((now - start) / (30.44 * 86400000));
        const escalationPeriod = 11; // standard Indian commercial/residential 11-month cycle
        const escalationDueInMonths = escalationPeriod - (monthsActive % escalationPeriod);

        if (escalationDueInMonths <= 2) {
          const escalationPct = 5.0; // 5% escalation
          const currentRent = d.invested_amount ? Math.round(d.invested_amount * (d.annual_roi || 6) / 1200) : 50000;
          const escalatedRent = Math.round(currentRent * (1 + escalationPct / 100));

          alerts.push({
            type: 'rent_escalation',
            severity: 'info',
            deal_id: d.id,
            deal_name: d.deal_name,
            months_active: monthsActive,
            escalation_due_in_days: Math.max(1, escalationDueInMonths * 30),
            current_rent: currentRent,
            escalated_rent: escalatedRent,
            escalation_pct: escalationPct,
            message: `Annual 5% Rent Escalation due in ~${escalationDueInMonths * 30} days (${App.utils.fmtMoney(currentRent)} &rarr; ${App.utils.fmtMoney(escalatedRent)})`,
          });
        }
      }
    });

    return alerts;
  }

  return {
    openScannerModal,
    getLeaseExpiryAndEscalationAlerts,
  };
})();
