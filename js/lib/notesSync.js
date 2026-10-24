/* ============================================================================
   Notes Synchronization & Autosave Engine (Investment OS)
   Manages debounced background saves, optimistic visual state transitions,
   dirty state tracking, offline recovery drafts, and version snapshots.
   ============================================================================ */
window.App = window.App || {};

App.notesSync = (function () {
  'use strict';

  let saveTimer = null;
  let isCurrentlySaving = false;
  let hasPendingSave = false;
  let pendingData = null;
  let dirty = false;

  const AUTOSAVE_DELAY_MS = 800;

  function isDirty() {
    return dirty;
  }

  function setDirty(state) {
    dirty = !!state;
  }

  /**
   * Emergency local storage draft protection.
   */
  function saveLocalDraft(noteId, payload) {
    try {
      const key = `ios_note_draft_${noteId || 'new'}`;
      localStorage.setItem(key, JSON.stringify({
        ...payload,
        saved_at: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function getLocalDraft(noteId) {
    try {
      const key = `ios_note_draft_${noteId || 'new'}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearLocalDraft(noteId) {
    try {
      const key = `ios_note_draft_${noteId || 'new'}`;
      localStorage.removeItem(key);
    } catch (_) {}
  }

  /**
   * Periodic version snapshotting to prevent accidental overwrite loss.
   */
  let editCountSinceLastVersion = 0;
  async function maybeRecordVersion(note) {
    if (!note || !note.id) return;
    editCountSinceLastVersion++;
    if (editCountSinceLastVersion >= 5) {
      editCountSinceLastVersion = 0;
      await createVersionSnapshot(note.id, note.title, note.content_html || note.content, 'Autosave checkpoint');
    }
  }

  /**
   * Explicitly records a new version snapshot.
   */
  async function createVersionSnapshot(noteId, title, contentHtml, summary = 'Snapshot') {
    if (!noteId || noteId === 'new') return;
    try {
      if (App.api.createNoteHistory) {
        await App.api.createNoteHistory({
          note_id: noteId,
          title: title || 'Untitled Note',
          content_html: contentHtml || '',
          change_summary: summary
        });
      }
    } catch (e) {
      // Local fallback for version snapshots
      try {
        const key = `ios_note_versions_${noteId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift({
          id: Date.now(),
          note_id: noteId,
          title: title || 'Untitled Note',
          content_html: contentHtml || '',
          change_summary: summary,
          created_at: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(existing.slice(0, 30)));
      } catch (_) {}
    }
  }

  /**
   * Lists version history for a note.
   */
  async function listVersionHistory(noteId) {
    if (!noteId || noteId === 'new') return [];
    try {
      if (App.api.listNoteHistory) {
        const remote = await App.api.listNoteHistory(noteId);
        if (remote && remote.length) return remote;
      }
    } catch (_) {}

    // Fallback to local storage version history
    try {
      const key = `ios_note_versions_${noteId}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (_) {
      return [];
    }
  }

  /**
   * Schedules a debounced autosave of current note edits.
   */
  function scheduleAutosave(noteId, payload, onStatusChange = () => {}) {
    dirty = true;
    pendingData = { noteId, payload };
    saveLocalDraft(noteId, payload);
    onStatusChange('saving');

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await executeSave(onStatusChange);
    }, AUTOSAVE_DELAY_MS);
  }

  /**
   * Immediately saves any pending edits without waiting for debounce timer.
   */
  async function forceSaveNow(onStatusChange = () => {}) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    return await executeSave(onStatusChange);
  }

  /**
   * Internal save execution handler with conflict protection.
   */
  async function executeSave(onStatusChange = () => {}) {
    if (!pendingData || !pendingData.noteId) {
      onStatusChange('saved');
      dirty = false;
      return null;
    }

    if (isCurrentlySaving) {
      hasPendingSave = true;
      return null;
    }

    const { noteId, payload } = pendingData;
    isCurrentlySaving = true;
    onStatusChange('saving');

    try {
      let savedNote = null;
      if (noteId === 'new' || noteId === 0) {
        savedNote = await App.api.createNote(payload);
      } else {
        savedNote = await App.api.updateNote(noteId, payload);
      }

      dirty = false;
      clearLocalDraft(noteId);
      onStatusChange('saved');
      maybeRecordVersion(savedNote || { id: noteId, ...payload });
      return savedNote;
    } catch (err) {
      console.warn('[NotesSync] Autosave notice:', err);
      onStatusChange('failed', err.message || 'Save failed - draft kept locally');
      saveLocalDraft(noteId, payload);
      return null;
    } finally {
      isCurrentlySaving = false;
      if (hasPendingSave) {
        hasPendingSave = false;
        await executeSave(onStatusChange);
      }
    }
  }

  /**
   * Factory creating an isolated sync manager for the active editor session.
   */
  function createSyncManager(options = {}) {
    const {
      noteId,
      debounceMs = 800,
      saveFn,
      onStatusChange = () => {},
      onConflict = () => {},
    } = options;

    let timer = null;
    let pendingPayload = null;
    let isSaving = false;
    let hasQueuedSave = false;

    function queueSave(payload) {
      pendingPayload = payload;
      saveLocalDraft(noteId, payload);
      onStatusChange('saving', { pending: true });

      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        await flush();
      }, debounceMs);
    }

    async function flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pendingPayload) {
        onStatusChange('saved');
        return;
      }
      if (isSaving) {
        hasQueuedSave = true;
        return;
      }

      isSaving = true;
      const dataToSave = Object.assign({}, pendingPayload);
      onStatusChange('saving');

      try {
        let result = null;
        if (typeof saveFn === 'function') {
          result = await saveFn(dataToSave);
        } else if (noteId && noteId !== 'new') {
          result = await App.api.updateNote(noteId, dataToSave);
        } else {
          result = await App.api.createNote(dataToSave);
        }

        clearLocalDraft(noteId);
        onStatusChange('saved', result);
        maybeRecordVersion(result || { id: noteId, ...dataToSave });
        return result;
      } catch (err) {
        console.warn('[NotesSync] save error:', err);
        saveLocalDraft(noteId, dataToSave);
        onStatusChange('failed', err);
        return null;
      } finally {
        isSaving = false;
        if (hasQueuedSave) {
          hasQueuedSave = false;
          await flush();
        }
      }
    }

    function destroy() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingPayload = null;
    }

    return {
      queueSave,
      flush,
      destroy,
      isDirty: () => !!pendingPayload,
    };
  }

  return {
    isDirty,
    setDirty,
    scheduleAutosave,
    forceSaveNow,
    saveLocalDraft,
    getLocalDraft,
    clearLocalDraft,
    createVersionSnapshot,
    listVersionHistory,
    createSyncManager,
  };
})();
