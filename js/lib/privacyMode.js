/* Privacy Mode Controller
   Blurs sensitive monetary and financial values across the entire application
   until the user hovers over or taps/clicks on them.
   Persisted per-device in localStorage and configurable via Settings. */
window.App = window.App || {};

App.privacyMode = (function () {
  const STORAGE_KEY = 'ios_privacy_mode_enabled_v1';
  let isEnabled = false;

  function init() {
    try {
      isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      isEnabled = false;
    }
    apply(isEnabled);
  }

  function isPrivacyModeActive() {
    return isEnabled;
  }

  function apply(active) {
    isEnabled = Boolean(active);
    try {
      localStorage.setItem(STORAGE_KEY, isEnabled ? 'true' : 'false');
    } catch (e) {}

    if (isEnabled) {
      document.documentElement.classList.add('privacy-mode-active');
      document.body && document.body.classList.add('privacy-mode-active');
    } else {
      document.documentElement.classList.remove('privacy-mode-active');
      document.body && document.body.classList.remove('privacy-mode-active');
    }

    // Update any toggle switches rendered in the DOM
    const toggles = document.querySelectorAll('.inp-privacy-mode-toggle, #privacyModeSettingToggle');
    toggles.forEach((el) => {
      if (el.checked !== isEnabled) el.checked = isEnabled;
    });

    document.dispatchEvent(new CustomEvent('privacy-mode-changed', { detail: { enabled: isEnabled } }));
  }

  function set(active) {
    apply(active);
  }

  function toggle() {
    apply(!isEnabled);
    return isEnabled;
  }

  return {
    init,
    isEnabled: isPrivacyModeActive,
    set,
    toggle,
  };
})();
