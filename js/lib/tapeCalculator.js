/* Interactive Excel & Financial Tape Scratchpad for Personal Investment OS (PIOS)
   Live row-by-row adding machine, formula parser, running totals, presets, and export utilities. */
window.App = window.App || {};

App.tapeCalculator = (function () {
  const STORAGE_KEY = 'pios_tape_calc_rows_v1';

  const PRESET_TEMPLATES = {
    cashflow: {
      name: '💵 Monthly Cashflow & Savings Budget',
      rows: [
        { label: 'Primary Salary / Take-Home', op: '+', amount: 150000, qty: 1, category: 'Income' },
        { label: 'P2P Lending Interest (12% Club / LiquiLoans)', op: '+', amount: 14500, qty: 1, category: 'Passive' },
        { label: 'Invoice Discounting Yield (KredX)', op: '+', amount: 8200, qty: 1, category: 'Passive' },
        { label: 'Dividend Payouts', op: '+', amount: 3500, qty: 1, category: 'Passive' },
        { label: 'Home Rent / Maintenance', op: '-', amount: 32000, qty: 1, category: 'Living' },
        { label: 'Groceries & Household Supplies', op: '-', amount: 18000, qty: 1, category: 'Living' },
        { label: 'SIP Mutual Funds (Index & Flexi-cap)', op: '-', amount: 45000, qty: 1, category: 'Investment' },
        { label: 'Direct Stocks SIP', op: '-', amount: 20000, qty: 1, category: 'Investment' },
        { label: 'SGB & Digital Gold SIP', op: '-', amount: 5000, qty: 1, category: 'Gold' },
        { label: 'Health & Term Insurance Amortization', op: '-', amount: 4200, qty: 1, category: 'Insurance' },
        { label: 'Discretionary / Leisure & Subscriptions', op: '-', amount: 12000, qty: 1, category: 'Discretionary' },
      ],
    },
    networth: {
      name: '🏛️ Net Worth Statement',
      rows: [
        { label: 'Equity Mutual Funds & Direct Shares', op: '+', amount: 3250000, qty: 1, category: 'Equity' },
        { label: 'P2P Lending & Debt Instruments', op: '+', amount: 1450000, qty: 1, category: 'Fixed Income' },
        { label: 'EPF / VPF / PPF Balance', op: '+', amount: 980000, qty: 1, category: 'Retirement' },
        { label: 'Physical Gold & Sovereign Gold Bonds', op: '+', amount: 650000, qty: 1, category: 'Precious Metals' },
        { label: 'Emergency Fund (High-yield Savings/FD)', op: '+', amount: 500000, qty: 1, category: 'Cash' },
        { label: 'Real Estate Equity Value', op: '+', amount: 4500000, qty: 1, category: 'Real Estate' },
        { label: 'Home Loan Outstanding Principal', op: '-', amount: 2800000, qty: 1, category: 'Liability' },
        { label: 'Car Loan Outstanding', op: '-', amount: 350000, qty: 1, category: 'Liability' },
        { label: 'Credit Card Current Cycle', op: '-', amount: 45000, qty: 1, category: 'Liability' },
      ],
    },
    tax80c: {
      name: '🧾 Tax Deductions & 80C Tally',
      rows: [
        { label: 'EPF Employee Contribution', op: '+', amount: 72000, qty: 1, category: '80C' },
        { label: 'PPF Annual Deposit', op: '+', amount: 50000, qty: 1, category: '80C' },
        { label: 'ELSS Tax Saver Mutual Funds', op: '+', amount: 28000, qty: 1, category: '80C' },
        { label: 'Life Insurance Premium', op: '+', amount: 25000, qty: 1, category: '80C' },
        { label: 'NPS Additional Tier 1 (80CCD 1B)', op: '+', amount: 50000, qty: 1, category: '80CCD' },
        { label: 'Health Insurance Premium Self & Family (80D)', op: '+', amount: 25000, qty: 1, category: '80D' },
        { label: 'Health Insurance Parents Senior Citizen (80D)', op: '+', amount: 50000, qty: 1, category: '80D' },
        { label: 'Home Loan Interest Deduction (Section 24b)', op: '+', amount: 200000, qty: 1, category: 'Section 24' },
      ],
    },
    syndicate: {
      name: '🤝 Syndicate & Deal Splitter',
      rows: [
        { label: 'Total Deal Purchase Value', op: '+', amount: 2500000, qty: 1, category: 'Principal' },
        { label: 'Legal & Stamp Duty Diligence', op: '+', amount: 75000, qty: 1, category: 'Expenses' },
        { label: 'Platform Origination Fee', op: '+', amount: 25000, qty: 1, category: 'Expenses' },
        { label: 'Upfront Partner Discount', op: '-', amount: 50000, qty: 1, category: 'Discount' },
        { label: 'Partner A Capital Share (40%)', op: '-', amount: 1020000, qty: 1, category: 'Investor A' },
        { label: 'Partner B Capital Share (35%)', op: '-', amount: 892500, qty: 1, category: 'Investor B' },
        { label: 'Partner C Capital Share (25%)', op: '-', amount: 637500, qty: 1, category: 'Investor C' },
      ],
    },
  };

  let rows = [];

  function loadRows() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        rows = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load tape rows:', e);
    }
    if (!rows || rows.length === 0) {
      rows = JSON.parse(JSON.stringify(PRESET_TEMPLATES.cashflow.rows));
    }
  }

  function saveRows() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch (e) {
      console.warn('Failed to save tape rows:', e);
    }
  }

  // Safe Excel-like Expression Evaluator
  function evaluateFormula(inputStr) {
    if (typeof inputStr === 'number') return inputStr;
    if (!inputStr || typeof inputStr !== 'string') return 0;
    
    let expr = inputStr.trim();
    if (expr.startsWith('=')) {
      expr = expr.slice(1).trim();
    }

    // Support simple Excel-like function wrappers
    // SUM(...)
    if (/^SUM\((.*)\)$/i.test(expr)) {
      const inner = expr.match(/^SUM\((.*)\)$/i)[1];
      const parts = inner.split(',').map((p) => evaluateFormula(p));
      return parts.reduce((a, b) => a + b, 0);
    }
    // AVERAGE(...)
    if (/^AVERAGE\((.*)\)$/i.test(expr)) {
      const inner = expr.match(/^AVERAGE\((.*)\)$/i)[1];
      const parts = inner.split(',').map((p) => evaluateFormula(p));
      return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
    }
    // PMT(rate, nper, pv) -> PMT calculation
    if (/^PMT\((.*)\)$/i.test(expr)) {
      const parts = expr.match(/^PMT\((.*)\)$/i)[1].split(',').map((p) => Number(p.trim().replace('%', '')) / (p.includes('%') ? 100 : 1));
      if (parts.length >= 3) {
        const [r, n, pv] = parts;
        const ratePerPeriod = r / 12;
        const nper = n * 12;
        return (pv * ratePerPeriod * Math.pow(1 + ratePerPeriod, nper)) / (Math.pow(1 + ratePerPeriod, nper) - 1);
      }
    }

    // Clean arithmetic: only allow digits, operators, parens, decimal
    const sanitized = expr.replace(/[^0-9+\-*/().,%]/g, '');
    if (!sanitized) return 0;

    try {
      // Replace percentages e.g. 18% with (18/100)
      const withPerc = sanitized.replace(/(\d+(\.\d+)?)%/g, '($1/100)');
      // eslint-disable-next-line no-new-func
      const result = Function(`'use strict'; return (${withPerc})`)();
      return typeof result === 'number' && !isNaN(result) ? result : 0;
    } catch (err) {
      return 0;
    }
  }

  function calculateTapeStats() {
    let runningTotal = 0;
    let positiveSum = 0;
    let negativeSum = 0;
    let validCount = 0;
    const computedRows = [];
    const values = [];

    rows.forEach((r, idx) => {
      const parsedAmount = typeof r.amount === 'string' ? evaluateFormula(r.amount) : (Number(r.amount) || 0);
      const qty = Number(r.qty) || 1;
      const subtotal = parsedAmount * qty;
      const op = r.op || '+';

      let signedValue = 0;
      if (op === '+') {
        signedValue = subtotal;
        positiveSum += subtotal;
      } else if (op === '-') {
        signedValue = -subtotal;
        negativeSum += subtotal;
      } else if (op === '*') {
        signedValue = runningTotal * (parsedAmount - 1);
      } else if (op === '/') {
        signedValue = parsedAmount !== 0 ? (runningTotal / parsedAmount) - runningTotal : 0;
      }

      runningTotal += signedValue;
      values.push(subtotal);
      validCount++;

      computedRows.push({
        ...r,
        parsedAmount,
        subtotal,
        signedValue,
        runningTotal,
      });
    });

    const average = validCount > 0 ? (positiveSum + negativeSum) / validCount : 0;
    const maxVal = values.length ? Math.max(...values) : 0;
    const minVal = values.length ? Math.min(...values) : 0;

    return {
      runningTotal,
      positiveSum,
      negativeSum,
      validCount,
      average,
      maxVal,
      minVal,
      computedRows,
    };
  }

  function render(containerId) {
    loadRows();
    const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!target) return;

    const stats = calculateTapeStats();
    const currSym = App.currency ? App.currency.getActiveSymbol() : '₹';

    target.innerHTML = `
      <div class="tape-calc-wrapper">
        <!-- Top Live Summary Bar (Excel-Style Ribbon / Adding Machine Header) -->
        <div class="tape-summary-ribbon">
          <div class="tape-grand-total-card">
            <div class="tape-grand-label">LIVE GRAND TOTAL (NET SUM)</div>
            <div class="tape-grand-amount ${stats.runningTotal >= 0 ? 'pos' : 'neg'}">
              ${stats.runningTotal < 0 ? '-' : ''}${currSym}${Math.abs(stats.runningTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <div class="tape-grand-meta">
              <span><b>${stats.validCount}</b> items</span> &bull; 
              <span>Avg: <b>${currSym}${stats.average.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></span>
            </div>
          </div>

          <div class="tape-kpi-grid">
            <div class="tape-kpi-box pos">
              <span class="kpi-tag">➕ Credits / Inflow</span>
              <span class="kpi-val">+${currSym}${stats.positiveSum.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
            <div class="tape-kpi-box neg">
              <span class="kpi-tag">➖ Debits / Outflow</span>
              <span class="kpi-val">-${currSym}${stats.negativeSum.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
            <div class="tape-kpi-box">
              <span class="kpi-tag">🔝 Highest Value</span>
              <span class="kpi-val">${currSym}${stats.maxVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
            <div class="tape-kpi-box">
              <span class="kpi-tag">🔍 Lowest Value</span>
              <span class="kpi-val">${currSym}${stats.minVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>

        <!-- Toolbar / Action Strip -->
        <div class="tape-toolbar">
          <div class="tape-toolbar-left">
            <button class="btn btn-sm btn-gold" id="btnTapeAddRow">➕ Add Line</button>
            <button class="btn btn-sm btn-outline" id="btnTapeAdd10Rows">⚡ Add 5 Lines</button>
            <div class="tape-preset-dropdown-wrap">
              <select id="tapePresetSelect" class="tape-select-sm">
                <option value="">📂 Load Preset Template...</option>
                <option value="cashflow">💵 Monthly Cashflow & Budget</option>
                <option value="networth">🏛️ Net Worth Statement</option>
                <option value="tax80c">🧾 Tax Deductions & 80C Tally</option>
                <option value="syndicate">🤝 Syndicate & Deal Splitter</option>
              </select>
            </div>
          </div>

          <div class="tape-toolbar-right">
            <button class="btn btn-sm btn-outline" id="btnTapeCopyTable" title="Copy as Markdown Table">📋 Copy Table</button>
            <button class="btn btn-sm btn-outline" id="btnTapeExportCsv" title="Export CSV spreadsheet">📥 Export CSV</button>
            <button class="btn btn-sm btn-outline" id="btnTapeAskAi" title="Send to Gemini AI Advisor">✨ Analyze with AI</button>
            <button class="btn btn-sm btn-danger" id="btnTapeClear" title="Clear all rows">🗑️ Clear</button>
          </div>
        </div>

        <!-- Interactive Tape Grid / Mini-Spreadsheet -->
        <div class="tape-table-scroll-host">
          <table class="tape-grid-table">
            <thead>
              <tr>
                <th style="width:36px;text-align:center">#</th>
                <th style="width:55px;text-align:center">Op</th>
                <th>Item / Description / Label</th>
                <th style="width:130px">Category</th>
                <th style="width:170px;text-align:right">Value / Excel Formula</th>
                <th style="width:75px;text-align:center">Qty</th>
                <th style="width:130px;text-align:right">Subtotal</th>
                <th style="width:140px;text-align:right">Running Tape Sum</th>
                <th style="width:70px;text-align:center">Actions</th>
              </tr>
            </thead>
            <tbody id="tapeTableBody">
              ${stats.computedRows.map((r, i) => `
                <tr class="tape-row" data-row-index="${i}">
                  <td class="tape-cell-num">${i + 1}</td>
                  <td class="tape-cell-op">
                    <select class="tape-op-select" data-field="op">
                      <option value="+" ${r.op === '+' ? 'selected' : ''}>+ Add</option>
                      <option value="-" ${r.op === '-' ? 'selected' : ''}>- Sub</option>
                      <option value="*" ${r.op === '*' ? 'selected' : ''}>× Mult</option>
                      <option value="/" ${r.op === '/' ? 'selected' : ''}>÷ Div</option>
                    </select>
                  </td>
                  <td>
                    <input 
                      type="text" 
                      class="tape-input tape-label-input" 
                      placeholder="e.g. Salary, Rent, Interest..." 
                      value="${App.utils.escapeHtml(r.label || '')}" 
                      data-field="label"
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      class="tape-input tape-cat-input" 
                      placeholder="General" 
                      value="${App.utils.escapeHtml(r.category || '')}" 
                      data-field="category"
                    />
                  </td>
                  <td>
                    <div class="tape-formula-input-wrap">
                      <input 
                        type="text" 
                        class="tape-input tape-amount-input" 
                        placeholder="0 or =SUM(100, 200)" 
                        value="${r.amount !== undefined ? r.amount : ''}" 
                        data-field="amount"
                      />
                    </div>
                  </td>
                  <td>
                    <input 
                      type="number" 
                      step="any" 
                      class="tape-input tape-qty-input" 
                      value="${r.qty !== undefined ? r.qty : 1}" 
                      data-field="qty"
                    />
                  </td>
                  <td class="tape-subtotal-cell ${r.signedValue >= 0 ? 'pos' : 'neg'}">
                    ${r.signedValue < 0 ? '-' : '+'}${currSym}${Math.abs(r.subtotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td class="tape-running-cell ${r.runningTotal >= 0 ? 'pos' : 'neg'}">
                    ${currSym}${r.runningTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td class="tape-cell-actions">
                    <button class="tape-act-btn" data-act="dup" title="Duplicate Row">📄</button>
                    <button class="tape-act-btn tape-act-del" data-act="del" title="Delete Row">✕</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="tape-total-footer-row">
                <td colspan="4" style="text-align:right;font-weight:700;font-size:13px">
                  GRAND TAPE TOTAL (${stats.validCount} Items):
                </td>
                <td colspan="2" style="font-size:11px;color:var(--text2)">
                  Positive: +${currSym}${stats.positiveSum.toLocaleString('en-IN')} | Negative: -${currSym}${stats.negativeSum.toLocaleString('en-IN')}
                </td>
                <td colspan="2" class="tape-footer-total ${stats.runningTotal >= 0 ? 'pos' : 'neg'}" style="text-align:right;font-size:15px;font-weight:800">
                  ${currSym}${stats.runningTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Formula Guide & Helper Ribbon -->
        <div class="tape-formula-guide">
          <div class="guide-title">💡 Excel Formulas & Shortcuts Supported in Value Cells:</div>
          <div class="guide-chips">
            <span class="guide-chip"><code>=10000 * 1.18</code> (GST add-on)</span>
            <span class="guide-chip"><code>=SUM(5000, 12000, 3500)</code></span>
            <span class="guide-chip"><code>=AVERAGE(1200, 1400, 1800)</code></span>
            <span class="guide-chip"><code>=50000 * (1 + 0.12/12)^12</code> (Compound Interest)</span>
            <span class="guide-chip"><code>=PMT(9.5%, 5, 2000000)</code> (Monthly EMI on 20L loan)</span>
            <span class="guide-chip">Press <b>Enter</b> on any cell to quickly add next line</span>
          </div>
        </div>
      </div>
    `;

    bindEvents(target);
  }

  function bindEvents(container) {
    const addBtn = container.querySelector('#btnTapeAddRow');
    const add5Btn = container.querySelector('#btnTapeAdd10Rows');
    const presetSelect = container.querySelector('#tapePresetSelect');
    const clearBtn = container.querySelector('#btnTapeClear');
    const copyBtn = container.querySelector('#btnTapeCopyTable');
    const exportCsvBtn = container.querySelector('#btnTapeExportCsv');
    const askAiBtn = container.querySelector('#btnTapeAskAi');

    addBtn?.addEventListener('click', () => {
      rows.push({ label: '', op: '+', amount: 0, qty: 1, category: 'General' });
      saveRows();
      render(container);
      focusLastRow(container);
    });

    add5Btn?.addEventListener('click', () => {
      for (let i = 0; i < 5; i++) {
        rows.push({ label: '', op: '+', amount: 0, qty: 1, category: 'General' });
      }
      saveRows();
      render(container);
      focusLastRow(container);
    });

    presetSelect?.addEventListener('change', (e) => {
      const key = e.target.value;
      if (key && PRESET_TEMPLATES[key]) {
        if (rows.length > 0 && !confirm('Load template? This will replace current tape numbers.')) {
          presetSelect.value = '';
          return;
        }
        rows = JSON.parse(JSON.stringify(PRESET_TEMPLATES[key].rows));
        saveRows();
        render(container);
        App.utils.toast(`Loaded: ${PRESET_TEMPLATES[key].name}`);
      }
    });

    clearBtn?.addEventListener('click', () => {
      rows = [{ label: '', op: '+', amount: 0, qty: 1, category: 'General' }];
      saveRows();
      render(container);
      App.utils.toast('Tape calculations cleared');
    });

    copyBtn?.addEventListener('click', () => {
      const stats = calculateTapeStats();
      const currSym = App.currency ? App.currency.getActiveSymbol() : '₹';
      let md = `| # | Op | Description | Category | Value | Qty | Subtotal | Running Sum |\n|---|---|---|---|---|---|---|---|\n`;
      stats.computedRows.forEach((r, i) => {
        md += `| ${i + 1} | ${r.op} | ${r.label || '—'} | ${r.category || '—'} | ${currSym}${r.parsedAmount.toLocaleString('en-IN')} | ${r.qty} | ${currSym}${r.subtotal.toLocaleString('en-IN')} | ${currSym}${r.runningTotal.toLocaleString('en-IN')} |\n`;
      });
      md += `\n**Grand Net Total**: ${currSym}${stats.runningTotal.toLocaleString('en-IN')}`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(md).then(() => {
          App.utils.toast('Copied tape calculations as Markdown table');
        });
      }
    });

    exportCsvBtn?.addEventListener('click', () => {
      const stats = calculateTapeStats();
      let csv = 'Index,Operation,Description,Category,Value,Quantity,Subtotal,RunningTotal\n';
      stats.computedRows.forEach((r, i) => {
        const safeLabel = `"${(r.label || '').replace(/"/g, '""')}"`;
        const safeCat = `"${(r.category || '').replace(/"/g, '""')}"`;
        csv += `${i + 1},${r.op},${safeLabel},${safeCat},${r.parsedAmount},${r.qty},${r.subtotal},${r.runningTotal}\n`;
      });
      csv += `,,,GRAND TOTAL,,,,${stats.runningTotal}\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PIOS_Calculator_Tape_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      App.utils.toast('Exported tape as CSV spreadsheet');
    });

    askAiBtn?.addEventListener('click', () => {
      const stats = calculateTapeStats();
      const currSym = App.currency ? App.currency.getActiveSymbol() : '₹';
      let summaryText = `Please analyze my current financial tape calculation:\n\n`;
      summaryText += `- Total Items: ${stats.validCount}\n`;
      summaryText += `- Positive Inflows: ${currSym}${stats.positiveSum.toLocaleString('en-IN')}\n`;
      summaryText += `- Negative Outflows: ${currSym}${stats.negativeSum.toLocaleString('en-IN')}\n`;
      summaryText += `- Net Sum: ${currSym}${stats.runningTotal.toLocaleString('en-IN')}\n\n`;
      summaryText += `Items breakdown:\n`;
      stats.computedRows.forEach((r, i) => {
        if (r.label || r.parsedAmount) {
          summaryText += `${i + 1}. [${r.op}] ${r.label || 'Item'} (${r.category || 'General'}): ${currSym}${r.subtotal.toLocaleString('en-IN')}\n`;
        }
      });
      summaryText += `\nWhat insights, tax optimizations, or cashflow improvements do you recommend based on these numbers?`;

      if (App.chatbot && App.chatbot.ask) {
        App.chatbot.ask(summaryText, 'advisor');
      } else {
        App.utils.toast('AI Advisor opened with calculations');
      }
    });

    // Row fields edit & key navigation
    container.querySelectorAll('.tape-row').forEach((rowEl) => {
      const idx = Number(rowEl.dataset.rowIndex);

      rowEl.querySelectorAll('[data-field]').forEach((inputEl) => {
        const field = inputEl.dataset.field;

        inputEl.addEventListener('change', (e) => {
          if (rows[idx]) {
            rows[idx][field] = e.target.value;
            saveRows();
            render(container);
          }
        });

        inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (rows[idx]) {
              rows[idx][field] = e.target.value;
              saveRows();
            }
            // If last row, add new row
            if (idx === rows.length - 1) {
              rows.push({ label: '', op: '+', amount: 0, qty: 1, category: 'General' });
              saveRows();
              render(container);
              focusLastRow(container);
            } else {
              render(container);
              focusNextRow(container, idx + 1, field);
            }
          }
        });
      });

      // Actions
      rowEl.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          if (act === 'del') {
            rows.splice(idx, 1);
            if (rows.length === 0) rows = [{ label: '', op: '+', amount: 0, qty: 1, category: 'General' }];
            saveRows();
            render(container);
          } else if (act === 'dup') {
            const copy = JSON.parse(JSON.stringify(rows[idx]));
            rows.splice(idx + 1, 0, copy);
            saveRows();
            render(container);
          }
        });
      });
    });
  }

  function focusLastRow(container) {
    setTimeout(() => {
      const inputs = container.querySelectorAll('.tape-label-input');
      if (inputs.length) {
        inputs[inputs.length - 1].focus();
      }
    }, 50);
  }

  function focusNextRow(container, nextIdx, field) {
    setTimeout(() => {
      const row = container.querySelector(`[data-row-index="${nextIdx}"]`);
      if (row) {
        const inp = row.querySelector(`[data-field="${field}"]`) || row.querySelector('.tape-label-input');
        if (inp) inp.focus();
      }
    }, 50);
  }

  return {
    render,
    getStats: calculateTapeStats,
    getRows: () => rows,
  };
})();
