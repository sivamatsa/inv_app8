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

  return { open, modal: open, close, renderForm, readForm, fieldHtml };
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

