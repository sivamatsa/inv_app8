/* Secondary Backup Database & Profile Store for Investment OS.
   Provides persistent, auto-healing profile creation and authentication fallback
   when Supabase auth or trigger limitations occur.
   Uses IndexedDB with a persistent localStorage mirror. */
window.App = window.App || {};

App.backupProfileDb = (function () {
  const DB_NAME = 'InvestmentOS_BackupDB';
  const DB_VERSION = 2;
  const STORE_PROFILES = 'profiles';
  const STORE_SESSIONS = 'sessions';
  const STORE_AUDIT_CACHE = 'audit_cache';
  const STORE_SYSTEM_KV = 'system_kv';
  const STORE_PORTFOLIO_CACHE = 'portfolio_cache';

  const KNOWN_OBJECT_STORES = [
    { name: STORE_PROFILES, keyPath: 'id', description: 'User accounts, permissions, hashed credentials, and preferences' },
    { name: STORE_SESSIONS, keyPath: 'id', description: 'Offline & recovery authentication sessions and tokens' },
    { name: STORE_AUDIT_CACHE, keyPath: 'id', description: 'Local mutation events, change telemetry, and security trails' },
    { name: STORE_SYSTEM_KV, keyPath: 'key', description: 'Key-value system configs, AI endpoints, gold provider settings, and metadata' },
    { name: STORE_PORTFOLIO_CACHE, keyPath: 'id', description: 'Offline snapshot buffer of active portfolio deals and summaries' },
  ];

  const LOCAL_STORAGE_PROFILES_KEY = 'investment_backup_profiles_v1';
  const LOCAL_STORAGE_SESSION_KEY = 'investment_backup_session_v1';

  const ADMIN_MASTER_UUID = 'a0000000-0000-4000-8000-000000000001';
  const DEV_MASTER_UUID = 'd0000000-0000-4000-8000-000000000001';

  let idb = null;
  let isReady = false;
  const readyCallbacks = [];

  function isUuid(val) {
    if (!val || typeof val !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  }

  function generateUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function normalizeProfileId(id, email) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (id === 'usr_admin_master' || cleanEmail === 'admin@investment.local') {
      return ADMIN_MASTER_UUID;
    }
    if (id === 'usr_dev_master' || cleanEmail === 'developer@investment.local') {
      return DEV_MASTER_UUID;
    }
    if (isUuid(id)) return id;
    return generateUuid();
  }

  function onReady(fn) {
    if (isReady) { fn(); } else { readyCallbacks.push(fn); }
  }

  function triggerReady() {
    isReady = true;
    while (readyCallbacks.length) {
      const fn = readyCallbacks.shift();
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  // Fast simple hash for offline password validation
  function hashPassword(str) {
    if (!str) return '';
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return 'h_' + (hash >>> 0).toString(16);
  }

  function generateId(prefix = 'usr') {
    return generateUuid();
  }

  // --- LocalStorage Fallback Layer ---
  function getLocalProfiles() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
      if (!raw) return [];
      const profiles = JSON.parse(raw);
      if (!Array.isArray(profiles)) return [];
      let modified = false;
      const normalized = profiles.map((p) => {
        const normId = normalizeProfileId(p.id, p.email);
        if (normId !== p.id) {
          modified = true;
          return Object.assign({}, p, { id: normId });
        }
        return p;
      });
      if (modified) {
        saveLocalProfiles(normalized);
      }
      return normalized;
    } catch (e) {
      return [];
    }
  }

  function saveLocalProfiles(profiles) {
    try {
      const cleanList = (profiles || []).map((p) => {
        const normId = normalizeProfileId(p.id, p.email);
        return normId === p.id ? p : Object.assign({}, p, { id: normId });
      });
      localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(cleanList));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  // --- IndexedDB Layer ---
  function openIdb() {
    return new Promise((resolve) => {
      if (idb) return resolve(idb);
      if (typeof indexedDB === 'undefined') {
        triggerReady();
        return resolve(null);
      }

      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PROFILES)) {
            const store = db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
            store.createIndex('email', 'email', { unique: false });
            store.createIndex('role', 'role', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
            db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_AUDIT_CACHE)) {
            const auditStore = db.createObjectStore(STORE_AUDIT_CACHE, { keyPath: 'id' });
            auditStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_SYSTEM_KV)) {
            db.createObjectStore(STORE_SYSTEM_KV, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_PORTFOLIO_CACHE)) {
            const portStore = db.createObjectStore(STORE_PORTFOLIO_CACHE, { keyPath: 'id' });
            portStore.createIndex('user_id', 'user_id', { unique: false });
          }
        };
        req.onsuccess = (e) => {
          idb = e.target.result;
          triggerReady();
          resolve(idb);
        };
        req.onerror = (e) => {
          console.warn('IndexedDB open error, using localStorage fallback:', e);
          triggerReady();
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB failed to init:', err);
        triggerReady();
        resolve(null);
      }
    });
  }

  async function clearIdbStore(storeName) {
    const db = await openIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        if (!db.objectStoreNames.contains(storeName)) return resolve(false);
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function getFromIdb(storeName, key) {
    const db = await openIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function putToIdb(storeName, record) {
    const db = await openIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function deleteFromIdb(storeName, key) {
    const db = await openIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function getAllFromIdb(storeName) {
    const db = await openIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  // --- Seed default accounts if store is completely empty ---
  function seedDefaultProfilesIfEmpty() {
    let profiles = getLocalProfiles();
    if (profiles.length === 0) {
      const now = new Date().toISOString();
      const defaultProfiles = [
        {
          id: DEV_MASTER_UUID,
          email: 'developer@investment.local',
          full_name: 'Lead Developer',
          username: 'developer',
          mobile: '+91 98765 43210',
          city: 'Bangalore',
          country: 'India',
          preferred_currency: 'INR',
          timezone: 'Asia/Kolkata',
          is_admin: true,
          is_developer: true,
          role: 'Developer',
          is_active: true,
          password_hash: hashPassword('developer123'),
          source: 'backup_db',
          created_at: now,
          updated_at: now,
        },
        {
          id: ADMIN_MASTER_UUID,
          email: 'admin@investment.local',
          full_name: 'System Administrator',
          username: 'admin',
          mobile: '+91 98765 00000',
          city: 'Mumbai',
          country: 'India',
          preferred_currency: 'INR',
          timezone: 'Asia/Kolkata',
          is_admin: true,
          is_developer: false,
          role: 'Administrator',
          is_active: true,
          password_hash: hashPassword('admin123'),
          source: 'backup_db',
          created_at: now,
          updated_at: now,
        },
      ];
      saveLocalProfiles(defaultProfiles);
      defaultProfiles.forEach((p) => putToIdb(STORE_PROFILES, p));
    } else {
      // Migrate any legacy IDs in IDB
      profiles.forEach((p) => {
        const normId = normalizeProfileId(p.id, p.email);
        if (normId !== p.id) {
          deleteFromIdb(STORE_PROFILES, p.id);
          putToIdb(STORE_PROFILES, Object.assign({}, p, { id: normId }));
        }
      });
    }
  }

  // --- Core Profile Operations ---

  async function getAllProfiles() {
    let list = await getAllFromIdb(STORE_PROFILES);
    if (!list || !list.length) {
      list = getLocalProfiles();
    } else {
      let modified = false;
      list = list.map((p) => {
        const normId = normalizeProfileId(p.id, p.email);
        if (normId !== p.id) {
          modified = true;
          return Object.assign({}, p, { id: normId });
        }
        return p;
      });
      // Sync local storage mirror
      saveLocalProfiles(list);
    }
    return list || [];
  }

  async function getProfileById(id) {
    if (!id) return null;
    let normId = id;
    if (id === 'usr_admin_master') normId = ADMIN_MASTER_UUID;
    else if (id === 'usr_dev_master') normId = DEV_MASTER_UUID;

    let p = await getFromIdb(STORE_PROFILES, normId);
    if (!p && normId !== id) {
      p = await getFromIdb(STORE_PROFILES, id);
    }
    if (!p) {
      const local = getLocalProfiles();
      p = local.find((x) => x.id === normId || x.id === id) || null;
    }
    if (p) {
      const cleanId = normalizeProfileId(p.id, p.email);
      if (cleanId !== p.id) p = Object.assign({}, p, { id: cleanId });
    }
    return p;
  }

  async function getProfileByEmail(email) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    const all = await getAllProfiles();
    const p = all.find((x) => (x.email || '').trim().toLowerCase() === clean) || null;
    if (p) {
      const cleanId = normalizeProfileId(p.id, p.email);
      if (cleanId !== p.id) return Object.assign({}, p, { id: cleanId });
    }
    return p;
  }

  async function saveProfile(profileData, password) {
    if (!profileData) throw new Error('Profile data is required');

    const all = await getAllProfiles();
    const cleanEmail = (profileData.email || '').trim().toLowerCase();
    const normId = normalizeProfileId(profileData.id, cleanEmail);

    const existingIndex = all.findIndex((p) =>
      (normId && (p.id === normId || p.id === profileData.id)) ||
      (cleanEmail && (p.email || '').trim().toLowerCase() === cleanEmail)
    );

    const now = new Date().toISOString();
    const isDev = profileData.is_developer === true || profileData.role === 'Developer';
    const isAdmin = profileData.is_admin === true || profileData.role === 'Administrator' || isDev;
    let role = profileData.role || (isDev ? 'Developer' : (isAdmin ? 'Administrator' : 'User'));

    let finalProfile;
    if (existingIndex >= 0) {
      const current = all[existingIndex];
      finalProfile = Object.assign({}, current, profileData, {
        id: normalizeProfileId(current.id || normId, cleanEmail),
        email: cleanEmail || current.email,
        full_name: profileData.full_name !== undefined ? profileData.full_name : current.full_name,
        mobile: profileData.mobile !== undefined ? profileData.mobile : current.mobile,
        is_admin: isAdmin,
        is_developer: isDev,
        role: role,
        is_active: profileData.is_active !== undefined ? profileData.is_active : current.is_active !== false,
        source: current.source === 'supabase' && profileData.source !== 'supabase' ? 'dual_synced' : (profileData.source || current.source || 'backup_db'),
        updated_at: now,
      });

      if (password) {
        finalProfile.password_hash = hashPassword(password);
      }

      all[existingIndex] = finalProfile;
    } else {
      finalProfile = {
        id: normId,
        email: cleanEmail,
        full_name: profileData.full_name || (cleanEmail ? cleanEmail.split('@')[0] : 'User'),
        username: profileData.username || (cleanEmail ? cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '') : ''),
        mobile: profileData.mobile || null,
        city: profileData.city || null,
        country: profileData.country || null,
        preferred_currency: profileData.preferred_currency || 'INR',
        timezone: profileData.timezone || 'Asia/Kolkata',
        financial_year_start_month: profileData.financial_year_start_month || 4,
        financial_year_start_day: profileData.financial_year_start_day || 1,
        is_admin: isAdmin,
        is_developer: isDev,
        role: role,
        is_active: profileData.is_active !== false,
        password_hash: password ? hashPassword(password) : (profileData.password_hash || hashPassword('default123')),
        source: profileData.source || 'backup_db',
        created_at: profileData.created_at || now,
        updated_at: now,
        ui_preferences: profileData.ui_preferences || {},
      };
      all.push(finalProfile);
    }

    saveLocalProfiles(all);
    await putToIdb(STORE_PROFILES, finalProfile);
    return finalProfile;
  }

  async function deleteProfile(id, confirmEmail) {
    if (!id) throw new Error('User ID is required for deletion');
    const profile = await getProfileById(id);
    if (!profile) return { ok: true, deleted: false };

    if (confirmEmail) {
      const match = (profile.email || '').trim().toLowerCase() === String(confirmEmail).trim().toLowerCase();
      if (!match) throw new Error(`Confirmation email does not match "${profile.email}"`);
    }

    const all = await getAllProfiles();
    const filtered = all.filter((p) => p.id !== id);
    saveLocalProfiles(filtered);
    await deleteFromIdb(STORE_PROFILES, id);
    return { ok: true, deleted: true, id };
  }

  async function setUserActive(id, isActive) {
    const p = await getProfileById(id);
    if (!p) throw new Error('User profile not found in backup database');
    return saveProfile(Object.assign({}, p, { is_active: isActive === true }));
  }

  // --- Authentication on Backup DB ---
  async function authenticate(email, password) {
    if (!email || !password) throw new Error('Email and password are required');
    const cleanEmail = String(email).trim().toLowerCase();
    const profile = await getProfileByEmail(cleanEmail);

    if (!profile) {
      throw new Error('No account found with this email in Primary or Backup Database.');
    }

    if (profile.is_active === false) {
      throw new Error('This account has been deactivated. Contact an Administrator or Developer.');
    }

    const testHash = hashPassword(password);
    // Allow login if password hash matches or if user enters correct password
    if (profile.password_hash && profile.password_hash !== testHash) {
      throw new Error('Invalid email or password.');
    }

    const userObj = {
      id: profile.id,
      email: profile.email,
      user_metadata: {
        full_name: profile.full_name || profile.email,
      },
      role: 'authenticated',
      isBackupUser: true,
    };

    const sessionObj = {
      user: userObj,
      access_token: 'backup_token_' + Date.now(),
      expires_at: Math.floor(Date.now() / 1000) + (86400 * 30),
      isBackupSession: true,
    };

    try {
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify({ user: userObj, profile }));
    } catch (e) {}

    return { user: userObj, session: sessionObj, profile };
  }

  function getBackupSession() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
      if (!raw) return null;
      const sess = JSON.parse(raw);
      if (sess && sess.user && sess.user.id) {
        const normId = normalizeProfileId(sess.user.id, sess.user.email);
        if (normId !== sess.user.id) {
          sess.user.id = normId;
          if (sess.profile) sess.profile.id = normId;
          try {
            localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(sess));
          } catch (e) {}
        }
      }
      return sess;
    } catch (e) {
      return null;
    }
  }

  function clearBackupSession() {
    try {
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    } catch (e) {}
  }

  // --- Reconcile & Two-Way Sync between Supabase and Backup DB ---
  async function reconcileWithSupabase(supabaseClient) {
    const stats = { syncedFromSupabase: 0, savedToBackup: 0, healedInSupabase: 0, total: 0 };
    if (!supabaseClient) return stats;

    try {
      // 1. Read all profiles from Supabase
      const { data: supaProfiles, error } = await supabaseClient.from('profiles').select('*');
      if (!error && Array.isArray(supaProfiles)) {
        for (const sp of supaProfiles) {
          if (sp && sp.id) {
            await saveProfile(Object.assign({}, sp, { source: 'dual_synced' }));
            stats.syncedFromSupabase++;
          }
        }
      }

      // 2. Read backup profiles and ensure they exist in Supabase if valid UUID
      const backupProfiles = await getAllProfiles();
      stats.total = backupProfiles.length;

      for (const bp of backupProfiles) {
        if (bp.source === 'backup_db' && isUuid(bp.id)) {
          // Attempt upsert into Supabase profiles
          try {
            const { error: upErr } = await supabaseClient.from('profiles').upsert({
              id: bp.id,
              email: bp.email,
              full_name: bp.full_name,
              mobile: bp.mobile,
              city: bp.city,
              country: bp.country,
              preferred_currency: bp.preferred_currency || 'INR',
              timezone: bp.timezone || 'Asia/Kolkata',
              is_admin: bp.is_admin === true,
              is_active: bp.is_active !== false,
            }, { onConflict: 'id' });

            if (!upErr) {
              await saveProfile(Object.assign({}, bp, { source: 'dual_synced' }));
              stats.healedInSupabase++;
            }
          } catch (e) {
            // Non-fatal, continues in backup DB
          }
        }
      }
    } catch (err) {
      console.warn('Reconciliation notice:', err);
    }

    return stats;
  }

  // --- Database Overview & Inspection APIs for Secondary DB ---
  async function getDatabaseOverview() {
    const stores = [];
    let totalRecords = 0;
    let approxBytes = 0;

    for (const s of KNOWN_OBJECT_STORES) {
      let rows = [];
      if (s.name === STORE_PROFILES) {
        rows = await getAllProfiles();
      } else {
        const idbRows = await getAllFromIdb(s.name);
        rows = Array.isArray(idbRows) ? idbRows : [];
      }

      const jsonStr = JSON.stringify(rows || []);
      const bytes = new Blob([jsonStr]).size;
      approxBytes += bytes;
      totalRecords += rows.length;

      stores.push({
        name: s.name,
        type: 'IndexedDB Store',
        description: s.description,
        keyPath: s.keyPath,
        count: rows.length,
        size_bytes: bytes,
        size_pretty: bytes > 1048576 ? (bytes / 1048576).toFixed(2) + ' MB' : (bytes > 1024 ? (bytes / 1024).toFixed(1) + ' kB' : bytes + ' B'),
        status: rows.length > 0 ? 'Active Data' : 'Empty / Ready',
      });
    }

    // LocalStorage Keys summary
    const lsKeys = [
      { key: LOCAL_STORAGE_PROFILES_KEY, desc: 'Offline Profiles Array Mirror' },
      { key: LOCAL_STORAGE_SESSION_KEY, desc: 'Active Offline Session Token' },
      { key: 'gemini_api_key_v1', desc: 'AI Copilot Custom API Key' },
      { key: 'ai_active_provider_id', desc: 'Active AI Provider Preference' },
      { key: 'gold_active_provider_id', desc: 'Active Gold Spot Price Provider' },
      { key: 'custom_supabase_config', desc: 'Browser-Specific Supabase Endpoint Override' },
      { key: 'admin_show_all_notifications', desc: 'Admin Global Notifications Override' },
    ];

    let lsTotalBytes = 0;
    let lsPopulatedCount = 0;
    lsKeys.forEach((item) => {
      try {
        const val = localStorage.getItem(item.key);
        if (val !== null) {
          lsPopulatedCount++;
          lsTotalBytes += new Blob([val]).size;
        }
      } catch (e) {}
    });

    stores.push({
      name: 'localStorage:system_keys',
      type: 'Web Storage',
      description: 'Browser-local client preferences, API keys, and endpoint configurations',
      keyPath: 'key',
      count: lsPopulatedCount,
      size_bytes: lsTotalBytes,
      size_pretty: lsTotalBytes > 1024 ? (lsTotalBytes / 1024).toFixed(1) + ' kB' : lsTotalBytes + ' B',
      status: lsPopulatedCount > 0 ? 'Active Keys' : 'Defaults',
    });

    approxBytes += lsTotalBytes;

    return {
      database_name: DB_NAME,
      version: DB_VERSION,
      engine: 'IndexedDB + LocalStorage Dual-Store',
      stores,
      total_records: totalRecords + lsPopulatedCount,
      total_bytes: approxBytes,
      total_size_pretty: approxBytes > 1048576 ? (approxBytes / 1048576).toFixed(2) + ' MB' : (approxBytes > 1024 ? (approxBytes / 1024).toFixed(1) + ' kB' : approxBytes + ' B'),
    };
  }

  async function getStoreRows(storeName) {
    if (!storeName) return [];
    if (storeName === STORE_PROFILES) {
      return getAllProfiles();
    }
    if (storeName === 'localStorage:system_keys') {
      const keys = [
        LOCAL_STORAGE_PROFILES_KEY,
        LOCAL_STORAGE_SESSION_KEY,
        'gemini_api_key_v1',
        'ai_active_provider_id',
        'gold_active_provider_id',
        'custom_supabase_config',
        'admin_show_all_notifications',
      ];
      const rows = [];
      keys.forEach((k) => {
        try {
          const raw = localStorage.getItem(k);
          if (raw !== null) {
            let parsed = raw;
            try { parsed = JSON.parse(raw); } catch (e) {}
            rows.push({
              key: k,
              value: typeof parsed === 'object' ? JSON.stringify(parsed).slice(0, 100) + '...' : String(parsed),
              raw_value: raw,
              type: typeof parsed,
              bytes: new Blob([raw]).size,
            });
          }
        } catch (e) {}
      });
      return rows;
    }

    const rows = await getAllFromIdb(storeName);
    return Array.isArray(rows) ? rows : [];
  }

  async function saveStoreRecord(storeName, record) {
    if (!storeName || !record) return false;
    if (storeName === STORE_PROFILES) {
      return saveProfile(record);
    }
    if (storeName === 'localStorage:system_keys') {
      if (!record.key) throw new Error('Key is required');
      localStorage.setItem(record.key, typeof record.value === 'string' ? record.value : JSON.stringify(record.value));
      return true;
    }
    return putToIdb(storeName, record);
  }

  async function deleteStoreRow(storeName, key) {
    if (!storeName || key === undefined || key === null) return false;
    if (storeName === STORE_PROFILES) {
      return deleteProfile(key, true);
    }
    if (storeName === 'localStorage:system_keys') {
      try { localStorage.removeItem(key); return true; } catch (e) { return false; }
    }
    return deleteFromIdb(storeName, key);
  }

  async function clearStore(storeName) {
    if (!storeName) return false;
    if (storeName === STORE_PROFILES) {
      // Clear profiles except standard master accounts
      const defaultProfiles = [
        {
          id: DEV_MASTER_UUID,
          email: 'developer@investment.local',
          full_name: 'Lead Developer',
          username: 'developer',
          role: 'developer',
          is_admin: true,
          is_active: true,
          password_hash: hashPassword('Password@123'),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: ADMIN_MASTER_UUID,
          email: 'admin@investment.local',
          full_name: 'System Administrator',
          username: 'admin',
          role: 'admin',
          is_admin: true,
          is_active: true,
          password_hash: hashPassword('Password@123'),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      saveLocalProfiles(defaultProfiles);
      await clearIdbStore(STORE_PROFILES);
      defaultProfiles.forEach((p) => putToIdb(STORE_PROFILES, p));
      return true;
    }
    if (storeName === 'localStorage:system_keys') {
      const keys = ['gemini_api_key_v1', 'custom_supabase_config', 'admin_show_all_notifications'];
      keys.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      return true;
    }
    return clearIdbStore(storeName);
  }

  async function exportEntireDatabase() {
    const overview = await getDatabaseOverview();
    const exportBundle = {
      app: 'Investment OS Secondary Backup DB',
      exported_at: new Date().toISOString(),
      version: DB_VERSION,
      stores: {},
    };

    for (const s of overview.stores) {
      exportBundle.stores[s.name] = await getStoreRows(s.name);
    }

    const jsonStr = JSON.stringify(exportBundle, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investment_os_backup_db_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  // Initialize immediately
  openIdb().then(() => {
    seedDefaultProfilesIfEmpty();
  });

  return {
    onReady,
    isUuid,
    generateUuid,
    ADMIN_MASTER_UUID,
    DEV_MASTER_UUID,
    getAllProfiles,
    getProfileById,
    getProfileByEmail,
    saveProfile,
    deleteProfile,
    setUserActive,
    authenticate,
    getBackupSession,
    clearBackupSession,
    reconcileWithSupabase,
    hashPassword,
    generateId,
    // Storage & Health APIs
    getDatabaseOverview,
    getStoreRows,
    saveStoreRecord,
    deleteStoreRow,
    clearStore,
    exportEntireDatabase,
  };
})();
