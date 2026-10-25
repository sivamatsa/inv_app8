// Recharge Intelligence engine (portable ES module: no Node or browser APIs).
// Ported from the standalone "Recharge Intelligence India" app:
//   src/utils/planValidator.ts, scoringEngine.ts, planCalculations.ts, src/data/officialSources.ts, src/types/plan.ts
// Loaded by the Node service (server/recharge/service.js) and, via dynamic import, by the browser view
// (js/views/recharge.js), so validation, scoring and filtering behave identically on both sides.
//
// Deliberate differences from the standalone app (each is tested in tests/recharge-engine.test.html):
//  1. Price efficiency is normalised against the costliest plan per day in the candidate pool. The original divided by
//     (maxPrice * 0.5), which made nearly every plan score ~100 on price, so the price weight barely changed rankings.
//  2. verified_at is never invented: a plan without a usable date is rejected by the validator's freshness check instead of
//     being stamped "now" (which would hide staleness). Freshness is reported via snapshotAgeDays().
//  3. normalizeSnapshotPlan() adapts the app's bundled snapshot format (server/data/*.json) to the original Plan schema
//     without turning unknown values into zeros.

export const PROVIDERS = ['Jio', 'Airtel', 'Vi', 'BSNL'];
export const QUALITY_STATUSES = ['verified', 'unverified', 'fixture'];
export const DEFAULT_WEIGHTS = { price: 30, validity: 20, data: 30, calling: 10, sms: 10 };

// Static facts about each operator's public portal (from the original app). Whether a portal is reachable right now
// is NOT stored here: the service measures it and the payload builder merges it in.
export const OFFICIAL_SOURCES = [
  {
    provider: 'Jio',
    name: 'Reliance Jio Official Mobility Portal',
    url: 'https://www.jio.com/selfcare/plans/mobility/prepaid-plans-list/',
    status: 'not_automated',
    message: 'Official Next.js SPA portal identified. Plans render dynamically on the client side via gated microservices, so automated extraction needs authorized access.',
    parser: 'client_spa_dynamic',
    automation_notes: 'Direct fetches return a static HTML shell without a pre-rendered plan array.',
  },
  {
    provider: 'Airtel',
    name: 'Bharti Airtel Official Prepaid Recharge',
    url: 'https://www.airtel.in/recharge/prepaid',
    status: 'not_automated',
    message: 'Official portal identified. Plans require circle selection or a mobile number prefix; automated access needs an authorized partner API or session.',
    parser: 'circle_gated_portal',
    automation_notes: 'Public pages serve a React shell without static plan tables.',
  },
  {
    provider: 'Vi',
    name: 'Vodafone Idea Official Online Recharge',
    url: 'https://www.myvi.in/prepaid/online-mobile-recharge',
    status: 'protected',
    message: 'WAF / bot mitigation is expected on automated requests (HTTP 403). Plans vary by telecom circle.',
    parser: 'waf_blocked',
    automation_notes: 'Server-side fetches are typically refused; an authorized enterprise API is required.',
  },
  {
    provider: 'BSNL',
    name: 'BSNL Corporate Official Portal',
    url: 'https://www.bsnl.co.in/',
    status: 'not_automated',
    message: 'Official portal identified. BSNL plans are segmented across 20+ regional telecom circles with separate state portals.',
    parser: 'multi_circle_legacy',
    automation_notes: 'No unified national JSON feed is publicly exposed; circles publish separate circulars and HTML tables.',
  },
];

// ------------------------------------------------------------------ validation
/**
 * Validates one plan against the data contract. Unknown values stay null; they are never converted to zero.
 * @returns {object|null}
 */
export function validatePlan(input) {
  if (!input || typeof input !== 'object') return null;
  const raw = input;

  if (!raw.provider || !PROVIDERS.includes(raw.provider)) return null;

  const price = Number(raw.price_inr);
  const validity = Number(raw.validity_days);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(validity) || validity <= 0) return null;

  if (typeof raw.source_url !== 'string' || !raw.source_url.startsWith('https://')) return null;

  const quality = raw.quality_status || 'unverified';
  if (!QUALITY_STATUSES.includes(quality)) return null;

  // Difference 2: a usable date is required, never defaulted to "now".
  if (typeof raw.verified_at !== 'string' || Number.isNaN(Date.parse(raw.verified_at))) return null;

  let dailyData = null;
  if (raw.daily_data_gb !== null && raw.daily_data_gb !== undefined) {
    const d = Number(raw.daily_data_gb);
    if (Number.isFinite(d) && d > 0) dailyData = d;
  }

  let totalData = null;
  if (raw.total_data_gb !== null && raw.total_data_gb !== undefined) {
    const t = Number(raw.total_data_gb);
    if (Number.isFinite(t) && t > 0) totalData = t;
  } else if (dailyData !== null && validity > 0) {
    totalData = Number((dailyData * validity).toFixed(2));
  }

  const callingUnlimited = typeof raw.calling_unlimited === 'boolean' ? raw.calling_unlimited : null;
  const callingBenefit = typeof raw.calling_benefit === 'string' && raw.calling_benefit.trim() ? raw.calling_benefit.trim() : null;
  const smsAllowance = raw.sms_allowance !== undefined && raw.sms_allowance !== null ? String(raw.sms_allowance) : null;
  const fiveGExplicit = typeof raw.five_g_explicit === 'boolean' ? raw.five_g_explicit : null;
  const additionalBenefits = Array.isArray(raw.additional_benefits) ? raw.additional_benefits.map(String).filter((s) => s.trim().length > 0) : [];
  const category = (typeof raw.category === 'string' && raw.category) || 'other';
  const scope = raw.scope === 'nationwide' || raw.scope === 'circle-specific' ? raw.scope : 'unknown';
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `${raw.provider}-${price}-${validity}-${dailyData ?? 'nodaily'}`;

  return {
    id,
    provider: raw.provider,
    price_inr: price,
    validity_days: validity,
    daily_data_gb: dailyData,
    total_data_gb: totalData,
    calling_unlimited: callingUnlimited,
    calling_benefit: callingBenefit,
    sms_allowance: smsAllowance,
    five_g_explicit: fiveGExplicit,
    additional_benefits: additionalBenefits,
    category,
    scope,
    circle_name: typeof raw.circle_name === 'string' ? raw.circle_name : null,
    source_name: typeof raw.source_name === 'string' ? raw.source_name : 'Official Provider Portal',
    source_url: raw.source_url,
    verified_at: raw.verified_at,
    quality_status: quality,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    original: raw.original,
  };
}

/** Sanitizes and de-duplicates a list of raw plan payloads. */
export function sanitizePlans(rawList) {
  if (!Array.isArray(rawList)) return { plans: [], duplicates: 0, failures: 0, missing: 0 };
  const seen = new Set();
  const plans = [];
  let duplicates = 0;
  let failures = 0;
  let missing = 0;
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') { failures++; continue; }
    if (!raw.price_inr || !raw.validity_days || !raw.provider) missing++;
    const plan = validatePlan(raw);
    if (!plan) { failures++; continue; }
    if (seen.has(plan.id)) { duplicates++; continue; }
    seen.add(plan.id);
    plans.push(plan);
  }
  return { plans, duplicates, failures, missing };
}

// ------------------------------------------------------------------ snapshot adapter (difference 3)
/**
 * Adapts one record of the bundled snapshot format (camelCase, server/data/*.json) to the Plan input contract.
 * Only maps what the record states; anything not stated stays null.
 */
export function normalizeSnapshotPlan(p) {
  if (!p || typeof p !== 'object') return null;
  const calling = typeof p.calling === 'string' ? p.calling.trim() : '';
  const sms = typeof p.sms === 'string' ? p.sms.trim() : '';
  const noSms = /^(not included|none|no sms)/i.test(sms);
  const daily = Number(p.dailyDataGB);
  const total = Number(p.totalDataGB);
  const scopeText = String(p.circleScope || '').trim();
  return {
    id: p.id,
    provider: p.provider,
    price_inr: p.price,
    validity_days: p.validityDays,
    daily_data_gb: Number.isFinite(daily) && daily > 0 ? daily : null,
    total_data_gb: Number.isFinite(total) && total > 0 ? total : null,
    calling_unlimited: calling ? (/unlimited/i.test(calling) ? true : null) : null,
    calling_benefit: calling || null,
    sms_allowance: sms && !noSms ? sms : null,
    five_g_explicit: typeof p.is5GEligible === 'boolean' ? p.is5GEligible : null,
    additional_benefits: Array.isArray(p.additionalBenefits) ? p.additionalBenefits : [],
    category: typeof p.category === 'string' ? p.category.replace(/_/g, '-') : 'other',
    scope: /^(national|nationwide|pan[- ]?india|all[- ]?india)$/i.test(scopeText) ? 'nationwide' : (scopeText ? 'circle-specific' : 'unknown'),
    circle_name: scopeText && !/^(national|nationwide)$/i.test(scopeText) ? scopeText : null,
    source_name: p.sourceName,
    source_url: p.sourceUrl,
    verified_at: p.verifiedAt,
    quality_status: p.verificationStatus === 'verified' ? 'verified' : 'unverified',
    notes: p.notes,
    original: p,
  };
}

/** Whole days since the plan's data was stated as verified (null if unknown). */
export function snapshotAgeDays(plan, now) {
  const t = Date.parse(plan && plan.verified_at);
  if (Number.isNaN(t)) return null;
  const ref = typeof now === 'number' ? now : Date.now();
  return Math.max(0, Math.floor((ref - t) / 86400000));
}

/** 'fresh' <= 30 days, 'aging' <= 90, 'stale' beyond. */
export function freshnessLevel(ageDays) {
  if (ageDays === null || ageDays === undefined) return 'unknown';
  if (ageDays <= 30) return 'fresh';
  if (ageDays <= 90) return 'aging';
  return 'stale';
}

// ------------------------------------------------------------------ scoring
/** Pool bounds used to normalise scores (difference 1 adds maxCostPerDay). */
export function computeBounds(plans) {
  const valid = (plans || []).filter((p) => p.price_inr > 0 && p.validity_days > 0);
  return {
    maxPrice: Math.max(1, ...valid.map((p) => p.price_inr)),
    maxValidity: Math.max(1, ...valid.map((p) => p.validity_days)),
    maxData: Math.max(1, ...valid.map((p) => p.total_data_gb ?? (p.daily_data_gb ? p.daily_data_gb * p.validity_days : 0))),
    maxCostPerDay: Math.max(0.0001, ...valid.map((p) => p.price_inr / p.validity_days)),
  };
}

/**
 * Transparent, configurable value score. Unknown dimensions are not scored as zero: weights are re-normalised across the
 * dimensions that are available, so incomplete data does not unfairly distort the ranking.
 */
export function calculatePlanScore(plan, maxBounds, weights) {
  if (plan.price_inr <= 0 || plan.validity_days <= 0) return null;

  const costPerDay = plan.price_inr / plan.validity_days;
  // Difference 1: lower cost/day => higher score, relative to the costliest plan per day in the pool.
  const maxCostPerDay = maxBounds.maxCostPerDay > 0 ? maxBounds.maxCostPerDay : costPerDay;
  const priceScore = Math.max(0, Math.min(1, 1 - costPerDay / Math.max(costPerDay, maxCostPerDay)));

  const validityScore = maxBounds.maxValidity > 0 ? Math.min(1, plan.validity_days / maxBounds.maxValidity) : 0.5;

  let dataScore = null;
  if (plan.total_data_gb !== null && plan.total_data_gb !== undefined && maxBounds.maxData > 0) {
    dataScore = Math.min(1, plan.total_data_gb / maxBounds.maxData);
  }

  let callingScore = null;
  if (plan.calling_unlimited === true) callingScore = 1.0;
  else if (plan.calling_unlimited === false) callingScore = 0.3;

  let smsScore = null;
  if (plan.sms_allowance !== null && plan.sms_allowance !== undefined) {
    const smsNum = parseInt(String(plan.sms_allowance).replace(/\D/g, ''), 10);
    smsScore = !isNaN(smsNum) && smsNum > 0 ? Math.min(1, smsNum / 100) : 0.4;
  }

  let weightedScoreSum = 0;
  let activeWeightSum = 0;
  if (weights.price > 0) { weightedScoreSum += weights.price * priceScore; activeWeightSum += weights.price; }
  if (weights.validity > 0) { weightedScoreSum += weights.validity * validityScore; activeWeightSum += weights.validity; }
  if (weights.data > 0 && dataScore !== null) { weightedScoreSum += weights.data * dataScore; activeWeightSum += weights.data; }
  if (weights.calling > 0 && callingScore !== null) { weightedScoreSum += weights.calling * callingScore; activeWeightSum += weights.calling; }
  if (weights.sms > 0 && smsScore !== null) { weightedScoreSum += weights.sms * smsScore; activeWeightSum += weights.sms; }

  const finalScore = activeWeightSum > 0 ? Math.round((weightedScoreSum / activeWeightSum) * 100) : 0;
  const share = (w, s) => (s !== null && activeWeightSum > 0 ? (w * s) / activeWeightSum : 0);

  return {
    plan,
    totalScore: finalScore,
    effectiveWeightSum: activeWeightSum,
    components: {
      priceEfficiency: { score: Math.round(priceScore * 100), weight: weights.price, contribution: share(weights.price, priceScore), costPerDay: Number(costPerDay.toFixed(2)) },
      validity: { score: Math.round(validityScore * 100), weight: weights.validity, contribution: share(weights.validity, validityScore), days: plan.validity_days },
      dataAllowance: { score: dataScore !== null ? Math.round(dataScore * 100) : 0, weight: weights.data, contribution: share(weights.data, dataScore), totalGb: plan.total_data_gb },
      calling: { score: callingScore !== null ? Math.round(callingScore * 100) : 0, weight: weights.calling, contribution: share(weights.calling, callingScore), unlimited: plan.calling_unlimited },
      sms: { score: smsScore !== null ? Math.round(smsScore * 100) : 0, weight: weights.sms, contribution: share(weights.sms, smsScore), count: plan.sms_allowance },
    },
  };
}

// ------------------------------------------------------------------ filtering, sorting, metrics
export const DEFAULT_FILTERS = {
  search: '', provider: 'all', minPrice: '', maxPrice: '', minValidity: '', maxValidity: '',
  minDaily: '', minTotal: '', calling: 'any', sms: 'any', fiveg: 'any', category: 'all', sort: 'value-score',
};

export function filterPlans(plans, filters) {
  return plans.filter((plan) => {
    if (filters.provider !== 'all' && plan.provider !== filters.provider) return false;

    if (String(filters.search || '').trim()) {
      const q = String(filters.search).toLowerCase().trim();
      const searchable = [
        plan.provider,
        `₹${plan.price_inr}`,
        `${plan.price_inr}`,
        `${plan.validity_days} days`,
        plan.daily_data_gb !== null ? `${plan.daily_data_gb}gb/day` : '',
        plan.total_data_gb !== null ? `${plan.total_data_gb}gb` : '',
        plan.calling_benefit || '',
        plan.sms_allowance || '',
        plan.category,
        ...(plan.additional_benefits || []),
      ].join(' ').toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    if (filters.minPrice !== '' && plan.price_inr < Number(filters.minPrice)) return false;
    if (filters.maxPrice !== '' && plan.price_inr > Number(filters.maxPrice)) return false;
    if (filters.minValidity !== '' && plan.validity_days < Number(filters.minValidity)) return false;
    if (filters.maxValidity !== '' && plan.validity_days > Number(filters.maxValidity)) return false;

    if (filters.minDaily !== '') {
      if (plan.daily_data_gb === null || plan.daily_data_gb < Number(filters.minDaily)) return false;
    }
    if (filters.minTotal !== '') {
      if (plan.total_data_gb === null || plan.total_data_gb < Number(filters.minTotal)) return false;
    }

    if (filters.calling === 'yes' && plan.calling_unlimited !== true) return false;
    if (filters.calling === 'no' && plan.calling_unlimited === true) return false;
    if (filters.sms === 'yes' && !plan.sms_allowance) return false;
    if (filters.sms === 'no' && plan.sms_allowance) return false;
    if (filters.fiveg === 'yes' && plan.five_g_explicit !== true) return false;
    if (filters.fiveg === 'no' && plan.five_g_explicit === true) return false;
    if (filters.category !== 'all' && plan.category !== filters.category) return false;
    return true;
  });
}

export function sortPlans(plans, sortBy, weights) {
  const cloned = [...plans];
  const bounds = computeBounds(cloned);
  switch (sortBy) {
    case 'price-asc': return cloned.sort((a, b) => a.price_inr - b.price_inr);
    case 'price-desc': return cloned.sort((a, b) => b.price_inr - a.price_inr);
    case 'validity-asc': return cloned.sort((a, b) => a.validity_days - b.validity_days);
    case 'validity-desc': return cloned.sort((a, b) => b.validity_days - a.validity_days);
    case 'daily-desc': return cloned.sort((a, b) => (b.daily_data_gb ?? 0) - (a.daily_data_gb ?? 0));
    case 'total-desc': return cloned.sort((a, b) => (b.total_data_gb ?? 0) - (a.total_data_gb ?? 0));
    case 'cost-day':
      return cloned.sort((a, b) => {
        const ca = a.validity_days > 0 ? a.price_inr / a.validity_days : 999999;
        const cb = b.validity_days > 0 ? b.price_inr / b.validity_days : 999999;
        return ca - cb;
      });
    case 'cost-gb':
      return cloned.sort((a, b) => {
        const ca = a.total_data_gb && a.total_data_gb > 0 ? a.price_inr / a.total_data_gb : Infinity;
        const cb = b.total_data_gb && b.total_data_gb > 0 ? b.price_inr / b.total_data_gb : Infinity;
        return ca - cb;
      });
    case 'value-score':
      if (!weights) return cloned;
      return cloned.sort((a, b) => {
        const sa = calculatePlanScore(a, bounds, weights)?.totalScore ?? 0;
        const sb = calculatePlanScore(b, bounds, weights)?.totalScore ?? 0;
        return sb - sa;
      });
    default: return cloned;
  }
}

export function calculateMetrics(plans, weights) {
  if (plans.length === 0) return { count: 0, lowestPrice: null, longestValidity: null, bestValue: null };
  const validPlans = plans.filter((p) => p.price_inr > 0 && p.validity_days > 0);
  if (validPlans.length === 0) return { count: plans.length, lowestPrice: null, longestValidity: null, bestValue: null };

  const bounds = computeBounds(validPlans);
  let best = null;
  for (const p of validPlans) {
    const sc = calculatePlanScore(p, bounds, weights);
    if (sc && (!best || sc.totalScore > best.score)) best = { plan: p, score: sc.totalScore };
  }
  return {
    count: plans.length,
    lowestPrice: Math.min(...validPlans.map((p) => p.price_inr)),
    longestValidity: Math.max(...validPlans.map((p) => p.validity_days)),
    bestValue: best,
  };
}

// ------------------------------------------------------------------ payload assembly (pure; used by the service and tests)
/**
 * @param {{snapshots: Record<string, object[]>, pings?: Record<string, {reachable:boolean,status:number,latency:number,error?:string}|null>, checkedAt?: string, now?: number}} input
 *   snapshots keyed by lower-case provider id (jio, airtel, vi, bsnl); pings keyed the same way.
 */
export function buildRechargePayload({ snapshots, pings, checkedAt, now }) {
  const stamp = checkedAt || new Date(typeof now === 'number' ? now : Date.now()).toISOString();
  const refNow = typeof now === 'number' ? now : Date.now();
  const rawPlans = [];
  for (const key of Object.keys(snapshots || {})) {
    for (const rec of snapshots[key] || []) {
      const norm = normalizeSnapshotPlan(rec);
      if (norm) rawPlans.push(norm);
    }
  }
  const { plans, duplicates, failures, missing } = sanitizePlans(rawPlans);

  const sources = OFFICIAL_SOURCES.map((src) => {
    const key = src.provider.toLowerCase();
    const mine = plans.filter((p) => p.provider === src.provider);
    const dates = mine.map((p) => Date.parse(p.verified_at)).filter((t) => !Number.isNaN(t));
    const newest = dates.length ? new Date(Math.max(...dates)).toISOString() : null;
    const ping = pings ? pings[key] : null;
    return {
      provider: src.provider,
      name: src.name,
      url: src.url,
      status: src.status, // static fact about the portal (not automated / protected)
      message: src.message,
      parser: src.parser,
      automation_notes: src.automation_notes,
      data_origin: 'bundled_snapshot',
      plan_count: mine.length,
      snapshot_verified_at: newest,
      snapshot_age_days: newest ? snapshotAgeDays({ verified_at: newest }, refNow) : null,
      site_reachable: ping ? !!ping.reachable : null, // measured liveness of the operator site, NOT of plan data
      http_status: ping ? ping.status : null,
      latency_ms: ping ? ping.latency : null,
      ping_error: ping && ping.error ? ping.error : null,
      last_checked: ping ? stamp : null,
    };
  });

  const warnings = [];
  const newestAll = plans.length ? Math.max(...plans.map((p) => Date.parse(p.verified_at)).filter((t) => !Number.isNaN(t))) : null;
  const ageAll = newestAll ? snapshotAgeDays({ verified_at: new Date(newestAll).toISOString() }, refNow) : null;
  if (plans.length === 0) warnings.push('No valid plans were found in the bundled snapshots.');
  if (ageAll !== null && freshnessLevel(ageAll) !== 'fresh') warnings.push(`The newest plan data is ${ageAll} days old. Check the operator portals before recharging.`);
  if (failures > 0) warnings.push(`${failures} snapshot record(s) failed validation and were left out.`);

  return {
    ok: plans.length > 0,
    checked_at: stamp,
    mode: 'bundled_snapshot',
    plans,
    sources,
    diagnostics: {
      checked_at: stamp,
      mode: 'bundled_snapshot',
      message: 'Plan data comes from tariff snapshots bundled with Investment OS and is not fetched live from the operators. The reachability check only tests whether each operator site responds.',
      warnings,
      duplicate_count: duplicates,
      validation_failures: failures,
      missing_fields: missing,
      newest_snapshot_age_days: ageAll,
    },
  };
}
