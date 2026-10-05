/* Generic modal + form-field rendering shared by every view that needs a
   create/edit dialog (deals, payments, documents, ...). */
window.App = window.App || {};

App.ui = (function () {
  let backdropEl = null;

  function ensureBackdrop() {
    if (backdropEl) return backdropEl;
    backdropEl = App.utils.el(`
      <div class="modal-backdrop" id="sharedModalBackdrop">
        <div class="modal" id="sharedModal">
          <div class="modal-head">
            <div class="modal-title" id="sharedModalTitle"></div>
            <div class="modal-close" id="sharedModalClose">&#10005;</div>
          </div>
          <div id="sharedModalBody"></div>
          <div class="modal-actions" id="sharedModalActions"></div>
        </div>
      </div>`);
    document.body.appendChild(backdropEl);
    App.utils.qs('#sharedModalClose', backdropEl).addEventListener('click', close);
    backdropEl.addEventListener('click', (e) => { if (e.target === backdropEl) close(); });
    return backdropEl;
  }

  function open(opts) {
    const el = ensureBackdrop();
    // Ensure backdrop is last element in body for correct DOM stacking
    if (el.parentNode === document.body) {
      document.body.appendChild(el);
    }
    // Compute highest z-index across all open modals to always render in foreground
    let maxZ = 120000;
    try {
      const allBackdrops = document.querySelectorAll('.modal-backdrop, [style*="z-index"]');
      allBackdrops.forEach((m) => {
        if (m !== el && m.classList.contains('show') || (m.style && m.style.display !== 'none' && m.style.zIndex)) {
          const z = parseInt(window.getComputedStyle(m).zIndex, 10);
          if (!isNaN(z) && z >= maxZ) {
            maxZ = z + 50;
          }
        }
      });
    } catch (_) {}
    el.style.zIndex = String(maxZ);

    App.utils.qs('#sharedModalTitle', el).textContent = opts.title || '';
    App.utils.qs('#sharedModal', el).className = 'modal' + (opts.small ? ' modal-sm' : '');
    App.utils.qs('#sharedModalBody', el).innerHTML = opts.bodyHtml || opts.content || '';
    const actions = App.utils.qs('#sharedModalActions', el);
    actions.innerHTML = '';
    (opts.actions || []).forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (a.className || (a.primary ? 'btn-gold' : 'btn-outline'));
      btn.textContent = a.label;
      btn.addEventListener('click', a.onClick);
      actions.appendChild(btn);
    });
    el.classList.add('show');
    if (opts.onMount) opts.onMount(App.utils.qs('#sharedModalBody', el));
  }

  function close() {
    if (backdropEl) backdropEl.classList.remove('show');
  }

  // ---- field rendering, mirrors the reference dashboard's manual-form pattern ----
  function fieldHtml(f, value) {
    const id = 'fld_' + f.key;
    const span = f.span ? ` span${f.span}` : '';
    const label = `<label>${f.label}${f.required ? ' <span class="req">*</span>' : ''}</label>`;
    let input;
    if (f.type === 'select') {
      const opts = (f.options || []).map((o) => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return `<option value="${App.utils.escapeHtml(v)}" ${String(value) === String(v) ? 'selected' : ''}>${App.utils.escapeHtml(l)}</option>`;
      }).join('');
      input = `<select id="${id}" ${f.required ? 'required' : ''}><option value="">—</option>${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" rows="${f.rows || 2}">${App.utils.escapeHtml(value || '')}</textarea>`;
    } else if (f.type === 'checkbox') {
      input = `<select id="${id}"><option value="false" ${!value ? 'selected' : ''}>No</option><option value="true" ${value ? 'selected' : ''}>Yes</option></select>`;
    } else {
      const type = f.type || 'text';
      const step = type === 'number' ? ' step="any"' : '';
      const ro = f.readonly ? ' readonly' : '';
      const dis = f.disabled ? ' disabled' : '';
      const style = (f.disabled || f.readonly) ? ' style="opacity:0.75;background:var(--fill-1);cursor:not-allowed;color:var(--text2)"' : '';
      const hint = f.hint ? `<div class="hint" style="font-size:11px;margin-top:3px">${App.utils.escapeHtml(f.hint)}</div>` : '';
      input = `<input type="${type}" id="${id}"${step}${ro}${dis}${style} value="${value === null || value === undefined ? '' : App.utils.escapeHtml(value)}" ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${App.utils.escapeHtml(f.placeholder)}"` : ''}>${hint}`;
    }
    return `<div class="field${span}">${label}${input}<div class="field-error" id="err_${f.key}"></div></div>`;
  }

  function renderForm(fields, values) {
    values = values || {};
    return `<div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.key])).join('')}</div>`;
  }

  function readForm(fields) {
    const out = {};
    const errors = [];
    fields.forEach((f) => {
      const elx = App.utils.qs('#fld_' + f.key);
      const errEl = App.utils.qs('#err_' + f.key);
      if (errEl) errEl.textContent = '';
      if (!elx) return;
      let v = elx.value;
      if (f.type === 'number') v = v === '' ? null : App.utils.parseNum(v);
      else if (f.type === 'checkbox') v = v === 'true';
      // <select> element values are always strings, even when built from
      // numeric ids (options: [{value: someRow.id, label: ...}]) - without
      // this, a field like deal_id/platform_id round-trips as "2" instead
      // of 2, which a strict backend (or a RPC parameter typed bigint) can
      // reject or silently mismatch on.
      else if (f.type === 'select' && f.numeric) v = v === '' ? null : App.utils.parseNum(v);
      else if (v === '') v = null;
      if (f.required && (v === null || v === undefined || v === '')) {
        errors.push(f.key);
        if (errEl) errEl.textContent = 'Required';
      }
      out[f.key] = v;
    });
    return { values: out, errors };
  }

  // Two-Step Type "DELETE" or Item Name confirmation modal
  function confirmTwoStepDelete({
    title = 'Confirm Permanent Deletion',
    itemName = 'this item',
    itemType = 'Record',
    itemValue = null,
    warningText = 'This action will move this record to the Recycle Bin and remove it from active calculations.',
    onConfirm,
  }) {
    const cleanName = String(itemName || '').trim();
    const isSpecialShort = cleanName.length > 0 && cleanName.length <= 30;

    open({
      title: '⚠️ ' + title,
      small: true,
      bodyHtml: `
        <div style="margin-bottom:14px">
          <div style="background:rgba(217,83,79,0.08);border:1px solid rgba(217,83,79,0.25);border-radius:8px;padding:12px;margin-bottom:14px">
            <div style="font-weight:700;color:var(--red);font-size:13px;display:flex;align-items:center;gap:6px">
              <span>⚠️</span>
              <span>Destructive Action Warning</span>
            </div>
            <div style="font-size:12px;color:var(--text);margin-top:6px;line-height:1.4">
              ${App.utils.escapeHtml(warningText)}
            </div>
          </div>

          <div style="background:var(--fill-1);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px">
            <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Target ${App.utils.escapeHtml(itemType)}</div>
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-top:2px">${App.utils.escapeHtml(cleanName)}</div>
            ${itemValue != null ? `<div style="font-size:13px;font-weight:600;color:var(--gold);margin-top:2px">${App.utils.fmtMoney(itemValue)}</div>` : ''}
          </div>

          <div style="font-size:12.5px;color:var(--text);margin-bottom:8px">
            To proceed, type <b>DELETE</b> ${isSpecialShort ? `or <b>${App.utils.escapeHtml(cleanName)}</b>` : ''} below:
          </div>
          <input type="text" id="confirmDeleteInput" class="search-input" style="width:100%;border-color:var(--border)" placeholder="Type DELETE to confirm" autocomplete="off" />
          <div id="confirmDeleteFeedback" style="font-size:11px;color:var(--text3);margin-top:4px">Type exactly to enable confirmation button</div>
        </div>
      `,
      onMount: (modalBody) => {
        const input = App.utils.qs('#confirmDeleteInput', modalBody);
        const feedback = App.utils.qs('#confirmDeleteFeedback', modalBody);
        const confirmBtn = App.utils.qs('#sharedModalActions button.btn-danger', backdropEl) || App.utils.qs('#sharedModalActions button:last-child', backdropEl);

        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.style.opacity = '0.4';
          confirmBtn.style.cursor = 'not-allowed';
          confirmBtn.style.background = 'var(--red, #d9534f)';
          confirmBtn.style.color = '#fff';
        }

        if (input) {
          input.focus();
          input.addEventListener('input', () => {
            const val = input.value.trim();
            const matchesDelete = val.toUpperCase() === 'DELETE';
            const matchesName = isSpecialShort && val.toLowerCase() === cleanName.toLowerCase();
            const isValid = matchesDelete || matchesName;

            if (confirmBtn) {
              confirmBtn.disabled = !isValid;
              confirmBtn.style.opacity = isValid ? '1' : '0.4';
              confirmBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';
            }

            if (feedback) {
              if (isValid) {
                feedback.innerHTML = '<span style="color:var(--teal)">✓ Confirmation matched. Click button below to delete.</span>';
              } else if (val.length > 0) {
                feedback.innerHTML = '<span style="color:var(--red)">Does not match yet.</span>';
              } else {
                feedback.innerHTML = 'Type exactly to enable confirmation button';
              }
            }
          });
        }
      },
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: close },
        {
          label: 'Move to Trash (Delete)',
          className: 'btn-danger',
          onClick: () => {
            close();
            if (typeof onConfirm === 'function') onConfirm();
          },
        },
      ],
    });
  }

  return { open, modal: open, close, renderForm, readForm, fieldHtml, confirmTwoStepDelete };
})();

App.dialogs = App.dialogs || {};
App.dialogs.PLATFORM_FIELDS = [
  { key: 'name', label: 'Platform / Provider Name', required: true, placeholder: 'e.g. Grip Invest, Wint Wealth, LiquiLoans' },
  { key: 'account_reference', label: 'Account Reference / Investor ID', placeholder: 'e.g. ACC-99214, CLI-4810' },
  { key: 'investment_type', label: 'Default Investment Type', type: 'select',
    options: [
      'Invoice Discounting',
      'P2P Lending',
      'Asset Backed Leasing',
      'Corporate Bonds',
      'Venture Debt',
      'Commercial Paper',
      'Real Estate Debt',
      'Fixed Deposit',
      'Alternative Debt',
      'Other'
    ]
  },
  { key: 'notes', label: 'Notes & RM Contact', type: 'textarea', placeholder: 'Login portal, support contact, or relationship manager details...' },
];

App.dialogs.openPlatformModal = function (existingPlatform, onSaved) {
  const isEdit = Boolean(existingPlatform && existingPlatform.id);
  const values = existingPlatform ? Object.assign({}, existingPlatform) : {};

  App.ui.open({
    title: isEdit ? '🏢 Edit Platform / Provider' : '🏢 Register New Platform / Provider',
    small: true,
    bodyHtml: `
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
        Configure platform profile, default investor reference, and preferred asset class for automated deal attribution.
      </div>
      ${App.ui.renderForm(App.dialogs.PLATFORM_FIELDS, values)}
    `,
    actions: [
      { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
      {
        label: isEdit ? 'Save Changes' : 'Create Platform',
        primary: true,
        onClick: async () => {
          const { values: formValues, errors } = App.ui.readForm(App.dialogs.PLATFORM_FIELDS);
          if (errors.length) {
            App.utils.toast('Platform Name is required', 'err');
            return;
          }
          try {
            let res;
            if (isEdit) {
              res = await App.api.updatePlatform(existingPlatform.id, formValues);
              App.utils.toast('Platform updated successfully', 'ok');
            } else {
              res = await App.api.createPlatform(formValues);
              App.utils.toast('Platform added successfully', 'ok');
            }
            App.state.platforms = await App.api.listPlatforms();
            App.ui.close();
            if (onSaved) onSaved(res || formValues);
          } catch (e) {
            App.utils.toast('Could not save platform: ' + (e.message || e), 'err');
          }
        }
      }
    ]
  });
};

