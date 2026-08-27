/* Audit History (spec Section 30) - read-only view over audit_logs, which
   is populated exclusively by the audit_row_change() trigger (see
   006_audit_imports.sql) - nothing in this app writes to it directly. */
window.App = window.App || {};

(function () {
  async function renderAuditView() {
    const isDemo = App.auth && App.auth.isDemoMode && App.auth.isDemoMode();
    const isAdminOrDev = !isDemo && App.utils.isAdminOrDev(App.state.profile);

    if (isDemo || !isAdminOrDev) {
      App.utils.toast('Audit History has been moved to the Admin & Developer Portal.', 'err');
      App.router.navigate('dashboard');
      return;
    }

    // Redirect to Admin & Developer Portal Audit section
    App.router.navigate('admin');
  }

  App.router.register('audit', renderAuditView);
})();
