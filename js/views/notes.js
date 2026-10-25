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
        if (b.dataset.notesTab === 'workspace') b.classList.add('active');
        else b.classList.remove('active');
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

    await loadNotesData();

    const activeCount = state.notes.filter((n) => !n.in_trash).length;

    pane.innerHTML = `
      <div class="notes-hub-container">
        <!-- Hub Top Header -->
        <div class="notes-hub-header">
          <div class="notes-hub-title">
            <h1>Notes & Knowledge Hub</h1>
            <span class="notes-badge">Executive PKM</span>
          </div>
          <div class="notes-hub-actions">
            <button class="btn btn-outline btn-sm" id="notesExportAllBtn" title="Export Notes (Markdown / JSON / CSV)">
              <span>&#8595;</span> Export
            </button>
            <button class="btn btn-outline btn-sm" id="notesTemplatesBtn" title="New Note from Executive Template">
              <span>&#9881;</span> Templates
            </button>
            <button class="btn btn-gold btn-sm" id="notesNewNoteTopBtn" title="Create New Note">
              <span>+</span> New Note
            </button>
          </div>
        </div>

        <!-- Main Tab Switcher: All Notes vs 3-Pane Workspace -->
        <div class="tabbar notes-main-tabs" id="notesMainTabs">
          <button class="tab-btn ${state.activeTab === 'all_notes' ? 'active' : ''}" data-notes-tab="all_notes">
            <span>&#128196;</span> All Notes (<span id="allNotesTabCount">${activeCount}</span>)
          </button>
          <button class="tab-btn ${state.activeTab === 'workspace' ? 'active' : ''}" data-notes-tab="workspace">
            <span>&#128450;</span> 3-Pane Workspace
          </button>
        </div>

        <!-- Tab 1: Simple All Notes Directory -->
        <div id="notesTabAllNotes" class="notes-tab-content" style="${state.activeTab === 'all_notes' ? '' : 'display:none'}"></div>

        <!-- Tab 2: 3-Pane Executive Workspace -->
        <div id="notesTabWorkspace" class="notes-tab-content" style="${state.activeTab === 'workspace' ? '' : 'display:none'}">
          <div class="notes-workspace-3pane" id="notesWorkspace" data-mobile-view="${state.mobileView}">
            <!-- Pane 1: Navigation Sidebar (Folders, Tags, Smart Views, Metrics) -->
            <div class="notes-nav-pane" id="notesNavPane"></div>

            <!-- Pane 2: Notes List & Search (Supports List and Folder View) -->
            <div class="notes-list-pane" id="notesListPane"></div>

            <!-- Pane 3: Active Rich-Text Note Editor -->
            <div class="notes-editor-pane" id="notesEditorPane"></div>
          </div>
        </div>
      </div>
    `;

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

        App.utils.qsa('[data-notes-tab]', pane).forEach((b) => b.classList.remove('active'));
        tabBtn.classList.add('active');

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

    // Keyboard shortcut: Ctrl/Cmd + Shift + N for quick capture
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        const paneActive = App.utils.qs('#pane-notes.active');
        if (paneActive) {
          e.preventDefault();
          createNewNoteModal();
        }
      }
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

    // Build Folder Select Options
    const folderOptionsHtml = `
      <option value="all" ${state.allNotesFolder === 'all' ? 'selected' : ''}>📁 All Folders (${allActive.length})</option>
      <option value="unorganized" ${state.allNotesFolder === 'unorganized' ? 'selected' : ''}>📁 Unorganized (${allActive.filter((n) => !n.folder_id).length})</option>
      ${state.folders.map((f) => {
        const count = allActive.filter((n) => String(n.folder_id) === String(f.id)).length;
        return `<option value="${f.id}" ${String(state.allNotesFolder) === String(f.id) ? 'selected' : ''}>📁 ${App.utils.escapeHtml(f.name)} (${count})</option>`;
      }).join('')}
    `;

    // Render Grid vs ALV Table
    let contentHtml = '';
    if (filtered.length === 0) {
      contentHtml = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:36px;margin-bottom:12px;opacity:0.6">&#128196;</div>
          <h3 style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px">No Records Found</h3>
          <p style="font-size:12.5px;color:var(--text3);max-width:340px;margin-bottom:16px">
            ${state.allNotesSearch ? `No notes matched "${App.utils.escapeHtml(state.allNotesSearch)}". Try a different search query or reset filters.` : 'Your personal knowledge repository is ready. Create a note or pick an executive template.'}
          </p>
          <div style="display:flex;gap:8px">
            <button class="alv-new-btn" id="simpleEmptyNewBtn"><span>+</span><span>New Note</span></button>
            ${state.allNotesSearch || state.allNotesFilter !== 'all' || state.allNotesFolder !== 'all' ? `
              <button class="btn btn-outline btn-sm" id="simpleResetFiltersBtn">Reset Filters</button>
            ` : ''}
          </div>
        </div>
      `;
    } else if (state.allNotesView === 'grid') {
      contentHtml = `
        <div class="notes-simple-grid">
          ${filtered.map((n) => renderSimpleNoteCard(n)).join('')}
        </div>
      `;
    } else {
      contentHtml = `
        <div class="alv-grid-wrapper">
          <div class="alv-table-scroll">
            <table class="alv-table">
              <thead>
                <tr>
                  <th style="width:36px;text-align:center">#</th>
                  <th style="width:44px;text-align:center">Flag</th>
                  <th style="min-width:240px">Title & Outline</th>
                  <th style="width:140px">Folder</th>
                  <th style="width:110px">Checklist</th>
                  <th style="width:140px">Portfolio Entity</th>
                  <th style="width:110px">Tags</th>
                  <th style="width:110px">Due Date</th>
                  <th style="width:100px">Modified</th>
                  <th style="width:140px;text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map((n, idx) => renderAlvTableRow(n, idx + 1)).join('')}
              </tbody>
            </table>
          </div>
          <div class="alv-status-footer">
            <span>Showing <strong>${filtered.length}</strong> of <strong>${allActive.length}</strong> records</span>
            <span>Filter: <strong>${state.allNotesFilter.toUpperCase()}</strong> · Folder: <strong>${state.allNotesFolder === 'all' ? 'ALL' : state.allNotesFolder}</strong></span>
            <span>Mode: <strong>Excel ALV Grid</strong></span>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="alv-container">
        <!-- 1. Sequential Metrics Ribbon (Excel Status / KPI Bar in exact horizontal sequence) -->
        <div class="alv-metrics-ribbon">
          <div class="alv-metric-item ${state.allNotesFilter === 'all' && state.allNotesFolder === 'all' ? 'active' : ''}" data-kpi-filter="all" title="View all active notes">
            <span class="alv-metric-icon">&#128196;</span>
            <span class="alv-metric-value">${allActive.length}</span>
            <span class="alv-metric-label">All Active Notes</span>
          </div>
          <div class="alv-metric-item ${state.allNotesFilter === 'pinned' ? 'active' : ''}" data-kpi-filter="pinned" title="View pinned notes">
            <span class="alv-metric-icon">&#128204;</span>
            <span class="alv-metric-value">${pinnedCount}</span>
            <span class="alv-metric-label">Pinned Memos</span>
          </div>
          <div class="alv-metric-item ${state.allNotesFilter === 'favorites' ? 'active' : ''}" data-kpi-filter="favorites" title="View starred notes">
            <span class="alv-metric-icon">&#9733;</span>
            <span class="alv-metric-value">${favCount}</span>
            <span class="alv-metric-label">Starred Notes</span>
          </div>
          <div class="alv-metric-item ${state.allNotesFilter === 'reminders' ? 'active' : ''}" data-kpi-filter="reminders" title="View due & scheduled notes">
            <span class="alv-metric-icon">&#9200;</span>
            <span class="alv-metric-value">${reminderCount}</span>
            <span class="alv-metric-label">Due & Reminders</span>
          </div>
          <div class="alv-metric-item" id="kpiManageFoldersBtn" title="Manage Custom Folders">
            <span class="alv-metric-icon">&#128194;</span>
            <span class="alv-metric-value">${state.folders.length}</span>
            <span class="alv-metric-label">Folders Configured</span>
          </div>
        </div>

        <!-- 2. ALV Command Ribbon (Toolbar) -->
        <div class="alv-toolbar">
          <div class="alv-toolbar-left">
            <div class="alv-search-box">
              <span class="alv-search-icon">&#128269;</span>
              <input type="text" id="simpleSearchInput" placeholder="Search notes, text, #tag..." value="${App.utils.escapeHtml(state.allNotesSearch)}">
            </div>

            <select id="simpleFolderSelect" class="alv-select">
              ${folderOptionsHtml}
            </select>

            <div class="alv-segmented-group">
              <button class="alv-seg-btn ${state.allNotesFilter === 'all' ? 'active' : ''}" data-pill-filter="all">All</button>
              <button class="alv-seg-btn ${state.allNotesFilter === 'pinned' ? 'active' : ''}" data-pill-filter="pinned">&#128204; Pinned</button>
              <button class="alv-seg-btn ${state.allNotesFilter === 'favorites' ? 'active' : ''}" data-pill-filter="favorites">&#9733; Starred</button>
              <button class="alv-seg-btn ${state.allNotesFilter === 'reminders' ? 'active' : ''}" data-pill-filter="reminders">&#9200; Due</button>
              <button class="alv-seg-btn ${state.allNotesFilter === 'trash' ? 'active' : ''}" data-pill-filter="trash" style="${trashCount > 0 ? 'color:var(--red)' : ''}">&#128465; Trash (${trashCount})</button>
            </div>
          </div>

          <div class="alv-toolbar-right">
            <select id="simpleSortSelect" class="alv-select">
              <option value="updated_desc" ${state.allNotesSort === 'updated_desc' ? 'selected' : ''}>Recently Updated</option>
              <option value="created_desc" ${state.allNotesSort === 'created_desc' ? 'selected' : ''}>Date Created</option>
              <option value="title_asc" ${state.allNotesSort === 'title_asc' ? 'selected' : ''}>Title (A-Z)</option>
              <option value="priority_desc" ${state.allNotesSort === 'priority_desc' ? 'selected' : ''}>Priority (High-Low)</option>
            </select>

            <div class="alv-segmented-group">
              <button class="alv-seg-btn ${state.allNotesView === 'table' ? 'active' : ''}" id="switchViewTableBtn" title="Excel ALV Grid Table view">&#9776; ALV Grid</button>
              <button class="alv-seg-btn ${state.allNotesView === 'grid' ? 'active' : ''}" id="switchViewGridBtn" title="Cards view">&#8862; Cards</button>
            </div>

            <button class="alv-new-btn" id="simpleNewNoteBtn" title="Create New Note">
              <span>+</span><span>New Note</span>
            </button>
          </div>
        </div>

        <!-- 3. ALV Content Area -->
        ${contentHtml}
      </div>
    `;

    bindAllNotesEvents(container);

    // Update count in tab header
    const tabCountEl = App.utils.qs('#allNotesTabCount');
    if (tabCountEl) tabCountEl.textContent = allActive.length;
  }

  // ---- Render Simple Note Card ----
  function renderSimpleNoteCard(n) {
    const folder = state.folders.find((f) => String(f.id) === String(n.folder_id));
    const folderColor = folder?.color || 'var(--gold)';
    const folderName = folder?.name || 'Unorganized';
    const snippet = getNotePlainText(n.content_html || n.content || '').slice(0, 160);
    const stats = getNoteStats(n.content_html || n.content || '');
    const isOverdue = n.reminder_at && new Date(n.reminder_at) < new Date();
    const taskStats = getChecklistStats(n.content_html || '');

    return `
      <div class="notes-simple-card ${n.is_pinned ? 'pinned' : ''}" data-note-id="${n.id}">
        <!-- Top Row: Folder, Priority, Pin/Star Toggles -->
        <div class="notes-simple-card-header">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="notes-simple-card-folder">
              <span class="notes-folder-dot" style="background:${folderColor}"></span>
              ${App.utils.escapeHtml(folderName)}
            </span>
            ${n.priority && n.priority !== 'medium' ? `
              <span class="badge ${n.priority === 'high' ? 'badge-red' : 'badge-teal'}" style="font-size:9.5px;padding:1px 5px">
                ${n.priority.toUpperCase()}
              </span>
            ` : ''}
          </div>
          <div class="notes-simple-card-toggles">
            <button class="notes-icon-toggle-btn ${n.is_pinned ? 'active' : ''}" data-simple-pin="${n.id}" title="${n.is_pinned ? 'Unpin' : 'Pin to top'}">
              ${n.is_pinned ? '&#128204;' : '&#9675;'}
            </button>
            <button class="notes-icon-toggle-btn ${n.is_favorite ? 'active' : ''}" data-simple-fav="${n.id}" title="${n.is_favorite ? 'Remove star' : 'Star note'}">
              ${n.is_favorite ? '&#9733;' : '&#9734;'}
            </button>
          </div>
        </div>

        <!-- Note Title & Excerpt -->
        <div>
          <h3 class="notes-simple-card-title" data-simple-view="${n.id}" title="Click to view note">
            ${App.utils.escapeHtml(n.title || 'Untitled Note')}
          </h3>
          <div class="notes-simple-card-snippet" style="margin-top:6px" data-simple-view="${n.id}">
            ${App.utils.escapeHtml(snippet) || '<span style="color:var(--text3);font-style:italic">Empty note...</span>'}
          </div>
        </div>

        <!-- Checklist progress preview if tasks exist -->
        ${taskStats ? `
          <div style="background:var(--fill-1);border-radius:4px;padding:5px 8px;font-size:11px;display:flex;align-items:center;justify-content:space-between;color:var(--text2);border:1px solid var(--border2)">
            <span style="display:flex;align-items:center;gap:4px">
              <span style="color:var(--gold)">&#9745;</span>
              <span>Tasks: <strong>${taskStats.checked}/${taskStats.total}</strong></span>
            </span>
            <span style="font-weight:600;color:${taskStats.pct === 100 ? 'var(--teal)' : 'var(--gold)'}">${taskStats.pct}%</span>
          </div>
        ` : ''}

        <!-- Linked Entities & Tags -->
        <div style="display:flex;flex-direction:column;gap:6px">
          ${Array.isArray(n.linked_entities) && n.linked_entities.length > 0 ? `
            <div class="notes-simple-card-entities">
              ${n.linked_entities.slice(0, 3).map((ent) => `
                <span class="alv-entity-tag" data-entity-type="${ent.type}" data-entity-id="${ent.id}" title="Open ${App.utils.escapeHtml(ent.label || '')}">
                  <strong>[${App.utils.escapeHtml(ent.type.toUpperCase())}]</strong>
                  <span>${App.utils.escapeHtml(ent.label || 'Entity')}</span>
                </span>
              `).join('')}
              ${n.linked_entities.length > 3 ? `<span style="font-size:10px;color:var(--text3)">+${n.linked_entities.length - 3}</span>` : ''}
            </div>
          ` : ''}

          ${Array.isArray(n.tags) && n.tags.length > 0 ? `
            <div class="notes-simple-card-tags">
              ${n.tags.slice(0, 4).map((t) => `<span class="notes-simple-tag">#${App.utils.escapeHtml(t)}</span>`).join('')}
              ${n.tags.length > 4 ? `<span style="font-size:10px;color:var(--text3)">+${n.tags.length - 4}</span>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Card Meta Info -->
        <div class="notes-simple-card-meta">
          <span>${formatRelativeDate(n.updated_at || n.created_at)}</span>
          <span>·</span>
          <span>${stats.words} words</span>
          ${n.reminder_at ? `
            <span>·</span>
            <span style="color:${isOverdue ? 'var(--red)' : 'var(--teal)'};font-weight:600" title="Due ${new Date(n.reminder_at).toLocaleString()}">
              &#9200; ${isOverdue ? 'Overdue' : 'Due ' + new Date(n.reminder_at).toLocaleDateString()}
            </span>
          ` : ''}
        </div>

        <!-- Differentiated Action Buttons -->
        <div class="notes-simple-card-actions">
          <div class="notes-simple-card-btns">
            <button class="notes-simple-btn" data-simple-view="${n.id}" title="View note">
              <span>&#128065;</span> View
            </button>
            <button class="notes-simple-btn btn-gold-subtle" data-simple-edit="${n.id}" title="Edit note directly">
              <span>&#9998;</span> Edit
            </button>
            <button class="notes-simple-btn" data-simple-studio="${n.id}" title="Open in 3-Pane Workspace">
              <span>&#128450;</span> Studio
            </button>
          </div>
          <div>
            <button class="notes-simple-btn btn-del-subtle" data-simple-del="${n.id}" title="${n.in_trash ? 'Delete Permanently' : 'Move to Trash'}">
              &#128465;
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Render Excel ALV Table Row ----
  function renderAlvTableRow(n, index) {
    const folder = state.folders.find((f) => String(f.id) === String(n.folder_id));
    const folderColor = folder?.color || 'var(--gold)';
    const folderName = folder?.name || 'Unorganized';
    const snippet = getNotePlainText(n.content_html || n.content || '').slice(0, 90);
    const isOverdue = n.reminder_at && new Date(n.reminder_at) < new Date();
    const taskStats = getChecklistStats(n.content_html || '');

    return `
      <tr data-note-id="${n.id}">
        <td class="alv-cell-index">${index}</td>
        <td class="alv-cell-status">
          <div style="display:flex;align-items:center;justify-content:center;gap:3px">
            <span data-simple-pin="${n.id}" style="cursor:pointer;color:${n.is_pinned ? 'var(--gold)' : 'var(--text3)'};font-size:11px" title="${n.is_pinned ? 'Unpin' : 'Pin to top'}">&#128204;</span>
            <span data-simple-fav="${n.id}" style="cursor:pointer;color:${n.is_favorite ? 'var(--gold)' : 'var(--text3)'};font-size:11px" title="${n.is_favorite ? 'Starred' : 'Star note'}">${n.is_favorite ? '&#9733;' : '&#9734;'}</span>
          </div>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="alv-cell-title" data-simple-view="${n.id}">${App.utils.escapeHtml(n.title || 'Untitled Note')}</span>
              ${n.priority && n.priority !== 'medium' ? `<span class="badge ${n.priority === 'high' ? 'badge-red' : 'badge-teal'}" style="font-size:9px;padding:1px 4px">${n.priority.toUpperCase()}</span>` : ''}
            </div>
            <div class="alv-cell-snippet">${App.utils.escapeHtml(snippet) || '<span style="color:var(--text3);font-style:italic">Empty note...</span>'}</div>
          </div>
        </td>
        <td>
          <span class="alv-folder-tag">
            <span class="notes-folder-dot" style="background:${folderColor}"></span>
            ${App.utils.escapeHtml(folderName)}
          </span>
        </td>
        <td>
          ${taskStats ? `<span class="alv-task-badge">&#9745; ${taskStats.checked}/${taskStats.total}</span>` : '<span style="color:var(--text3);font-size:11px">—</span>'}
        </td>
        <td>
          ${Array.isArray(n.linked_entities) && n.linked_entities.length > 0 ? `
            <div style="display:flex;flex-wrap:wrap;gap:3px">
              ${n.linked_entities.slice(0, 2).map((ent) => `<span class="alv-entity-tag" data-entity-type="${ent.type}" data-entity-id="${ent.id}" title="Open ${App.utils.escapeHtml(ent.label || '')}">[${App.utils.escapeHtml(ent.type.toUpperCase())}] ${App.utils.escapeHtml(ent.label || '')}</span>`).join('')}
              ${n.linked_entities.length > 2 ? `<span style="font-size:10px;color:var(--text3)">+${n.linked_entities.length - 2}</span>` : ''}
            </div>
          ` : '<span style="color:var(--text3);font-size:11px">—</span>'}
        </td>
        <td>
          ${Array.isArray(n.tags) && n.tags.length > 0 ? `
            <div style="display:flex;flex-wrap:wrap;gap:3px">
              ${n.tags.slice(0, 2).map((t) => `<span class="notes-simple-tag">#${App.utils.escapeHtml(t)}</span>`).join('')}
            </div>
          ` : '<span style="color:var(--text3);font-size:11px">—</span>'}
        </td>
        <td style="white-space:nowrap">
          ${n.reminder_at ? `
            <span style="font-size:11px;color:${isOverdue ? 'var(--red)' : 'var(--teal)'};font-weight:600">
              ${isOverdue ? 'Overdue' : new Date(n.reminder_at).toLocaleDateString()}
            </span>
          ` : '<span style="color:var(--text3);font-size:11px">—</span>'}
        </td>
        <td style="font-size:11px;color:var(--text3);white-space:nowrap">
          ${formatRelativeDate(n.updated_at || n.created_at)}
        </td>
        <td style="text-align:right;white-space:nowrap">
          <div style="display:inline-flex;align-items:center;gap:3px">
            <button class="alv-action-btn" data-simple-view="${n.id}" title="View">👁 View</button>
            <button class="alv-action-btn edit-btn" data-simple-edit="${n.id}" title="Edit">✎ Edit</button>
            <button class="alv-action-btn" data-simple-studio="${n.id}" title="Open in 3-Pane">🗂</button>
            <button class="alv-action-btn del-btn" data-simple-del="${n.id}" title="${n.in_trash ? 'Delete Permanently' : 'Move to Trash'}">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }

  // ---- Bind All Notes Directory Events ----
  function bindAllNotesEvents(container) {
    // KPI card clicks
    App.utils.qsa('[data-kpi-filter]', container).forEach((card) => {
      card.addEventListener('click', () => {
        const f = card.dataset.kpiFilter;
        state.allNotesFilter = f;
        state.allNotesFolder = 'all';
        drawAllNotesTab();
      });
    });

    // KPI Manage Folders button
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
    App.utils.qs('#simpleNewNoteBtn', container)?.addEventListener('click', () => createNewNoteModal());
    App.utils.qs('#simpleEmptyNewBtn', container)?.addEventListener('click', () => createNewNoteModal());
    App.utils.qs('#simpleResetFiltersBtn', container)?.addEventListener('click', () => {
      state.allNotesSearch = '';
      state.allNotesFilter = 'all';
      state.allNotesFolder = 'all';
      drawAllNotesTab();
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
    const folder = state.folders.find((f) => String(f.id) === String(note.folder_id));
    const folderColor = folder?.color || 'var(--gold)';
    const folderName = folder?.name || 'Unorganized';
    const initialHtml = note.content_html || (note.content ? App.utils.escapeHtml(note.content).replace(/\n/g, '<br>') : '<p style="color:var(--text3);font-style:italic">Empty note</p>');
    const stats = getNoteStats(initialHtml);

    App.ui.open({
      title: note.title || 'Untitled Note',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:14px;max-height:70vh;overflow-y:auto;padding-right:4px">
          <!-- Metadata Bar -->
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--border2);font-size:12px;color:var(--text2)">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="notes-simple-card-folder">
                <span class="notes-folder-dot" style="background:${folderColor}"></span>
                ${App.utils.escapeHtml(folderName)}
              </span>
              ${note.priority && note.priority !== 'medium' ? `<span class="badge ${note.priority === 'high' ? 'badge-red' : 'badge-teal'}" style="font-size:10px;padding:2px 6px">${note.priority.toUpperCase()}</span>` : ''}
              ${note.is_pinned ? '<span title="Pinned" style="color:var(--gold)">&#128204; Pinned</span>' : ''}
              ${note.is_favorite ? '<span title="Favorite" style="color:var(--gold)">&#9733; Starred</span>' : ''}
            </div>
            <div style="font-size:11.5px;color:var(--text3)">
              <span>${stats.words} words</span> · <span>${stats.readingTimeMinutes} min read</span> · <span>Updated ${formatRelativeDate(note.updated_at || note.created_at)}</span>
            </div>
          </div>

          <!-- Note Content Body -->
          <div id="simpleViewBody" class="notes-content-editable" style="min-height:120px;line-height:1.7;color:var(--text);font-size:14px">
            ${initialHtml}
          </div>

          <!-- Linked Entities -->
          ${Array.isArray(note.linked_entities) && note.linked_entities.length > 0 ? `
            <div style="padding-top:12px;border-top:1px solid var(--border2)">
              <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Linked Portfolio Entities</div>
              <div class="notes-simple-card-entities">
                ${note.linked_entities.map((ent) => `
                  <span class="notes-simple-entity-chip" data-entity-type="${ent.type}" data-entity-id="${ent.id}" title="Go to ${App.utils.escapeHtml(ent.label || '')}">
                    <strong>[${App.utils.escapeHtml(ent.type.toUpperCase())}]</strong>
                    <span>${App.utils.escapeHtml(ent.label || '')}</span>
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Tags -->
          ${Array.isArray(note.tags) && note.tags.length > 0 ? `
            <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text3)">
              <span>Tags:</span>
              <div class="notes-simple-card-tags">
                ${note.tags.map((t) => `<span class="notes-simple-tag">#${App.utils.escapeHtml(t)}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          ${note.reminder_at ? `
            <div style="font-size:12px;color:var(--teal);display:flex;align-items:center;gap:6px">
              <span>&#9200;</span> Reminder: Due ${new Date(note.reminder_at).toLocaleString()}
            </div>
          ` : ''}
        </div>
      `,
      actions: [
        {
          label: '📋 Copy Text',
          className: 'btn-outline',
          onClick: () => {
            const plain = getNotePlainText(note.content_html || note.content || '');
            navigator.clipboard.writeText(plain).then(() => App.utils.toast('Note copied to clipboard'));
          },
        },
        {
          label: '🗂️ Open in 3-Pane',
          className: 'btn-outline',
          onClick: () => {
            App.ui.close();
            state.activeNoteId = note.id;
            switchToWorkspaceTab();
          },
        },
        {
          label: '✎ Edit Note',
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

      // Linked entity click in view modal
      body.querySelectorAll('[data-entity-type]').forEach((chip) => {
        chip.addEventListener('click', () => {
          App.ui.close();
          navigateToEntity(chip.dataset.entityType, chip.dataset.entityId);
        });
      });
    }
  }

  // ---- Modal: Simple Direct Note Editor ----
  function openSimpleEditModal(note) {
    const plain = getNotePlainText(note.content_html || note.content || '');
    const folderOptions = [
      { value: '', label: 'None (Unorganized)' },
      ...state.folders.map((f) => ({ value: f.id, label: f.name })),
    ];
    const tagsStr = Array.isArray(note.tags) ? note.tags.join(', ') : '';

    App.ui.open({
      title: `Edit Note`,
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="field">
            <label style="font-size:11px;font-weight:600;color:var(--text2)">Note Title <span style="color:var(--red)">*</span></label>
            <input type="text" id="simpleEditTitle" class="search-input" value="${App.utils.escapeHtml(note.title || '')}" placeholder="Note title...">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label style="font-size:11px;font-weight:600;color:var(--text2)">Folder</label>
              <select id="simpleEditFolder" class="search-input">
                ${folderOptions.map((opt) => `<option value="${opt.value}" ${String(note.folder_id || '') === String(opt.value) ? 'selected' : ''}>${App.utils.escapeHtml(opt.label)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label style="font-size:11px;font-weight:600;color:var(--text2)">Priority</label>
              <select id="simpleEditPriority" class="search-input">
                <option value="low" ${note.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${!note.priority || note.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${note.priority === 'high' ? 'selected' : ''}>High</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label style="font-size:11px;font-weight:600;color:var(--text2)">Tags (comma-separated)</label>
              <input type="text" id="simpleEditTags" class="search-input" value="${App.utils.escapeHtml(tagsStr)}" placeholder="e.g. deals, thesis, Q4">
            </div>
            <div class="field">
              <label style="font-size:11px;font-weight:600;color:var(--text2)">Reminder / Due Date</label>
              <input type="datetime-local" id="simpleEditReminder" class="search-input" value="${note.reminder_at ? new Date(note.reminder_at).toISOString().slice(0, 16) : ''}">
            </div>
          </div>
          <div class="field">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <label style="font-size:11px;font-weight:600;color:var(--text2)">Note Content</label>
              <div style="display:flex;gap:4px">
                <button type="button" class="btn btn-outline btn-xs" id="simpleEditH2Btn" style="padding:2px 6px;font-size:10.5px">H2</button>
                <button type="button" class="btn btn-outline btn-xs" id="simpleEditH3Btn" style="padding:2px 6px;font-size:10.5px">H3</button>
                <button type="button" class="btn btn-outline btn-xs" id="simpleEditBoldBtn" style="padding:2px 6px;font-size:10.5px"><b>B</b></button>
                <button type="button" class="btn btn-outline btn-xs" id="simpleEditChecklistBtn" style="padding:2px 6px;font-size:10.5px">☑ Task</button>
              </div>
            </div>
            <div id="simpleEditContent" contenteditable="true" class="notes-content-editable" style="min-height:160px;max-height:280px;overflow-y:auto;background:var(--fill-2);border:1px solid var(--border2);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.6">
              ${note.content_html || (plain ? `<p>${App.utils.escapeHtml(plain).replace(/\n/g, '<br>')}</p>` : '')}
            </div>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Save Changes',
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

    // Bind mini formatting buttons
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

    nav.innerHTML = `
      <div class="notes-pane-headline">
        <span class="notes-pane-headline-title"><span>📁</span> Folders & Views</span>
        <button class="btn btn-outline btn-xs" id="navNewFolderBtn" style="font-size:10px;padding:2px 6px">+ Folder</button>
      </div>
      <div class="notes-nav-scroll">
        <!-- Views -->
        <div>
          <div class="notes-nav-section-title">Views</div>
          <button class="notes-nav-btn ${state.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
            <span class="icon-label"><span>&#128196;</span> All Notes</span>
            <span class="count-pill">${allNotes.length}</span>
          </button>
          <button class="notes-nav-btn ${state.activeFilter === 'pinned' ? 'active' : ''}" data-filter="pinned">
            <span class="icon-label"><span>&#128204;</span> Pinned</span>
            <span class="count-pill">${pinnedCount}</span>
          </button>
          <button class="notes-nav-btn ${state.activeFilter === 'favorites' ? 'active' : ''}" data-filter="favorites">
            <span class="icon-label"><span>&#9733;</span> Favorites</span>
            <span class="count-pill">${favCount}</span>
          </button>
          <button class="notes-nav-btn ${state.activeFilter === 'reminders' ? 'active' : ''}" data-filter="reminders">
            <span class="icon-label"><span>&#9200;</span> Reminders & Due</span>
            <span class="count-pill">${reminderCount}</span>
          </button>
          <button class="notes-nav-btn ${state.activeFilter === 'archive' ? 'active' : ''}" data-filter="archive">
            <span class="icon-label"><span>&#128451;</span> Archive</span>
            <span class="count-pill">${archiveCount}</span>
          </button>
          <button class="notes-nav-btn ${state.activeFilter === 'trash' ? 'active' : ''}" data-filter="trash">
            <span class="icon-label"><span>&#128465;</span> Trash</span>
            <span class="count-pill">${trashCount}</span>
          </button>
        </div>

        <!-- Custom Folders -->
        <div>
          <div class="notes-nav-section-title">
            <span>Folders</span>
            <button class="btn btn-outline btn-xs" id="newFolderBtn" title="Create Folder" style="padding:1px 6px;font-size:10px">+</button>
          </div>
          <div id="notesFolderList">
            ${state.folders.map((f) => {
              const count = allNotes.filter((n) => String(n.folder_id || '') === String(f.id)).length;
              const isActive = state.activeFilter === `folder:${f.id}`;
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;group;margin-bottom:2px">
                  <button class="notes-nav-btn ${isActive ? 'active' : ''}" data-filter="folder:${f.id}" style="flex:1">
                    <span class="icon-label">
                      <span class="notes-folder-dot" style="background:${f.color || '#c9a84c'}"></span>
                      ${App.utils.escapeHtml(f.name)}
                    </span>
                    <span class="count-pill">${count}</span>
                  </button>
                  <button class="icon-btn btn-xs" data-delete-folder="${f.id}" title="Delete folder (notes kept safely)" style="opacity:0.6;font-size:11px;padding:2px 5px;color:var(--red)">&#128465;</button>
                </div>
              `;
            }).join('') || '<div style="font-size:11.5px;color:var(--text3);padding:4px 8px">No folders yet</div>'}
          </div>
        </div>

        <!-- Tags Cloud -->
        ${tagMap.size > 0 ? `
          <div>
            <div class="notes-nav-section-title">Tags</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;padding:2px 6px">
              ${Array.from(tagMap.entries()).map(([tag, count]) => {
                const isActive = state.activeFilter === `tag:${tag}`;
                return `
                  <button class="notes-tag-chip ${isActive ? 'active' : ''}" data-filter="tag:${tag}">
                    #${App.utils.escapeHtml(tag)} <span style="opacity:0.6">${count}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Footer Quick Stats -->
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
      });
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
  }

  // ==========================================================================
  // PANE 2: NOTES LIST & FOLDER VIEW (Search, Sort, Inline Edit & Bulk Actions)
  // ==========================================================================
  function renderNoteCard(n) {
    const isActive = String(n.id) === String(state.activeNoteId);
    const isChecked = state.selectedNoteIds.has(String(n.id));
    const isInlineEditing = String(n.id) === String(state.inlineEditingNoteId);
    const folder = state.folders.find((f) => String(f.id) === String(n.folder_id));
    const snippet = getNotePlainText(n.content_html || n.content || '').slice(0, 140);
    const isOverdue = n.reminder_at && new Date(n.reminder_at) < new Date();

    return `
      <div class="note-item-card ${isActive ? 'active' : ''}" data-note-id="${n.id}" style="${n.color ? `border-left: 3px solid ${n.color};` : ''}">
        <div class="note-item-top">
          <div style="display:flex;align-items:center;gap:6px;flex:1;overflow:hidden">
            <input type="checkbox" class="note-select-chk" data-chk-id="${n.id}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation()">
            <span class="note-item-title">${App.utils.escapeHtml(n.title || 'Untitled Note')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <div class="note-card-quick-actions">
              <button class="icon-btn btn-xs inline-edit-toggle-btn" data-edit-inline="${n.id}" title="${isInlineEditing ? 'Close inline edit' : 'Edit note directly'}" style="padding:2px 6px;font-size:11px" onclick="event.stopPropagation()">
                ${isInlineEditing ? '✕ Cancel' : '✎ Edit'}
              </button>
              <button class="icon-btn btn-xs full-editor-btn" data-open-editor="${n.id}" title="Open in full rich-text editor" style="padding:2px 6px;font-size:11px" onclick="event.stopPropagation()">
                ⤢ Full
              </button>
            </div>
            <div class="note-item-indicators">
              ${n.is_pinned ? '<span title="Pinned">&#128204;</span>' : ''}
              ${n.is_favorite ? '<span title="Favorite" style="color:var(--gold)">&#9733;</span>' : ''}
            </div>
          </div>
        </div>

        ${isInlineEditing ? `
          <!-- Direct Inline Quick Editor -->
          <div class="note-inline-editor" onclick="event.stopPropagation()">
            <input type="text" class="note-inline-title" id="inlineTitle_${n.id}" value="${App.utils.escapeHtml(n.title || '')}" placeholder="Note Title...">
            <textarea class="note-inline-body" id="inlineBody_${n.id}" rows="4" placeholder="Edit note content directly...">${App.utils.escapeHtml(getNotePlainText(n.content_html || n.content || ''))}</textarea>
            <div class="note-inline-actions">
              <div style="display:flex;gap:4px">
                <button class="btn btn-gold btn-xs inline-save-btn" data-save-inline="${n.id}">✓ Save Note</button>
                <button class="btn btn-outline btn-xs inline-cancel-btn" data-cancel-inline="${n.id}">✕ Cancel</button>
              </div>
              <button class="btn btn-outline btn-xs inline-open-editor-btn" data-open-editor="${n.id}">Open in Full Editor →</button>
            </div>
          </div>
        ` : `
          <div class="note-item-snippet">${App.utils.escapeHtml(snippet || 'Empty note...')}</div>
          <div class="note-item-meta">
            <span>${formatRelativeDate(n.updated_at || n.created_at)}</span>
            ${folder ? `<span>·</span><span class="note-item-folder"><span class="notes-folder-dot" style="background:${folder.color || '#c9a84c'}"></span> ${App.utils.escapeHtml(folder.name)}</span>` : ''}
            ${n.reminder_at ? `<span>·</span><span class="note-item-reminder ${isOverdue ? 'overdue' : ''}">&#9200; ${new Date(n.reminder_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : ''}
            ${Array.isArray(n.tags) && n.tags.length > 0 ? `<span>·</span><span>#${App.utils.escapeHtml(n.tags[0])}</span>` : ''}
          </div>
        `}
      </div>
    `;
  }

  function drawListPane() {
    const listPane = App.utils.qs('#notesListPane');
    if (!listPane) return;

    const filtered = getFilteredNotes();
    const hasBulkSelection = state.selectedNoteIds.size > 0;

    // Build content based on displayMode ('list' vs 'folder')
    let contentHtml = '';
    if (filtered.length === 0) {
      contentHtml = `
        <div style="padding:32px 16px;text-align:center;color:var(--text3);font-size:12.5px">
          <div style="font-size:24px;margin-bottom:8px">&#128221;</div>
          <p>No notes found in this view.</p>
          <button class="btn btn-gold btn-xs" id="emptyCreateBtn" style="margin-top:10px">+ Create Note</button>
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
        return `
          <div class="notes-folder-group">
            <div class="notes-folder-group-header" data-toggle-group="${grp.id}">
              <div class="notes-folder-group-title">
                <span style="font-size:10px;color:var(--text3)">${isCollapsed ? '▶' : '▼'}</span>
                <span class="notes-folder-dot" style="background:${grp.color}"></span>
                <span>${App.utils.escapeHtml(grp.name)}</span>
                <span class="count-pill" style="font-size:11px;color:var(--text3);margin-left:4px">(${grp.notes.length})</span>
              </div>
              <div class="notes-folder-group-actions" onclick="event.stopPropagation()">
                <button class="btn btn-outline btn-xs" data-add-in-folder="${grp.id === 'unorganized' ? '' : grp.id}" title="Add note in ${App.utils.escapeHtml(grp.name)}" style="font-size:10.5px;padding:2px 6px">
                  + Note
                </button>
                ${grp.isCustom ? `
                  <button class="icon-btn btn-xs" data-delete-folder-group="${grp.id}" title="Delete folder (notes kept safely)" style="font-size:11px;padding:2px 5px;color:var(--red)">
                    &#128465;
                  </button>
                ` : ''}
              </div>
            </div>
            ${!isCollapsed ? `
              <div class="notes-folder-group-cards">
                ${grp.notes.length > 0 ? grp.notes.map(renderNoteCard).join('') : `
                  <div style="padding:10px 16px;font-size:11.5px;color:var(--text3)">
                    No notes in this folder. Click "+ Note" to add one.
                  </div>
                `}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    } else {
      contentHtml = filtered.map(renderNoteCard).join('');
    }

    listPane.innerHTML = `
      <div class="notes-pane-headline">
        <span class="notes-pane-headline-title"><span>📄</span> Notes Stream (${filtered.length})</span>
        <span style="font-size:10px;color:var(--text3);text-transform:none">Filter: ${App.utils.escapeHtml(state.activeFilter)}</span>
      </div>
      <!-- List Header with Search & Sort -->
      <div class="notes-list-header">
        <div class="notes-search-wrap">
          <span class="notes-search-icon">&#128269;</span>
          <input type="text" id="notesSearchInput" placeholder="Search notes, tags, content..." value="${App.utils.escapeHtml(state.searchQuery)}">
        </div>
        <div class="notes-list-controls">
          <div style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" id="selectAllNotesChk" ${hasBulkSelection && state.selectedNoteIds.size === filtered.length ? 'checked' : ''} title="Select All">
            <div class="notes-view-mode-toggle">
              <button class="notes-view-mode-btn ${state.displayMode === 'list' ? 'active' : ''}" data-view-mode="list" title="Continuous list view">☰ List</button>
              <button class="notes-view-mode-btn ${state.displayMode === 'folder' ? 'active' : ''}" data-view-mode="folder" title="Group notes by folder">📁 Folders</button>
            </div>
          </div>
          <select id="notesSortSelect">
            <option value="updated_desc" ${state.sortBy === 'updated_desc' ? 'selected' : ''}>Recently Updated</option>
            <option value="created_desc" ${state.sortBy === 'created_desc' ? 'selected' : ''}>Date Created</option>
            <option value="title_asc" ${state.sortBy === 'title_asc' ? 'selected' : ''}>Title (A-Z)</option>
            <option value="priority_desc" ${state.sortBy === 'priority_desc' ? 'selected' : ''}>Priority</option>
            <option value="reminder_asc" ${state.sortBy === 'reminder_asc' ? 'selected' : ''}>Reminder Date</option>
          </select>
        </div>
      </div>

      <!-- Bulk Actions Bar (conditionally shown) -->
      ${hasBulkSelection ? `
        <div class="notes-bulk-bar">
          <span>${state.selectedNoteIds.size} selected</span>
          <div style="display:flex;gap:4px">
            ${state.activeFilter === 'trash' ? `
              <button class="btn btn-outline btn-xs" id="bulkRestoreBtn">Restore</button>
              <button class="btn btn-danger btn-xs" id="bulkPermanentDeleteBtn">Delete Forever</button>
            ` : `
              <button class="btn btn-outline btn-xs" id="bulkArchiveBtn">${state.activeFilter === 'archive' ? 'Unarchive' : 'Archive'}</button>
              <button class="btn btn-outline btn-xs" id="bulkTrashBtn">Trash</button>
            `}
          </div>
        </div>
      ` : ''}

      <!-- Scrollable Notes Stream / Folder Groups -->
      <div class="notes-list-scroll" id="notesListScroll">
        ${contentHtml}
      </div>
    `;

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
    });
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
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text3);padding:24px;text-align:center">
          <div style="font-size:36px;margin-bottom:12px;opacity:0.7">&#128196;</div>
          <h2 style="font-size:18px;color:var(--text);margin-bottom:6px">No Note Selected</h2>
          <p style="font-size:13px;max-width:320px;margin-bottom:16px">Select a note from the list, or create a new one to begin capturing your knowledge.</p>
          <button class="btn btn-gold btn-sm" id="editorNewNoteBtn">+ New Note</button>
        </div>
      `;
      App.utils.qs('#editorNewNoteBtn', editorPane)?.addEventListener('click', () => createNewNoteModal());
      return;
    }

    const initialHtml = note.content_html || (note.content ? App.utils.escapeHtml(note.content).replace(/\n/g, '<br>') : '');
    const stats = getNoteStats(initialHtml);

    editorPane.innerHTML = `
      <div class="notes-pane-headline">
        <span class="notes-pane-headline-title"><span>✍️</span> Active Note Editor</span>
        <span class="notes-status-badge ${state.saveStatus}" id="editorSaveBadge" style="font-size:10.5px">
          ${state.saveStatus === 'saving' ? '● Saving...' : state.saveStatus === 'saved' ? '✓ Saved' : '● Unsaved'}
        </span>
      </div>
      <!-- Editor Header -->
      <div class="notes-editor-header">
        <div class="notes-editor-header-left">
          <button class="notes-mobile-back" id="notesMobileBackBtn" title="Back to Notes List">
            &#8592; Notes
          </button>
          <input type="text" class="notes-editor-title-input" id="noteTitleInput" value="${App.utils.escapeHtml(note.title || '')}" placeholder="Note Title...">
        </div>

        <div class="notes-editor-header-actions">
          <!-- Folder Selector Dropdown -->
          <select id="noteFolderSelect" class="btn btn-outline btn-xs" style="font-size:11.5px;max-width:130px">
            <option value="">No Folder</option>
            ${state.folders.map((f) => `<option value="${f.id}" ${String(note.folder_id || '') === String(f.id) ? 'selected' : ''}>${App.utils.escapeHtml(f.name)}</option>`).join('')}
          </select>

          <!-- Pin Toggle -->
          <button class="icon-btn btn-xs ${note.is_pinned ? 'active' : ''}" id="notePinBtn" title="${note.is_pinned ? 'Unpin Note' : 'Pin to Top'}" style="color:${note.is_pinned ? 'var(--gold)' : 'var(--text3)'}">
            &#128204;
          </button>

          <!-- Favorite Toggle -->
          <button class="icon-btn btn-xs ${note.is_favorite ? 'active' : ''}" id="noteFavBtn" title="${note.is_favorite ? 'Remove Favorite' : 'Mark Favorite'}" style="color:${note.is_favorite ? 'var(--gold)' : 'var(--text3)'}">
            ${note.is_favorite ? '&#9733;' : '&#9734;'}
          </button>

          <!-- Save Status Indicator -->
          <span class="notes-status-badge saved" id="noteSaveStatus">
            <span style="font-size:9px">&#9679;</span> Saved
          </span>
        </div>
      </div>

      <!-- Rich-Text Formatting Toolbar -->
      <div class="notes-toolbar">
        <button class="notes-toolbar-btn" data-cmd="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
        <button class="notes-toolbar-btn" data-cmd="italic" title="Italic (Ctrl+I)"><em>I</em></button>
        <button class="notes-toolbar-btn" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>

        <span class="notes-toolbar-sep"></span>

        <button class="notes-toolbar-btn" data-heading="h1" title="Heading 1">H1</button>
        <button class="notes-toolbar-btn" data-heading="h2" title="Heading 2">H2</button>
        <button class="notes-toolbar-btn" data-heading="h3" title="Heading 3">H3</button>

        <span class="notes-toolbar-sep"></span>

        <button class="notes-toolbar-btn" data-cmd="insertUnorderedList" title="Bulleted List">&#8226; List</button>
        <button class="notes-toolbar-btn" data-cmd="insertOrderedList" title="Numbered List">1. List</button>
        <button class="notes-toolbar-btn" id="toolbarChecklistBtn" title="Checklist Item">&#9745; Task</button>

        <span class="notes-toolbar-sep"></span>

        <button class="notes-toolbar-btn" id="toolbarBlockquoteBtn" title="Quote Block">&#10077; Quote</button>
        <button class="notes-toolbar-btn" id="toolbarCodeBtn" title="Code Block">&lt;/&gt;</button>
        <button class="notes-toolbar-btn" id="toolbarTableBtn" title="Financial Table">&#9638; Table</button>
        <button class="notes-toolbar-btn" id="toolbarLinkBtn" title="Insert Link">&#128279;</button>

        <span class="notes-toolbar-sep"></span>

        <button class="notes-toolbar-btn" data-cmd="undo" title="Undo (Ctrl+Z)">&#8630;</button>
        <button class="notes-toolbar-btn" data-cmd="redo" title="Redo (Ctrl+Y)">&#8631;</button>

        <span class="notes-toolbar-sep"></span>

        <!-- AI Knowledge Assistant Action -->
        <button class="notes-toolbar-btn" id="notesAiAssistBtn" style="color:var(--gold);font-weight:600" title="AI Knowledge Assistant (Summarize, Polish, Extract Actions, Risks)">
          <span>&#9889;</span> AI Assist
        </button>
      </div>

      <!-- Content Scroll & Body -->
      <div class="notes-content-scroll">
        <div class="notes-content-editable" id="notesContentEditable" contenteditable="true" placeholder="Start typing your investment notes, meeting minutes, thesis, or checklist...">
          ${initialHtml}
        </div>

        <!-- Entity Linking Tray -->
        <div class="notes-entity-tray" id="notesEntityTray">
          <div class="notes-entity-tray-header">
            <span>&#128279; Linked Portfolio Entities</span>
            <button class="btn btn-outline btn-xs" id="addEntityLinkBtn" style="font-size:11px">+ Link Entity</button>
          </div>
          <div class="notes-entity-chips" id="notesEntityChips">
            ${Array.isArray(note.linked_entities) && note.linked_entities.length > 0 ? note.linked_entities.map((ent, idx) => `
              <span class="notes-entity-chip" data-entity-type="${ent.type}" data-entity-id="${ent.id}" title="Click to open ${App.utils.escapeHtml(ent.label || '')}">
                <span style="color:var(--gold)">[${App.utils.escapeHtml(ent.type.toUpperCase())}]</span>
                <span>${App.utils.escapeHtml(ent.label || 'Entity')}</span>
                <span class="del-link" data-del-entity="${idx}" title="Remove link" onclick="event.stopPropagation()">&#10005;</span>
              </span>
            `).join('') : '<span style="font-size:11.5px;color:var(--text3)">No linked deals, SIPs, gold, or goals yet.</span>'}
          </div>
        </div>
      </div>

      <!-- Editor Footer / Meta Bar -->
      <div class="notes-editor-footer">
        <div class="notes-meta-stats">
          <span id="noteWordCount">${stats.words} words</span>
          <span>·</span>
          <span id="noteReadingTime">${stats.readingTimeMinutes} min read</span>
          <span>·</span>
          <span style="cursor:pointer;color:var(--text2)" id="noteReminderBtn" title="Set Reminder / Due Date">
            &#9200; ${note.reminder_at ? `Due ${new Date(note.reminder_at).toLocaleDateString()}` : 'Set Reminder'}
          </span>
          <span>·</span>
          <span style="cursor:pointer;color:var(--text2)" id="noteTagsBtn" title="Manage Tags">
            &#127991; ${Array.isArray(note.tags) && note.tags.length > 0 ? note.tags.map((t) => `#${t}`).join(' ') : 'Add Tags'}
          </span>
        </div>

        <div class="notes-footer-actions">
          <button class="btn btn-outline btn-xs" id="noteVersionHistoryBtn" title="Version Snapshots">
            &#128339; History
          </button>
          <button class="btn btn-outline btn-xs" id="noteExportSingleBtn" title="Export Note">
            &#8595; Export
          </button>
          <button class="btn btn-outline btn-xs" id="noteDuplicateBtn" title="Duplicate Note">
            &#128203; Duplicate
          </button>
          <button class="btn btn-outline btn-xs" id="noteTrashBtn" style="color:var(--red)" title="${note.in_trash ? 'Restore from Trash' : 'Move to Trash'}">
            ${note.in_trash ? 'Restore' : 'Trash'}
          </button>
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
        if (status === 'saving') {
          statusBadge.innerHTML = '<span style="font-size:9px">&#9679;</span> Saving...';
        } else if (status === 'saved') {
          statusBadge.innerHTML = '<span style="font-size:9px">&#9679;</span> Saved';
          updateCardSnippetInList(note.id);
        } else if (status === 'cached') {
          statusBadge.innerHTML = '<span style="font-size:9px">&#9679;</span> Draft saved offline';
        } else if (status === 'failed') {
          statusBadge.innerHTML = '<span style="font-size:9px">&#9679;</span> Save failed';
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
      const plain = getNotePlainText(note.content_html || note.content || '');
      snippetEl.textContent = plain.slice(0, 140) || 'Empty note...';
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
      title: 'Quick Capture Note',
      bodyHtml: `
        <div style="margin-bottom:12px;font-size:12px;color:var(--text2)">
          Capture investment thoughts, meeting takeaways, or knowledge items instantly.
        </div>
        ${App.ui.renderForm(fields, { folder_id: prefillFolderId || '' })}
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Create Note',
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
      title: 'Executive Note Templates',
      bodyHtml: `
        <div style="margin-bottom:14px;font-size:12.5px;color:var(--text2)">
          Choose a pre-structured executive framework for investment memos, meeting minutes, and diligence reviews:
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:10px;max-height:420px;overflow-y:auto">
          ${state.templates.map((tmpl) => `
            <div class="integration-card" style="cursor:pointer;padding:12px;border:1px solid var(--border2);border-radius:8px" data-template-id="${tmpl.id}">
              <div class="name" style="font-size:14px;color:var(--gold);margin-bottom:4px">${App.utils.escapeHtml(tmpl.title)}</div>
              <div class="status" style="font-size:11.5px;color:var(--text3);text-transform:capitalize;margin-bottom:8px">${App.utils.escapeHtml(tmpl.category || 'General')}</div>
              <button class="btn btn-gold btn-xs" style="width:100%">Use Template</button>
            </div>
          `).join('')}
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
      title: 'Create Folder',
      bodyHtml: App.ui.renderForm(fields, {}),
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Create Folder',
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
      title: 'Note Reminder & Review Schedule',
      bodyHtml: `
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
          Set an executive review milestone or deadline for this note.
        </div>
        ${App.ui.renderForm(fields, { reminder_at: existingDate, priority: note.priority || 'medium' })}
      `,
      actions: [
        {
          label: 'Remove Reminder',
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
          label: 'Save Reminder',
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
      title: 'Manage Tags',
      bodyHtml: `
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
          Enter tags separated by commas (e.g. <code>equity, q3-review, diligence, checklist</code>).
        </div>
        ${App.ui.renderForm(fields, { tags: existingTags })}
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Save Tags',
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
      title: 'Link Note to Portfolio Entity',
      bodyHtml: `
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
          Associate this note with any portfolio record for 1-click cross-referencing:
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Entity Type</label>
            <select id="entityTypePicker" class="search-input" style="width:100%">
              <option value="deal">Deal / Private Investment</option>
              <option value="recurring">SIP / Recurring Investment</option>
              <option value="gold">Gold Purchase / Holding</option>
              <option value="contact">Contact / Founder</option>
              <option value="document">Document / Contract</option>
              <option value="goal">Financial Goal</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Select Record</label>
            <select id="entityRecordPicker" class="search-input" style="width:100%">
              <option value="">Loading records...</option>
            </select>
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
      title: 'Note Version History',
      bodyHtml: `
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
          Browse previous snapshots of this note and restore any state in 1 click:
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:380px;overflow-y:auto">
          ${history.length === 0 ? `
            <div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">
              No version snapshots recorded yet. Snapshots are created automatically during editing sessions.
            </div>
          ` : history.map((ver, idx) => `
            <div class="integration-card" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px">
              <div>
                <div style="font-weight:600;font-size:13px;color:var(--text)">Version ${ver.version || (history.length - idx)}</div>
                <div style="font-size:11px;color:var(--text3)">${new Date(ver.created_at).toLocaleString()} · ${ver.word_count || 0} words</div>
              </div>
              <button class="btn btn-gold btn-xs" data-restore-ver="${idx}">Restore</button>
            </div>
          `).join('')}
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
      title: 'AI Knowledge Assistant',
      bodyHtml: `
        <div style="font-size:12.5px;color:var(--text2);margin-bottom:14px">
          Select an executive AI capability to analyze, structure, or refine this note:
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <button class="btn btn-outline btn-sm" id="aiActionSummarize" style="text-align:left;padding:10px">
            <strong>&#128221; Executive Summary</strong>
            <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Condense into high-level takeaways</div>
          </button>
          <button class="btn btn-outline btn-sm" id="aiActionTasks" style="text-align:left;padding:10px">
            <strong>&#9745; Extract Action Items</strong>
            <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Generate checklist with due dates</div>
          </button>
          <button class="btn btn-outline btn-sm" id="aiActionPolish" style="text-align:left;padding:10px">
            <strong>&#10024; Polish & Format Memo</strong>
            <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Clean headings, tone, and grammar</div>
          </button>
          <button class="btn btn-outline btn-sm" id="aiActionTitle" style="text-align:left;padding:10px">
            <strong>&#127991; Generate Clear Title</strong>
            <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Extract an executive note heading</div>
          </button>
          <button class="btn btn-outline btn-sm" id="aiActionRisk" style="text-align:left;padding:10px;grid-column:span 2">
            <strong>&#9878; Investment Risk & Catalyst Analysis</strong>
            <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Detect downside risks, legal debt flags, and return catalysts</div>
          </button>
        </div>
        <div id="aiAssistPreviewArea" style="display:none;background:var(--fill-2);border:1px solid var(--border2);border-radius:8px;padding:14px;max-height:280px;overflow-y:auto;font-size:13px;line-height:1.6">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase">Generated Output</span>
            <span id="aiAssistTokens" style="font-size:10.5px;color:var(--text3)"></span>
          </div>
          <div id="aiAssistPreviewContent"></div>
        </div>
      `,
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: 'Apply to Note',
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
      previewContent.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:var(--gold)"><span style="font-size:16px">&#9889;</span> Generating AI response with Gemini...</div>';

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
        previewContent.innerHTML = `<div style="color:var(--red);padding:6px 0">&#9888; AI generation failed: ${App.utils.escapeHtml(err.message || String(err))}</div><div style="font-size:11.5px;color:var(--text3);margin-top:4px">Please retry or choose another capability.</div>`;
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
      title: 'Export Note',
      bodyHtml: `
        <div style="font-size:12.5px;color:var(--text2);margin-bottom:14px">
          Select export format for "${App.utils.escapeHtml(note.title || 'Untitled Note')}":
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-outline btn-sm" id="exportMdBtn" style="text-align:left;justify-content:flex-start;padding:10px">
            <strong>Markdown (.md)</strong>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">Obsidian / Notion format</span>
          </button>
          <button class="btn btn-outline btn-sm" id="exportHtmlBtn" style="text-align:left;justify-content:flex-start;padding:10px">
            <strong>Clean HTML (.html)</strong>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">Standalone Web Document</span>
          </button>
          <button class="btn btn-outline btn-sm" id="exportTxtBtn" style="text-align:left;justify-content:flex-start;padding:10px">
            <strong>Plain Text (.txt)</strong>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">Standard text</span>
          </button>
          <button class="btn btn-outline btn-sm" id="exportJsonBtn" style="text-align:left;justify-content:flex-start;padding:10px">
            <strong>Raw JSON (.json)</strong>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">Full Metadata & Entities</span>
          </button>
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
      title: 'Export Notes Knowledge Hub',
      bodyHtml: `
        <div style="font-size:12.5px;color:var(--text2);margin-bottom:14px">
          Export all ${state.notes.length} notes and knowledge items from your Investment OS:
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-outline btn-sm" id="exportAllJsonBtn" style="text-align:left;justify-content:flex-start;padding:10px">
            <strong>Complete Notes Backup (.json)</strong>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">All notes, folders, and links</span>
          </button>
          <button class="btn btn-outline btn-sm" id="exportAllMarkdownZipBtn" style="text-align:left;justify-content:flex-start;padding:10px">
            <strong>Obsidian / Markdown Bundle (.json archive)</strong>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">Markdown formatted items</span>
          </button>
          <button class="btn btn-outline btn-sm" id="exportSystemSectionBtn" style="text-align:left;justify-content:flex-start;padding:10px">
            <strong>Standard Investment OS Export (.xlsx / .csv)</strong>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">System-wide backup module</span>
          </button>
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
