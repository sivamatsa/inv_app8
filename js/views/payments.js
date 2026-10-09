/* Payment Schedule + Payment/Receipt Tracking + Reconciliation (spec
   Sections 6, 7, 8, 9, 23, 24), as tabs of one view. */
window.App = window.App || {};

(function () {
  // Same investment-vs-bill classification recurring.js's own confirm modal
  // uses (its INVESTMENT_TYPES set) - duplicated here rather than exported,
  // matching this app's existing small-local-constant convention (e.g.
  // dashboard.js's own confirmedStatuses) - only used to pick a
  // type-appropriate default status when a bank-statement match resolves to
  // a Recurring occurrence instead of a Deal schedule row.
  const RECURRING_INVESTMENT_TYPES = new Set(['SIP', 'Mutual Fund', 'Gold Scheme', 'Gold Savings', 'Stocks / Shares', 'ETF', 'Recurring Deposit', 'NPS', 'Pension']);
  let activeTab = 'sched';
  const RECORD_FIELDS = [
    { key: 'transaction_date', label: 'Actual Transaction Date (Value Date)', type: 'date', required: true },
    { key: 'recording_date', label: 'Recording Payment Date (Entry Timestamp)', type: 'date', required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'interest_amount', label: 'Interest Component', type: 'number' },
    { key: 'principal_amount', label: 'Principal Component', type: 'number' },
    { key: 'fee_amount', label: 'Fee', type: 'number' },
    { key: 'tax_amount', label: 'Tax', type: 'number' },
    { key: 'payment_reference', label: 'Payment Reference' },
    { key: 'payment_mode', label: 'Payment Mode', placeholder: 'Bank Transfer / UPI / ...' },
    { key: 'confirmation_method', label: 'Confirmation Method', type: 'select',
      options: ['Manual', 'Excel Import', 'CSV Import', 'Bank Statement', 'API', 'Webhook', 'Platform Statement', 'Automatic Reconciliation'] },
    { key: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ];

  async function openRecordPaymentModal(deals, presetDealId, presetSchedule, defaultCategory = null) {
    const dealsById = {}; (deals || []).forEach((d) => { dealsById[d.id] = d; });
    const isPrincipalDefault = defaultCategory === 'principal' || (presetSchedule && Number(presetSchedule.expected_principal || 0) > 0);
    let currentCategory = isPrincipalDefault ? 'principal' : (defaultCategory === 'combined' ? 'combined' : 'interest');

    const dealOptions = deals.map((d) => ({ value: d.id, label: `${d.deal_name} (${App.utils.fmtMoney(d.invested_amount)})` }));
    const dealField = { key: 'deal_id', label: 'Deal', required: true, type: 'select', numeric: true, options: dealOptions, span: 2 };
    
    let initialValues = {
      deal_id: presetDealId || (deals[0] ? deals[0].id : null),
      transaction_date: App.utils.todayISO(),
      recording_date: App.utils.todayISO(),
      amount: null,
      interest_amount: null,
      principal_amount: null,
      fee_amount: null,
      tax_amount: null,
      payment_reference: '',
      payment_mode: 'Bank Transfer',
      confirmation_method: 'Manual',
      notes: ''
    };

    const initialDeal = initialValues.deal_id ? dealsById[initialValues.deal_id] : null;

    if (presetSchedule) {
      initialValues.amount = presetSchedule.expected_total;
      initialValues.interest_amount = presetSchedule.expected_interest;
      initialValues.principal_amount = presetSchedule.expected_principal;
      initialValues.transaction_date = presetSchedule.scheduled_date || initialValues.transaction_date;
      if (Number(presetSchedule.expected_principal || 0) > 0 && Number(presetSchedule.expected_interest || 0) === 0) {
        currentCategory = 'principal';
      } else if (Number(presetSchedule.expected_principal || 0) > 0 && Number(presetSchedule.expected_interest || 0) > 0) {
        currentCategory = 'combined';
      }
    } else if (isPrincipalDefault && initialDeal) {
      const bal = initialDeal.current_principal != null ? initialDeal.current_principal : initialDeal.invested_amount;
      initialValues.amount = bal;
      initialValues.principal_amount = bal;
      initialValues.interest_amount = 0;
      if (initialDeal.maturity_date) {
        initialValues.transaction_date = initialDeal.maturity_date;
      }
    }

    const typeSelectorHtml = `
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text2)">Payment Classification:</label>
        <div id="pmtTypeSelector" style="display:flex;gap:6px;background:var(--fill-1);padding:4px;border-radius:8px;border:1px solid var(--border2)">
          <button type="button" class="btn btn-sm ${currentCategory === 'interest' ? 'btn-gold' : 'btn-outline'}" data-cat="interest" style="flex:1">📈 Interest Payout</button>
          <button type="button" class="btn btn-sm ${currentCategory === 'principal' ? 'btn-teal' : 'btn-outline'}" data-cat="principal" style="flex:1">💰 Principal Repayment</button>
          <button type="button" class="btn btn-sm ${currentCategory === 'combined' ? 'btn-gold' : 'btn-outline'}" data-cat="combined" style="flex:1">🔄 Combined (Int + Prn)</button>
        </div>
      </div>
      <div id="pmtDealContextStrip" style="margin-bottom:12px;padding:9px 12px;background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span>Invested: <strong id="stripInvested">₹0</strong></span>
        <span>Returned: <strong id="stripReturned" style="color:var(--teal,#059669)">₹0</strong></span>
        <span>Outstanding Principal: <strong id="stripBalance" style="color:var(--gold,#d97706)">₹0</strong></span>
      </div>
      <div id="pmtTimingStrip" style="margin-bottom:12px;padding:9px 12px;background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;font-size:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <span>Scheduled Due Date: <strong id="stripScheduledDate">—</strong></span>
        </div>
        <div id="stripTimingBadge" style="font-weight:700">
          <span style="color:var(--text3)">⚪ On-Time</span>
        </div>
      </div>
      <div id="pmtPrincipalBanner" style="display:${currentCategory === 'principal' ? 'flex' : 'none'};align-items:flex-start;gap:10px;padding:10px 14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:8px;font-size:12px;color:#047857;margin-bottom:12px">
        <span style="font-size:18px">💰</span>
        <div>
          <strong>Principal Capital Return Mode:</strong>
          <div id="pmtMaturityDateNote" style="margin-top:2px;color:var(--text2)">
            ${initialDeal?.maturity_date ? `Anchored to maturity date: <strong>${App.utils.fmtDate(initialDeal.maturity_date)}</strong>${initialDeal.extension_count ? ` (Extended ${initialDeal.extension_count}x by provider)` : ''}` : 'Anchored to deal maturity date. Deducts from remaining balance.'}
          </div>
        </div>
      </div>`;

    const settlementCheckboxHtml = `
      <div id="pmtSettlementBox" style="margin-top:10px;padding:8px 12px;background:var(--fill-1);border:1px solid var(--border2);border-radius:6px;font-size:12px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="chkAutoCloseDeal" style="width:16px;height:16px;accent-color:var(--teal)">
          <span>Mark deal as <strong>CLOSED / Settled</strong> if principal is fully repaid</span>
        </label>
      </div>`;

    App.ui.open({
      title: isPrincipalDefault ? '💰 Record Principal Repayment' : 'Record Payment',
      small: false,
      bodyHtml: typeSelectorHtml + App.ui.renderForm([dealField], initialValues) + App.ui.renderForm(RECORD_FIELDS, initialValues) + settlementCheckboxHtml
        + '<div class="hint" style="margin-top:10px">Recording a payment confirms actual receipt of funds in your accounts with timing analytics.</div>',
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Confirm Payment', className: currentCategory === 'principal' ? 'btn-teal' : 'btn-gold',
          onClick: async () => {
            const { values: v1 } = App.ui.readForm([dealField]);
            const { values: v2, errors } = App.ui.readForm(RECORD_FIELDS);
            if (!v1.deal_id || errors.length) { App.utils.toast('Fill in deal, date and amount', 'err'); return; }
            
            // Reconcile amounts according to selected category
            let finalAmount = Number(v2.amount || 0);
            let finalInterest = Number(v2.interest_amount || 0);
            let finalPrincipal = Number(v2.principal_amount || 0);

            if (currentCategory === 'principal') {
              finalPrincipal = finalAmount;
              finalInterest = 0;
            } else if (currentCategory === 'interest') {
              finalInterest = finalAmount;
              finalPrincipal = 0;
            } else {
              // Combined: ensure total amount equals interest + principal if both entered
              if (finalInterest + finalPrincipal > 0 && (!finalAmount || finalAmount === 0)) {
                finalAmount = finalInterest + finalPrincipal;
              }
            }

            // Calculate delay days / advance days
            const selDeal = dealsById[v1.deal_id];
            const targetDueDate = presetSchedule ? presetSchedule.scheduled_date : (selDeal ? selDeal.maturity_date : null);
            let delayDays = 0;
            let advanceDays = 0;
            const txnD = v2.transaction_date ? new Date(v2.transaction_date).setHours(0,0,0,0) : new Date().setHours(0,0,0,0);
            
            if (targetDueDate) {
              const dueD = new Date(targetDueDate).setHours(0,0,0,0);
              const diff = Math.round((txnD - dueD) / (1000 * 60 * 60 * 24));
              if (diff > 0) delayDays = diff;
              else if (diff < 0) advanceDays = Math.abs(diff);
            } else if (v2.recording_date && v2.transaction_date) {
              const recD = new Date(v2.recording_date).setHours(0,0,0,0);
              const diff = Math.round((recD - txnD) / (1000 * 60 * 60 * 24));
              if (diff > 0) delayDays = diff;
              else if (diff < 0) advanceDays = Math.abs(diff);
            }

            const timingTag = delayDays > 0 ? `[Delay: ${delayDays}d]` : (advanceDays > 0 ? `[Advance: ${advanceDays}d]` : '[On-time]');
            let enhancedNotes = (v2.notes || '').trim();
            if (!enhancedNotes.includes('[Delay:') && !enhancedNotes.includes('[Advance:') && !enhancedNotes.includes('[On-time]')) {
              enhancedNotes = enhancedNotes ? `${enhancedNotes} ${timingTag}` : timingTag;
            }

            try {
              await App.api.recordPayment({
                dealId: v1.deal_id,
                transactionDate: v2.transaction_date,
                recordingDate: v2.recording_date || App.utils.todayISO(),
                delayDays,
                advanceDays,
                amount: finalAmount,
                interestAmount: finalInterest,
                principalAmount: finalPrincipal,
                feeAmount: v2.fee_amount || 0,
                taxAmount: v2.tax_amount || 0,
                paymentReference: v2.payment_reference,
                paymentMode: v2.payment_mode,
                confirmationMethod: v2.confirmation_method || 'Manual',
                notes: enhancedNotes,
                scheduledPaymentId: presetSchedule ? presetSchedule.id : null,
              });

              // If settlement checkbox is checked and principal was returned, mark deal closed
              const chkClose = App.utils.qs('#chkAutoCloseDeal');
              if (chkClose && chkClose.checked && finalPrincipal > 0) {
                try {
                  await App.api.updateDeal(v1.deal_id, {
                    status: 'CLOSED',
                    closure_date: v2.transaction_date,
                    notes: `Closed upon principal repayment of ${App.utils.fmtMoney(finalPrincipal)} on ${v2.transaction_date}.`
                  });
                } catch (closeErr) {
                  console.warn('Could not auto-close deal:', closeErr);
                }
              }

              App.utils.toast(finalPrincipal > 0 ? 'Principal repayment recorded successfully!' : 'Payment recorded successfully!');
              App.ui.close();
              App.router.refreshCurrent();
            } catch (e) {
              if (String(e.message || '').includes('duplicate') || e.code === '23505') {
                App.utils.toast('This exact payment is already recorded.', 'err');
              } else {
                App.utils.toast('Could not record payment: ' + (e.message || e), 'err');
              }
            }
          },
        },
      ],
    });

    // Wire up interactive modal behavior
    setTimeout(() => {
      const dealSelect = App.utils.qs('#fld_deal_id');
      const amtInput = App.utils.qs('#fld_amount');
      const intInput = App.utils.qs('#fld_interest_amount');
      const prnInput = App.utils.qs('#fld_principal_amount');
      const banner = App.utils.qs('#pmtPrincipalBanner');
      const typeButtons = App.utils.qsa('#pmtTypeSelector [data-cat]');

      const dateInput = App.utils.qs('#fld_transaction_date');
      const recDateInput = App.utils.qs('#fld_recording_date');
      const matNoteEl = App.utils.qs('#pmtMaturityDateNote');
      const confirmBtn = App.utils.qs('#sharedModalActions .btn-gold, #sharedModalActions .btn-teal');

      function updateTimingStrip() {
        const dId = dealSelect ? Number(dealSelect.value) : null;
        const deal = dealsById[dId];
        const targetDueDate = presetSchedule ? presetSchedule.scheduled_date : (deal ? deal.maturity_date : null);
        const stripSched = App.utils.qs('#stripScheduledDate');
        const stripBadge = App.utils.qs('#stripTimingBadge');
        if (stripSched) stripSched.textContent = targetDueDate ? App.utils.fmtDate(targetDueDate) : 'Ad-hoc (No schedule)';

        const txnDateStr = dateInput ? dateInput.value : App.utils.todayISO();
        const recDateStr = recDateInput ? recDateInput.value : App.utils.todayISO();

        if (targetDueDate) {
          const txnD = new Date(txnDateStr).setHours(0,0,0,0);
          const dueD = new Date(targetDueDate).setHours(0,0,0,0);
          const diff = Math.round((txnD - dueD) / (1000 * 60 * 60 * 24));
          if (diff > 0) {
            if (stripBadge) stripBadge.innerHTML = `<span style="color:var(--red);background:rgba(217,83,79,0.14);padding:2px 8px;border-radius:4px">&#9888; ${diff} Days Delayed</span>`;
          } else if (diff < 0) {
            if (stripBadge) stripBadge.innerHTML = `<span style="color:var(--teal);background:rgba(22,201,163,0.14);padding:2px 8px;border-radius:4px">&#10003; ${Math.abs(diff)} Days in Advance</span>`;
          } else {
            if (stripBadge) stripBadge.innerHTML = `<span style="color:var(--teal);background:rgba(22,201,163,0.14);padding:2px 8px;border-radius:4px">&#10003; Exactly On-Time</span>`;
          }
        } else {
          const txnD = new Date(txnDateStr).setHours(0,0,0,0);
          const recD = new Date(recDateStr).setHours(0,0,0,0);
          const diff = Math.round((recD - txnD) / (1000 * 60 * 60 * 24));
          if (diff > 0) {
            if (stripBadge) stripBadge.innerHTML = `<span style="color:var(--text2);padding:2px 6px">Logged ${diff}d after bank txn</span>`;
          } else if (diff < 0) {
            if (stripBadge) stripBadge.innerHTML = `<span style="color:var(--text2);padding:2px 6px">Pre-recorded ${Math.abs(diff)}d ahead</span>`;
          } else {
            if (stripBadge) stripBadge.innerHTML = `<span style="color:var(--teal);padding:2px 6px">Same-day recorded</span>`;
          }
        }
      }

      if (dateInput) dateInput.addEventListener('change', updateTimingStrip);
      if (recDateInput) recDateInput.addEventListener('change', updateTimingStrip);
      updateTimingStrip();

      function updateDealStrip() {
        const dId = dealSelect ? Number(dealSelect.value) : null;
        const deal = dealsById[dId];
        if (!deal) return;
        const invested = Number(deal.invested_amount || deal.principal_amount || deal.amount || 0);
        const bal = Number(deal.current_principal != null ? deal.current_principal : invested);
        const returned = Math.max(0, invested - bal);

        const stripInv = App.utils.qs('#stripInvested');
        const stripRet = App.utils.qs('#stripReturned');
        const stripBal = App.utils.qs('#stripBalance');
        if (stripInv) stripInv.textContent = App.utils.fmtMoney(invested);
        if (stripRet) stripRet.textContent = App.utils.fmtMoney(returned);
        if (stripBal) stripBal.textContent = App.utils.fmtMoney(bal);

        if (matNoteEl) {
          matNoteEl.innerHTML = deal.maturity_date
            ? `Anchored to maturity date: <strong>${App.utils.fmtDate(deal.maturity_date)}</strong>${deal.extension_count ? ` <span class="badge" style="background:rgba(217,119,6,0.12);color:#b45309;font-size:10px">Extended ${deal.extension_count}x by provider</span>` : ''}`
            : 'Anchored to deal maturity date. Deducts from remaining balance.';
        }
      }

      function applyCategory(cat) {
        currentCategory = cat;
        typeButtons.forEach((btn) => {
          const isActive = btn.dataset.cat === cat;
          btn.className = `btn btn-sm ${isActive ? (cat === 'principal' ? 'btn-teal' : 'btn-gold') : 'btn-outline'}`;
        });
        if (banner) banner.style.display = cat === 'principal' ? 'flex' : 'none';

        const d = dealsById[Number(dealSelect?.value)];

        if (cat === 'principal') {
          if (confirmBtn) {
            confirmBtn.className = 'btn btn-teal';
            confirmBtn.textContent = '💰 Confirm Principal Repayment';
          }
          if (d) {
            const bal = d.current_principal != null ? d.current_principal : d.invested_amount;
            if (amtInput) amtInput.value = bal;
            if (prnInput) prnInput.value = bal;
            if (dateInput && d.maturity_date && !presetSchedule) {
              dateInput.value = d.maturity_date;
            }
          }
          if (intInput) intInput.value = '0';
          if (prnInput && prnInput.parentElement) prnInput.parentElement.style.border = '1px solid #10b981';
          if (intInput && intInput.parentElement) intInput.parentElement.style.border = '';
        } else if (cat === 'interest') {
          if (confirmBtn) {
            confirmBtn.className = 'btn btn-gold';
            confirmBtn.textContent = 'Confirm Interest Payout';
          }
          if (amtInput && intInput) intInput.value = amtInput.value || '';
          if (prnInput) prnInput.value = '0';
          if (intInput && intInput.parentElement) intInput.parentElement.style.border = '1px solid var(--gold)';
          if (prnInput && prnInput.parentElement) prnInput.parentElement.style.border = '';
        } else {
          if (confirmBtn) {
            confirmBtn.className = 'btn btn-gold';
            confirmBtn.textContent = 'Confirm Combined Payment';
          }
          if (prnInput && prnInput.parentElement) prnInput.parentElement.style.border = '';
          if (intInput && intInput.parentElement) intInput.parentElement.style.border = '';
        }
      }

      if (dealSelect) {
        dealSelect.addEventListener('change', () => {
          updateDealStrip();
          updateTimingStrip();
          const d = dealsById[Number(dealSelect.value)];
          if (currentCategory === 'principal' && d) {
            const bal = d.current_principal != null ? d.current_principal : d.invested_amount;
            if (amtInput) amtInput.value = bal;
            if (prnInput) prnInput.value = bal;
            if (dateInput && d.maturity_date && !presetSchedule) {
              dateInput.value = d.maturity_date;
            }
          }
        });
        updateDealStrip();
      }

      if (amtInput) {
        amtInput.addEventListener('input', () => {
          if (currentCategory === 'principal' && prnInput) prnInput.value = amtInput.value;
          else if (currentCategory === 'interest' && intInput) intInput.value = amtInput.value;
        });
      }

      if (intInput || prnInput) {
        const syncCombined = () => {
          if (currentCategory === 'combined' && amtInput) {
            const iVal = Number(intInput ? intInput.value : 0) || 0;
            const pVal = Number(prnInput ? prnInput.value : 0) || 0;
            if (iVal + pVal > 0) amtInput.value = iVal + pVal;
          }
        };
        if (intInput) intInput.addEventListener('input', syncCombined);
        if (prnInput) prnInput.addEventListener('input', syncCombined);
      }

      typeButtons.forEach((btn) => {
        btn.addEventListener('click', () => applyCategory(btn.dataset.cat));
      });

      applyCategory(currentCategory);
    }, 50);
  }

  function renderDateFilterBar(container, filterState, onChange) {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear + 2; y++) years.add(y);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    container.innerHTML = `
      <div class="filterbar">
        <div class="filter-group"><label>Month</label>
          <select class="search-input" data-pf-month>
            <option value="">All</option>
            ${months.map((m, i) => `<option value="${i + 1}" ${filterState.month === String(i + 1) ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group"><label>Year</label>
          <select class="search-input" data-pf-year>
            <option value="">All</option>
            ${[...years].map((y) => `<option value="${y}" ${filterState.year === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group"><label>&nbsp;</label><button class="btn btn-outline btn-sm" data-pf-reset>↺ Reset</button></div>
      </div>`;
    container.querySelector('[data-pf-month]').addEventListener('change', (e) => { filterState.month = e.target.value; onChange(); });
    container.querySelector('[data-pf-year]').addEventListener('change', (e) => { filterState.year = e.target.value; onChange(); });
    container.querySelector('[data-pf-reset]').addEventListener('click', () => { filterState.month = ''; filterState.year = ''; renderDateFilterBar(container, filterState, onChange); onChange(); });
  }

  function matchesDateFilter(filterState, dateStr) {
    if (!dateStr) return !filterState.month && !filterState.year;
    if (filterState.month && Number(dateStr.slice(5, 7)) !== Number(filterState.month)) return false;
    if (filterState.year && Number(dateStr.slice(0, 4)) !== Number(filterState.year)) return false;
    return true;
  }

  async function renderScheduleTab(container, deals) {
    const dealsById = {}; (deals || []).forEach((d) => { dealsById[d.id] = d; });
    let allSchedule = [];
    try {
      allSchedule = (await App.api.listSchedule({ in: { status: ['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_RECEIVED'] } })) || [];
    } catch (e) {
      console.warn('Could not fetch schedule:', e);
      allSchedule = [];
    }
    allSchedule.sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
    let schedQuickChip = 'all';
    container.innerHTML = `
      <div class="filter-chips-wrap" id="schedQuickChips" style="margin-top:6px">
        <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-right:4px">Quick Filter:</span>
        <button class="quick-chip active" data-sched-chip="all">All Pending</button>
        <button class="quick-chip" data-sched-chip="overdue">&#9888; Overdue</button>
        <button class="quick-chip" data-sched-chip="due_today">&#128308; Due Today</button>
        <button class="quick-chip" data-sched-chip="this_month">&#128197; Due This Month</button>
        <button class="quick-chip" data-sched-chip="interest_only">&#128176; Interest Component</button>
        <button class="quick-chip" data-sched-chip="principal">&#128181; Principal Repayment</button>
      </div>
      <div id="scheduleFilterBar"></div>
      <div id="scheduleTableHost"></div>`;
    const filterHost = App.utils.qs('#scheduleFilterBar', container);
    const tableHost = App.utils.qs('#scheduleTableHost', container);
    const filterState = { month: '', year: '' };

    function draw() {
      const currentYearMonth = new Date().toISOString().slice(0, 7);
      let schedule = allSchedule.filter((s) => matchesDateFilter(filterState, s.scheduled_date));

      if (schedQuickChip === 'overdue') {
        schedule = schedule.filter((s) => s.status === 'OVERDUE');
      } else if (schedQuickChip === 'due_today') {
        schedule = schedule.filter((s) => s.status === 'DUE_TODAY');
      } else if (schedQuickChip === 'this_month') {
        schedule = schedule.filter((s) => s.scheduled_date && s.scheduled_date.startsWith(currentYearMonth));
      } else if (schedQuickChip === 'interest_only') {
        schedule = schedule.filter((s) => (s.expected_interest || 0) > 0);
      } else if (schedQuickChip === 'principal') {
        schedule = schedule.filter((s) => (s.expected_principal || 0) > 0);
      }

      tableHost.innerHTML = `
        <div class="table-scroll"><table class="data">
          <thead><tr><th>Scheduled Date</th><th>Deal</th><th>External Deal ID</th><th>📈 Expected Interest</th><th>💰 Expected Principal</th><th>Expected Total</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${schedule.map((s) => {
            const hasPrn = Number(s.expected_principal || 0) > 0;
            return `
            <tr style="${hasPrn ? 'border-left: 3.5px solid #10b981; background: rgba(16,185,129,0.025);' : ''}">
              <td>${App.utils.fmtDate(s.scheduled_date)}</td>
              <td>${App.utils.escapeHtml((dealsById[s.deal_id] || {}).deal_name || '—')}</td>
              <td>${App.utils.escapeHtml((dealsById[s.deal_id] || {}).external_deal_id || '—')}</td>
              <td>${Number(s.expected_interest || 0) > 0 ? `<span style="color:var(--gold,#d97706);font-weight:600">${App.utils.fmtMoney(s.expected_interest)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
              <td>${hasPrn ? `<strong style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(16,185,129,0.14);color:#047857;border:1px solid rgba(16,185,129,0.3)">${App.utils.fmtMoney(s.expected_principal)}</strong>` : '<span style="color:var(--text3)">—</span>'}</td>
              <td><strong>${App.utils.fmtMoney(s.expected_total)}</strong></td>
              <td><span class="badge ${App.utils.statusBadgeClass(s.status)}">${s.status}</span></td>
              <td>
                ${hasPrn ? `
                  <button class="btn btn-sm btn-teal" data-record-principal="${s.id}" title="Record Capital Repayment">💰 Record Principal</button>
                ` : `
                  <button class="btn btn-sm btn-gold" data-record="${s.id}">Record</button>
                `}
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No pending payments match the selected filters.</td></tr>'}</tbody>
        </table></div>`;

      App.utils.qsa('[data-record]', tableHost).forEach((b) => b.addEventListener('click', () => {
        const s = allSchedule.find((x) => x.id === Number(b.dataset.record));
        openRecordPaymentModal(deals, s.deal_id, s, 'interest');
      }));

      App.utils.qsa('[data-record-principal]', tableHost).forEach((b) => b.addEventListener('click', () => {
        const s = allSchedule.find((x) => x.id === Number(b.dataset.recordPrincipal));
        openRecordPaymentModal(deals, s.deal_id, s, 'principal');
      }));
    }

    App.utils.qsa('[data-sched-chip]', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        schedQuickChip = btn.dataset.schedChip;
        App.utils.qsa('[data-sched-chip]', container).forEach((b) => b.classList.toggle('active', b === btn));
        draw();
      });
    });

    renderDateFilterBar(filterHost, filterState, draw);
    draw();
  }

  async function renderLedgerTab(container, deals) {
    const dealsById = {}; (deals || []).forEach((d) => { dealsById[d.id] = d; });
    let allPayments = [];
    try {
      allPayments = (await App.api.listPayments()) || [];
    } catch (e) {
      console.warn('Could not fetch payments:', e);
      allPayments = [];
    }
    let ledgerQuickChip = 'all';
    container.innerHTML = `
      <div class="filter-chips-wrap" id="ledgerQuickChips" style="margin-top:6px">
        <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-right:4px">Quick Filter:</span>
        <button class="quick-chip active" data-led-chip="all">All Received</button>
        <button class="quick-chip" data-led-chip="this_month">&#128197; This Month</button>
        <button class="quick-chip" data-led-chip="interest">&#128176; Interest Component</button>
        <button class="quick-chip" data-led-chip="principal">&#128181; Principal Component</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <div id="ledgerFilterBar" style="flex:1;min-width:260px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" id="btnPaymentMigrationSql">&#128450; Supabase SQL Migration (052)</button>
          <button class="btn btn-teal btn-sm" id="btnRecordPrincipalReturn">💰 Record Principal Return</button>
          <button class="btn btn-gold btn-sm" id="adhocRecordBtn">+ Record Payment</button>
        </div>
      </div>
      <div id="ledgerTableHost"></div>`;
    const filterHost = App.utils.qs('#ledgerFilterBar', container);
    const tableHost = App.utils.qs('#ledgerTableHost', container);
    const filterState = { month: '', year: '' };

    function draw() {
      const currentYearMonth = new Date().toISOString().slice(0, 7);
      let payments = allPayments.filter((p) => matchesDateFilter(filterState, p.transaction_date));

      if (ledgerQuickChip === 'this_month') {
        payments = payments.filter((p) => p.transaction_date && p.transaction_date.startsWith(currentYearMonth));
      } else if (ledgerQuickChip === 'interest') {
        payments = payments.filter((p) => (p.interest_amount || 0) > 0);
      } else if (ledgerQuickChip === 'principal') {
        payments = payments.filter((p) => (p.principal_amount || 0) > 0);
      }

      tableHost.innerHTML = `
        <div class="table-scroll"><table class="data">
          <thead><tr><th>Actual Date</th><th>Recording Date</th><th>Deal</th><th>External Deal ID</th><th>Type</th><th>Total Received</th><th>📈 Interest</th><th>💰 Principal</th><th>Timing / Offset</th><th>Reference</th><th>Method</th><th></th><th>Actions</th></tr></thead>
          <tbody>${payments.map((p) => {
            const hasPrn = Number(p.principal_amount || 0) > 0;
            const hasInt = Number(p.interest_amount || 0) > 0;
            let typeBadge = '<span class="badge" style="background:var(--fill-2);color:var(--text2)">General</span>';
            if (hasPrn && !hasInt) {
              typeBadge = '<span class="badge" style="background:rgba(16,185,129,0.15);color:#047857;border:1px solid rgba(16,185,129,0.35);font-weight:700">💰 Principal Return</span>';
            } else if (hasInt && !hasPrn) {
              typeBadge = '<span class="badge" style="background:rgba(217,119,6,0.12);color:#b45309;border:1px solid rgba(217,119,6,0.3);font-weight:600">📈 Interest</span>';
            } else if (hasPrn && hasInt) {
              typeBadge = '<span class="badge" style="background:rgba(124,58,237,0.12);color:#6d28d9;border:1px solid rgba(124,58,237,0.3);font-weight:600">🔄 Combined (EMI)</span>';
            }

            // Extract delay or advance info
            let timingBadge = '<span class="badge" style="background:var(--fill-2);color:var(--text2);font-size:10px">On-Time</span>';
            if (p.delay_days > 0) {
              timingBadge = `<span class="badge" style="background:rgba(217,83,79,0.12);color:var(--red);font-size:10px">&#9888; ${p.delay_days}d Late</span>`;
            } else if (p.advance_days > 0) {
              timingBadge = `<span class="badge" style="background:rgba(22,201,163,0.12);color:var(--teal);font-size:10px">&#10003; ${p.advance_days}d Early</span>`;
            } else if (p.notes && p.notes.includes('[Delay:')) {
              const m = p.notes.match(/\[Delay:\s*(\d+)d\]/);
              if (m) timingBadge = `<span class="badge" style="background:rgba(217,83,79,0.12);color:var(--red);font-size:10px">&#9888; ${m[1]}d Late</span>`;
            } else if (p.notes && p.notes.includes('[Advance:')) {
              const m = p.notes.match(/\[Advance:\s*(\d+)d\]/);
              if (m) timingBadge = `<span class="badge" style="background:rgba(22,201,163,0.12);color:var(--teal);font-size:10px">&#10003; ${m[1]}d Early</span>`;
            }

            const recDateStr = p.recording_date || (p.created_at ? p.created_at.slice(0, 10) : p.transaction_date);

            return `
            <tr style="${hasPrn ? 'border-left: 3.5px solid #10b981; background: rgba(16,185,129,0.025);' : ''} ${p.is_voided ? 'opacity:.45;' : ''}">
              <td><b>${App.utils.fmtDate(p.transaction_date)}</b></td>
              <td style="color:var(--text2)">${App.utils.fmtDate(recDateStr)}</td>
              <td>${App.utils.escapeHtml((dealsById[p.deal_id] || {}).deal_name || '—')}</td>
              <td>${App.utils.escapeHtml((dealsById[p.deal_id] || {}).external_deal_id || '—')}</td>
              <td>${typeBadge}</td>
              <td><strong>${App.utils.fmtMoney(p.amount)}</strong></td>
              <td>${hasInt ? `<span style="color:var(--gold,#d97706);font-weight:600">${App.utils.fmtMoney(p.interest_amount)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
              <td>${hasPrn ? `<strong style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(16,185,129,0.14);color:#047857;border:1px solid rgba(16,185,129,0.3)">${App.utils.fmtMoney(p.principal_amount)}</strong>` : '<span style="color:var(--text3)">—</span>'}</td>
              <td>${timingBadge}</td>
              <td>${App.utils.escapeHtml(p.payment_reference || '—')}</td>
              <td>${p.confirmation_method}</td>
              <td>${p.is_voided ? '<span class="badge st-missed">Voided</span>' : ''}</td>
              <td>${p.is_voided ? '' : `<button class="icon-btn del" data-void="${p.id}" title="Void">&#128465;</button>`}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="13" style="text-align:center;color:var(--text3);padding:24px">No payments match the selected filters.</td></tr>'}</tbody>
        </table></div>`;
      App.utils.qsa('[data-void]', tableHost).forEach((b) => b.addEventListener('click', async () => {
        const reason = prompt('Reason for voiding this payment (kept in the audit trail; the payment is never deleted):');
        if (reason === null) return;
        try { await App.api.voidPayment(Number(b.dataset.void), reason); App.utils.toast('Payment voided'); App.router.refreshCurrent(); }
        catch (e) { App.utils.toast('Could not void payment: ' + (e.message || e), 'err'); }
      }));
    }

    App.utils.qsa('[data-led-chip]', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        ledgerQuickChip = btn.dataset.ledChip;
        App.utils.qsa('[data-led-chip]', container).forEach((b) => b.classList.toggle('active', b === btn));
        draw();
      });
    });

    renderDateFilterBar(filterHost, filterState, draw);
    draw();
    App.utils.qs('#btnPaymentMigrationSql', container)?.addEventListener('click', () => {
      if (App.supabaseMigrationViewer) App.supabaseMigrationViewer.openMigration052Modal();
    });
    App.utils.qs('#adhocRecordBtn', container).addEventListener('click', () => openRecordPaymentModal(deals, null, null, 'interest'));
    const prnBtn = App.utils.qs('#btnRecordPrincipalReturn', container);
    if (prnBtn) {
      prnBtn.addEventListener('click', () => openRecordPaymentModal(deals, null, null, 'principal'));
    }
  }

  async function renderReconciliationTab(container, deals) {
    const dealsById = {}; (deals || []).forEach((d) => { dealsById[d.id] = d; });
    let bankTx = [], schedule = [], recurringOcc = [], recurringItemsAll = [];
    try {
      [bankTx, schedule, recurringOcc, recurringItemsAll] = await Promise.all([
        App.api.listBankTransactions().catch(() => []),
        App.api.listSchedule({ in: { status: ['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_RECEIVED'] } }).catch(() => []),
        App.api.listRecurringOccurrences({ in: { status: ['UPCOMING', 'DUE', 'OVERDUE'] } }).catch(() => []),
        App.api.listRecurringItems().catch(() => []),
      ]);
    } catch (e) {
      console.warn('Could not fetch reconciliation data:', e);
    }
    const recurringItemsById = {}; (recurringItemsAll || []).forEach((i) => { recurringItemsById[i.id] = i; });

    // Generalized to score across BOTH Deal schedule rows and Recurring
    // occurrences (the Reconciliation Center addendum's "Payments/Recurring"
    // scope) - same amount-tolerance + day-diff scoring formula either way,
    // just against two candidate pools instead of one, tagged with which
    // pool the winner came from so the Confirm handler can branch correctly.
    function suggestMatch(tx) {
      let best = null, bestScore = -1, bestSource = null;
      schedule.forEach((s) => {
        if (s.expected_total == null) return;
        const amountDiff = Math.abs(s.expected_total - tx.amount);
        const dayDiff = Math.abs(App.utils.daysBetween(s.scheduled_date, tx.transaction_date));
        if (amountDiff > Math.max(50, s.expected_total * 0.02)) return;
        const score = 100 - dayDiff - amountDiff / 10;
        if (score > bestScore) { bestScore = score; best = s; bestSource = 'schedule'; }
      });
      recurringOcc.forEach((o) => {
        if (o.expected_amount == null) return;
        const amountDiff = Math.abs(o.expected_amount - tx.amount);
        const dayDiff = Math.abs(App.utils.daysBetween(o.due_date, tx.transaction_date));
        if (amountDiff > Math.max(50, o.expected_amount * 0.02)) return;
        const score = 100 - dayDiff - amountDiff / 10;
        if (score > bestScore) { bestScore = score; best = o; bestSource = 'recurring'; }
      });
      return best ? { row: best, source: bestSource } : null;
    }

    container.innerHTML = `
      <div class="dropzone" id="bankDropzone">
        <div class="dropzone-icon">&#128179;</div>
        <div class="dropzone-title">Drop a bank statement Excel/CSV here, or click to browse</div>
        <div class="dropzone-sub">Columns expected: Date, Amount, Description, Reference (header names are matched loosely).</div>
      </div>
      <input type="file" id="bankFileInput" accept=".xlsx,.xls,.csv">
      <div class="table-scroll" style="margin-top:16px"><table class="data">
        <thead><tr><th>Bank Date</th><th>Amount</th><th>Description</th><th>Suggested Match</th><th>Actions</th></tr></thead>
        <tbody>${bankTx.filter((t) => !t.matched).map((t) => {
          const m = suggestMatch(t);
          let matchLabel = 'No confident match';
          if (m && m.source === 'schedule') {
            const dealName = (dealsById[m.row.deal_id] || {}).deal_name;
            matchLabel = `${App.utils.escapeHtml(dealName)} · expected ${App.utils.fmtMoney(m.row.expected_total)} on ${App.utils.fmtDate(m.row.scheduled_date)}`;
          } else if (m && m.source === 'recurring') {
            const item = recurringItemsById[m.row.recurring_item_id] || {};
            matchLabel = `${App.utils.escapeHtml(item.item_name)} (Recurring) · expected ${App.utils.fmtMoney(m.row.expected_amount)} on ${App.utils.fmtDate(m.row.due_date)}`;
          }
          return `<tr>
            <td>${App.utils.fmtDate(t.transaction_date)}</td>
            <td>${App.utils.fmtMoney(t.amount)}</td>
            <td>${App.utils.escapeHtml(t.description || '—')}</td>
            <td>${matchLabel}</td>
            <td class="row-actions">
              ${m ? `<button class="btn btn-sm btn-teal" data-confirm="${t.id}" data-source="${m.source}" data-row="${m.row.id}" ${m.source === 'schedule' ? `data-deal="${m.row.deal_id}"` : `data-item="${m.row.recurring_item_id}"`}>Confirm</button>` : ''}
              <button class="btn btn-sm btn-outline" data-unidentified="${t.id}">Mark Unidentified</button>
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">No unresolved bank transactions.</td></tr>'}</tbody>
      </table></div>`;

    const dz = App.utils.qs('#bankDropzone', container);
    const input = App.utils.qs('#bankFileInput', container);
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => { if (e.target.files[0]) handleBankFile(e.target.files[0]); });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleBankFile(f); });

    function handleBankFile(file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
          // Prefer a sheet actually named for bank/reconciliation data - a
          // plain bank-statement export is just one sheet so falling back to
          // the first is still correct there, but a multi-sheet workbook
          // (e.g. the combined import template, which leads with an
          // Instructions sheet) would otherwise silently read the wrong one.
          const sheetName = wb.SheetNames.find((n) => /bank|reconcil/i.test(n)) || wb.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
          let added = 0;
          for (const row of rows) {
            const dateVal = row.Date || row.date || row['Transaction Date'];
            const amountVal = row.Amount || row.amount;
            if (!dateVal || !amountVal) continue;
            await App.api.createBankTransaction({
              transaction_date: App.utils.toISO(App.utils.parseDate(dateVal)),
              amount: App.utils.parseNum(amountVal),
              description: row.Description || row.description || row.Narration || null,
              reference: row.Reference || row.reference || null,
            });
            added++;
          }
          App.utils.toast(`${added} bank transaction(s) imported`);
          App.router.refreshCurrent();
        } catch (err) { App.utils.toast('Could not parse file: ' + (err.message || err), 'err'); }
      };
      reader.readAsArrayBuffer(file);
    }

    App.utils.qsa('[data-confirm]', container).forEach((b) => b.addEventListener('click', async () => {
      const txId = Number(b.dataset.confirm), source = b.dataset.source, rowId = Number(b.dataset.row);
      const tx = bankTx.find((t) => t.id === txId);
      try {
        if (source === 'schedule') {
          const dealId = Number(b.dataset.deal);
          await App.api.recordPayment({
            dealId, transactionDate: tx.transaction_date, amount: tx.amount,
            paymentReference: tx.reference, confirmationMethod: 'Bank Statement', scheduledPaymentId: rowId,
          });
          await App.api.createPaymentMatch({ bank_transaction_id: txId, deal_id: dealId, match_percentage: 100, status: 'Confirmed' });
        } else {
          const item = recurringItemsById[Number(b.dataset.item)] || {};
          const status = RECURRING_INVESTMENT_TYPES.has(item.item_type) ? 'INVESTED' : 'PAID';
          await App.api.confirmRecurringOccurrence({
            occurrenceId: rowId, actualAmount: tx.amount, paidDate: tx.transaction_date,
            status, paymentReference: tx.reference,
          });
          await App.api.createPaymentMatch({ bank_transaction_id: txId, recurring_occurrence_id: rowId, match_percentage: 100, status: 'Confirmed' });
        }
        await App.api.markBankTransactionMatched(txId);
        App.utils.toast('Match confirmed');
        App.router.refreshCurrent();
      } catch (e) { App.utils.toast('Could not confirm match: ' + (e.message || e), 'err'); }
    }));
    App.utils.qsa('[data-unidentified]', container).forEach((b) => b.addEventListener('click', async () => {
      const txId = Number(b.dataset.unidentified);
      try {
        await App.api.createPaymentMatch({ bank_transaction_id: txId, status: 'Unidentified' });
        await App.api.markBankTransactionMatched(txId);
        App.utils.toast('Marked unidentified');
        App.router.refreshCurrent();
      } catch (e) { App.utils.toast('Could not update: ' + (e.message || e), 'err'); }
    }));
  }

  async function renderPaymentsView() {
    const pane = App.utils.qs('#pane-payments');
    pane.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div class="section-title" style="margin:0">Payments <div class="line"></div><small>expected schedule, actual ledger, and reconciliation</small></div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-outline btn-sm" id="btnPaymentsHeaderMigrationSql" style="font-size:11.5px">🗄️ Supabase Migration 052 SQL</button>
        </div>
      </div>
      <div class="panel">
        <div class="tabbar">
          <button class="tab-btn ${activeTab === 'sched' ? 'active' : ''}" data-tab="sched">Payment Schedule</button>
          <button class="tab-btn ${activeTab === 'ledger' ? 'active' : ''}" data-tab="ledger">Receipt Ledger</button>
          <button class="tab-btn ${activeTab === 'recon' ? 'active' : ''}" data-tab="recon">Bank Reconciliation</button>
        </div>
        <div class="tab-pane ${activeTab === 'sched' ? 'active' : ''}" data-pane="sched" id="scheduleTabBody"></div>
        <div class="tab-pane ${activeTab === 'ledger' ? 'active' : ''}" data-pane="ledger" id="ledgerTabBody"></div>
        <div class="tab-pane ${activeTab === 'recon' ? 'active' : ''}" data-pane="recon" id="reconTabBody"></div>
      </div>`;

    App.utils.qs('#btnPaymentsHeaderMigrationSql', pane)?.addEventListener('click', () => {
      if (App.supabaseMigrationViewer) App.supabaseMigrationViewer.openMigration052Modal();
    });

    App.utils.qsa('.tab-btn', pane).forEach((btn) => btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      App.utils.qsa('.tab-btn', pane).forEach((b) => b.classList.toggle('active', b === btn));
      App.utils.qsa('.tab-pane', pane).forEach((p) => p.classList.toggle('active', p.dataset.pane === btn.dataset.tab));
    }));

    let deals = [];
    try {
      deals = (await App.api.listDeals()) || [];
    } catch (e) {
      console.warn('Could not fetch deals for payments view:', e);
      deals = [];
    }
    await renderScheduleTab(App.utils.qs('#scheduleTabBody', pane), deals);
    await renderLedgerTab(App.utils.qs('#ledgerTabBody', pane), deals);
    await renderReconciliationTab(App.utils.qs('#reconTabBody', pane), deals);
  }

  App.router.register('payments', renderPaymentsView);
  App.paymentsView = {
    openRecordPaymentModal,
    openReconciliationTab() { activeTab = 'recon'; App.router.navigate('payments'); },
  };
})();
