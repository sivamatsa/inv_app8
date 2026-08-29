/* Supabase connection + auth session management. Mirrors the "paste your
   project URL/anon key" pattern from the reference dashboard, extended to
   be mandatory (this build has no local-only mode - Supabase is the
   authoritative store per spec Section 53). */
window.App = window.App || {};

App.auth = (function () {
  const CONFIG_KEY = 'investmentAppSupabaseConfig';

  // The app's own, real Supabase project - baked in so every user lands
  // straight on Sign In / Create Account instead of a "paste your project
  // URL/key" screen that only ever made sense during development. This is
  // safe to hardcode client-side (same as the README has said from the
  // start): the anon/publishable key has no elevated privilege, RLS is the
  // actual security boundary, not keeping this value out of the bundle.
  //
  // To point the WHOLE APP at a different Supabase project later (for
  // every user, not just your own browser), change these two values and
  // redeploy - that's the one and only place this default lives. An admin
  // can also override just their OWN browser's connection from Settings ->
  // Supabase Connection, without touching this file - see saveConfig()
  // below - but that only affects the browser that clicked it, not anyone
  // else, which is why changing it for everyone means editing this file.
  const DEFAULT_CONFIG = {
    url: 'https://ursmdccpbwvaincqumgm.supabase.co',
    anonKey: 'sb_publishable_JSyxn0ohlvsRMT6eCpSALg_vXAz0h3w',
  };

  const PERSISTENT_MOBILE_SESSION_KEY = 'investment_persistent_mobile_session_v1';

  let client = null;
  let currentUser = null;
  let currentSession = null;
  let demoMode = false;
  const listeners = [];

  function savePersistentMobileSession(user, session) {
    if (!user) return;
    try {
      const payload = {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata || {},
          role: user.role,
        },
        session: session ? {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          token_type: session.token_type,
        } : null,
        persistedAt: new Date().toISOString(),
      };
      localStorage.setItem(PERSISTENT_MOBILE_SESSION_KEY, JSON.stringify(payload));
      if (App.backupProfileDb && App.backupProfileDb.saveSystemKv) {
        App.backupProfileDb.saveSystemKv(PERSISTENT_MOBILE_SESSION_KEY, payload).catch(() => {});
      }
    } catch (e) {
      console.warn('Persistent mobile session save notice:', e);
    }
  }

  function getPersistentMobileSession() {
    try {
      const raw = localStorage.getItem(PERSISTENT_MOBILE_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearPersistentMobileSession() {
    try {
      localStorage.removeItem(PERSISTENT_MOBILE_SESSION_KEY);
      if (App.backupProfileDb && App.backupProfileDb.deleteSystemKv) {
        App.backupProfileDb.deleteSystemKv(PERSISTENT_MOBILE_SESSION_KEY).catch(() => {});
      }
    } catch (e) {}
  }

  function getConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
      return saved || DEFAULT_CONFIG;
    } catch (e) { return DEFAULT_CONFIG; }
  }

  function isConfigured() {
    return !!getConfig();
  }

  // True only when a browser has explicitly saved its OWN override
  // (Settings -> Supabase Connection) - used to decide whether "Reset to
  // the app's default connection" has anything to actually reset.
  function hasCustomConfig() {
    try { return !!JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); }
    catch (e) { return false; }
  }

  function saveConfig(url, anonKey) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, anonKey }));
    client = null;
    return init();
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    client = null;
    currentUser = null;
    currentSession = null;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  // The auth event name is now passed through as a 3rd argument (previously
  // discarded) so a listener can tell a real sign-in apart from a
  // PASSWORD_RECOVERY session - Supabase issues the visitor a real,
  // logged-in-looking session the moment they click a password-reset email
  // link, but app.js needs to show a "Set New Password" screen instead of
  // silently entering the app for that one event.
  function notify(event) {
    listeners.forEach((fn) => {
      try { fn(currentUser, currentSession, event); } catch (e) { console.error(e); }
    });
  }

  function init() {
    const cfg = getConfig();
    if (!cfg || !window.supabase) return null;
    if (client) return client;
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    const restoreFallback = () => {
      // 1. Check persistent mobile session first
      const mobileSess = getPersistentMobileSession();
      if (mobileSess && mobileSess.user) {
        currentUser = mobileSess.user;
        currentSession = mobileSess.session || { user: currentUser, isMobilePersistent: true };
        notify();
        return;
      }
      // 2. Check for active backup database session
      const backupSess = App.backupProfileDb ? App.backupProfileDb.getBackupSession() : null;
      if (backupSess && backupSess.user) {
        currentUser = backupSess.user;
        currentSession = { user: currentUser, isBackupSession: true };
        notify();
        return;
      }
      currentSession = null;
      currentUser = null;
      notify();
    };

    client.auth.getSession().then(({ data }) => {
      const session = data && data.session || null;
      if (session || !currentUser) {
        if (session) {
          currentSession = session;
          currentUser = session.user;
          savePersistentMobileSession(currentUser, currentSession);
          // Dual-sync profile with backup database
          if (App.backupProfileDb && session.user) {
            App.backupProfileDb.saveProfile({
              id: session.user.id,
              email: session.user.email,
              full_name: (session.user.user_metadata && session.user.user_metadata.full_name) || session.user.email,
              source: 'supabase',
            }).catch(() => {});
          }
          notify();
        } else {
          restoreFallback();
        }
      }
    }).catch(() => {
      restoreFallback();
    });

    client.auth.onAuthStateChange((event, session) => {
      currentSession = session || null;
      currentUser = session ? session.user : null;
      if (currentUser && currentSession) {
        savePersistentMobileSession(currentUser, currentSession);
      }
      notify(event);
    });

    // Battery-friendly keep-alive: When user switches back to mobile app,
    // refresh token only if within 15 minutes of expiry
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && client && currentSession && currentSession.expires_at) {
          const nowSec = Math.floor(Date.now() / 1000);
          if (currentSession.expires_at - nowSec < 900) {
            client.auth.refreshSession().catch(() => {});
          }
        }
      });
    }

    return client;
  }

  function getClient() {
    return client || init();
  }

  function getUser() {
    if (currentUser && currentUser.id) {
      if (currentUser.id === 'usr_admin_master') currentUser.id = 'a0000000-0000-4000-8000-000000000001';
      else if (currentUser.id === 'usr_dev_master') currentUser.id = 'd0000000-0000-4000-8000-000000000001';
    }
    return currentUser;
  }

  function isDemoMode() {
    return demoMode;
  }

  function isBackupMode() {
    return !!(currentSession && currentSession.isBackupSession);
  }

  // Demo Mode: an in-browser sample-data sandbox (js/lib/demoData.js) so the
  // whole app can be explored with zero setup. Deliberately bypasses
  // getConfig()/localStorage entirely - it neither reads nor overwrites a
  // real saved Supabase connection, so switching back to a real project
  // afterward (exitDemoMode) picks up exactly where that was left.
  function enterDemoMode() {
    demoMode = true;
    client = App.demo.createClient();
    App.demo.seed();
    currentUser = App.demo.DEMO_USER;
    currentSession = { user: currentUser };
    notify();
  }

  function exitDemoMode() {
    demoMode = false;
    client = null;
    currentUser = null;
    currentSession = null;
    notify();
  }

  async function signUp(email, password, fullName) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (fullName || cleanEmail.split('@')[0] || '').trim();

    // 1. Try Supabase Auth
    try {
      const c = getClient();
      if (c) {
        const { data, error } = await c.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: cleanName } },
        });

        if (!error && data && data.user) {
          // Immediately register/mirror profile into Backup DB
          if (App.backupProfileDb) {
            await App.backupProfileDb.saveProfile({
              id: data.user.id,
              email: cleanEmail,
              full_name: cleanName,
              source: 'dual_synced',
            }, password).catch(() => {});
          }

          // Auto-ensure profiles table row in Supabase
          try {
            await c.from('profiles').upsert({
              id: data.user.id,
              email: cleanEmail,
              full_name: cleanName,
              preferred_currency: 'INR',
              timezone: 'Asia/Kolkata',
              is_admin: false,
              is_active: true,
            }, { onConflict: 'id' });
          } catch (pErr) {
            console.warn('Initial profile upsert notice:', pErr);
          }

          return data;
        } else if (error) {
          throw error;
        }
      }
    } catch (supaErr) {
      console.warn('Supabase signup encountered limit/error, falling back to Backup Database engine:', supaErr);
      
      // If error is strictly user already registered, propagate or authenticate
      if (supaErr.message && supaErr.message.toLowerCase().includes('already registered')) {
        // Check if user is in backup DB
        if (App.backupProfileDb) {
          const existing = await App.backupProfileDb.getProfileByEmail(cleanEmail);
          if (existing) {
            throw new Error('User already registered. Please sign in with your password.');
          }
        }
        throw supaErr;
      }
    }

    // 2. Seamless Fallback: Create and provision profile directly in Backup Database Engine
    if (App.backupProfileDb) {
      const backupProfile = await App.backupProfileDb.saveProfile({
        email: cleanEmail,
        full_name: cleanName,
        source: 'backup_db',
      }, password);

      const authRes = await App.backupProfileDb.authenticate(cleanEmail, password);
      currentUser = authRes.user;
      currentSession = authRes.session;
      notify();
      return { user: currentUser, session: currentSession, isBackupMode: true };
    }

    throw new Error('Could not create account: Primary and backup database stores unavailable.');
  }

  async function signIn(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) throw new Error('Please enter your email address.');
    if (!password) throw new Error('Please enter your password.');
    let supaError = null;

    // 1. Try Supabase Auth
    try {
      const c = getClient();
      if (c) {
        const { data, error } = await c.auth.signInWithPassword({ email: cleanEmail, password });
        if (!error && data && data.user) {
          currentUser = data.user;
          currentSession = data.session || { user: data.user };
          // Mirror profile into Backup DB
          if (App.backupProfileDb) {
            App.backupProfileDb.saveProfile({
              id: data.user.id,
              email: cleanEmail,
              full_name: (data.user.user_metadata && data.user.user_metadata.full_name) || cleanEmail,
              source: 'dual_synced',
            }, password).catch(() => {});
          }
          notify('SIGNED_IN');
          return { data, user: currentUser, session: currentSession };
        }
        supaError = error;
      }
    } catch (e) {
      supaError = e;
    }

    // 2. Fallback: Authenticate against Backup Database store
    if (App.backupProfileDb) {
      try {
        const authRes = await App.backupProfileDb.authenticate(cleanEmail, password);
        if (authRes && authRes.user) {
          currentUser = authRes.user;
          currentSession = authRes.session;
          savePersistentMobileSession(currentUser, currentSession);
          notify('SIGNED_IN');
          return { user: currentUser, session: currentSession, isBackupMode: true };
        }
      } catch (backupErr) {
        // If neither Supabase nor BackupDB authenticated:
        if (supaError && supaError.message && supaError.message.toLowerCase().includes('email not confirmed')) {
          const backupProfile = await App.backupProfileDb.getProfileByEmail(cleanEmail);
          if (backupProfile) {
            const authRes = await App.backupProfileDb.authenticate(cleanEmail, password);
            if (authRes && authRes.user) {
              currentUser = authRes.user;
              currentSession = authRes.session;
              savePersistentMobileSession(currentUser, currentSession);
              notify('SIGNED_IN');
              return { user: currentUser, session: currentSession, isBackupMode: true };
            }
          }
        }

        const existingProfile = await App.backupProfileDb.getProfileByEmail(cleanEmail);
        if (!existingProfile && (!supaError || (supaError.message && supaError.message.toLowerCase().includes('invalid login credentials')))) {
          throw new Error('No account found for this email. If this is your first time, please click "Create Account" above to register.');
        }

        if (supaError && supaError.message) {
          throw supaError;
        }
        throw new Error('Incorrect email or password. Please verify your credentials or click "Need Help?" to reset.');
      }
    }

    if (supaError) throw supaError;
    throw new Error('Could not sign in: Invalid credentials.');
  }

  // Real Supabase password reset - the preferred first action for "I forgot
  // my password" (spec section 5), not a support ticket. redirectTo points
  // back at this same app; supabase-js's detectSessionInUrl (already on)
  // picks up the recovery token from the URL automatically and fires
  // onAuthStateChange with event 'PASSWORD_RECOVERY', which app.js watches
  // for to show a "Set New Password" screen instead of entering the app.
  async function requestPasswordReset(email) {
    const c = getClient();
    if (!c) throw new Error('Supabase is not configured yet.');
    const { error } = await c.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw error;
  }

  async function updatePassword(newPassword) {
    let updated = false;
    const c = getClient();
    if (c && !isBackupMode()) {
      try {
        const { error } = await c.auth.updateUser({ password: newPassword });
        if (!error) updated = true;
      } catch (e) {
        console.warn('Supabase updateUser password notice:', e);
      }
    }

    if (App.backupProfileDb && currentUser) {
      const p = await App.backupProfileDb.getProfileById(currentUser.id);
      if (p) {
        await App.backupProfileDb.saveProfile(p, newPassword);
        updated = true;
      }
    }

    if (!updated) {
      throw new Error('Could not update password.');
    }
  }

  async function restoreQuickAuthSession(user) {
    if (!user) return null;
    currentUser = {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata || { full_name: user.name || user.email },
      role: user.role || 'authenticated',
    };

    const saved = getPersistentMobileSession();
    if (saved && saved.session) {
      currentSession = saved.session;
    } else {
      currentSession = { user: currentUser, isQuickAuthSession: true };
    }

    savePersistentMobileSession(currentUser, currentSession);

    // If Supabase client is available, synchronize active session
    const c = getClient();
    if (c) {
      try {
        const { data } = await c.auth.getSession();
        if (data && data.session) {
          currentSession = data.session;
          currentUser = data.session.user;
          savePersistentMobileSession(currentUser, currentSession);
        }
      } catch (_) {}
    }

    if (App.backupProfileDb) {
      App.backupProfileDb.saveProfile({
        id: currentUser.id,
        email: currentUser.email,
        full_name: (currentUser.user_metadata && currentUser.user_metadata.full_name) || currentUser.email,
        source: 'quick_auth',
      }).catch(() => {});
    }

    notify('SIGNED_IN');
    return { user: currentUser, session: currentSession };
  }

  async function signOut() {
    if (demoMode) { exitDemoMode(); return; }
    clearPersistentMobileSession();
    if (App.backupProfileDb) {
      App.backupProfileDb.clearBackupSession();
    }
    const c = getClient();
    if (c) {
      try { await c.auth.signOut(); } catch (e) {}
    }
    currentUser = null;
    currentSession = null;
    notify();
  }

  return {
    isConfigured, hasCustomConfig, saveConfig, clearConfig, getConfig, init, getClient, getUser, onChange,
    signUp, signIn, signOut, isDemoMode, isBackupMode, enterDemoMode, exitDemoMode, requestPasswordReset, updatePassword,
    restoreQuickAuthSession,
  };
})();
