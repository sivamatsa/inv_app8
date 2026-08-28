/* Biometric Authentication (WebAuthn / Passkeys / Platform Authenticator)
   Provides secure, hardware-backed Face ID / Fingerprint / Touch ID unlock
   for mobile and desktop devices with complete user opt-in/opt-out control. */
window.App = window.App || {};

App.biometrics = (function () {
  const STORAGE_KEY_PREFIX = 'pios_biometric_auth_v1_';
  const GLOBAL_BIOMETRIC_PREF_KEY = 'pios_biometric_enabled_global_v1';

  // Converts ArrayBuffer to Base64URL string
  function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Converts Base64URL string to ArrayBuffer
  function base64UrlToBuffer(base64Url) {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Check if device hardware supports WebAuthn platform authenticator (TouchID, FaceID, Windows Hello, Android Biometrics)
  async function isAvailable() {
    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        return false;
      }
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        return !!available;
      }
      return !!window.navigator.credentials;
    } catch (e) {
      console.warn('Biometric availability check notice:', e);
      return false;
    }
  }

  function getStoredCredential(userId) {
    if (!userId) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function isEnabled(userId) {
    if (!userId) {
      const globalPref = localStorage.getItem(GLOBAL_BIOMETRIC_PREF_KEY);
      return globalPref === 'true';
    }
    const cred = getStoredCredential(userId);
    return !!(cred && cred.enabled);
  }

  // Register device platform authenticator for the current user
  async function registerBiometrics(user) {
    if (!user || !user.id) {
      throw new Error('You must be signed in to register biometric authentication.');
    }

    const available = await isAvailable();
    if (!available) {
      throw new Error('Biometric hardware (Face ID / Fingerprint / Touch ID) is not supported or not configured on this device.');
    }

    const challenge = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(challenge);
    }

    const userIdBytes = new TextEncoder().encode(user.id);
    const userName = user.email || user.full_name || 'Portfolio User';

    const publicKeyOptions = {
      challenge: challenge.buffer,
      rp: {
        name: 'Investment Portfolio OS',
        id: window.location.hostname || 'localhost',
      },
      user: {
        id: userIdBytes.buffer,
        name: user.email || 'user@portfolio.local',
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256 (ECDSA)
        { type: 'public-key', alg: -257 }, // RS256 (RSA)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        requireResidentKey: false,
      },
      timeout: 60000,
      attestation: 'none',
    };

    try {
      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });
      if (!credential) {
        throw new Error('Biometric registration was not completed.');
      }

      const credIdBase64 = bufferToBase64Url(credential.rawId);
      const payload = {
        id: credIdBase64,
        userId: user.id,
        userEmail: user.email,
        userName: userName,
        registeredAt: new Date().toISOString(),
        device: navigator.userAgent.slice(0, 80),
        enabled: true,
      };

      localStorage.setItem(STORAGE_KEY_PREFIX + user.id, JSON.stringify(payload));
      localStorage.setItem(GLOBAL_BIOMETRIC_PREF_KEY, 'true');

      // Also persist credential reference in Backup Profile DB if available
      if (App.backupProfileDb && App.backupProfileDb.saveSystemKv) {
        await App.backupProfileDb.saveSystemKv('biometric_cred_' + user.id, payload).catch(() => {});
      }

      return payload;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Biometric enrollment was cancelled or timed out.');
      }
      throw new Error('Biometric setup failed: ' + (err.message || err));
    }
  }

  // Verify biometrics to authenticate on app resume or startup
  async function verifyBiometrics(userId) {
    const cred = getStoredCredential(userId);
    if (!cred || !cred.id || !cred.enabled) {
      throw new Error('Biometrics is not enabled for this account on this device.');
    }

    const available = await isAvailable();
    if (!available) {
      throw new Error('Biometric sensor is not ready.');
    }

    const challenge = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(challenge);
    }

    const publicKeyOptions = {
      challenge: challenge.buffer,
      allowCredentials: [
        {
          type: 'public-key',
          id: base64UrlToBuffer(cred.id),
        },
      ],
      userVerification: 'preferred',
      timeout: 45000,
    };

    try {
      const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });
      if (!assertion) {
        throw new Error('Biometric authentication failed.');
      }

      // Update last verified timestamp
      cred.lastVerifiedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(cred));
      return { ok: true, userId, verifiedAt: cred.lastVerifiedAt };
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Biometric authentication was cancelled.');
      }
      throw new Error('Biometric unlock failed: ' + (err.message || err));
    }
  }

  function disable(userId) {
    if (userId) {
      const cred = getStoredCredential(userId);
      if (cred) {
        cred.enabled = false;
        localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(cred));
      }
      localStorage.removeItem(STORAGE_KEY_PREFIX + userId);
    }
    localStorage.removeItem(GLOBAL_BIOMETRIC_PREF_KEY);
    return true;
  }

  // Show a responsive, battery-friendly unlock prompt on app launch
  function openBiometricUnlockModal(user, onSuccess, onFallback) {
    const existing = document.getElementById('biometricUnlockModal');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'biometricUnlockModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(3,7,18,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(10px);animation:fadeIn 0.2s ease-out';

    modal.innerHTML = `
      <div style="background:var(--bg2,#0f172a);border:1px solid rgba(201,168,76,0.4);border-radius:16px;max-width:380px;width:100%;padding:28px 24px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.85)">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(201,168,76,0.15);border:2px solid rgba(201,168,76,0.3);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 16px">
          🔒
        </div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px">Portfolio App Locked</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.4">
          Authenticate with <b>Biometrics (Face ID / Fingerprint)</b> to unlock your portfolio session.
        </div>
        
        <div id="bioModalError" style="font-size:12px;color:var(--red,#ef4444);margin-bottom:12px;min-height:16px"></div>

        <button class="btn btn-gold w-full" id="btnTriggerBioUnlock" style="padding:12px;font-size:14px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px">
          <span>👆</span> Unlock with Biometrics
        </button>

        <button class="btn btn-outline w-full" id="btnBioFallbackPassword" style="padding:10px;font-size:13px">
          Enter with Password / PIN
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const errorEl = modal.querySelector('#bioModalError');
    const unlockBtn = modal.querySelector('#btnTriggerBioUnlock');
    const fallbackBtn = modal.querySelector('#btnBioFallbackPassword');

    const close = () => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    };

    const triggerVerify = async () => {
      errorEl.textContent = '';
      unlockBtn.disabled = true;
      unlockBtn.innerHTML = '<span>⏳</span> Verifying sensor...';

      try {
        await verifyBiometrics(user.id);
        close();
        if (typeof onSuccess === 'function') onSuccess();
      } catch (err) {
        errorEl.textContent = err.message || 'Verification failed. Please try again.';
      } finally {
        unlockBtn.disabled = false;
        unlockBtn.innerHTML = '<span>👆</span> Unlock with Biometrics';
      }
    };

    unlockBtn.addEventListener('click', triggerVerify);
    fallbackBtn.addEventListener('click', () => {
      close();
      if (typeof onFallback === 'function') onFallback();
    });

    // Auto-trigger biometric prompt after a slight frame delay
    setTimeout(() => {
      triggerVerify();
    }, 200);
  }

  return {
    isAvailable,
    isEnabled,
    getStoredCredential,
    registerBiometrics,
    verifyBiometrics,
    disable,
    openBiometricUnlockModal,
  };
})();
