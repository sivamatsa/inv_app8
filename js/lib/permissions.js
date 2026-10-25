/* Granular Role-Based Portfolio Sharing & Permissions Matrix (RBAC)
   Enforces uniform access boundaries across Owner, Co-Manager, Editor/Contributor,
   Commenter, and Viewer roles, including maskable amounts & returns. */
window.App = window.App || {};

App.permissions = (function () {
  /**
   * Retrieves active workspace context or defaults to personal ownership
   */
  function getContext() {
    return App.state && App.state.activePortfolioContext;
  }

  function isSharedContext() {
    return !!getContext();
  }

  function getRole() {
    const ctx = getContext();
    if (!ctx) return 'Owner';
    return ctx.role || 'Viewer';
  }

  function getScope(key, defaultValue = true) {
    const ctx = getContext();
    if (!ctx || !ctx.permissions) return true;
    return ctx.permissions[key] !== false;
  }

  function isOwnerOrAdmin() {
    if (!isSharedContext()) return true;
    const user = App.auth.getUser();
    if (user && user.is_admin) return true;
    const role = getRole();
    return role === 'Owner' || role === 'Admin';
  }

  function isCoManager() {
    if (isOwnerOrAdmin()) return true;
    const role = getRole();
    return role === 'Co-Manager' || role === 'Full Access' || role === 'Full co-manager privileges';
  }

  function isEditorOrContributor() {
    if (isCoManager()) return true;
    const role = getRole();
    return role === 'Editor' || role === 'Contributor';
  }

  function isCommenter() {
    if (isEditorOrContributor()) return true;
    const role = getRole();
    return role === 'Commenter';
  }

  // --- Granular Action Capability Queries ---

  function canCreateDeal() {
    if (!isSharedContext()) return true;
    return isEditorOrContributor();
  }

  function canEditDeal(deal) {
    if (!isSharedContext()) return true;
    if (isCoManager()) return true;
    if (isEditorOrContributor()) {
      // Contributors can edit if they created it or if general editor
      return true;
    }
    return false;
  }

  function canDeleteDeal(deal) {
    if (!isSharedContext()) return true;
    return isCoManager();
  }

  function canRecordPayment() {
    if (!isSharedContext()) return true;
    return isEditorOrContributor();
  }

  function canVoidPayment() {
    if (!isSharedContext()) return true;
    return isCoManager();
  }

  function canUploadDocument() {
    if (!isSharedContext()) return true;
    return isEditorOrContributor() && getScope('view_documents', true);
  }

  function canDeleteDocument() {
    if (!isSharedContext()) return true;
    return isCoManager();
  }

  function canAddComment() {
    if (!isSharedContext()) return true;
    return isCommenter();
  }

  function canManageMembers() {
    if (!isSharedContext()) return true;
    return isOwnerOrAdmin();
  }

  function canViewAmounts() {
    if (!isSharedContext()) return true;
    if (isCoManager()) return true;
    return getScope('view_amounts', true);
  }

  function canViewReturns() {
    if (!isSharedContext()) return true;
    if (isCoManager()) return true;
    return getScope('view_returns', true);
  }

  function canViewDeals() {
    if (!isSharedContext()) return true;
    return getScope('view_deals', true);
  }

  function canViewDocuments() {
    if (!isSharedContext()) return true;
    return getScope('view_documents', true);
  }

  function canViewContacts() {
    if (!isSharedContext()) return true;
    return getScope('view_contacts', false);
  }

  // --- Display Masking Formatters ---

  function maskMoney(val, fallback = '••••••') {
    if (canViewAmounts()) {
      return App.utils.fmtMoney(val);
    }
    return fallback;
  }

  function maskPct(val, fallback = '••%') {
    if (canViewReturns()) {
      return App.utils.fmtPct(val);
    }
    return fallback;
  }

  function maskDealName(name, index = 1) {
    if (canViewDeals()) {
      return App.utils.escapeHtml(name);
    }
    return `Confidential Asset ${index}`;
  }

  return {
    getContext,
    isSharedContext,
    getRole,
    getScope,
    isOwnerOrAdmin,
    isCoManager,
    isEditorOrContributor,
    isCommenter,
    canCreateDeal,
    canEditDeal,
    canDeleteDeal,
    canRecordPayment,
    canVoidPayment,
    canUploadDocument,
    canDeleteDocument,
    canAddComment,
    canManageMembers,
    canViewAmounts,
    canViewReturns,
    canViewDeals,
    canViewDocuments,
    canViewContacts,
    maskMoney,
    maskPct,
    maskDealName,
  };
})();
