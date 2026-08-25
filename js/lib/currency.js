/* Multi-Currency Auto-Conversion Engine
   Provides live & offline currency conversion, rate updates,
   and portfolio-wide currency switching across INR, USD, EUR, GBP, AED, SGD, JPY, CAD, AUD, CHF. */
window.App = window.App || {};

App.currency = (function () {
  const STORAGE_KEY = 'ios_currency_rates';
  const ACTIVE_CURRENCY_KEY = 'ios_active_display_currency';

  // Base rates relative to 1 INR (Base currency is INR)
  const DEFAULT_RATES = {
    INR: 1.0,
    USD: 0.01156,     // 1 USD = ~86.5 INR
    EUR: 0.01066,     // 1 EUR = ~93.8 INR
    GBP: 0.00907,     // 1 GBP = ~110.2 INR
    AED: 0.04246,     // 1 AED = ~23.55 INR
    SGD: 0.01543,     // 1 SGD = ~64.8 INR
    CAD: 0.01610,     // 1 CAD = ~62.1 INR
    AUD: 0.01773,     // 1 AUD = ~56.4 INR
    JPY: 1.7241,      // 1 JPY = ~0.58 INR
    CHF: 0.01016,     // 1 CHF = ~98.4 INR
  };

  const CURRENCY_METADATA = {
    INR: { symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', locale: 'en-IN' },
    USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸', locale: 'en-US' },
    EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺', locale: 'de-DE' },
    GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧', locale: 'en-GB' },
    AED: { symbol: 'AED ', name: 'UAE Dirham', flag: '🇦🇪', locale: 'ar-AE' },
    SGD: { symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', locale: 'en-SG' },
    CAD: { symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', locale: 'en-CA' },
    AUD: { symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', locale: 'en-AU' },
    JPY: { symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', locale: 'ja-JP' },
    CHF: { symbol: 'CHF ', name: 'Swiss Franc', flag: '🇨🇭', locale: 'de-CH' },
  };

  let rates = Object.assign({}, DEFAULT_RATES);
  let lastUpdated = null;

  function init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.rates) {
          rates = Object.assign({}, DEFAULT_RATES, parsed.rates);
          lastUpdated = parsed.updated_at ? new Date(parsed.updated_at) : null;
        }
      }
    } catch (e) {
      rates = Object.assign({}, DEFAULT_RATES);
    }
  }

  function getActiveCurrency() {
    try {
      return localStorage.getItem(ACTIVE_CURRENCY_KEY) || (App.state && App.state.profile && App.state.profile.preferred_currency) || 'INR';
    } catch (e) {
      return 'INR';
    }
  }

  function setActiveCurrency(curr) {
    if (!CURRENCY_METADATA[curr]) curr = 'INR';
    try {
      localStorage.setItem(ACTIVE_CURRENCY_KEY, curr);
    } catch (e) {}
    if (App.state && App.state.profile) {
      App.state.profile.preferred_currency = curr;
    }
    document.dispatchEvent(new CustomEvent('currency-changed', { detail: { currency: curr } }));
  }

  function convert(amount, fromCurr = 'INR', toCurr = 'INR') {
    if (amount === null || amount === undefined || isNaN(amount)) return 0;
    fromCurr = fromCurr || 'INR';
    toCurr = toCurr || 'INR';
    if (fromCurr === toCurr) return Number(amount);

    // Convert fromCurr -> INR -> toCurr
    const fromRate = rates[fromCurr] || DEFAULT_RATES[fromCurr] || 1;
    const toRate = rates[toCurr] || DEFAULT_RATES[toCurr] || 1;

    // amount in fromCurr / fromRate = amount in INR
    const amountInINR = Number(amount) / fromRate;
    // amount in INR * toRate = amount in toCurr
    return amountInINR * toRate;
  }

  function formatConverted(amountINR, targetCurr, options = {}) {
    const curr = targetCurr || getActiveCurrency();
    const convertedAmount = convert(amountINR, 'INR', curr);
    const meta = CURRENCY_METADATA[curr] || CURRENCY_METADATA.INR;
    const dec = options.decimals !== undefined ? options.decimals : (curr === 'JPY' ? 0 : 2);
    
    return meta.symbol + Number(convertedAmount).toLocaleString(meta.locale || 'en-IN', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }

  function getExchangeRate(fromCurr, toCurr) {
    const fromRate = rates[fromCurr] || DEFAULT_RATES[fromCurr] || 1;
    const toRate = rates[toCurr] || DEFAULT_RATES[toCurr] || 1;
    return toRate / fromRate;
  }

  function getAllRates() {
    return Object.assign({}, rates);
  }

  function setRate(curr, rateToINR) {
    if (curr === 'INR') return;
    rates[curr] = Number(rateToINR);
    saveRates();
  }

  function saveRates() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        rates,
        updated_at: new Date().toISOString()
      }));
    } catch (e) {}
  }

  async function fetchLiveRates() {
    try {
      // Free public Open Exchange / Frankfurter exchange rates against USD/EUR
      const res = await fetch('https://api.frankfurter.app/latest?from=INR').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          Object.keys(DEFAULT_RATES).forEach((k) => {
            if (k !== 'INR' && data.rates[k]) {
              rates[k] = data.rates[k];
            }
          });
          lastUpdated = new Date();
          saveRates();
          return { success: true, count: Object.keys(data.rates).length };
        }
      }
    } catch (e) {
      console.warn('Auto live rate sync failed, using fallback cached rates:', e);
    }
    return { success: false, fallback: true };
  }

  init();

  return {
    convert,
    formatConverted,
    getActiveCurrency,
    setActiveCurrency,
    getExchangeRate,
    getAllRates,
    setRate,
    fetchLiveRates,
    CURRENCY_METADATA,
    DEFAULT_RATES,
    getLastUpdated: () => lastUpdated
  };
})();
