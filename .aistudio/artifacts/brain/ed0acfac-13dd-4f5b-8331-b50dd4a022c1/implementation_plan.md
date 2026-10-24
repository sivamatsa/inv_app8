# Investment OS Premium Notes & Knowledge Hub

Transform the existing single-column Notes scratchpad in Investment OS into an executive-grade personal knowledge management workspace. Preserving all existing note IDs, timestamps, and data integrity, this upgrade introduces an adaptable 3-pane desktop workspace (collapsible on mobile), rich-text editing with debounced autosave, organization by folders and tags, cross-linking to all portfolio entities, reminders, version history, and secure AI-assisted editing.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions were confirmed:
> - **Dual-Tab Experience**: An ultra-clean, simple **All Notes** directory tab as the primary default view where all notes appear with spacious cards/table, instant search, folder filters, checklist progress, and direct 1-click View/Edit/Studio actions, alongside the power-user **3-Pane Workspace** tab.
> - **Workspace Clarity**: Each pane in the 3-pane layout features dedicated high-contrast headers (Folders & Views, Notes Stream, Note Editor) preventing layout confusion.
> - **Content Format & Backward Compatibility**: Sanitized rich HTML with automatic plain-text extraction. Existing notes remain 100% readable and editable without migration loss.
> - **Entity Cross-Linking**: Deep linking to all Investment OS modules including Deals, Loans, Recurring SIPs, Gold Holdings, Expense Projects, Contacts, Documents, Financial Goals, and Calendar events.

***

## 1. Overview & Core Concept

### What It Does
Upgrades the current private notes scratchpad into a unified Knowledge Hub that allows investors to capture meeting minutes, term sheets, investment theses, due diligence checklists, and financial reflections, while organizing them with folders, tags, colors, and reminders.

### Target Audience & Persona
High-net-worth individuals, active angel investors, and personal finance managers using Investment OS to manage private investments, peer lending, gold holdings, and family accounts who need a central, private repository for unstructured insights and decisions linked to their structured financial ledger.

### Key Value Delivered
- **Zero Friction Capture**: Capture thoughts in 1-click via quick presets (Investment Research, Meeting Notes, Checklist, Due Diligence, Journal).
- **Relational Context**: Link unstructured insights directly to deals, borrowers, contacts, and portfolios without duplicating data.
- **Data Safety & Recovery**: Auto-save with debouncing, version history snapshots, and Trash recovery prevent accidental data loss.
- **Total Privacy & RLS**: All notes remain isolated to the authenticated user via Supabase Row Level Security (RLS)—inaccessible even to administrators.

***

## 2. User Experience & Visual Design

### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  3-PANE KNOWLEDGE HUB WORKSPACE (DESKTOP)                             │
├──────────────────────────┬─────────────────────────────────────┬───────────────────────────────────────┤
│ PANE 1: FOLDERS & NAV    │ PANE 2: NOTES LIST & SEARCH         │ PANE 3: ACTIVE RICH-TEXT EDITOR       │
│                          │                                     │                                       │
│ ⚡ Quick Capture Button   │ [ 🔍 Search title, body, tags...  ] │ 📌 Favorite  🏷️ Tag  🔗 Link  🗑️ Del  │
│ ──────────────────────── │ ─────────────────────────────────── │ ───────────────────────────────────── │
│ 📁 All Notes        (24) │ [Filter: All | Pinned | Reminders ] │ Title: Angur Agro Series A Note       │
│ ⭐ Favorites          (5)│ ─────────────────────────────────── │ Folder: Due Diligence  · Priority: HIGH│
│ 📌 Pinned             (3)│ 📌 Angel Investment Thesis          │ ───────────────────────────────────── │
│ ⏱️ Reminders          (4)│    Term sheet analysis · 2h ago     │ [ H1 H2 | B I U S | 📋 • 1. | 🔗 📷 ]  │
│ ──────────────────────── │                                     │                                       │
│ 📂 FOLDERS               │ 📁 Tech Startup Due Diligence       │ Executive Summary                     │
│  • Due Diligence     (8) │    Reviewed founder cap table · Yest│ Founder cap table verified with 15%   │
│  • Meeting Minutes   (6) │                                     │ ESOP pool allocation...               │
│  • Financial Plans   (4) │ 📁 Q4 Cash Flow Allocation          │                                       │
│  • Personal Journal  (6) │    SIP adjustments for Diwali...    │ ☑ Cap table reviewed                  │
│ ──────────────────────── │                                     │ ☐ Sign legal disclosure               │
│ 🏷️ TAGS                  │ 📁 Gold Accumulation Strategy       │ ───────────────────────────────────── │
│  #deals #sips #legal     │    Bullion vs Sovereign Gold...     │ 🔗 Linked to Deal: Angur Agro Farm    │
│ ──────────────────────── │                                     │ 💾 Saved · 452 words · 2 versions     │
│ 📦 Archive  · 🗑️ Trash   │                                     │                                       │
└──────────────────────────┴─────────────────────────────────────┴───────────────────────────────────────┘
```

1. **3-Pane Desktop Navigation**:
   - **Left Pane (240px)**: Fast folder navigation, custom folders (+ New Folder), quick tag filters, smart views (All, Pinned, Favorites, Reminders, Archive, Trash), and storage metrics.
   - **Center Pane (320px–360px)**: Fast full-text search bar with live debounce, filter chips (All, Pinned, Needs Review), compact note card list with titles, unboxed quiet timestamps, folder breadcrumbs, and preview snippets.
   - **Right Pane (Flex-1)**: Full-featured distraction-free rich-text editor with formatting toolbar (Headings, Bold, Italic, Checklists, Tables, Links, Code, Quotes), entity linking tray, reminder picker, version history drawer, and autosave status indicator.

2. **Responsive Mobile Flow**:
   - On screens $\le 900\text{px}$, the 3 panes collapse into a progressive master-detail view: Notes List with top search and drawer for Folders $\rightarrow$ tapping a note opens the full-screen touch editor with fixed action header and smooth back navigation.

3. **Visual Identity & Design Discipline**:
   - **Typography**: Header accents in *Cormorant Garamond* (20px–22px), body and controls in *DM Sans* (12px–14px), monospace for code blocks, and tabular figures for word counts and timestamps.
   - **Color Tokens**: Dark theme luxury palette using `var(--bg)` (`#0b0f19`), `var(--card)` (`#121826`), `var(--border)` (`#1f293d`), `var(--gold)` (`#c9a84c`), `var(--teal)` (`#16c9a3`), and `var(--red)` (`#e5484d`).
   - **Anti-Slop Zero-Pill Discipline**: Static metadata (folder names, word counts, last edited timestamps) displayed as clean unboxed typography separated by `·`. Interactive filter tabs use crisp segmented buttons with subtle background shifts, never floating pill badges.

***

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale & Trade-Offs |
| :--- | :--- | :--- |
| **Workspace Layout** | 3-Pane Adaptive Layout | Maximizes scanning and writing speed on desktop. Avoids modal context switching for high-frequency note taking while seamlessly collapsing into 1-pane on mobile. |
| **Content Format** | Sanitized Rich HTML + Plain Text Extraction | Guarantees full backward compatibility: existing notes loaded as HTML, and new notes automatically save clean plain-text fallback for global search and external exports. |
| **Autosave Engine** | Debounced 800ms Client Engine with Server Check | Prevents database spamming while guaranteeing zero text loss. Visual indicator transitions: `Unsaved` $\rightarrow$ `Saving...` $\rightarrow$ `Saved` with rollback cache if offline. |
| **Entity Cross-Linking** | Normalized JSONB Array (`linked_entities`) | Stores references `[{ type: 'deal', id: '12', label: 'Angur Agro' }]` on the note row. Avoids rigid join dependencies; handles deleted entities gracefully without cascading deletes. |
| **AI Assistant Integration** | Server-Side `/api/chat` with Gemini 3.8 Flash | Reuses existing secure server proxy. Zero client-side API keys exposed; operates strictly on user demand with instant preview before applying changes. |

***

## 4. Technical Architecture & Data Strategy

### System Component Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FRONTEND ARCHITECTURE                                  │
│                                                                                        │
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌─────────────────────────┐  │
│  │     js/views/notes.js │   │ js/lib/notesEditor.js  │   │ js/lib/notesSync.js     │  │
│  │  • 3-Pane View Router │   │  • Rich Text Toolbar   │   │  • Debounced Autosave   │  │
│  │  • Folder/Tag Filter  │   │  • Content Sanitizer   │   │  • Version Snapshotter  │  │
│  │  • Note List & Search │   │  • Checklists & Tables │   │  • LocalStorage Backup  │  │
│  └───────────┬───────────┘   └───────────┬────────────┘   └────────────┬────────────┘  │
│              │                           │                             │               │
│              ▼                           ▼                             ▼               │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                 App.api (js/data/api.js) & State Orchestrator                     │  │
│  │  • listNotes()  • createNote()  • updateNote()  • deleteNote()  • listHistory()   │  │
│  └───────────────────────────────────────┬──────────────────────────────────────────┘  │
└──────────────────────────────────────────┼─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE POSTGRESQL ENGINE                                │
│                                                                                        │
│  ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐  │
│  │ public.notes           │   │ public.note_folders    │   │ public.note_history    │  │
│  │  • id, user_id         │   │  • id, user_id         │   │  • id, note_id         │  │
│  │  • title, content_html │   │  • name, color, icon   │   │  • user_id, version    │  │
│  │  • is_pinned, favorite │   │  • parent_id           │   │  • title, content_html │  │
│  │  • in_trash, trashed_at│   │  • created_at          │   │  • created_at          │  │
│  │  • linked_entities     │   │                        │   │                        │  │
│  │  • tags, reminder_at   │   │                        │   │                        │  │
│  └────────────────────────┘   └────────────────────────┘   └────────────────────────┘  │
│                                                                                        │
│  🔒 ROW LEVEL SECURITY (RLS): All policies enforce `user_id = auth.uid()` strictly.   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Database Schema Migration (`supabase/migrations/057_notes_premium_hub.sql`)

1. **Non-Destructive Column Additions to `public.notes`**:
   - `content_html text` (Rich formatted HTML content)
   - `folder_id bigint references public.note_folders(id) on delete set null`
   - `tags text[] default '{}'`
   - `is_pinned boolean default false`
   - `is_favorite boolean default false`
   - `is_archived boolean default false`
   - `in_trash boolean default false`
   - `trashed_at timestamptz`
   - `color text`
   - `reminder_at timestamptz`
   - `due_at timestamptz`
   - `priority text default 'NORMAL'`
   - `linked_entities jsonb default '[]'`
   - `version integer default 1`

2. **New Tables**:
   - `public.note_folders`: Stores user-created folders with custom colors and icons.
   - `public.note_templates`: Stores prebuilt and user-defined note templates.
   - `public.note_history`: Stores snapshot versions for audit and 1-click restore.

3. **Fallback Resiliency**:
   - If the Supabase instance has not yet applied migration `057`, `App.api` and the Notes module automatically store extended metadata (`tags`, `folders`, `linked_entities`) in memory and `localStorage`, keeping 100% of features fully functional without throwing database errors.

***

## 5. Phase-by-Phase Implementation Plan

### Phase 1: Database Migration & API Layer
- Author `supabase/migrations/057_notes_premium_hub.sql` with non-destructive schema extensions, indexes, and strict RLS policies.
- Extend `js/data/api.js` with comprehensive helper methods: `listNoteFolders()`, `createNoteFolder()`, `deleteNoteFolder()`, `listNoteTemplates()`, `listNoteHistory()`, and `restoreNoteVersion()`.

### Phase 2: 3-Pane Responsive Layout & Navigation
- Rebuild `js/views/notes.js` using the 3-pane responsive grid.
- Implement Pane 1: Folders tree, quick tags drawer, smart views (All, Favorites, Pinned, Reminders, Trash), and metrics summary.
- Implement Pane 2: Live search, sort dropdown (Last Edited, Created, Title, Reminder), and multi-selection bulk actions (Archive, Trash, Add Tag).

### Phase 3: Rich-Text Editor & Debounced Autosave
- Implement `js/lib/notesEditor.js` supporting headings, lists, interactive checklists, code blocks, blockquotes, tables, and hyperlinks.
- Build reliable autosave in `js/lib/notesSync.js` with 800ms debounce, status badges (`Saving...`, `Saved`), offline local caching, and dirty-state warning before closing.

### Phase 4: Entity Cross-Linking & Templates
- Implement Entity Linking Tray in Pane 3 allowing users to attach active Deals, SIPs, Gold Holdings, Accounts, Contacts, Documents, Goals, and Calendar events.
- Implement Quick Capture modal with pre-built templates: *Investment Thesis*, *Founder Meeting*, *Checklist*, *Due Diligence Review*, *Financial Plan*, and *Blank Note*.

### Phase 5: Reminders, Trash Recovery & Version History
- Add date-time picker for note reminders with upcoming and overdue visual status tags.
- Implement Trash view with 1-click Restore and permanent deletion safeguards.
- Implement Version History drawer showing timestamped snapshots with diff preview and 1-click version restore.

### Phase 6: Import, Export & AI Assistant Integration
- Upgrade export functionality in `js/lib/exportData.js` to support Single Note, Selected Notes, and All Notes in Markdown (`.md`), HTML, TXT, and structured JSON.
- Implement safe Markdown and JSON import with preview before saving.
- Connect optional AI Assistant toolbar button to the existing `/api/chat` Gemini proxy for note summarization, title generation, action items extraction, and proofreading with user confirmation preview.

### Phase 7: Verification & Testing Results [COMPLETED]
- [x] All existing notes render accurately with zero content loss and backward-compatible HTML formatting.
- [x] 3-pane layout, folder management, tags cloud, and search filtering verified.
- [x] Rich-text editing, interactive checklists, code blocks, tables, and debounced autosave engine functioning with visual status indicators.
- [x] Entity linking across Deals, SIPs, Gold, Contacts, Documents, Goals, and Calendar with 1-click navigation.
- [x] 6 executive templates, Quick Capture, and version snapshots functioning.
- [x] Multi-format export (Markdown, Clean HTML, TXT, JSON) tested.
- [x] Mobile responsiveness with single-pane toggle and back navigation functioning seamlessly.
- [x] Server-side build compilation succeeded cleanly via `compile_applet`.

