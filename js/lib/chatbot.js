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
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', tag: 'Fast & Stable', desc: 'Recommended general intelligence, financial math, and live portfolio advice' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tag: 'Ultra-Fast', desc: 'High-speed low-latency answers for quick formulas, definitions, and scenario lookups' },
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', tag: 'Advanced Reasoning', desc: 'Extended reasoning preview for multifaceted portfolio queries' },
  ];

  const ROLES = {
    advisor: {
      name: 'Portfolio Advisor',
      icon: '💼',
      desc: 'Holistic wealth management, asset allocation, and compounding strategies.',
      systemPrompt: `You are the Lead Financial Intelligence Advisor of Personal Investment OS (PIOS).
You assist users with high-yield investments, asset allocation, portfolio health, debt instruments, and wealth accumulation.
Provide crisp, structured advice with bold key figures and bullet points.`
    },
    risk: {
      name: 'Risk & Drift Auditor',
      icon: '⚖️',
      desc: 'Sharpe/Sortino ratios, concentration limits, and rebalancing triggers.',
      systemPrompt: `You are the Quantitative Risk & Portfolio Drift Auditor for PIOS.
Specialize in Modern Portfolio Theory, Sharpe Ratio, Sortino Ratio (downside deviation), Value at Risk (VaR), platform concentration, and rebalancing drift bands.
Evaluate risk-adjusted return trade-offs with rigorous analytical clarity.`
    },
    tax: {
      name: 'Tax Strategist',
      icon: '🧾',
      desc: 'Indian income tax slabs (Budget 2024), STCG 20%, LTCG 12.5%, and Advance Tax.',
      systemPrompt: `You are the Indian Tax & Capital Gains Specialist for PIOS.
Expert in FY 2024-25 / 2025-26 New vs Old Tax Regimes, Budget 2024 revised STCG (20%), Equity LTCG (12.5% > ₹1.25L exemption), Gold LTCG (12.5%), Section 87A rebate, standard deduction (₹75k), and Advance Tax quarterly calendar (15 Jun, 15 Sep, 15 Dec, 15 Mar).`
    },
    yield: {
      name: 'Cash Flow & Yield',
      icon: '💰',
      desc: 'P2P lending yields, fixed income compounding, and EMI amortizations.',
      systemPrompt: `You are the Passive Cash Flow & Yield Specialist for PIOS.
Focus on optimizing monthly cashflow velocity, P2P high-yield lending default buffers, reinvestment compounding math, and loan amortization scheduling.`
    }
  };

  const STARTER_PROMPTS = [
    { text: 'Analyze my portfolio health & risk score', role: 'risk' },
    { text: 'What is my current asset allocation drift?', role: 'risk' },
    { text: 'How will Budget 2024 LTCG (12.5%) impact my returns?', role: 'tax' },
    { text: 'Compare monthly simple interest vs compounding effect', role: 'yield' },
    { text: 'Give me a 3-step action plan to increase my passive yield', role: 'advisor' },
  ];

  let state = {
    isOpen: false,
    isMinimized: false,
    isDocked: false,
    fabTop: null,
    messages: [],
    model: 'gemini-3.6-flash',
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
        state.model = 'gemini-3.6-flash';
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
      if (savedDocked === 'true') {
        state.isDocked = true;
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

  async function getLivePortfolioContext() {
    if (!state.attachContext) return null;
    try {
      const [deals, metrics, schedule] = await Promise.all([
        App.api ? App.api.listDeals({ eq: { status: 'ACTIVE' } }) : [],
        App.api ? App.api.listDealMetrics() : [],
        App.api ? App.api.listSchedule() : [],
      ]);

      const totalPrincipal = deals.reduce((a, d) => a + (d.current_principal || 0), 0);
      const activeCurr = App.currency ? App.currency.getActiveCurrency() : 'INR';
      
      const byType = {};
      deals.forEach((d) => {
        const t = d.investment_type || 'Other';
        byType[t] = (byType[t] || 0) + (d.current_principal || 0);
      });

      const overdue = schedule.filter((s) => s.status === 'OVERDUE').length;
      const dealReturns = deals.filter((d) => d.annual_roi != null).map((d) => Number(d.annual_roi));
      const avgROI = dealReturns.length ? (dealReturns.reduce((a, b) => a + b, 0) / dealReturns.length).toFixed(1) : '—';

      return `
- Active Display Currency: ${activeCurr}
- Total Active Invested Capital: ₹${totalPrincipal.toLocaleString('en-IN')}
- Active Deals Count: ${deals.length}
- Average Annual ROI: ${avgROI}%
- Overdue Payment Schedules: ${overdue}
- Asset Breakdown: ${Object.entries(byType).map(([k, v]) => `${k}: ₹${v.toLocaleString('en-IN')}`).join(', ') || 'No active positions'}
`;
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

    // Markdown links [text](url)
    html = html.replace(/\[([^\]]+)\]\((\#[^)]+)\)/g, '<a href="$2" class="chat-action-link" style="color:var(--gold);text-decoration:underline;cursor:pointer;font-weight:600">$1</a>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" class="chat-link" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline">$1</a>');

    // Code blocks ``` ... ```
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$1</code></pre>');
    // Inline code `...`
    html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Bullet lists
    html = html.replace(/^\s*[\-\*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
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
        <div id="piosChatDockTab" class="chat-dock-tab" title="Click to open AI Advisor (Draggable)">
          <span>✨</span>
          <span>AI Advisor</span>
        </div>
      ` : `
        <!-- Floating Action Button (FAB) -->
        <div id="piosChatLauncher" class="chat-fab ${state.isOpen ? 'active' : ''}" style="${posStyle}" title="Drag vertically to reposition • Click to open AI Advisor">
          <div class="chat-fab-glow"></div>
          <div class="chat-fab-inner">
            <span class="chat-fab-drag-handle" title="Drag to move up/down">⋮⋮</span>
            <span class="chat-fab-icon">${state.isOpen ? '✕' : '✨'}</span>
            <span class="chat-fab-label">AI Advisor</span>
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
        App.utils.toast('AI Advisor docked to screen edge. Tap tab to reopen.');
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
      const isOverloadErr = err.message && (err.message.includes('503') || err.message.includes('high demand') || err.message.includes('UNAVAILABLE'));
      
      let guidanceNote = '';
      if (isApiKeyErr) {
        guidanceNote = `\n\n📌 **How to get & configure your free GEMINI_API_KEY:**\n1. Visit **[Google AI Studio](https://aistudio.google.com/app/apikey)** and click **Create API Key** (Free tier available).\n2. Open your AI Studio workspace **Settings (Gear icon) ➜ Environment Variables / Secrets**.\n3. Add \`GEMINI_API_KEY\` with your key value.\n4. Save and the AI Advisor will connect immediately.`;
      } else if (isOverloadErr) {
        guidanceNote = `\n\n⚡ *The model experienced temporary high demand. The server will auto-switch to faster fallback models like Gemini 2.5 Flash. Please try asking again now.*`;
      }

      state.messages.push({
        id: 'msg_' + Date.now(),
        role: 'assistant',
        content: `⚠️ **AI Advisor Response:**\n\n${err.message}${guidanceNote}`,
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
