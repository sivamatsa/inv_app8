/* Unified Security Controller: Biometrics (Face ID/Fingerprint), 4-Digit Quick PIN, & Password
   Provides a multi-tier authentication experience:
   1. Biometric Authentication (Primary instant unlock)
   2. 4-Digit Cryptographic PIN (Fast fallback with numeric keypad)
   3. Account Password (Manual recovery / authoritative fallback)
*/
window.App = window.App || {};

App.security = (function () {
  const PIN_STORAGE_PREFIX = 'pios_pin_sec_v1_';
  const PIN_ENABLED_PREFIX = 'pios_pin_enabled_v1_';
  let isSessionUnlocked = false;

  // Compute SHA-256 hash of PIN with user-specific salt
  async function hashPin(pin, userIdentifier) {
    const salt = `pios_salt_sec_${userIdentifier || 'default'}_secure_2026`;
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function isPinSet(userId) {
    if (!userId) return false;
    try {
      return Boolean(localStorage.getItem(PIN_STORAGE_PREFIX + userId));
    } catch (e) {
      return false;
    }
  }

  function isPinEnabled(userId) {
    if (!userId) return false;
    try {
      const enabledVal = localStorage.getItem(PIN_ENABLED_PREFIX + userId);
      // Default to true if PIN is set and not explicitly disabled
      return isPinSet(userId) && enabledVal !== 'false';
    } catch (e) {
      return false;
    }
  }

  async function setPin(userId, pin, userEmail) {
    if (!userId || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 numeric digits.');
    }
    const hashed = await hashPin(pin, userEmail || userId);
    localStorage.setItem(PIN_STORAGE_PREFIX + userId, hashed);
    localStorage.setItem(PIN_ENABLED_PREFIX + userId, 'true');

    if (App.backupProfileDb && App.backupProfileDb.saveSystemKv) {
      await App.backupProfileDb.saveSystemKv('user_pin_' + userId, { hash: hashed, enabled: true }).catch(() => {});
    }
    return true;
  }

  async function verifyPin(userId, pin, userEmail) {
    if (!userId || !pin || pin.length !== 4) return false;
    const storedHash = localStorage.getItem(PIN_STORAGE_PREFIX + userId);
    if (!storedHash) return false;
    const computedHash = await hashPin(pin, userEmail || userId);
    return storedHash === computedHash;
  }

  async function changePin(userId, oldPin, newPin, userEmail) {
    const isValidOld = await verifyPin(userId, oldPin, userEmail);
    if (!isValidOld) {
      throw new Error('Current 4-digit PIN is incorrect.');
    }
    return setPin(userId, newPin, userEmail);
  }

  function disablePin(userId) {
    if (userId) {
      localStorage.setItem(PIN_ENABLED_PREFIX + userId, 'false');
      localStorage.removeItem(PIN_STORAGE_PREFIX + userId);
    }
    return true;
  }

  function setPinEnabled(userId, enabled) {
    if (userId) {
      localStorage.setItem(PIN_ENABLED_PREFIX + userId, enabled ? 'true' : 'false');
    }
  }

  function isUnlocked() {
    return isSessionUnlocked;
  }

  function markUnlocked() {
    isSessionUnlocked = true;
  }

  function lockSession() {
    isSessionUnlocked = false;
  }

  // Open 4-Digit PIN Setup / Change Modal
  function openPinSetupModal(user, onComplete) {
    const isExisting = isPinSet(user.id);
    let step = isExisting ? 'verify_old' : 'enter_new';
    let oldPinVal = '';
    let newPinVal = '';
    let confirmPinVal = '';

    const modalId = 'pinSetupModal';
    const existing = document.getElementById(modalId);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(3,7,18,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px);animation:fadeIn 0.2s ease-out';

    function renderModalContent() {
      let title = 'Setup 4-Digit Quick PIN';
      let subtitle = 'Enter a 4-digit PIN for instant access to your portfolio.';
      let currentVal = '';

      if (step === 'verify_old') {
        title = 'Enter Current 4-Digit PIN';
        subtitle = 'Verify your existing PIN before setting a new one.';
        currentVal = oldPinVal;
      } else if (step === 'enter_new') {
        title = isExisting ? 'Enter New 4-Digit PIN' : 'Create 4-Digit Quick PIN';
        subtitle = 'Choose a secure 4-digit numeric passcode.';
        currentVal = newPinVal;
      } else if (step === 'confirm_new') {
        title = 'Confirm Your New PIN';
        subtitle = 'Re-enter your 4-digit PIN to confirm.';
        currentVal = confirmPinVal;
      }

      modal.innerHTML = `
        <div style="background:var(--bg2,#0f172a);border:1px solid rgba(201,168,76,0.4);border-radius:20px;max-width:380px;width:100%;padding:28px 24px;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,0.85)">
          
          <div style="width:58px;height:58px;border-radius:50%;background:rgba(201,168,76,0.15);border:2px solid rgba(201,168,76,0.3);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 14px">
            🔢
          </div>

          <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px">${title}</div>
          <div style="font-size:12.5px;color:var(--text2);margin-bottom:20px">${subtitle}</div>

          <!-- PIN Dots Indicator -->
          <div style="display:flex;justify-content:center;gap:14px;margin-bottom:22px" id="pinDotsWrap">
            ${[0, 1, 2, 3].map((i) => `
              <div style="width:16px;height:16px;border-radius:50%;border:2px solid var(--gold);background:${i < currentVal.length ? 'var(--gold)' : 'transparent'};transition:all 0.15s ease;transform:${i < currentVal.length ? 'scale(1.15)' : 'scale(1)'}"></div>
            `).join('')}
          </div>

          <div id="pinSetupError" style="font-size:12px;color:var(--red,#ef4444);margin-bottom:16px;min-height:16px"></div>

          <!-- Keypad Grid -->
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;max-width:280px;margin:0 auto 18px" id="pinKeypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `
              <button class="pin-key-btn" data-key="${n}" style="height:52px;border-radius:12px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:20px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.1s ease">${n}</button>
            `).join('')}
            <button class="pin-key-btn" data-key="clear" style="height:52px;border-radius:12px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center">Clear</button>
            <button class="pin-key-btn" data-key="0" style="height:52px;border-radius:12px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:20px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center">0</button>
            <button class="pin-key-btn" data-key="backspace" style="height:52px;border-radius:12px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">⌫</button>
          </div>

          <button class="btn btn-outline w-full" id="btnCancelPinSetup" style="padding:8px;font-size:13px">
            Cancel
          </button>

        </div>
      `;

      wireEvents();
    }

    function wireEvents() {
      const errorEl = modal.querySelector('#pinSetupError');
      const dotsWrap = modal.querySelector('#pinDotsWrap');

      const shake = () => {
        if (dotsWrap) {
          dotsWrap.style.animation = 'shake 0.35s ease';
          setTimeout(() => { dotsWrap.style.animation = ''; }, 400);
        }
      };

      const close = () => {
        window.removeEventListener('keydown', handleGlobalKey);
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      };

      modal.querySelector('#btnCancelPinSetup').addEventListener('click', close);

      const handleDigit = async (digit) => {
        errorEl.textContent = '';
        if (step === 'verify_old') {
          if (oldPinVal.length < 4) oldPinVal += digit;
          renderModalContent();
          if (oldPinVal.length === 4) {
            const ok = await verifyPin(user.id, oldPinVal, user.email);
            if (!ok) {
              shake();
              errorEl.textContent = 'Current PIN is incorrect.';
              oldPinVal = '';
              setTimeout(renderModalContent, 600);
            } else {
              step = 'enter_new';
              renderModalContent();
            }
          }
        } else if (step === 'enter_new') {
          if (newPinVal.length < 4) newPinVal += digit;
          renderModalContent();
          if (newPinVal.length === 4) {
            step = 'confirm_new';
            renderModalContent();
          }
        } else if (step === 'confirm_new') {
          if (confirmPinVal.length < 4) confirmPinVal += digit;
          renderModalContent();
          if (confirmPinVal.length === 4) {
            if (confirmPinVal !== newPinVal) {
              shake();
              errorEl.textContent = 'PINs do not match. Try again.';
              confirmPinVal = '';
              newPinVal = '';
              step = 'enter_new';
              setTimeout(renderModalContent, 800);
            } else {
              await setPin(user.id, newPinVal, user.email);
              App.utils.toast('4-Digit Quick PIN saved securely.');
              close();
              if (typeof onComplete === 'function') onComplete();
            }
          }
        }
      };

      const handleBackspace = () => {
        if (step === 'verify_old' && oldPinVal.length > 0) oldPinVal = oldPinVal.slice(0, -1);
        else if (step === 'enter_new' && newPinVal.length > 0) newPinVal = newPinVal.slice(0, -1);
        else if (step === 'confirm_new' && confirmPinVal.length > 0) confirmPinVal = confirmPinVal.slice(0, -1);
        renderModalContent();
      };

      const handleClear = () => {
        if (step === 'verify_old') oldPinVal = '';
        else if (step === 'enter_new') newPinVal = '';
        else if (step === 'confirm_new') confirmPinVal = '';
        renderModalContent();
      };

      modal.querySelectorAll('.pin-key-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.key;
          if (k === 'clear') handleClear();
          else if (k === 'backspace') handleBackspace();
          else if (/^\d$/.test(k)) handleDigit(k);
        });
      });

      const handleGlobalKey = (e) => {
        if (/^\d$/.test(e.key)) handleDigit(e.key);
        else if (e.key === 'Backspace') handleBackspace();
        else if (e.key === 'Escape') close();
      };

      window.addEventListener('keydown', handleGlobalKey);
    }

    document.body.appendChild(modal);
    renderModalContent();
  }

  // Open 4-Digit PIN Unlock Screen (with Biometric and Password switchers)
  function openPinUnlockModal(user, onSuccess, onSwitchPassword, onSwitchBiometrics) {
    const modalId = 'pinUnlockModal';
    const existing = document.getElementById(modalId);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    let enteredPin = '';
    const bioAvailable = App.biometrics && App.biometrics.isEnabled && App.biometrics.isEnabled(user.id);

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(3,7,18,0.94);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(10px);animation:fadeIn 0.2s ease-out';

    function renderContent() {
      modal.innerHTML = `
        <div style="background:var(--bg2,#0f172a);border:1px solid rgba(201,168,76,0.4);border-radius:22px;max-width:380px;width:100%;padding:28px 24px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,0.9)">
          
          <div style="width:62px;height:62px;border-radius:50%;background:rgba(201,168,76,0.15);border:2px solid rgba(201,168,76,0.3);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 14px">
            🔒
          </div>

          <div style="font-size:19px;font-weight:700;color:var(--text);margin-bottom:4px">Portfolio App Locked</div>
          <div style="font-size:12.5px;color:var(--text2);margin-bottom:22px">
            Enter your <b>4-Digit Security PIN</b> to unlock.
          </div>

          <!-- PIN Dots Indicator -->
          <div style="display:flex;justify-content:center;gap:16px;margin-bottom:20px" id="unlockPinDots">
            ${[0, 1, 2, 3].map((i) => `
              <div style="width:16px;height:16px;border-radius:50%;border:2px solid var(--gold);background:${i < enteredPin.length ? 'var(--gold)' : 'transparent'};transition:all 0.15s ease;transform:${i < enteredPin.length ? 'scale(1.18)' : 'scale(1)'}"></div>
            `).join('')}
          </div>

          <div id="pinUnlockError" style="font-size:12px;color:var(--red,#ef4444);margin-bottom:14px;min-height:16px"></div>

          <!-- Keypad Grid -->
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;max-width:280px;margin:0 auto 16px" id="unlockKeypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `
              <button class="pin-key-btn" data-key="${n}" style="height:52px;border-radius:12px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:21px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.1s ease">${n}</button>
            `).join('')}
            <button class="pin-key-btn" data-key="clear" style="height:52px;border-radius:12px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center">Clear</button>
            <button class="pin-key-btn" data-key="0" style="height:52px;border-radius:12px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:21px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center">0</button>
            <button class="pin-key-btn" data-key="backspace" style="height:52px;border-radius:12px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">⌫</button>
          </div>

          <!-- Alternative Auth Methods -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border2)">
            ${bioAvailable ? `
              <button class="btn btn-gold btn-sm w-full" id="btnSwitchToBio" style="padding:9px;font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:6px">
                <span>👆</span> Unlock with Biometrics (Face ID)
              </button>
            ` : ''}
            <button class="btn btn-outline btn-sm w-full" id="btnSwitchToPassword" style="padding:9px;font-size:12.5px">
              🔑 Enter Account Password
            </button>
          </div>

        </div>
      `;

      wireEvents();
    }

    function wireEvents() {
      const errorEl = modal.querySelector('#pinUnlockError');
      const dotsWrap = modal.querySelector('#unlockPinDots');

      const shake = () => {
        if (dotsWrap) {
          dotsWrap.style.animation = 'shake 0.35s ease';
          setTimeout(() => { dotsWrap.style.animation = ''; }, 400);
        }
      };

      const close = () => {
        window.removeEventListener('keydown', handleGlobalKey);
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      };

      const handleDigit = async (digit) => {
        if (enteredPin.length < 4) {
          enteredPin += digit;
          renderContent();

          if (enteredPin.length === 4) {
            const ok = await verifyPin(user.id, enteredPin, user.email);
            if (ok) {
              markUnlocked();
              close();
              if (typeof onSuccess === 'function') onSuccess();
            } else {
              shake();
              errorEl.textContent = 'Incorrect PIN. Try again.';
              enteredPin = '';
              setTimeout(renderContent, 600);
            }
          }
        }
      };

      const handleBackspace = () => {
        if (enteredPin.length > 0) {
          enteredPin = enteredPin.slice(0, -1);
          renderContent();
        }
      };

      const handleClear = () => {
        enteredPin = '';
        renderContent();
      };

      modal.querySelectorAll('.pin-key-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.key;
          if (k === 'clear') handleClear();
          else if (k === 'backspace') handleBackspace();
          else if (/^\d$/.test(k)) handleDigit(k);
        });
      });

      const handleGlobalKey = (e) => {
        if (/^\d$/.test(e.key)) handleDigit(e.key);
        else if (e.key === 'Backspace') handleBackspace();
      };

      window.addEventListener('keydown', handleGlobalKey);

      modal.querySelector('#btnSwitchToPassword')?.addEventListener('click', () => {
        close();
        if (typeof onSwitchPassword === 'function') onSwitchPassword();
      });

      modal.querySelector('#btnSwitchToBio')?.addEventListener('click', () => {
        close();
        if (typeof onSwitchBiometrics === 'function') onSwitchBiometrics();
      });
    }

    document.body.appendChild(modal);
    renderContent();
  }

  // Master Protected Entrance Flow (Biometric -> PIN -> Password)
  function tryEnterProtectedApp(user, onAllowed, onDenied) {
    if (!user || !user.id || isSessionUnlocked) {
      if (typeof onAllowed === 'function') onAllowed();
      return;
    }

    const bioEnabled = App.biometrics && App.biometrics.isEnabled && App.biometrics.isEnabled(user.id);
    const pinEnabled = isPinEnabled(user.id);

    // Level 1: Biometric Primary
    if (bioEnabled) {
      App.biometrics.openBiometricUnlockModal(
        user,
        () => {
          markUnlocked();
          if (typeof onAllowed === 'function') onAllowed();
        },
        () => {
          // User tapped fallback or biometrics failed
          if (pinEnabled) {
            openPinUnlockModal(
              user,
              () => {
                markUnlocked();
                if (typeof onAllowed === 'function') onAllowed();
              },
              () => {
                // Password fallback
                openPasswordFallbackModal(user, onAllowed, onDenied);
              },
              () => {
                // Return to biometrics
                tryEnterProtectedApp(user, onAllowed, onDenied);
              }
            );
          } else {
            openPasswordFallbackModal(user, onAllowed, onDenied);
          }
        }
      );
      return;
    }

    // Level 2: 4-Digit Quick PIN
    if (pinEnabled) {
      openPinUnlockModal(
        user,
        () => {
          markUnlocked();
          if (typeof onAllowed === 'function') onAllowed();
        },
        () => {
          openPasswordFallbackModal(user, onAllowed, onDenied);
        },
        null
      );
      return;
    }

    // Level 3: No biometric/PIN configured, allow session directly
    markUnlocked();
    if (typeof onAllowed === 'function') onAllowed();
  }

  // Password verification modal for fallback unlock
  function openPasswordFallbackModal(user, onAllowed, onDenied) {
    const fields = [
      { key: 'unlock_password', label: 'Account Password', type: 'password', required: true, span: 2 },
    ];

    App.ui.open({
      title: '🔐 Authorize Session with Password',
      bodyHtml: `
        <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px">
          Enter the password for <b>${App.utils.escapeHtml(user.email || 'your account')}</b> to unlock this session.
        </div>
        ${App.ui.renderForm(fields, {})}
        <div class="auth-error" id="pwUnlockError"></div>
      `,
      actions: [
        {
          label: 'Sign Out Account',
          className: 'btn-outline',
          onClick: () => {
            App.ui.close();
            if (typeof onDenied === 'function') onDenied();
            else if (App.auth && App.auth.signOut) App.auth.signOut();
          },
        },
        {
          label: 'Unlock Session',
          className: 'btn-gold',
          onClick: async () => {
            const { values, errors } = App.ui.readForm(fields);
            if (errors.length || !values.unlock_password) {
              App.utils.qs('#pwUnlockError').textContent = 'Password is required.';
              return;
            }

            try {
              // Verify credentials with supabase/auth
              const { error } = await App.auth.signIn(user.email, values.unlock_password);
              if (error) throw error;
              markUnlocked();
              App.ui.close();
              App.utils.toast('Session unlocked successfully.');
              if (typeof onAllowed === 'function') onAllowed();
            } catch (err) {
              App.utils.qs('#pwUnlockError').textContent = err.message || 'Incorrect password.';
            }
          },
        },
      ],
    });
  }

  return {
    isPinSet,
    isPinEnabled,
    setPin,
    verifyPin,
    changePin,
    disablePin,
    setPinEnabled,
    openPinSetupModal,
    openPinUnlockModal,
    tryEnterProtectedApp,
    isUnlocked,
    markUnlocked,
    lockSession,
  };
})();
