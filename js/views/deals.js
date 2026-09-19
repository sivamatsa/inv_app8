/* Deal Management & Lifecycle Engine (spec Sections 4, 18, 21).
   Features:
   - 4-step wizard with Rate Basis (Monthly/Annual/etc.), Calculation Mode, and Live Cash Flow Preview.
   - Deal Control Center with Top KPIs, Expected vs Confirmed Cash Flow, and 6-Bucket Maturity Pipeline.
   - Dual-Confirmation Maturity Settlement (Interest vs Principal split confirmation).
   - Capital Reinvestment Routing modal when principal is returned.
   - Non-destructive Audited Deal Extension with preserved original maturity dates and historical schedules.
   - Rich Deal Detail with visual lifecycle stepper, maturity action card, and extension audit log.
*/
window.App = window.App || {};

(function () {
  function formatWhatsAppUrl(groupVal) {
    if (!groupVal) return '#';
    const str = String(groupVal).trim();
    if (!str) return '#';
    if (str.startsWith('http://') || str.startsWith('https://')) return str;
    if (str.startsWith('chat.whatsapp.com/')) return 'https://' + str;
    if (str.startsWith('wa.me/')) return 'https://' + str;
    const digitsOnly = str.replace(/[^\d]/g, '');
    if (digitsOnly.length >= 10) return `https://wa.me/${digitsOnly}`;
    return `https://chat.whatsapp.com/`;
  }

  function getDealOperationalStatus(deal, metrics, schedule) {
    const today = App.utils.todayISO();
    const outstandingPrn = Number(deal.current_principal != null ? deal.current_principal : deal.invested_amount) || 0;
    const prnReturned = Number(metrics?.principal_returned) || Math.max(0, Number(deal.invested_amount) - outstandingPrn);

    if (deal.status === 'CLOSED' || (outstandingPrn <= 0 && prnReturned > 0)) {
      return { code: 'CLOSED', label: 'CLOSED', cls: 'st-closed' };
    }
    if (['DEFAULTED', 'WRITTEN_OFF'].includes(deal.status)) {
      return { code: deal.status, label: deal.status, cls: 'st-defaulted' };
    }
    if (deal.extension_count > 0 && deal.status === 'ACTIVE') {
      return { code: 'EXTENDED', label: `EXTENDED (+${deal.extension_count})`, cls: 'badge-gold' };
    }
    if (deal.maturity_date && deal.maturity_date <= today) {
      if (prnReturned > 0 && outstandingPrn > 0) {
        const pct = Math.round((prnReturned / deal.invested_amount) * 100);
        return { code: 'PARTIAL_RECOVERY', label: `PARTIAL RECOVERY (${pct}%)`, cls: 'st-partially_received' };
      }
      return { code: 'MATURED_ACTION', label: 'MATURED · ACTION REQ', cls: 'badge-red' };
    }
    if (schedule && schedule.some((s) => s.status === 'OVERDUE')) {
      return { code: 'PAYMENT_OVERDUE', label: 'PAYMENT OVERDUE', cls: 'st-overdue' };
    }
    if (deal.maturity_date) {
      const diffDays = App.utils.daysBetween(today, deal.maturity_date);
      if (diffDays >= 0 && diffDays <= 30) {
        return { code: 'MATURING_SOON', label: `MATURING IN ${diffDays}D`, cls: 'badge-teal' };
      }
    }
    return { code: 'ACTIVE', label: 'ACTIVE', cls: 'st-active' };
  }

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
    { key: 'whatsapp_group', label: 'WhatsApp Group (Link or Group Name)', step: 1, span: 2, placeholder: 'e.g. https://chat.whatsapp.com/AbCdEf12345 or Deal Provider Support' },

    // Step 2: financial + dates + rate basis
    { key: 'invested_amount', label: 'Invested Amount (₹)', required: true, type: 'number', step: 2 },
    { key: 'principal_amount', label: 'Principal Amount (₹)', required: true, type: 'number', step: 2 },
    { key: 'original_principal', label: 'Original Principal (₹)', required: true, type: 'number', step: 2 },
    { key: 'interest_rate', label: 'Interest Rate %', type: 'number', step: 2, placeholder: 'e.g. 1.7' },
    { key: 'interest_rate_basis', label: 'Interest Rate Basis', step: 2, type: 'select',
      options: ['Monthly', 'Annual', 'Quarterly', 'Half-Yearly', 'Custom'] },
    { key: 'interest_calculation', label: 'Interest Calculation', step: 2, type: 'select',
      options: ['Simple', 'Compound', 'Reducing Balance', 'Custom'] },
    { key: 'monthly_roi', label: 'Monthly ROI %', type: 'number', step: 2 },
    { key: 'annual_roi', label: 'Annual ROI % (Benchmark / Derived)', type: 'number', step: 2 },
    { key: 'start_date', label: 'Start Date', required: true, type: 'date', step: 2 },
    { key: 'investment_date', label: 'Investment Date', type: 'date', step: 2 },
    { key: 'maturity_date', label: 'Maturity Date', type: 'date', step: 2 },
    { key: 'expected_total_interest', label: 'Expected Total Interest (₹)', type: 'number', step: 2 },
    { key: 'expected_total_return', label: 'Expected Total Return (₹)', type: 'number', step: 2 },
    { key: 'fees', label: 'Fees', type: 'number', step: 2 },
    { key: 'tax_withheld', label: 'Tax Withheld', type: 'number', step: 2 },

    // Step 3: payment configuration & timing
    { key: 'payment_frequency', label: 'Interest Payout Frequency', required: true, step: 3,
      type: 'select', options: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'At Maturity', 'Irregular', 'Custom'] },
    { key: 'payout_type', label: 'Payout Type', required: true, step: 3,
      type: 'select', options: ['Interest Only', 'Interest + Principal', 'Principal at Maturity', 'Interest at Maturity', 'EMI', 'Bullet', 'Custom'] },
    { key: 'principal_repayment_timing', label: 'Principal Repayment Timing', step: 3,
      type: 'select', options: ['At Maturity', 'Periodically', 'Custom'] },
    { key: 'payment_day', label: 'Payment Day of Month', type: 'number', step: 3 },
    { key: 'first_payment_date', label: 'First Payment Date', type: 'date', step: 3 },
    { key: 'payment_method', label: 'Payment Method', step: 3 },
    { key: 'interest_calculation_method', label: 'Interest Calculation Notes', step: 3, placeholder: 'e.g. 1.7% fixed monthly simple interest' },

    // Step 4: risk + status
    { key: 'status', label: 'Status', step: 4, type: 'select',
      options: ['ACTIVE', 'MATURED', 'CLOSED', 'DEFAULTED', 'PARTIALLY_RECOVERED', 'WRITTEN_OFF', 'CANCELLED', 'ON_HOLD'] },
    { key: 'risk_rating', label: 'Risk Rating', step: 4, type: 'select', options: () => App.state.riskRatings.map((r) => r.code) },
    { key: 'risk_category', label: 'Risk Category', step: 4 },
    { key: 'collateral_available', label: 'Collateral Available', step: 4, type: 'checkbox' },
    { key: 'collateral_value', label: 'Collateral Value (₹)', step: 4, type: 'number' },
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
    const labels = ['1. Identity', '2. Financial & Rate Basis', '3. Payment Setup', '4. Risk & Status'];
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

    const previewContainerHtml = (wizardStep === 2 || wizardStep === 3) ? `
      <div id="wizardCashFlowPreviewWrap" style="margin-top:14px"></div>
    ` : '';

    return `${stepperHtml()}${scanPromptHtml}<div id="wizardFieldsHost">${App.ui.renderForm(resolvedFields(wizardStep), values)}</div>${previewContainerHtml}`;
  }

  function computeCashFlowMetrics(collected) {
    const amt = Number(collected.invested_amount) || 0;
    const basis = collected.interest_rate_basis || 'Monthly';
    let rawRate = Number(collected.interest_rate) || 0;
    if (!rawRate && basis === 'Monthly' && collected.monthly_roi) rawRate = Number(collected.monthly_roi);
    if (!rawRate && basis === 'Annual' && collected.annual_roi) rawRate = Number(collected.annual_roi);

    let monthlyRate = 0;
    let annualRate = 0;

    if (basis === 'Monthly') {
      monthlyRate = rawRate;
      annualRate = rawRate * 12;
    } else if (basis === 'Quarterly') {
      monthlyRate = rawRate / 3;
      annualRate = rawRate * 4;
    } else if (basis === 'Half-Yearly') {
      monthlyRate = rawRate / 6;
      annualRate = rawRate * 2;
    } else { // Annual or default
      annualRate = rawRate;
      monthlyRate = rawRate / 12;
    }

    const start = collected.start_date;
    const maturity = collected.maturity_date;
    let months = 1;
    if (start && maturity) {
      const d1 = new Date(start);
      const d2 = new Date(maturity);
      months = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24 * 30.4375)));
    }

    const periodicInterest = Math.round(amt * (monthlyRate / 100));
    const totalExpectedInterest = Math.round(periodicInterest * months);
    const principalAtMaturity = amt;
    const totalExpectedReturn = amt + totalExpectedInterest;

    return {
      amt,
      basis,
      rawRate,
      monthlyRate,
      annualRate,
      months,
      periodicInterest,
      totalExpectedInterest,
      principalAtMaturity,
      totalExpectedReturn,
    };
  }

  function openDealWizard(initialOrExisting) {
    const isEdit = Boolean(initialOrExisting && initialOrExisting.id);
    wizardStep = 1;
    wizardDealId = isEdit ? initialOrExisting.id : null;
    const collected = Object.assign({
      interest_rate_basis: 'Monthly',
      interest_calculation: 'Simple',
      principal_repayment_timing: 'At Maturity',
      payment_frequency: 'Monthly',
      payout_type: 'Interest Only',
    }, initialOrExisting || {});

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
          if (f.key === 'invested_amount' && !isEdit) {
            const pFld = App.utils.qs('#fld_principal_amount');
            const oFld = App.utils.qs('#fld_original_principal');
            if (pFld && !pFld.value) { pFld.value = values.invested_amount; collected.principal_amount = values.invested_amount; }
            if (oFld && !oFld.value) { oFld.value = values.invested_amount; collected.original_principal = values.invested_amount; }
          }
          previewExpected();
        });
        elx.addEventListener('input', () => {
          if (['invested_amount', 'interest_rate', 'monthly_roi', 'annual_roi', 'start_date', 'maturity_date'].includes(f.key)) {
            const { values } = App.ui.readForm([f]);
            Object.assign(collected, values);
            previewExpected();
          }
        });
      });
      previewExpected();
    }

    function previewExpected() {
      if (wizardStep !== 2 && wizardStep !== 3) return;
      const wrap = App.utils.qs('#wizardCashFlowPreviewWrap');
      if (!wrap) return;

      const m = computeCashFlowMetrics(collected);

      // Auto-populate derived fields if user hasn't typed custom values
      const expIntFld = App.utils.qs('#fld_expected_total_interest');
      const expTotFld = App.utils.qs('#fld_expected_total_return');
      const mRoiFld = App.utils.qs('#fld_monthly_roi');
      const aRoiFld = App.utils.qs('#fld_annual_roi');

      if (m.amt > 0 && m.rawRate > 0) {
        if (expIntFld && (!expIntFld.value || expIntFld.value == '0')) expIntFld.value = m.totalExpectedInterest;
        if (expTotFld && (!expTotFld.value || expTotFld.value == '0')) expTotFld.value = m.totalExpectedReturn;
        if (mRoiFld && !mRoiFld.value) mRoiFld.value = m.monthlyRate.toFixed(3);
        if (aRoiFld && !aRoiFld.value) aRoiFld.value = m.annualRate.toFixed(2);
        collected.expected_total_interest = m.totalExpectedInterest;
        collected.expected_total_return = m.totalExpectedReturn;
        collected.monthly_roi = m.monthlyRate;
        collected.annual_roi = m.annualRate;
      }

      wrap.innerHTML = `
        <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:10px;padding:12px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:11.5px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:0.5px">💡 Live Cash Flow & Maturity Preview</span>
            <span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:rgba(201,168,76,0.2);color:var(--gold);font-weight:600">${m.months} Month(s) Tenure</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
            <div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Periodic Interest</div>
              <div style="font-size:16px;font-weight:700;color:var(--teal)">${App.utils.fmtMoney(m.periodicInterest)}/mo</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Total Expected Interest</div>
              <div style="font-size:16px;font-weight:700;color:var(--teal)">${App.utils.fmtMoney(m.totalExpectedInterest)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Principal at Maturity</div>
              <div style="font-size:16px;font-weight:700;color:var(--gold)">${App.utils.fmtMoney(m.principalAtMaturity)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Total Expected Return</div>
              <div style="font-size:16px;font-weight:700;color:var(--text)">${App.utils.fmtMoney(m.totalExpectedReturn)}</div>
            </div>
          </div>
          <div style="margin-top:8px;font-size:11.5px;color:var(--text2)">
            Config: <strong>${m.rawRate}% ${m.basis}</strong> (${collected.interest_calculation || 'Simple'}) ➔ Annual Simple Equivalent: <strong style="color:var(--gold)">${m.annualRate.toFixed(2)}% p.a.</strong>
          </div>
        </div>`;
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
        const m = computeCashFlowMetrics(collected);
        collected.monthly_roi = collected.monthly_roi || m.monthlyRate;
        collected.annual_roi = collected.annual_roi || m.annualRate;
        collected.expected_total_interest = collected.expected_total_interest || m.totalExpectedInterest;
        collected.expected_total_return = collected.expected_total_return || m.totalExpectedReturn;
        collected.principal_amount = collected.principal_amount || collected.invested_amount;
        collected.original_principal = collected.original_principal || collected.invested_amount;

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
          delete patch.current_principal;
          delete patch.id;
          delete patch.user_id;
          delete patch.created_at;
          delete patch.updated_at;
          delete patch.original_maturity_date;
          delete patch.extension_count;
          delete patch.extensions_history;
          await App.api.updateDeal(wizardDealId, patch);
          App.utils.toast('Deal updated');
          if (patch.maturity_date && !['Irregular', 'Custom'].includes(patch.payment_frequency)) {
            try { await App.api.generateSchedule(wizardDealId); }
            catch (e) { console.warn('Schedule sync warning:', e); }
          }
        }
        App.ui.close();
        App.router.refreshCurrent();
      } catch (e) {
        App.utils.toast('Could not save deal: ' + (e.message || e), 'err');
      }
    }

    App.ui.open({ title: isEdit ? 'Edit Deal' : 'New Deal', bodyHtml: renderWizardBody(collected), onMount: () => { wireStepFields(); refreshActions(); } });
  }

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

  // =========================================================================
  // DUAL-CONFIRMATION MATURITY SETTLEMENT MODAL
  // =========================================================================
  function openMaturitySettlementModal(deal, onDone) {
    const currentPrn = Number(deal.current_principal != null ? deal.current_principal : deal.invested_amount) || 0;
    const basis = deal.interest_rate_basis || 'Monthly';
    let expInt = 0;
    if (basis === 'Monthly' && deal.monthly_roi) {
      expInt = Math.round(deal.invested_amount * (deal.monthly_roi / 100));
    } else if (deal.annual_roi) {
      const ppy = { Monthly: 12, Quarterly: 4, 'Half-Yearly': 2, Yearly: 1, 'At Maturity': 1 }[deal.payment_frequency] || 12;
      expInt = Math.round(deal.invested_amount * ((deal.annual_roi / 100) / ppy));
    } else if (deal.expected_total_interest) {
      expInt = Math.round(deal.expected_total_interest);
    }
    const today = App.utils.todayISO();

    App.ui.open({
      title: `🏁 Maturity Settlement — ${App.utils.escapeHtml(deal.deal_name)}`,
      bodyHtml: `
        <div style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;color:var(--text2)">Outstanding Principal:</span>
            <strong style="color:var(--gold)">${App.utils.fmtMoney(currentPrn)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;color:var(--text2)">Expected Final Interest:</span>
            <strong style="color:var(--teal)">${App.utils.fmtMoney(expInt)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1px dashed var(--border2);padding-top:4px;margin-top:4px">
            <span style="font-size:12px;font-weight:700;color:var(--text)">Total Due at Maturity:</span>
            <strong style="color:var(--text);font-size:14px">${App.utils.fmtMoney(currentPrn + expInt)}</strong>
          </div>
        </div>

        <!-- 1. Interest Component Box -->
        <div style="border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:12px;background:var(--card2)">
          <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;cursor:pointer;color:var(--teal);margin-bottom:8px">
            <input type="checkbox" id="chkMatInterest" checked style="width:18px;height:18px;cursor:pointer">
            <span>1. Interest Component Received</span>
          </label>
          <div id="matInterestWrap" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-left:26px">
            <div class="field" style="margin:0">
              <label style="font-size:11px">Interest Amount (₹)</label>
              <input type="number" id="matInterestAmt" value="${expInt}">
            </div>
            <div class="field" style="margin:0">
              <label style="font-size:11px">Received Date</label>
              <input type="date" id="matInterestDate" value="${today}">
            </div>
          </div>
        </div>

        <!-- 2. Principal Component Box -->
        <div style="border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:14px;background:var(--card2)">
          <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;cursor:pointer;color:var(--gold);margin-bottom:8px">
            <input type="checkbox" id="chkMatPrincipal" style="width:18px;height:18px;cursor:pointer">
            <span>2. Principal Component Received</span>
          </label>
          <div style="font-size:11px;color:var(--text3);padding-left:26px;margin-bottom:8px">
            ⚠️ <em>Leave unchecked if the borrower hasn't returned the principal yet. The deal will remain ACTIVE and will not close.</em>
          </div>
          <div id="matPrincipalWrap" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-left:26px;opacity:0.5;pointer-events:none">
            <div class="field" style="margin:0">
              <label style="font-size:11px">Principal Amount (₹)</label>
              <input type="number" id="matPrincipalAmt" value="${currentPrn}">
            </div>
            <div class="field" style="margin:0">
              <label style="font-size:11px">Received Date</label>
              <input type="date" id="matPrincipalDate" value="${today}">
            </div>
          </div>
        </div>

        <div class="grid-2" style="margin-bottom:10px">
          <div class="field">
            <label style="font-size:11px">Payment Mode</label>
            <select id="matPaymentMode">
              <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
              <option value="UPI">UPI</option>
              <option value="Cheque">Cheque</option>
              <option value="Cash">Cash</option>
              <option value="Platform Wallet">Platform Wallet</option>
            </select>
          </div>
          <div class="field">
            <label style="font-size:11px">UTR / Reference No.</label>
            <input type="text" id="matPaymentRef" placeholder="e.g. UTR12345678">
          </div>
        </div>

        <div class="field" style="margin-bottom:12px">
          <label style="font-size:11px">Notes</label>
          <input type="text" id="matNotes" placeholder="e.g. Final maturity payout confirmation">
        </div>

        <div id="matOutcomeSummary" style="font-size:11.5px;color:var(--text2);padding:8px 12px;background:var(--fill-1);border-radius:6px">
          Outcome: Logging interest of <strong>${App.utils.fmtMoney(expInt)}</strong>. Principal remains outstanding. Deal remains <strong>ACTIVE</strong>.
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        { label: 'Confirm Settlement', className: 'btn-gold', onClick: async () => {
          const chkInt = App.utils.qs('#chkMatInterest')?.checked;
          const chkPrn = App.utils.qs('#chkMatPrincipal')?.checked;
          const intAmt = chkInt ? (Number(App.utils.qs('#matInterestAmt')?.value) || 0) : 0;
          const prnAmt = chkPrn ? (Number(App.utils.qs('#matPrincipalAmt')?.value) || 0) : 0;
          const sDate = (chkInt ? App.utils.qs('#matInterestDate')?.value : App.utils.qs('#matPrincipalDate')?.value) || today;
          const mode = App.utils.qs('#matPaymentMode')?.value || 'Bank Transfer';
          const ref = App.utils.qs('#matPaymentRef')?.value?.trim();
          const notes = App.utils.qs('#matNotes')?.value?.trim();

          if (!chkInt && !chkPrn) {
            App.utils.toast('Please check at least one component (Interest or Principal)', 'err');
            return;
          }
          if (chkInt && intAmt <= 0 && (!chkPrn || prnAmt <= 0)) {
            App.utils.toast('Please enter a valid amount', 'err');
            return;
          }

          try {
            const res = await App.api.recordMaturitySettlement({
              dealId: deal.id,
              settlementDate: sDate,
              interestReceived: chkInt,
              interestAmount: intAmt,
              principalReceived: chkPrn,
              principalAmount: prnAmt,
              paymentMode: mode,
              paymentReference: ref,
              notes,
            });

            App.ui.close();

            if (chkPrn && prnAmt > 0) {
              App.utils.toast(`Principal of ${App.utils.fmtMoney(prnAmt)} returned!`, 'ok');
              openPrincipalReinvestmentDialog(deal, prnAmt, onDone);
            } else {
              App.utils.toast(`Interest of ${App.utils.fmtMoney(intAmt)} recorded. Deal remains ACTIVE.`, 'ok');
              if (onDone) onDone();
            }
          } catch (err) {
            App.utils.toast('Could not record settlement: ' + (err.message || err), 'err');
          }
        }},
      ],
      onMount: (modal) => {
        const chkInt = App.utils.qs('#chkMatInterest', modal);
        const chkPrn = App.utils.qs('#chkMatPrincipal', modal);
        const intWrap = App.utils.qs('#matInterestWrap', modal);
        const prnWrap = App.utils.qs('#matPrincipalWrap', modal);
        const summary = App.utils.qs('#matOutcomeSummary', modal);

        function updateOutcome() {
          const hasInt = chkInt.checked;
          const hasPrn = chkPrn.checked;
          intWrap.style.opacity = hasInt ? '1' : '0.4';
          intWrap.style.pointerEvents = hasInt ? 'auto' : 'none';
          prnWrap.style.opacity = hasPrn ? '1' : '0.4';
          prnWrap.style.pointerEvents = hasPrn ? 'auto' : 'none';

          if (hasInt && hasPrn) {
            summary.innerHTML = `Outcome: Both interest and principal confirmed. Deal will be marked as <strong style="color:var(--teal)">CLOSED</strong> and returned capital routed to Reinvestment.`;
          } else if (hasInt && !hasPrn) {
            summary.innerHTML = `Outcome: Only interest confirmed. Principal remains pending. Deal stays <strong style="color:var(--gold)">ACTIVE</strong> for follow-up or extension.`;
          } else if (!hasInt && hasPrn) {
            summary.innerHTML = `Outcome: Principal confirmed returned. Deal status updated.`;
          } else {
            summary.innerHTML = `Please select at least one component to record.`;
          }
        }

        chkInt.addEventListener('change', updateOutcome);
        chkPrn.addEventListener('change', updateOutcome);
      },
    });
  }

  // =========================================================================
  // CAPITAL REINVESTMENT ROUTING DIALOG
  // =========================================================================
  function openPrincipalReinvestmentDialog(deal, returnedAmount, onDone) {
    App.ui.open({
      title: `🔄 Capital Returned: ${App.utils.fmtMoney(returnedAmount)}`,
      bodyHtml: `
        <div style="font-size:13px;color:var(--text);margin-bottom:12px">
          Principal of <strong>${App.utils.fmtMoney(returnedAmount)}</strong> from <strong>${App.utils.escapeHtml(deal.deal_name)}</strong> has been received and verified.
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:16px">
          How would you like to allocate or deploy this returned capital?
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn btn-gold" id="btnReinvestNewDeal" style="justify-content:flex-start;padding:12px 16px;text-align:left">
            <div>
              <div style="font-weight:700">➕ Deploy into a New Deal</div>
              <div style="font-size:11px;opacity:0.85">Launch deal wizard pre-filled with ${App.utils.fmtMoney(returnedAmount)}</div>
            </div>
          </button>
          <button class="btn btn-outline" id="btnKeepLiquidCash" style="justify-content:flex-start;padding:12px 16px;text-align:left">
            <div>
              <div style="font-weight:700">🏦 Keep as Liquid Cash / Bank Reserve</div>
              <div style="font-size:11px;color:var(--text3)">Preserve as unallocated cash for upcoming opportunities</div>
            </div>
          </button>
          <button class="btn btn-outline" id="btnGoToReinvestments" style="justify-content:flex-start;padding:12px 16px;text-align:left">
            <div>
              <div style="font-weight:700">📊 Open Reinvestment Dashboard</div>
              <div style="font-size:11px;color:var(--text3)">Split across opportunities, view compounding pipeline & milestones</div>
            </div>
          </button>
        </div>
      `,
      actions: [
        { label: 'Decide Later', className: 'btn-outline', onClick: () => { App.ui.close(); if (onDone) onDone(); } },
      ],
      onMount: (modal) => {
        App.utils.qs('#btnReinvestNewDeal', modal)?.addEventListener('click', () => {
          App.ui.close();
          openDealWizard({
            invested_amount: returnedAmount,
            principal_amount: returnedAmount,
            original_principal: returnedAmount,
            notes: `Reinvested from matured deal: ${deal.deal_name}`,
          });
        });
        App.utils.qs('#btnKeepLiquidCash', modal)?.addEventListener('click', () => {
          App.ui.close();
          App.utils.toast('Principal preserved as liquid cash reserve');
          if (onDone) onDone();
        });
        App.utils.qs('#btnGoToReinvestments', modal)?.addEventListener('click', () => {
          App.ui.close();
          App.router.navigate('reinvestments');
        });
      },
    });
  }

  // =========================================================================
  // AUDITED DEAL EXTENSION MODAL
  // =========================================================================
  function openExtendDealModal(deal, onDone) {
    const currentPrn = Number(deal.current_principal != null ? deal.current_principal : deal.invested_amount) || 0;
    const oldMaturity = deal.maturity_date || App.utils.todayISO();
    const history = Array.isArray(deal.extensions_history) ? deal.extensions_history : [];

    function addMonthsToDate(dateStr, months) {
      const d = new Date(dateStr);
      d.setMonth(d.getMonth() + months);
      return App.utils.toISO(d);
    }

    const historyHtml = history.length ? `
      <div style="margin-top:14px;border:1px solid var(--border2);border-radius:8px;padding:10px;background:var(--fill-1)">
        <div style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;margin-bottom:6px">Prior Extension Audit Log (${history.length})</div>
        <div style="font-size:11px;color:var(--text2);display:flex;flex-direction:column;gap:4px">
          ${history.map((h) => `
            <div>• ${App.utils.fmtDate(h.extended_at?.slice(0, 10))}: Extended from ${App.utils.fmtDate(h.previous_maturity)} to <strong>${App.utils.fmtDate(h.new_maturity)}</strong> (+${h.months_added}M) — <em>${App.utils.escapeHtml(h.reason || 'Tenure extended')}</em></div>
          `).join('')}
        </div>
      </div>
    ` : '';

    App.ui.open({
      title: `⏱️ Extend Deal Tenure — ${App.utils.escapeHtml(deal.deal_name)}`,
      bodyHtml: `
        <div style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;color:var(--text2)">Current Maturity Date:</span>
            <strong style="color:var(--gold)">${App.utils.fmtDate(oldMaturity)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;color:var(--text2)">Outstanding Principal:</span>
            <strong style="color:var(--text)">${App.utils.fmtMoney(currentPrn)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:12px;color:var(--text2)">Extension Count:</span>
            <strong style="color:var(--teal)">${deal.extension_count || 0} previous extension(s)</strong>
          </div>
        </div>

        <div style="font-size:12px;color:var(--text2);margin-bottom:8px">Quick Tenure Additions:</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          <button type="button" class="btn btn-outline btn-sm" id="btnExt1M">+1 Month</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnExt3M">+3 Months</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnExt4M">+4 Months</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnExt6M">+6 Months</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnExt1Y">+1 Year</button>
        </div>

        <div class="field" style="margin-bottom:12px">
          <label>New Maturity Date</label>
          <input type="date" id="extNewMaturityDate" value="${addMonthsToDate(oldMaturity, 3)}">
        </div>

        <div class="field" style="margin-bottom:12px">
          <label>Reason / Agreement Notes</label>
          <input type="text" id="extReason" placeholder="e.g. Borrower requested 4-month extension at 1.7% monthly interest">
        </div>

        <div style="font-size:11.5px;color:var(--text3);padding:8px 12px;background:var(--fill-1);border-radius:6px">
          🔒 <strong>Non-Destructive Extension:</strong> All previous schedule rows and settled payments are permanently preserved. Future installments will be generated for the added period against the remaining outstanding principal.
        </div>
        ${historyHtml}
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        { label: 'Confirm Extension', className: 'btn-gold', onClick: async () => {
          const newMat = App.utils.qs('#extNewMaturityDate')?.value;
          const reason = App.utils.qs('#extReason')?.value?.trim();
          if (!newMat) {
            App.utils.toast('Please select a new maturity date', 'err');
            return;
          }
          if (newMat <= oldMaturity) {
            App.utils.toast('New maturity date must be after current maturity date', 'err');
            return;
          }
          try {
            await App.api.extendDeal(deal.id, newMat, reason || 'Deal tenure extended');
            App.utils.toast('Deal extended successfully! Future schedule updated.');
            App.ui.close();
            if (onDone) onDone();
          } catch (e) {
            App.utils.toast('Could not extend deal: ' + (e.message || e), 'err');
          }
        }},
      ],
      onMount: (modal) => {
        const input = App.utils.qs('#extNewMaturityDate', modal);
        App.utils.qs('#btnExt1M', modal)?.addEventListener('click', () => { input.value = addMonthsToDate(oldMaturity, 1); });
        App.utils.qs('#btnExt3M', modal)?.addEventListener('click', () => { input.value = addMonthsToDate(oldMaturity, 3); });
        App.utils.qs('#btnExt4M', modal)?.addEventListener('click', () => { input.value = addMonthsToDate(oldMaturity, 4); });
        App.utils.qs('#btnExt6M', modal)?.addEventListener('click', () => { input.value = addMonthsToDate(oldMaturity, 6); });
        App.utils.qs('#btnExt1Y', modal)?.addEventListener('click', () => { input.value = addMonthsToDate(oldMaturity, 12); });
      },
    });
  }

  // =========================================================================
  // 1-CLICK PAYMENT AUTO-RECONCILIATION MODAL
  // =========================================================================
  function openAutoReconcileModal(allDeals, schedule, payments, onDone) {
    const today = App.utils.todayISO();
    const dealsById = {};
    (allDeals || []).forEach((d) => { dealsById[d.id] = d; });

    const dueSchedules = (schedule || []).filter((s) => {
      return ['UPCOMING', 'DUE_TODAY', 'OVERDUE'].includes(s.status) && s.scheduled_date <= today;
    }).sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));

    if (!dueSchedules.length) {
      App.ui.modal({
        title: '⚡ 1-Click Auto-Reconciliation',
        content: `
          <div style="text-align:center;padding:24px 12px">
            <div style="font-size:36px;margin-bottom:8px">🎉</div>
            <h3 style="margin:0 0 6px 0;color:var(--text)">All Payments Fully Reconciled</h3>
            <p style="color:var(--text2);font-size:13px;max-width:420px;margin:0 auto">
              There are no pending or overdue scheduled payouts up to today (${App.utils.fmtDate(today)}). Your portfolio payment tracking is 100% up to date.
            </p>
          </div>
        `,
        actions: [{ label: 'Close', primary: true, onClick: () => App.ui.close() }]
      });
      return;
    }

    const totalDue = dueSchedules.reduce((sum, s) => sum + Number(s.expected_total || 0), 0);
    const totalPrn = dueSchedules.reduce((sum, s) => sum + Number(s.expected_principal || 0), 0);
    const totalInt = dueSchedules.reduce((sum, s) => sum + Number(s.expected_interest || 0), 0);

    App.ui.modal({
      title: '⚡ 1-Click Payment Auto-Reconciliation & Confirmation',
      content: `
        <div style="margin-bottom:12px">
          <div style="font-size:12.5px;color:var(--text2);line-height:1.5;margin-bottom:10px">
            Found <strong style="color:var(--gold)">${dueSchedules.length}</strong> scheduled payouts due on or before today totaling <strong style="color:var(--gold)">${App.utils.fmtMoney(totalDue)}</strong> (Interest: ${App.utils.fmtMoney(totalInt)}, Principal: ${App.utils.fmtMoney(totalPrn)}). Select payments verified in your bank account to auto-confirm in 1 click.
          </div>
          <div style="display:flex;gap:12px;margin-bottom:12px;background:var(--fill-1);padding:10px;border-radius:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:140px">
              <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">Confirmation Method</label>
              <select id="autoRecMethod" class="search-input" style="width:100%;font-size:12px">
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
                <option value="Platform Wallet">Platform Wallet / Auto-Credit</option>
              </select>
            </div>
            <div style="flex:1;min-width:140px">
              <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">Receipt Date</label>
              <input type="date" id="autoRecDate" class="search-input" style="width:100%;font-size:12px" value="${today}">
            </div>
            <div style="flex:1.2;min-width:180px">
              <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">Reference Prefix</label>
              <input type="text" id="autoRecRef" class="search-input" style="width:100%;font-size:12px" placeholder="e.g. Bank Statement Payouts" value="Verified Bank Payout">
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:12px;font-weight:700;color:var(--text)">Select Schedules to Reconcile:</div>
            <button type="button" class="btn btn-xs btn-outline" id="autoRecToggleAll">Toggle All</button>
          </div>
          <div class="table-scroll" style="max-height:280px;overflow-y:auto;border:1px solid var(--border2);border-radius:6px">
            <table class="data" style="font-size:12px">
              <thead><tr><th style="width:36px"><input type="checkbox" id="autoRecMasterCb" checked></th><th>Scheduled</th><th>Deal</th><th>Type</th><th>Interest</th><th>Principal</th><th>Total</th></tr></thead>
              <tbody>
                ${dueSchedules.map((s) => {
                  const deal = dealsById[s.deal_id] || {};
                  const isPrn = Number(s.expected_principal || 0) > 0;
                  return `
                    <tr style="${isPrn ? 'background:rgba(16,185,129,0.03);' : ''}">
                      <td><input type="checkbox" class="auto-rec-item-cb" data-sched-id="${s.id}" checked></td>
                      <td>${App.utils.fmtDate(s.scheduled_date)}</td>
                      <td>
                        <strong>${App.utils.escapeHtml(deal.deal_name || 'Deal #' + s.deal_id)}</strong>
                        ${deal.external_deal_id ? `<div style="font-size:10px;color:var(--text3)">${App.utils.escapeHtml(deal.external_deal_id)}</div>` : ''}
                      </td>
                      <td>${isPrn ? '<span class="badge" style="background:rgba(16,185,129,0.15);color:#047857">Principal</span>' : '<span class="badge" style="background:rgba(217,119,6,0.12);color:#b45309">Interest</span>'}</td>
                      <td>${Number(s.expected_interest || 0) > 0 ? App.utils.fmtMoney(s.expected_interest) : '—'}</td>
                      <td>${isPrn ? `<strong>${App.utils.fmtMoney(s.expected_principal)}</strong>` : '—'}</td>
                      <td><strong>${App.utils.fmtMoney(s.expected_total)}</strong></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', onClick: () => App.ui.close() },
        {
          label: '⚡ Reconcile & Mark Received',
          primary: true,
          onClick: async () => {
            const method = App.utils.qs('#autoRecMethod')?.value || 'Bank Transfer';
            const date = App.utils.qs('#autoRecDate')?.value || today;
            const ref = App.utils.qs('#autoRecRef')?.value || 'Verified Bank Payout';
            const checkedBoxes = Array.from(document.querySelectorAll('.auto-rec-item-cb:checked'));

            if (!checkedBoxes.length) {
              App.utils.toast('Please select at least one schedule to reconcile', 'err');
              return;
            }

            const schedIdsToProcess = new Set(checkedBoxes.map((cb) => Number(cb.dataset.schedId)));
            const selectedItems = dueSchedules.filter((s) => schedIdsToProcess.has(s.id));

            try {
              let count = 0;
              for (const item of selectedItems) {
                const totalAmt = Number(item.expected_total || 0);
                const intAmt = Number(item.expected_interest || 0);
                const prnAmt = Number(item.expected_principal || 0);
                await App.api.recordPayment({
                  dealId: item.deal_id,
                  scheduledPaymentId: item.id,
                  amount: totalAmt,
                  interestAmount: intAmt,
                  principalAmount: prnAmt,
                  transactionDate: date,
                  paymentMode: method,
                  confirmationMethod: method,
                  paymentReference: `${ref} (${item.scheduled_date})`,
                  notes: 'Auto-reconciled via Deal Control Center'
                });
                count++;
              }
              App.ui.close();
              App.utils.toast(`Successfully reconciled ${count} payment(s)!`);
              if (onDone) onDone();
            } catch (err) {
              App.utils.toast('Reconciliation error: ' + (err.message || err), 'err');
            }
          }
        }
      ],
      onMount: (modal) => {
        const masterCb = App.utils.qs('#autoRecMasterCb', modal);
        const itemCbs = App.utils.qsa('.auto-rec-item-cb', modal);
        const toggleBtn = App.utils.qs('#autoRecToggleAll', modal);

        masterCb?.addEventListener('change', (e) => {
          itemCbs.forEach((cb) => { cb.checked = e.target.checked; });
        });

        toggleBtn?.addEventListener('click', () => {
          const anyChecked = Array.from(itemCbs).some((cb) => cb.checked);
          itemCbs.forEach((cb) => { cb.checked = !anyChecked; });
          if (masterCb) masterCb.checked = !anyChecked;
        });
      }
    });
  }

  // =========================================================================
  // SMART WHATSAPP PAYMENT REMINDERS MODAL
  // =========================================================================
  function openWhatsAppRemindersModal(allDeals, schedule) {
    const today = App.utils.todayISO();
    const dealsById = {};
    (allDeals || []).forEach((d) => { dealsById[d.id] = d; });

    const in14Days = new Date(new Date().getTime() + 14 * 86400000).toISOString().slice(0, 10);

    const targetSchedules = (schedule || []).filter((s) => {
      return ['UPCOMING', 'DUE_TODAY', 'OVERDUE'].includes(s.status) && s.scheduled_date <= in14Days;
    }).sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));

    const dealMap = new Map();
    targetSchedules.forEach((s) => {
      if (!dealMap.has(s.deal_id)) dealMap.set(s.deal_id, []);
      dealMap.get(s.deal_id).push(s);
    });

    if (!dealMap.size) {
      App.ui.modal({
        title: '📲 WhatsApp Payment Reminders',
        content: `
          <div style="text-align:center;padding:24px 12px">
            <div style="font-size:36px;margin-bottom:8px">💬</div>
            <h3 style="margin:0 0 6px 0;color:var(--text)">No Follow-Ups Needed</h3>
            <p style="color:var(--text2);font-size:13px;max-width:420px;margin:0 auto">
              There are no upcoming payouts due in the next 14 days or overdue schedules. All accounts are current.
            </p>
          </div>
        `,
        actions: [{ label: 'Close', primary: true, onClick: () => App.ui.close() }]
      });
      return;
    }

    App.ui.modal({
      title: '📲 Smart WhatsApp Payment Follow-Up Generator',
      content: `
        <div style="margin-bottom:12px">
          <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px">
            Found <strong style="color:var(--gold)">${dealMap.size}</strong> deal(s) with payouts due or overdue. Click below to copy or directly launch WhatsApp with formatted messages.
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;max-height:380px;overflow-y:auto;padding-right:4px">
            ${Array.from(dealMap.entries()).map(([dealId, scheds]) => {
              const deal = dealsById[dealId] || {};
              const totalDue = scheds.reduce((sum, s) => sum + Number(s.expected_total || 0), 0);
              const hasPrn = scheds.some((s) => Number(s.expected_principal || 0) > 0);
              const earliestDate = scheds[0].scheduled_date;
              const isOverdue = earliestDate < today;

              const counterparty = deal.counterparty_name || deal.platform_name || 'Borrower / Partner';
              const phone = deal.borrower_contact_phone || deal.counterparty_phone || '';

              const msgText = `Hello ${counterparty}, regarding our investment in "${deal.deal_name}"${deal.external_deal_id ? ` (ID: ${deal.external_deal_id})` : ''}: a scheduled payout of ${App.utils.fmtMoney(totalDue)} (${hasPrn ? 'Principal Return & Interest' : 'Interest'}) is ${isOverdue ? 'past due since ' + App.utils.fmtDate(earliestDate) : 'due on ' + App.utils.fmtDate(earliestDate)}. Kindly confirm payment status and dispatch reference once processed. Thank you!`;

              const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
              const waUrl = cleanPhone
                ? `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${encodeURIComponent(msgText)}`
                : `https://wa.me/?text=${encodeURIComponent(msgText)}`;

              return `
                <div style="border:1px solid var(--border2);border-radius:8px;padding:12px;background:var(--card)">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:8px">
                    <div>
                      <strong style="font-size:13.5px;color:var(--text)">${App.utils.escapeHtml(deal.deal_name || 'Deal #' + dealId)}</strong>
                      <div style="font-size:11px;color:var(--text3)">
                        Counterparty: <strong style="color:var(--text2)">${App.utils.escapeHtml(counterparty)}</strong> ${phone ? `(${phone})` : ''}
                      </div>
                    </div>
                    <div style="text-align:right">
                      <div style="font-size:15px;font-weight:700;color:var(--gold);font-family:'Cormorant Garamond',serif">${App.utils.fmtMoney(totalDue)}</div>
                      <span class="badge ${isOverdue ? 'st-missed' : 'st-upcoming'}">${isOverdue ? 'Overdue' : 'Due ' + App.utils.fmtDate(earliestDate)}</span>
                    </div>
                  </div>
                  <div style="background:var(--fill-1);border-radius:6px;padding:8px 10px;font-size:11.5px;color:var(--text);margin-bottom:8px;white-space:pre-wrap;border-left:3px solid #25D366">
${App.utils.escapeHtml(msgText)}
                  </div>
                  <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" class="btn btn-xs btn-outline btn-copy-wa" data-msg="${encodeURIComponent(msgText)}">📋 Copy Message</button>
                    <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-teal" style="background:#25D366;color:#fff;border-color:#25D366;text-decoration:none">📲 Open WhatsApp</a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `,
      actions: [{ label: 'Close', primary: true, onClick: () => App.ui.close() }],
      onMount: (modal) => {
        App.utils.qsa('.btn-copy-wa', modal).forEach((btn) => {
          btn.addEventListener('click', () => {
            const text = decodeURIComponent(btn.dataset.msg);
            navigator.clipboard.writeText(text).then(() => {
              App.utils.toast('WhatsApp message copied to clipboard!');
            }).catch(() => {
              prompt('Copy WhatsApp message:', text);
            });
          });
        });
      }
    });
  }

  // =========================================================================
  // AI PORTFOLIO DIAGNOSTIC & ACTION AUDIT MODAL
  // =========================================================================
  function openAiDealAuditModal(allDeals, metrics, schedule, payments, onDone) {
    const today = App.utils.todayISO();
    const activeDeals = (allDeals || []).filter((d) => d.status === 'ACTIVE');

    const metricsById = {};
    (metrics || []).forEach((m) => { metricsById[m.deal_id] = m; });

    const fullyRepaidDeals = activeDeals.filter((d) => {
      const prnRet = (metricsById[d.id] || {}).principal_returned || 0;
      const inv = Number(d.invested_amount || 0);
      return inv > 0 && prnRet >= inv;
    });

    const pastMaturityDeals = activeDeals.filter((d) => d.maturity_date && d.maturity_date < today);

    const next30Days = new Date(new Date().getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const maturingSoonDeals = activeDeals.filter((d) => d.maturity_date && d.maturity_date >= today && d.maturity_date <= next30Days);

    const overdueSchedules = (schedule || []).filter((s) => s.status === 'OVERDUE');

    const totalInvested = activeDeals.reduce((sum, d) => sum + Number(d.current_principal != null ? d.current_principal : d.invested_amount || 0), 0);
    const platformMap = {};
    activeDeals.forEach((d) => {
      const p = d.platform_name || 'Direct';
      platformMap[p] = (platformMap[p] || 0) + Number(d.current_principal != null ? d.current_principal : d.invested_amount || 0);
    });

    const highConcentrations = Object.entries(platformMap)
      .map(([name, amt]) => ({ name, amt, pct: totalInvested > 0 ? (amt / totalInvested) * 100 : 0 }))
      .filter((p) => p.pct > 35);

    App.ui.modal({
      title: '🧠 AI Portfolio Diagnostic & Action Audit',
      content: `
        <div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:12px;background:var(--fill-1);border-radius:8px;padding:12px;margin-bottom:14px">
            <div style="font-size:28px">🤖</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:700;color:var(--text)">Live Portfolio Intelligence Engine</div>
              <div style="font-size:11.5px;color:var(--text2)">
                Scanned ${activeDeals.length} active deals, ${schedule.length} scheduled payments, and ${payments.length} ledger receipts.
              </div>
            </div>
            <button type="button" class="btn btn-xs btn-gold" id="btnAskCopilotDirect">💬 Open Copilot</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;padding-right:4px">
            ${fullyRepaidDeals.length ? `
              <div style="border:1px solid rgba(16,185,129,0.3);background:rgba(16,185,129,0.04);border-radius:8px;padding:10px 12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <span style="font-size:12.5px;font-weight:700;color:#047857">✅ 1-Click Auto-Close Candidates (${fullyRepaidDeals.length})</span>
                </div>
                <div style="font-size:11.5px;color:var(--text2);margin-bottom:8px">
                  The following deals have 100% of their principal repaid in the ledger, but are still marked ACTIVE.
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  ${fullyRepaidDeals.map((d) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--card);padding:6px 10px;border-radius:6px;border:1px solid var(--border2)">
                      <div>
                        <strong style="font-size:12px">${App.utils.escapeHtml(d.deal_name)}</strong>
                        <span style="font-size:11px;color:var(--text3);margin-left:6px">Invested: ${App.utils.fmtMoney(d.invested_amount)}</span>
                      </div>
                      <button type="button" class="btn btn-xs btn-teal" data-auto-close-deal="${d.id}">Close & Archive</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${pastMaturityDeals.length ? `
              <div style="border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.04);border-radius:8px;padding:10px 12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <span style="font-size:12.5px;font-weight:700;color:#dc2626">⚠️ Past-Maturity Capital Recovery Required (${pastMaturityDeals.length})</span>
                </div>
                <div style="font-size:11.5px;color:var(--text2);margin-bottom:8px">
                  Maturity date elapsed without dual settlement or tenure extension.
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  ${pastMaturityDeals.map((d) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--card);padding:6px 10px;border-radius:6px;border:1px solid var(--border2)">
                      <div>
                        <strong style="font-size:12px">${App.utils.escapeHtml(d.deal_name)}</strong>
                        <span style="font-size:11px;color:#dc2626;margin-left:6px">Matured ${App.utils.fmtDate(d.maturity_date)}</span>
                      </div>
                      <div style="display:flex;gap:6px">
                        <button type="button" class="btn btn-xs btn-gold" data-audit-settle="${d.id}">Settle</button>
                        <button type="button" class="btn btn-xs btn-outline" data-audit-extend="${d.id}">Extend</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${overdueSchedules.length ? `
              <div style="border:1px solid rgba(217,119,6,0.3);background:rgba(217,119,6,0.04);border-radius:8px;padding:10px 12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <span style="font-size:12.5px;font-weight:700;color:#b45309">⏱️ Overdue Payout Follow-Ups (${overdueSchedules.length})</span>
                  <button type="button" class="btn btn-xs btn-outline" id="btnAuditOpenWhatsApp">Launch WhatsApp Reminders</button>
                </div>
                <div style="font-size:11.5px;color:var(--text2)">
                  ${overdueSchedules.length} scheduled payout(s) are past due date. Total overdue: <strong style="color:var(--gold)">${App.utils.fmtMoney(overdueSchedules.reduce((s, x) => s + Number(x.expected_total || 0), 0))}</strong>.
                </div>
              </div>
            ` : ''}

            ${highConcentrations.length ? `
              <div style="border:1px solid var(--border2);background:var(--card);border-radius:8px;padding:10px 12px">
                <div style="font-size:12.5px;font-weight:700;color:var(--gold);margin-bottom:4px">🏢 Platform Concentration Notice</div>
                <div style="font-size:11.5px;color:var(--text2)">
                  ${highConcentrations.map((p) => `<strong>${App.utils.escapeHtml(p.name)}</strong> accounts for <strong>${p.pct.toFixed(1)}%</strong> of your total invested capital (${App.utils.fmtMoney(p.amt)}). Consider diversifying future maturities.`).join('<br>')}
                </div>
              </div>
            ` : ''}

            <div style="border:1px solid var(--border2);background:var(--fill-1);border-radius:8px;padding:10px 12px">
              <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">💡 AI Reinvestment & Yield Guidance</div>
              <div style="font-size:11.5px;color:var(--text2);line-height:1.5">
                Upcoming 30-day liquidity: <strong>${App.utils.fmtMoney(maturingSoonDeals.reduce((sum, d) => sum + Number(d.current_principal != null ? d.current_principal : d.invested_amount || 0), 0))}</strong> maturing across ${maturingSoonDeals.length} deal(s). Route principal returns to high-conviction opportunities to prevent idle cash drag.
              </div>
            </div>
          </div>
        </div>
      `,
      actions: [{ label: 'Close', primary: true, onClick: () => App.ui.close() }],
      onMount: (modal) => {
        App.utils.qs('#btnAskCopilotDirect', modal)?.addEventListener('click', () => {
          App.ui.close();
          if (App.chatbot && App.chatbot.ask) {
            App.chatbot.ask('Analyze my portfolio risk, upcoming maturities, and recommend reinvestment strategies.');
          } else {
            App.router.navigate('aicopilot');
          }
        });

        App.utils.qs('#btnAuditOpenWhatsApp', modal)?.addEventListener('click', () => {
          App.ui.close();
          openWhatsAppRemindersModal(allDeals, schedule);
        });

        App.utils.qsa('[data-auto-close-deal]', modal).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.autoCloseDeal);
            try {
              await App.api.updateDeal(id, { status: 'CLOSED', notes: 'Closed via AI Control Center Audit (100% principal returned)' });
              App.utils.toast('Deal closed and archived successfully');
              App.ui.close();
              if (onDone) onDone();
            } catch (e) {
              App.utils.toast('Could not close deal: ' + (e.message || e), 'err');
            }
          });
        });

        App.utils.qsa('[data-audit-settle]', modal).forEach((btn) => {
          btn.addEventListener('click', () => {
            const deal = allDeals.find((d) => d.id === Number(btn.dataset.auditSettle));
            if (deal) {
              App.ui.close();
              openMaturitySettlementModal(deal, onDone);
            }
          });
        });

        App.utils.qsa('[data-audit-extend]', modal).forEach((btn) => {
          btn.addEventListener('click', () => {
            const deal = allDeals.find((d) => d.id === Number(btn.dataset.auditExtend));
            if (deal) {
              App.ui.close();
              openExtendDealModal(deal, onDone);
            }
          });
        });
      }
    });
  }

  // =========================================================================
  // FAST TENURE ROLLOVER ASSISTANT MODAL
  // =========================================================================
  function openBulkRolloverModal(allDeals, onDone) {
    const activeDeals = (allDeals || []).filter((d) => d.status === 'ACTIVE');
    if (!activeDeals.length) {
      App.utils.toast('No active deals available for extension', 'err');
      return;
    }

    App.ui.modal({
      title: '⏱️ Fast Deal Tenure Rollover Assistant',
      content: `
        <div style="margin-bottom:12px">
          <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">
            Select an active deal to calculate and grant an audited tenure extension with updated maturity dates.
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">Select Deal</label>
            <select id="rolloverDealSelect" class="search-input" style="width:100%;font-size:12.5px">
              ${activeDeals.map((d) => `
                <option value="${d.id}">${App.utils.escapeHtml(d.deal_name)} (Maturing: ${App.utils.fmtDate(d.maturity_date || '—')}, ${App.utils.fmtMoney(d.current_principal != null ? d.current_principal : d.invested_amount)})</option>
              `).join('')}
            </select>
          </div>
          <div id="rolloverDealPreview" style="background:var(--fill-1);border-radius:8px;padding:12px;margin-bottom:12px">
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', onClick: () => App.ui.close() },
        {
          label: 'Open Full Extension Wizard →',
          primary: true,
          onClick: () => {
            const select = App.utils.qs('#rolloverDealSelect');
            const dealId = Number(select?.value);
            const deal = activeDeals.find((d) => d.id === dealId);
            if (deal) {
              App.ui.close();
              openExtendDealModal(deal, onDone);
            }
          }
        }
      ],
      onMount: (modal) => {
        const select = App.utils.qs('#rolloverDealSelect', modal);
        const preview = App.utils.qs('#rolloverDealPreview', modal);

        function updatePreview() {
          const dealId = Number(select?.value);
          const deal = activeDeals.find((d) => d.id === dealId);
          if (!deal || !preview) return;
          const prn = Number(deal.current_principal != null ? deal.current_principal : deal.invested_amount) || 0;
          preview.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:var(--text2);font-size:12px">Current Principal:</span>
              <strong style="color:var(--gold);font-size:13px">${App.utils.fmtMoney(prn)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:var(--text2);font-size:12px">Current Maturity:</span>
              <strong style="color:var(--text);font-size:12px">${App.utils.fmtDate(deal.maturity_date)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:var(--text2);font-size:12px">Annual ROI:</span>
              <strong style="color:var(--teal);font-size:12px">${deal.annual_roi || 0}% p.a.</strong>
            </div>
            <div style="margin-top:8px;font-size:11.5px;color:var(--text3)">
              💡 Click below to customize new tenure duration, adjust interest rate bonus, and regenerate payout schedules.
            </div>
          `;
        }

        select?.addEventListener('change', updatePreview);
        updatePreview();
      }
    });
  }

  // =========================================================================
  // DEAL DETAILS MODAL WITH LIFECYCLE STEPPER & MATURITY ACTIONS
  // =========================================================================
  async function openDealDetail(dealId) {
    const [deal, metricsAll, schedule, payments, documents] = await Promise.all([
      App.api.getDeal(dealId),
      App.api.listDealMetrics(),
      App.api.listSchedule({ eq: { deal_id: dealId } }),
      App.api.listPayments({ eq: { deal_id: dealId } }),
      App.api.listDocuments({ eq: { deal_id: dealId } }),
    ]);
    const metrics = metricsAll.find((m) => m.deal_id === dealId) || {};
    const opStatus = getDealOperationalStatus(deal, metrics, schedule);

    const whatsappHtml = deal.whatsapp_group ? `
      <div style="grid-column:1 / -1;display:flex;justify-content:space-between;align-items:center;background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.3);border-radius:8px;padding:10px 14px;margin-top:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">💬</span>
          <div>
            <div style="font-size:12px;font-weight:700;color:#25D366">WhatsApp Group</div>
            <div style="font-size:12px;color:var(--text)">${App.utils.escapeHtml(deal.whatsapp_group)}</div>
          </div>
        </div>
        <a href="${formatWhatsAppUrl(deal.whatsapp_group)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="background:#25D366;color:#000;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:6px;display:inline-flex;align-items:center;gap:6px">
          <span>Open Group</span> ↗
        </a>
      </div>` : '';

    // Lifecycle Visual Stepper
    const totalInstallments = schedule.length;
    const paidInstallments = schedule.filter((s) => ['RECEIVED_ON_TIME', 'RECEIVED_EARLY', 'RECEIVED_LATE'].includes(s.status)).length;
    const currentPrn = Number(deal.current_principal != null ? deal.current_principal : deal.invested_amount) || 0;
    const isMatured = deal.maturity_date && deal.maturity_date <= App.utils.todayISO();

    const stepperVisualHtml = `
      <div class="lifecycle-stepper">
        <div class="lifecycle-step completed">
          <div class="lifecycle-dot">✓</div>
          <div class="lifecycle-title">Deployed</div>
          <div class="lifecycle-sub">${App.utils.fmtDate(deal.start_date)}</div>
        </div>
        <div class="lifecycle-step ${paidInstallments > 0 ? (paidInstallments === totalInstallments ? 'completed' : 'active') : ''}">
          <div class="lifecycle-dot">${paidInstallments > 0 ? '₹' : '2'}</div>
          <div class="lifecycle-title">Interest Installments</div>
          <div class="lifecycle-sub">${paidInstallments} of ${totalInstallments} Paid</div>
        </div>
        <div class="lifecycle-step ${deal.status === 'CLOSED' ? 'completed' : (isMatured ? 'active' : '')}">
          <div class="lifecycle-dot">${deal.status === 'CLOSED' ? '✓' : '🏁'}</div>
          <div class="lifecycle-title">Maturity Settlement</div>
          <div class="lifecycle-sub">${App.utils.fmtDate(deal.maturity_date)}</div>
        </div>
      </div>
    `;

    // Maturity Action Card (if matured or nearing maturity and principal is pending)
    const maturityActionCardHtml = (currentPrn > 0 && isMatured) ? `
      <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:12px 16px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--gold)">🏁 Final Maturity Reached — Action Required</div>
            <div style="font-size:11.5px;color:var(--text2)">Outstanding principal of <strong>${App.utils.fmtMoney(currentPrn)}</strong> is awaiting settlement or tenure extension.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-gold btn-sm" id="btnDetailSettleMaturity">💰 Confirm Payment</button>
            <button class="btn btn-outline btn-sm" id="btnDetailExtendDeal">⏱️ Extend Deal</button>
          </div>
        </div>
      </div>
    ` : '';

    // Extension history audit box
    const historyEntries = Array.isArray(deal.extensions_history) ? deal.extensions_history : [];
    const extensionAuditHtml = historyEntries.length ? `
      <div style="grid-column:1 / -1;background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;padding:10px 14px;margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;margin-bottom:6px">Tenure Extension History (${historyEntries.length})</div>
        <div style="font-size:11.5px;color:var(--text2);display:flex;flex-direction:column;gap:4px">
          ${historyEntries.map((h) => `
            <div>• ${App.utils.fmtDate(h.extended_at?.slice(0, 10))}: Extended from ${App.utils.fmtDate(h.previous_maturity)} to <strong>${App.utils.fmtDate(h.new_maturity)}</strong> (+${h.months_added}M) — <em>${App.utils.escapeHtml(h.reason || 'Tenure extended')}</em></div>
          `).join('')}
        </div>
      </div>
    ` : '';

    const rateDisplay = deal.interest_rate_basis === 'Monthly' && deal.monthly_roi
      ? `${deal.monthly_roi}% / month (${App.utils.fmtPct(deal.annual_roi)} p.a.)`
      : `${App.utils.fmtPct(deal.annual_roi)} (${deal.interest_rate_basis || 'Annual'})`;

    const overviewHtml = `
      ${maturityActionCardHtml}
      ${stepperVisualHtml}
      <div class="grid-2">
        <div>
          <div class="stat-line"><span>Invested Amount</span><span class="v">${App.utils.fmtMoney(deal.invested_amount)}</span></div>
          <div class="stat-line"><span>Interest Rate</span><span class="v" style="font-size:14px">${rateDisplay}</span></div>
          <div class="stat-line"><span>Calculation</span><span class="v" style="font-size:13px">${deal.interest_calculation || 'Simple'}</span></div>
          <div class="stat-line"><span>Start Date</span><span class="v">${App.utils.fmtDate(deal.start_date)}</span></div>
          <div class="stat-line"><span>Maturity Date</span><span class="v">${App.utils.fmtDate(deal.maturity_date)}</span></div>
          <div class="stat-line"><span>Original Maturity</span><span class="v">${deal.original_maturity_date ? App.utils.fmtDate(deal.original_maturity_date) : 'Original'}</span></div>
        </div>
        <div>
          <div class="stat-line"><span>Operational Status</span><span class="badge ${opStatus.cls}">${opStatus.label}</span></div>
          <div class="stat-line"><span>Outstanding Principal</span><span class="v">${App.utils.fmtMoney(metrics.total_outstanding ?? currentPrn)}</span></div>
          <div class="stat-line"><span>Platform</span><span class="v">${App.utils.escapeHtml(App.lookups.platformName(deal.platform_id))}</span></div>
          <div class="stat-line"><span>Payment Frequency</span><span class="v">${deal.payment_frequency || '—'}</span></div>
          <div class="stat-line"><span>Principal Repayment</span><span class="v">${deal.principal_repayment_timing || 'At Maturity'}</span></div>
          <div class="stat-line"><span>Extensions</span><span class="v">${deal.extension_count || 0} times</span></div>
        </div>
        ${whatsappHtml}
        ${extensionAuditHtml}
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

    function buildPaymentHistoryTableHtml(currentDeal, currentSchedule, currentPayments, currentMetrics) {
      const sortedSched = (currentSchedule || []).slice().sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
      const today = App.utils.todayISO();

      // Find principal receipts
      const principalPayments = (currentPayments || []).filter((p) => !p.is_voided && Number(p.principal_amount || 0) > 0);
      const principalReturnedActual = Number(currentMetrics.principal_returned || principalPayments.reduce((acc, p) => acc + Number(p.principal_amount || 0), 0));
      const principalExpected = Number(currentDeal.invested_amount || currentDeal.current_principal || 0);

      const isPrincipalSettled = currentDeal.status === 'CLOSED' || (principalExpected > 0 && principalReturnedActual >= principalExpected);
      const isPrincipalPartial = !isPrincipalSettled && principalReturnedActual > 0;

      let totalExpectedInterest = 0;
      let totalActualInterest = 0;

      const rowsHtml = sortedSched.map((s, idx) => {
        const actual = currentPayments.find((p) => p.id === s.actual_payment_id || (p.scheduled_payment_id === s.id));
        const expInt = Number(s.expected_interest > 0 ? s.expected_interest : (s.expected_principal ? 0 : s.expected_total) || 0);
        totalExpectedInterest += expInt;

        const actAmt = actual ? Number(actual.amount || 0) : 0;
        const actInt = actual ? Number(actual.interest_amount != null ? actual.interest_amount : actAmt) : 0;
        if (actual) totalActualInterest += actInt;

        let componentLabel = `💰 Interest Installment #${idx + 1}`;
        if (s.payment_type === 'EMI' || (Number(s.expected_principal || 0) > 0 && expInt > 0)) {
          componentLabel = `⚖️ EMI #${idx + 1} (Int + Prn)`;
        }

        return `
          <tr>
            <td><strong>${App.utils.fmtDate(s.scheduled_date)}</strong></td>
            <td>
              <div style="font-weight:600">${componentLabel}</div>
              <div style="font-size:10px;color:var(--text3)">${currentDeal.payment_frequency || 'Periodic'} payout</div>
            </td>
            <td><strong>${App.utils.fmtMoney(s.expected_total)}</strong></td>
            <td><span class="badge ${App.utils.statusBadgeClass(s.status)}">${s.status}</span></td>
            <td>${actual ? App.utils.fmtDate(actual.transaction_date) : '—'}</td>
            <td>${actual ? `<strong style="color:var(--teal)">${App.utils.fmtMoney(actual.amount)}</strong>` : '—'}</td>
          </tr>
        `;
      }).join('');

      // Principal Repayment (Maturity Date) line
      let prnStatusBadge = '';
      let prnActualDate = '—';
      let prnActualAmt = '—';

      if (isPrincipalSettled) {
        prnStatusBadge = `<span class="badge badge-teal" style="font-weight:700">RECEIVED</span>`;
        prnActualDate = principalPayments.length
          ? App.utils.fmtDate(principalPayments[0].transaction_date)
          : (currentDeal.actual_exit_date ? App.utils.fmtDate(currentDeal.actual_exit_date) : App.utils.fmtDate(currentDeal.updated_at));
        prnActualAmt = `<strong style="color:var(--teal)">${App.utils.fmtMoney(principalReturnedActual || principalExpected)}</strong>`;
      } else if (isPrincipalPartial) {
        prnStatusBadge = `<span class="badge badge-amber" style="font-weight:700">PARTIAL (${Math.round((principalReturnedActual / principalExpected) * 100)}%)</span>`;
        prnActualDate = principalPayments.length ? App.utils.fmtDate(principalPayments[principalPayments.length - 1].transaction_date) : '—';
        prnActualAmt = `<strong style="color:var(--teal)">${App.utils.fmtMoney(principalReturnedActual)}</strong>`;
      } else {
        if (currentDeal.maturity_date && currentDeal.maturity_date < today) {
          prnStatusBadge = `<span class="badge badge-red" style="font-weight:700">OVERDUE</span>`;
        } else if (currentDeal.maturity_date === today) {
          prnStatusBadge = `<span class="badge badge-amber" style="font-weight:700">DUE TODAY</span>`;
        } else {
          prnStatusBadge = `<span class="badge badge-gold">UPCOMING</span>`;
        }
      }

      const principalRowHtml = `
        <tr style="background:rgba(201,168,76,0.08);border-left:3px solid var(--gold);font-weight:600">
          <td><strong style="color:var(--gold)">${App.utils.fmtDate(currentDeal.maturity_date)}</strong></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:14px">💎</span>
              <div>
                <strong style="color:var(--gold)">Principal Repayment (Maturity Date)</strong>
                <div style="font-size:10.5px;color:var(--text3)">Capital recovery at tenure maturity</div>
              </div>
            </div>
          </td>
          <td><strong style="color:var(--gold);font-size:13.5px">${App.utils.fmtMoney(principalExpected)}</strong></td>
          <td>${prnStatusBadge}</td>
          <td>${prnActualDate}</td>
          <td>${prnActualAmt}</td>
        </tr>
      `;

      // Grand Totals line
      const grandTotalExpected = totalExpectedInterest + principalExpected;
      const totalActualReceived = Number(currentMetrics.total_received || (currentPayments || []).filter((p) => !p.is_voided).reduce((acc, p) => acc + Number(p.amount || 0), 0));
      const recoveryPct = grandTotalExpected > 0 ? Math.min(100, Math.round((totalActualReceived / grandTotalExpected) * 100)) : 0;
      const totalsBadgeCls = recoveryPct >= 100 ? 'badge-teal' : (recoveryPct > 0 ? 'badge-amber' : 'badge-gray');

      const totalsFootHtml = `
        <tfoot style="background:var(--fill-2);border-top:2px solid var(--border2);font-weight:700">
          <tr style="font-size:13px">
            <td><strong style="text-transform:uppercase;letter-spacing:0.5px">TOTALS</strong></td>
            <td>
              <div style="font-size:11px;color:var(--text2);font-weight:600">
                Interest: <span style="color:var(--text)">${App.utils.fmtMoney(totalExpectedInterest)}</span> + Principal: <span style="color:var(--gold)">${App.utils.fmtMoney(principalExpected)}</span>
              </div>
            </td>
            <td><strong style="color:var(--gold);font-size:14px">${App.utils.fmtMoney(grandTotalExpected)}</strong></td>
            <td><span class="badge ${totalsBadgeCls}" style="font-weight:700">${recoveryPct}% (${recoveryPct >= 100 ? 'SETTLED' : 'RECOVERED'})</span></td>
            <td>—</td>
            <td><strong style="color:var(--teal);font-size:14px">${App.utils.fmtMoney(totalActualReceived)}</strong></td>
          </tr>
        </tfoot>
      `;

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;gap:14px;font-size:12px;color:var(--text2);flex-wrap:wrap">
            <span>Installments: <strong style="color:var(--text)">${sortedSched.length}</strong></span>
            <span>Expected Interest: <strong style="color:var(--text)">${App.utils.fmtMoney(totalExpectedInterest)}</strong></span>
            <span>Principal (Maturity): <strong style="color:var(--gold)">${App.utils.fmtMoney(principalExpected)}</strong></span>
            <span>Grand Total: <strong style="color:var(--gold)">${App.utils.fmtMoney(grandTotalExpected)}</strong></span>
          </div>
          <button id="btnSyncSchedule" class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px;display:flex;align-items:center;gap:4px">
            <span>&#128260;</span> Sync Schedule with Maturity Date
          </button>
        </div>
        <div class="table-scroll" id="dealScheduleTableWrap" style="max-height:300px">
          <table class="data">
            <thead>
              <tr>
                <th style="min-width:105px">Scheduled Date</th>
                <th style="min-width:145px">Component</th>
                <th>Expected</th>
                <th>Status</th>
                <th style="min-width:105px">Actual Date</th>
                <th>Actual Amount</th>
              </tr>
            </thead>
            <tbody id="dealScheduleTbody">
              ${rowsHtml || '<tr><td colspan="6" style="text-align:center;color:var(--text3)">No schedule installments yet</td></tr>'}
              ${principalRowHtml}
            </tbody>
            ${totalsFootHtml}
          </table>
        </div>
      `;
    }

    const historyHtml = `<div id="dealPaymentHistoryHost">${buildPaymentHistoryTableHtml(deal, schedule, payments, metrics)}</div>`;

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
        { label: '💰 Settle / Confirm', className: 'btn-gold', onClick: () => { App.ui.close(); openMaturitySettlementModal(deal, () => App.router.refreshCurrent()); } },
        { label: '⏱️ Extend Deal', className: 'btn-outline', onClick: () => { App.ui.close(); openExtendDealModal(deal, () => App.router.refreshCurrent()); } },
        { label: 'Edit', className: 'btn-outline', onClick: () => { App.ui.close(); openDealWizard(deal); } },
        { label: 'Delete', className: 'btn-outline', onClick: () => openDeleteDealModal(deal, () => App.router.refreshCurrent()) },
        { label: 'Close', className: 'btn-outline', onClick: App.ui.close },
      ],
      onMount: (body) => {
        App.utils.qsa('.tab-btn', body.parentElement).forEach((btn) => {
          btn.addEventListener('click', () => {
            App.utils.qsa('.tab-btn', body.parentElement).forEach((b) => b.classList.toggle('active', b === btn));
            App.utils.qsa('.tab-pane', body).forEach((p) => p.classList.toggle('active', p.dataset.pane === btn.dataset.tab));
          });
        });

        App.utils.qs('#btnDetailSettleMaturity', body)?.addEventListener('click', () => {
          App.ui.close();
          openMaturitySettlementModal(deal, () => App.router.refreshCurrent());
        });

        App.utils.qs('#btnDetailExtendDeal', body)?.addEventListener('click', () => {
          App.ui.close();
          openExtendDealModal(deal, () => App.router.refreshCurrent());
        });

        function attachSyncHandler() {
          const syncBtn = App.utils.qs('#btnSyncSchedule', body);
          if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
              syncBtn.disabled = true;
              syncBtn.textContent = 'Syncing...';
              try {
                await App.api.generateSchedule(deal.id);
                const [refreshedSched, refreshedPayments, refreshedMetricsAll, refreshedDeal] = await Promise.all([
                  App.api.listSchedule({ eq: { deal_id: deal.id } }),
                  App.api.listPayments({ eq: { deal_id: deal.id } }),
                  App.api.listDealMetrics(),
                  App.api.getDeal(deal.id),
                ]);
                const curMetrics = refreshedMetricsAll.find((m) => m.deal_id === deal.id) || metrics;
                const host = App.utils.qs('#dealPaymentHistoryHost', body);
                if (host) {
                  host.innerHTML = buildPaymentHistoryTableHtml(refreshedDeal || deal, refreshedSched, refreshedPayments, curMetrics);
                  attachSyncHandler();
                }
                App.utils.toast('Payment schedule synced');
              } catch (err) {
                App.utils.toast('Could not sync schedule: ' + (err.message || err), 'err');
              } finally {
                if (syncBtn) {
                  syncBtn.disabled = false;
                  syncBtn.innerHTML = '<span>&#128260;</span> Sync Schedule with Maturity Date';
                }
              }
            });
          }
        }
        attachSyncHandler();
      },
    });
  }

  let sortKey = 'created_at';
  let sortDir = 'desc';
  let statusTab = 'all'; // 'all' | 'active' | 'closed'
  let quickFilterChip = 'all'; // 'all' | 'high_yield' | 'maturing_soon' | 'secured' | 'monthly' | 'at_risk'
  let activeBucketKey = null;

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
          <textarea id="smartDealText" rows="4" placeholder="e.g. Invested 1,00,000 in Private Credit at 1.7% monthly interest on 2026-02-01 maturing 2026-07-01 with monthly payouts"></textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <div class="hint" style="margin:0">Try sample:</div>
          <button class="ai-preset-chip" id="sampleDeal1" style="font-size:10.5px">1.7% Monthly (5 Months)</button>
          <button class="ai-preset-chip" id="sampleDeal2" style="font-size:10.5px">HDFC 9.5% Bond</button>
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
          App.utils.qs('#smartDealText', modal).value = 'Invested 1,00,000 in Commercial Loan at 1.7% monthly interest on 2026-02-01 maturing 2026-07-01 with monthly interest payout and principal at maturity';
        });
        App.utils.qs('#sampleDeal2', modal)?.addEventListener('click', () => {
          App.utils.qs('#smartDealText', modal).value = 'Invested 2,00,000 in HDFC Fixed Deposit at 8.75% annual ROI on 2026-02-01 maturing 2029-02-01 with quarterly interest payout';
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
      interest_rate: null,
      interest_rate_basis: 'Monthly',
      interest_calculation: 'Simple',
      principal_repayment_timing: 'At Maturity',
      annual_roi: null,
      monthly_roi: null,
      start_date: App.utils.todayISO(),
      maturity_date: null,
      payment_frequency: 'Monthly',
      payout_type: 'Interest Only',
      investment_type: 'Fixed Income',
      collateral_available: false,
      status: 'ACTIVE',
      notes: text,
    };

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

    const roiMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:monthly|month|per month)?/i) || text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:annual|roi|interest|rate)?/i);
    if (roiMatch) {
      const val = parseFloat(roiMatch[1]);
      if (/monthly|month|per month/i.test(text)) {
        out.interest_rate = val;
        out.interest_rate_basis = 'Monthly';
        out.monthly_roi = val;
        out.annual_roi = val * 12;
      } else {
        out.interest_rate = val;
        out.interest_rate_basis = 'Annual';
        out.annual_roi = val;
        out.monthly_roi = val / 12;
      }
    }

    if (/quarterly/i.test(text)) out.payment_frequency = 'Quarterly';
    else if (/yearly|annual/i.test(text) && !/annual roi|annual rate/i.test(text)) out.payment_frequency = 'Yearly';
    else if (/half[- ]?yearly|semi[- ]?annual/i.test(text)) out.payment_frequency = 'Half-Yearly';
    else if (/at maturity|bullet/i.test(text)) out.payment_frequency = 'At Maturity';

    if (/emi/i.test(text)) out.payout_type = 'EMI';
    else if (/principal at maturity/i.test(text)) out.payout_type = 'Principal at Maturity';
    else if (/bullet/i.test(text)) out.payout_type = 'Bullet';

    if (/collateral|secured|guarantee/i.test(text)) out.collateral_available = true;

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

  // =========================================================================
  // MAIN DEALS VIEW
  // =========================================================================
  async function renderDealsView() {
    const pane = App.utils.qs('#pane-deals');

    let dealsMainTab = localStorage.getItem('pios_deals_main_tab_v2') || 'directory';
    let isControlCenterMinimized = localStorage.getItem('pios_deals_cc_minimized_v2') !== 'false'; // minimized by default

    function buildControlCenterCardsMarkup(prefix) {
      return `
        <!-- ROW 1: PRIMARY CAPITAL KPIS -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px">
          <div class="exec-kpi">
            <div class="exec-kpi-lbl">Active Deals</div>
            <div class="exec-kpi-val" id="${prefix}KpiActiveDealsCount">0</div>
            <div class="exec-kpi-sub">Performing portfolio assets</div>
          </div>
          <div class="exec-kpi" style="border-left:3px solid var(--gold)">
            <div class="exec-kpi-lbl">₹ Currently Invested</div>
            <div class="exec-kpi-val highlight" id="${prefix}KpiCurrentlyInvested">₹0</div>
            <div class="exec-kpi-sub">Outstanding principal deployed</div>
          </div>
          <div class="exec-kpi" style="border-left:3px solid var(--teal)">
            <div class="exec-kpi-lbl">Principal Returned</div>
            <div class="exec-kpi-val" style="color:var(--teal)" id="${prefix}KpiPrincipalReturned">₹0</div>
            <div class="exec-kpi-sub" id="${prefix}KpiRecoveryRateSub">Recovery Rate: <strong id="${prefix}KpiRecoveryRate" style="color:var(--teal)">0%</strong></div>
            <div style="width:100%;background:rgba(22,201,163,0.15);height:4px;border-radius:2px;margin-top:4px;overflow:hidden">
              <div id="${prefix}KpiRecoveryBar" style="width:0%;height:100%;background:var(--teal);transition:width .4s"></div>
            </div>
          </div>
          <div class="exec-kpi">
            <div class="exec-kpi-lbl">Closed Deals</div>
            <div class="exec-kpi-val" id="${prefix}KpiClosedDealsCount">0</div>
            <div class="exec-kpi-sub">Fully exited investments</div>
          </div>
        </div>

        <!-- ROW 2: ADVANCED PORTFOLIO GRIP KPIS -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">
          <div class="exec-kpi" style="border-left:3px solid #8b5cf6">
            <div class="exec-kpi-lbl">⚡ Weighted Portfolio ROI</div>
            <div class="exec-kpi-val" style="color:#8b5cf6" id="${prefix}KpiWeightedRoi">0.0%</div>
            <div class="exec-kpi-sub">Principal-weighted average yield</div>
          </div>
          <div class="exec-kpi" style="border-left:3px solid #3b82f6">
            <div class="exec-kpi-lbl">📅 Monthly Passive Run-Rate</div>
            <div class="exec-kpi-val" style="color:#3b82f6" id="${prefix}KpiMonthlyPassive">₹0</div>
            <div class="exec-kpi-sub">Projected monthly recurring return</div>
          </div>
          <div class="exec-kpi" style="border-left:3px solid #ef4444">
            <div class="exec-kpi-lbl">⚠️ Capital At-Risk / Overdue</div>
            <div class="exec-kpi-val" style="color:#ef4444" id="${prefix}KpiAtRiskPrincipal">₹0</div>
            <div class="exec-kpi-sub" id="${prefix}KpiAtRiskSub">0 overdue deals</div>
          </div>
          <div class="exec-kpi" style="border-left:3px solid #f59e0b">
            <div class="exec-kpi-lbl">🏢 Top Platform Exposure</div>
            <div class="exec-kpi-val" style="font-size:16px;color:#f59e0b" id="${prefix}KpiPlatformExposure">—</div>
            <div class="exec-kpi-sub" id="${prefix}KpiPlatformExposureSub">Concentration metric</div>
          </div>
        </div>

        <!-- ROW 3: CASH RECONCILIATION CARDS -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:14px">
          <div style="padding:12px 14px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.3);border-radius:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11.5px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:0.5px">Expected Cash Flow (Next 30 Days)</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(201,168,76,0.15);color:var(--gold)">Expected ≠ Confirmed</span>
            </div>
            <div style="font-size:22px;font-weight:700;color:var(--gold);font-family:'Cormorant Garamond',serif" id="${prefix}ExpCashTotal">₹0</div>
            <div style="display:flex;gap:16px;margin-top:4px;font-size:11.5px;color:var(--text2)">
              <span>Principal: <strong style="color:var(--text)" id="${prefix}ExpCashPrn">₹0</strong></span>
              <span>Interest: <strong style="color:var(--text)" id="${prefix}ExpCashInt">₹0</strong></span>
            </div>
          </div>

          <div style="padding:12px 14px;background:rgba(22,201,163,0.06);border:1px solid rgba(22,201,163,0.3);border-radius:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11.5px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:0.5px">Actually Confirmed Received (This Month)</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(22,201,163,0.15);color:var(--teal)">Verified in Bank</span>
            </div>
            <div style="font-size:22px;font-weight:700;color:var(--teal);font-family:'Cormorant Garamond',serif" id="${prefix}ActCashTotal">₹0</div>
            <div style="display:flex;gap:16px;margin-top:4px;font-size:11.5px;color:var(--text2)">
              <span>Principal: <strong style="color:var(--text)" id="${prefix}ActCashPrn">₹0</strong></span>
              <span>Interest: <strong style="color:var(--text)" id="${prefix}ActCashInt">₹0</strong></span>
            </div>
          </div>
        </div>

        <!-- ROW 4: AI COPILOT & AUTOMATION COMMAND BAR -->
        <div style="border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:12px 14px;background:linear-gradient(135deg, rgba(139,92,246,0.04), rgba(201,168,76,0.04));margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:12.5px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">
                <span>🤖</span> AI Copilot & Deal Automation Center
              </div>
              <div style="font-size:11px;color:var(--text3)">Execute bulk actions, WhatsApp reminders, and AI-driven portfolio audits with a single click.</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn-xs btn-gold" id="${prefix}BtnAutoReconcile" title="Bulk reconcile due payments">
                ⚡ 1-Click Auto-Reconcile
              </button>
              <button type="button" class="btn btn-xs btn-outline" id="${prefix}BtnWhatsAppReminders" title="Generate WhatsApp payment reminders">
                📲 WhatsApp Reminders
              </button>
              <button type="button" class="btn btn-xs btn-outline" id="${prefix}BtnAiAudit" title="Run full AI portfolio diagnostic">
                🧠 AI Portfolio Audit
              </button>
              <button type="button" class="btn btn-xs btn-outline" id="${prefix}BtnBulkRollover" title="Quick tenure extension assistant">
                ⏱️ Quick Rollover
              </button>
            </div>
          </div>
          <!-- Priority Action Feed -->
          <div id="${prefix}ActionItemsContainer" style="display:none;background:var(--card);border:1px solid var(--border2);border-radius:8px;padding:10px;margin-top:8px"></div>
        </div>

        <!-- ROW 5: MATURITY PIPELINE -->
        <div style="border:1px solid var(--border2);border-radius:10px;padding:12px 14px;background:var(--card)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <div>
              <span style="font-size:12.5px;font-weight:700;color:var(--gold)">🏁 Maturity Command Center & Capital Pipeline</span>
              <div style="font-size:11px;color:var(--text3)">Filter by maturity horizon to execute settlements or grant tenure extensions.</div>
            </div>
            <div id="${prefix}ActiveBucketBadge" style="font-size:11px;color:var(--text2)"></div>
          </div>
          <div class="maturity-buckets-grid" id="${prefix}MaturityBucketsGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">
          </div>
          <div id="${prefix}MaturityBucketDetailView" style="margin-top:12px;display:none;padding:10px;background:var(--fill-1);border-radius:8px"></div>
        </div>
      `;
    }

    pane.innerHTML = `
      <div class="section-title">Deal Management & Maturity Engine <div class="line"></div><small>lifecycle tracking, capital preservation & audited settlements</small></div>

      <!-- TOP VIEW TABS: DEALS DIRECTORY vs CONTROL CENTER & MATURITY PIPELINE -->
      <div class="tabbar" id="dealsMainTabs" style="margin-bottom:14px;border-bottom:1px solid var(--border2)">
        <button class="tab-btn ${dealsMainTab === 'directory' ? 'active' : ''}" data-deals-tab="directory">📁 Deals Directory</button>
        <button class="tab-btn ${dealsMainTab === 'control_center' ? 'active' : ''}" data-deals-tab="control_center">🎯 Control Center & Maturity Pipeline</button>
      </div>

      <!-- TAB 1: DEALS DIRECTORY -->
      <div id="dealsDirectorySection" style="${dealsMainTab === 'directory' ? 'display:block' : 'display:none'}">
        <!-- COMPACT SUMMARY STRIP (MINIMIZED BY DEFAULT TO PREVENT OVERWHELM & SCROLLING) -->
        <div id="ccMiniCard" style="background:var(--card);border:1px solid var(--border2);border-radius:8px;margin-bottom:14px;overflow:hidden">
          <div id="ccMiniBar" style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;background:var(--fill-1);cursor:pointer">
            <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:12px">
              <span style="font-weight:700;color:var(--gold);display:inline-flex;align-items:center;gap:5px">
                <span>⚡</span> Control Center Summary
              </span>
              <span style="color:var(--text2)">Active: <strong style="color:var(--text)" id="miniKpiActive">0</strong></span>
              <span style="color:var(--text2)">Invested: <strong style="color:var(--gold)" id="miniKpiInvested">₹0</strong></span>
              <span style="color:var(--text2)">Principal Returned: <strong style="color:var(--teal)" id="miniKpiReturned">₹0</strong></span>
              <span style="color:var(--text2)">Expected 30D Cash: <strong style="color:var(--gold)" id="miniKpiExpCash">₹0</strong></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button type="button" class="btn btn-xs btn-outline" id="btnToggleInlineCC" style="font-size:11px;display:flex;align-items:center;gap:4px">
                <span id="miniToggleIcon">${isControlCenterMinimized ? '▾' : '▴'}</span>
                <span id="miniToggleText">${isControlCenterMinimized ? 'Expand Control Center' : 'Minimize Control Center'}</span>
              </button>
              <button type="button" class="btn btn-xs btn-gold" id="btnGoToCCTab" style="font-size:11px">
                🎯 Open Dedicated Tab
              </button>
            </div>
          </div>
          <!-- Inline Expandable Panel (hidden by default when minimized) -->
          <div id="ccInlineExpand" style="${isControlCenterMinimized ? 'display:none' : 'display:block'};padding:14px;border-top:1px solid var(--border2)">
            <div id="inlineControlCenterHost">
              ${buildControlCenterCardsMarkup('inline')}
            </div>
          </div>
        </div>

        <div id="dealsFilterBar"></div>

        <!-- MAIN LIST PANEL -->
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
        </div>
      </div>

      <!-- TAB 2: DEDICATED CONTROL CENTER & MATURITY PIPELINE SHEET -->
      <div id="dealsControlCenterSection" style="${dealsMainTab === 'control_center' ? 'display:block' : 'display:none'}">
        <div class="panel" style="margin-bottom:14px;padding:12px 16px;background:var(--fill-1)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">
                <span>🏁</span> Maturity Command Center & Portfolio Control Sheet
              </div>
              <div style="font-size:12px;color:var(--text2)">Executive oversight of capital deployment, 30-day cash reconciliation, and maturity time-horizons.</div>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn btn-outline btn-sm" id="btnBackToDirectory">← Back to Deals Directory</button>
              <button type="button" class="btn btn-gold btn-sm" id="btnCCAddDeal">+ New Deal</button>
            </div>
          </div>
        </div>
        <div class="panel">
          <div id="sheetControlCenterHost">
            ${buildControlCenterCardsMarkup('sheet')}
          </div>
        </div>
      </div>
    `;

    // TAB SWITCHING LOGIC
    function switchMainDealsTab(tabKey) {
      dealsMainTab = tabKey;
      localStorage.setItem('pios_deals_main_tab_v2', tabKey);
      const isDir = tabKey === 'directory';
      const dirSec = App.utils.qs('#dealsDirectorySection', pane);
      const ccSec = App.utils.qs('#dealsControlCenterSection', pane);
      if (dirSec) dirSec.style.display = isDir ? 'block' : 'none';
      if (ccSec) ccSec.style.display = isDir ? 'none' : 'block';
      App.utils.qsa('[data-deals-tab]', pane).forEach((b) => {
        b.classList.toggle('active', b.dataset.dealsTab === tabKey);
      });
    }

    App.utils.qsa('[data-deals-tab]', pane).forEach((btn) => {
      btn.addEventListener('click', () => switchMainDealsTab(btn.dataset.dealsTab));
    });

    App.utils.qs('#btnGoToCCTab', pane)?.addEventListener('click', () => switchMainDealsTab('control_center'));
    App.utils.qs('#btnBackToDirectory', pane)?.addEventListener('click', () => switchMainDealsTab('directory'));
    App.utils.qs('#btnCCAddDeal', pane)?.addEventListener('click', () => openDealWizard(null));

    // MINIMIZE / EXPAND CONTROL CENTER INLINE
    const toggleBtn = App.utils.qs('#btnToggleInlineCC', pane);
    const inlineExpand = App.utils.qs('#ccInlineExpand', pane);
    const toggleIcon = App.utils.qs('#miniToggleIcon', pane);
    const toggleText = App.utils.qs('#miniToggleText', pane);

    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      isControlCenterMinimized = !isControlCenterMinimized;
      localStorage.setItem('pios_deals_cc_minimized_v2', isControlCenterMinimized ? 'true' : 'false');
      if (inlineExpand) inlineExpand.style.display = isControlCenterMinimized ? 'none' : 'block';
      if (toggleIcon) toggleIcon.textContent = isControlCenterMinimized ? '▾' : '▴';
      if (toggleText) toggleText.textContent = isControlCenterMinimized ? 'Expand Control Center' : 'Minimize Control Center';
    });

    App.utils.qs('#ccMiniBar', pane)?.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      toggleBtn?.click();
    });

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

    // Helper to synchronize KPI numbers, cash reconciliation and bucket cards for any host prefix
    function syncControlCenterUI(prefix, kpis, expCash, actCash, buckets, allDeals, schedule, payments, metrics) {
      const q = (id) => App.utils.qs(`#${prefix}${id}`, pane);

      if (q('KpiActiveDealsCount')) q('KpiActiveDealsCount').textContent = kpis.activeCount;
      if (q('KpiCurrentlyInvested')) q('KpiCurrentlyInvested').textContent = App.utils.fmtMoney(kpis.invested);
      if (q('KpiPrincipalReturned')) q('KpiPrincipalReturned').textContent = App.utils.fmtMoney(kpis.returned);
      if (q('KpiClosedDealsCount')) q('KpiClosedDealsCount').textContent = kpis.closedCount;

      if (q('KpiRecoveryRate')) q('KpiRecoveryRate').textContent = `${(kpis.recoveryRate || 0).toFixed(1)}%`;
      if (q('KpiRecoveryBar')) q('KpiRecoveryBar').style.width = `${Math.min(100, Math.max(0, kpis.recoveryRate || 0))}%`;

      if (q('KpiWeightedRoi')) q('KpiWeightedRoi').textContent = `${(kpis.weightedRoi || 0).toFixed(2)}% p.a.`;
      if (q('KpiMonthlyPassive')) q('KpiMonthlyPassive').textContent = App.utils.fmtMoney(kpis.monthlyPassive || 0);

      if (q('KpiAtRiskPrincipal')) q('KpiAtRiskPrincipal').textContent = App.utils.fmtMoney(kpis.atRiskPrincipal || 0);
      if (q('KpiAtRiskSub')) {
        q('KpiAtRiskSub').textContent = kpis.atRiskCount > 0
          ? `${kpis.atRiskCount} deal(s) need attention`
          : 'Zero overdue or defaulted deals';
      }

      if (q('KpiPlatformExposure')) {
        q('KpiPlatformExposure').textContent = kpis.topPlatformName !== 'None'
          ? `${kpis.topPlatformName} (${kpis.topPlatformPct.toFixed(0)}%)`
          : '—';
      }
      if (q('KpiPlatformExposureSub')) {
        q('KpiPlatformExposureSub').textContent = kpis.topPlatformAmt > 0
          ? `${App.utils.fmtMoney(kpis.topPlatformAmt)} total capital`
          : 'No concentrated counterparty';
      }

      if (q('ExpCashTotal')) q('ExpCashTotal').textContent = App.utils.fmtMoney(expCash.total);
      if (q('ExpCashPrn')) q('ExpCashPrn').textContent = App.utils.fmtMoney(expCash.prn);
      if (q('ExpCashInt')) q('ExpCashInt').textContent = App.utils.fmtMoney(expCash.int);

      if (q('ActCashTotal')) q('ActCashTotal').textContent = App.utils.fmtMoney(actCash.total);
      if (q('ActCashPrn')) q('ActCashPrn').textContent = App.utils.fmtMoney(actCash.prn);
      if (q('ActCashInt')) q('ActCashInt').textContent = App.utils.fmtMoney(actCash.int);

      // AI Automation Command Bar buttons
      const btnAutoRec = q('BtnAutoReconcile');
      if (btnAutoRec && !btnAutoRec._bound) {
        btnAutoRec._bound = true;
        btnAutoRec.addEventListener('click', () => {
          openAutoReconcileModal(allDeals, schedule, payments, () => draw());
        });
      }

      const btnWaRem = q('BtnWhatsAppReminders');
      if (btnWaRem && !btnWaRem._bound) {
        btnWaRem._bound = true;
        btnWaRem.addEventListener('click', () => {
          openWhatsAppRemindersModal(allDeals, schedule);
        });
      }

      const btnAiAudit = q('BtnAiAudit');
      if (btnAiAudit && !btnAiAudit._bound) {
        btnAiAudit._bound = true;
        btnAiAudit.addEventListener('click', () => {
          openAiDealAuditModal(allDeals, metrics, schedule, payments, () => draw());
        });
      }

      const btnRollover = q('BtnBulkRollover');
      if (btnRollover && !btnRollover._bound) {
        btnRollover._bound = true;
        btnRollover.addEventListener('click', () => {
          openBulkRolloverModal(allDeals, () => draw());
        });
      }

      // Priority Action Feed (dynamic high-signal alert bar)
      const actionBox = q('ActionItemsContainer');
      if (actionBox) {
        const alerts = [];
        if (kpis.atRiskCount > 0) {
          alerts.push(`⚠️ <strong style="color:#ef4444">${kpis.atRiskCount} deal(s)</strong> (${App.utils.fmtMoney(kpis.atRiskPrincipal)}) require settlement or tenure extension.`);
        }
        const overdueScheds = (schedule || []).filter((s) => s.status === 'OVERDUE');
        if (overdueScheds.length > 0) {
          alerts.push(`⏱️ <strong style="color:#f59e0b">${overdueScheds.length} payout(s)</strong> are past due date. Use <strong>WhatsApp Reminders</strong> to follow up.`);
        }
        if (alerts.length) {
          actionBox.style.display = 'block';
          actionBox.innerHTML = `
            <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">⚡ Actionable Intelligence:</div>
            <div style="font-size:11.5px;color:var(--text2);display:flex;flex-direction:column;gap:4px">
              ${alerts.map((a) => `<div>${a}</div>`).join('')}
            </div>
          `;
        } else {
          actionBox.style.display = 'none';
        }
      }

      const bucketsGrid = q('MaturityBucketsGrid');
      if (bucketsGrid) {
        bucketsGrid.innerHTML = Object.values(buckets).map((b) => `
          <div class="maturity-bucket-card ${b.cls} ${activeBucketKey === b.key ? 'active' : ''}" data-bucket="${b.key}">
            <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--text2);margin-bottom:2px">${b.label}</div>
            <div style="font-size:15px;font-weight:700;color:var(--gold);font-family:'Cormorant Garamond',serif">${App.utils.fmtMoney(b.totalPrn)}</div>
            <div style="font-size:10px;color:var(--text3)">${b.deals.length} deal(s)</div>
          </div>
        `).join('');

        App.utils.qsa('[data-bucket]', bucketsGrid).forEach((card) => {
          card.addEventListener('click', () => {
            const key = card.dataset.bucket;
            activeBucketKey = activeBucketKey === key ? null : key;
            draw();
          });
        });
      }

      // Render Bucket Drill-down view if active
      const detailWrap = q('MaturityBucketDetailView');
      const badgeWrap = q('ActiveBucketBadge');
      if (detailWrap && badgeWrap) {
        if (activeBucketKey && buckets[activeBucketKey]) {
          const b = buckets[activeBucketKey];
          badgeWrap.innerHTML = `<span style="color:var(--gold);font-weight:700">${b.label}</span> filter active (${b.deals.length} deals) <button class="btn btn-xs btn-outline btn-clear-bucket" style="margin-left:6px">✕ Clear</button>`;
          detailWrap.style.display = 'block';
          if (!b.deals.length) {
            detailWrap.innerHTML = `<div style="font-size:12px;color:var(--text3);text-align:center;padding:10px">No active deals in the ${b.label} maturity window.</div>`;
          } else {
            detailWrap.innerHTML = `
              <div style="font-size:11.5px;font-weight:700;color:var(--text);margin-bottom:8px">Deals in ${b.label}:</div>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${b.deals.map((d) => {
                  const prn = d.current_principal != null ? d.current_principal : d.invested_amount;
                  return `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--card);border:1px solid var(--border2);border-radius:6px;padding:8px 12px;flex-wrap:wrap;gap:8px">
                      <div>
                        <strong style="color:var(--text);font-size:12.5px">${App.utils.escapeHtml(d.deal_name)}</strong>
                        <span style="font-size:11px;color:var(--text3);margin-left:8px">Maturity: ${App.utils.fmtDate(d.maturity_date)}</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:12px">
                        <span style="font-weight:700;color:var(--gold);font-size:13px">${App.utils.fmtMoney(prn)}</span>
                        <button class="btn btn-xs btn-gold" data-bucket-settle="${d.id}">💰 Settle</button>
                        <button class="btn btn-xs btn-outline" data-bucket-extend="${d.id}">⏱️ Extend</button>
                        <button class="btn btn-xs btn-outline" data-bucket-view="${d.id}">👁️ View</button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
            App.utils.qsa('[data-bucket-settle]', detailWrap).forEach((btn) => btn.addEventListener('click', () => {
              const deal = allDeals.find((x) => x.id === Number(btn.dataset.bucketSettle));
              if (deal) openMaturitySettlementModal(deal, () => draw());
            }));
            App.utils.qsa('[data-bucket-extend]', detailWrap).forEach((btn) => btn.addEventListener('click', () => {
              const deal = allDeals.find((x) => x.id === Number(btn.dataset.bucketExtend));
              if (deal) openExtendDealModal(deal, () => draw());
            }));
            App.utils.qsa('[data-bucket-view]', detailWrap).forEach((btn) => btn.addEventListener('click', () => {
              openDealDetail(Number(btn.dataset.bucketView));
            }));
          }
          App.utils.qsa('.btn-clear-bucket', badgeWrap).forEach((btn) => btn.addEventListener('click', () => {
            activeBucketKey = null;
            draw();
          }));
        } else {
          badgeWrap.textContent = '';
          detailWrap.style.display = 'none';
        }
      }
    }

    async function draw() {
      const [deals, metrics, schedule, payments] = await Promise.all([
        App.api.listDeals(),
        App.api.listDealMetrics(),
        App.api.listSchedule(),
        App.api.listPayments(),
      ]);

      const metricsById = {}; metrics.forEach((m) => { metricsById[m.deal_id] = m; });
      const scheduleByDeal = {}; schedule.forEach((s) => {
        scheduleByDeal[s.deal_id] = scheduleByDeal[s.deal_id] || [];
        scheduleByDeal[s.deal_id].push(s);
      });

      const today = App.utils.todayISO();
      const in30Days = new Date(new Date().getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      // 1. Calculate Top & Advanced KPIs
      const activeDeals = deals.filter((d) => d.status === 'ACTIVE');
      const closedDeals = deals.filter((d) => d.status === 'CLOSED');
      const currentlyInvested = activeDeals.reduce((sum, d) => sum + Number(d.current_principal != null ? d.current_principal : d.invested_amount || 0), 0);
      const principalReturned = metrics.reduce((sum, m) => sum + Number(m.principal_returned || 0), 0);

      // Weighted ROI
      let weightedRoiSum = 0;
      activeDeals.forEach((d) => {
        const prn = Number(d.current_principal != null ? d.current_principal : d.invested_amount || 0);
        const roi = Number(d.annual_roi || 0);
        weightedRoiSum += prn * roi;
      });
      const weightedRoi = currentlyInvested > 0 ? (weightedRoiSum / currentlyInvested) : 0;
      const monthlyPassive = (currentlyInvested * (weightedRoi / 100)) / 12;
      const recoveryRate = (currentlyInvested + principalReturned) > 0
        ? (principalReturned / (currentlyInvested + principalReturned)) * 100
        : 0;

      // Overdue & At-Risk
      const overdueDealIds = new Set();
      schedule.forEach((s) => {
        if (s.status === 'OVERDUE') overdueDealIds.add(s.deal_id);
      });
      let atRiskPrincipal = 0;
      let atRiskCount = 0;
      activeDeals.forEach((d) => {
        const isPastMaturity = d.maturity_date && d.maturity_date < today;
        const hasOverdueSchedule = overdueDealIds.has(d.id);
        const isRiskStatus = ['DEFAULTED', 'ON_HOLD', 'PARTIALLY_RECOVERED'].includes(d.status);
        if (isPastMaturity || hasOverdueSchedule || isRiskStatus) {
          atRiskCount++;
          atRiskPrincipal += Number(d.current_principal != null ? d.current_principal : d.invested_amount || 0);
        }
      });

      // Platform Exposure
      const platformTotals = {};
      activeDeals.forEach((d) => {
        const p = d.platform_name || d.counterparty_name || 'Direct';
        const prn = Number(d.current_principal != null ? d.current_principal : d.invested_amount || 0);
        platformTotals[p] = (platformTotals[p] || 0) + prn;
      });
      let topPlatformName = 'None';
      let topPlatformAmt = 0;
      Object.entries(platformTotals).forEach(([p, amt]) => {
        if (amt > topPlatformAmt) {
          topPlatformAmt = amt;
          topPlatformName = p;
        }
      });
      const topPlatformPct = currentlyInvested > 0 ? ((topPlatformAmt / currentlyInvested) * 100) : 0;

      const kpiData = {
        activeCount: activeDeals.length,
        invested: currentlyInvested,
        returned: principalReturned,
        closedCount: closedDeals.length,
        weightedRoi,
        monthlyPassive,
        recoveryRate,
        atRiskPrincipal,
        atRiskCount,
        topPlatformName,
        topPlatformAmt,
        topPlatformPct,
      };

      // 2. Expected Cash (Next 30 Days) from payment_schedule
      let expPrn = 0;
      let expInt = 0;
      schedule.forEach((s) => {
        if (['UPCOMING', 'DUE_TODAY', 'OVERDUE'].includes(s.status) && s.scheduled_date <= in30Days) {
          expPrn += Number(s.expected_principal || 0);
          expInt += Number(s.expected_interest || 0);
        }
      });
      const expCashData = {
        total: expPrn + expInt,
        prn: expPrn,
        int: expInt,
      };

      // 3. Actually Confirmed Cash (This Month)
      let actPrn = 0;
      let actInt = 0;
      payments.forEach((p) => {
        if (!p.is_voided && p.transaction_date >= startOfMonth && p.transaction_date <= today) {
          actPrn += Number(p.principal_amount || 0);
          actInt += Number(p.interest_amount || 0);
        }
      });
      const actCashData = {
        total: actPrn + actInt,
        prn: actPrn,
        int: actInt,
      };

      // Update Mini Bar on Deals Directory
      const miniActive = App.utils.qs('#miniKpiActive', pane);
      const miniInvested = App.utils.qs('#miniKpiInvested', pane);
      const miniReturned = App.utils.qs('#miniKpiReturned', pane);
      const miniExpCash = App.utils.qs('#miniKpiExpCash', pane);
      if (miniActive) miniActive.textContent = kpiData.activeCount;
      if (miniInvested) miniInvested.textContent = App.utils.fmtMoney(kpiData.invested);
      if (miniReturned) miniReturned.textContent = App.utils.fmtMoney(kpiData.returned);
      if (miniExpCash) miniExpCash.textContent = App.utils.fmtMoney(expCashData.total);

      // 4. Maturity Pipeline Buckets
      const buckets = {
        overdue: { key: 'overdue', label: 'Overdue', cls: 'b-overdue', deals: [], totalPrn: 0 },
        today: { key: 'today', label: 'Today', cls: 'b-today', deals: [], totalPrn: 0 },
        week: { key: 'week', label: '1–7 Days', cls: 'b-week', deals: [], totalPrn: 0 },
        fortnight: { key: 'fortnight', label: '8–15 Days', cls: 'b-fortnight', deals: [], totalPrn: 0 },
        month: { key: 'month', label: '16–30 Days', cls: 'b-month', deals: [], totalPrn: 0 },
        later: { key: 'later', label: '31–60 Days', cls: 'b-later', deals: [], totalPrn: 0 },
      };

      deals.forEach((d) => {
        if (d.status === 'CLOSED' || !d.maturity_date) return;
        const prn = Number(d.current_principal != null ? d.current_principal : d.invested_amount) || 0;
        if (prn <= 0) return;

        const diff = App.utils.daysBetween(today, d.maturity_date);
        if (d.maturity_date < today) {
          buckets.overdue.deals.push(d);
          buckets.overdue.totalPrn += prn;
        } else if (d.maturity_date === today) {
          buckets.today.deals.push(d);
          buckets.today.totalPrn += prn;
        } else if (diff >= 1 && diff <= 7) {
          buckets.week.deals.push(d);
          buckets.week.totalPrn += prn;
        } else if (diff >= 8 && diff <= 15) {
          buckets.fortnight.deals.push(d);
          buckets.fortnight.totalPrn += prn;
        } else if (diff >= 16 && diff <= 30) {
          buckets.month.deals.push(d);
          buckets.month.totalPrn += prn;
        } else if (diff >= 31 && diff <= 60) {
          buckets.later.deals.push(d);
          buckets.later.totalPrn += prn;
        }
      });

      // Synchronize both Dedicated Sheet and Inline Expanded Control Center views
      syncControlCenterUI('sheet', kpiData, expCashData, actCashData, buckets, deals, schedule, payments, metrics);
      syncControlCenterUI('inline', kpiData, expCashData, actCashData, buckets, deals, schedule, payments, metrics);

      // 5. Filter main list
      let list = App.filters.apply(deals);

      // Bucket filter (if active)
      if (activeBucketKey && buckets[activeBucketKey]) {
        const bucketDealIds = new Set(buckets[activeBucketKey].deals.map((d) => d.id));
        list = list.filter((d) => bucketDealIds.has(d.id));
      }

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
        ['deal_name', 'Deal Name'],
        ['external_deal_id', 'External ID'],
        ['investment_type', 'Type'],
        ['invested_amount', 'Invested / Principal'],
        ['annual_roi', 'ROI / Rate'],
        ['payment_frequency', 'Payout'],
        ['status', 'Status'],
        ['maturity_date', 'Maturity'],
      ];
      const thead = `<thead><tr>${cols.map(([k, l]) => `<th data-sort="${k}">${l}${sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th>Reliability</th><th>Actions</th></tr></thead>`;
      const body = list.map((d) => {
        const m = metricsById[d.id] || {};
        const dSched = scheduleByDeal[d.id] || [];
        const op = getDealOperationalStatus(d, m, dSched);
        const waLinkHtml = d.whatsapp_group ? `
          <a href="${formatWhatsAppUrl(d.whatsapp_group)}" target="_blank" rel="noopener noreferrer" title="WhatsApp Group: ${App.utils.escapeHtml(d.whatsapp_group)}" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;min-width:20px;background:rgba(37,211,102,0.15);color:#25D366;border:1px solid rgba(37,211,102,0.4);border-radius:50%;margin-left:6px;vertical-align:middle;transition:all 0.15s ease" onclick="event.stopPropagation()">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.586-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.073-2.146-.532-1.745-.728-2.885-2.502-2.973-2.617-.088-.116-.708-.941-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.181-.076.355.101.174.449.741.964 1.2.662.591 1.221.774 1.394.861.173.087.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.144.39-.086s1.011.477 1.184.564.289.13.332.203c.043.072.043.419-.101.824z"/></svg>
          </a>` : '';

        const extBadge = d.extension_count > 0 ? `<span class="badge badge-pill badge-gold" title="${d.extension_count} tenure extensions">+${d.extension_count}x</span>` : '';
        const outstanding = d.current_principal != null ? d.current_principal : d.invested_amount;

        const rateFormatted = (d.interest_rate_basis === 'Monthly' && d.monthly_roi)
          ? `${d.monthly_roi}%/mo`
          : App.utils.fmtPct(d.annual_roi);

        return `<tr>
          <td>
            <div style="font-weight:600">${App.utils.escapeHtml(d.deal_name)} ${d.collateral_available ? '<span title="Secured with Collateral" style="color:var(--teal)">&#128274;</span>' : ''}${waLinkHtml}</div>
            <div style="font-size:10.5px;color:var(--text3)">${d.platform_id ? App.lookups.platformName(d.platform_id) : ''} ${extBadge}</div>
          </td>
          <td>${App.utils.escapeHtml(d.external_deal_id || '—')}</td>
          <td>${App.utils.escapeHtml(d.investment_type)}</td>
          <td>
            <div style="font-weight:600">${App.utils.fmtMoney(d.invested_amount)}</div>
            ${outstanding !== d.invested_amount ? `<div style="font-size:10px;color:var(--gold)">Bal: ${App.utils.fmtMoney(outstanding)}</div>` : ''}
          </td>
          <td>
            <div style="font-weight:600">${rateFormatted}</div>
            <div style="font-size:10px;color:var(--text3)">${d.interest_calculation || 'Simple'}</div>
          </td>
          <td>${d.payment_frequency}</td>
          <td><span class="badge ${op.cls}">${op.label}</span></td>
          <td>
            <div>${App.utils.fmtDate(d.maturity_date)}</div>
            ${d.original_maturity_date && d.original_maturity_date !== d.maturity_date ? `<div style="font-size:9.5px;color:var(--text3)">Orig: ${App.utils.fmtDate(d.original_maturity_date)}</div>` : ''}
          </td>
          <td>${App.utils.fmtPct(m.payout_reliability, 0)}</td>
          <td class="row-actions">
            <button class="icon-btn" data-settle="${d.id}" title="Settle / Confirm Payment">💰</button>
            <button class="icon-btn" data-extend="${d.id}" title="Extend Deal Tenure">⏱️</button>
            <button class="icon-btn" data-view="${d.id}" title="View Details">&#128065;</button>
            <button class="icon-btn" data-edit="${d.id}" title="Edit Deal">&#9998;</button>
            <button class="icon-btn" data-schedule="${d.id}" title="Regenerate Schedule">&#128260;</button>
            <button class="icon-btn del" data-delete="${d.id}" title="Delete Deal">&#128465;</button>
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

      App.utils.qsa('[data-settle]', table).forEach((b) => b.addEventListener('click', () => {
        const deal = deals.find((d) => d.id === Number(b.dataset.settle));
        if (deal) openMaturitySettlementModal(deal, () => draw());
      }));
      App.utils.qsa('[data-extend]', table).forEach((b) => b.addEventListener('click', () => {
        const deal = deals.find((d) => d.id === Number(b.dataset.extend));
        if (deal) openExtendDealModal(deal, () => draw());
      }));
      App.utils.qsa('[data-view]', table).forEach((b) => b.addEventListener('click', () => openDealDetail(Number(b.dataset.view))));
      App.utils.qsa('[data-edit]', table).forEach((b) => b.addEventListener('click', () => {
        const deal = deals.find((d) => d.id === Number(b.dataset.edit));
        openDealWizard(deal);
      }));
      App.utils.qsa('[data-schedule]', table).forEach((b) => b.addEventListener('click', async () => {
        try { const n = await App.api.generateSchedule(Number(b.dataset.schedule)); App.utils.toast(`Schedule updated (${n} installments)`); draw(); }
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
  App.dealsView = {
    openDealWizard,
    openDealDetail,
    openMaturitySettlementModal,
    openExtendDealModal,
  };
})();
