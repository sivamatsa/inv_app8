/* AI Portfolio Copilot (038_ai_copilot_usage.sql) - this app's live
   LLM API call + 1-Click Health & Risk Audit + Custom Prompt Presets.
   Context is assembled client-side from computeNetWorth, computeCashFlow,
   and portfolio APIs. */
window.App = window.App || {};

(function () {
  const DAILY_LIMIT = 20;
  let thread = []; // { role: 'user'|'assistant', text } - session-only, never persisted
  const DEFAULT_PRESETS = [
    { title: '30-Day Inflows', prompt: 'Summarize all expected cash inflows, scheduled payouts, and recurring commitments over the next 30 days.' },
    { title: 'At-Risk & Overdue', prompt: 'Which deals currently have overdue payments or lower reliability, and what is my total capital at risk?' },
    { title: 'Yield & Performance', prompt: 'Analyze my weighted average ROI, top performing deals, and return on capital this quarter.' },
    { title: 'Gold & Asset Allocation', prompt: 'Break down my asset allocation across Deals, Cash Accounts, and Gold holdings. Is my portfolio sufficiently diversified?' },
    { title: 'Tax & TDS Summary', prompt: 'Summarize my gross interest earnings and tax withheld/TDS recorded across all deals and payments.' },
  ];

  function getCustomPresets() {
    try {
      const saved = localStorage.getItem('ai_custom_prompt_presets');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomPresets(presets) {
    try {
      localStorage.setItem('ai_custom_prompt_presets', JSON.stringify(presets));
    } catch (e) {}
  }

  async function assembleContext() {
    const [netWorth, cashFlow, portfolioSummary, dealMetrics, recurringSummary, recurringConsistency, goldHoldings, expenseProjects] = await Promise.all([
      App.netWorthCalc.computeNetWorth(),
      App.cashFlowCalc.computeCashFlow(),
      App.api.getPortfolioSummary(),
      App.api.listDealMetrics(),
      App.api.getRecurringSummary(),
      App.api.listRecurringConsistency(),
      App.api.listGoldSchemeHoldings(),
      App.api.listExpenseProjects(),
    ]);

    const expenseSummaries = await Promise.all(expenseProjects.map(async (p) => ({
      project: p.name,
      summary: await App.api.getExpenseProjectSummary(p.id),
      categories: await App.api.listExpenseCategorySummary(p.id),
    })));

    return {
      netWorth: netWorth.netWorth,
      totalAssets: netWorth.totalAssets,
      totalLiabilities: netWorth.liabilitiesTotal,
      accountsTotal: netWorth.accountsTotal,
      dealsOutstandingTotal: netWorth.dealsTotal,
      goldGrams: netWorth.goldGrams,
      goldValue: netWorth.goldTotal,
      netWorthHoldings: netWorth.breakdown.holdings,
      cashFlow: {
        thisMonthReceived: cashFlow.thisMonthReceived, thisMonthExpected: cashFlow.thisMonthExpected,
        recurringConfirmedThisMonth: cashFlow.thisMonthRecurringConfirmed, recurringPendingThisMonth: cashFlow.thisMonthRecurringPending,
        expenseDebitThisMonth: cashFlow.thisMonthExpenseDebit, expenseCreditThisMonth: cashFlow.thisMonthExpenseCredit,
        netCashMovementThisMonth: cashFlow.netCashMovement,
        next7Days: cashFlow.next7Days, next30Days: cashFlow.next30Days, next90Days: cashFlow.next90Days,
        availableCash: cashFlow.availableCash,
      },
      portfolioSummary,
      deals: dealMetrics.map((m) => ({ dealId: m.deal_id, status: m.status, investedAmount: m.invested_amount, currentPrincipal: m.current_principal, totalOutstanding: m.total_outstanding, realizedRoi: m.realized_roi, payoutReliability: m.payout_reliability })),
      recurringSummary,
      recurringConsistency: recurringConsistency.map((r) => ({ itemName: r.item_name, consistencyPct: r.consistency_pct, missedCount: r.missed_count, skippedCount: r.skipped_count })),
      goldSchemeHoldings: goldHoldings.map((h) => ({ itemName: h.item_name, totalGrams: h.total_grams, totalPaid: h.total_paid, avgPurchasePrice: h.avg_purchase_price })),
      expenseProjects: expenseSummaries,
    };
  }

  function computeHealthAudit(context) {
    const totalAssets = context.totalAssets || 1;
    const dealsTotal = context.dealsOutstandingTotal || 0;
    const accountsTotal = context.accountsTotal || 0;
    const goldTotal = context.goldValue || 0;
    const liabilities = context.totalLiabilities || 0;

    // 1. Diversification Score (max 25)
    const dealPct = (dealsTotal / totalAssets) * 100;
    const cashPct = (accountsTotal / totalAssets) * 100;
    const goldPct = (goldTotal / totalAssets) * 100;
    let divScore = 25;
    if (dealPct > 80) divScore -= 10;
    else if (dealPct > 65) divScore -= 5;
    if (cashPct < 5) divScore -= 5;

    // 2. Liquidity Coverage Score (max 25)
    let liqScore = 25;
    const next30 = context.cashFlow.next30Days || 0;
    if (accountsTotal + next30 < liabilities * 0.2) liqScore -= 10;

    // 3. Delinquency & Reliability Score (max 30)
    let relScore = 30;
    const deals = context.deals || [];
    const lowRel = deals.filter((d) => d.payoutReliability != null && d.payoutReliability < 75);
    if (lowRel.length > 0) relScore -= Math.min(20, lowRel.length * 7);

    // 4. Debt & Leverage Score (max 20)
    let levScore = 20;
    const debtRatio = (liabilities / totalAssets) * 100;
    if (debtRatio > 40) levScore -= 15;
    else if (debtRatio > 20) levScore -= 8;

    const totalScore = Math.max(10, Math.min(100, Math.round(divScore + liqScore + relScore + levScore)));
    const rating = totalScore >= 85 ? 'Strong & Resilient' : totalScore >= 70 ? 'Balanced / Good' : totalScore >= 50 ? 'Moderate Caution' : 'High Risk';
    const ratingColor = totalScore >= 85 ? 'var(--teal)' : totalScore >= 70 ? 'var(--gold)' : 'var(--red)';

    const strengths = [];
    const vulnerabilities = [];
    const actions = [];

    if (debtRatio <= 10) strengths.push('Extremely low leverage / debt ratio (<10%).');
    if (cashPct >= 10) strengths.push(`Healthy liquid cash reserves (${cashPct.toFixed(1)}% of total assets).`);
    if (goldTotal > 0) strengths.push(`Inflation-hedged gold asset allocation (${goldPct.toFixed(1)}%).`);
    if (lowRel.length === 0 && deals.length > 0) strengths.push('100% payout reliability across active deals.');

    if (dealPct > 75) vulnerabilities.push(`High fixed-income concentration (${dealPct.toFixed(1)}% of portfolio).`);
    if (cashPct < 8) vulnerabilities.push(`Thin cash buffer (${cashPct.toFixed(1)}%) for short-term liquidity.`);
    if (lowRel.length > 0) vulnerabilities.push(`${lowRel.length} deal(s) have payout reliability below 75%.`);
    if (liabilities > accountsTotal && liabilities > 0) vulnerabilities.push('Active liabilities exceed immediately available cash.');

    if (dealPct > 75) actions.push('Consider allocating upcoming inflows toward liquid funds or precious metals to reduce concentration.');
    if (lowRel.length > 0) actions.push('Review delayed payments in the Reconciliation center and trigger platform reminders.');
    if (actions.length === 0) actions.push('Maintain current schedule; review reinvestment opportunities for maturing capital.');

    return { totalScore, rating, ratingColor, divScore, liqScore, relScore, levScore, strengths, vulnerabilities, actions };
  }

  function bubble(role, text, providerDisplayName) {
    const mine = role === 'user';
    return `<div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin-bottom:10px">
      <div style="max-width:80%;padding:11px 15px;border-radius:10px;font-size:13px;line-height:1.5;background:${mine ? 'rgba(201,168,76,0.15)' : 'rgba(76,155,232,0.14)'};border:1px solid var(--border2)">
        <div style="white-space:pre-wrap">${App.utils.escapeHtml(text)}</div>
        ${!mine && providerDisplayName ? `<div style="margin-top:6px;font-size:10.5px;color:var(--text3)">via ${App.utils.escapeHtml(providerDisplayName)}</div>` : ''}
      </div>
    </div>`;
  }

  async function renderAiCopilotView() {
    const pane = App.utils.qs('#pane-aicopilot');
    pane.innerHTML = `
      <div class="section-title">AI Portfolio Copilot &amp; Intelligence <div class="line"></div><small>real-time portfolio diagnostics, custom prompt presets, and on-demand executive briefings</small></div>

      <!-- 1-CLICK HEALTH & RISK AUDIT BANNER -->
      <div class="ai-audit-card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--gold);margin-bottom:4px">&#9889; 1-Click AI Portfolio Health &amp; Risk Audit</div>
            <div style="font-size:12px;color:var(--text2)">Instantly evaluate concentration risk, liquidity coverage, payout reliability, and receive actionable suggestions.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-gold btn-sm" id="btnRunHealthAudit">&#9654; Run Health Audit</button>
            <button class="btn btn-outline btn-sm" id="btnGenBriefing">&#128196; Executive Briefing</button>
          </div>
        </div>
        <div id="healthAuditResultHost" style="margin-top:14px;display:none"></div>
      </div>

      <!-- PROMPT PRESETS & TEMPLATES -->
      <div class="panel" style="margin-bottom:14px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px">Quick Prompt Presets &amp; Briefings</div>
          <button class="btn btn-outline btn-xs" id="btnAddCustomPreset" style="font-size:11px">+ Save New Preset</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap" id="presetChipsList"></div>
      </div>

      <!-- COPILOT CHAT PANEL -->
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div class="hint">Your active AI provider answers using real verified figures from your account. Each question uses 1 daily quota.</div>
          <div id="acQuota" class="hint" style="font-weight:600;color:var(--gold)"></div>
        </div>
        <div id="acThread" style="height:340px;overflow-y:auto;border:1px solid var(--border2);border-radius:8px;padding:12px;margin-bottom:12px;background:var(--fill-1)"></div>
        <div id="acLimitNote"></div>
        <div style="display:flex;gap:8px">
          <input class="search-input" id="acQuestionInput" placeholder="Ask about cash flow, risk, deals, taxes, or recommendations..." style="flex:1">
          <button class="btn btn-gold" id="acAskBtn">Ask</button>
        </div>
      </div>`;

    function drawPresets() {
      const host = App.utils.qs('#presetChipsList', pane);
      const custom = getCustomPresets();
      const all = [...DEFAULT_PRESETS, ...custom];
      host.innerHTML = all.map((p, idx) => `
        <button class="ai-preset-chip" data-preset-idx="${idx}">
          <span>&#10024;</span> ${App.utils.escapeHtml(p.title)}
        </button>
      `).join('');

      App.utils.qsa('.ai-preset-chip', host).forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.presetIdx, 10);
          const p = all[idx];
          if (p) {
            const input = App.utils.qs('#acQuestionInput', pane);
            input.value = p.prompt;
            ask();
          }
        });
      });
    }

    drawPresets();

    App.utils.qs('#btnAddCustomPreset', pane).addEventListener('click', () => {
      App.ui.open({
        small: true,
        title: 'Save Custom AI Prompt Preset',
        bodyHtml: `
          <div class="field" style="margin-bottom:12px">
            <label>Preset Button Title <span class="req">*</span></label>
            <input type="text" id="newPresetTitle" placeholder="e.g. Q3 Tax Forecast" required>
          </div>
          <div class="field">
            <label>Prompt Question <span class="req">*</span></label>
            <textarea id="newPresetPrompt" rows="3" placeholder="Enter the exact prompt you want Copilot to answer..." required></textarea>
          </div>
        `,
        actions: [
          { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
          {
            label: 'Save Preset',
            className: 'btn-gold',
            onClick: () => {
              const title = (App.utils.qs('#newPresetTitle')?.value || '').trim();
              const prompt = (App.utils.qs('#newPresetPrompt')?.value || '').trim();
              if (!title || !prompt) {
                App.utils.toast('Title and prompt question are required', 'err');
                return;
              }
              const current = getCustomPresets();
              current.push({ title, prompt });
              saveCustomPresets(current);
              App.ui.close();
              App.utils.toast('Custom prompt preset saved');
              drawPresets();
            },
          },
        ],
      });
    });

    // 1-Click Health Audit Execution
    App.utils.qs('#btnRunHealthAudit', pane).addEventListener('click', async () => {
      const btn = App.utils.qs('#btnRunHealthAudit', pane);
      const host = App.utils.qs('#healthAuditResultHost', pane);
      btn.disabled = true;
      btn.textContent = 'Auditing...';
      host.style.display = 'block';
      host.innerHTML = `<div class="skeleton" style="height:80px;border-radius:8px"></div>`;

      try {
        const context = await assembleContext();
        const audit = computeHealthAudit(context);

        host.innerHTML = `
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">
            <div style="display:flex;align-items:center;gap:18px;margin-bottom:14px;flex-wrap:wrap">
              <div class="ai-audit-gauge">
                <div class="ai-audit-gauge-inner">
                  ${audit.totalScore}
                  <span>SCORE</span>
                </div>
              </div>
              <div style="flex:1">
                <div style="font-size:16px;font-weight:700;color:${audit.ratingColor}">${audit.rating}</div>
                <div style="font-size:12px;color:var(--text2);margin-top:2px">
                  Diversification: <b>${audit.divScore}/25</b> &bull; Liquidity: <b>${audit.liqScore}/25</b> &bull; Reliability: <b>${audit.relScore}/30</b> &bull; Leverage: <b>${audit.levScore}/20</b>
                </div>
              </div>
              <button class="btn btn-outline btn-xs" id="btnDeepAuditPrompt" style="font-size:11.5px">&#129504; Ask AI Deep Audit</button>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;font-size:12px">
              <div style="background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;padding:10px">
                <div style="font-weight:600;color:var(--teal);margin-bottom:6px">&#10004; Key Strengths</div>
                ${audit.strengths.length > 0 ? audit.strengths.map((s) => `<div style="margin-bottom:4px;color:var(--text)">• ${App.utils.escapeHtml(s)}</div>`).join('') : '<div style="color:var(--text3)">Standard metrics maintained.</div>'}
              </div>
              <div style="background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;padding:10px">
                <div style="font-weight:600;color:var(--red);margin-bottom:6px">&#9888; Risk &amp; Vulnerabilities</div>
                ${audit.vulnerabilities.length > 0 ? audit.vulnerabilities.map((v) => `<div style="margin-bottom:4px;color:var(--text)">• ${App.utils.escapeHtml(v)}</div>`).join('') : '<div style="color:var(--text3)">No critical vulnerabilities detected.</div>'}
              </div>
              <div style="background:var(--fill-1);border:1px solid var(--border2);border-radius:8px;padding:10px">
                <div style="font-weight:600;color:var(--gold);margin-bottom:6px">&#128161; Actionable Advice</div>
                ${audit.actions.map((a) => `<div style="margin-bottom:4px;color:var(--text)">• ${App.utils.escapeHtml(a)}</div>`).join('')}
              </div>
            </div>
          </div>
        `;

        App.utils.qs('#btnDeepAuditPrompt', host)?.addEventListener('click', () => {
          const input = App.utils.qs('#acQuestionInput', pane);
          input.value = `Perform a comprehensive deep-dive risk audit of my portfolio based on my current health score of ${audit.totalScore}/100. Detail specific actions to optimize yield and protect downside risk.`;
          ask();
        });
      } catch (e) {
        host.innerHTML = `<div class="hint" style="color:var(--red)">Failed to complete audit: ${App.utils.escapeHtml(e.message || e)}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ Run Health Audit';
      }
    });

    // Executive Briefing Generator
    App.utils.qs('#btnGenBriefing', pane).addEventListener('click', async () => {
      const input = App.utils.qs('#acQuestionInput', pane);
      input.value = 'Generate an executive bulleted portfolio briefing summarizing: 1) Total Net Worth & liquid cash, 2) Expected 30-day cash inflows, 3) High-yield or maturing deals, and 4) Recommended immediate action items.';
      ask();
    });

    function drawThread() {
      const host = App.utils.qs('#acThread', pane);
      host.innerHTML = thread.length
        ? thread.map((m) => bubble(m.role, m.text, m.providerDisplayName)).join('')
        : '<div class="empty-note">Ask a question below or pick a Quick Preset above to get an instant AI analysis of your real numbers.</div>';
      host.scrollTop = host.scrollHeight;
    }
    drawThread();

    App.utils.qs('#acQuota', pane).textContent = `Daily quota: up to ${DAILY_LIMIT} questions/day.`;

    App.utils.qs('#acAskBtn', pane).addEventListener('click', ask);
    App.utils.qs('#acQuestionInput', pane).addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });

    async function ask() {
      const input = App.utils.qs('#acQuestionInput', pane);
      const question = input.value.trim();
      if (!question) return;

      const user = App.auth && App.auth.getUser && App.auth.getUser();
      const isDemo = App.auth && App.auth.isDemoMode && App.auth.isDemoMode();
      if (!user || isDemo) {
        App.utils.toast('Please create a profile and sign in to use AI Copilot.', 'err');
        App.utils.qs('#acLimitNote', pane).innerHTML = `
          <div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);padding:12px 14px;border-radius:8px;color:var(--text);font-size:12px;margin-top:10px">
            <strong style="color:#ef4444">🔒 Login Required:</strong> AI Copilot is only usable after user login. Please create a profile or sign in to analyze your portfolio.
          </div>
        `;
        return;
      }

      input.value = '';
      thread.push({ role: 'user', text: question });
      drawThread();
      const btn = App.utils.qs('#acAskBtn', pane);
      btn.disabled = true; btn.textContent = 'Thinking...';
      App.utils.qs('#acLimitNote', pane).innerHTML = '';
      try {
        const context = await assembleContext();
        const res = await App.api.askCopilot(question, context);
        thread.push({ role: 'assistant', text: res.answer, providerDisplayName: res.providerDisplayName });
        drawThread();
        App.utils.qs('#acQuota', pane).textContent = `Daily quota: ${res.requestsUsed} of ${res.dailyLimit} used today.`;
      } catch (e) {
        thread.pop(); drawThread();
        if (e.requestsUsed != null) {
          App.utils.qs('#acLimitNote', pane).innerHTML = `<div class="hint" style="color:var(--red);margin-top:8px">${App.utils.escapeHtml(e.message)}</div>`;
        } else {
          const errMsg = e.message || String(e);
          const isFetchError = errMsg.includes('Failed to send a request') || errMsg.includes('FunctionsFetchError') || errMsg.includes('Failed to fetch') || errMsg.includes('Function not found') || errMsg.includes('404');
          if (isFetchError) {
            // Attempt direct server-side /api/chat call via Gemini
            try {
              const context = await assembleContext();
              const formattedContext = JSON.stringify(context, null, 2);
              const chatRes = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  messages: [{ role: 'user', content: question }],
                  model: 'gemini-3.6-flash',
                  systemInstruction: 'You are the AI Portfolio Copilot for Personal Investment OS. Analyze user portfolio data and questions with institutional precision and clarity.',
                  portfolioContext: formattedContext,
                }),
              });
              if (chatRes.ok) {
                const chatData = await chatRes.json();
                if (chatData?.reply) {
                  thread.push({ role: 'assistant', text: chatData.reply, providerDisplayName: `Gemini (${chatData.model || '3.6 Flash'})` });
                  drawThread();
                  App.utils.qs('#acQuota', pane).textContent = 'Connected via Server-Side Gemini API.';
                  return;
                }
              }
            } catch (chatErr) {
              console.warn('Fallback to local computation:', chatErr);
            }

            // Local client-side analytical engine fallback
            const context = await assembleContext();
            const audit = computeHealthAudit(context);
            let fallbackAnswer = `**Executive Portfolio Snapshot (Local Computation Engine)**\n\n`;
            fallbackAnswer += `• **Net Worth:** ${App.utils.fmtMoney(context.netWorth)} (Assets: ${App.utils.fmtMoney(context.totalAssets)}, Liabilities: ${App.utils.fmtMoney(context.totalLiabilities)})\n`;
            fallbackAnswer += `• **Available Cash:** ${App.utils.fmtMoney(context.cashFlow.availableCash)}\n`;
            fallbackAnswer += `• **Next 30 Days Inflow:** ${App.utils.fmtMoney(context.cashFlow.next30Days)} (Next 7 Days: ${App.utils.fmtMoney(context.cashFlow.next7Days)})\n`;
            fallbackAnswer += `• **Health Score:** ${audit.totalScore}/100 (${audit.rating})\n\n`;
            fallbackAnswer += `*Tip: You can also use the floating AI Advisor widget on the bottom right for multi-turn conversational analysis.*`;

            thread.push({ role: 'assistant', text: fallbackAnswer, providerDisplayName: 'Local Analytical Engine' });
            drawThread();
          } else {
            App.utils.qs('#acLimitNote', pane).innerHTML = `<div class="hint" style="color:var(--red);margin-top:8px">${App.utils.escapeHtml(errMsg)}</div>`;
            App.utils.toast('Could not reach Copilot: ' + errMsg, 'err');
          }
        }
      } finally {
        btn.disabled = false; btn.textContent = 'Ask';
      }
    }
  }

  App.router.register('aicopilot', renderAiCopilotView);
})();

