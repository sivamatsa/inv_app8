/* Automation Center (037_automation_center.sql) - a user-configurable
   IF-condition-THEN-notify rules engine, deliberately notify-only (never
   mutates a deal, recurring item, or any other row unsupervised - an
   explicit decision, not a limitation). Features a catalog of rule types,
   curated presets library, live evaluation simulator, and AI-powered
   vulnerability guardrails & natural-language rule generator. */
window.App = window.App || {};

(function () {
  const RULE_TYPES = [
    { key: 'ACCOUNT_BALANCE_BELOW', label: 'Account Balance Below', icon: '🏦', desc: 'Alert when a specific (or any) account drops below a balance threshold.' },
    { key: 'LIABILITY_OUTSTANDING_ABOVE', label: 'Liability Rising Above', icon: '💳', desc: "Alert when a liability's outstanding balance rises above an amount." },
    { key: 'EXPENSE_BUDGET_PCT', label: 'Expense Budget %', icon: '📊', desc: 'Alert when an expense project or category uses a certain % of its budget.' },
    { key: 'DEAL_RELIABILITY_BELOW', label: 'Deal Payout Reliability Below', icon: '🤝', desc: "Alert when any active deal's payout reliability score drops below a %." },
    { key: 'RECURRING_CONSISTENCY_BELOW', label: 'Recurring Consistency Below', icon: '🔄', desc: "Alert when a recurring item's consistency score drops below a %." },
    { key: 'NET_WORTH_CHANGE_PCT', label: 'Net Worth Change %', icon: '📈', desc: 'Alert when Net Worth drops by at least this % over N days based on snapshots.' },
  ];
  const TYPE_MAP = {}; RULE_TYPES.forEach((t) => { TYPE_MAP[t.key] = t; });

  // Curated 1-Click Automation Presets
  const PRESET_RULES = [
    {
      category: 'Liquidity & Safety',
      icon: '🛡️',
      name: 'Emergency Reserve Minimum',
      rule_type: 'ACCOUNT_BALANCE_BELOW',
      threshold_value: 50000,
      description: 'Alerts when your primary cash balance dips below ₹50,000 to protect emergency runway.',
    },
    {
      category: 'Liquidity & Safety',
      icon: '⚠️',
      name: 'Zero-Balance Safety Floor',
      rule_type: 'ACCOUNT_BALANCE_BELOW',
      threshold_value: 10000,
      description: 'Alerts when any active bank account drops below ₹10,000 to prevent overdraft fees.',
    },
    {
      category: 'Liquidity & Safety',
      icon: '💳',
      name: 'Debt Spike Sentinel',
      rule_type: 'LIABILITY_OUTSTANDING_ABOVE',
      threshold_value: 200000,
      description: 'Alerts when outstanding debt or credit card balance crosses ₹2,00,000.',
    },
    {
      category: 'Investment & Risk',
      icon: '🚨',
      name: 'Deal Delinquency Warning',
      rule_type: 'DEAL_RELIABILITY_BELOW',
      threshold_value: 85,
      description: 'Warns when any active borrower or investment platform drops below 85% payout reliability.',
    },
    {
      category: 'Investment & Risk',
      icon: '📉',
      name: 'Net Worth Drop Shock-Absorber',
      rule_type: 'NET_WORTH_CHANGE_PCT',
      threshold_value: -5,
      lookback_days: 30,
      description: 'Alerts if total net worth declines by 5% or more within the past 30 days.',
    },
    {
      category: 'Cash Flow & Budget',
      icon: '📊',
      name: 'Project Budget 80% Warning',
      rule_type: 'EXPENSE_BUDGET_PCT',
      threshold_value: 80,
      description: 'Proactive early warning when any project or category consumes 80% of its budget.',
    },
    {
      category: 'Cash Flow & Budget',
      icon: '🛑',
      name: 'Critical Budget Cap (95%)',
      rule_type: 'EXPENSE_BUDGET_PCT',
      threshold_value: 95,
      description: 'High-urgency alert when an expense project reaches 95% of total budget limit.',
    },
    {
      category: 'Cash Flow & Budget',
      icon: '🔄',
      name: 'SIP Consistency Guardian',
      rule_type: 'RECURRING_CONSISTENCY_BELOW',
      threshold_value: 90,
      description: 'Alerts when any recurring SIP or payment commitment consistency slips below 90%.',
    },
  ];

  let currentTab = 'rules'; // 'rules' | 'simulator' | 'ai_guardrails' | 'presets'
  let filterType = 'ALL';
  let filterStatus = 'ALL';
  let searchKeyword = '';

  function conditionText(rule, accounts = [], liabilities = [], projects = []) {
    let scopeName = '';
    if (rule.target_id) {
      if (rule.rule_type === 'ACCOUNT_BALANCE_BELOW') {
        const a = accounts.find((x) => String(x.id) === String(rule.target_id));
        scopeName = a ? ` [${a.account_name}]` : '';
      } else if (rule.rule_type === 'LIABILITY_OUTSTANDING_ABOVE') {
        const l = liabilities.find((x) => String(x.id) === String(rule.target_id));
        scopeName = l ? ` [${l.liability_name}]` : '';
      } else if (rule.rule_type === 'EXPENSE_BUDGET_PCT') {
        const p = projects.find((x) => String(x.id) === String(rule.target_id));
        scopeName = p ? ` [${p.name}]` : '';
      }
    }
    switch (rule.rule_type) {
      case 'ACCOUNT_BALANCE_BELOW': return `Balance < ${App.utils.fmtMoney(rule.threshold_value)}${scopeName}`;
      case 'LIABILITY_OUTSTANDING_ABOVE': return `Outstanding > ${App.utils.fmtMoney(rule.threshold_value)}${scopeName}`;
      case 'EXPENSE_BUDGET_PCT': return `Budget used &ge; ${rule.threshold_value}%${scopeName}`;
      case 'DEAL_RELIABILITY_BELOW': return `Reliability < ${rule.threshold_value}%`;
      case 'RECURRING_CONSISTENCY_BELOW': return `Consistency < ${rule.threshold_value}%`;
      case 'NET_WORTH_CHANGE_PCT': return `Change &le; ${rule.threshold_value}% over ~${rule.lookback_days || 30}d`;
      default: return '—';
    }
  }

  async function renderAutomationCenterView() {
    const pane = App.utils.qs('#pane-automation');
    pane.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <span style="font-size:20px;font-weight:700">Automation Center</span>
          <div class="line" style="display:inline-block"></div>
          <small style="color:var(--text2)">Proactive IF-condition-THEN-notify rules &bull; AI Guardrails &bull; Live Simulator</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" id="acAiPromptBtn">✨ AI Generate Rule</button>
          <button class="btn btn-outline btn-sm" id="acRunAllBtn">⚡ Run Evaluator</button>
          <button class="btn btn-gold btn-sm" id="acNewRuleBtn">+ New Rule</button>
        </div>
      </div>

      <!-- Segmented Navigation Tabs -->
      <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:8px;flex-wrap:wrap" id="acTabsBar">
        <button class="btn btn-sm ${currentTab === 'rules' ? 'btn-gold' : 'btn-outline'}" data-ac-tab="rules">📜 Active Rules & Governance</button>
        <button class="btn btn-sm ${currentTab === 'simulator' ? 'btn-gold' : 'btn-outline'}" data-ac-tab="simulator">⚡ Live Rule Simulator</button>
        <button class="btn btn-sm ${currentTab === 'ai_guardrails' ? 'btn-gold' : 'btn-outline'}" data-ac-tab="ai_guardrails">🤖 AI Guardrail Scanner</button>
        <button class="btn btn-sm ${currentTab === 'presets' ? 'btn-gold' : 'btn-outline'}" data-ac-tab="presets">📚 Presets Library</button>
      </div>

      <div id="acTabContent"></div>
      
      <div class="panel" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="chart-title" style="margin:0">Recently Triggered Automation Events</div>
          <button class="btn btn-sm btn-outline" id="acRefreshEventsBtn">&#8635; Refresh</button>
        </div>
        <div id="acRecent"></div>
      </div>`;

    // Tab switcher
    App.utils.qsa('#acTabsBar [data-ac-tab]', pane).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.acTab;
        App.utils.qsa('#acTabsBar [data-ac-tab]', pane).forEach((b) => {
          b.className = `btn btn-sm ${b.dataset.acTab === currentTab ? 'btn-gold' : 'btn-outline'}`;
        });
        drawTabContent();
      });
    });

    App.utils.qs('#acNewRuleBtn', pane).addEventListener('click', () => openRuleForm(null, drawTabContent));
    App.utils.qs('#acAiPromptBtn', pane).addEventListener('click', () => openAiPromptModal(drawTabContent));
    App.utils.qs('#acRunAllBtn', pane).addEventListener('click', async () => {
      currentTab = 'simulator';
      App.utils.qsa('#acTabsBar [data-ac-tab]', pane).forEach((b) => {
        b.className = `btn btn-sm ${b.dataset.acTab === 'simulator' ? 'btn-gold' : 'btn-outline'}`;
      });
      await drawTabContent();
      await runLiveEvaluation(true);
    });
    App.utils.qs('#acRefreshEventsBtn', pane).addEventListener('click', drawRecentEvents);

    await drawTabContent();
    await drawRecentEvents();
  }

  async function drawRecentEvents() {
    const pane = App.utils.qs('#pane-automation');
    const recent = await App.api.listNotifications({ eq: { type: 'Automation Rule Triggered' }, limit: 15 }).catch(() => []);
    const host = App.utils.qs('#acRecent', pane);
    if (!host) return;
    host.innerHTML = recent.length
      ? recent.map((n) => `
        <div class="stat-line" style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600;font-size:13px">${App.utils.escapeHtml(n.title)}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">${App.utils.escapeHtml(n.message || '')}</div>
          </div>
          <div style="text-align:right">
            <span class="badge ${n.status === 'Read' ? 'st-completed' : 'st-active'}">${n.status || 'Pending'}</span>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">${App.utils.fmtDateTime(n.scheduled_at || n.created_at)}</div>
          </div>
        </div>`).join('')
      : '<div class="empty-note" style="padding:16px;text-align:center;color:var(--text3)">Nothing triggered recently. Rules are automatically checked on the background automation cycle or upon manual simulation.</div>';
  }

  async function drawTabContent() {
    const host = App.utils.qs('#acTabContent');
    if (!host) return;

    if (currentTab === 'rules') {
      await drawRulesTab(host);
    } else if (currentTab === 'simulator') {
      await drawSimulatorTab(host);
    } else if (currentTab === 'ai_guardrails') {
      await drawAiGuardrailsTab(host);
    } else if (currentTab === 'presets') {
      await drawPresetsTab(host);
    }
  }

  /* --------------------------------------------------------------------------
     TAB 1: Active Rules & Governance
  -------------------------------------------------------------------------- */
  async function drawRulesTab(host) {
    const [rules, accounts, liabilities, projects] = await Promise.all([
      App.api.listAutomationRules().catch(() => []),
      App.api.listAccounts().catch(() => []),
      App.api.listLiabilities().catch(() => []),
      App.api.listExpenseProjects().catch(() => []),
    ]);

    let filtered = rules.slice();
    if (filterStatus === 'ACTIVE') filtered = filtered.filter((r) => r.is_active);
    if (filterStatus === 'PAUSED') filtered = filtered.filter((r) => !r.is_active);
    if (filterType !== 'ALL') filtered = filtered.filter((r) => r.rule_type === filterType);
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      filtered = filtered.filter((r) => (r.name || '').toLowerCase().includes(kw) || (r.rule_type || '').toLowerCase().includes(kw));
    }

    const activeCount = rules.filter((r) => r.is_active).length;
    const pausedCount = rules.length - activeCount;

    host.innerHTML = `
      <div class="panel">
        <!-- Control / Filter Bar -->
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="text" id="acSearchInput" placeholder="Search rules..." value="${App.utils.escapeHtml(searchKeyword)}" style="padding:6px 12px;font-size:13px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);width:180px">
            <select id="acFilterType" style="padding:6px 10px;font-size:13px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
              <option value="ALL" ${filterType === 'ALL' ? 'selected' : ''}>All Types (${rules.length})</option>
              ${RULE_TYPES.map((t) => `<option value="${t.key}" ${filterType === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
            <select id="acFilterStatus" style="padding:6px 10px;font-size:13px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
              <option value="ALL" ${filterStatus === 'ALL' ? 'selected' : ''}>All Statuses (${rules.length})</option>
              <option value="ACTIVE" ${filterStatus === 'ACTIVE' ? 'selected' : ''}>Active Only (${activeCount})</option>
              <option value="PAUSED" ${filterStatus === 'PAUSED' ? 'selected' : ''}>Paused Only (${pausedCount})</option>
            </select>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline" id="acActivateAllBtn" title="Activate all rules">▶ Activate All</button>
            <button class="btn btn-sm btn-outline" id="acPauseAllBtn" title="Pause all rules">⏸ Pause All</button>
            <button class="btn btn-sm btn-outline" id="acExportRulesBtn" title="Export rules as JSON">⬇ Export JSON</button>
          </div>
        </div>

        <!-- Rules Table -->
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Type</th>
                <th>Trigger Condition & Scope</th>
                <th>Status</th>
                <th>Last Triggered</th>
                <th style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((r) => {
                const typeMeta = TYPE_MAP[r.rule_type] || { label: r.rule_type, icon: '⚙️' };
                return `
                <tr>
                  <td>
                    <div style="font-weight:600">${App.utils.escapeHtml(r.name)}</div>
                  </td>
                  <td>
                    <span style="display:inline-flex;align-items:center;gap:4px">
                      <span>${typeMeta.icon}</span>
                      <span>${App.utils.escapeHtml(typeMeta.label)}</span>
                    </span>
                  </td>
                  <td>
                    <span style="font-family:monospace;font-size:12px;background:var(--card);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">
                      ${conditionText(r, accounts, liabilities, projects)}
                    </span>
                  </td>
                  <td>
                    <span class="badge ${r.is_active ? 'st-active' : 'st-cancelled'}">${r.is_active ? 'Active' : 'Paused'}</span>
                  </td>
                  <td>${r.last_triggered_at ? App.utils.fmtDateTime(r.last_triggered_at) : '<span style="color:var(--text3)">Never</span>'}</td>
                  <td style="white-space:nowrap;text-align:right">
                    <button class="btn btn-sm btn-outline" data-edit-rule="${r.id}" title="Edit rule configuration">✏️ Edit</button>
                    <button class="btn btn-sm btn-outline" data-toggle-rule="${r.id}" data-active="${r.is_active}" title="${r.is_active ? 'Pause rule' : 'Activate rule'}">
                      ${r.is_active ? '⏸ Pause' : '▶ Activate'}
                    </button>
                    <button class="btn btn-sm btn-outline" data-clone-rule="${r.id}" title="Duplicate this rule">📋 Clone</button>
                    <button class="icon-btn del" data-del-rule="${r.id}" title="Delete rule">&#128465;</button>
                  </td>
                </tr>`;
              }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:30px">
                ${rules.length === 0 ? 'No automation rules configured yet. Click "+ New Rule", "✨ AI Generate Rule", or browse "📚 Presets Library" to get started.' : 'No rules match the current search/filter.'}
              </td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    // Filter listeners
    App.utils.qs('#acSearchInput', host).addEventListener('input', (e) => {
      searchKeyword = e.target.value;
      drawRulesTab(host);
    });
    App.utils.qs('#acFilterType', host).addEventListener('change', (e) => {
      filterType = e.target.value;
      drawRulesTab(host);
    });
    App.utils.qs('#acFilterStatus', host).addEventListener('change', (e) => {
      filterStatus = e.target.value;
      drawRulesTab(host);
    });

    // Batch actions
    App.utils.qs('#acActivateAllBtn', host).addEventListener('click', async () => {
      for (const r of rules.filter((x) => !x.is_active)) {
        await App.api.updateAutomationRule(r.id, { is_active: true }).catch(() => {});
      }
      App.utils.toast('All rules activated');
      drawTabContent();
    });
    App.utils.qs('#acPauseAllBtn', host).addEventListener('click', async () => {
      for (const r of rules.filter((x) => x.is_active)) {
        await App.api.updateAutomationRule(r.id, { is_active: false }).catch(() => {});
      }
      App.utils.toast('All rules paused');
      drawTabContent();
    });
    App.utils.qs('#acExportRulesBtn', host).addEventListener('click', () => {
      const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rules, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', jsonStr);
      a.setAttribute('download', `automation_rules_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    // Row action listeners
    App.utils.qsa('[data-edit-rule]', host).forEach((b) => {
      b.addEventListener('click', () => {
        const ruleId = b.dataset.editRule;
        const targetRule = rules.find((r) => String(r.id) === String(ruleId));
        if (targetRule) openRuleForm(targetRule, drawTabContent);
      });
    });

    App.utils.qsa('[data-toggle-rule]', host).forEach((b) => {
      b.addEventListener('click', async () => {
        const ruleId = b.dataset.toggleRule;
        const active = b.dataset.active === 'true';
        try {
          await App.api.updateAutomationRule(ruleId, { is_active: !active });
          App.utils.toast(`Rule ${active ? 'paused' : 'activated'}`);
          drawTabContent();
        } catch (e) {
          App.utils.toast('Could not toggle rule: ' + (e.message || e), 'err');
        }
      });
    });

    App.utils.qsa('[data-clone-rule]', host).forEach((b) => {
      b.addEventListener('click', () => {
        const ruleId = b.dataset.cloneRule;
        const targetRule = rules.find((r) => String(r.id) === String(ruleId));
        if (targetRule) {
          const clone = Object.assign({}, targetRule, { name: `${targetRule.name} (Copy)` });
          delete clone.id;
          delete clone.created_at;
          delete clone.updated_at;
          delete clone.last_triggered_at;
          openRuleForm(clone, drawTabContent);
        }
      });
    });

    App.utils.qsa('[data-del-rule]', host).forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const ruleId = b.dataset.delRule;
        const targetRule = rules.find((r) => String(r.id) === String(ruleId));
        const ruleName = targetRule ? targetRule.name : 'this automation rule';

        App.ui.open({
          title: 'Delete Automation Rule',
          small: true,
          bodyHtml: `
            <div style="padding:8px 0">
              <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text)">Delete "${App.utils.escapeHtml(ruleName)}"?</div>
              <div style="font-size:12.5px;color:var(--text3);line-height:1.5">
                This rule will immediately stop checking thresholds and evaluating portfolio conditions. This action is permanent and cannot be undone.
              </div>
            </div>`,
          actions: [
            { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
            {
              label: '🗑️ Delete Rule',
              className: 'btn-outline',
              onClick: async () => {
                try {
                  await App.api.deleteAutomationRule(ruleId);
                  App.ui.close();
                  App.utils.toast('Automation rule deleted');
                  drawTabContent();
                } catch (err) {
                  App.utils.toast('Could not delete rule: ' + (err.message || err), 'err');
                }
              },
            },
          ],
        });
      });
    });
  }

  /* --------------------------------------------------------------------------
     TAB 2: Live Rule Simulator & Evaluator
  -------------------------------------------------------------------------- */
  async function drawSimulatorTab(host) {
    host.innerHTML = `
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
          <div>
            <div style="font-weight:700;font-size:15px">⚡ Real-Time Rule Simulator</div>
            <div style="font-size:12px;color:var(--text2)">Test all your active rules against current live portfolio readings without waiting for background cron.</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-gold" id="acRunSimBtn">▶ Run Live Test Now</button>
          </div>
        </div>
        <div id="acSimReport"><div class="empty-note" style="text-align:center;padding:24px">Click "Run Live Test Now" to evaluate all active rules against current balances, payouts, and budgets.</div></div>
      </div>`;

    App.utils.qs('#acRunSimBtn', host).addEventListener('click', () => runLiveEvaluation(false));
  }

  async function runLiveEvaluation(dispatchNotifications = false) {
    const reportHost = App.utils.qs('#acSimReport');
    if (!reportHost) return;
    reportHost.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner"></div> Evaluating rules against live portfolio data...</div>';

    try {
      const evalResult = await App.api.evaluateAutomationRules({ dispatchNotifications });
      const { evaluated, triggered, results } = evalResult;

      reportHost.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
          <div class="stat-box" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px">
            <div style="font-size:11px;color:var(--text3);text-transform:uppercase">Rules Evaluated</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px">${evaluated}</div>
          </div>
          <div class="stat-box" style="background:var(--card);border:1px solid ${triggered > 0 ? 'var(--red,#e5484d)' : 'var(--border)'};border-radius:8px;padding:12px">
            <div style="font-size:11px;color:var(--text3);text-transform:uppercase">Triggered Conditions</div>
            <div style="font-size:22px;font-weight:700;color:${triggered > 0 ? 'var(--red,#e5484d)' : 'var(--green,#30a46c)'};margin-top:4px">${triggered}</div>
          </div>
          <div class="stat-box" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px">
            <div style="font-size:11px;color:var(--text3);text-transform:uppercase">Safe / Passing</div>
            <div style="font-size:22px;font-weight:700;color:var(--green,#30a46c);margin-top:4px">${evaluated - triggered}</div>
          </div>
        </div>

        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Target Scope</th>
                <th>Current Live Metric</th>
                <th>Evaluation Result</th>
                <th style="text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${results.map((res) => `
                <tr style="background:${res.wouldTrigger ? 'rgba(229,72,77,0.05)' : 'transparent'}">
                  <td>
                    <div style="font-weight:600">${App.utils.escapeHtml(res.rule.name)}</div>
                    <div style="font-size:11px;color:var(--text3)">${App.utils.escapeHtml(res.rule.rule_type)}</div>
                  </td>
                  <td>${App.utils.escapeHtml(res.targetDesc)}</td>
                  <td><span style="font-size:12px">${App.utils.escapeHtml(res.currentValDisplay)}</span></td>
                  <td>
                    ${res.wouldTrigger
                      ? `<span class="badge st-cancelled" style="background:rgba(229,72,77,0.15);color:var(--red,#e5484d);font-weight:600">🚨 TRIGGERED</span>
                         <div style="font-size:11px;margin-top:4px;color:var(--red,#e5484d)">${App.utils.escapeHtml((res.matchedItems[0] || {}).message || '')}</div>`
                      : '<span class="badge st-active" style="background:rgba(48,164,108,0.15);color:var(--green,#30a46c)">✅ Safe (Normal)</span>'}
                  </td>
                  <td style="text-align:right">
                    ${res.wouldTrigger
                      ? `<button class="btn btn-sm btn-outline" data-dispatch-single="${res.rule.id}" data-msg="${App.utils.escapeHtml((res.matchedItems[0] || {}).message || '')}" title="Send test in-app alert">🔔 Trigger Alert</button>`
                      : '<span style="font-size:11px;color:var(--text3)">Within limits</span>'}
                  </td>
                </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:16px">No active rules to evaluate.</td></tr>'}
            </tbody>
          </table>
        </div>`;

      App.utils.qsa('[data-dispatch-single]', reportHost).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ruleId = btn.dataset.dispatchSingle;
          const msg = btn.dataset.msg;
          try {
            await App.api.createNotification({
              type: 'Automation Rule Triggered',
              title: `Test Alert: Rule Triggered`,
              message: msg || 'Simulated automation alert triggered.',
              priority: 'Medium',
              scheduled_at: new Date().toISOString(),
              status: 'Pending',
            });
            App.utils.toast('Test notification dispatched to in-app bell!');
            drawRecentEvents();
          } catch (e) {
            App.utils.toast('Could not dispatch test notification: ' + (e.message || e), 'err');
          }
        });
      });
    } catch (err) {
      reportHost.innerHTML = `<div class="auth-error">Evaluation failed: ${App.utils.escapeHtml(err.message || err)}</div>`;
    }
  }

  /* --------------------------------------------------------------------------
     TAB 3: AI Guardrail Scanner & Recommendations
  -------------------------------------------------------------------------- */
  async function drawAiGuardrailsTab(host) {
    host.innerHTML = '<div style="text-align:center;padding:30px"><div class="spinner"></div> Scanning portfolio for protection gaps & vulnerabilities...</div>';

    const [rules, accounts, liabilities, deals, recurring, expenseProjects] = await Promise.all([
      App.api.listAutomationRules().catch(() => []),
      App.api.listAccounts().catch(() => []),
      App.api.listLiabilities().catch(() => []),
      App.api.listDealMetrics().catch(() => []),
      App.api.listRecurringConsistency().catch(() => []),
      App.api.listExpenseProjects().catch(() => []),
    ]);

    const suggestions = [];

    // 1. Unprotected Bank Accounts
    accounts.filter((a) => a.is_active !== false).forEach((acc) => {
      const hasRule = rules.some((r) => r.rule_type === 'ACCOUNT_BALANCE_BELOW' && (String(r.target_id) === String(acc.id) || !r.target_id));
      if (!hasRule) {
        const bal = Number(acc.current_balance || 0);
        const safeFloor = Math.max(10000, Math.round(bal * 0.25));
        suggestions.push({
          badge: '🛡️ Cash Safety',
          title: `Protect "${acc.account_name}" Balance`,
          rationale: `Current balance is ${App.utils.fmtMoney(bal)}, but there is no floor alert configured. An alert at ${App.utils.fmtMoney(safeFloor)} prevents sudden liquidity depletion.`,
          rule: {
            name: `${acc.account_name} Minimum Balance Alert`,
            rule_type: 'ACCOUNT_BALANCE_BELOW',
            target_id: acc.id,
            threshold_value: safeFloor,
          },
        });
      }
    });

    // 2. Uncapped Liabilities
    liabilities.filter((l) => l.is_active !== false).forEach((lia) => {
      const hasRule = rules.some((r) => r.rule_type === 'LIABILITY_OUTSTANDING_ABOVE' && (String(r.target_id) === String(lia.id) || !r.target_id));
      if (!hasRule) {
        const out = Number(lia.outstanding_amount || 0);
        const ceiling = Math.round(Math.max(50000, out * 1.2));
        suggestions.push({
          badge: '💳 Debt Guard',
          title: `Cap "${lia.liability_name}" Liability`,
          rationale: `Current balance is ${App.utils.fmtMoney(out)}. Add an upper boundary alert at ${App.utils.fmtMoney(ceiling)} to catch runaway debt expansion early.`,
          rule: {
            name: `${lia.liability_name} Debt Spike Alert`,
            rule_type: 'LIABILITY_OUTSTANDING_ABOVE',
            target_id: lia.id,
            threshold_value: ceiling,
          },
        });
      }
    });

    // 3. Deals without Reliability Guardrail
    const hasDealRule = rules.some((r) => r.rule_type === 'DEAL_RELIABILITY_BELOW');
    if (!hasDealRule && deals.length > 0) {
      suggestions.push({
        badge: '🤝 Default Prevention',
        title: 'Deal Payout Reliability Sentinel',
        rationale: `You have ${deals.length} deals active. If any borrower or platform payout reliability falls below 85%, an instant alert gives you time to take recovery steps.`,
        rule: {
          name: 'Deal Reliability Drop Alert (<85%)',
          rule_type: 'DEAL_RELIABILITY_BELOW',
          threshold_value: 85,
        },
      });
    }

    // 4. Expense Budget Overflow
    expenseProjects.forEach((proj) => {
      const hasRule = rules.some((r) => r.rule_type === 'EXPENSE_BUDGET_PCT' && (String(r.target_id) === String(proj.id) || !r.target_id));
      if (!hasRule) {
        suggestions.push({
          badge: '📊 Budget Discipline',
          title: `Budget Alert for "${proj.name}"`,
          rationale: `Keep spend under control by alerting when "${proj.name}" uses 85% of its allocated funds.`,
          rule: {
            name: `${proj.name} 85% Budget Threshold`,
            rule_type: 'EXPENSE_BUDGET_PCT',
            target_id: proj.id,
            threshold_value: 85,
          },
        });
      }
    });

    // 5. Net Worth Drawdown
    const hasNwRule = rules.some((r) => r.rule_type === 'NET_WORTH_CHANGE_PCT');
    if (!hasNwRule) {
      suggestions.push({
        badge: '📈 Wealth Shield',
        title: 'Portfolio Drawdown Monitor',
        rationale: 'Set an automatic warning if your calculated net worth contracts by more than 5% over a 30-day window.',
        rule: {
          name: 'Net Worth Drawdown Alert (-5%)',
          rule_type: 'NET_WORTH_CHANGE_PCT',
          threshold_value: -5,
          lookback_days: 30,
        },
      });
    }

    host.innerHTML = `
      <div class="panel">
        <div style="margin-bottom:14px">
          <div style="font-weight:700;font-size:15px">🤖 AI Portfolio Vulnerability Scanner</div>
          <div style="font-size:12px;color:var(--text2)">AI has evaluated your current accounts, liabilities, and deals, and identified ${suggestions.length} high-value protection guardrails:</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:14px">
          ${suggestions.map((s, idx) => `
            <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px;display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <span class="badge" style="background:rgba(212,175,55,0.15);color:var(--gold,#d4af37)">${s.badge}</span>
                  <span style="font-size:11px;color:var(--text3)">Confidence: 96%</span>
                </div>
                <div style="font-weight:700;font-size:14px;margin-bottom:6px">${App.utils.escapeHtml(s.title)}</div>
                <div style="font-size:12px;color:var(--text2);line-height:1.4;margin-bottom:12px">${App.utils.escapeHtml(s.rationale)}</div>
              </div>
              <button class="btn btn-sm btn-gold" data-apply-guardrail="${idx}" style="width:100%">+ Apply AI Guardrail</button>
            </div>`).join('') || '<div class="empty-note" style="grid-column:1/-1;text-align:center;padding:24px">All core areas of your portfolio have active automation guardrails configured!</div>'}
        </div>
      </div>`;

    App.utils.qsa('[data-apply-guardrail]', host).forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = suggestions[Number(btn.dataset.applyGuardrail)];
        if (item) openRuleForm(item.rule, drawTabContent);
      });
    });
  }

  /* --------------------------------------------------------------------------
     TAB 4: Presets Library
  -------------------------------------------------------------------------- */
  async function drawPresetsTab(host) {
    const categories = ['Liquidity & Safety', 'Investment & Risk', 'Cash Flow & Budget'];

    host.innerHTML = `
      <div class="panel">
        <div style="margin-bottom:14px">
          <div style="font-weight:700;font-size:15px">📚 Curated Automation Presets</div>
          <div style="font-size:12px;color:var(--text2)">Deploy proven, industry-standard financial guardrails with a single click.</div>
        </div>

        ${categories.map((cat) => {
          const items = PRESET_RULES.filter((p) => p.category === cat);
          return `
            <div style="margin-bottom:20px">
              <div style="font-weight:600;font-size:13px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">${cat}</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px">
                ${items.map((preset, idx) => `
                  <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px;display:flex;flex-direction:column;justify-content:space-between">
                    <div>
                      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                        <span style="font-size:18px">${preset.icon}</span>
                        <span style="font-weight:600;font-size:14px">${App.utils.escapeHtml(preset.name)}</span>
                      </div>
                      <div style="font-size:12px;color:var(--text2);line-height:1.4;margin-bottom:12px">${App.utils.escapeHtml(preset.description)}</div>
                    </div>
                    <button class="btn btn-sm btn-outline" data-use-preset="${cat}_${idx}">Use Preset</button>
                  </div>`).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>`;

    App.utils.qsa('[data-use-preset]', host).forEach((btn) => {
      btn.addEventListener('click', () => {
        const [cat, idxStr] = btn.dataset.usePreset.split('_');
        const items = PRESET_RULES.filter((p) => p.category === cat);
        const p = items[Number(idxStr)];
        if (p) {
          openRuleForm({
            name: p.name,
            rule_type: p.rule_type,
            threshold_value: p.threshold_value,
            lookback_days: p.lookback_days || 30,
          }, drawTabContent);
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     AI Natural Language "Prompt to Rule" Modal
  -------------------------------------------------------------------------- */
  async function openAiPromptModal(onDone) {
    const [accounts, liabilities, projects] = await Promise.all([
      App.api.listAccounts().catch(() => []),
      App.api.listLiabilities().catch(() => []),
      App.api.listExpenseProjects().catch(() => []),
    ]);

    const examples = [
      'Alert me if my ICICI Bank account balance drops below 25000',
      'Notify me if any project spends more than 85% of budget',
      'Warn me if my deals payout reliability slips below 80 percent',
      'Alert me if credit card liability rises above 150000',
      'Alert if net worth contracts by more than 7% in the past 45 days',
    ];

    const bodyHtml = `
      <div style="margin-bottom:12px">
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px">Describe the condition in plain English. The AI engine will parse the condition, match target accounts or projects, and configure the optimal rule:</div>
        <textarea id="acAiPromptInput" rows="3" placeholder="e.g. Alert me if my salary account balance drops below 30,000" style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px"></textarea>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Quick Example Prompts:</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${examples.map((ex) => `<button class="btn btn-sm btn-outline" style="text-align:left;font-size:12px" data-ac-example="${App.utils.escapeHtml(ex)}">💬 ${App.utils.escapeHtml(ex)}</button>`).join('')}
        </div>
      </div>

      <div id="acAiParseResult"></div>
      <div class="auth-error" id="acAiPromptError"></div>`;

    App.ui.open({
      title: '✨ AI Natural Language Rule Generator',
      bodyHtml,
      onMount: (body) => {
        App.utils.qsa('[data-ac-example]', body).forEach((b) => {
          b.addEventListener('click', () => {
            App.utils.qs('#acAiPromptInput', body).value = b.dataset.acExample;
            parsePrompt(b.dataset.acExample, body);
          });
        });

        App.utils.qs('#acAiPromptInput', body).addEventListener('input', (e) => {
          if (e.target.value.length > 8) parsePrompt(e.target.value, body);
        });
      },
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: '✨ Parse & Configure Rule',
          className: 'btn-gold',
          onClick: async () => {
            const prompt = App.utils.qs('#acAiPromptInput').value.trim();
            if (!prompt) {
              App.utils.qs('#acAiPromptError').textContent = 'Please enter a prompt or select an example.';
              return;
            }
            const parsed = doParseNlRule(prompt, accounts, liabilities, projects);
            App.ui.close();
            openRuleForm(parsed, onDone);
          },
        },
      ],
    });

    function parsePrompt(text, body) {
      const resHost = App.utils.qs('#acAiParseResult', body);
      const parsed = doParseNlRule(text, accounts, liabilities, projects);
      resHost.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:6px;padding:10px;margin-top:8px">
          <div style="font-weight:600;font-size:12px;color:var(--gold,#d4af37);margin-bottom:4px">🎯 AI Detected Configuration:</div>
          <div style="font-size:12px"><b>Type:</b> ${parsed.rule_type}</div>
          <div style="font-size:12px"><b>Name:</b> ${parsed.name}</div>
          <div style="font-size:12px"><b>Threshold:</b> ${parsed.threshold_value}</div>
          ${parsed.lookback_days ? `<div style="font-size:12px"><b>Lookback:</b> ${parsed.lookback_days} days</div>` : ''}
          ${parsed.target_id ? `<div style="font-size:12px"><b>Matched Scope ID:</b> ${parsed.target_id}</div>` : ''}
        </div>`;
    }
  }

  function doParseNlRule(text, accounts = [], liabilities = [], projects = []) {
    const lower = text.toLowerCase();
    let rule_type = 'ACCOUNT_BALANCE_BELOW';
    let threshold_value = 50000;
    let lookback_days = 30;
    let target_id = null;
    let name = 'Custom Automated Guardrail';

    // Extract numbers
    const numbers = text.match(/-?\d+([.,]\d+)?/g);
    const num = numbers && numbers.length ? parseFloat(numbers[0].replace(/,/g, '')) : null;

    if (lower.includes('budget') || lower.includes('expense') || lower.includes('spend')) {
      rule_type = 'EXPENSE_BUDGET_PCT';
      threshold_value = num !== null ? Math.min(100, Math.max(1, num)) : 85;
      name = `Budget Alert (>= ${threshold_value}%)`;
      // Match project
      for (const p of projects) {
        if (lower.includes(p.name.toLowerCase())) {
          target_id = p.id;
          name = `${p.name} Budget Alert (>= ${threshold_value}%)`;
          break;
        }
      }
    } else if (lower.includes('deal') || lower.includes('payout') || lower.includes('reliability') || lower.includes('borrower')) {
      rule_type = 'DEAL_RELIABILITY_BELOW';
      threshold_value = num !== null ? Math.min(100, Math.max(1, num)) : 85;
      name = `Deal Reliability Drop Alert (< ${threshold_value}%)`;
    } else if (lower.includes('recurring') || lower.includes('sip') || lower.includes('consistency')) {
      rule_type = 'RECURRING_CONSISTENCY_BELOW';
      threshold_value = num !== null ? Math.min(100, Math.max(1, num)) : 90;
      name = `SIP Consistency Sentinel (< ${threshold_value}%)`;
    } else if (lower.includes('net worth') || lower.includes('drawdown') || lower.includes('contract')) {
      rule_type = 'NET_WORTH_CHANGE_PCT';
      threshold_value = num !== null ? (num > 0 ? -num : num) : -5;
      const daysMatch = lower.match(/(\d+)\s*(days|day)/);
      lookback_days = daysMatch ? parseInt(daysMatch[1], 10) : 30;
      name = `Net Worth Drawdown (<= ${threshold_value}% over ${lookback_days}d)`;
    } else if (lower.includes('liability') || lower.includes('debt') || lower.includes('loan') || lower.includes('credit')) {
      rule_type = 'LIABILITY_OUTSTANDING_ABOVE';
      threshold_value = num !== null ? num : 100000;
      name = `Liability Ceiling Alert (> ${App.utils.fmtMoney(threshold_value)})`;
      for (const l of liabilities) {
        if (lower.includes(l.liability_name.toLowerCase())) {
          target_id = l.id;
          name = `${l.liability_name} Debt Alert (> ${App.utils.fmtMoney(threshold_value)})`;
          break;
        }
      }
    } else {
      rule_type = 'ACCOUNT_BALANCE_BELOW';
      threshold_value = num !== null ? num : 25000;
      name = `Low Balance Alert (< ${App.utils.fmtMoney(threshold_value)})`;
      for (const a of accounts) {
        if (lower.includes(a.account_name.toLowerCase())) {
          target_id = a.id;
          name = `${a.account_name} Low Balance Alert (< ${App.utils.fmtMoney(threshold_value)})`;
          break;
        }
      }
    }

    return {
      name,
      rule_type,
      threshold_value,
      lookback_days,
      target_id,
      is_active: true,
    };
  }

  /* --------------------------------------------------------------------------
     Rule Create / Edit Form Modal
  -------------------------------------------------------------------------- */
  async function openRuleForm(existing, onDone) {
    const [projects, accounts, liabilities] = await Promise.all([
      App.api.listExpenseProjects().catch(() => []),
      App.api.listAccounts().catch(() => []),
      App.api.listLiabilities().catch(() => []),
    ]);

    const projectOptions = [{ value: '', label: 'All Projects (Global)' }].concat(projects.map((p) => ({ value: p.id, label: p.name })));
    const accountOptions = [{ value: '', label: 'Any Active Account' }].concat(accounts.map((a) => ({ value: a.id, label: a.account_name })));
    const liabilityOptions = [{ value: '', label: 'Any Active Liability' }].concat(liabilities.map((l) => ({ value: l.id, label: l.liability_name })));

    let ruleType = (existing && existing.rule_type) || RULE_TYPES[0].key;

    function fieldsFor(type) {
      const nameField = { key: 'name', label: 'Rule Name', required: true, span: 2 };
      if (type === 'EXPENSE_BUDGET_PCT') return [
        nameField,
        { key: 'target_id', label: 'Target Scope', type: 'select', options: projectOptions },
        { key: 'threshold_value', label: 'Alert when budget used reaches (%)', type: 'number', required: true },
      ];
      if (type === 'DEAL_RELIABILITY_BELOW') return [
        nameField,
        { key: 'threshold_value', label: 'Alert when payout reliability drops below (%)', type: 'number', required: true },
      ];
      if (type === 'RECURRING_CONSISTENCY_BELOW') return [
        nameField,
        { key: 'threshold_value', label: 'Alert when consistency drops below (%)', type: 'number', required: true },
      ];
      if (type === 'ACCOUNT_BALANCE_BELOW') return [
        nameField,
        { key: 'target_id', label: 'Target Scope', type: 'select', options: accountOptions },
        { key: 'threshold_value', label: 'Alert when balance drops below', type: 'number', required: true },
      ];
      if (type === 'LIABILITY_OUTSTANDING_ABOVE') return [
        nameField,
        { key: 'target_id', label: 'Target Scope', type: 'select', options: liabilityOptions },
        { key: 'threshold_value', label: 'Alert when outstanding rises above', type: 'number', required: true },
      ];
      if (type === 'NET_WORTH_CHANGE_PCT') return [
        nameField,
        { key: 'threshold_value', label: 'Alert when change is at or below (%, e.g. -5)', type: 'number', required: true },
        { key: 'lookback_days', label: 'Compare against days ago', type: 'number', required: true },
      ];
      return [nameField];
    }

    function renderBody() {
      const fields = fieldsFor(ruleType);
      const values = existing
        ? Object.assign({}, existing, { target_id: existing.target_id || '' })
        : { lookback_days: 30, threshold_value: ruleType.includes('PCT') || ruleType.includes('BELOW') ? 85 : 50000 };

      return `
        <div class="chip-row" id="acTypeChips" style="margin-bottom:12px;flex-wrap:wrap">
          ${RULE_TYPES.map((t) => `<div class="chip ${t.key === ruleType ? 'active' : ''}" data-rule-type="${t.key}" title="${App.utils.escapeHtml(t.desc)}">${t.icon} ${t.label}</div>`).join('')}
        </div>
        <div class="hint" style="margin-bottom:12px;background:var(--card);padding:8px 12px;border-radius:6px;border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span>${App.utils.escapeHtml((RULE_TYPES.find((t) => t.key === ruleType) || {}).desc || '')}</span>
          <button type="button" class="btn btn-sm btn-outline" id="acSuggestThresholdBtn" style="font-size:11px;white-space:nowrap">✨ AI Suggest Threshold</button>
        </div>
        <div id="acFieldsHost">${App.ui.renderForm(fields, values)}</div>
        <div class="auth-error" id="acRuleError"></div>`;
    }

    App.ui.open({
      title: existing && existing.id ? 'Edit Automation Rule' : 'New Automation Rule',
      bodyHtml: renderBody(),
      onMount: (body) => {
        body.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-rule-type]');
          if (chip) {
            ruleType = chip.dataset.ruleType;
            body.innerHTML = renderBody();
            return;
          }
          if (e.target.closest('#acSuggestThresholdBtn')) {
            suggestSmartThreshold(ruleType, body, accounts, liabilities);
          }
        });
      },
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: existing && existing.id ? 'Save Changes' : 'Create Rule',
          className: 'btn-gold',
          onClick: async () => {
            const fields = fieldsFor(ruleType);
            const { values: v, errors } = App.ui.readForm(fields);
            if (errors.length) {
              App.utils.qs('#acRuleError').textContent = 'Please fill in all required fields.';
              return;
            }
            v.rule_type = ruleType;
            v.target_id = v.target_id ? v.target_id : null;
            v.threshold_value = Number(v.threshold_value);
            if (v.lookback_days) v.lookback_days = Number(v.lookback_days);
            if (v.is_active === undefined) v.is_active = true;

            try {
              if (existing && existing.id) {
                await App.api.updateAutomationRule(existing.id, v);
                App.utils.toast('Automation rule updated successfully');
              } else {
                await App.api.createAutomationRule(v);
                App.utils.toast('Automation rule created successfully');
              }
              App.ui.close();
              if (onDone) onDone();
            } catch (e) {
              App.utils.qs('#acRuleError').textContent = 'Could not save rule: ' + (e.message || e);
            }
          },
        },
      ],
    });

    function suggestSmartThreshold(type, modalBody, accs, liabs) {
      const threshInput = modalBody.querySelector('input[name="threshold_value"]');
      if (!threshInput) return;
      if (type === 'ACCOUNT_BALANCE_BELOW') {
        const totalCash = accs.reduce((a, b) => a + Number(b.current_balance || 0), 0);
        const suggested = Math.max(10000, Math.round(totalCash * 0.2));
        threshInput.value = suggested;
        App.utils.toast(`Suggested emergency floor: ${App.utils.fmtMoney(suggested)}`);
      } else if (type === 'LIABILITY_OUTSTANDING_ABOVE') {
        const totalDebt = liabs.reduce((a, b) => a + Number(b.outstanding_amount || 0), 0);
        const suggested = Math.round(Math.max(50000, totalDebt * 1.25));
        threshInput.value = suggested;
        App.utils.toast(`Suggested debt ceiling: ${App.utils.fmtMoney(suggested)}`);
      } else if (type === 'EXPENSE_BUDGET_PCT') {
        threshInput.value = 85;
        App.utils.toast('Suggested proactive budget threshold: 85%');
      } else if (type === 'DEAL_RELIABILITY_BELOW') {
        threshInput.value = 85;
        App.utils.toast('Suggested deal reliability floor: 85%');
      } else if (type === 'RECURRING_CONSISTENCY_BELOW') {
        threshInput.value = 90;
        App.utils.toast('Suggested SIP consistency floor: 90%');
      } else if (type === 'NET_WORTH_CHANGE_PCT') {
        threshInput.value = -5;
        App.utils.toast('Suggested drawdown alert: -5%');
      }
    }
  }

  App.router.register('automation', renderAutomationCenterView);
})();

