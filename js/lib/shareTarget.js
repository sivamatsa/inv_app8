/* ============================================================================
   Share Target Module (Investment OS)
   Implements W3C Web Share Target API handling for Android Chrome & mobile apps.
   Extracts shared URLs/titles, performs multi-tier category auto-detection,
   persists records to Supabase website_entries, manages unauthenticated stashing,
   provides crisp feedback, and drives smooth-scroll attention highlight.
   ============================================================================ */
window.App = window.App || {};

App.shareTarget = (function () {
  'use strict';

  const STORAGE_KEY_PENDING = 'pending_shared_vault_item';
  const URL_REGEX = /https?:\/\/[^\s"'<>()[\]{}|\\^`]+/i;

  // Domain to Title mapping for clean fallback
  const KNOWN_DOMAINS = {
    'hdfc': 'HDFC Bank',
    'hdfcbank': 'HDFC Bank',
    'sbi': 'State Bank of India (SBI)',
    'onlinesbi': 'SBI NetBanking',
    'icici': 'ICICI Bank',
    'icicibank': 'ICICI Bank',
    'axis': 'Axis Bank',
    'axisbank': 'Axis Bank',
    'kotak': 'Kotak Mahindra Bank',
    'paytm': 'Paytm',
    'phonepe': 'PhonePe',
    'gpay': 'Google Pay',
    'cred': 'CRED',
    'zerodha': 'Zerodha Kite',
    'kite.zerodha': 'Zerodha Kite',
    'groww': 'Groww',
    'upstox': 'Upstox',
    'angelone': 'Angel One',
    'nseindia': 'NSE India',
    'bseindia': 'BSE India',
    'moneycontrol': 'Moneycontrol',
    'tanishq': 'Tanishq',
    'kalyan': 'Kalyan Jewellers',
    'malabar': 'Malabar Gold & Diamonds',
    'safegold': 'SafeGold',
    'airtel': 'Airtel',
    'jio': 'Jio',
    'amazon': 'Amazon',
    'flipkart': 'Flipkart',
    'myntra': 'Myntra',
    'swiggy': 'Swiggy',
    'zomato': 'Zomato',
    'incometax': 'Income Tax Portal',
    'epfindia': 'EPFO Portal',
    'uidai': 'UIDAI Aadhaar',
    'gst': 'GST Portal',
    'parivahan': 'Parivahan Sewa',
    'licindia': 'LIC India',
    'policybazaar': 'PolicyBazaar',
    'irctc': 'IRCTC',
    'makemytrip': 'MakeMyTrip',
  };

  /**
   * Cleans and derives a high-fidelity display title when one is omitted or redundant.
   */
  function deriveTitle(url, titleCandidate) {
    if (titleCandidate && typeof titleCandidate === 'string') {
      const trimmed = titleCandidate.trim();
      // If titleCandidate is non-empty and not just the URL string itself
      if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return trimmed.slice(0, 120);
      }
    }

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const parts = host.split('.');

      // Check known domains dictionary
      for (const key of Object.keys(KNOWN_DOMAINS)) {
        if (host.includes(key)) {
          return KNOWN_DOMAINS[key];
        }
      }

      // Fallback: capitalize base domain
      const baseName = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      if (baseName && baseName.length > 1) {
        return baseName.charAt(0).toUpperCase() + baseName.slice(1);
      }
      return host;
    } catch (_) {
      return 'Shared Web Link';
    }
  }

  /**
   * Robust URL and title extractor. Handles raw URLs, URLs inside freeform text
   * (e.g. Chrome, Twitter, Reddit, WhatsApp shares), and rejects invalid or unsafe schemes.
   */
  function extractUrlAndTitle(params) {
    if (!params) {
      return { valid: false, error: 'No share payload provided.' };
    }

    let rawUrl = (params.url || params.link || params.shared_url || '').trim();
    let rawText = (params.text || params.body || params.extra_text || '').trim();
    let rawTitle = (params.title || params.subject || params.extra_subject || '').trim();

    let candidateUrl = '';

    // 1. Direct URL parameter check
    if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
      candidateUrl = rawUrl;
    }

    // 2. Search freeform text if url was missing or invalid
    if (!candidateUrl && rawText) {
      const match = rawText.match(URL_REGEX);
      if (match) {
        candidateUrl = match[0];
        // If text was used to extract URL, see if text had accompanying title text
        if (!rawTitle) {
          const leftover = rawText.replace(match[0], '').trim();
          if (leftover.length > 2 && leftover.length < 100) {
            rawTitle = leftover;
          }
        }
      }
    }

    // 3. Search title parameter if still no URL found
    if (!candidateUrl && rawTitle) {
      const match = rawTitle.match(URL_REGEX);
      if (match) {
        candidateUrl = match[0];
        const leftover = rawTitle.replace(match[0], '').trim();
        rawTitle = leftover;
      }
    }

    if (!candidateUrl) {
      return { valid: false, error: 'Invalid or missing URL in shared content.' };
    }

    // Clean trailing punctuation attached by user text (e.g. "https://example.com/item).")
    candidateUrl = candidateUrl.replace(/[.,;:!?)'"]+$/, '');

    // Validate URL object
    let parsedUrl = null;
    try {
      parsedUrl = new URL(candidateUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return { valid: false, error: 'Unsupported URL protocol. Only HTTP and HTTPS are permitted.' };
      }
    } catch (_) {
      return { valid: false, error: 'Malformed URL provided.' };
    }

    const title = deriveTitle(candidateUrl, rawTitle);

    return {
      valid: true,
      url: candidateUrl,
      title: title,
      rawTitle: rawTitle,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname,
    };
  }

  /**
   * Intelligent Multi-Tier Category Auto-Detection Engine
   * Tier 1: Domain hostnames and title tokens regex matcher against existing categories
   * Tier 2: Graceful fallback to 'General' (or 'Shared Links')
   */
  function autoDetectCategory(url, title) {
    let host = '';
    let path = '';
    try {
      const parsed = new URL(url);
      host = parsed.hostname.toLowerCase();
      path = parsed.pathname.toLowerCase();
    } catch (_) {}

    const fullTarget = `${host} ${path} ${(title || '').toLowerCase()}`;

    // 1. Banking & Finance
    const bankRegex = /\b(hdfc|sbi|onlinesbi|icici|axis|kotak|bank|paytm|phonepe|gpay|googlepay|canara|pnb|idfc|indusind|yesbank|rbl|federal|cred|navi|slice|jupiter|fi\.money|bankofbaroda|unionbank|netbanking|credit\s*card|debit\s*card|loan|wallet|fintech)\b/i;
    if (bankRegex.test(fullTarget) || host.includes('bank') || host.includes('hdfcbank') || host.includes('icicibank') || host.includes('axisbank')) {
      return 'Banking & Finance';
    }

    // 2. Stocks & Mutual Funds
    const stockRegex = /\b(zerodha|groww|upstox|angelone|nseindia|bseindia|moneycontrol|etmoney|smallcase|kuvera|indmoney|motilal|5paisa|sharekhan|dhan|tradingview|screener|tickertape|valueresearch|demat|trading|stocks|mutual\s*fund|equity|sip|nifty|sensex|share\s*market|etf|bse|nse|portfolio)\b/i;
    if (stockRegex.test(fullTarget) || host.includes('zerodha') || host.includes('groww') || host.includes('upstox') || host.includes('angelone')) {
      return 'Stocks & Mutual Funds';
    }

    // 3. Gold Investment
    const goldRegex = /\b(tanishq|kalyan|malabar|bullion|gold|safegold|augmont|mmtc|caratlane|bluestone|joyalukkas|grtjewels|candere|sencogold|silver|jewellery|sovereign\s*gold|digigold|digital\s*gold|24k|22k|sgb)\b/i;
    if (goldRegex.test(fullTarget) || host.includes('tanishq') || host.includes('kalyan') || host.includes('malabar') || host.includes('gold')) {
      return 'Gold Investment';
    }

    // 4. Recharge & Utilities
    const utilityRegex = /\b(airtel|jio|vi\.in|bescom|tneb|bill|recharge|tatapower|adani|mahadiscom|bsnl|actcorp|fastag|electricity|broadband|dth|utility|cylinder|water\s*bill|piped\s*gas)\b/i;
    if (utilityRegex.test(fullTarget) || host.includes('airtel') || host.includes('jio') || host.includes('bill') || host.includes('recharge')) {
      return 'Recharge & Utilities';
    }

    // 5. Shopping & Payments
    const shoppingRegex = /\b(amazon|flipkart|myntra|swiggy|zomato|blinkit|zepto|instamart|ajio|meesho|nykaa|tatacliq|jiomart|bigbasket|shopping|order|store|marketplace|ecommerce|cart|delivery)\b/i;
    if (shoppingRegex.test(fullTarget) || host.includes('amazon') || host.includes('flipkart') || host.includes('myntra') || host.includes('swiggy') || host.includes('zomato')) {
      return 'Shopping & Payments';
    }

    // 6. Government & Tax
    const govRegex = /\b(incometax|epfindia|uidai|gst|parivahan|digilocker|mca\.gov|nsdl|utiitsl|passportindia|tin-nsdl|cbic|rbi\.org|gov\.in|nic\.in|income\s*tax|epfo|pf|aadhaar|pan\s*card|itr|gstin|passport|challan|tds)\b/i;
    if (govRegex.test(fullTarget) || host.endsWith('.gov.in') || host.endsWith('.nic.in') || host.includes('incometax') || host.includes('epfindia') || host.includes('uidai')) {
      return 'Government & Tax';
    }

    // 7. Insurance
    const insRegex = /\b(licindia|policybazaar|starhealth|hdfclife|iciciprulife|sbilife|maxlife|insurance|mediclaim|term\s*insurance)\b/i;
    if (insRegex.test(fullTarget) || host.includes('policybazaar') || host.includes('insurance')) {
      return 'Insurance';
    }

    // 8. Travel & Transport
    const travelRegex = /\b(irctc|makemytrip|goibibo|yatra|easemytrip|uber|ola|rapido|redbus|flight|airline|booking|train)\b/i;
    if (travelRegex.test(fullTarget) || host.includes('irctc') || host.includes('makemytrip')) {
      return 'Travel & Transport';
    }

    // 9. Rent & Property
    const propertyRegex = /\b(nobroker|99acres|magicbricks|housing|nestaway|property|real\s*estate|rent)\b/i;
    if (propertyRegex.test(fullTarget)) {
      return 'Rent & Property';
    }

    // 10. Education
    const eduRegex = /\b(coursera|udemy|edx|khanacademy|unacademy|byjus|education|course|tutorial)\b/i;
    if (eduRegex.test(fullTarget)) {
      return 'Education';
    }

    // Tier 2 Fallback: Defaults gracefully to General
    return 'General';
  }

  /**
   * Persists a shared link to Supabase website_entries and triggers highlight navigation.
   * Strict compliance with user directive: Identical URLs create separate, independent rows.
   */
  async function saveSharedEntry(extractedData) {
    if (!extractedData || !extractedData.url) return null;

    const category = extractedData.category || autoDetectCategory(extractedData.url, extractedData.title);
    const dateFormatted = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    const payload = {
      name: extractedData.title || deriveTitle(extractedData.url),
      url: extractedData.url,
      primary_category: category,
      importance: 'NORMAL',
      provider_name: extractedData.hostname || '',
      tags: ['Shared via Mobile'],
      description: `Shared via Android Web Share Target on ${dateFormatted}`,
      is_favorite: false,
      is_pinned: false,
    };

    let createdSite = null;
    try {
      createdSite = await App.api.createWebsite(payload);
    } catch (err) {
      console.error('[ShareTarget] Failed to save website entry:', err);
      if (App.utils && App.utils.toast) {
        App.utils.toast('Failed to save shared link: ' + (err.message || err), 'err');
      }
      return null;
    }

    // Feedback toast
    if (App.utils && App.utils.toast) {
      App.utils.toast(`✓ Saved to Website Vault: ${createdSite.name}`, 'ok');
    }

    // Navigate to Vault view and trigger highlight
    navigateToVaultAndHighlight(createdSite.id);

    return createdSite;
  }

  /**
   * Routes to #vault view, waits for rendering, smooth-scrolls to the target
   * entry, and applies the temporary attention pulse (.vault-item-just-added).
   */
  function navigateToVaultAndHighlight(siteId) {
    if (!siteId) return;

    if (App.views && App.views.vault && typeof App.views.vault.setHighlightSiteId === 'function') {
      App.views.vault.setHighlightSiteId(siteId);
    }

    if (App.router && typeof App.router.navigate === 'function') {
      App.router.navigate('vault');
    }

    // Also refresh current if already on vault
    if (App.router && typeof App.router.refreshCurrent === 'function') {
      App.router.refreshCurrent();
    }

    // Trigger visual highlight with smooth scrolling
    setTimeout(() => {
      triggerVaultItemHighlight(siteId);
    }, 300);
  }

  /**
   * Locates the newly created website element in the DOM (card or table row)
   * and applies the 2.5-second accent highlight glow.
   */
  function triggerVaultItemHighlight(siteId) {
    if (!siteId) return;

    const selector = `[data-site-id="${siteId}"]`;
    const el = document.querySelector(selector);
    if (el) {
      el.classList.remove('vault-item-just-added');
      // Trigger reflow to restart animation if needed
      void el.offsetWidth;
      el.classList.add('vault-item-just-added');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      setTimeout(() => {
        el.classList.remove('vault-item-just-added');
      }, 2600);
    } else {
      // Retry in case vault list is still rendering
      setTimeout(() => {
        const retryEl = document.querySelector(selector);
        if (retryEl) {
          retryEl.classList.add('vault-item-just-added');
          retryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => retryEl.classList.remove('vault-item-just-added'), 2600);
        }
      }, 450);
    }
  }

  /**
   * Stashes unauthenticated share payload in sessionStorage.
   */
  function stashPendingShare(extractedData) {
    try {
      const payload = {
        url: extractedData.url,
        title: extractedData.title,
        category: extractedData.category || autoDetectCategory(extractedData.url, extractedData.title),
        hostname: extractedData.hostname,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(payload));
      renderPendingNoticeOnAuth();
    } catch (e) {
      console.warn('[ShareTarget] sessionStorage error:', e);
    }
  }

  /**
   * Retrieves pending share from sessionStorage if any.
   */
  function getPendingShare() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_PENDING);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /**
   * Clears pending share from sessionStorage.
   */
  function clearPendingShare() {
    try {
      sessionStorage.removeItem(STORAGE_KEY_PENDING);
      const notice = document.querySelector('#authPendingShareNotice');
      if (notice) {
        notice.style.display = 'none';
        notice.innerHTML = '';
      }
    } catch (_) {}
  }

  /**
   * Presents status notice on the login screen for unauthenticated users.
   */
  function renderPendingNoticeOnAuth() {
    const pending = getPendingShare();
    const notice = document.querySelector('#authPendingShareNotice');
    if (!notice || !notice.style) return;

    if (!pending) {
      notice.style.display = 'none';
      notice.innerHTML = '';
      return;
    }

    const displayDomain = pending.hostname || deriveTitle(pending.url);
    notice.style.display = 'block';
    notice.innerHTML = `
      <div style="background:rgba(22,201,163,0.12);border:1px solid rgba(22,201,163,0.35);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,0.25)">
        <span style="font-size:20px;flex-shrink:0">📎</span>
        <div style="min-width:0;flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--teal);letter-spacing:0.3px;text-transform:uppercase">Shared Link Pending</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.utils ? App.utils.escapeHtml(pending.title || pending.url) : pending.title}">
            ${App.utils ? App.utils.escapeHtml(pending.title || displayDomain) : displayDomain}
          </div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">
            Sign in to automatically save this link directly to your Website Vault.
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Auto-save listener triggered upon App.auth 'LOGIN' or session restore.
   */
  async function handlePendingShare() {
    const pending = getPendingShare();
    if (!pending) return;

    // Check if user session is ready
    const user = App.auth && typeof App.auth.getUser === 'function' ? App.auth.getUser() : null;
    const isDemo = App.auth && typeof App.auth.isDemoMode === 'function' && App.auth.isDemoMode();

    if (!user && !isDemo) {
      renderPendingNoticeOnAuth();
      return;
    }

    clearPendingShare();
    await saveSharedEntry(pending);
  }

  /**
   * Resolves whether user is currently authenticated, including waiting briefly
   * for async Supabase session recovery on cold app launch.
   */
  async function resolveAuthenticatedUser() {
    let user = App.auth && typeof App.auth.getUser === 'function' ? App.auth.getUser() : null;
    if (user || (App.auth && App.auth.isDemoMode && App.auth.isDemoMode())) {
      return user || { id: 'demo' };
    }

    // If client is available, wait up to 1.5s for session restoration
    const supaClient = App.auth && typeof App.auth.getClient === 'function' ? App.auth.getClient() : null;
    if (supaClient && supaClient.auth) {
      try {
        const sessionPromise = supaClient.auth.getSession().then(({ data }) => data?.session?.user || null).catch(() => null);
        const timeoutPromise = new Promise((r) => setTimeout(() => r(null), 1500));
        const resolved = await Promise.race([sessionPromise, timeoutPromise]);
        if (resolved) {
          return resolved;
        }
      } catch (_) {}
    }

    // Check local storage for persistent mobile session
    try {
      const savedMobile = localStorage.getItem('ios_persistent_mobile_session');
      if (savedMobile) {
        const parsed = JSON.parse(savedMobile);
        if (parsed?.user) return parsed.user;
      }
    } catch (_) {}

    return null;
  }

  /**
   * Extracts query parameters from a raw query or hash string, normalizing
   * potential double '??' strings from some browser share target formats.
   */
  function parseShareParams(rawString) {
    if (!rawString) return new URLSearchParams();
    // Normalize: if there is a second '?', replace it with '&'
    const normalized = rawString.replace(/\?/g, (match, offset) => offset === 0 ? '?' : '&');
    return new URLSearchParams(normalized);
  }

  /**
   * Main entry point: intercepts incoming URL parameters (?share_target=1&url=...&title=...&text=...).
   * Cleans address bar via history.replaceState, validates, and routes appropriately.
   */
  async function processIncomingShare(searchString) {
    let search = searchString !== undefined ? searchString : window.location.search;

    // Check hash if search is empty (e.g. /#vault?url=... or /?url=...#vault)
    if (!search && window.location.hash && window.location.hash.includes('?')) {
      search = '?' + window.location.hash.split('?')[1];
    }

    if (!search) return false;

    const params = parseShareParams(search);
    const hasShareTargetFlag = params.get('share_target') === '1' || params.has('share_target');
    const hasUrl = params.has('url') && params.get('url').trim() !== '';
    const hasLink = params.has('link') && params.get('link').trim() !== '';
    const hasText = params.has('text') && params.get('text').trim() !== '';
    const hasTitle = params.has('title') && params.get('title').trim() !== '';

    // Only process if this is a share target invocation
    if (!hasShareTargetFlag && !hasUrl && !hasLink && !hasText && !hasTitle) {
      return false;
    }

    const payload = {
      url: params.get('url') || params.get('link') || params.get('shared_url') || '',
      title: params.get('title') || params.get('subject') || params.get('extra_subject') || '',
      text: params.get('text') || params.get('body') || params.get('extra_text') || '',
    };

    // Clean browser URL query parameters immediately via history.replaceState
    try {
      const cleanUrl = window.location.pathname + (window.location.hash || '');
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}

    // Extract and validate
    const extracted = extractUrlAndTitle(payload);

    if (!extracted.valid) {
      // Invalid or malformed share: Show warning toast, route safely to #vault
      if (App.utils && App.utils.toast) {
        App.utils.toast(extracted.error || 'Invalid or missing URL in shared content.', 'err');
      }
      if (App.router && typeof App.router.navigate === 'function') {
        App.router.navigate('vault');
      }
      return true;
    }

    // Auto-detect category
    extracted.category = autoDetectCategory(extracted.url, extracted.title);

    // Authentication Gate: wait briefly if session is still restoring
    const user = await resolveAuthenticatedUser();

    if (user) {
      // User is authenticated: immediately save to Supabase website_entries
      await saveSharedEntry(extracted);
    } else {
      // User is logged out / session locked: safely stash in sessionStorage
      stashPendingShare(extracted);
      if (App.utils && App.utils.toast) {
        App.utils.toast(`Shared link saved for next login: ${extracted.title}`, 'info');
      }
    }

    return true;
  }

  /**
   * Initializes shareTarget listeners for both cold and warm launches.
   */
  function init() {
    // 1. Process cold launch with search or hash parameters
    if (window.location.search || (window.location.hash && window.location.hash.includes('?'))) {
      processIncomingShare();
    }

    // 2. Render notice if any stashed item exists
    renderPendingNoticeOnAuth();

    // 3. Listen for warm navigation or visibility changes
    window.addEventListener('pageshow', () => {
      if (window.location.search || (window.location.hash && window.location.hash.includes('?'))) {
        processIncomingShare();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (window.location.search || (window.location.hash && window.location.hash.includes('?')))) {
        processIncomingShare();
      }
    });

    window.addEventListener('popstate', () => {
      if (window.location.search || (window.location.hash && window.location.hash.includes('?'))) {
        processIncomingShare();
      }
    });

    // 4. Listen for service worker postMessages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SHARE_TARGET_RECEIVED') {
          const payload = event.data.payload || {};
          const extracted = extractUrlAndTitle(payload);
          if (extracted.valid) {
            extracted.category = autoDetectCategory(extracted.url, extracted.title);
            saveSharedEntry(extracted);
          }
        }
      });
    }
  }

  return {
    init,
    processIncomingShare,
    extractUrlAndTitle,
    autoDetectCategory,
    deriveTitle,
    saveSharedEntry,
    handlePendingShare,
    getPendingShare,
    clearPendingShare,
    renderPendingNoticeOnAuth,
    triggerVaultItemHighlight,
  };
})();
