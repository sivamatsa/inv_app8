/* Deal Management (spec Sections 4, 18, 21). List + a 4-step create/edit
   wizard matching Section 21's step grouping + a tabbed detail modal
   matching Section 18. */
window.App = window.App || {};

(function () {
  const DEAL_FIELDS = [
    // Step 1: identity
    { key: 'deal_name', label: 'Deal Name', required: true, step: 1, span: 2 },
    { key: 'external_deal_id', label: 'External Deal ID (platform reference)', step: 1 },
    { key: 'investment_type', label: 'Investment Type', required: true, step: 1,
      type: 'select', options: () => [...new Set(App.state.categories.map((c) => c.investment_type))] },
    { key: 'category', label: 'Category', step: 1 },
    { key: 'sub_category', label: 'Sub Category', step: 1 },
    { key: 'platform_id', label: 'Platform / Lender', step: 1, numeric: true,
      type: 'select', options: () => App.state.platforms.map((p) => ({ value: p.id, label: p.name })) },
    { key: 'account_reference', label: 'Account / Reference Number', step: 1 },
    // Step 2: financial + dates
    { key: 'invested_amount', label: 'Invested Amount', required: true, type: 'number', step: 2 },
    { key: 'principal_amount', label: 'Principal Amount', required: true, type: 'number', step: 2 },
    { key: 'original_principal', label: 'Original Principal', required: true, type: 'number', step: 2 },
    { key: 'annual_roi', label: 'Annual ROI %', type: 'number', step: 2 },
    { key: 'monthly_roi', label: 'Monthly ROI %', type: 'number', step: 2 },
    { key: 'interest_rate', label: 'Interest Rate %', type: 'number', step: 2 },
    { key: 'interest_rate_type', label: 'Interest Rate Type', step: 2, placeholder: 'Fixed / Floating' },
    { key: 'start_date', label: 'Start Date', required: true, type: 'date', step: 2 },
    { key: 'investment_date', label: 'Investment Date', type: 'date', step: 2 },
    { key: 'maturity_date', label: 'Maturity Date', type: 'date', step: 2 },
    { key: 'expected_total_interest', label: 'Expected Total Interest', type: 'number', step: 2 },
    { key: 'expected_total_return', label: 'Expected Total Return', type: 'number', step: 2 },
    { key: 'fees', label: 'Fees', type: 'number', step: 2 },
    { key: 'tax_withheld', label: 'Tax Withheld', type: 'number', step: 2 },
    // Step 3: payment configuration
    { key: 'payment_frequency', label: 'Payment Frequency', required: true, step: 3,
      type: 'select', options: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'At Maturity', 'Irregular', 'Custom'] },
    { key: 'payout_type', label: 'Payout Type', required: true, step: 3,
      type: 'select', options: ['Interest Only', 'Interest + Principal', 'Principal at Maturity', 'Interest at Maturity', 'EMI', 'Bullet', 'Custom'] },
    { key: 'payment_day', label: 'Payment Day of Month', type: 'number', step: 3 },
    { key: 'first_payment_date', label: 'First Payment Date', type: 'date', step: 3 },
    { key: 'payment_method', label: 'Payment Method', step: 3 },
    { key: 'interest_calculation_method', label: 'Interest Calculation Method', step: 3, placeholder: 'Simple / Compound / Reducing Balance' },
    { key: 'principal_repayment_method', label: 'Principal Repayment Method', step: 3 },
    // Step 4: risk + status
    { key: 'status', label: 'Status', step: 4, type: 'select',
      options: ['ACTIVE', 'MATURED', 'CLOSED', 'DEFAULTED', 'PARTIALLY_RECOVERED', 'WRITTEN_OFF', 'CANCELLED', 'ON_HOLD'] },
    { key: 'risk_rating', label: 'Risk Rating', step: 4, type: 'select', options: () => App.state.riskRatings.map((r) => r.code) },
    { key: 'risk_category', label: 'Risk Category', step: 4 },
    { key: 'collateral_available', label: 'Collateral Available', step: 4, type: 'checkbox' },
    { key: 'collateral_value', label: 'Collateral Value', step: 4, type: 'number' },
    { key: 'guarantor_available', label: 'Guarantor Available', step: 4, type: 'checkbox' },
    { key: 'platform_rating', label: 'Platform Rating', step: 4 },
    { key: 'user_risk_rating', label: 'Your Risk Assessment', step: 4 },
    { key: 'default_probability', label: 'Default Probability %', step: 4, type: 'number' },
    { key: 'notes', label: 'Notes', step: 4, type: 'textarea', span: 4 },
  ];

  function resolvedFields(step) {
    return DEAL_FIELDS.filter((f) => f.step === step).map((f) => Object.assign({}, f, {
      options: typeof f.options === 'function' ? f.options() : f.options,
    }));
  }

  let wizardStep = 1;
  let wizardDealId = null;

  function stepperHtml() {
    const labels = ['1. Identity', '2. Amount & Dates', '3. Payment Setup', '4. Risk & Status'];
    return `<div class="wizard-steps">${labels.map((l, i) => `<div class="wizard-step ${wizardStep === i + 1 ? 'active' : wizardStep > i + 1 ? 'done' : ''}">${l}</div>`).join('')}</div>`;
  }

  function renderWizardBody(values) {
    const scanPromptHtml = (wizardStep === 1 && !wizardDealId) ? `
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:8px 12px;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div style="font-size:12px;color:var(--text2)">
          <span style="color:var(--gold);font-weight:700">🤖 AI Document Ingestion:</span> Auto-extract fields from Sale Deeds, Promissory Notes, Dharani passbooks, or Leases.
        </div>
        <button type="button" class="btn btn-gold btn-sm" id="wizardDocScanTrigger" style="padding:4px 10px;font-size:11.5px">
          📄 Scan Agreement / Deed
        </button>
      </div>` : '';

    return `${stepperHtml()}${scanPromptHtml}<div id="wizardFieldsHost">${App.ui.renderForm(resolvedFields(wizardStep), values)}</div>`;
  }

  function openDealWizard(initialOrExisting) {
    const isEdit = Boolean(initialOrExisting && initialOrExisting.id);
    wizardStep = 1;
    wizardDealId = isEdit ? initialOrExisting.id : null;
    const collected = Object.assign({}, initialOrExisting || {});
    if (!isEdit) {
      delete collected.id;
    }

    function renderStep() {
      App.utils.qs('#sharedModalBody').innerHTML = renderWizardBody(collected);
      wireStepFields();
    }

    function wireStepFields() {
      App.utils.qs('#wizardDocScanTrigger')?.addEventListener('click', () => {
        if (App.docScanner && App.docScanner.openScannerModal) {
          App.docScanner.openScannerModal((extracted) => {
            Object.assign(collected, extracted);
            renderStep();
            App.utils.toast('Agreement extracted & applied to wizard!', 'ok');
          });
        }
      });

      resolvedFields(wizardStep).forEach((f) => {
        const elx = App.utils.qs('#fld_' + f.key);
        if (!elx) return;
        elx.addEventListener('change', () => {
          const { values } = App.ui.readForm([f]);
          Object.assign(collected, values);
          if (['invested_amount', 'annual_roi', 'start_date', 'maturity_date'].includes(f.key)) previewExpected();
        });
      });
      previewExpected();
    }

    function previewExpected() {
      if (wizardStep !== 2) return;
      const amt = App.utils.parseNum(App.utils.qs('#fld_invested_amount')?.value);
      const roi = App.utils.parseNum(App.utils.qs('#fld_annual_roi')?.value);
      const start = App.utils.qs('#fld_start_date')?.value;
      const maturity = App.utils.qs('#fld_maturity_date')?.value;
      if (amt && roi && start && maturity) {
        const years = App.utils.daysBetween(start, maturity) / 365;
        const est = App.calc.simpleExpectedInterest(amt, roi, years);
        const field = App.utils.qs('#fld_expected_total_interest');
        if (field && !field.value) field.placeholder = `est. ${App.utils.fmtMoney(est)}`;
      }
    }

    function actionsForStep() {
      const actions = [];
      if (wizardStep > 1) actions.push({ label: '&larr; Back', className: 'btn-outline', onClick: () => { captureStep(); wizardStep--; renderStep(); } });
      if (wizardStep < 4) actions.push({ label: 'Next &rarr;', className: 'btn-gold', onClick: () => { if (captureStep()) { wizardStep++; renderStep(); refreshActions(); } } });
      else actions.push({ label: isEdit ? 'Save Changes' : 'Create Deal', className: 'btn-gold', onClick: submitWizard });
      actions.push({ label: 'Cancel', className: 'btn-outline', onClick: App.ui.close });
      return actions;
    }

    function refreshActions() {
      const el = App.utils.qs('#sharedModalActions');
      el.innerHTML = '';
      actionsForStep().forEach((a) => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + a.className;
        btn.innerHTML = a.label;
        btn.addEventListener('click', a.onClick);
        el.appendChild(btn);
      });
    }

    function captureStep() {
      const { values, errors } = App.ui.readForm(resolvedFields(wizardStep));
      Object.assign(collected, values);
      if (errors.length) { App.utils.toast('Fill in the required fields before continuing', 'err'); return false; }
      return true;
    }

    async function submitWizard() {
      if (!captureStep()) return;
      try {
        if (!isEdit) {
          collected.current_principal = collected.invested_amount;
          delete collected.id;
          delete collected.user_id;
          delete collected.created_at;
          delete collected.updated_at;
          const saved = await App.api.createDeal(collected);
          App.utils.toast('Deal created');
          if (saved.maturity_date && !['Irregular', 'Custom'].includes(saved.payment_frequency)) {
            try { await App.api.generateSchedule(saved.id); App.utils.toast('Payment schedule generated'); }
            catch (e) { App.utils.toast('Deal saved, but schedule generation failed: ' + (e.message || e), 'err'); }
          }
        } else {
          const patch = Object.assign({}, collected);
          delete patch.current_principal; // never blindly overwritten from the edit form
          // `collected` was seeded from the whole existing deal row (so the
          // wizard can show its current values across steps), not just the
          // form fields - strip the system-managed columns that came along
          // for the ride before sending this back as an UPDATE. `id` in
          // particular isn't just "shouldn't change", Postgres rejects the
          // update outright ("column can only be updated to DEFAULT") since
          // it's a GENERATED ALWAYS AS IDENTITY column.
          delete patch.id;
          delete patch.user_id;
          delete patch.created_at;
          delete patch.updated_at;
          await App.api.updateDeal(initialOrExisting.id, patch);
          App.utils.toast('Deal updated');
        }
        App.ui.close();
        App.router.refreshCurrent();
      } catch (e) {
        App.utils.toast('Could not save deal: ' + (e.message || e), 'err');
      }
    }

    App.ui.open({ title: isEdit ? 'Edit Deal' : 'New Deal', bodyHtml: renderWizardBody(collected), onMount: () => { wireStepFields(); refreshActions(); } });
  }

  // A deal with recorded payments literally cannot be deleted - payments.deal_id
  // is `on delete restrict` on purpose (this app's "never delete financial
  // history via a side effect" rule). Postgres surfaces that as a foreign-key
  // violation (error code 23503); caught here and shown as a friendly message
  // pointing at the existing Close action, instead of a raw DB error.
  function openDeleteDealModal(deal, onDone) {
    App.ui.open({
      title: 'Delete Deal',
      bodyHtml: `
        <div class="hint" style="color:var(--red,#e5484d);margin-bottom:10px">This permanently deletes "${App.utils.escapeHtml(deal.deal_name)}" and its payment schedule. There is no undo.</div>
        <div class="field span2"><label>Type the deal name to confirm: ${App.utils.escapeHtml(deal.deal_name)}</label><input id="confirmDeleteDealName" type="text"></div>
        <div class="auth-error" id="deleteDealError"></div>`,
      actions: [
        { label: 'Delete Permanently', className: 'btn-outline', onClick: async () => {
          const typed = App.utils.qs('#confirmDeleteDealName').value.trim();
          if (typed !== deal.deal_name) { App.utils.qs('#deleteDealError').textContent = 'Name does not match - nothing was deleted.'; return; }
          try {
            await App.api.deleteDeal(deal.id);
            App.utils.toast('Deal deleted');
            App.ui.close();
            if (onDone) onDone();
          } catch (e) {
            App.utils.qs('#deleteDealError').textContent = e.code === '23503'
              ? 'This deal has recorded payments and can\'t be deleted - edit it and set Status to CLOSED instead to keep its history.'
              : (e.message || String(e));
          }
        } },
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      ],
    });
  }

  async function openDealDetail(dealId) {
    const [deal, metricsAll, schedule, payments, documents] = await Promise.all([
      App.api.getDeal(dealId),
      App.api.listDealMetrics(),
      App.api.listSchedule({ eq: { deal_id: dealId } }),
      App.api.listPayments({ eq: { deal_id: dealId } }),
      App.api.listDocuments({ eq: { deal_id: dealId } }),
    ]);
    const metrics = metricsAll.find((m) => m.deal_id === dealId) || {};

    const overviewHtml = `
      <div class="grid-2">
        <div>
          <div class="stat-line"><span>Invested Amount</span><span class="v">${App.utils.fmtMoney(deal.invested_amount)}</span></div>
          <div class="stat-line"><span>ROI</span><span class="v">${App.utils.fmtPct(deal.annual_roi)}</span></div>
          <div class="stat-line"><span>Start Date</span><span class="v">${App.utils.fmtDate(deal.start_date)}</span></div>
          <div class="stat-line"><span>Maturity</span><span class="v">${App.utils.fmtDate(deal.maturity_date)}</span></div>
          <div class="stat-line"><span>Tenure</span><span class="v">${App.utils.fmtNum(App.utils.daysBetween(deal.start_date, deal.maturity_date))} days</span></div>
        </div>
        <div>
          <div class="stat-line"><span>Status</span><span class="badge st-${(deal.status || '').toLowerCase()}">${deal.status}</span></div>
          <div class="stat-line"><span>Outstanding Principal</span><span class="v">${App.utils.fmtMoney(metrics.total_outstanding)}</span></div>
          <div class="stat-line"><span>Platform</span><span class="v">${App.utils.escapeHtml(App.lookups.platformName(deal.platform_id))}</span></div>
          <div class="stat-line"><span>Payment Frequency</span><span class="v">${deal.payment_frequency || '—'}</span></div>
          <div class="stat-line"><span>Payout Type</span><span class="v">${deal.payout_type || '—'}</span></div>
        </div>
      </div>`;

    const performanceHtml = `
      <div class="grid-2">
        <div>
          <div class="stat-line"><span>Interest Received</span><span class="v">${App.utils.fmtMoney(metrics.interest_received)}</span></div>
          <div class="stat-line"><span>Interest Pending</span><span class="v">${App.utils.fmtMoney(metrics.interest_pending)}</span></div>
          <div class="stat-line"><span>Principal Returned</span><span class="v">${App.utils.fmtMoney(metrics.principal_returned)}</span></div>
          <div class="stat-line"><span>Total Received</span><span class="v">${App.utils.fmtMoney(metrics.total_received)}</span></div>
        </div>
        <div>
          <div class="stat-line"><span>Realized ROI</span><span class="v">${App.utils.fmtPct(metrics.realized_roi)}</span></div>
          <div class="stat-line"><span>Annualized Realized ROI</span><span class="v">${App.utils.fmtPct(metrics.annualized_realized_roi)}</span></div>
          <div class="stat-line"><span>Payment Reliability</span><span class="v">${App.utils.fmtPct(metrics.payout_reliability)}</span></div>
          <div class="stat-line"><span>Recovery %</span><span class="v">${App.utils.fmtPct(metrics.recovery_percentage)}</span></div>
        </div>
      </div>`;

    const historyHtml = `
      <div class="table-scroll" style="max-height:280px">
        <table class="data"><thead><tr><th>Scheduled</th><th>Expected</th><th>Status</th><th>Actual Date</th><th>Actual Amount</th></tr></thead>
        <tbody>${schedule.map((s) => {
          const actual = payments.find((p) => p.id === s.actual_payment_id);
          return `<tr><td>${App.utils.fmtDate(s.scheduled_date)}</td><td>${App.utils.fmtMoney(s.expected_total)}</td>
            <td><span class="badge ${App.utils.statusBadgeClass(s.status)}">${s.status}</span></td>
            <td>${actual ? App.utils.fmtDate(actual.transaction_date) : '—'}</td>
            <td>${actual ? App.utils.fmtMoney(actual.amount) : '—'}</td></tr>`;
        }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3)">No schedule yet</td></tr>'}</tbody></table>
      </div>`;

    const documentsHtml = `
      <div class="card-row">${documents.map((d) => `
        <div class="integration-card"><div class="name">${App.utils.escapeHtml(d.file_name)}</div>
        <div class="status">${d.document_type} · ${App.utils.fmtDate(d.document_date)}</div></div>`).join('') || '<div class="empty-note">No documents attached.</div>'}
      </div>`;

    const bodyHtml = `
      <div class="tabbar" id="detailTabs">
        <button class="tab-btn active" data-tab="ov">Overview</button>
        <button class="tab-btn" data-tab="pf">Performance</button>
        <button class="tab-btn" data-tab="hi">Payment History</button>
        <button class="tab-btn" data-tab="dc">Documents</button>
      </div>
      <div class="tab-pane active" data-pane="ov">${overviewHtml}</div>
      <div class="tab-pane" data-pane="pf">${performanceHtml}</div>
      <div class="tab-pane" data-pane="hi">${historyHtml}</div>
      <div class="tab-pane" data-pane="dc">${documentsHtml}</div>`;

    App.ui.open({
      title: deal.deal_name, bodyHtml,
      actions: [
        { label: 'Edit', className: 'btn-outline', onClick: () => { App.ui.close(); openDealWizard(deal); } },
        { label: 'Delete', className: 'btn-outline', onClick: () => openDeleteDealModal(deal, () => App.router.refreshCurrent()) },
        { label: 'Close', className: 'btn-gold', onClick: App.ui.close },
      ],
      onMount: (body) => {
        App.utils.qsa('.tab-btn', body.parentElement).forEach((btn) => {
          btn.addEventListener('click', () => {
            App.utils.qsa('.tab-btn', body.parentElement).forEach((b) => b.classList.toggle('active', b === btn));
            App.utils.qsa('.tab-pane', body).forEach((p) => p.classList.toggle('active', p.dataset.pane === btn.dataset.tab));
          });
        });
      },
    });
  }

  let sortKey = 'created_at';
  let sortDir = 'desc';
  let statusTab = 'all'; // 'all' | 'active' | 'closed'
  let quickFilterChip = 'all'; // 'all' | 'high_yield' | 'maturing_soon' | 'secured' | 'monthly' | 'at_risk'

  function openSmartDealQuickAdd() {
    App.ui.open({
      title: '⚡ Natural Language Deal Quick-Add',
      small: false,
      bodyHtml: `
        <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px">
          Paste or type any deal description in natural language. Our smart parser will extract terms, dates, and amounts automatically.
        </div>
        <div class="field" style="margin-bottom:14px">
          <label>Deal Description / Unstructured Text</label>
          <textarea id="smartDealText" rows="4" placeholder="e.g. Invested 3,50,000 in Tata Capital Secured Debenture with 11.2% annual ROI on 15 Jan 2026 maturing 15 Jan 2028 with monthly interest payouts and collateral attached"></textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <div class="hint" style="margin:0">Try sample:</div>
          <button class="ai-preset-chip" id="sampleDeal1" style="font-size:10.5px">HDFC 9.5% Bond</button>
          <button class="ai-preset-chip" id="sampleDeal2" style="font-size:10.5px">P2P 14% Monthly</button>
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: '✨ Parse & Open Wizard',
          className: 'btn-gold',
          onClick: () => {
            const raw = (App.utils.qs('#smartDealText')?.value || '').trim();
            if (!raw) {
              App.utils.toast('Please enter deal text to parse', 'err');
              return;
            }
            const parsed = parseDealFromText(raw);
            App.ui.close();
            openDealWizard(parsed);
            App.utils.toast('Deal parsed successfully — review and save');
          },
        },
      ],
      onMount: (modal) => {
        App.utils.qs('#sampleDeal1', modal)?.addEventListener('click', () => {
          App.utils.qs('#smartDealText', modal).value = 'Invested 2,00,000 in HDFC Fixed Deposit at 8.75% annual ROI on 2026-02-01 maturing 2029-02-01 with quarterly interest payout';
        });
        App.utils.qs('#sampleDeal2', modal)?.addEventListener('click', () => {
          App.utils.qs('#smartDealText', modal).value = 'Invested 5,00,000 in Cred P2P Lending at 13.5% ROI on 2026-01-10 maturing 2027-01-10 with monthly EMI payout and collateral';
        });
      },
    });
  }

  function parseDealFromText(text) {
    const out = {
      deal_name: '',
      invested_amount: null,
      principal_amount: null,
      original_principal: null,
      annual_roi: null,
      start_date: App.utils.todayISO(),
      maturity_date: null,
      payment_frequency: 'Monthly',
      payout_type: 'Interest Only',
      investment_type: 'Fixed Deposit',
      collateral_available: false,
      status: 'ACTIVE',
      notes: text,
    };

    // Amount extraction
    const amtMatch = text.match(/(?:invested|amount|rs\.?|inr|\$|₹)\s*([\d,]+(?:\.\d+)?)/i) || text.match(/([\d,]+(?:\.\d+)?)\s*(?:lakh|lac|k|invested)/i);
    if (amtMatch) {
      let numStr = amtMatch[1].replace(/,/g, '');
      let num = parseFloat(numStr);
      if (/lakh|lac/i.test(text)) num = num * 100000;
      else if (/k\b/i.test(amtMatch[0])) num = num * 1000;
      out.invested_amount = num;
      out.principal_amount = num;
      out.original_principal = num;
    }

    // ROI extraction
    const roiMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:annual|roi|interest|rate)?/i) || text.match(/(?:roi|interest|rate)\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)/i);
    if (roiMatch) out.annual_roi = parseFloat(roiMatch[1]);

    // Frequency
    if (/quarterly/i.test(text)) out.payment_frequency = 'Quarterly';
    else if (/yearly|annual/i.test(text) && !/annual roi|annual rate/i.test(text)) out.payment_frequency = 'Yearly';
    else if (/half[- ]?yearly|semi[- ]?annual/i.test(text)) out.payment_frequency = 'Half-Yearly';
    else if (/at maturity|bullet/i.test(text)) out.payment_frequency = 'At Maturity';

    // Payout Type
    if (/emi/i.test(text)) out.payout_type = 'EMI';
    else if (/principal at maturity/i.test(text)) out.payout_type = 'Principal at Maturity';
    else if (/bullet/i.test(text)) out.payout_type = 'Bullet';

    // Collateral
    if (/collateral|secured|guarantee/i.test(text)) out.collateral_available = true;

    // Dates
    const dateMatches = text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi);
    if (dateMatches && dateMatches.length > 0) {
      try {
        const d1 = new Date(dateMatches[0]);
        if (!isNaN(d1)) out.start_date = App.utils.toISO(d1);
        if (dateMatches.length > 1) {
          const d2 = new Date(dateMatches[1]);
          if (!isNaN(d2)) out.maturity_date = App.utils.toISO(d2);
        }
      } catch (e) {}
    }

    // Name extraction heuristic
    const nameMatch = text.match(/(?:in|for|deal)\s+([A-Za-z0-9\s&]+?)(?=\s+(?:at|with|on|for|of|having|\d))/i);
    if (nameMatch && nameMatch[1].trim().length > 2) {
      out.deal_name = nameMatch[1].trim();
    } else {
      out.deal_name = 'New Investment Deal';
    }

    if (App.state.categories && App.state.categories.length > 0) {
      const matchCat = App.state.categories.find((c) => new RegExp(c.investment_type, 'i').test(text));
      if (matchCat) out.investment_type = matchCat.investment_type;
    }

    return out;
  }

  async function renderDealsView() {
    const pane = App.utils.qs('#pane-deals');
    pane.innerHTML = `
      <div class="section-title">Deal Management <div class="line"></div><small>every investment, one universal model</small></div>
      <div id="dealsFilterBar"></div>
      <div class="panel">
        <!-- QUICK FILTER CHIPS -->
        <div class="filter-chips-wrap" id="dealQuickChips">
          <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-right:4px">Quick Filter:</span>
          <button class="quick-chip active" data-chip="all">All Deals</button>
          <button class="quick-chip" data-chip="high_yield">&#128293; High Yield (&gt;12%)</button>
          <button class="quick-chip" data-chip="maturing_soon">&#8987; Maturing Soon (90d)</button>
          <button class="quick-chip" data-chip="secured">&#128274; Secured / Collateral</button>
          <button class="quick-chip" data-chip="monthly">&#128197; Monthly Payout</button>
          <button class="quick-chip" data-chip="at_risk">&#9888; Overdue / At Risk</button>
        </div>

        <div class="tabbar" id="dealsStatusTabs">
          <button class="tab-btn active" data-status-tab="all">All Deals</button>
          <button class="tab-btn" data-status-tab="active">Active Deals</button>
          <button class="tab-btn" data-status-tab="closed">Closed Deals</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
          <input class="search-input" id="dealsSearch" placeholder="Search deal name / external id...">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="scanAgreementBtn">🤖 Scan Agreement / Deed</button>
            <button class="btn btn-outline btn-sm" id="smartQuickAddBtn">&#9889; AI Quick Add</button>
            <button class="btn btn-outline btn-sm" id="exportDealsBtn">&#8595; Export</button>
            <button class="btn btn-gold btn-sm" id="addDealBtn">+ New Deal</button>
          </div>
        </div>
        <div class="table-scroll"><table class="data" id="dealsTable"></table></div>
      </div>`;

    App.filters.renderBar(App.utils.qs('#dealsFilterBar'), draw);
    App.utils.qs('#addDealBtn').addEventListener('click', () => openDealWizard(null));
    App.utils.qs('#scanAgreementBtn')?.addEventListener('click', () => {
      if (App.docScanner && App.docScanner.openScannerModal) {
        App.docScanner.openScannerModal((extracted) => {
          openDealWizard(extracted);
        });
      } else {
        openSmartDealQuickAdd();
      }
    });
    App.utils.qs('#smartQuickAddBtn').addEventListener('click', openSmartDealQuickAdd);
    App.utils.qs('#exportDealsBtn').addEventListener('click', async () => {
      try { await App.exportData.exportSection('deals'); } catch (e) { App.utils.toast('Could not export: ' + (e.message || e), 'err'); }
    });
    App.utils.qs('#dealsSearch').addEventListener('input', App.utils.debounce((e) => {
      App.state.filters.search = e.target.value; draw();
    }, 250));

    // Quick Chip Listeners
    App.utils.qsa('[data-chip]', pane).forEach((btn) => btn.addEventListener('click', () => {
      quickFilterChip = btn.dataset.chip;
      App.utils.qsa('[data-chip]', pane).forEach((b) => b.classList.toggle('active', b === btn));
      draw();
    }));

    App.utils.qsa('[data-status-tab]', pane).forEach((btn) => btn.addEventListener('click', () => {
      statusTab = btn.dataset.statusTab;
      App.utils.qsa('[data-status-tab]', pane).forEach((b) => b.classList.toggle('active', b === btn));
      draw();
    }));

    async function draw() {
      const [deals, metrics] = await Promise.all([App.api.listDeals(), App.api.listDealMetrics()]);
      const metricsById = {}; metrics.forEach((m) => { metricsById[m.deal_id] = m; });
      let list = App.filters.apply(deals);

      // Status Tab filter
      if (statusTab === 'active') list = list.filter((d) => d.status === 'ACTIVE');
      else if (statusTab === 'closed') list = list.filter((d) => d.status !== 'ACTIVE');

      // Quick Filter Chips logic
      const now = new Date();
      const in90Days = new Date(now.getTime() + 90 * 86400000);

      if (quickFilterChip === 'high_yield') {
        list = list.filter((d) => (d.annual_roi || 0) >= 12);
      } else if (quickFilterChip === 'maturing_soon') {
        list = list.filter((d) => {
          if (!d.maturity_date || d.status !== 'ACTIVE') return false;
          const mat = new Date(d.maturity_date);
          return mat >= now && mat <= in90Days;
        });
      } else if (quickFilterChip === 'secured') {
        list = list.filter((d) => d.collateral_available);
      } else if (quickFilterChip === 'monthly') {
        list = list.filter((d) => d.payment_frequency === 'Monthly');
      } else if (quickFilterChip === 'at_risk') {
        list = list.filter((d) => {
          const m = metricsById[d.id] || {};
          return ['DEFAULTED', 'ON_HOLD', 'PARTIALLY_RECOVERED'].includes(d.status) || (m.payout_reliability != null && m.payout_reliability < 80);
        });
      }

      list.sort((a, b) => {
        let va = a[sortKey], vb = b[sortKey];
        if (va === null || va === undefined) va = typeof vb === 'number' ? -Infinity : '';
        if (vb === null || vb === undefined) vb = typeof va === 'number' ? -Infinity : '';
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? va - vb : vb - va;
      });

      const cols = [
        ['deal_name', 'Deal'], ['external_deal_id', 'External Deal ID'], ['investment_type', 'Type'], ['invested_amount', 'Invested'],
        ['annual_roi', 'ROI'], ['payment_frequency', 'Frequency'], ['status', 'Status'], ['maturity_date', 'Maturity'],
      ];
      const thead = `<thead><tr>${cols.map(([k, l]) => `<th data-sort="${k}">${l}${sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th>Reliability</th><th>Actions</th></tr></thead>`;
      const body = list.map((d) => {
        const m = metricsById[d.id] || {};
        return `<tr>
          <td>${App.utils.escapeHtml(d.deal_name)} ${d.collateral_available ? '<span title="Secured with Collateral" style="color:var(--teal)">&#128274;</span>' : ''}</td>
          <td>${App.utils.escapeHtml(d.external_deal_id || '—')}</td>
          <td>${App.utils.escapeHtml(d.investment_type)}</td>
          <td>${App.utils.fmtMoney(d.invested_amount)}</td>
          <td>${App.utils.fmtPct(d.annual_roi)}</td>
          <td>${d.payment_frequency}</td>
          <td><span class="badge ${App.utils.statusBadgeClass(d.status)}">${d.status}</span></td>
          <td>${App.utils.fmtDate(d.maturity_date)}</td>
          <td>${App.utils.fmtPct(m.payout_reliability, 0)}</td>
          <td class="row-actions">
            <button class="icon-btn" data-view="${d.id}" title="View">&#128065;</button>
            <button class="icon-btn" data-edit="${d.id}" title="Edit">&#9998;</button>
            <button class="icon-btn" data-schedule="${d.id}" title="Regenerate schedule">&#128260;</button>
            <button class="icon-btn del" data-delete="${d.id}" title="Delete">&#128465;</button>
          </td>
        </tr>`;
      }).join('');
      const table = App.utils.qs('#dealsTable');
      table.innerHTML = thead + `<tbody>${body || `<tr><td colspan="10" style="text-align:center;color:var(--text3);padding:24px">No deals match the selected filters.</td></tr>`}</tbody>`;

      App.utils.qsa('th[data-sort]', table).forEach((th) => th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else { sortKey = k; sortDir = 'asc'; }
        draw();
      }));
      App.utils.qsa('[data-view]', table).forEach((b) => b.addEventListener('click', () => openDealDetail(Number(b.dataset.view))));
      App.utils.qsa('[data-edit]', table).forEach((b) => b.addEventListener('click', () => {
        const deal = deals.find((d) => d.id === Number(b.dataset.edit));
        openDealWizard(deal);
      }));
      App.utils.qsa('[data-schedule]', table).forEach((b) => b.addEventListener('click', async () => {
        try { const n = await App.api.generateSchedule(Number(b.dataset.schedule)); App.utils.toast(`Schedule regenerated (${n} rows)`); draw(); }
        catch (e) { App.utils.toast('Could not generate schedule: ' + (e.message || e), 'err'); }
      }));
      App.utils.qsa('[data-delete]', table).forEach((b) => b.addEventListener('click', () => {
        const deal = deals.find((d) => d.id === Number(b.dataset.delete));
        openDeleteDealModal(deal, () => draw());
      }));
    }

    await draw();
  }

  App.router.register('deals', renderDealsView);
  App.dealsView = { openDealWizard, openDealDetail };
})();
