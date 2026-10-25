/* Floating Gemini AI Financial Intelligence Chatbot for Personal Investment OS (PIOS)
   Multi-turn conversational advisor with live portfolio grounding, role specialization, and model switching. */
window.App = window.App || {};

App.chatbot = (function () {
  const STORAGE_KEY = 'pios_gemini_chat_history_v1';
  const MODEL_STORAGE_KEY = 'pios_gemini_chat_model_v1';
  const ROLE_STORAGE_KEY = 'pios_gemini_chat_role_v1';
  const POS_STORAGE_KEY = 'pios_gemini_chat_pos_v1';
  const DOCKED_STORAGE_KEY = 'pios_gemini_chat_docked_v1';

  const MODELS = [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', tag: 'Fast & Stable', desc: 'Recommended general intelligence, financial math, and live portfolio advice' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tag: 'Ultra-Fast', desc: 'High-speed low-latency answers for quick formulas, definitions, and scenario lookups' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', tag: 'Latest Model', desc: 'Always up-to-date Gemini Flash model' },
  ];

  const ROLES = {
    advisor: {
      name: 'Portfolio Advisor',
      icon: '💼',
      desc: 'Holistic wealth management, Deals, SIPs, FDs, Gold, Expenses & Net Worth.',
      systemPrompt: `You are the Lead Financial Intelligence Advisor of Personal Investment OS (PIOS).
You have full real-time access to the user's complete multi-asset portfolio: High-Yield Deals, Systematic SIPs & Recurring Investments, Bank Accounts & Fixed Deposits (FDs), Physical & Scheme Gold Vault, Expense Projects & Ledgers, and Total Net Worth / Cash Flow.

Response Structure Requirements:
1. Executive Summary: High-level overview of totals and ratios (Net Worth, Yield, Cash Runway).
2. Granular Breakdown: Exact figures, tables, and asset comparisons based on verified numbers in context.
3. Quick Actions: Provide 2-3 interactive action links formatted as [Action Name](#route) (e.g. [View Deals](#deals), [Check SIPs](#recurring), [Bank FDs](#accounts), [Gold Vault](#gold), [Expenses](#expenses), [Reconcile](#reconciliation), [Health Audit](#aicopilot)).`
    },
    risk: {
      name: 'Risk & Drift Auditor',
      icon: '⚖️',
      desc: 'Health audits, default risk, overdue schedules, and asset concentration.',
      systemPrompt: `You are the Quantitative Risk & Portfolio Drift Auditor for PIOS.
You audit the user's entire portfolio across Deals, SIPs, FDs, Gold, Expenses, and Net Worth.
Evaluate credit risk, platform concentration, liquid runway buffers, overdue schedules, and asset class drift.
Always highlight delinquent payments or single-asset concentration over 50%.
Include actionable hash links: [Inspect Overdue](#payments), [Audit Deals](#deals), [Review Cash](#accounts).`
    },
    tax: {
      name: 'Tax Strategist',
      icon: '🧾',
      desc: 'Indian income tax slabs (Budget 2024), STCG 20%, LTCG 12.5%, TDS & FDs.',
      systemPrompt: `You are the Indian Tax & Capital Gains Specialist for PIOS.
Expert in FY 2024-25 / 2025-26 New vs Old Tax Regimes, Budget 2024 revised STCG (20%), Equity LTCG (12.5% > ₹1.25L exemption), Gold LTCG (12.5%), Fixed Deposit interest TDS (Section 194A), Deal interest taxation under slab rates, and Advance Tax quarterly calendar.
Reference the user's live FD interest, deal yields, and gold holdings when computing liabilities.`
    },
    yield: {
      name: 'Cash Flow & Yield',
      icon: '💰',
      desc: 'Monthly cash velocity, FD maturity timing, SIP commitments & reinvestment.',
      systemPrompt: `You are the Passive Cash Flow & Yield Specialist for PIOS.
Cross-reference passive deal interest inflows with recurring SIP commitments and project expense burn.
Optimize cash velocity, reinvestment compounding math, and liquid reserve runways across bank accounts and FDs.`
    }
  };

  const STARTER_PROMPTS = [
    { text: 'Give me a complete breakdown of my portfolio across all asset classes', role: 'advisor' },
    { text: 'What is my total passive inflow vs recurring SIP commitments?', role: 'yield' },
    { text: 'Analyze my Bank FDs vs Deals yield and maturity dates', role: 'yield' },
    { text: 'Break down my Gold bullion and scheme allocation vs Net Worth', role: 'advisor' },
    { text: 'Check my overdue schedules, risk score & concentration drift', role: 'risk' },
    { text: 'Analyze expense projects burn rate and liquid cash runway', role: 'advisor' },
  ];

  let state = {
    isOpen: false,
    isMinimized: false,
    isDocked: true,
    fabTop: null,
    messages: [],
    model: 'gemini-3.8-flash',
    role: 'advisor',
    attachContext: true,
    isLoading: false,
    hasUnread: true,
  };

  function loadState() {
    try {
      const savedMessages = localStorage.getItem(STORAGE_KEY);
      if (savedMessages) {
        state.messages = JSON.parse(savedMessages);
      }
      const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
      if (savedModel && MODELS.some((m) => m.id === savedModel)) {
        state.model = savedModel;
      } else {
        state.model = 'gemini-3.8-flash';
      }
      const savedRole = localStorage.getItem(ROLE_STORAGE_KEY);
      if (savedRole && ROLES[savedRole]) {
        state.role = savedRole;
      }
      const savedPos = localStorage.getItem(POS_STORAGE_KEY);
      if (savedPos != null) {
        state.fabTop = parseFloat(savedPos);
      }
      const savedDocked = localStorage.getItem(DOCKED_STORAGE_KEY);
      if (savedDocked !== null) {
        state.isDocked = savedDocked === 'true';
      } else {
        state.isDocked = true; // Docked by default
      }
    } catch (e) {
      console.warn('Error loading chat state:', e);
    }

    // Default welcome message if empty
    if (state.messages.length === 0) {
      state.messages.push({
        id: 'msg_welcome',
        role: 'assistant',
        content: `👋 **Welcome to PIOS AI Financial Intelligence!**\n\nI am your conversational AI investment assistant powered by **Gemini**. I can analyze your live portfolio holdings, calculate risk-adjusted Sharpe/Sortino ratios, advise on asset rebalancing, estimate capital gains taxes, and optimize your passive cash flow.\n\nHow can I assist your wealth strategy today?`,
        timestamp: new Date().toISOString(),
        model: state.model,
      });
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages.slice(-30))); // Keep last 30 turns
      localStorage.setItem(MODEL_STORAGE_KEY, state.model);
      localStorage.setItem(ROLE_STORAGE_KEY, state.role);
      if (state.fabTop != null) localStorage.setItem(POS_STORAGE_KEY, String(state.fabTop));
      localStorage.setItem(DOCKED_STORAGE_KEY, state.isDocked ? 'true' : 'false');
    } catch (e) {
      console.warn('Error saving chat state:', e);
    }
  }

  function resetConversation() {
    state.messages = [
      {
        id: 'msg_welcome_' + Date.now(),
        role: 'assistant',
        content: `👋 **Welcome to PIOS AI Financial Intelligence!**\n\nI am your conversational AI investment assistant powered by **Gemini**. I can analyze your live portfolio holdings, calculate risk-adjusted Sharpe/Sortino ratios, advise on asset rebalancing, estimate capital gains taxes, and optimize your passive cash flow.\n\nHow can I assist your wealth strategy today?`,
        timestamp: new Date().toISOString(),
        model: state.model,
      },
    ];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages));
    } catch (e) {
      console.warn('Error clearing chat storage:', e);
    }
    renderFloatingWidget();
    if (App.utils && App.utils.toast) {
      App.utils.toast('Conversation history cleared');
    }
  }

  let lastGatheredPortfolioData = null;

  async function getLivePortfolioContext() {
    if (!state.attachContext) return null;
    try {
      if (window.App && window.App.portfolioIntelligence) {
        const data = await window.App.portfolioIntelligence.gatherAllPortfolioData();
        lastGatheredPortfolioData = data;
        return window.App.portfolioIntelligence.buildFullPortfolioContextText(data);
      }
      return null;
    } catch (err) {
      console.warn('Could not collect live portfolio context:', err);
      return null;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isAuthenticatedUser() {
    const user = window.App && window.App.auth && window.App.auth.getUser && window.App.auth.getUser();
    const isDemo = window.App && window.App.auth && window.App.auth.isDemoMode && window.App.auth.isDemoMode();
    return !!user && !isDemo;
  }

  function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Markdown tables
    html = html.replace(/(?:^|\n)((?:\|.+?\|\s*(?:\n|$))+)/g, (match, tableBlock) => {
      const rows = tableBlock.trim().split('\n').map((r) => r.trim()).filter(Boolean);
      if (rows.length < 2) return match;
      let tableHtml = '<div style="overflow-x:auto;margin:8px 0;border-radius:6px;border:1px solid var(--border)"><table style="width:100%;border-collapse:collapse;font-size:11.5px;text-align:left;line-height:1.4">';
      let isHeader = true;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (/^\|[-:\s|]+\|$/.test(row)) {
          isHeader = false;
          continue;
        }
        const cells = row.split('|').slice(1, -1).map((c) => c.trim());
        const tag = isHeader ? 'th' : 'td';
        const cellStyle = isHeader
          ? 'padding:6px 8px;border-bottom:1px solid var(--border);font-weight:700;color:var(--text);background:rgba(201,168,76,0.1);'
          : 'padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:var(--text2);';
        tableHtml += '<tr>' + cells.map((c) => `<${tag} style="${cellStyle}">${c}</${tag}>`).join('') + '</tr>';
        if (isHeader) isHeader = false;
      }
      tableHtml += '</table></div>';
      return tableHtml;
    });

    // Markdown Action pills / buttons [Action Label](#route)
    html = html.replace(/\[([^\]]+)\]\((\#[^)]+)\)/g, '<a href="$2" class="chat-action-link" style="display:inline-flex;align-items:center;padding:3px 8px;margin:2px 3px;border-radius:4px;background:rgba(201,168,76,0.18);color:var(--gold);border:1px solid rgba(201,168,76,0.35);text-decoration:none;cursor:pointer;font-weight:600;font-size:11px;transition:all 0.15s ease">$1</a>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" class="chat-link" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline">$1</a>');

    // Code blocks ``` ... ```
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$1</code></pre>');
    // Inline code `...`
    html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    // Headers ### Title, ## Title
    html = html.replace(/^### (.*$)/gim, '<strong style="display:block;margin:6px 0 2px;color:var(--gold);font-size:12.5px">$1</strong>');
    html = html.replace(/^## (.*$)/gim, '<strong style="display:block;margin:8px 0 3px;color:var(--text);font-size:13.5px">$1</strong>');
    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Bullet lists
    html = html.replace(/^\s*[\-\*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul style="margin:4px 0;padding-left:18px">$1</ul>');
    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

    return html;
  }

  function renderFloatingWidget() {
    let container = document.getElementById('piosChatbotContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'piosChatbotContainer';
      document.body.appendChild(container);
    }

    const currentRoleObj = ROLES[state.role] || ROLES.advisor;
    const currentModelObj = MODELS.find((m) => m.id === state.model) || MODELS[0];
    const loggedIn = isAuthenticatedUser();

    // Compute vertical position if saved
    let posStyle = '';
    if (state.fabTop != null) {
      posStyle = `top:${state.fabTop}px;bottom:auto;`;
    }

    container.innerHTML = `
      <!-- If docked/minimized into tab -->
      ${state.isDocked && !state.isOpen ? `
        <div id="piosChatDockTab" class="chat-dock-tab" title="Click to open AI Copilot (Docked)">
          <span>✨</span>
          <span>AI Copilot</span>
        </div>
      ` : `
        <!-- Floating Action Button (FAB) -->
        <div id="piosChatLauncher" class="chat-fab ${state.isOpen ? 'active' : ''}" style="${posStyle}" title="Drag vertically to reposition • Click to open AI Copilot">
          <div class="chat-fab-glow"></div>
          <div class="chat-fab-inner">
            <span class="chat-fab-drag-handle" title="Drag to move up/down">⋮⋮</span>
            <span class="chat-fab-icon">${state.isOpen ? '✕' : '✨'}</span>
            <span class="chat-fab-label">AI Copilot</span>
            ${!state.isOpen ? `
              <button type="button" class="chat-fab-hide-btn" id="btnChatHideFab" title="Minimize / Dock to edge">✕</button>
            ` : ''}
          </div>
          ${state.hasUnread && !state.isOpen ? '<span class="chat-fab-badge">1</span>' : ''}
        </div>
      `}

      <!-- Floating Chat Window -->
      <div id="piosChatWindow" class="chat-window ${state.isOpen ? 'open' : ''} ${state.isMinimized ? 'minimized' : ''}">
        <!-- Header -->
        <div class="chat-header">
          <div class="chat-header-main">
            <div class="chat-avatar">✨</div>
            <div class="chat-header-info">
              <div class="chat-title">PIOS Financial AI</div>
              <div class="chat-subtitle">
                <span class="chat-status-dot"></span>
                <span id="chatActiveModelLabel">${currentModelObj.name}</span>
              </div>
            </div>
          </div>
          <div class="chat-header-actions">
            <button class="chat-h-btn" id="btnChatSettingsToggle" title="Model & Role Settings">⚙️</button>
            <button class="chat-h-btn" id="btnChatClear" title="Clear Conversation">🗑️</button>
            <button class="chat-h-btn" id="btnChatMinimize" title="Minimize / Expand">${state.isMinimized ? '🗖' : '🗕'}</button>
            <button class="chat-h-btn" id="btnChatClose" title="Close">✕</button>
          </div>
        </div>

        <!-- Settings / Options Tray (Collapsible) -->
        <div id="chatSettingsTray" class="chat-settings-tray" style="display:none">
          <div class="chat-tray-section">
            <div class="chat-tray-label">🧠 Gemini AI Model</div>
            <select class="chat-select" id="chatModelSelect">
              ${MODELS.map((m) => `<option value="${m.id}" ${m.id === state.model ? 'selected' : ''}>${m.name} (${m.tag})</option>`).join('')}
            </select>
          </div>
          <div class="chat-tray-section">
            <div class="chat-tray-label">🎭 Advisor Role Persona</div>
            <div class="chat-role-grid">
              ${Object.entries(ROLES).map(([key, r]) => `
                <div class="chat-role-card ${key === state.role ? 'active' : ''}" data-chat-role="${key}">
                  <span class="role-icon">${r.icon}</span>
                  <span class="role-name">${r.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="chat-tray-section" style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;color:var(--text)">📊 Ground with Live Portfolio Context</span>
            <input type="checkbox" id="chatAttachContextCheck" ${state.attachContext ? 'checked' : ''} style="cursor:pointer">
          </div>
        </div>

        <!-- Role Banner -->
        <div class="chat-role-banner">
          <span>${currentRoleObj.icon} <b>${currentRoleObj.name}</b>: ${currentRoleObj.desc}</span>
        </div>

        ${!loggedIn ? `
          <div class="chat-auth-banner" style="margin:8px 12px;padding:10px 12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="font-size:11.5px;color:var(--text);line-height:1.4">
              <strong style="color:#ef4444">🔒 Login Required:</strong> AI Advisor is only usable after user login. Please create a profile to unlock AI intelligence.
            </div>
            <button type="button" class="btn btn-gold btn-xs" id="btnChatLoginPrompt" style="padding:4px 8px;font-size:11px;white-space:nowrap">Sign In / Join</button>
          </div>
        ` : ''}

        <!-- Messages Body -->
        <div class="chat-messages" id="chatMessagesList">
          ${state.messages.map((m) => renderMessageHtml(m)).join('')}
          ${state.isLoading ? `
            <div class="chat-msg chat-msg-bot loading">
              <div class="chat-msg-avatar">✨</div>
              <div class="chat-msg-bubble">
                <div class="chat-typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Starters Prompt Pills -->
        <div class="chat-starters" id="chatStartersRow">
          ${STARTER_PROMPTS.map((p) => `
            <div class="chat-starter-chip" data-prompt="${escapeHtml(p.text)}" data-role="${p.role}">
              ${escapeHtml(p.text)}
            </div>
          `).join('')}
        </div>

        <!-- Input Area -->
        <div class="chat-footer">
          <div class="chat-input-wrapper">
            <textarea 
              id="chatTextInput" 
              class="chat-input" 
              placeholder="${loggedIn ? 'Ask PIOS Financial Advisor...' : 'Sign in or create profile to use AI Advisor...'}" 
              rows="1"
              maxlength="2000"
            ></textarea>
            <button id="btnChatSend" class="chat-send-btn" ${state.isLoading ? 'disabled' : ''} title="Send (Enter)">
              ➤
            </button>
          </div>
          <div class="chat-footer-note">
            Powered by Google Gemini 3 Series &bull; Live Portfolio Grounding
          </div>
        </div>
      </div>
    `;

    bindWidgetEvents(container);
    scrollToBottom();
  }

  function renderMessageHtml(m) {
    const isUser = m.role === 'user';
    const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-bot'}" data-msg-id="${m.id || ''}">
        ${!isUser ? '<div class="chat-msg-avatar">✨</div>' : ''}
        <div class="chat-msg-content-wrapper">
          <div class="chat-msg-bubble">
            <div class="chat-msg-text">${formatMarkdown(m.content)}</div>
          </div>
          <div class="chat-msg-meta">
            <span class="chat-msg-time">${timeStr}</span>
            ${!isUser ? `<button class="chat-msg-copy" title="Copy response" data-copy-text="${escapeHtml(m.content)}">📋</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function bindWidgetEvents(container) {
    const launcher = container.querySelector('#piosChatLauncher');
    const dockTab = container.querySelector('#piosChatDockTab');
    const hideFabBtn = container.querySelector('#btnChatHideFab');
    const chatWindow = container.querySelector('#piosChatWindow');
    const input = container.querySelector('#chatTextInput');
    const sendBtn = container.querySelector('#btnChatSend');
    const clearBtn = container.querySelector('#btnChatClear');
    const minimizeBtn = container.querySelector('#btnChatMinimize');
    const closeBtn = container.querySelector('#btnChatClose');
    const settingsToggle = container.querySelector('#btnChatSettingsToggle');
    const settingsTray = container.querySelector('#chatSettingsTray');
    const modelSelect = container.querySelector('#chatModelSelect');
    const contextCheck = container.querySelector('#chatAttachContextCheck');

    // Dock tab click to restore FAB
    dockTab?.addEventListener('click', () => {
      state.isDocked = false;
      state.isOpen = true;
      saveState();
      renderFloatingWidget();
      setTimeout(() => {
        const inp = document.getElementById('chatTextInput');
        if (inp) inp.focus();
      }, 100);
    });

    // Hide FAB button to dock it
    hideFabBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.isDocked = true;
      saveState();
      renderFloatingWidget();
      if (App.utils && App.utils.toast) {
        App.utils.toast('AI Copilot docked to screen edge. Tap tab to reopen.');
      }
    });

    // Dragging state variables
    let isDragging = false;
    let dragStartY = 0;
    let elementStartY = 0;
    let hasMoved = false;

    function onPointerDown(e) {
      if (e.target.closest('#btnChatHideFab')) return;
      isDragging = true;
      hasMoved = false;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      dragStartY = clientY;
      const rect = launcher.getBoundingClientRect();
      elementStartY = rect.top;
      launcher.classList.add('dragging');

      window.addEventListener('mousemove', onPointerMove, { passive: false });
      window.addEventListener('mouseup', onPointerUp);
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - dragStartY;
      if (Math.abs(deltaY) > 4) {
        hasMoved = true;
        if (e.cancelable) e.preventDefault();
        let newTop = elementStartY + deltaY;
        const maxTop = window.innerHeight - (launcher.offsetHeight || 48) - 10;
        const minTop = 60; // Below header
        newTop = Math.max(minTop, Math.min(maxTop, newTop));
        launcher.style.top = newTop + 'px';
        launcher.style.bottom = 'auto';
        state.fabTop = newTop;
      }
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      launcher.classList.remove('dragging');
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);

      if (hasMoved) {
        saveState();
      }
    }

    if (launcher) {
      launcher.addEventListener('mousedown', onPointerDown);
      launcher.addEventListener('touchstart', onPointerDown, { passive: true });

      // Launcher click (only if not dragged)
      launcher.addEventListener('click', (e) => {
        if (hasMoved || e.target.closest('#btnChatHideFab')) return;
        state.isOpen = !state.isOpen;
        if (state.isOpen) {
          state.hasUnread = false;
          state.isMinimized = false;
        }
        renderFloatingWidget();
        if (state.isOpen) {
          setTimeout(() => {
            const inp = document.getElementById('chatTextInput');
            if (inp) inp.focus();
          }, 100);
        }
      });
    }

    // Close button
    closeBtn?.addEventListener('click', () => {
      state.isOpen = false;
      state.isDocked = true;
      saveState();
      renderFloatingWidget();
    });

    // Minimize button
    minimizeBtn?.addEventListener('click', () => {
      state.isMinimized = !state.isMinimized;
      renderFloatingWidget();
    });

    // Settings tray toggle
    settingsToggle?.addEventListener('click', () => {
      if (settingsTray) {
        const isHidden = settingsTray.style.display === 'none';
        settingsTray.style.display = isHidden ? 'block' : 'none';
      }
    });

    // Model select change
    modelSelect?.addEventListener('change', (e) => {
      state.model = e.target.value;
      saveState();
      const modelObj = MODELS.find((m) => m.id === state.model);
      const lbl = container.querySelector('#chatActiveModelLabel');
      if (lbl && modelObj) lbl.textContent = modelObj.name;
      if (App.utils && App.utils.toast) App.utils.toast(`Gemini Model set to ${modelObj.name}`);
    });

    // Role selection
    container.querySelectorAll('[data-chat-role]').forEach((card) => {
      card.addEventListener('click', () => {
        const newRole = card.dataset.chatRole;
        if (ROLES[newRole]) {
          state.role = newRole;
          saveState();
          renderFloatingWidget();
          if (App.utils && App.utils.toast) App.utils.toast(`Advisor Persona: ${ROLES[newRole].name}`);
        }
      });
    });

    // Context check
    contextCheck?.addEventListener('change', (e) => {
      state.attachContext = e.target.checked;
      if (App.utils && App.utils.toast) {
        App.utils.toast(state.attachContext ? 'Live Portfolio Context attached' : 'Context detached');
      }
    });

    // Clear history
    clearBtn?.addEventListener('click', () => {
      resetConversation();
    });

    // Quick starter chips
    container.querySelectorAll('[data-prompt]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const promptText = chip.dataset.prompt;
        const role = chip.dataset.role;
        if (role && ROLES[role]) state.role = role;
        if (input) input.value = promptText;
        handleSendMessage();
      });
    });

    // Copy message buttons
    container.querySelectorAll('[data-copy-text]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.dataset.copyText;
        if (navigator.clipboard && text) {
          navigator.clipboard.writeText(text).then(() => {
            if (App.utils && App.utils.toast) App.utils.toast('Response copied to clipboard');
          });
        }
      });
    });

    // Input auto-resize and Enter key
    if (input) {
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      });
    }

    // Send button
    sendBtn?.addEventListener('click', handleSendMessage);

    // Auth prompt action handler
    function triggerAuthPrompt(e) {
      if (e) e.preventDefault();
      if (window.App && window.App.auth && window.App.auth.isDemoMode && window.App.auth.isDemoMode()) {
        window.App.auth.exitDemoMode();
      }
      state.isOpen = false;
      renderFloatingWidget();
      const authScreen = document.getElementById('authScreen');
      if (authScreen) authScreen.style.display = 'flex';
      const appShell = document.getElementById('appShell');
      if (appShell) appShell.classList.remove('active');
    }

    container.querySelector('#btnChatLoginPrompt')?.addEventListener('click', triggerAuthPrompt);
    container.querySelectorAll('a[href^="#auth"], a[href^="#login"]').forEach((el) => {
      el.addEventListener('click', triggerAuthPrompt);
    });

    // Action link delegation for clickable routing
    container.querySelectorAll('.chat-action-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          const target = href.slice(1);
          if (target === 'auth-prompt' || target.startsWith('auth') || target.startsWith('login')) {
            triggerAuthPrompt(e);
            return;
          }
          if (window.App && window.App.router && window.App.router.navigate) {
            window.App.router.navigate(target);
          } else {
            location.hash = href;
          }
          if (window.innerWidth < 768) {
            state.isOpen = false;
            renderFloatingWidget();
          }
        }
      });
    });
  }

  async function handleSendMessage() {
    const input = document.getElementById('chatTextInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || state.isLoading) return;

    input.value = '';
    input.style.height = 'auto';

    // Verify user authentication
    if (!isAuthenticatedUser()) {
      const userMsg = {
        id: 'msg_' + Date.now(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      state.messages.push(userMsg);
      state.messages.push({
        id: 'msg_' + (Date.now() + 1),
        role: 'assistant',
        content: `🔒 **Sign-In Required to Use AI Advisor**\n\nThe AI Financial Advisor is only usable after user login.\n\nPlease **create a profile** and **sign in** to start using the AI Advisor for live portfolio analytics, risk modeling, and financial insights.\n\n👉 [Click here to Sign In or Create Profile](#auth-prompt)`,
        timestamp: new Date().toISOString(),
        model: state.model,
      });
      saveState();
      renderFloatingWidget();
      if (window.App && window.App.utils && window.App.utils.toast) {
        window.App.utils.toast('Please sign in or create a profile to use AI Advisor.', 'err');
      }
      return;
    }

    // Add user message
    const userMsg = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(userMsg);
    state.isLoading = true;
    saveState();
    renderFloatingWidget();

    try {
      const liveContext = await getLivePortfolioContext();
      const roleObj = ROLES[state.role] || ROLES.advisor;

      const payload = {
        messages: state.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          content: m.content,
        })),
        model: state.model,
        systemInstruction: roleObj.systemPrompt,
        portfolioContext: liveContext,
      };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = null;
      const rawText = await res.text();
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (jsonErr) {
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status} (${res.statusText || 'Error'}).`);
        }
        // If response is text or html, handle gracefully
        if (rawText && rawText.length < 500 && !rawText.includes('<html')) {
          data = { reply: rawText };
        } else {
          throw new Error('Server returned an invalid response format. Please retry in a moment.');
        }
      }

      if (!res.ok) {
        const errorMsg = data?.error || (typeof data === 'string' ? data : `Error ${res.status}: Failed to reach Gemini API`);
        throw new Error(errorMsg);
      }

      state.messages.push({
        id: 'msg_' + Date.now(),
        role: 'assistant',
        content: data.reply || 'No response text received from Gemini.',
        timestamp: data.timestamp || new Date().toISOString(),
        model: data.model || state.model,
      });
    } catch (err) {
      console.error('Chat error:', err);
      const isApiKeyErr = err.message && (err.message.includes('GEMINI_API_KEY') || err.message.includes('API key'));
      const isOverloadErr = err.message && (err.message.includes('503') || err.message.includes('high demand') || err.message.includes('429') || err.message.includes('UNAVAILABLE'));
      
      let fallbackText = '';
      if (isApiKeyErr) {
        fallbackText = `⚠️ **AI Advisor Notice:** GEMINI_API_KEY is not configured.\n\n📌 **How to get & configure your free GEMINI_API_KEY:**\n1. Visit **[Google AI Studio](https://aistudio.google.com/app/apikey)** and click **Create API Key**.\n2. Open your AI Studio workspace **Settings (Gear icon) ➜ Environment Variables / Secrets**.\n3. Add \`GEMINI_API_KEY\` with your key value.`;
      } else {
        // Institutional local financial reasoning fallback with complete portfolio awareness
        const lastUserMsg = state.messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '';
        if (window.App && window.App.portfolioIntelligence && lastGatheredPortfolioData) {
          fallbackText = window.App.portfolioIntelligence.generateLocalDeterministicAnswer(lastUserMsg, lastGatheredPortfolioData);
        } else {
          fallbackText = `🧠 **AI Financial Advisor (Analytical Summary):**\n\n`;
          fallbackText += `I have analyzed your investment query and active portfolio parameters:\n\n`;
          fallbackText += `• **Capital Allocation Strategy:** Maintain a diversified spread across high-yield private lending, fixed income assets, and gold reserves.\n`;
          fallbackText += `• **Liquidity & Emergency Buffer:** Ensure at least 6 months of living expenses remain locked in liquid savings or short-term Fixed Deposits.\n`;
          fallbackText += `• **Risk Management:** Rebalance assets where single-borrower or single-institution exposure exceeds 15% of your total net worth.\n\n`;
          fallbackText += `*(Server status: ${err.message || 'Auto-calibrated offline mode'})*`;
        }
      }

      state.messages.push({
        id: 'msg_' + Date.now(),
        role: 'assistant',
        content: fallbackText,
        timestamp: new Date().toISOString(),
        model: state.model,
      });
    } finally {
      state.isLoading = false;
      saveState();
      renderFloatingWidget();
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      const list = document.getElementById('chatMessagesList');
      if (list) list.scrollTop = list.scrollHeight;
    }, 50);
  }

  function init() {
    loadState();
    renderFloatingWidget();
  }

  return {
    init,
    clearHistory: resetConversation,
    open: () => {
      state.isOpen = true;
      state.isMinimized = false;
      state.hasUnread = false;
      renderFloatingWidget();
    },
    close: () => {
      state.isOpen = false;
      state.isDocked = true;
      saveState();
      renderFloatingWidget();
    },
    ask: (question, role = 'advisor') => {
      if (ROLES[role]) state.role = role;
      state.isOpen = true;
      state.isMinimized = false;
      renderFloatingWidget();
      const input = document.getElementById('chatTextInput');
      if (input) {
        input.value = question;
        handleSendMessage();
      }
    }
  };
})();
