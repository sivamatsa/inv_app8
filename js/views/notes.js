/* ==========================================================================
   Investment OS - Premium Notes & Knowledge Hub
   3-Pane Executive Workspace:
     - Left Pane: Sidebar for Folders, Tags, Smart Views & Metrics
     - Center Pane: Note List with Toggle between List & Folder Grouping, Search, Sort & Direct Inline Card Editing
     - Right Pane: Distraction-free Rich-Text Editor with Autosave, Entity Linking, Checklists & AI Knowledge Assistant
   ========================================================================== */
window.App = window.App || {};

(function () {
  'use strict';

  // ---- Built-in Executive Templates ----
  const DEFAULT_TEMPLATES = [
    {
      id: 'tmpl_thesis',
      title: 'Investment Thesis & Due Diligence',
      category: 'investing',
      content_html: `<h2>Investment Thesis</h2><p><strong>Opportunity Summary:</strong> Concise overview of why this asset or deal is attractive at current valuation.</p><blockquote><strong>Core Thesis:</strong> What unique edge, market expansion, or turnaround catalyst drives the return?</blockquote><h3>Financial & Valuation Snapshot</h3><ul><li>Target ROI / IRR: </li><li>Horizon: 3-5 Years</li><li>Entry Valuation / Price: </li><li>Margin of Safety: </li></ul><h3>Key Risks & Mitigations</h3><ul><li><strong>Execution Risk:</strong> </li><li><strong>Market / Regulatory:</strong> </li><li><strong>Downside Protection:</strong> </li></ul><h3>Due Diligence Checklist</h3><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Verified audited financial statements & cash flows</div></div><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Confirmed promoter/founder shareholding & debt schedule</div></div><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Analyzed competitive moat vs top 3 market peers</div></div>`,
    },
    {
      id: 'tmpl_meeting',
      title: 'Founder & Deal Meeting Minutes',
      category: 'meetings',
      content_html: `<h2>Meeting Minutes: </h2><p><em>Date: ${new Date().toLocaleDateString()} · Attendees: </em></p><h3>Key Discussion Points</h3><ul><li>Traction & MoM growth metrics</li><li>Current runway and capital requirements</li><li>Key operational bottlenecks</li></ul><h3>Decisions Made</h3><blockquote>Agreed terms or milestone conditions here.</blockquote><h3>Action Items</h3><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Review term sheet clauses with legal counsel</div></div><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Send follow-up queries regarding cap table</div></div>`,
    },
    {
      id: 'tmpl_review',
      title: 'Quarterly Portfolio Review',
      category: 'planning',
      content_html: `<h2>Quarterly Portfolio Review: Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}</h2><p><strong>Net Worth & Asset Allocation Status:</strong></p><div class="notes-table-wrap"><table class="notes-rich-table"><thead><tr><th>Asset Class</th><th>Target %</th><th>Actual %</th><th>Rebalance Action</th></tr></thead><tbody><tr><td>Equities / SIPs</td><td>55%</td><td>%</td><td>Maintain</td></tr><tr><td>Fixed Income / Debt</td><td>25%</td><td>%</td><td>Maintain</td></tr><tr><td>Physical Gold / SGB</td><td>15%</td><td>%</td><td>Accumulate</td></tr><tr><td>Liquid Cash Reserves</td><td>5%</td><td>%</td><td>Reserve</td></tr></tbody></table></div><h3>Strategic Reflections</h3><ul><li>What worked well this quarter?</li><li>What positions need trimming or exit?</li></ul>`,
    },
    {
      id: 'tmpl_decision',
      title: 'Financial Decision Record',
      category: 'governance',
      content_html: `<h2>Decision Record: </h2><p><strong>Context & Problem Statement:</strong></p><p>Describe the capital allocation or portfolio restructuring decision being made.</p><h3>Options Evaluated</h3><ol><li><strong>Option A:</strong> Pros / Cons</li><li><strong>Option B:</strong> Pros / Cons</li></ol><h3>Selected Path & Justification</h3><blockquote>Chosen approach and the specific risk/reward calculus.</blockquote><p><strong>Review Date:</strong> 6 Months</p>`,
    },
    {
      id: 'tmpl_checklist',
      title: 'Execution & Due Diligence Checklist',
      category: 'checklist',
      content_html: `<h2>Action Checklist</h2><p><em>Track critical milestones and regulatory checkpoints.</em></p><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Verify banking mandate & automated SIP debits</div></div><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Audit insurance coverage and emergency fund liquidity</div></div><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Consolidate quarterly tax receipts & TDS certificates</div></div><div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Sync latest gold holdings and sovereign rate benchmarks</div></div>`,
    },
    {
      id: 'tmpl_knowledge',
      title: 'Market Knowledge & Learning Note',
      category: 'knowledge',
      content_html: `<h2>Knowledge Hub: </h2><p><strong>Concept / Framework:</strong></p><blockquote>Core principle or mental model in one sentence.</blockquote><h3>Key Takeaways & Insights</h3><ul><li>Insight 1: </li><li>Insight 2: </li><li>Insight 3: </li></ul><h3>Practical Application to Portfolio</h3><p>How does this apply to my asset allocation, risk parameters, or timing?</p><p><strong>References & Sources:</strong></p><ul><li><a href="#">Source Link</a></li></ul>`,
    },
  ];

  // ---- Module State ----
  const state = {
    notes: [],
    folders: [],
    templates: DEFAULT_TEMPLATES.slice(),
    activeTab: 'all_notes', // 'all_notes' | 'workspace'
    allNotesView: 'table', // 'table' (ALV grid) | 'grid' (cards)
    allNotesFolder: 'all', // 'all' | 'unorganized' | folderId
    allNotesFilter: 'all', // 'all', 'pinned', 'favorites', 'reminders', 'trash'
    allNotesSearch: '',
    allNotesSort: 'updated_desc',
    activeFilter: 'all', // 'all', 'pinned', 'favorites', 'reminders', 'archive', 'trash', 'folder:XYZ', or 'tag:xyz'
    searchQuery: '',
    sortBy: 'updated_desc',
    activeNoteId: null,
    selectedNoteIds: new Set(),
    mobileView: 'list', // 'list' | 'editor'
    displayMode: 'list', // 'list' | 'folder'
    inlineEditingNoteId: null, // note id if editing inline in card
    collapsedFolderGroups: new Set(),
    dirty: false,
    saveStatus: 'saved', // 'saved', 'saving', 'cached', 'failed'
    entitiesCache: null,
  };

  let activeSync = null;

  // ---- Helper: Safe Note Statistics & Plain Text Extraction ----
  function getNoteStats(content) {
    if (App.notesEditor && typeof App.notesEditor.calculateStats === 'function') {
      return App.notesEditor.calculateStats(content || '');
    }
    const clean = String(content || '').replace(/<[^>]+>/g, '').trim();
    const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
    return {
      words,
      characters: clean.length,
      readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
    };
  }

  function getNotePlainText(content) {
    if (App.notesEditor && typeof App.notesEditor.extractPlainText === 'function') {
      return App.notesEditor.extractPlainText(content || '');
    }
    return String(content || '').replace(/<[^>]+>/g, '').trim();
  }

  // Preview text for lists and cards. Same extraction as getNotePlainText, but block boundaries
  // become spaces so a heading and the paragraph after it no longer run together.
  function getSnippetText(content, max) {
    const spaced = String(content || '').replace(/<\/(p|div|h[1-6]|li|blockquote|tr|pre)>|<br\s*\/?>/gi, ' ');
    return getNotePlainText(spaced).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  // ---- Helper: Relative Date Formatting ----
  function formatRelativeDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    } catch (e) {
      return '';
    }
  }

  // ---- Helper: Get Currently Selected Note ----
  function getActiveNote() {
    if (!state.activeNoteId) return null;
    return state.notes.find((n) => String(n.id) === String(state.activeNoteId)) || null;
  }

  // ---- Presentation helpers (icons, small fragments, menus, navigation drawer) ----
  // Inline SVG icons: stroke inherits currentColor, decorative only (aria-hidden).
  const ICON_PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1"/>',
    pin: '<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
    strike: '<path d="M4 12h16M16 6.5C15 5.5 13.6 5 12 5c-2.5 0-4 1.2-4 3 0 1.2.8 2 2 2.5M8.5 17.5c1 1 2.300 1.500 3.900 1.500 2.500 0 4-1.200 4-3 0-.6-.2-1.100-.6-1.500"/>',
    ul: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    ol: '<path d="M10 6h10M10 12h10M10 18h10M4 5l1.500-1v5M3.500 14.500c.4-.8 2.500-.9 2.500.4 0 1-2.500 1.800-2.500 2.800h3"/>',
    checksq: '<rect x="3.500" y="3.500" width="17" height="17" rx="3"/><path d="m8 12 3 3 5-6"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    quote: '<path d="M9 7H5v6h4M9 13c0 2-1 3-3 4M19 7h-4v6h4M19 13c0 2-1 3-3 4"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/>',
    sparkles: '<path d="M12 3l1.800 4.700L18.500 9.500 13.800 11.300 12 16l-1.800-4.700L5.500 9.500l4.700-1.800zM19 15l.8 2.200L22 18l-2.200.8L19 21l-.8-2.200L16 18l2.200-.8z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.700L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.700L3 8"/><path d="M3 3v5h5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.500"/><rect x="13" y="4" width="7" height="7" rx="1.500"/><rect x="4" y="13" width="7" height="7" rx="1.500"/><rect x="13" y="13" width="7" height="7" rx="1.500"/>',
    rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    alert: '<path d="M12 4 2.500 20h19z"/><path d="M12 10v4M12 17v.01"/>',
    inbox: '<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    json: '<path d="M8 4c-2 0-3 1-3 3v2c0 1-.8 2-2 3 1.200 1 2 2 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1 .8 2 2 3-1.200 1-2 2-2 3v2c0 2-1 3-3 3"/>',
    text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
    html: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
  };

  function ic(name, extraClass) {
    return `<svg class="n-ic${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ''}</svg>`;
  }

  function findFolder(note) {
    return state.folders.find((f) => String(f.id) === String(note.folder_id));
  }

  // Only the non-default priorities earn a badge (the API default is 'NORMAL'/'medium').
  function priorityBadge(note) {
    const p = String(note.priority || '').toLowerCase();
    if (p === 'high') return '<span class="n-badge n-badge--high">High</span>';
    if (p === 'low') return '<span class="n-badge n-badge--low">Low</span>';
    return '';
  }

  // Pin / star toggle used by the library table and cards (handlers bind to data-simple-pin / data-simple-fav).
  function noteToggleButtons(n) {
    const pinLabel = n.is_pinned ? 'Unpin note' : 'Pin note to top';
    const favLabel = n.is_favorite ? 'Remove star' : 'Star note';
    return `
      <button type="button" class="n-icon-btn n-icon-btn--xs ${n.is_pinned ? 'is-on' : ''}" data-simple-pin="${n.id}" aria-pressed="${n.is_pinned ? 'true' : 'false'}" title="${pinLabel}" aria-label="${pinLabel}">${ic('pin')}</button>
      <button type="button" class="n-icon-btn n-icon-btn--xs ${n.is_favorite ? 'is-on' : ''}" data-simple-fav="${n.id}" aria-pressed="${n.is_favorite ? 'true' : 'false'}" title="${favLabel}" aria-label="${favLabel}">${ic('star')}</button>
    `;
  }

  function checklistProgress(taskStats) {
    if (!taskStats) return '';
    return `<span class="nl-progress ${taskStats.pct === 100 ? 'is-done' : ''}" title="${taskStats.checked} of ${taskStats.total} tasks done"><span class="nl-progress-bar"><i style="width:${taskStats.pct}%"></i></span>${taskStats.checked}/${taskStats.total} tasks</span>`;
  }

  function entityChips(note, limit) {
    const list = Array.isArray(note.linked_entities) ? note.linked_entities : [];
    if (!list.length) return '';
    const label = (ent) => App.utils.escapeHtml(ent.label || 'Entity');
    return list.slice(0, limit).map((ent) => `
      <span class="n-chip n-chip--accent notes-simple-entity-chip" data-entity-type="${App.utils.escapeHtml(ent.type)}" data-entity-id="${App.utils.escapeHtml(ent.id)}" title="Open ${label(ent)}">${ic('link')}<span>${label(ent)}</span></span>
    `).join('') + (list.length > limit ? `<span class="n-chip">+${list.length - limit}</span>` : '');
  }

  function tagChips(note, limit) {
    const list = Array.isArray(note.tags) ? note.tags : [];
    if (!list.length) return '';
    return list.slice(0, limit).map((t) => `<span class="n-chip">#${App.utils.escapeHtml(t)}</span>`).join('') + (list.length > limit ? `<span class="n-chip">+${list.length - limit}</span>` : '');
  }

  // ---- Popover menus (delegated once; markup uses data-menu-trigger + aria-controls) ----
  let notesGlobalsBound = false;

  function closeNotesMenus(except) {
    document.querySelectorAll('#pane-notes .n-menu').forEach((menu) => {
      if (menu === except || menu.hidden) return;
      menu.hidden = true;
      const trigger = document.querySelector(`#pane-notes [aria-controls="${menu.id}"]`);
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function bindNotesGlobals() {
    if (notesGlobalsBound) return;
    notesGlobalsBound = true;

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest ? e.target.closest('[data-menu-trigger]') : null;
      if (trigger && trigger.closest('#pane-notes')) {
        const menu = document.getElementById(trigger.getAttribute('aria-controls'));
        if (!menu) return;
        const willOpen = menu.hidden;
        closeNotesMenus(willOpen ? menu : null);
        menu.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) {
          const first = menu.querySelector('[role="menuitem"]');
          if (first) first.focus();
        }
        return;
      }
      // Item clicks run their own handler first, then the menu closes.
      if (e.target.closest && e.target.closest('#pane-notes .n-menu')) {
        setTimeout(() => closeNotesMenus(null), 0);
        return;
      }
      closeNotesMenus(null);
    });

    // Quick capture shortcut (Ctrl/Cmd + Shift + N) - bound once instead of on every visit to Notes.
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        if (App.utils.qs('#pane-notes.active')) {
          e.preventDefault();
          createNewNoteModal();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      const openMenu = document.querySelector('#pane-notes .n-menu:not([hidden])');
      if (openMenu) {
        const items = Array.from(openMenu.querySelectorAll('[role="menuitem"]'));
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'Escape') {
          e.preventDefault();
          const trigger = document.querySelector(`#pane-notes [aria-controls="${openMenu.id}"]`);
          closeNotesMenus(null);
          if (trigger) trigger.focus();
        } else if (e.key === 'ArrowDown' && items.length) {
          e.preventDefault();
          items[(idx + 1) % items.length].focus();
        } else if (e.key === 'ArrowUp' && items.length) {
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length].focus();
        } else if (e.key === 'Tab') {
          closeNotesMenus(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        const ws = document.querySelector('#notesWorkspace.nav-open');
        if (ws) {
          setNavDrawerOpen(false);
          const toggle = document.querySelector('#notesNavToggleBtn');
          if (toggle) toggle.focus();
        }
      }
    });
  }

  // ---- Navigation: persistent collapse on wide screens, drawer on narrow ones ----
  const NAV_PREF_KEY = 'investmentOS_notesNavCollapsed';
  const NAV_WIDE_PX = 1040; // keep in sync with the container query in css/notes.css

  function loadNavCollapsedPref() {
    try { return localStorage.getItem(NAV_PREF_KEY) === '1'; } catch (_) { return false; }
  }

  function saveNavCollapsedPref(collapsed) {
    try { localStorage.setItem(NAV_PREF_KEY, collapsed ? '1' : '0'); } catch (_) { /* storage unavailable */ }
  }

  function syncNavToggleState() {
    const ws = App.utils.qs('#notesWorkspace');
    const btn = App.utils.qs('#notesNavToggleBtn');
    if (!ws || !btn) return;
    const wide = ws.clientWidth >= NAV_WIDE_PX;
    const expanded = wide ? !ws.classList.contains('nav-collapsed') : ws.classList.contains('nav-open');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function setNavDrawerOpen(open) {
    const ws = App.utils.qs('#notesWorkspace');
    if (!ws) return;
    ws.classList.toggle('nav-open', !!open);
    if (open) {
      const first = App.utils.qs('#notesNavPane .notes-nav-btn.active') || App.utils.qs('#notesNavPane .notes-nav-btn');
      if (first) first.focus();
    }
    syncNavToggleState();
  }

  function toggleNotesNav() {
    const ws = App.utils.qs('#notesWorkspace');
    if (!ws) return;
    if (ws.clientWidth >= NAV_WIDE_PX) {
      const collapsed = ws.classList.toggle('nav-collapsed');
      saveNavCollapsedPref(collapsed);
      syncNavToggleState();
    } else {
      setNavDrawerOpen(!ws.classList.contains('nav-open'));
    }
  }

  function closeNavDrawer() {
    const ws = App.utils.qs('#notesWorkspace');
    if (ws && ws.classList.contains('nav-open')) setNavDrawerOpen(false);
  }

  // Panes re-render by replacing their HTML, which drops focus. Remember what was focused
  // (typing in search, changing a select, pressing a filter) and put it back afterwards.
  function captureFocus(root) {
    const el = document.activeElement;
    if (!el || !root || el === document.body || !root.contains(el)) return null;
    let selector = '';
    if (el.id) selector = '#' + el.id;
    else if (el.dataset && el.dataset.pillFilter) selector = `[data-pill-filter="${el.dataset.pillFilter}"]`;
    else if (el.dataset && el.dataset.viewMode) selector = `[data-view-mode="${el.dataset.viewMode}"]`;
    else if (el.dataset && el.dataset.filter) selector = `[data-filter="${el.dataset.filter}"]`;
    return selector ? { selector } : null;
  }

  function restoreFocus(saved, root) {
    if (!saved || !root) return;
    const el = root.querySelector(saved.selector);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el.tagName === 'INPUT' && el.type === 'text') {
      try { const n = el.value.length; el.setSelectionRange(n, n); } catch (_) { /* not selectable */ }
    }
  }

  function getActiveViewLabel() {
    const f = state.activeFilter;
    if (f === 'all') return 'All notes';
    if (f === 'pinned') return 'Pinned';
    if (f === 'favorites') return 'Favorites';
    if (f === 'reminders') return 'Reminders & due';
    if (f === 'archive') return 'Archive';
    if (f === 'trash') return 'Trash';
    if (f.startsWith('folder:')) {
      const folder = state.folders.find((x) => String(x.id) === f.replace('folder:', ''));
      return folder ? folder.name : 'Folder';
    }
    if (f.startsWith('tag:')) return '#' + f.replace('tag:', '');
    return 'Notes';
  }

  // ---- Load Data from API / DB ----
  async function loadNotesData() {
    try {
      const [fetchedNotes, fetchedFolders, fetchedTemplates] = await Promise.all([
        App.api.listNotes(),
        App.api.listNoteFolders().catch(() => []),
        App.api.listNoteTemplates().catch(() => []),
      ]);

      state.notes = Array.isArray(fetchedNotes) ? fetchedNotes : [];
      state.folders = Array.isArray(fetchedFolders) ? fetchedFolders : [];

      const customTemplates = Array.isArray(fetchedTemplates) ? fetchedTemplates : [];
      state.templates = [...DEFAULT_TEMPLATES, ...customTemplates];

      // Auto-select first note if none selected or if selected note was deleted
      if (!getActiveNote() && state.notes.length > 0) {
        const firstActive = state.notes.find((n) => !n.in_trash && !n.is_archived) || state.notes[0];
        if (firstActive) {
          state.activeNoteId = firstActive.id;
        }
      }
    } catch (err) {
      console.warn('[NotesHub] Error loading notes data:', err);
    }
  }

  // ---- Filter and Sort Notes ----
  function getFilteredNotes() {
    let list = state.notes.slice();

    // 1. Navigation Filter
    if (state.activeFilter === 'all') {
      list = list.filter((n) => !n.in_trash && !n.is_archived);
    } else if (state.activeFilter === 'pinned') {
      list = list.filter((n) => !n.in_trash && !n.is_archived && n.is_pinned);
    } else if (state.activeFilter === 'favorites') {
      list = list.filter((n) => !n.in_trash && !n.is_archived && n.is_favorite);
    } else if (state.activeFilter === 'reminders') {
      list = list.filter((n) => !n.in_trash && !n.is_archived && n.reminder_at);
    } else if (state.activeFilter === 'archive') {
      list = list.filter((n) => !n.in_trash && n.is_archived);
    } else if (state.activeFilter === 'trash') {
      list = list.filter((n) => n.in_trash);
    } else if (state.activeFilter.startsWith('folder:')) {
      const fId = state.activeFilter.replace('folder:', '');
      list = list.filter((n) => !n.in_trash && String(n.folder_id || '') === String(fId));
    } else if (state.activeFilter.startsWith('tag:')) {
      const tag = state.activeFilter.replace('tag:', '').toLowerCase();
      list = list.filter((n) => !n.in_trash && Array.isArray(n.tags) && n.tags.some((t) => t.toLowerCase() === tag));
    }

    // 2. Search Query (across title, body content, and tags)
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase().trim();
      list = list.filter((n) => {
        const t = (n.title || '').toLowerCase();
        const c = (n.content || '').toLowerCase();
        const tags = Array.isArray(n.tags) ? n.tags.join(' ').toLowerCase() : '';
        return t.includes(q) || c.includes(q) || tags.includes(q);
      });
    }

    // 3. Sorting
    list.sort((a, b) => {
      // Pinned notes bubble to top unless in trash
      if (state.activeFilter !== 'trash') {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
      }

      switch (state.sortBy) {
        case 'updated_asc':
          return new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at);
        case 'created_desc':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'title_asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'priority_desc': {
          const pOrder = { high: 3, medium: 2, low: 1 };
          return (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0);
        }
        case 'reminder_asc':
          return (a.reminder_at ? new Date(a.reminder_at) : 9999999999999) - (b.reminder_at ? new Date(b.reminder_at) : 9999999999999);
        case 'updated_desc':
        default:
          return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
      }
    });

    return list;
  }

  // ---- Helper: Checklist Progress Calculator ----
  function getChecklistStats(contentHtml) {
    if (!contentHtml || !contentHtml.includes('notes-task-checkbox')) return null;
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = contentHtml;
      const checkboxes = tempDiv.querySelectorAll('.notes-task-checkbox');
      if (checkboxes.length === 0) return null;
      let checked = 0;
      checkboxes.forEach((cb) => {
        if (cb.hasAttribute('checked') || cb.checked) checked++;
      });
      return { total: checkboxes.length, checked, pct: Math.round((checked / checkboxes.length) * 100) };
    } catch (_) {
      return null;
    }
  }

  // ---- Helper: Switch to 3-Pane Workspace Tab ----
  function switchToWorkspaceTab() {
    state.activeTab = 'workspace';
    const mainTabs = App.utils.qs('#notesMainTabs');
    if (mainTabs) {
      mainTabs.querySelectorAll('.tab-btn').forEach((b) => {
        const isWorkspace = b.dataset.notesTab === 'workspace';
        b.classList.toggle('active', isWorkspace);
        b.setAttribute('aria-selected', isWorkspace ? 'true' : 'false');
      });
    }
    const tabAllNotes = App.utils.qs('#notesTabAllNotes');
    const tabWorkspace = App.utils.qs('#notesTabWorkspace');
    if (tabAllNotes) tabAllNotes.style.display = 'none';
    if (tabWorkspace) tabWorkspace.style.display = 'block';

    drawNavPane();
    drawListPane();
    drawEditorPane();
  }

  // ---- Main View Render ----
  async function renderNotesView() {
    const pane = App.utils.qs('#pane-notes');
    if (!pane) return;

    bindNotesGlobals();

    // Loading state is tied to the real request: it is replaced as soon as the data arrives.
    pane.innerHTML = `
      <div class="notes-hub-container" aria-busy="true">
        <div class="n-skel" role="status" aria-label="Loading notes"><i></i><i></i><i></i><i></i></div>
      </div>
    `;

    await loadNotesData();

    const activeCount = state.notes.filter((n) => !n.in_trash).length;

    pane.innerHTML = `
      <div class="notes-hub-container">
        <header class="notes-hub-header">
          <div class="notes-hub-title">
            <h1>Notes</h1>
            <p class="notes-hub-sub">Capture ideas, meeting minutes and research, and link them to your deals, SIPs and goals.</p>
          </div>
          <div class="notes-hub-actions">
            <button type="button" class="n-btn" id="notesTemplatesBtn" title="New note from a template" aria-label="Templates">${ic('layout')}<span class="n-btn-label">Templates</span></button>
            <button type="button" class="n-btn" id="notesExportAllBtn" title="Export notes (JSON, Markdown, spreadsheet)" aria-label="Export notes">${ic('download')}<span class="n-btn-label">Export</span></button>
            <button type="button" class="n-btn n-btn--primary" id="notesNewNoteTopBtn" title="Quick capture a new note (Ctrl+Shift+N)">${ic('plus')}<span>New note</span></button>
          </div>
        </header>

        <div class="tabbar notes-main-tabs" id="notesMainTabs" role="tablist" aria-label="Notes views">
          <button type="button" role="tab" aria-selected="${state.activeTab === 'all_notes'}" class="tab-btn ${state.activeTab === 'all_notes' ? 'active' : ''}" data-notes-tab="all_notes">
            ${ic('file')}<span>All notes</span><span class="n-tab-count" id="allNotesTabCount">${activeCount}</span>
          </button>
          <button type="button" role="tab" aria-selected="${state.activeTab === 'workspace'}" class="tab-btn ${state.activeTab === 'workspace' ? 'active' : ''}" data-notes-tab="workspace">
            ${ic('panel')}<span>Workspace</span>
          </button>
        </div>

        <div id="notesTabAllNotes" class="notes-tab-content notes-cq" role="tabpanel" style="${state.activeTab === 'all_notes' ? '' : 'display:none'}"></div>

        <div id="notesTabWorkspace" class="notes-tab-content notes-cq" role="tabpanel" style="${state.activeTab === 'workspace' ? '' : 'display:none'}">
          <div class="notes-workspace-3pane" id="notesWorkspace" data-mobile-view="${state.mobileView}">
            <aside class="notes-nav-pane" id="notesNavPane" aria-label="Folders, tags and views"></aside>
            <div class="notes-nav-scrim" id="notesNavScrim" aria-hidden="true"></div>
            <section class="notes-list-pane" id="notesListPane" aria-label="Notes list"></section>
            <section class="notes-editor-pane" id="notesEditorPane" aria-label="Note editor"></section>
          </div>
        </div>
      </div>
    `;

    if (loadNavCollapsedPref()) {
      App.utils.qs('#notesWorkspace', pane)?.classList.add('nav-collapsed');
    }
    App.utils.qs('#notesNavScrim', pane)?.addEventListener('click', closeNavDrawer);

    bindWorkspaceHeader(pane);
    drawAllNotesTab();
    drawNavPane();
    drawListPane();
    drawEditorPane();
  }

  // ---- Bind Header & Tab Actions ----
  function bindWorkspaceHeader(pane) {
    App.utils.qs('#notesNewNoteTopBtn', pane)?.addEventListener('click', () => {
      createNewNoteModal();
    });

    App.utils.qs('#notesTemplatesBtn', pane)?.addEventListener('click', () => {
      openTemplatesModal();
    });

    App.utils.qs('#notesExportAllBtn', pane)?.addEventListener('click', () => {
      openExportModal();
    });

    // Main Tab Switching
    App.utils.qsa('[data-notes-tab]', pane).forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.dataset.notesTab;
        state.activeTab = tab;

        App.utils.qsa('[data-notes-tab]', pane).forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        tabBtn.classList.add('active');
        tabBtn.setAttribute('aria-selected', 'true');

        const tabAllNotes = App.utils.qs('#notesTabAllNotes', pane);
        const tabWorkspace = App.utils.qs('#notesTabWorkspace', pane);

        if (tab === 'all_notes') {
          if (tabAllNotes) tabAllNotes.style.display = 'block';
          if (tabWorkspace) tabWorkspace.style.display = 'none';
          drawAllNotesTab();
        } else {
          if (tabAllNotes) tabAllNotes.style.display = 'none';
          if (tabWorkspace) tabWorkspace.style.display = 'block';
          if (!state.activeNoteId && state.notes.length > 0) {
            state.activeNoteId = state.notes[0].id;
          }
          drawNavPane();
          drawListPane();
          drawEditorPane();
        }
      });
    });
  }
  // ==========================================================================
  // TAB 1: ALL NOTES DIRECTORY (Simple, Executive-Grade User Interface)
  // ==========================================================================
  function drawAllNotesTab() {
    const container = App.utils.qs('#notesTabAllNotes');
    if (!container) return;

    const allActive = state.notes.filter((n) => !n.in_trash && !n.is_archived);
    const pinnedCount = state.notes.filter((n) => !n.in_trash && !n.is_archived && n.is_pinned).length;
    const favCount = state.notes.filter((n) => !n.in_trash && !n.is_archived && n.is_favorite).length;
    const reminderCount = state.notes.filter((n) => !n.in_trash && !n.is_archived && n.reminder_at).length;
    const trashCount = state.notes.filter((n) => n.in_trash).length;

    // Filter computation
    let filtered = state.notes.slice();

    // 1. Status Filter
    if (state.allNotesFilter === 'trash') {
      filtered = filtered.filter((n) => n.in_trash);
    } else {
      filtered = filtered.filter((n) => !n.in_trash);
      if (state.allNotesFilter === 'pinned') filtered = filtered.filter((n) => n.is_pinned);
      else if (state.allNotesFilter === 'favorites') filtered = filtered.filter((n) => n.is_favorite);
      else if (state.allNotesFilter === 'reminders') filtered = filtered.filter((n) => n.reminder_at);
      else if (state.allNotesFilter === 'archived') filtered = filtered.filter((n) => n.is_archived);
    }

    // 2. Folder Filter
    if (state.allNotesFolder !== 'all') {
      if (state.allNotesFolder === 'unorganized') {
        filtered = filtered.filter((n) => !n.folder_id);
      } else {
        const normFId = String(state.allNotesFolder);
        filtered = filtered.filter((n) => String(n.folder_id) === normFId);
      }
    }

    // 3. Search Query
    if (state.allNotesSearch.trim()) {
      const q = state.allNotesSearch.toLowerCase().trim();
      filtered = filtered.filter((n) => {
        const t = (n.title || '').toLowerCase();
        const c = (n.content || '').toLowerCase();
        const tags = Array.isArray(n.tags) ? n.tags.join(' ').toLowerCase() : '';
        return t.includes(q) || c.includes(q) || tags.includes(q);
      });
    }

    // 4. Sort
    filtered.sort((a, b) => {
      if (state.allNotesFilter !== 'trash') {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
      }
      switch (state.allNotesSort) {
        case 'updated_asc':
          return new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at);
        case 'created_desc':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'title_asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'priority_desc': {
          const pOrder = { high: 3, medium: 2, low: 1 };
          return (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0);
        }
        case 'updated_desc':
        default:
          return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
      }
    });

    const savedFocus = captureFocus(container);

    const scopeTotal = state.allNotesFilter === 'trash' ? trashCount : state.notes.filter((n) => !n.in_trash).length;
    const hasActiveFilters = !!state.allNotesSearch.trim() || state.allNotesFilter !== 'all' || state.allNotesFolder !== 'all';
    const filterLabels = { pinned: 'Pinned', favorites: 'Starred', reminders: 'Due', trash: 'Trash', archived: 'Archived' };
    const sortLabels = { updated_desc: 'recently updated', created_desc: 'date created', title_asc: 'title (A-Z)', priority_desc: 'priority' };
    const folderChipName = state.allNotesFolder === 'unorganized'
      ? 'Unorganized'
      : (state.folders.find((f) => String(f.id) === String(state.allNotesFolder))?.name || 'Folder');

    // Build Folder Select Options
    const folderOptionsHtml = `
      <option value="all" ${state.allNotesFolder === 'all' ? 'selected' : ''}>All folders (${allActive.length})</option>
      <option value="unorganized" ${state.allNotesFolder === 'unorganized' ? 'selected' : ''}>Unorganized (${allActive.filter((n) => !n.folder_id).length})</option>
      ${state.folders.map((f) => {
        const count = allActive.filter((n) => String(n.folder_id) === String(f.id)).length;
        return `<option value="${f.id}" ${String(state.allNotesFolder) === String(f.id) ? 'selected' : ''}>${App.utils.escapeHtml(f.name)} (${count})</option>`;
      }).join('')}
    `;

    const pills = [
      ['all', 'All', allActive.length],
      ['pinned', 'Pinned', pinnedCount],
      ['favorites', 'Starred', favCount],
      ['reminders', 'Due', reminderCount],
      ['trash', 'Trash', trashCount],
    ];

    const removableChip = (text, key, label) => `
      <span class="n-chip n-chip--accent"><span>${text}</span><button type="button" class="n-chip-x" data-clear-filter="${key}" aria-label="Remove ${label} filter">${ic('x')}</button></span>
    `;

    // Render Table vs Cards
    let contentHtml = '';
    if (filtered.length === 0) {
      const inTrash = state.allNotesFilter === 'trash' && !state.allNotesSearch.trim() && state.allNotesFolder === 'all';
      contentHtml = `
        <div class="n-empty">
          <div class="n-empty-ic">${ic(hasActiveFilters ? 'search' : 'file')}</div>
          <h3>${inTrash ? 'Trash is empty' : hasActiveFilters ? 'No matching notes' : 'No notes yet'}</h3>
          <p>${state.allNotesSearch ? `Nothing matched "${App.utils.escapeHtml(state.allNotesSearch)}". Try a different search or reset the filters.` : inTrash ? 'Notes you move to the trash will wait here until you restore or delete them.' : hasActiveFilters ? 'No notes fit the current filters.' : 'Capture your first thought, or start from a ready-made template.'}</p>
          <div class="n-empty-actions">
            <button type="button" class="n-btn n-btn--primary" id="simpleEmptyNewBtn">${ic('plus')}<span>New note</span></button>
            ${hasActiveFilters
              ? `<button type="button" class="n-btn" id="simpleResetFiltersBtn">Reset filters</button>`
              : `<button type="button" class="n-btn" id="simpleEmptyTemplatesBtn">${ic('layout')}<span>Browse templates</span></button>`}
          </div>
        </div>
      `;
    } else if (state.allNotesView === 'grid') {
      contentHtml = `
        <div class="nl-grid">
          ${filtered.map((n) => renderSimpleNoteCard(n)).join('')}
        </div>
      `;
    } else {
      contentHtml = `
        <div class="nl-table-card">
          <div class="nl-table-scroll">
            <table class="nl-table">
              <thead>
                <tr>
                  <th scope="col">Note</th>
                  <th scope="col">Folder</th>
                  <th scope="col">Links &amp; tags</th>
                  <th scope="col">Due</th>
                  <th scope="col">Updated</th>
                  <th scope="col"><span class="n-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map((n) => renderAlvTableRow(n)).join('')}
              </tbody>
            </table>
          </div>
          <div class="nl-footer">
            <span>Showing <strong>${filtered.length}</strong> of <strong>${scopeTotal}</strong> notes</span>
            <span>Sorted by ${sortLabels[state.allNotesSort] || 'recently updated'}</span>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="nl-wrap">
        <div class="nl-toolbar">
          <div class="n-search">
            ${ic('search')}
            <input type="text" id="simpleSearchInput" class="n-field" placeholder="Search notes, text or #tag" aria-label="Search notes" autocomplete="off" value="${App.utils.escapeHtml(state.allNotesSearch)}">
          </div>
          <div class="n-select-wrap">
            <select id="simpleFolderSelect" class="n-field" aria-label="Filter by folder">${folderOptionsHtml}</select>
          </div>
          <div class="n-select-wrap">
            <select id="simpleSortSelect" class="n-field" aria-label="Sort notes">
              <option value="updated_desc" ${state.allNotesSort === 'updated_desc' ? 'selected' : ''}>Recently updated</option>
              <option value="created_desc" ${state.allNotesSort === 'created_desc' ? 'selected' : ''}>Date created</option>
              <option value="title_asc" ${state.allNotesSort === 'title_asc' ? 'selected' : ''}>Title (A-Z)</option>
              <option value="priority_desc" ${state.allNotesSort === 'priority_desc' ? 'selected' : ''}>Priority (high-low)</option>
            </select>
          </div>
          <div class="n-seg" role="group" aria-label="Layout">
            <button type="button" class="n-seg-btn ${state.allNotesView === 'table' ? 'active' : ''}" id="switchViewTableBtn" aria-pressed="${state.allNotesView === 'table'}" title="Table view">${ic('rows')}<span>Table</span></button>
            <button type="button" class="n-seg-btn ${state.allNotesView === 'grid' ? 'active' : ''}" id="switchViewGridBtn" aria-pressed="${state.allNotesView === 'grid'}" title="Card view">${ic('grid')}<span>Cards</span></button>
          </div>
        </div>

        <div class="nl-filterbar">
          <div class="n-seg" role="group" aria-label="Filter notes">
            ${pills.map(([key, label, count]) => `
              <button type="button" class="n-seg-btn ${state.allNotesFilter === key ? 'active' : ''}" data-pill-filter="${key}" aria-pressed="${state.allNotesFilter === key}">${label} <span class="n-count">${count}</span></button>
            `).join('')}
          </div>
          <button type="button" class="n-btn n-btn--sm" id="kpiManageFoldersBtn" title="Create a folder">${ic('folder')}<span>New folder</span></button>
        </div>

        ${hasActiveFilters ? `
          <div class="nl-active" role="group" aria-label="Active filters">
            <span class="nl-active-label">Filtered by</span>
            ${state.allNotesSearch.trim() ? removableChip(`&ldquo;${App.utils.escapeHtml(state.allNotesSearch.trim())}&rdquo;`, 'search', 'search') : ''}
            ${state.allNotesFilter !== 'all' ? removableChip(App.utils.escapeHtml(filterLabels[state.allNotesFilter] || state.allNotesFilter), 'filter', 'status') : ''}
            ${state.allNotesFolder !== 'all' ? removableChip(App.utils.escapeHtml(folderChipName), 'folder', 'folder') : ''}
            <button type="button" class="nl-reset" id="simpleChipsResetBtn">Reset all</button>
          </div>
        ` : ''}

        ${contentHtml}
      </div>
    `;

    bindAllNotesEvents(container);
    restoreFocus(savedFocus, container);

    // Update count in tab header
    const tabCountEl = App.utils.qs('#allNotesTabCount');
    if (tabCountEl) tabCountEl.textContent = allActive.length;
  }

  // ---- Render Library Note Card ----
  function renderSimpleNoteCard(n) {
    const folder = findFolder(n);
    const folderColor = folder?.color || 'var(--text3)';
    const folderName = folder?.name || 'Unorganized';
    const snippet = getSnippetText(n.content_html || n.content || '', 180);
    const stats = getNoteStats(n.content_html || n.content || '');
    const isOverdue = n.reminder_at && new Date(n.reminder_at) < new Date();
    const taskStats = getChecklistStats(n.content_html || '');
    const chips = entityChips(n, 3) + tagChips(n, 4);

    return `
      <article class="notes-simple-card ${n.is_pinned ? 'pinned' : ''}" data-note-id="${n.id}">
        <div class="nl-card-head">
          <div class="nl-card-meta">
            <span class="n-chip"><span class="notes-folder-dot" style="background:${folderColor}"></span><span>${App.utils.escapeHtml(folderName)}</span></span>
            ${priorityBadge(n)}
          </div>
          <div class="nl-note-toggles">${noteToggleButtons(n)}</div>
        </div>

        <div>
          <h3 class="nl-card-title"><button type="button" class="nl-title" data-simple-view="${n.id}" title="Open note">${App.utils.escapeHtml(n.title || 'Untitled Note')}</button></h3>
          <div class="nl-card-snippet ${snippet ? '' : 'is-empty'}" data-simple-view="${n.id}">${App.utils.escapeHtml(snippet) || 'Empty note'}</div>
        </div>

        <div class="nl-card-foot">
          ${taskStats ? `<div>${checklistProgress(taskStats)}</div>` : ''}
          ${chips ? `<div class="nl-stack">${chips}</div>` : ''}
          <div class="nl-card-info">
            <span>${formatRelativeDate(n.updated_at || n.created_at)}</span>
            <span>${stats.words} words</span>
            ${n.reminder_at ? `<span class="nl-date ${isOverdue ? 'is-overdue' : 'is-due'}" title="Due ${new Date(n.reminder_at).toLocaleString()}">${ic('clock')} ${isOverdue ? 'Overdue' : 'Due ' + new Date(n.reminder_at).toLocaleDateString()}</span>` : ''}
          </div>
          <div class="nl-card-actions">
            <div class="nl-card-actions-l">
              <button type="button" class="n-btn n-btn--sm" data-simple-view="${n.id}" title="View note">${ic('eye')}<span>View</span></button>
              <button type="button" class="n-btn n-btn--sm" data-simple-edit="${n.id}" title="Edit note">${ic('edit')}<span>Edit</span></button>
              <button type="button" class="n-btn n-btn--sm" data-simple-studio="${n.id}" title="Open in workspace">${ic('panel')}<span>Workspace</span></button>
            </div>
            <button type="button" class="n-icon-btn n-icon-btn--danger" data-simple-del="${n.id}" title="${n.in_trash ? 'Delete permanently' : 'Move to trash'}" aria-label="${n.in_trash ? 'Delete permanently' : 'Move to trash'}">${ic('trash')}</button>
          </div>
        </div>
      </article>
    `;
  }

  // ---- Render Library Table Row ----
  function renderAlvTableRow(n) {
    const folder = findFolder(n);
    const folderColor = folder?.color || 'var(--text3)';
    const folderName = folder?.name || 'Unorganized';
    const snippet = getSnippetText(n.content_html || n.content || '', 120);
    const isOverdue = n.reminder_at && new Date(n.reminder_at) < new Date();
    const taskStats = getChecklistStats(n.content_html || '');
    const links = entityChips(n, 2) + tagChips(n, 3);
    const trashTitle = n.in_trash ? 'Delete permanently' : 'Move to trash';

    return `
      <tr data-note-id="${n.id}">
        <td class="nl-c-note">
          <div class="nl-note">
            <div class="nl-note-toggles">${noteToggleButtons(n)}</div>
            <div class="nl-note-body">
              <div class="nl-note-titleline">
                <button type="button" class="nl-title" data-simple-view="${n.id}">${App.utils.escapeHtml(n.title || 'Untitled Note')}</button>
                ${priorityBadge(n)}
              </div>
              <div class="nl-snippet ${snippet ? '' : 'is-empty'}">${App.utils.escapeHtml(snippet) || 'Empty note'}</div>
              ${taskStats ? `<div>${checklistProgress(taskStats)}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="nl-c-folder">
          <span class="n-chip"><span class="notes-folder-dot" style="background:${folderColor}"></span><span>${App.utils.escapeHtml(folderName)}</span></span>
        </td>
        <td class="nl-c-links ${links ? '' : 'is-blank'}">${links ? `<div class="nl-stack">${links}</div>` : '<span class="nl-empty-cell">&mdash;</span>'}</td>
        <td class="nl-c-due ${n.reminder_at ? '' : 'is-blank'}">
          ${n.reminder_at
            ? `<span class="nl-date ${isOverdue ? 'is-overdue' : 'is-due'}" title="${new Date(n.reminder_at).toLocaleString()}">${isOverdue ? 'Overdue' : new Date(n.reminder_at).toLocaleDateString()}</span>`
            : '<span class="nl-empty-cell">&mdash;</span>'}
        </td>
        <td class="nl-c-updated"><span class="nl-date">${formatRelativeDate(n.updated_at || n.created_at)}</span></td>
        <td class="nl-c-actions">
          <div class="nl-actions">
            <button type="button" class="n-icon-btn" data-simple-view="${n.id}" title="View" aria-label="View note">${ic('eye')}</button>
            <button type="button" class="n-icon-btn" data-simple-edit="${n.id}" title="Edit" aria-label="Edit note">${ic('edit')}</button>
            <button type="button" class="n-icon-btn" data-simple-studio="${n.id}" title="Open in workspace" aria-label="Open in workspace">${ic('panel')}</button>
            <button type="button" class="n-icon-btn n-icon-btn--danger" data-simple-del="${n.id}" title="${trashTitle}" aria-label="${trashTitle}">${ic('trash')}</button>
          </div>
        </td>
      </tr>
    `;
  }
  // ---- Bind All Notes Directory Events ----
  function bindAllNotesEvents(container) {
    // New folder button
    App.utils.qs('#kpiManageFoldersBtn', container)?.addEventListener('click', () => {
      openFolderModal();
    });

    // Search input
    const searchInput = App.utils.qs('#simpleSearchInput', container);
    let searchDebounce;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.allNotesSearch = e.target.value;
        drawAllNotesTab();
      }, 250);
    });

    // Folder select
    App.utils.qs('#simpleFolderSelect', container)?.addEventListener('change', (e) => {
      state.allNotesFolder = e.target.value;
      drawAllNotesTab();
    });

    // Status filter pills
    App.utils.qsa('[data-pill-filter]', container).forEach((pill) => {
      pill.addEventListener('click', () => {
        state.allNotesFilter = pill.dataset.pillFilter;
        drawAllNotesTab();
      });
    });

    // Sort select
    App.utils.qs('#simpleSortSelect', container)?.addEventListener('change', (e) => {
      state.allNotesSort = e.target.value;
      drawAllNotesTab();
    });

    // View switchers
    App.utils.qs('#switchViewGridBtn', container)?.addEventListener('click', () => {
      state.allNotesView = 'grid';
      drawAllNotesTab();
    });

    App.utils.qs('#switchViewTableBtn', container)?.addEventListener('click', () => {
      state.allNotesView = 'table';
      drawAllNotesTab();
    });

    // + New Note buttons
    App.utils.qs('#simpleEmptyNewBtn', container)?.addEventListener('click', () => createNewNoteModal());
    App.utils.qs('#simpleEmptyTemplatesBtn', container)?.addEventListener('click', () => openTemplatesModal());
    const resetLibraryFilters = () => {
      state.allNotesSearch = '';
      state.allNotesFilter = 'all';
      state.allNotesFolder = 'all';
      drawAllNotesTab();
    };
    App.utils.qs('#simpleResetFiltersBtn', container)?.addEventListener('click', resetLibraryFilters);
    App.utils.qs('#simpleChipsResetBtn', container)?.addEventListener('click', resetLibraryFilters);

    // Active-filter chips: remove one filter at a time
    App.utils.qsa('[data-clear-filter]', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.clearFilter;
        if (key === 'search') state.allNotesSearch = '';
        else if (key === 'filter') state.allNotesFilter = 'all';
        else if (key === 'folder') state.allNotesFolder = 'all';
        drawAllNotesTab();
      });
    });

    // Note actions: View
    App.utils.qsa('[data-simple-view]', container).forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.simpleView;
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) openSimpleViewModal(note);
      });
    });

    // Note actions: Edit
    App.utils.qsa('[data-simple-edit]', container).forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.simpleEdit;
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) openSimpleEditModal(note);
      });
    });

    // Note actions: Studio (3-Pane Workspace)
    App.utils.qsa('[data-simple-studio]', container).forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.simpleStudio;
        state.activeNoteId = id;
        switchToWorkspaceTab();
      });
    });

    // Note actions: Pin Toggle
    App.utils.qsa('[data-simple-pin]', container).forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.simplePin;
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) {
          note.is_pinned = !note.is_pinned;
          await App.api.updateNote(note.id, { is_pinned: note.is_pinned });
          App.utils.toast(note.is_pinned ? 'Note pinned to top' : 'Note unpinned');
          drawAllNotesTab();
          if (state.activeNoteId === note.id) drawEditorPane();
        }
      });
    });

    // Note actions: Favorite Toggle
    App.utils.qsa('[data-simple-fav]', container).forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.simpleFav;
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) {
          note.is_favorite = !note.is_favorite;
          await App.api.updateNote(note.id, { is_favorite: note.is_favorite });
          App.utils.toast(note.is_favorite ? 'Added to favorites' : 'Removed from favorites');
          drawAllNotesTab();
          if (state.activeNoteId === note.id) drawEditorPane();
        }
      });
    });

    // Note actions: Delete / Trash
    App.utils.qsa('[data-simple-del]', container).forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.simpleDel;
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (!note) return;

        if (note.in_trash) {
          if (!confirm(`Permanently delete "${note.title || 'this note'}"? This cannot be undone.`)) return;
          await App.api.deleteNote(note.id);
          state.notes = state.notes.filter((n) => String(n.id) !== String(note.id));
          App.utils.toast('Note permanently deleted');
        } else {
          note.in_trash = true;
          note.trashed_at = new Date().toISOString();
          await App.api.updateNote(note.id, { in_trash: true, trashed_at: note.trashed_at });
          App.utils.toast('Note moved to Trash');
        }
        drawAllNotesTab();
        drawNavPane();
        drawListPane();
        if (state.activeNoteId === note.id) drawEditorPane();
      });
    });

    // Card click (whole card opens View modal unless clicked on action button)
    App.utils.qsa('.notes-simple-card', container).forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('[data-entity-type]')) return;
        const id = card.dataset.noteId;
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) openSimpleViewModal(note);
      });
    });

    // Entity links on cards
    App.utils.qsa('.notes-simple-entity-chip', container).forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToEntity(chip.dataset.entityType, chip.dataset.entityId);
      });
    });
  }

  // ---- Modal: Simple Direct Note Viewer ----
  function openSimpleViewModal(note) {
    const folder = findFolder(note);
    const folderColor = folder?.color || 'var(--text3)';
    const folderName = folder?.name || 'Unorganized';
    const initialHtml = note.content_html || (note.content ? App.utils.escapeHtml(note.content).replace(/\n/g, '<br>') : '<p style="color:var(--text3);font-style:italic">Empty note</p>');
    const stats = getNoteStats(initialHtml);
    const entities = entityChips(note, 99);

    App.ui.open({
      title: note.title || 'Untitled Note',
      bodyHtml: `
        <div class="notes-dlg">
          <div class="nd-view">
            <div class="nd-view-meta">
              <div>
                <span class="n-chip"><span class="notes-folder-dot" style="background:${folderColor}"></span><span>${App.utils.escapeHtml(folderName)}</span></span>
                ${priorityBadgeDialog(note)}
                ${note.is_pinned ? `<span class="nd-pill" title="Pinned">${ic('pin', 'is-filled')} Pinned</span>` : ''}
                ${note.is_favorite ? `<span class="nd-pill" title="Favorite">${ic('star', 'is-filled')} Starred</span>` : ''}
              </div>
              <div>
                <span>${stats.words} words</span><span>&middot;</span><span>${stats.readingTimeMinutes} min read</span><span>&middot;</span><span>Updated ${formatRelativeDate(note.updated_at || note.created_at)}</span>
              </div>
            </div>

            <div id="simpleViewBody" class="notes-content-editable">${initialHtml}</div>

            ${Array.isArray(note.linked_entities) && note.linked_entities.length > 0 ? `
              <div>
                <div class="nd-section-label">Linked portfolio records</div>
                <div class="nd-inline">${entities}</div>
              </div>
            ` : ''}

            ${Array.isArray(note.tags) && note.tags.length > 0 ? `
              <div>
                <div class="nd-section-label">Tags</div>
                <div class="nd-inline">${note.tags.map((t) => `<span class="n-chip">#${App.utils.escapeHtml(t)}</span>`).join('')}</div>
              </div>
            ` : ''}

            ${note.reminder_at ? `
              <div class="nd-reminder">${ic('clock')} Reminder due ${new Date(note.reminder_at).toLocaleString()}</div>
            ` : ''}
          </div>
        </div>
      `,
      actions: [
        {
          label: 'Copy text',
          className: 'btn-outline',
          onClick: () => {
            const plain = getNotePlainText(note.content_html || note.content || '');
            navigator.clipboard.writeText(plain).then(() => App.utils.toast('Note copied to clipboard'));
          },
        },
        {
          label: 'Open in workspace',
          className: 'btn-outline',
          onClick: () => {
            App.ui.close();
            state.activeNoteId = note.id;
            switchToWorkspaceTab();
          },
        },
        {
          label: 'Edit note',
          className: 'btn-gold',
          onClick: () => {
            App.ui.close();
            openSimpleEditModal(note);
          },
        },
      ],
    });

    // Checkbox toggles inside view modal: persist checked state on click
    const body = App.utils.qs('#simpleViewBody');
    if (body) {
      body.querySelectorAll('.notes-task-checkbox').forEach((cb) => {
        cb.addEventListener('change', async () => {
          const item = cb.closest('.notes-task-item');
          if (cb.checked) {
            item?.classList.add('checked');
            cb.setAttribute('checked', 'checked');
          } else {
            item?.classList.remove('checked');
            cb.removeAttribute('checked');
          }
          note.content_html = body.innerHTML;
          note.content = getNotePlainText(note.content_html);
          await App.api.updateNote(note.id, { content_html: note.content_html, content: note.content });
          drawAllNotesTab();
        });
      });
    }

    // Linked entity click in view modal
    App.utils.qsa('.nd-view [data-entity-type]').forEach((chip) => {
      chip.addEventListener('click', () => {
        App.ui.close();
        navigateToEntity(chip.dataset.entityType, chip.dataset.entityId);
      });
    });
  }

  // Priority badge for dialog content (scoped to .notes-dlg, which has its own chip styles).
  function priorityBadgeDialog(note) {
    const p = String(note.priority || '').toLowerCase();
    if (p === 'high') return '<span class="n-chip" style="color:var(--red);border-color:color-mix(in srgb,var(--red) 35%,transparent)">High priority</span>';
    if (p === 'low') return '<span class="n-chip">Low priority</span>';
    return '';
  }

  // ---- Modal: Simple Direct Note Editor ----
  function openSimpleEditModal(note) {
    const plain = getNotePlainText(note.content_html || note.content || '');
    const folderOptions = [
      { value: '', label: 'None (Unorganized)' },
      ...state.folders.map((f) => ({ value: f.id, label: f.name })),
    ];
    const tagsStr = Array.isArray(note.tags) ? note.tags.join(', ') : '';
    const currentPriority = String(note.priority || 'medium').toLowerCase();

    App.ui.open({
      title: `Edit note`,
      bodyHtml: `
        <div class="notes-dlg">
          <div class="nd-stack">
            <div class="field">
              <label for="simpleEditTitle">Title <span class="req">*</span></label>
              <input type="text" id="simpleEditTitle" value="${App.utils.escapeHtml(note.title || '')}" placeholder="Note title">
            </div>
            <div class="nd-grid2">
              <div class="field">
                <label for="simpleEditFolder">Folder</label>
                <select id="simpleEditFolder">
                  ${folderOptions.map((opt) => `<option value="${opt.value}" ${String(note.folder_id || '') === String(opt.value) ? 'selected' : ''}>${App.utils.escapeHtml(opt.label)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="simpleEditPriority">Priority</label>
                <select id="simpleEditPriority">
                  <option value="low" ${currentPriority === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${currentPriority !== 'low' && currentPriority !== 'high' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${currentPriority === 'high' ? 'selected' : ''}>High</option>
                </select>
              </div>
            </div>
            <div class="nd-grid2">
              <div class="field">
                <label for="simpleEditTags">Tags (comma-separated)</label>
                <input type="text" id="simpleEditTags" value="${App.utils.escapeHtml(tagsStr)}" placeholder="e.g. deals, thesis, Q4">
              </div>
              <div class="field">
                <label for="simpleEditReminder">Reminder / due date</label>
                <input type="datetime-local" id="simpleEditReminder" value="${note.reminder_at ? new Date(note.reminder_at).toISOString().slice(0, 16) : ''}">
              </div>
            </div>
            <div class="field">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                <label id="simpleEditContentLabel">Content</label>
                <div class="nd-minibar" role="toolbar" aria-label="Formatting">
                  <button type="button" class="nd-minibtn" id="simpleEditH2Btn" title="Heading 2" aria-label="Heading 2">H2</button>
                  <button type="button" class="nd-minibtn" id="simpleEditH3Btn" title="Heading 3" aria-label="Heading 3">H3</button>
                  <button type="button" class="nd-minibtn" id="simpleEditBoldBtn" title="Bold" aria-label="Bold"><b>B</b></button>
                  <button type="button" class="nd-minibtn" id="simpleEditChecklistBtn" title="Insert checklist item" aria-label="Insert checklist item">${ic('checksq')}</button>
                </div>
              </div>
              <div id="simpleEditContent" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="simpleEditContentLabel" class="notes-content-editable nd-editarea">${note.content_html || (plain ? `<p>${App.utils.escapeHtml(plain).replace(/\n/g, '<br>')}</p>` : '')}</div>
            </div>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Save changes',
          className: 'btn-gold',
          onClick: async () => {
            const titleInput = App.utils.qs('#simpleEditTitle');
            const folderSelect = App.utils.qs('#simpleEditFolder');
            const prioritySelect = App.utils.qs('#simpleEditPriority');
            const tagsInput = App.utils.qs('#simpleEditTags');
            const reminderInput = App.utils.qs('#simpleEditReminder');
            const contentDiv = App.utils.qs('#simpleEditContent');

            const title = titleInput?.value.trim() || 'Untitled Note';
            const folder_id = folderSelect?.value || null;
            const priority = prioritySelect?.value || 'medium';
            const tags = (tagsInput?.value || '').split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
            const reminder_at = reminderInput?.value ? new Date(reminderInput.value).toISOString() : null;
            const content_html = contentDiv?.innerHTML || '';
            const content = getNotePlainText(content_html);

            try {
              const updated = await App.api.updateNote(note.id, {
                title,
                folder_id,
                priority,
                tags,
                reminder_at,
                content_html,
                content,
                updated_at: new Date().toISOString(),
              });

              Object.assign(note, updated, {
                title,
                folder_id,
                priority,
                tags,
                reminder_at,
                content_html,
                content,
                updated_at: new Date().toISOString(),
              });

              App.ui.close();
              App.utils.toast('Note updated successfully');
              drawAllNotesTab();
              if (state.activeNoteId === note.id) {
                drawEditorPane();
              }
            } catch (err) {
              App.utils.toast('Could not save note: ' + (err.message || err), 'err');
            }
          },
        },
      ],
    });

    // Bind mini formatting buttons (mousedown is held back so the text selection survives the click)
    App.utils.qs('.nd-minibar')?.addEventListener('mousedown', (e) => e.preventDefault());
    App.utils.qs('#simpleEditBoldBtn')?.addEventListener('click', () => document.execCommand('bold'));
    App.utils.qs('#simpleEditH2Btn')?.addEventListener('click', () => document.execCommand('formatBlock', false, 'h2'));
    App.utils.qs('#simpleEditH3Btn')?.addEventListener('click', () => document.execCommand('formatBlock', false, 'h3'));
    App.utils.qs('#simpleEditChecklistBtn')?.addEventListener('click', () => {
      if (App.notesEditor) App.notesEditor.insertChecklist();
      else document.execCommand('insertHTML', false, '<div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">New task</div></div>');
    });
  }
  // ---- Update Mobile View State ----
  function updateMobileViewState() {
    const ws = App.utils.qs('#notesWorkspace');
    if (ws) {
      ws.dataset.mobileView = state.mobileView;
    }
  }

  // ==========================================================================
  // PANE 1: NAVIGATION SIDEBAR (Folders, Tags, Smart Views, Storage Metrics)
  // ==========================================================================
  function drawNavPane() {
    const nav = App.utils.qs('#notesNavPane');
    if (!nav) return;
    const savedFocus = captureFocus(nav);

    const allNotes = state.notes.filter((n) => !n.in_trash && !n.is_archived);
    const pinnedCount = state.notes.filter((n) => !n.in_trash && !n.is_archived && n.is_pinned).length;
    const favCount = state.notes.filter((n) => !n.in_trash && !n.is_archived && n.is_favorite).length;
    const reminderCount = state.notes.filter((n) => !n.in_trash && !n.is_archived && n.reminder_at).length;
    const archiveCount = state.notes.filter((n) => !n.in_trash && n.is_archived).length;
    const trashCount = state.notes.filter((n) => n.in_trash).length;

    // Collect tags with frequencies
    const tagMap = new Map();
    allNotes.forEach((n) => {
      if (Array.isArray(n.tags)) {
        n.tags.forEach((t) => {
          if (t && t.trim()) {
            const clean = t.trim().toLowerCase();
            tagMap.set(clean, (tagMap.get(clean) || 0) + 1);
          }
        });
      }
    });

    // Calculate total word count
    let totalWords = 0;
    allNotes.forEach((n) => {
      const stats = getNoteStats(n.content || n.content_html || '');
      totalWords += stats.words;
    });

    const views = [
      ['all', 'file', 'All notes', allNotes.length],
      ['pinned', 'pin', 'Pinned', pinnedCount],
      ['favorites', 'star', 'Favorites', favCount],
      ['reminders', 'clock', 'Reminders & due', reminderCount],
      ['archive', 'archive', 'Archive', archiveCount],
      ['trash', 'trash', 'Trash', trashCount],
    ];

    nav.innerHTML = `
      <div class="nn-drawer-head">
        <span>Folders &amp; views</span>
        <button type="button" class="n-icon-btn" id="notesNavCloseBtn" title="Close" aria-label="Close navigation">${ic('x')}</button>
      </div>
      <div class="nn-scroll">
        <div>
          <div class="nn-title"><span>Views</span></div>
          ${views.map(([key, icon, label, count]) => `
            <button type="button" class="notes-nav-btn ${state.activeFilter === key ? 'active' : ''}" data-filter="${key}" ${state.activeFilter === key ? 'aria-current="true"' : ''}>
              <span class="icon-label">${ic(icon)} ${label}</span>
              <span class="count-pill">${count}</span>
            </button>
          `).join('')}
        </div>

        <div>
          <div class="nn-title">
            <span>Folders</span>
            <button type="button" class="n-icon-btn n-icon-btn--xs" id="newFolderBtn" title="New folder" aria-label="New folder">${ic('plus')}</button>
          </div>
          <div id="notesFolderList">
            ${state.folders.map((f) => {
              const count = allNotes.filter((n) => String(n.folder_id || '') === String(f.id)).length;
              const isActive = state.activeFilter === `folder:${f.id}`;
              const safeName = App.utils.escapeHtml(f.name);
              return `
                <div class="nn-folder-row">
                  <button type="button" class="notes-nav-btn ${isActive ? 'active' : ''}" data-filter="folder:${f.id}" ${isActive ? 'aria-current="true"' : ''}>
                    <span class="icon-label">
                      <span class="notes-folder-dot" style="background:${f.color || '#c9a84c'}"></span>
                      ${safeName}
                    </span>
                    <span class="count-pill">${count}</span>
                  </button>
                  <button type="button" class="n-icon-btn n-icon-btn--xs n-icon-btn--danger nn-del" data-delete-folder="${f.id}" title="Delete folder (notes are kept)" aria-label="Delete folder ${safeName}">${ic('trash')}</button>
                </div>
              `;
            }).join('') || '<div class="nn-muted">No folders yet</div>'}
          </div>
        </div>

        ${tagMap.size > 0 ? `
          <div>
            <div class="nn-title"><span>Tags</span></div>
            <div class="nn-tags">
              ${Array.from(tagMap.entries()).map(([tag, count]) => {
                const isActive = state.activeFilter === `tag:${tag}`;
                return `
                  <button type="button" class="notes-tag-chip ${isActive ? 'active' : ''}" data-filter="tag:${App.utils.escapeHtml(tag)}" ${isActive ? 'aria-current="true"' : ''}>
                    #${App.utils.escapeHtml(tag)} <span class="n-count">${count}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="notes-nav-footer">
        <span>${totalWords.toLocaleString()} words</span>
        <span>${allNotes.length} notes</span>
      </div>
    `;

    // Bind Filter clicks
    App.utils.qsa('[data-filter]', nav).forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeFilter = btn.dataset.filter;
        drawNavPane();
        drawListPane();
        closeNavDrawer();
      });
    });

    App.utils.qs('#notesNavCloseBtn', nav)?.addEventListener('click', () => {
      setNavDrawerOpen(false);
      App.utils.qs('#notesNavToggleBtn')?.focus();
    });

    // Bind New Folder
    App.utils.qs('#newFolderBtn', nav)?.addEventListener('click', () => {
      openFolderModal();
    });

    // Bind Delete Folder in Navigation Sidebar
    App.utils.qsa('[data-delete-folder]', nav).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fId = String(btn.dataset.deleteFolder);
        const targetFolder = state.folders.find((f) => String(f.id) === fId);
        const fName = targetFolder ? targetFolder.name : 'this folder';

        if (!confirm(`Delete folder "${fName}"? Any notes inside will be preserved and moved to "Unorganized".`)) return;

        try {
          await App.api.deleteNoteFolder(fId);
          state.folders = state.folders.filter((f) => String(f.id) !== fId);
          state.notes.forEach((n) => {
            if (String(n.folder_id || '') === fId) n.folder_id = null;
          });
          if (state.activeFilter === `folder:${fId}`) state.activeFilter = 'all';

          App.utils.toast('Folder deleted. Notes preserved.');
          drawNavPane();
          drawListPane();
          drawEditorPane();
        } catch (err) {
          App.utils.toast('Could not delete folder: ' + (err.message || err), 'err');
        }
      });
    });

    restoreFocus(savedFocus, nav);
  }
  // ==========================================================================
  // PANE 2: NOTES LIST & FOLDER VIEW (Search, Sort, Inline Edit & Bulk Actions)
  // ==========================================================================
  function renderNoteCard(n) {
    const isActive = String(n.id) === String(state.activeNoteId);
    const isChecked = state.selectedNoteIds.has(String(n.id));
    const isInlineEditing = String(n.id) === String(state.inlineEditingNoteId);
    const folder = findFolder(n);
    const snippet = getSnippetText(n.content_html || n.content || '', 140);
    const isOverdue = n.reminder_at && new Date(n.reminder_at) < new Date();
    const safeTitle = App.utils.escapeHtml(n.title || 'Untitled Note');
    const firstTag = Array.isArray(n.tags) && n.tags.length > 0 ? n.tags[0] : '';

    return `
      <div class="note-item-card ${isActive ? 'active' : ''}" data-note-id="${n.id}" tabindex="0" ${isActive ? 'aria-current="true"' : ''} style="${n.color ? `border-left: 3px solid ${n.color};` : ''}">
        <div class="note-item-top">
          <div class="note-item-lead">
            <input type="checkbox" class="note-select-chk" data-chk-id="${n.id}" ${isChecked ? 'checked' : ''} aria-label="Select ${safeTitle}" onclick="event.stopPropagation()">
            <span class="note-item-title">${safeTitle}</span>
          </div>
          <div class="note-item-tools">
            <div class="note-card-quick-actions">
              <button type="button" class="n-icon-btn n-icon-btn--xs inline-edit-toggle-btn" data-edit-inline="${n.id}" title="${isInlineEditing ? 'Close quick edit' : 'Quick edit'}" aria-label="${isInlineEditing ? 'Close quick edit' : 'Quick edit'}" onclick="event.stopPropagation()">${ic(isInlineEditing ? 'x' : 'edit')}</button>
              <button type="button" class="n-icon-btn n-icon-btn--xs full-editor-btn" data-open-editor="${n.id}" title="Open in full editor" aria-label="Open in full editor" onclick="event.stopPropagation()">${ic('expand')}</button>
            </div>
            <div class="note-item-indicators">
              ${n.is_pinned ? `<span title="Pinned">${ic('pin', 'is-filled')}<span class="n-sr-only">Pinned</span></span>` : ''}
              ${n.is_favorite ? `<span class="is-fav" title="Favorite">${ic('star', 'is-filled')}<span class="n-sr-only">Favorite</span></span>` : ''}
            </div>
          </div>
        </div>

        ${isInlineEditing ? `
          <!-- Direct Inline Quick Editor -->
          <div class="note-inline-editor" onclick="event.stopPropagation()">
            <input type="text" class="note-inline-title" id="inlineTitle_${n.id}" value="${App.utils.escapeHtml(n.title || '')}" placeholder="Note title" aria-label="Note title">
            <textarea class="note-inline-body" id="inlineBody_${n.id}" rows="4" placeholder="Edit note content directly..." aria-label="Note content">${App.utils.escapeHtml(getNotePlainText(n.content_html || n.content || ''))}</textarea>
            <div class="note-inline-actions">
              <div>
                <button type="button" class="n-btn n-btn--primary n-btn--sm inline-save-btn" data-save-inline="${n.id}">Save</button>
                <button type="button" class="n-btn n-btn--sm inline-cancel-btn" data-cancel-inline="${n.id}">Cancel</button>
              </div>
              <button type="button" class="n-btn n-btn--sm inline-open-editor-btn" data-open-editor="${n.id}">Open full editor ${ic('chevR')}</button>
            </div>
          </div>
        ` : `
          <div class="note-item-snippet">${App.utils.escapeHtml(snippet || 'Empty note')}</div>
          <div class="note-item-meta">
            <span>${formatRelativeDate(n.updated_at || n.created_at)}</span>
            ${folder ? `<span class="note-item-folder"><span class="notes-folder-dot" style="background:${folder.color || '#c9a84c'}"></span> ${App.utils.escapeHtml(folder.name)}</span>` : ''}
            ${n.reminder_at ? `<span class="note-item-reminder ${isOverdue ? 'overdue' : ''}">${ic('clock')} ${new Date(n.reminder_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : ''}
            ${firstTag ? `<span class="note-item-tag">#${App.utils.escapeHtml(firstTag)}</span>` : ''}
          </div>
        `}
      </div>
    `;
  }
  function drawListPane() {
    const listPane = App.utils.qs('#notesListPane');
    if (!listPane) return;

    const savedFocus = captureFocus(listPane);
    const filtered = getFilteredNotes();
    const hasBulkSelection = state.selectedNoteIds.size > 0;
    listPane.classList.toggle('has-selection', hasBulkSelection);

    // Build content based on displayMode ('list' vs 'folder')
    let contentHtml = '';
    if (filtered.length === 0) {
      const searching = !!state.searchQuery.trim();
      const inTrash = state.activeFilter === 'trash';
      contentHtml = `
        <div class="n-empty">
          <div class="n-empty-ic">${ic(searching ? 'search' : inTrash ? 'trash' : 'file')}</div>
          <h3>${searching ? 'No matching notes' : inTrash ? 'Trash is empty' : 'Nothing here yet'}</h3>
          <p>${searching ? `Nothing matched "${App.utils.escapeHtml(state.searchQuery.trim())}" in this view.` : inTrash ? 'Deleted notes will wait here until you restore them.' : 'Create a note to start capturing ideas in this view.'}</p>
          <div class="n-empty-actions"><button type="button" class="n-btn n-btn--primary" id="emptyCreateBtn">${ic('plus')}<span>New note</span></button></div>
        </div>
      `;
    } else if (state.displayMode === 'folder') {
      // Group notes by folder
      const folderGroups = [
        ...state.folders.map((f) => ({
          id: String(f.id),
          name: f.name,
          color: f.color || '#c9a84c',
          isCustom: true,
          notes: filtered.filter((n) => String(n.folder_id || '') === String(f.id)),
        })),
        {
          id: 'unorganized',
          name: 'Unorganized / General',
          color: '#8496ac',
          isCustom: false,
          notes: filtered.filter((n) => !n.folder_id || !state.folders.some((f) => String(f.id) === String(n.folder_id))),
        },
      ];

      contentHtml = folderGroups.map((grp) => {
        const isCollapsed = state.collapsedFolderGroups.has(grp.id);
        if (state.searchQuery.trim() && grp.notes.length === 0) return '';
        const safeName = App.utils.escapeHtml(grp.name);
        return `
          <div class="notes-folder-group">
            <div class="notes-folder-group-header">
              <button type="button" class="notes-folder-group-title" data-toggle-group="${grp.id}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
                ${ic('chevR')}
                <span class="notes-folder-dot" style="background:${grp.color}"></span>
                <span>${safeName}</span>
                <span class="count-pill">${grp.notes.length}</span>
              </button>
              <div class="notes-folder-group-actions">
                <button type="button" class="n-icon-btn n-icon-btn--xs" data-add-in-folder="${grp.id === 'unorganized' ? '' : grp.id}" title="Add note in ${safeName}" aria-label="Add note in ${safeName}">${ic('plus')}</button>
                ${grp.isCustom ? `
                  <button type="button" class="n-icon-btn n-icon-btn--xs n-icon-btn--danger" data-delete-folder-group="${grp.id}" title="Delete folder (notes are kept)" aria-label="Delete folder ${safeName}">${ic('trash')}</button>
                ` : ''}
              </div>
            </div>
            ${!isCollapsed ? `
              <div class="notes-folder-group-cards">
                ${grp.notes.length > 0 ? grp.notes.map(renderNoteCard).join('') : `
                  <div class="nl-group-empty">No notes in this folder yet.</div>
                `}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    } else {
      contentHtml = filtered.map(renderNoteCard).join('');
    }

    const navExpanded = (() => {
      const ws = App.utils.qs('#notesWorkspace');
      if (!ws) return false;
      return ws.clientWidth >= NAV_WIDE_PX ? !ws.classList.contains('nav-collapsed') : ws.classList.contains('nav-open');
    })();

    listPane.innerHTML = `
      <div class="notes-list-header">
        <div class="nli-title-row">
          <button type="button" class="n-icon-btn" id="notesNavToggleBtn" aria-controls="notesNavPane" aria-expanded="${navExpanded ? 'true' : 'false'}" title="Show or hide folders &amp; views" aria-label="Show or hide folders and views">${ic('panel')}</button>
          <h2 class="nli-title"><strong>${App.utils.escapeHtml(getActiveViewLabel())}</strong><span>${filtered.length}</span></h2>
        </div>
        <div class="n-search">
          ${ic('search')}
          <input type="text" class="n-field" id="notesSearchInput" placeholder="Search notes, tags, content" aria-label="Search notes" autocomplete="off" value="${App.utils.escapeHtml(state.searchQuery)}">
        </div>
        <div class="notes-list-controls">
          <div class="nli-left">
            <input type="checkbox" id="selectAllNotesChk" ${hasBulkSelection && state.selectedNoteIds.size === filtered.length ? 'checked' : ''} aria-label="Select all notes in this view" title="Select all">
            <div class="n-seg notes-view-mode-toggle" role="group" aria-label="List layout">
              <button type="button" class="n-seg-btn notes-view-mode-btn ${state.displayMode === 'list' ? 'active' : ''}" data-view-mode="list" aria-pressed="${state.displayMode === 'list'}" title="Continuous list">${ic('rows')}<span>List</span></button>
              <button type="button" class="n-seg-btn notes-view-mode-btn ${state.displayMode === 'folder' ? 'active' : ''}" data-view-mode="folder" aria-pressed="${state.displayMode === 'folder'}" title="Group notes by folder">${ic('folder')}<span>Folders</span></button>
            </div>
          </div>
          <select id="notesSortSelect" class="n-field" aria-label="Sort notes">
            <option value="updated_desc" ${state.sortBy === 'updated_desc' ? 'selected' : ''}>Recently updated</option>
            <option value="created_desc" ${state.sortBy === 'created_desc' ? 'selected' : ''}>Date created</option>
            <option value="title_asc" ${state.sortBy === 'title_asc' ? 'selected' : ''}>Title (A-Z)</option>
            <option value="priority_desc" ${state.sortBy === 'priority_desc' ? 'selected' : ''}>Priority</option>
            <option value="reminder_asc" ${state.sortBy === 'reminder_asc' ? 'selected' : ''}>Reminder date</option>
          </select>
        </div>
      </div>

      <!-- Bulk Actions Bar (conditionally shown) -->
      ${hasBulkSelection ? `
        <div class="notes-bulk-bar" role="region" aria-label="Bulk actions">
          <span>${state.selectedNoteIds.size} selected</span>
          <div>
            ${state.activeFilter === 'trash' ? `
              <button type="button" class="n-btn n-btn--sm" id="bulkRestoreBtn">${ic('restore')}<span>Restore</span></button>
              <button type="button" class="n-btn n-btn--sm n-btn--danger" id="bulkPermanentDeleteBtn">${ic('trash')}<span>Delete forever</span></button>
            ` : `
              <button type="button" class="n-btn n-btn--sm" id="bulkArchiveBtn">${ic('archive')}<span>${state.activeFilter === 'archive' ? 'Unarchive' : 'Archive'}</span></button>
              <button type="button" class="n-btn n-btn--sm n-btn--danger" id="bulkTrashBtn">${ic('trash')}<span>Trash</span></button>
            `}
          </div>
        </div>
      ` : ''}

      <!-- Scrollable Notes Stream / Folder Groups -->
      <div class="notes-list-scroll" id="notesListScroll">
        ${contentHtml}
      </div>
    `;

    App.utils.qs('#notesNavToggleBtn', listPane)?.addEventListener('click', toggleNotesNav);
    // Bind View Mode Switcher (List vs Folder)
    App.utils.qsa('[data-view-mode]', listPane).forEach((btn) => {
      btn.addEventListener('click', () => {
        state.displayMode = btn.dataset.viewMode;
        drawListPane();
      });
    });

    // Bind Folder Group Header Toggles (Collapse / Expand)
    App.utils.qsa('[data-toggle-group]', listPane).forEach((hdr) => {
      hdr.addEventListener('click', () => {
        const grpId = hdr.dataset.toggleGroup;
        if (state.collapsedFolderGroups.has(grpId)) {
          state.collapsedFolderGroups.delete(grpId);
        } else {
          state.collapsedFolderGroups.add(grpId);
        }
        drawListPane();
      });
    });

    // Bind Add Note in specific folder
    App.utils.qsa('[data-add-in-folder]', listPane).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fId = btn.dataset.addInFolder;
        createNewNoteModal('', '', fId);
      });
    });

    // Bind Delete Folder from Folder Group Header
    App.utils.qsa('[data-delete-folder-group]', listPane).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fId = String(btn.dataset.deleteFolderGroup);
        const targetFolder = state.folders.find((f) => String(f.id) === fId);
        const fName = targetFolder ? targetFolder.name : 'this folder';
        if (!confirm(`Delete folder "${fName}"? Any notes inside will be preserved and moved to "Unorganized".`)) return;

        try {
          await App.api.deleteNoteFolder(fId);
          state.folders = state.folders.filter((f) => String(f.id) !== fId);
          state.notes.forEach((n) => {
            if (String(n.folder_id || '') === fId) n.folder_id = null;
          });
          if (state.activeFilter === `folder:${fId}`) state.activeFilter = 'all';
          App.utils.toast('Folder deleted. Notes preserved.');
          drawNavPane();
          drawListPane();
          drawEditorPane();
        } catch (err) {
          App.utils.toast('Could not delete folder: ' + (err.message || err), 'err');
        }
      });
    });

    // Bind Inline Quick Edit Toggle
    App.utils.qsa('[data-edit-inline]', listPane).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.editInline;
        state.inlineEditingNoteId = (String(state.inlineEditingNoteId) === String(id)) ? null : id;
        drawListPane();
      });
    });

    // Bind Inline Save Button
    App.utils.qsa('[data-save-inline]', listPane).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.saveInline;
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (!note) return;

        const titleEl = App.utils.qs(`#inlineTitle_${id}`, listPane);
        const bodyEl = App.utils.qs(`#inlineBody_${id}`, listPane);

        const newTitle = (titleEl ? titleEl.value.trim() : '') || 'Untitled Note';
        const newBody = bodyEl ? bodyEl.value.trim() : '';
        const newHtml = `<p>${App.utils.escapeHtml(newBody).replace(/\n/g, '<br>')}</p>`;

        try {
          btn.textContent = 'Saving...';
          await App.api.updateNote(note.id, {
            title: newTitle,
            content: newBody,
            content_html: newHtml,
          });

          note.title = newTitle;
          note.content = newBody;
          note.content_html = newHtml;
          note.updated_at = new Date().toISOString();

          state.inlineEditingNoteId = null;
          App.utils.toast('Note saved');
          drawNavPane();
          drawListPane();
          if (String(state.activeNoteId) === String(note.id)) {
            drawEditorPane();
          }
        } catch (err) {
          App.utils.toast('Could not save note: ' + (err.message || err), 'err');
        }
      });
    });

    // Bind Inline Cancel Button
    App.utils.qsa('[data-cancel-inline]', listPane).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.inlineEditingNoteId = null;
        drawListPane();
      });
    });

    // Bind Open Full Editor button from card / inline form
    App.utils.qsa('[data-open-editor]', listPane).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.openEditor;
        state.activeNoteId = id;
        state.inlineEditingNoteId = null;
        state.mobileView = 'editor';
        updateMobileViewState();
        drawListPane();
        drawEditorPane();
      });
    });

    // Bind Search Input (debounced)
    const searchInput = App.utils.qs('#notesSearchInput', listPane);
    searchInput?.addEventListener('input', App.utils.debounce((e) => {
      state.searchQuery = e.target.value;
      drawListPane();
    }, 200));

    // Bind Sort Change
    App.utils.qs('#notesSortSelect', listPane)?.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      drawListPane();
    });

    // Bind Empty Create
    App.utils.qs('#emptyCreateBtn', listPane)?.addEventListener('click', () => {
      createNewNoteModal();
    });

    // Bind Select All Checkbox
    App.utils.qs('#selectAllNotesChk', listPane)?.addEventListener('change', (e) => {
      if (e.target.checked) {
        filtered.forEach((n) => state.selectedNoteIds.add(String(n.id)));
      } else {
        state.selectedNoteIds.clear();
      }
      drawListPane();
    });

    // Bind Individual Checkbox Selection
    App.utils.qsa('.note-select-chk', listPane).forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const id = String(e.target.dataset.chkId);
        if (e.target.checked) state.selectedNoteIds.add(id);
        else state.selectedNoteIds.delete(id);
        drawListPane();
      });
    });

    // Bind Bulk Actions
    App.utils.qs('#bulkArchiveBtn', listPane)?.addEventListener('click', async () => {
      const isArchiving = state.activeFilter !== 'archive';
      for (const id of state.selectedNoteIds) {
        await App.api.updateNote(id, { is_archived: isArchiving });
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) note.is_archived = isArchiving;
      }
      state.selectedNoteIds.clear();
      App.utils.toast(isArchiving ? 'Notes archived' : 'Notes unarchived');
      drawNavPane();
      drawListPane();
      drawEditorPane();
    });

    App.utils.qs('#bulkTrashBtn', listPane)?.addEventListener('click', async () => {
      for (const id of state.selectedNoteIds) {
        await App.api.updateNote(id, { in_trash: true, trashed_at: new Date().toISOString() });
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) {
          note.in_trash = true;
          note.trashed_at = new Date().toISOString();
        }
      }
      state.selectedNoteIds.clear();
      App.utils.toast('Moved to Trash');
      drawNavPane();
      drawListPane();
      drawEditorPane();
    });

    App.utils.qs('#bulkRestoreBtn', listPane)?.addEventListener('click', async () => {
      for (const id of state.selectedNoteIds) {
        await App.api.updateNote(id, { in_trash: false, trashed_at: null });
        const note = state.notes.find((n) => String(n.id) === String(id));
        if (note) {
          note.in_trash = false;
          note.trashed_at = null;
        }
      }
      state.selectedNoteIds.clear();
      App.utils.toast('Restored from Trash');
      drawNavPane();
      drawListPane();
      drawEditorPane();
    });

    App.utils.qs('#bulkPermanentDeleteBtn', listPane)?.addEventListener('click', async () => {
      if (!confirm(`Permanently delete ${state.selectedNoteIds.size} notes? This cannot be undone.`)) return;
      for (const id of state.selectedNoteIds) {
        await App.api.deleteNote(id);
        state.notes = state.notes.filter((n) => String(n.id) !== String(id));
      }
      state.selectedNoteIds.clear();
      App.utils.toast('Notes permanently deleted');
      drawNavPane();
      drawListPane();
      drawEditorPane();
    });

    // Bind Note Card Click
    App.utils.qsa('.note-item-card', listPane).forEach((card) => {
      card.addEventListener('click', (e) => {
        // If clicked on input, textarea, or button, ignore selection
        if (e.target.closest('input') || e.target.closest('textarea') || e.target.closest('button')) {
          return;
        }
        const id = card.dataset.noteId;
        state.activeNoteId = id;
        state.mobileView = 'editor';
        updateMobileViewState();
        drawListPane();
        drawEditorPane();
      });

      // Keyboard: Enter / Space on the focused row opens the note (same as a click)
      card.addEventListener('keydown', (e) => {
        if (e.target !== card) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });

    restoreFocus(savedFocus, listPane);
  }

  // ==========================================================================
  // PANE 3: ACTIVE RICH-TEXT NOTE EDITOR & KNOWLEDGE PANEL
  // ==========================================================================
  function drawEditorPane() {
    const editorPane = App.utils.qs('#notesEditorPane');
    if (!editorPane) return;

    const note = getActiveNote();

    if (!note) {
      editorPane.innerHTML = `
        <div class="ne-topbar">
          <div class="ne-topbar-l">
            <button type="button" class="n-icon-btn notes-mobile-back" id="notesMobileBackBtn" title="Back to notes list" aria-label="Back to notes list">${ic('back')}</button>
          </div>
        </div>
        <div class="ne-empty">
          <div class="n-empty">
            <div class="n-empty-ic">${ic('file')}</div>
            <h3>No note selected</h3>
            <p>Pick a note from the list, or create a new one to start capturing your thinking.</p>
            <div class="n-empty-actions"><button type="button" class="n-btn n-btn--primary" id="editorNewNoteBtn">${ic('plus')}<span>New note</span></button></div>
          </div>
        </div>
      `;
      App.utils.qs('#editorNewNoteBtn', editorPane)?.addEventListener('click', () => createNewNoteModal());
      App.utils.qs('#notesMobileBackBtn', editorPane)?.addEventListener('click', () => {
        state.mobileView = 'list';
        updateMobileViewState();
      });
      return;
    }

    const initialHtml = note.content_html || (note.content ? App.utils.escapeHtml(note.content).replace(/\n/g, '<br>') : '');
    const stats = getNoteStats(initialHtml);
    const pinLabel = note.is_pinned ? 'Unpin note' : 'Pin to top';
    const favLabel = note.is_favorite ? 'Remove favorite' : 'Mark as favorite';

    editorPane.innerHTML = `
      <!-- Slim action bar: location, save state, quick toggles, overflow menu -->
      <div class="ne-topbar">
        <div class="ne-topbar-l">
          <button type="button" class="n-icon-btn notes-mobile-back" id="notesMobileBackBtn" title="Back to notes list" aria-label="Back to notes list">${ic('back')}</button>
          <label class="ne-folder" title="Move to folder">
            ${ic('folder')}
            <select id="noteFolderSelect" aria-label="Folder">
              <option value="">No folder</option>
              ${state.folders.map((f) => `<option value="${f.id}" ${String(note.folder_id || '') === String(f.id) ? 'selected' : ''}>${App.utils.escapeHtml(f.name)}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="ne-topbar-r">
          <span class="notes-status-badge saved" id="noteSaveStatus" role="status" aria-live="polite"><span class="n-dot"></span><span class="n-status-text">Saved</span></span>

          <button type="button" class="n-icon-btn ${note.is_pinned ? 'is-on' : ''}" id="notePinBtn" aria-pressed="${note.is_pinned ? 'true' : 'false'}" title="${pinLabel}" aria-label="${pinLabel}">${ic('pin')}</button>
          <button type="button" class="n-icon-btn ${note.is_favorite ? 'is-on' : ''}" id="noteFavBtn" aria-pressed="${note.is_favorite ? 'true' : 'false'}" title="${favLabel}" aria-label="${favLabel}">${ic('star')}</button>

          <button type="button" class="n-btn n-btn--accent n-btn--sm ne-ai" id="notesAiAssistBtn" title="AI assistant: summarize, polish, extract actions, analyze risks" aria-label="AI assistant">${ic('sparkles')}<span class="n-btn-label">AI assist</span></button>

          <div class="n-menu-wrap">
            <button type="button" class="n-icon-btn" id="noteMoreBtn" data-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-controls="noteMoreMenu" title="More actions" aria-label="More actions">${ic('more', 'is-filled')}</button>
            <div class="n-menu" id="noteMoreMenu" role="menu" aria-label="Note actions" hidden>
              <button type="button" class="n-menu-item" role="menuitem" id="noteVersionHistoryBtn" title="Version snapshots">${ic('history')}<span>Version history</span></button>
              <button type="button" class="n-menu-item" role="menuitem" id="noteExportSingleBtn" title="Export note">${ic('download')}<span>Export note</span></button>
              <button type="button" class="n-menu-item" role="menuitem" id="noteDuplicateBtn" title="Duplicate note">${ic('copy')}<span>Duplicate</span></button>
              <div class="n-menu-sep" role="separator"></div>
              <button type="button" class="n-menu-item ${note.in_trash ? '' : 'n-menu-item--danger'}" role="menuitem" id="noteTrashBtn" title="${note.in_trash ? 'Restore from Trash' : 'Move to Trash'}">${ic(note.in_trash ? 'restore' : 'trash')}<span>${note.in_trash ? 'Restore from trash' : 'Move to trash'}</span></button>
            </div>
          </div>
        </div>
      </div>

      <!-- Rich-Text Formatting Toolbar -->
      <div class="notes-toolbar" role="toolbar" aria-label="Text formatting">
        <div class="notes-toolbar-group">
          <button type="button" class="notes-toolbar-btn" data-cmd="bold" title="Bold (Ctrl+B)" aria-label="Bold">${ic('bold')}</button>
          <button type="button" class="notes-toolbar-btn" data-cmd="italic" title="Italic (Ctrl+I)" aria-label="Italic">${ic('italic')}</button>
          <button type="button" class="notes-toolbar-btn" data-cmd="strikeThrough" title="Strikethrough" aria-label="Strikethrough">${ic('strike')}</button>
        </div>
        <span class="notes-toolbar-sep" aria-hidden="true"></span>
        <div class="notes-toolbar-group">
          <button type="button" class="notes-toolbar-btn" data-heading="h1" title="Heading 1" aria-label="Heading 1">H1</button>
          <button type="button" class="notes-toolbar-btn" data-heading="h2" title="Heading 2" aria-label="Heading 2">H2</button>
          <button type="button" class="notes-toolbar-btn" data-heading="h3" title="Heading 3" aria-label="Heading 3">H3</button>
        </div>
        <span class="notes-toolbar-sep" aria-hidden="true"></span>
        <div class="notes-toolbar-group">
          <button type="button" class="notes-toolbar-btn" data-cmd="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list">${ic('ul')}</button>
          <button type="button" class="notes-toolbar-btn" data-cmd="insertOrderedList" title="Numbered list" aria-label="Numbered list">${ic('ol')}</button>
          <button type="button" class="notes-toolbar-btn" id="toolbarChecklistBtn" title="Checklist item" aria-label="Checklist item">${ic('checksq')}</button>
        </div>
        <span class="notes-toolbar-sep" aria-hidden="true"></span>
        <div class="notes-toolbar-group">
          <button type="button" class="notes-toolbar-btn" id="toolbarBlockquoteBtn" title="Quote block" aria-label="Quote block">${ic('quote')}</button>
          <button type="button" class="notes-toolbar-btn" id="toolbarCodeBtn" title="Code block" aria-label="Code block">${ic('code')}</button>
          <button type="button" class="notes-toolbar-btn" id="toolbarTableBtn" title="Insert table" aria-label="Insert table">${ic('table')}</button>
          <button type="button" class="notes-toolbar-btn" id="toolbarLinkBtn" title="Insert link" aria-label="Insert link">${ic('link')}</button>
        </div>
        <span class="notes-toolbar-sep" aria-hidden="true"></span>
        <div class="notes-toolbar-group">
          <button type="button" class="notes-toolbar-btn" data-cmd="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${ic('undo')}</button>
          <button type="button" class="notes-toolbar-btn" data-cmd="redo" title="Redo (Ctrl+Y)" aria-label="Redo">${ic('redo')}</button>
        </div>
      </div>

      <!-- Content Scroll & Body -->
      <div class="notes-content-scroll">
        <div class="notes-doc">
          <input type="text" class="notes-editor-title-input" id="noteTitleInput" value="${App.utils.escapeHtml(note.title || '')}" placeholder="Untitled note" aria-label="Note title" autocomplete="off">

          <div class="notes-doc-meta">
            <button type="button" class="n-chip" id="noteReminderBtn" title="Set reminder / due date">${ic('clock')}<span>${note.reminder_at ? `Due ${new Date(note.reminder_at).toLocaleDateString()}` : 'Set reminder'}</span></button>
            <button type="button" class="n-chip" id="noteTagsBtn" title="Manage tags">${ic('tag')}<span>${Array.isArray(note.tags) && note.tags.length > 0 ? note.tags.map((t) => `#${App.utils.escapeHtml(t)}`).join(' ') : 'Add tags'}</span></button>
            <span class="n-meta-text"><span id="noteWordCount">${stats.words} words</span><span aria-hidden="true">&middot;</span><span id="noteReadingTime">${stats.readingTimeMinutes} min read</span></span>
          </div>

          <div class="notes-content-editable" id="notesContentEditable" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note content" placeholder="Start writing: thesis, meeting minutes, a checklist...">
            ${initialHtml}
          </div>

          <!-- Entity Linking Tray -->
          <div class="notes-entity-tray" id="notesEntityTray">
            <div class="notes-entity-tray-header">
              <span>${ic('link')} Linked portfolio records</span>
              <button type="button" class="n-btn n-btn--sm" id="addEntityLinkBtn">${ic('plus')}<span>Link record</span></button>
            </div>
            <div class="notes-entity-chips" id="notesEntityChips">
              ${Array.isArray(note.linked_entities) && note.linked_entities.length > 0 ? note.linked_entities.map((ent, idx) => `
                <span class="notes-entity-chip" tabindex="0" role="link" data-entity-type="${App.utils.escapeHtml(ent.type)}" data-entity-id="${App.utils.escapeHtml(ent.id)}" title="Open ${App.utils.escapeHtml(ent.label || '')}">
                  <span class="n-etype">${App.utils.escapeHtml(String(ent.type).toUpperCase())}</span>
                  <span>${App.utils.escapeHtml(ent.label || 'Entity')}</span>
                  <button type="button" class="del-link" data-del-entity="${idx}" title="Remove link" aria-label="Remove link to ${App.utils.escapeHtml(ent.label || 'record')}" onclick="event.stopPropagation()">${ic('x')}</button>
                </span>
              `).join('') : '<span class="nn-hint">No linked deals, SIPs, gold or goals yet.</span>'}
            </div>
          </div>
        </div>
      </div>
    `;

    bindEditorEvents(note);
  }
  // ---- Bind Editor Events & Autosave Engine ----
  function bindEditorEvents(note) {
    const editorPane = App.utils.qs('#notesEditorPane');
    if (!editorPane) return;
    const editor = App.utils.qs('#notesContentEditable', editorPane);
    const titleInput = App.utils.qs('#noteTitleInput', editorPane);
    const statusBadge = App.utils.qs('#noteSaveStatus', editorPane);

    if (!editor || !titleInput) return;

    // Set up Sync Manager with safe fallback
    const syncOptions = {
      noteId: note.id,
      debounceMs: 800,
      saveFn: async (payload) => {
        const cleanPayload = Object.assign({}, payload);
        const saved = await App.api.updateNote(note.id, cleanPayload);
        Object.assign(note, cleanPayload, { updated_at: saved.updated_at || new Date().toISOString() });
        return saved;
      },
      onStatusChange: (status) => {
        state.saveStatus = status;
        if (!statusBadge) return;
        statusBadge.className = `notes-status-badge ${status}`;
        const setStatusText = (text) => {
          statusBadge.innerHTML = `<span class="n-dot"></span><span class="n-status-text">${text}</span>`;
        };
        if (status === 'saving') {
          setStatusText('Saving...');
        } else if (status === 'saved') {
          setStatusText('Saved');
          updateCardSnippetInList(note.id);
        } else if (status === 'cached') {
          setStatusText('Draft saved offline');
        } else if (status === 'failed') {
          setStatusText('Save failed');
        }
      },
      onConflict: () => {
        App.utils.toast('A newer version of this note was detected on another session.', 'err');
      },
    };

    if (App.notesSync && typeof App.notesSync.createSyncManager === 'function') {
      activeSync = App.notesSync.createSyncManager(syncOptions);
    } else {
      let fallbackTimer = null;
      activeSync = {
        queueSave: (payload) => {
          if (fallbackTimer) clearTimeout(fallbackTimer);
          syncOptions.onStatusChange('saving');
          fallbackTimer = setTimeout(async () => {
            try {
              await syncOptions.saveFn(payload);
              syncOptions.onStatusChange('saved');
            } catch (e) {
              syncOptions.onStatusChange('failed');
            }
          }, 800);
        },
        flush: async () => {},
        destroy: () => { if (fallbackTimer) clearTimeout(fallbackTimer); }
      };
    }

    // Content change trigger
    const handleContentChange = () => {
      const html = editor.innerHTML;
      const plainText = getNotePlainText(html);
      const title = titleInput.value.trim() || 'Untitled Note';

      // Update word counters
      const stats = getNoteStats(html);
      const wc = App.utils.qs('#noteWordCount');
      const rt = App.utils.qs('#noteReadingTime');
      if (wc) wc.textContent = `${stats.words} words`;
      if (rt) rt.textContent = `${stats.readingTimeMinutes} min read`;

      // Queue autosave
      activeSync.queueSave({
        title,
        content_html: html,
        content: plainText,
      });
    };

    editor.addEventListener('input', handleContentChange);
    titleInput.addEventListener('input', handleContentChange);

    // Interactive Checkboxes: when clicked inside editor, toggle .checked on .notes-task-item
    editor.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('notes-task-checkbox')) {
        const item = e.target.closest('.notes-task-item');
        if (item) {
          if (e.target.checked) {
            item.classList.add('checked');
            e.target.setAttribute('checked', 'checked');
          } else {
            item.classList.remove('checked');
            e.target.removeAttribute('checked');
          }
          handleContentChange();
        }
      }
    });

    // Pressing a toolbar button must not pull focus (and the text selection) out of the editor
    App.utils.qs('.notes-toolbar', editorPane)?.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) e.preventDefault();
    });

    // Toolbar standard execCommand buttons
    App.utils.qsa('[data-cmd]', editorPane).forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (App.notesEditor) App.notesEditor.execCommand(cmd);
        handleContentChange();
      });
    });

    // Heading buttons
    App.utils.qsa('[data-heading]', editorPane).forEach((btn) => {
      btn.addEventListener('click', () => {
        const h = btn.dataset.heading;
        if (App.notesEditor) App.notesEditor.formatBlock(h);
        handleContentChange();
      });
    });

    // Insert Checklist
    App.utils.qs('#toolbarChecklistBtn', editorPane)?.addEventListener('click', () => {
      if (App.notesEditor) App.notesEditor.insertChecklist();
      handleContentChange();
    });

    // Insert Blockquote
    App.utils.qs('#toolbarBlockquoteBtn', editorPane)?.addEventListener('click', () => {
      if (App.notesEditor) App.notesEditor.formatBlock('blockquote');
      handleContentChange();
    });

    // Insert Code Block
    App.utils.qs('#toolbarCodeBtn', editorPane)?.addEventListener('click', () => {
      if (App.notesEditor) App.notesEditor.insertCodeBlock();
      handleContentChange();
    });

    // Insert Table
    App.utils.qs('#toolbarTableBtn', editorPane)?.addEventListener('click', () => {
      if (App.notesEditor) App.notesEditor.insertTable(3, 3);
      handleContentChange();
    });

    // Insert Link
    App.utils.qs('#toolbarLinkBtn', editorPane)?.addEventListener('click', () => {
      const url = prompt('Enter link URL (https://...):');
      if (url && App.notesEditor) {
        App.notesEditor.insertLink(url);
        handleContentChange();
      }
    });

    // AI Knowledge Assistant
    App.utils.qs('#notesAiAssistBtn', editorPane)?.addEventListener('click', () => {
      openAiAssistModal(note, editor, handleContentChange);
    });

    // Mobile Back to list
    App.utils.qs('#notesMobileBackBtn', editorPane)?.addEventListener('click', () => {
      state.mobileView = 'list';
      updateMobileViewState();
    });

    // Folder select
    App.utils.qs('#noteFolderSelect', editorPane)?.addEventListener('change', async (e) => {
      const fId = e.target.value || null;
      note.folder_id = fId;
      await App.api.updateNote(note.id, { folder_id: fId });
      App.utils.toast('Folder updated');
      drawNavPane();
      drawListPane();
    });

    // Pin Toggle
    App.utils.qs('#notePinBtn', editorPane)?.addEventListener('click', async () => {
      note.is_pinned = !note.is_pinned;
      await App.api.updateNote(note.id, { is_pinned: note.is_pinned });
      App.utils.toast(note.is_pinned ? 'Pinned to top' : 'Unpinned');
      drawNavPane();
      drawListPane();
      drawEditorPane();
    });

    // Favorite Toggle
    App.utils.qs('#noteFavBtn', editorPane)?.addEventListener('click', async () => {
      note.is_favorite = !note.is_favorite;
      await App.api.updateNote(note.id, { is_favorite: note.is_favorite });
      App.utils.toast(note.is_favorite ? 'Added to favorites' : 'Removed from favorites');
      drawNavPane();
      drawListPane();
      drawEditorPane();
    });

    // Reminder & Due Date Modal
    App.utils.qs('#noteReminderBtn', editorPane)?.addEventListener('click', () => {
      openReminderModal(note);
    });

    // Tags Modal
    App.utils.qs('#noteTagsBtn', editorPane)?.addEventListener('click', () => {
      openTagsModal(note);
    });

    // Version History
    App.utils.qs('#noteVersionHistoryBtn', editorPane)?.addEventListener('click', () => {
      openVersionHistoryModal(note, editor, handleContentChange);
    });

    // Single Note Export
    App.utils.qs('#noteExportSingleBtn', editorPane)?.addEventListener('click', () => {
      openSingleNoteExport(note);
    });

    // Duplicate Note
    App.utils.qs('#noteDuplicateBtn', editorPane)?.addEventListener('click', async () => {
      const copyPayload = {
        title: `${note.title || 'Note'} (Copy)`,
        content_html: note.content_html || '',
        content: note.content || '',
        folder_id: note.folder_id,
        tags: Array.isArray(note.tags) ? [...note.tags] : [],
        linked_entities: Array.isArray(note.linked_entities) ? [...note.linked_entities] : [],
        color: note.color,
      };
      try {
        const created = await App.api.createNote(copyPayload);
        state.notes.unshift(created);
        state.activeNoteId = created.id;
        App.utils.toast('Note duplicated');
        drawNavPane();
        drawListPane();
        drawEditorPane();
      } catch (err) {
        App.utils.toast('Could not duplicate note: ' + (err.message || err), 'err');
      }
    });

    // Trash / Restore
    App.utils.qs('#noteTrashBtn', editorPane)?.addEventListener('click', async () => {
      const newTrashState = !note.in_trash;
      await App.api.updateNote(note.id, {
        in_trash: newTrashState,
        trashed_at: newTrashState ? new Date().toISOString() : null,
      });
      note.in_trash = newTrashState;
      note.trashed_at = newTrashState ? new Date().toISOString() : null;
      App.utils.toast(newTrashState ? 'Moved to Trash' : 'Restored from Trash');
      drawNavPane();
      drawListPane();
      drawEditorPane();
    });

    // Entity Linking Events
    App.utils.qs('#addEntityLinkBtn', editorPane)?.addEventListener('click', () => {
      openEntityLinkModal(note);
    });

    // Entity Chip navigation click
    App.utils.qsa('.notes-entity-chip', editorPane).forEach((chip) => {
      chip.addEventListener('click', () => {
        const type = chip.dataset.entityType;
        const id = chip.dataset.entityId;
        navigateToEntity(type, id);
      });
      chip.addEventListener('keydown', (e) => {
        if (e.target === chip && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          chip.click();
        }
      });
    });

    // Remove Entity link
    App.utils.qsa('[data-del-entity]', editorPane).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.delEntity);
        if (Array.isArray(note.linked_entities)) {
          note.linked_entities.splice(idx, 1);
          await App.api.updateNote(note.id, { linked_entities: note.linked_entities });
          App.utils.toast('Entity unlinked');
          drawEditorPane();
        }
      });
    });
  }

  // ---- Helper: Update List Card Snippet in Real-time ----
  function updateCardSnippetInList(noteId) {
    const card = App.utils.qs(`.note-item-card[data-note-id="${noteId}"]`);
    if (!card) return;
    const note = state.notes.find((n) => String(n.id) === String(noteId));
    if (!note) return;

    const titleEl = card.querySelector('.note-item-title');
    const snippetEl = card.querySelector('.note-item-snippet');
    if (titleEl) titleEl.textContent = note.title || 'Untitled Note';
    if (snippetEl) {
      snippetEl.textContent = getSnippetText(note.content_html || note.content || '', 140) || 'Empty note';
    }
  }

  // ---- Entity Navigation ----
  function navigateToEntity(type, id) {
    switch (type.toLowerCase()) {
      case 'deal':
      case 'deals':
        App.router.navigate('deals');
        break;
      case 'recurring':
      case 'sip':
        App.router.navigate('recurring');
        break;
      case 'gold':
        App.router.navigate('gold');
        break;
      case 'contact':
      case 'contacts':
        App.router.navigate('contacts');
        break;
      case 'document':
      case 'documents':
        App.router.navigate('documents');
        break;
      case 'goal':
      case 'goals':
        App.router.navigate('goals');
        break;
      case 'calendar':
        App.router.navigate('calendar');
        break;
      default:
        App.utils.toast(`Opening ${type}...`);
        break;
    }
  }

  // ==========================================================================
  // MODALS & DIALOGS
  // ==========================================================================

  // The shared form renderer emits <label> without a "for"; link each label to its control for screen readers.
  function associateFieldLabels(root) {
    const scope = root || document;
    scope.querySelectorAll('.notes-dlg .field').forEach((field) => {
      const label = field.querySelector('label');
      const control = field.querySelector('input, select, textarea');
      if (label && control && control.id && !label.htmlFor) label.htmlFor = control.id;
    });
  }

  // ---- Modal: Quick Capture Note ----
  function createNewNoteModal(prefillHtml = '', prefillTitle = '', prefillFolderId = '') {
    const fields = [
      { key: 'title', label: 'Note Title', required: true, span: 2, value: prefillTitle },
      {
        key: 'folder_id',
        label: 'Folder',
        type: 'select',
        options: [{ value: '', label: 'None (Unorganized)' }, ...state.folders.map((f) => ({ value: f.id, label: f.name }))],
        value: prefillFolderId || '',
        span: 1,
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
        span: 1,
      },
      { key: 'content', label: 'Quick Notes / Outline', type: 'textarea', rows: 6, span: 2, value: prefillHtml ? '' : '' },
    ];

    App.ui.open({
      title: 'Quick capture',
      small: true,
      onMount: associateFieldLabels,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">${prefillHtml ? 'Your template is ready. Name the note and choose where it lives.' : 'Capture an idea, meeting takeaway or research item before it slips away.'}</p>
          ${App.ui.renderForm(fields, { folder_id: prefillFolderId || '', title: prefillTitle || '' })}
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Create note',
          className: 'btn-gold',
          onClick: async () => {
            const { values, errors } = App.ui.readForm(fields);
            if (errors.length) {
              App.utils.toast('Please provide a title', 'err');
              return;
            }

            const initialHtml = prefillHtml || (values.content ? `<p>${App.utils.escapeHtml(values.content).replace(/\n/g, '<br>')}</p>` : '<p></p>');
            const payload = {
              title: values.title.trim(),
              content_html: initialHtml,
              content: values.content || getNotePlainText(initialHtml),
              folder_id: values.folder_id || null,
              priority: values.priority || 'medium',
              tags: [],
              linked_entities: [],
              is_pinned: false,
              is_favorite: false,
              in_trash: false,
            };

            try {
              const created = await App.api.createNote(payload);
              state.notes.unshift(created);
              state.activeNoteId = created.id;
              state.mobileView = 'editor';
              App.ui.close();
              App.utils.toast('Note created');
              drawAllNotesTab();
              drawNavPane();
              drawListPane();
              drawEditorPane();
            } catch (err) {
              App.utils.toast('Could not create note: ' + (err.message || err), 'err');
            }
          },
        },
      ],
    });
  }

  // ---- Modal: Executive Templates Selector ----
  function openTemplatesModal() {
    App.ui.open({
      title: 'Note templates',
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Start from a ready-made structure for investment memos, meeting minutes and reviews.</p>
          <div class="nd-templates">
            ${state.templates.map((tmpl) => {
              const preview = getSnippetText(tmpl.content_html || '', 130);
              return `
                <button type="button" class="nd-tmpl" data-template-id="${App.utils.escapeHtml(tmpl.id)}">
                  <strong>${App.utils.escapeHtml(tmpl.title)}</strong>
                  <span class="n-chip" style="text-transform:capitalize">${App.utils.escapeHtml(tmpl.category || 'General')}</span>
                  ${preview ? `<p>${App.utils.escapeHtml(preview)}</p>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
    });

    App.utils.qsa('[data-template-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const tmplId = card.dataset.templateId;
        const tmpl = state.templates.find((t) => String(t.id) === String(tmplId));
        if (tmpl) {
          App.ui.close();
          createNewNoteModal(tmpl.content_html, tmpl.title);
        }
      });
    });
  }

  // ---- Modal: New Custom Folder ----
  function openFolderModal() {
    const fields = [
      { key: 'name', label: 'Folder Name', required: true, span: 2 },
      {
        key: 'color',
        label: 'Folder Accent Color',
        type: 'select',
        options: [
          { value: '#c9a84c', label: 'Gold (Standard)' },
          { value: '#16c9a3', label: 'Teal (Growth / Equity)' },
          { value: '#4c9be8', label: 'Blue (Corporate / Debt)' },
          { value: '#a06bcf', label: 'Purple (Diligence / Legal)' },
          { value: '#ff6b6b', label: 'Red (High Priority)' },
        ],
        span: 2,
      },
    ];

    App.ui.open({
      title: 'New folder',
      small: true,
      onMount: associateFieldLabels,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Folders group related notes. Deleting a folder never deletes the notes inside it.</p>
          ${App.ui.renderForm(fields, {})}
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Create folder',
          className: 'btn-gold',
          onClick: async () => {
            const { values, errors } = App.ui.readForm(fields);
            if (errors.length) return;
            try {
              const created = await App.api.createNoteFolder({
                name: values.name.trim(),
                color: values.color || '#c9a84c',
              });
              state.folders.push(created);
              App.ui.close();
              App.utils.toast('Folder created');
              drawAllNotesTab();
              drawNavPane();
              drawListPane();
              drawEditorPane();
            } catch (err) {
              App.utils.toast('Could not create folder: ' + (err.message || err), 'err');
            }
          },
        },
      ],
    });
  }

  // ---- Modal: Reminder & Due Date Picker ----
  function openReminderModal(note) {
    const existingDate = note.reminder_at ? new Date(note.reminder_at).toISOString().slice(0, 16) : '';

    const fields = [
      { key: 'reminder_at', label: 'Reminder Date & Time', type: 'datetime-local', value: existingDate, span: 2 },
      {
        key: 'priority',
        label: 'Priority Level',
        type: 'select',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
        value: note.priority || 'medium',
        span: 1,
      },
      {
        key: 'snooze',
        label: 'Quick Schedule',
        type: 'select',
        options: [
          { value: '', label: 'Custom Date' },
          { value: 'tomorrow', label: 'Tomorrow morning (9:00 AM)' },
          { value: 'in_3_days', label: 'In 3 days' },
          { value: 'in_1_week', label: 'In 1 week' },
        ],
        span: 1,
      },
    ];

    App.ui.open({
      title: 'Reminder & review date',
      small: true,
      onMount: associateFieldLabels,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Set a review milestone or deadline for this note.</p>
          ${App.ui.renderForm(fields, { reminder_at: existingDate, priority: note.priority || 'medium' })}
        </div>
      `,
      actions: [
        {
          label: 'Remove reminder',
          className: 'btn-outline',
          onClick: async () => {
            note.reminder_at = null;
            await App.api.updateNote(note.id, { reminder_at: null });
            App.ui.close();
            App.utils.toast('Reminder cleared');
            drawNavPane();
            drawListPane();
            drawEditorPane();
          },
        },
        {
          label: 'Save reminder',
          className: 'btn-gold',
          onClick: async () => {
            const { values } = App.ui.readForm(fields);
            let finalReminderAt = values.reminder_at ? new Date(values.reminder_at).toISOString() : null;

            if (values.snooze === 'tomorrow') {
              const d = new Date();
              d.setDate(d.getDate() + 1);
              d.setHours(9, 0, 0, 0);
              finalReminderAt = d.toISOString();
            } else if (values.snooze === 'in_3_days') {
              const d = new Date();
              d.setDate(d.getDate() + 3);
              d.setHours(9, 0, 0, 0);
              finalReminderAt = d.toISOString();
            } else if (values.snooze === 'in_1_week') {
              const d = new Date();
              d.setDate(d.getDate() + 7);
              d.setHours(9, 0, 0, 0);
              finalReminderAt = d.toISOString();
            }

            note.reminder_at = finalReminderAt;
            note.priority = values.priority || 'medium';
            await App.api.updateNote(note.id, {
              reminder_at: finalReminderAt,
              priority: note.priority,
            });

            App.ui.close();
            App.utils.toast('Reminder saved');
            drawNavPane();
            drawListPane();
            drawEditorPane();
          },
        },
      ],
    });
  }

  // ---- Modal: Manage Tags ----
  function openTagsModal(note) {
    const existingTags = Array.isArray(note.tags) ? note.tags.join(', ') : '';

    const fields = [
      { key: 'tags', label: 'Tags (comma separated)', required: false, value: existingTags, span: 2 },
    ];

    App.ui.open({
      title: 'Manage tags',
      small: true,
      onMount: associateFieldLabels,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Separate tags with commas, for example <code>equity, q3-review, diligence</code>.</p>
          ${App.ui.renderForm(fields, { tags: existingTags })}
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Save tags',
          className: 'btn-gold',
          onClick: async () => {
            const { values } = App.ui.readForm(fields);
            const raw = values.tags || '';
            const parsed = raw
              .split(',')
              .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
              .filter((t) => t.length > 0);

            note.tags = parsed;
            await App.api.updateNote(note.id, { tags: parsed });
            App.ui.close();
            App.utils.toast('Tags updated');
            drawNavPane();
            drawListPane();
            drawEditorPane();
          },
        },
      ],
    });
  }
  // ---- Modal: Link Note to Portfolio Entities ----
  async function openEntityLinkModal(note) {
    App.ui.open({
      title: 'Link a portfolio record',
      small: true,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Connect this note to a record for one-click cross-referencing.</p>
          <div class="nd-stack">
            <div class="field">
              <label for="entityTypePicker">Record type</label>
              <select id="entityTypePicker">
                <option value="deal">Deal / Private Investment</option>
                <option value="recurring">SIP / Recurring Investment</option>
                <option value="gold">Gold Purchase / Holding</option>
                <option value="contact">Contact / Founder</option>
                <option value="document">Document / Contract</option>
                <option value="goal">Financial Goal</option>
              </select>
            </div>
            <div class="field">
              <label for="entityRecordPicker">Record</label>
              <select id="entityRecordPicker">
                <option value="">Loading records...</option>
              </select>
            </div>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Link Entity',
          className: 'btn-gold',
          onClick: async () => {
            const type = App.utils.qs('#entityTypePicker').value;
            const recordSelect = App.utils.qs('#entityRecordPicker');
            const id = recordSelect.value;
            const label = recordSelect.options[recordSelect.selectedIndex]?.text || 'Record';

            if (!id) {
              App.utils.toast('Please choose a record to link', 'err');
              return;
            }

            note.linked_entities = Array.isArray(note.linked_entities) ? note.linked_entities : [];
            if (note.linked_entities.some((e) => e.type === type && String(e.id) === String(id))) {
              App.utils.toast('Already linked to this entity');
              App.ui.close();
              return;
            }

            note.linked_entities.push({ type, id, label });
            await App.api.updateNote(note.id, { linked_entities: note.linked_entities });
            App.ui.close();
            App.utils.toast('Entity linked');
            drawEditorPane();
          },
        },
      ],
    });

    const typeSelect = App.utils.qs('#entityTypePicker');
    const recordSelect = App.utils.qs('#entityRecordPicker');

    async function populateRecords(type) {
      recordSelect.innerHTML = '<option value="">Loading...</option>';
      try {
        let options = [];
        if (type === 'deal') {
          const deals = await App.api.listDeals().catch(() => []);
          options = (deals || []).map((d) => ({ id: d.id, label: `${d.deal_name || 'Deal'} (${d.investment_type || 'Equity'})` }));
        } else if (type === 'recurring') {
          const items = await App.api.listRecurringItems().catch(() => []);
          options = (items || []).map((r) => ({ id: r.id, label: `${r.name || 'SIP'} (${r.frequency || 'Monthly'})` }));
        } else if (type === 'gold') {
          const gold = await App.api.listGoldPurchases().catch(() => []);
          options = (gold || []).map((g) => ({ id: g.id, label: `Gold ${g.metal_type || ''} ${g.weight_grams ? g.weight_grams + 'g' : ''} (${g.purchase_date || ''})` }));
        } else if (type === 'contact') {
          const contacts = await App.api.listContacts().catch(() => []);
          options = (contacts || []).map((c) => ({ id: c.id, label: `${c.name || 'Contact'} ${c.company ? '(' + c.company + ')' : ''}` }));
        } else if (type === 'document') {
          const docs = await App.api.listDocuments().catch(() => []);
          options = (docs || []).map((doc) => ({ id: doc.id, label: doc.name || 'Document' }));
        } else if (type === 'goal') {
          const goals = await App.api.listGoals().catch(() => []);
          options = (goals || []).map((g) => ({ id: g.id, label: g.name || 'Goal' }));
        }

        if (options.length === 0) {
          recordSelect.innerHTML = '<option value="">No existing records found</option>';
        } else {
          recordSelect.innerHTML = options.map((opt) => `<option value="${opt.id}">${App.utils.escapeHtml(opt.label)}</option>`).join('');
        }
      } catch (e) {
        recordSelect.innerHTML = '<option value="">Failed to load records</option>';
      }
    }

    typeSelect?.addEventListener('change', () => populateRecords(typeSelect.value));
    populateRecords('deal');
  }

  // ---- Modal: Version History Snapshots ----
  async function openVersionHistoryModal(note, editor, onRestore) {
    let history = [];
    try {
      history = await App.api.listNoteHistory(note.id).catch(() => []);
    } catch (e) {
      history = [];
    }

    App.ui.open({
      title: 'Version history',
      small: true,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Browse earlier snapshots of this note and restore one with a click.</p>
          <div class="nd-list">
            ${history.length === 0 ? `
              <div class="nd-empty">No snapshots yet. They are created automatically while you edit.</div>
            ` : history.map((ver, idx) => `
              <div class="nd-row">
                <div>
                  <strong>Version ${ver.version || (history.length - idx)}</strong>
                  <small>${new Date(ver.created_at).toLocaleString()} &middot; ${ver.word_count || 0} words</small>
                </div>
                <button type="button" class="btn btn-outline btn-sm" data-restore-ver="${idx}">Restore</button>
              </div>
            `).join('')}
          </div>
        </div>
      `,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
    });

    App.utils.qsa('[data-restore-ver]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.restoreVer);
        const ver = history[idx];
        if (!ver) return;

        if (!confirm('Restore this snapshot? Current unsaved edits will be superseded.')) return;

        const restoredHtml = ver.content_html || ver.content || '';
        editor.innerHTML = restoredHtml;
        if (ver.title) {
          const tInput = App.utils.qs('#noteTitleInput');
          if (tInput) tInput.value = ver.title;
        }

        onRestore();
        App.ui.close();
        App.utils.toast('Restored snapshot successfully');
      });
    });
  }

  // ---- Modal: AI Knowledge Assistant (Summarize, Polish, Extract Actions, Risk) ----
  function openAiAssistModal(note, editor, onApply) {
    const rawContent = editor.innerText || note.content || '';

    if (!rawContent.trim()) {
      App.utils.toast('The note is empty. Add content before using AI Assist.', 'err');
      return;
    }

    App.ui.open({
      title: 'AI assistant',
      small: true,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Choose what the assistant should do with this note. You can review the result before applying it.</p>
          <div class="nd-options nd-options--grid">
            <button type="button" class="nd-option" id="aiActionSummarize">
              <span class="nd-option-ic">${ic('file')}</span>
              <span class="nd-option-t"><strong>Executive summary</strong><small>Condense into key takeaways</small></span>
            </button>
            <button type="button" class="nd-option" id="aiActionTasks">
              <span class="nd-option-ic">${ic('checksq')}</span>
              <span class="nd-option-t"><strong>Extract action items</strong><small>Turn decisions into a checklist</small></span>
            </button>
            <button type="button" class="nd-option" id="aiActionPolish">
              <span class="nd-option-ic">${ic('sparkles')}</span>
              <span class="nd-option-t"><strong>Polish &amp; format</strong><small>Clean headings, tone and grammar</small></span>
            </button>
            <button type="button" class="nd-option" id="aiActionTitle">
              <span class="nd-option-ic">${ic('tag')}</span>
              <span class="nd-option-t"><strong>Suggest a title</strong><small>A clear 3 to 7 word heading</small></span>
            </button>
            <button type="button" class="nd-option nd-option--wide" id="aiActionRisk">
              <span class="nd-option-ic">${ic('alert')}</span>
              <span class="nd-option-t"><strong>Risk &amp; catalyst analysis</strong><small>Downside risks, legal or debt flags, and return catalysts</small></span>
            </button>
          </div>
          <div id="aiAssistPreviewArea" class="nd-output" style="display:none" aria-live="polite">
            <div class="nd-output-head">
              <span>Generated output</span>
              <span id="aiAssistTokens"></span>
            </div>
            <div id="aiAssistPreviewContent"></div>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Apply to note',
          className: 'btn-gold',
          id: 'aiAssistApplyBtn',
          onClick: () => {
            const preview = App.utils.qs('#aiAssistPreviewContent');
            if (!preview || !preview.dataset.result) {
              App.utils.toast('Please run an AI action first', 'err');
              return;
            }
            const mode = preview.dataset.mode;
            const res = preview.dataset.result;

            if (mode === 'title') {
              const tInput = App.utils.qs('#noteTitleInput');
              if (tInput) tInput.value = res.replace(/["']/g, '').trim();
            } else if (mode === 'append') {
              editor.innerHTML += `<hr>${res}`;
            } else if (mode === 'replace') {
              editor.innerHTML = res;
            }

            onApply();
            App.ui.close();
            App.utils.toast('AI improvements applied to note');
          },
        },
      ],
    });

    async function executeAiPrompt(promptText, mode) {
      const previewArea = App.utils.qs('#aiAssistPreviewArea');
      const previewContent = App.utils.qs('#aiAssistPreviewContent');
      const tokenInfo = App.utils.qs('#aiAssistTokens');
      if (!previewArea || !previewContent) return;

      previewArea.style.display = 'block';
      if (tokenInfo) tokenInfo.textContent = 'Generating...';
      previewContent.innerHTML = `<div class="nd-status">${ic('sparkles')} Generating a response...</div>`;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `You are an executive knowledge assistant for an investment and portfolio OS. Given the following note content:\n\n${rawContent}\n\nTask: ${promptText}\n\nFormat the output cleanly. If returning HTML, use clean tags (h2, h3, p, ul, li, strong, blockquote). If action items, wrap in <div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">item</div></div>. Do not include markdown code block backticks.`,
              },
            ],
          }),
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || `AI request failed with status ${response.status}`);
        }

        const text = data.reply || data.text || data.message || (data.candidates && data.candidates[0]?.content?.parts[0]?.text) || '';
        if (!text) throw new Error('AI returned an empty response. Please retry.');

        if (tokenInfo) tokenInfo.textContent = data.model || 'Gemini';

        // Clean any stray backticks
        const clean = text.replace(/^```html\s*/i, '').replace(/```$/i, '').trim();
        previewContent.dataset.result = clean;
        previewContent.dataset.mode = mode;
        previewContent.innerHTML = clean;
      } catch (err) {
        if (tokenInfo) tokenInfo.textContent = 'Failed';
        previewContent.innerHTML = `<div class="nd-error">${ic('alert')} AI generation failed: ${App.utils.escapeHtml(err.message || String(err))}</div><div style="font-size:12px;color:var(--text2);margin-top:4px">Please retry or choose another capability.</div>`;
      }
    }

    App.utils.qs('#aiActionSummarize')?.addEventListener('click', () => {
      executeAiPrompt('Provide a 3-4 bullet executive summary of this note.', 'append');
    });

    App.utils.qs('#aiActionTasks')?.addEventListener('click', () => {
      executeAiPrompt('Extract all concrete action items, decisions, and follow-ups as checklist tasks.', 'append');
    });

    App.utils.qs('#aiActionPolish')?.addEventListener('click', () => {
      executeAiPrompt('Rewrite and format this into an executive investment memo with polished grammar and clean typography.', 'replace');
    });

    App.utils.qs('#aiActionTitle')?.addEventListener('click', () => {
      executeAiPrompt('Suggest a crisp, high-signal 3 to 7 word title for this note.', 'title');
    });

    App.utils.qs('#aiActionRisk')?.addEventListener('click', () => {
      executeAiPrompt('Analyze and summarize the key downside risks, regulatory/debt vulnerabilities, and upside return catalysts present in this note.', 'append');
    });
  }

  // ---- Modal: Single Note Export ----
  function openSingleNoteExport(note) {
    App.ui.open({
      title: 'Export note',
      small: true,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Choose a format for &ldquo;${App.utils.escapeHtml(note.title || 'Untitled Note')}&rdquo;.</p>
          <div class="nd-options">
            <button type="button" class="nd-option" id="exportMdBtn">
              <span class="nd-option-ic">${ic('text')}</span>
              <span class="nd-option-t"><strong>Markdown (.md)</strong><small>Works with Obsidian, Notion and most editors</small></span>
            </button>
            <button type="button" class="nd-option" id="exportHtmlBtn">
              <span class="nd-option-ic">${ic('html')}</span>
              <span class="nd-option-t"><strong>Clean HTML (.html)</strong><small>A standalone web document</small></span>
            </button>
            <button type="button" class="nd-option" id="exportTxtBtn">
              <span class="nd-option-ic">${ic('file')}</span>
              <span class="nd-option-t"><strong>Plain text (.txt)</strong><small>Unformatted text only</small></span>
            </button>
            <button type="button" class="nd-option" id="exportJsonBtn">
              <span class="nd-option-ic">${ic('json')}</span>
              <span class="nd-option-t"><strong>Raw JSON (.json)</strong><small>Full metadata and linked records</small></span>
            </button>
          </div>
        </div>
      `,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
    });

    const filenameBase = (note.title || 'note').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40);

    App.utils.qs('#exportMdBtn')?.addEventListener('click', () => {
      const md = App.notesEditor ? App.notesEditor.htmlToMarkdown(note.content_html || note.content || '') : (note.content || '');
      const content = `# ${note.title || 'Untitled Note'}\n\n*Created: ${new Date(note.created_at).toLocaleString()}*\n\n${md}`;
      downloadBlob(new Blob([content], { type: 'text/markdown' }), `${filenameBase}.md`);
      App.ui.close();
    });

    App.utils.qs('#exportHtmlBtn')?.addEventListener('click', () => {
      const content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${App.utils.escapeHtml(note.title || 'Note')}</title><style>body{font-family:sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}blockquote{border-left:3px solid #c9a84c;padding-left:14px;color:#555}</style></head><body><h1>${App.utils.escapeHtml(note.title || 'Untitled')}</h1>${note.content_html || note.content || ''}</body></html>`;
      downloadBlob(new Blob([content], { type: 'text/html' }), `${filenameBase}.html`);
      App.ui.close();
    });

    App.utils.qs('#exportTxtBtn')?.addEventListener('click', () => {
      const text = `${note.title || 'Untitled'}\n${'='.repeat((note.title || 'Untitled').length)}\n\n${getNotePlainText(note.content_html || note.content || '')}`;
      downloadBlob(new Blob([text], { type: 'text/plain' }), `${filenameBase}.txt`);
      App.ui.close();
    });

    App.utils.qs('#exportJsonBtn')?.addEventListener('click', () => {
      downloadBlob(new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' }), `${filenameBase}.json`);
      App.ui.close();
    });
  }

  // ---- Modal: Bulk / All Notes Export ----
  function openExportModal() {
    App.ui.open({
      title: 'Export notes',
      small: true,
      bodyHtml: `
        <div class="notes-dlg">
          <p class="nd-lead">Export all ${state.notes.length} notes from your Investment OS.</p>
          <div class="nd-options">
            <button type="button" class="nd-option" id="exportAllJsonBtn">
              <span class="nd-option-ic">${ic('json')}</span>
              <span class="nd-option-t"><strong>Complete backup (.json)</strong><small>All notes, folders and links</small></span>
            </button>
            <button type="button" class="nd-option" id="exportAllMarkdownZipBtn">
              <span class="nd-option-ic">${ic('text')}</span>
              <span class="nd-option-t"><strong>Markdown bundle (.json archive)</strong><small>Each note converted to Markdown</small></span>
            </button>
            <button type="button" class="nd-option" id="exportSystemSectionBtn">
              <span class="nd-option-ic">${ic('download')}</span>
              <span class="nd-option-t"><strong>Investment OS export (.xlsx / .csv)</strong><small>The system-wide backup module</small></span>
            </button>
          </div>
        </div>
      `,
      actions: [{ label: 'Close', className: 'btn-outline', onClick: App.ui.close }],
    });

    App.utils.qs('#exportAllJsonBtn')?.addEventListener('click', () => {
      const payload = {
        exported_at: new Date().toISOString(),
        total_notes: state.notes.length,
        folders: state.folders,
        notes: state.notes,
      };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `investment_os_notes_${new Date().toISOString().slice(0, 10)}.json`);
      App.ui.close();
      App.utils.toast('Notes backup downloaded');
    });

    App.utils.qs('#exportAllMarkdownZipBtn')?.addEventListener('click', () => {
      const bundle = state.notes.map((n) => ({
        id: n.id,
        title: n.title,
        folder: state.folders.find((f) => String(f.id) === String(n.folder_id))?.name || 'Unorganized',
        tags: n.tags || [],
        markdown: `# ${n.title}\n\n${App.notesEditor ? App.notesEditor.htmlToMarkdown(n.content_html || n.content || '') : n.content || ''}`,
      }));
      downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), `notes_markdown_bundle_${new Date().toISOString().slice(0, 10)}.json`);
      App.ui.close();
      App.utils.toast('Markdown bundle downloaded');
    });

    App.utils.qs('#exportSystemSectionBtn')?.addEventListener('click', async () => {
      App.ui.close();
      try {
        if (App.exportData && App.exportData.exportSection) {
          await App.exportData.exportSection('notes');
        } else {
          App.utils.toast('System export module unavailable');
        }
      } catch (err) {
        App.utils.toast('Export failed: ' + (err.message || err), 'err');
      }
    });
  }

  // ---- Helper: Download Blob File ----
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- Backward Compatibility Fallback Wrapper ----
  function openNoteModal(existing) {
    if (existing && existing.id) {
      state.activeNoteId = existing.id;
      state.mobileView = 'editor';
      drawListPane();
      drawEditorPane();
    } else {
      createNewNoteModal();
    }
  }

  // Register with Global Router & App Namespace
  App.router.register('notes', renderNotesView);
  App.notes = {
    render: renderNotesView,
    openNoteModal,
    createNewNoteModal,
  };
})();
