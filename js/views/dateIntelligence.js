/* Calendar Date Intelligence Module
   Transforms existing date records across Deals, Payments, Recurring Investments,
   Fixed Deposits, Gold, Goals, Expenses, and Calendar Events into rich date intelligence,
   dynamic countdowns, multi-date difference matrices, conflict alerts, and timelines.
   Includes custom user-created cards: Age Card (auto-updating daily), Career Experience
   Card (multi-organization timeline with overlap warnings), and Custom Event Countdowns,
   with global and per-card expand/collapse controls. Zero duplicate databases. */
window.App = window.App || {};

App.dateIntelligence = (function () {
  const PINNED_STORAGE_KEY = 'ios_pinned_countdowns_v1';
  const CUSTOM_CARDS_KEY = 'ios_custom_intel_cards_v1';

  // State for user filters, interactive comparison widgets, and expand/collapse
  const state = {
    categoryFilter: 'All',
    statusFilter: 'All',
    priorityFilter: 'All',
    periodFilter: 'All',
    matrixDateIds: [],
    cmpDateA: '',
    cmpDateB: 'TODAY',
    calcStartDate: '',
    calcOp: '+',
    calcAmount: 30,
    calcUnit: 'days',
    calcExcludeWeekends: false,
    selectedYear: new Date().getFullYear(),
    collapsedCardIds: new Set(),
    allCollapsed: false,
  };

  // Helper: Timezone-safe date-only parsing
  function parseDateOnly(dateStr) {
    if (!dateStr) return null;
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d, 0, 0, 0, 0);
  }

  function getDaysBetween(d1Str, d2Str) {
    const dt1 = parseDateOnly(d1Str);
    const dt2 = parseDateOnly(d2Str);
    if (!dt1 || !dt2) return 0;
    const msDiff = dt2.getTime() - dt1.getTime();
    return Math.round(msDiff / (1000 * 60 * 60 * 24));
  }

  function formatDetailedUnits(days) {
    const absDays = Math.abs(days);
    const years = Math.floor(absDays / 365.25);
    const remAfterYears = absDays - Math.floor(years * 365.25);
    const months = Math.floor(remAfterYears / 30.4375);
    const remAfterMonths = remAfterYears - Math.floor(months * 30.4375);
    const weeks = Math.floor(remAfterMonths / 7);
    const daysRemainder = Math.max(0, Math.round(remAfterMonths - (weeks * 7)));
    const totalWeeks = Math.floor(absDays / 7);
    const totalMonths = Math.floor(absDays / 30.4375);

    const parts = [];
    if (years > 0) parts.push(`${years} Year${years !== 1 ? 's' : ''}`);
    parts.push(`${months} Month${months !== 1 ? 's' : ''}`);
    parts.push(`${weeks} Week${weeks !== 1 ? 's' : ''}`);
    parts.push(`${daysRemainder} Day${daysRemainder !== 1 ? 's' : ''}`);
    if (totalMonths > 0) parts.push(`(${totalMonths} Months Total)`);

    const badgeParts = [];
    if (years > 0) badgeParts.push(`${years}y`);
    badgeParts.push(`${months}m`);
    badgeParts.push(`${weeks}w`);
    badgeParts.push(`${daysRemainder}d`);
    if (totalMonths > 0) badgeParts.push(`[${totalMonths} mos]`);

    return {
      years,
      months,
      weeks,
      totalWeeks,
      totalMonths,
      days: daysRemainder,
      totalDays: absDays,
      badgeStr: badgeParts.join(' '),
      fullText: parts.join(', '),
      chipHtml: `<span style="display:inline-flex;gap:3px;align-items:center;font-size:10px;font-weight:700;flex-wrap:wrap">
        ${years > 0 ? `<span class="badge" style="background:rgba(201,168,76,0.15);color:var(--gold);padding:1px 5px">${years}y</span>` : ''}
        <span class="badge" style="background:rgba(22,201,163,0.15);color:var(--teal);padding:1px 5px">${months}m</span>
        ${totalMonths > 0 ? `<span class="badge" style="background:rgba(168,85,247,0.15);color:#a855f7;padding:1px 5px">${totalMonths} mos</span>` : ''}
        <span class="badge" style="background:rgba(79,142,247,0.15);color:#4f8ef7;padding:1px 5px">${weeks}w</span>
        <span class="badge" style="background:rgba(100,116,139,0.15);color:var(--text2);padding:1px 5px">${daysRemainder}d</span>
      </span>`
    };
  }

  function formatTimeRemaining(days) {
    if (days === 0) return 'Today (Due now)';
    if (days === 1) return 'Tomorrow (1 day left)';
    if (days === -1) return 'Yesterday (1 day ago)';

    const absDays = Math.abs(days);
    const isPast = days < 0;
    const prefix = isPast ? `${absDays}d ago` : `${absDays}d remaining`;

    const u = formatDetailedUnits(days);
    return `${prefix} • ${u.badgeStr}`;
  }

  function formatDetailedDiff(days) {
    const u = formatDetailedUnits(days);
    return {
      totalDays: u.totalDays,
      readable: u.fullText,
      badgeStr: u.badgeStr,
      weeksFormat: `${u.weeks} week${u.weeks !== 1 ? 's' : ''} and ${u.days} day${u.days !== 1 ? 's' : ''}`,
    };
  }

  // Exact Age / Living Duration calculation algorithm
  function calcExactAge(startDateStr, endDateStr) {
    const start = parseDateOnly(startDateStr);
    const end = parseDateOnly(endDateStr || App.utils.todayISO());
    if (!start || !end) return null;

    let y = end.getFullYear() - start.getFullYear();
    let m = end.getMonth() - start.getMonth();
    let d = end.getDate() - start.getDate();

    if (d < 0) {
      const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      d += prevMonth.getDate();
      m--;
    }
    if (m < 0) {
      y--;
      m += 12;
    }

    const totalDays = getDaysBetween(startDateStr, endDateStr || App.utils.todayISO());
    const totalWeeks = Math.floor(Math.abs(totalDays) / 7);

    // Next Birthday calculation
    const thisYear = end.getFullYear();
    const birthMonth = start.getMonth() + 1;
    const birthDay = start.getDate();
    const bMonthStr = String(birthMonth).padStart(2, '0');
    const bDayStr = String(birthDay).padStart(2, '0');

    let nextBdayStr = `${thisYear}-${bMonthStr}-${bDayStr}`;
    let daysUntilNext = getDaysBetween(endDateStr || App.utils.todayISO(), nextBdayStr);
    if (daysUntilNext < 0) {
      nextBdayStr = `${thisYear + 1}-${bMonthStr}-${bDayStr}`;
      daysUntilNext = getDaysBetween(endDateStr || App.utils.todayISO(), nextBdayStr);
    }

    return {
      years: Math.max(0, y),
      months: Math.max(0, m),
      totalMonths: Math.max(0, y) * 12 + Math.max(0, m),
      days: Math.max(0, d),
      totalDays: Math.abs(totalDays),
      totalWeeks,
      nextBirthdayDate: nextBdayStr,
      daysUntilNextBirthday: daysUntilNext,
    };
  }

  // Career Experience breakdown and overlap detection algorithm
  function calcExperienceBreakdown(orgs) {
    if (!Array.isArray(orgs) || !orgs.length) return null;
    const todayStr = App.utils.todayISO();

    // Sort chronologically ascending
    const sorted = orgs.slice().sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

    let totalSummedDays = 0;
    const stints = sorted.map((org, idx) => {
      const startStr = org.startDate || todayStr;
      const endStr = org.isCurrent || !org.endDate ? todayStr : org.endDate;
      const diff = Math.max(0, getDaysBetween(startStr, endStr));
      totalSummedDays += diff;

      // Stint tenure breakdown
      const startD = parseDateOnly(startStr);
      const endD = parseDateOnly(endStr);
      let y = 0, m = 0, d = 0;
      if (startD && endD && endD >= startD) {
        y = endD.getFullYear() - startD.getFullYear();
        m = endD.getMonth() - startD.getMonth();
        d = endD.getDate() - startD.getDate();
        if (d < 0) {
          const prevMonth = new Date(endD.getFullYear(), endD.getMonth(), 0);
          d += prevMonth.getDate();
          m--;
        }
        if (m < 0) { y--; m += 12; }
      }

      return {
        ...org,
        effectiveEnd: endStr,
        durationDays: diff,
        years: Math.max(0, y),
        months: Math.max(0, m),
        totalMonths: Math.max(0, y) * 12 + Math.max(0, m),
        days: Math.max(0, d),
      };
    });

    // Overlap detection between all pairs of organizations
    const overlaps = [];
    for (let i = 0; i < stints.length; i++) {
      for (let j = i + 1; j < stints.length; j++) {
        const a = stints[i];
        const b = stints[j];
        const maxStart = a.startDate > b.startDate ? a.startDate : b.startDate;
        const minEnd = a.effectiveEnd < b.effectiveEnd ? a.effectiveEnd : b.effectiveEnd;
        if (maxStart < minEnd) {
          const overlapDays = getDaysBetween(maxStart, minEnd);
          if (overlapDays > 0) {
            overlaps.push({
              orgA: a.company || `Role #${i + 1}`,
              orgB: b.company || `Role #${j + 1}`,
              overlapDays,
              approxMonths: Math.round(overlapDays / 30.4),
            });
          }
        }
      }
    }

    // Net calendar days calculation (merges overlapping intervals)
    const intervals = stints.map((s) => [parseDateOnly(s.startDate)?.getTime() || 0, parseDateOnly(s.effectiveEnd)?.getTime() || 0])
      .filter(([s, e]) => s && e && e >= s)
      .sort((a, b) => a[0] - b[0]);

    let netCalendarDays = 0;
    if (intervals.length) {
      let [curStart, curEnd] = intervals[0];
      for (let k = 1; k < intervals.length; k++) {
        const [nextStart, nextEnd] = intervals[k];
        if (nextStart <= curEnd) {
          curEnd = Math.max(curEnd, nextEnd);
        } else {
          netCalendarDays += Math.round((curEnd - curStart) / (1000 * 60 * 60 * 24));
          curStart = nextStart;
          curEnd = nextEnd;
        }
      }
      netCalendarDays += Math.round((curEnd - curStart) / (1000 * 60 * 60 * 24));
    }

    const netYears = Math.floor(netCalendarDays / 365.25);
    const remNetDays = netCalendarDays % 365.25;
    const netMonths = Math.floor(remNetDays / 30.4);
    const netDays = Math.round(remNetDays % 30.4);

    const sumYears = Math.floor(totalSummedDays / 365.25);
    const remSumDays = totalSummedDays % 365.25;
    const sumMonths = Math.floor(remSumDays / 30.4);
    const sumDays = Math.round(remSumDays % 30.4);

    return {
      stints,
      overlaps,
      hasOverlaps: overlaps.length > 0,
      totalSummedDays,
      sumTenure: { years: sumYears, months: sumMonths, days: sumDays, totalMonths: sumYears * 12 + sumMonths },
      netCalendarDays,
      netTenure: { years: netYears, months: netMonths, days: netDays, totalMonths: netYears * 12 + netMonths },
    };
  }

  // Pinned countdown storage (Supabase user profile with local fallback)
  function getPinnedIds() {
    try {
      const profile = App.state && App.state.profile;
      if (profile && profile.preferences && Array.isArray(profile.preferences.pinned_countdowns)) {
        return new Set(profile.preferences.pinned_countdowns);
      }
      const raw = localStorage.getItem(PINNED_STORAGE_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) {
      return new Set();
    }
  }

  async function togglePin(id) {
    const pinned = getPinnedIds();
    if (pinned.has(id)) pinned.delete(id);
    else pinned.add(id);

    const arr = Array.from(pinned);
    try { localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(arr)); } catch (_) {}

    try {
      if (App.state && App.state.profile && App.api && App.api.updateProfile) {
        const prefs = Object.assign({}, App.state.profile.preferences || {}, { pinned_countdowns: arr });
        await App.api.updateProfile(App.state.profile.id, { preferences: prefs });
        App.state.profile.preferences = prefs;
      }
    } catch (_) {}
  }

  // Custom User Cards Storage (Age cards, Experience cards, Custom Countdown cards)
  // Multi-synced across:
  // 1. Supabase PostgreSQL `user_intelligence_cards` table (Authoritative cross-browser storage)
  // 2. Supabase Auth user metadata (`custom_intel_cards`)
  // 3. Profiles table preferences JSONB
  // 4. LocalStorage
  const DUMMY_PURGED_KEY = 'investment_os_intel_dummy_purged';
  let cachedCustomCards = null;

  function isDummyPurged() {
    try {
      if (localStorage.getItem(DUMMY_PURGED_KEY) === 'true') return true;
      const user = App.auth && App.auth.getUser ? App.auth.getUser() : null;
      if (user && user.user_metadata && user.user_metadata.dummy_purged) return true;
      const profile = App.state && App.state.profile;
      if (profile && profile.preferences && profile.preferences.dummy_purged) return true;
    } catch (_) {}
    return false;
  }

  async function fetchSupabaseCustomCards() {
    try {
      // 1. Fetch from dedicated Supabase PostgreSQL table
      if (App.api && App.api.listUserIntelligenceCards) {
        const cloudCards = await App.api.listUserIntelligenceCards();
        if (Array.isArray(cloudCards)) {
          const nonSample = cloudCards.filter((c) => c && c.id && !c.id.includes('sample'));
          if (nonSample.length > 0) {
            cachedCustomCards = nonSample;
            try {
              localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(nonSample));
              localStorage.setItem(DUMMY_PURGED_KEY, 'true');
            } catch (_) {}
            return nonSample;
          }
        }
      }

      // 2. Fetch from Supabase Auth user metadata
      const client = App.auth && App.auth.getClient ? App.auth.getClient() : null;
      if (client && client.auth && client.auth.getUser) {
        const { data } = await client.auth.getUser().catch(() => ({}));
        const authUser = data?.user;
        if (authUser && authUser.user_metadata) {
          if (authUser.user_metadata.dummy_purged) {
            try { localStorage.setItem(DUMMY_PURGED_KEY, 'true'); } catch (_) {}
          }
          if (Array.isArray(authUser.user_metadata.custom_intel_cards)) {
            const nonSample = authUser.user_metadata.custom_intel_cards.filter((c) => c && c.id && !c.id.includes('sample'));
            if (nonSample.length > 0) {
              cachedCustomCards = nonSample;
              try {
                localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(nonSample));
                localStorage.setItem(DUMMY_PURGED_KEY, 'true');
              } catch (_) {}
              return nonSample;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[DateIntelligence] Cloud cards fetch note:', e);
    }
    return null;
  }

  function getCustomCards() {
    try {
      let rawList = cachedCustomCards;

      // 1. Supabase Auth user metadata (cross-browser/cross-device store)
      const user = App.auth && App.auth.getUser ? App.auth.getUser() : null;
      if (!rawList && user && user.user_metadata && Array.isArray(user.user_metadata.custom_intel_cards) && user.user_metadata.custom_intel_cards.length > 0) {
        rawList = user.user_metadata.custom_intel_cards;
      }

      // 2. Profile preferences or direct profile field
      const profile = App.state && App.state.profile;
      if (!rawList && profile && Array.isArray(profile.custom_intel_cards) && profile.custom_intel_cards.length > 0) {
        rawList = profile.custom_intel_cards;
      }
      if (!rawList && profile && profile.preferences && Array.isArray(profile.preferences.custom_intel_cards) && profile.preferences.custom_intel_cards.length > 0) {
        rawList = profile.preferences.custom_intel_cards;
      }

      // 3. LocalStorage
      if (!rawList) {
        const raw = localStorage.getItem(CUSTOM_CARDS_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
          } catch (_) {}
        }
      }

      // If user has created ANY non-sample card or purged dummy data, permanently purge dummy templates!
      if (isDummyPurged()) {
        const sanitized = (rawList || []).filter((c) => c && c.id && !c.id.includes('sample'));
        cachedCustomCards = sanitized;
        return sanitized;
      }

      if (rawList && Array.isArray(rawList)) {
        const hasRealCards = rawList.some((c) => c && c.id && !c.id.includes('sample'));
        if (hasRealCards) {
          try { localStorage.setItem(DUMMY_PURGED_KEY, 'true'); } catch (_) {}
          const filtered = rawList.filter((c) => c && c.id && !c.id.includes('sample'));
          cachedCustomCards = filtered;
          return filtered;
        }
        return rawList;
      }

      // Default initial templates shown ONLY if user has never added any cards
      return [
        {
          id: 'card_age_sample',
          cardType: 'age',
          title: 'My Age & Living Duration',
          startDate: '1995-05-14',
          endDateMode: 'LIVE',
          fixedEndDate: null,
          isPinned: true,
          isSample: true,
          notes: 'Auto-updating age counter in years, months, days, and next birthday countdown',
        },
        {
          id: 'card_exp_sample',
          cardType: 'experience',
          title: 'Total Career Experience',
          isPinned: true,
          isSample: true,
          organizations: [
            { id: 'stint_1', company: 'HCL Technologies', role: 'Senior Software Engineer', startDate: '2023-01-16', endDate: null, isCurrent: true, notes: 'Full-stack engineering & architecture' },
            { id: 'stint_2', company: 'TCS', role: 'Systems Engineer', startDate: '2020-07-01', endDate: '2023-01-10', isCurrent: false, notes: 'Cloud infrastructure & microservices' },
          ],
        },
      ];
    } catch (_) {
      return [];
    }
  }

  async function saveCustomCards(cards) {
    try {
      // Purge sample dummy cards permanently
      const sanitized = (cards || []).filter((c) => c && c.id && !c.id.includes('sample'));
      cachedCustomCards = sanitized;

      // 1. LocalStorage update + purge flag
      try {
        localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(sanitized));
        localStorage.setItem(DUMMY_PURGED_KEY, 'true');
      } catch (_) {}

      // 2. In-memory profile & auth user sync
      if (App.state && App.state.profile) {
        App.state.profile.preferences = Object.assign({}, App.state.profile.preferences || {}, {
          custom_intel_cards: sanitized,
          dummy_purged: true,
        });
      }
      const user = App.auth && App.auth.getUser ? App.auth.getUser() : null;
      if (user && user.user_metadata) {
        user.user_metadata.custom_intel_cards = sanitized;
        user.user_metadata.dummy_purged = true;
      }

      // 3. Supabase dedicated PostgreSQL table sync (Authoritative cross-browser persistence)
      if (App.api && App.api.saveUserIntelligenceCard) {
        for (const card of sanitized) {
          await App.api.saveUserIntelligenceCard(card).catch(() => {});
        }
      }

      // 4. Supabase Auth user metadata update (Persists across ALL browsers and logins!)
      const client = App.auth && App.auth.getClient ? App.auth.getClient() : null;
      if (client && client.auth && client.auth.updateUser) {
        try {
          await client.auth.updateUser({
            data: {
              custom_intel_cards: sanitized,
              dummy_purged: true,
              custom_intel_cards_synced_at: new Date().toISOString(),
            },
          });
        } catch (authErr) {
          console.warn('[DateIntelligence] Cloud auth user metadata update notice:', authErr);
        }
      }

      // 5. Supabase Profiles table update (single-argument patch object)
      if (App.api && App.api.updateProfile) {
        try {
          await App.api.updateProfile({
            preferences: Object.assign({}, App.state?.profile?.preferences || {}, {
              custom_intel_cards: sanitized,
              dummy_purged: true,
            }),
          });
        } catch (profErr) {
          console.warn('[DateIntelligence] Profile preferences update notice:', profErr);
        }
      }
    } catch (e) {
      console.warn('[DateIntelligence] Could not sync custom cards:', e);
    }
  }

  async function addOrUpdateCustomCard(cardData) {
    let cards = getCustomCards();
    // Delete dummy sample data once user creates or saves their own card!
    cards = cards.filter((c) => c && c.id && !c.id.includes('sample'));

    const idx = cards.findIndex((c) => c.id === cardData.id);
    if (idx >= 0) {
      cards[idx] = Object.assign({}, cards[idx], cardData, { updatedAt: new Date().toISOString() });
    } else {
      const newCard = Object.assign({}, cardData, {
        id: cardData.id || `custom_card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      });
      cards.unshift(newCard);
    }
    await saveCustomCards(cards);
  }

  async function deleteCustomCard(cardId) {
    if (App.api && App.api.deleteUserIntelligenceCard) {
      await App.api.deleteUserIntelligenceCard(cardId).catch(() => {});
    }
    let cards = getCustomCards();
    const target = cards.find((c) => c.id === cardId);
    if (target && App.recycleBin && App.recycleBin.moveToTrash) {
      await App.recycleBin.moveToTrash('DateIntelligenceCard', {
        id: target.id,
        name: target.title,
        amount: 0,
        ...target,
      }, { reason: 'User deleted custom intelligence card' });
    }
    cards = cards.filter((c) => c.id !== cardId);
    await saveCustomCards(cards);
  }

  // Unified Normalized Date Query Pipeline (reads existing sources without duplicating)
  async function loadAllDateItems() {
    const todayStr = App.utils.todayISO();

    const [
      deals,
      schedule,
      recurringItems,
      recurringOccurrences,
      accounts,
      goldPurchases,
      goals,
      calendarEvents,
      expenseTxns,
    ] = await Promise.all([
      App.api.listDeals ? App.api.listDeals() : [],
      App.api.listSchedule ? App.api.listSchedule() : [],
      App.api.listRecurringItems ? App.api.listRecurringItems() : [],
      App.api.listRecurringOccurrences ? App.api.listRecurringOccurrences() : [],
      App.api.listAccounts ? App.api.listAccounts() : [],
      App.api.listGoldPurchases ? App.api.listGoldPurchases() : [],
      App.api.listGoals ? App.api.listGoals() : [],
      App.api.listCalendarEvents ? App.api.listCalendarEvents() : [],
      App.api.listExpenseTransactions ? App.api.listExpenseTransactions() : [],
    ]);

    const pinnedSet = getPinnedIds();
    const items = [];

    // 1. Deals: Maturities & Start Dates
    (deals || []).forEach((d) => {
      if (d.maturity_date) {
        const days = getDaysBetween(todayStr, d.maturity_date);
        const isClosed = d.status === 'CLOSED' || d.status === 'SETTLED' || d.status === 'COMPLETED';
        items.push({
          id: `deal_mat_${d.id}`,
          title: `${d.deal_name || 'Deal'} Maturity`,
          targetDate: d.maturity_date.slice(0, 10),
          startDate: d.start_date ? d.start_date.slice(0, 10) : null,
          category: 'Deal',
          subType: d.investment_type || 'Alternative Debt',
          status: isClosed ? 'COMPLETED' : (days === 0 ? 'TODAY' : (days < 0 ? 'OVERDUE' : 'UPCOMING')),
          priority: (d.invested_amount || 0) >= 100000 ? 'High' : 'Medium',
          amount: Number(d.invested_amount || d.principal_amount || 0),
          currency: 'INR',
          linkedModule: 'deals',
          linkedRecordId: d.id,
          sourceType: 'Deal Maturity',
          isPinned: pinnedSet.has(`deal_mat_${d.id}`),
          daysRemaining: days,
          institution: d.platform_name || d.platform || '',
          raw: d,
        });
      }
    });

    // 2. Deal Payment Schedule (Upcoming interest/principal payments)
    const dealsById = {};
    (deals || []).forEach((d) => { dealsById[d.id] = d; });

    (schedule || []).forEach((s) => {
      if (s.scheduled_date) {
        const dObj = dealsById[s.deal_id] || {};
        const days = getDaysBetween(todayStr, s.scheduled_date);
        const isPaid = s.status === 'PAID' || s.status === 'CONFIRMED' || s.is_paid;
        items.push({
          id: `sched_pay_${s.id}`,
          title: `${dObj.deal_name || 'Deal'} Payout`,
          targetDate: s.scheduled_date.slice(0, 10),
          startDate: null,
          category: 'Payment',
          subType: s.payment_type || 'Scheduled Payout',
          status: isPaid ? 'COMPLETED' : (days === 0 ? 'TODAY' : (days < 0 ? 'OVERDUE' : 'UPCOMING')),
          priority: Number(s.expected_total || 0) >= 20000 ? 'High' : 'Medium',
          amount: Number(s.expected_total || s.expected_interest || s.amount || 0),
          currency: 'INR',
          linkedModule: 'deals',
          linkedRecordId: s.deal_id,
          sourceType: 'Deal Payout',
          isPinned: pinnedSet.has(`sched_pay_${s.id}`),
          daysRemaining: days,
          institution: dObj.platform || '',
          raw: s,
        });
      }
    });

    // 3. Recurring Occurrences (SIPs, bills, deposits)
    const recurringById = {};
    (recurringItems || []).forEach((r) => { recurringById[r.id] = r; });

    (recurringOccurrences || []).forEach((o) => {
      const rItem = recurringById[o.recurring_item_id] || {};
      const targetDate = o.due_date || o.scheduled_date;
      if (targetDate) {
        const days = getDaysBetween(todayStr, targetDate);
        const isCompleted = o.status === 'CONFIRMED' || o.status === 'PAID' || o.status === 'COMPLETED';
        items.push({
          id: `recur_occ_${o.id}`,
          title: `${rItem.item_name || 'Recurring'} SIP`,
          targetDate: targetDate.slice(0, 10),
          startDate: rItem.start_date ? rItem.start_date.slice(0, 10) : null,
          category: 'Recurring',
          subType: rItem.item_type || 'Systematic Investment',
          status: isCompleted ? 'COMPLETED' : (days === 0 ? 'TODAY' : (days < 0 ? 'OVERDUE' : 'UPCOMING')),
          priority: rItem.priority || 'Medium',
          amount: Number(o.expected_amount || rItem.current_amount || 0),
          currency: 'INR',
          linkedModule: 'recurring',
          linkedRecordId: o.recurring_item_id,
          sourceType: 'Recurring SIP',
          isPinned: pinnedSet.has(`recur_occ_${o.id}`),
          daysRemaining: days,
          institution: rItem.institution || '',
          raw: o,
        });
      }
    });

    // 4. Accounts & Fixed Deposits (Maturity dates)
    (accounts || []).forEach((a) => {
      if (a.maturity_date) {
        const days = getDaysBetween(todayStr, a.maturity_date);
        const isInactive = !a.is_active;
        items.push({
          id: `acct_fd_${a.id}`,
          title: `${a.account_name || 'Account'} Maturity`,
          targetDate: a.maturity_date.slice(0, 10),
          startDate: a.start_date ? a.start_date.slice(0, 10) : null,
          category: 'Account',
          subType: a.account_type || 'Fixed Deposit',
          status: isInactive ? 'COMPLETED' : (days === 0 ? 'TODAY' : (days < 0 ? 'OVERDUE' : 'UPCOMING')),
          priority: Number(a.current_balance || 0) >= 100000 ? 'High' : 'Medium',
          amount: Number(a.current_balance || a.opening_balance || 0),
          currency: a.currency || 'INR',
          linkedModule: 'networth',
          linkedRecordId: a.id,
          sourceType: 'Fixed Deposit',
          isPinned: pinnedSet.has(`acct_fd_${a.id}`),
          daysRemaining: days,
          institution: a.institution || '',
          raw: a,
        });
      }
    });

    // 5. Goals (Target dates)
    (goals || []).forEach((g) => {
      if (g.target_date) {
        const days = getDaysBetween(todayStr, g.target_date);
        const isDone = g.status === 'ACHIEVED' || g.status === 'COMPLETED';
        items.push({
          id: `goal_${g.id}`,
          title: `${g.title || g.name || 'Financial'} Goal`,
          targetDate: g.target_date.slice(0, 10),
          startDate: g.start_date ? g.start_date.slice(0, 10) : null,
          category: 'Goal',
          subType: g.category || 'Financial Milestone',
          status: isDone ? 'COMPLETED' : (days === 0 ? 'TODAY' : (days < 0 ? 'OVERDUE' : 'UPCOMING')),
          priority: g.priority || 'High',
          amount: Number(g.target_amount || 0),
          currency: 'INR',
          linkedModule: 'goals',
          linkedRecordId: g.id,
          sourceType: 'Goal Target',
          isPinned: pinnedSet.has(`goal_${g.id}`),
          daysRemaining: days,
          institution: '',
          raw: g,
        });
      }
    });

    // 6. User Calendar Events (Birthdays, Anniversaries, Countdowns, Events)
    (calendarEvents || []).forEach((ev) => {
      if (ev.event_date) {
        let target = ev.event_date.slice(0, 10);
        if (ev.recurring_yearly) {
          const currentYear = new Date().getFullYear();
          const targetThisYear = `${currentYear}-${target.slice(5, 10)}`;
          const daysThisYear = getDaysBetween(todayStr, targetThisYear);
          if (daysThisYear < 0) {
            target = `${currentYear + 1}-${target.slice(5, 10)}`;
          } else {
            target = targetThisYear;
          }
        }
        const days = getDaysBetween(todayStr, target);
        items.push({
          id: `cal_ev_${ev.id}`,
          title: ev.title || 'Personal Event',
          targetDate: target,
          startDate: null,
          category: 'Personal',
          subType: ev.event_type || 'Event',
          status: days === 0 ? 'TODAY' : (days < 0 ? 'OVERDUE' : 'UPCOMING'),
          priority: ev.event_type === 'Birthday' || ev.event_type === 'Anniversary' ? 'High' : 'Medium',
          amount: null,
          currency: null,
          linkedModule: 'calendar',
          linkedRecordId: ev.id,
          sourceType: 'Calendar Event',
          isPinned: pinnedSet.has(`cal_ev_${ev.id}`),
          daysRemaining: days,
          institution: '',
          raw: ev,
        });
      }
    });

    // 7. Expense Transactions (Pending/Overdue expenses)
    (expenseTxns || []).forEach((t) => {
      if (t.transaction_date && (t.payment_status === 'Pending' || t.payment_status === 'Overdue')) {
        const days = getDaysBetween(todayStr, t.transaction_date);
        items.push({
          id: `exp_txn_${t.id}`,
          title: `${t.item || 'Expense'} Due`,
          targetDate: t.transaction_date.slice(0, 10),
          startDate: null,
          category: 'Expense',
          subType: t.category_name || 'Project Expense',
          status: t.payment_status === 'Paid' ? 'COMPLETED' : (days === 0 ? 'TODAY' : (days < 0 ? 'OVERDUE' : 'UPCOMING')),
          priority: t.payment_status === 'Overdue' ? 'High' : 'Medium',
          amount: Number(t.amount || 0),
          currency: 'INR',
          linkedModule: 'expenses',
          linkedRecordId: t.id,
          sourceType: 'Expense Transaction',
          isPinned: pinnedSet.has(`exp_txn_${t.id}`),
          daysRemaining: days,
          institution: t.vendor_name || '',
          raw: t,
        });
      }
    });

    // Sort: Pinned first, then by earliest targetDate ascending
    items.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.targetDate.localeCompare(b.targetDate);
    });

    return items;
  }

  // Business days calculation
  function calculateBusinessDays(startDateStr, endDateStr, excludeWeekends = true) {
    const d1 = parseDateOnly(startDateStr);
    const d2 = parseDateOnly(endDateStr);
    if (!d1 || !d2) return 0;

    let cur = new Date(Math.min(d1.getTime(), d2.getTime()));
    const target = new Date(Math.max(d1.getTime(), d2.getTime()));
    let count = 0;

    while (cur < target) {
      cur.setDate(cur.getDate() + 1);
      const dayOfWeek = cur.getDay();
      if (excludeWeekends) {
        if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
      } else {
        count++;
      }
    }
    return count;
  }

  // Add / Subtract Date utility
  function computeShiftedDate(baseDateStr, amount, unit, op, excludeWeekends = false) {
    const base = parseDateOnly(baseDateStr);
    if (!base) return '—';

    let n = parseInt(amount, 10);
    if (isNaN(n) || n === 0) return App.utils.fmtDate(base);
    if (op === '-') n = -n;

    const result = new Date(base.getTime());

    if (unit === 'days') {
      if (excludeWeekends) {
        let added = 0;
        const dir = n > 0 ? 1 : -1;
        const targetCount = Math.abs(n);
        while (added < targetCount) {
          result.setDate(result.getDate() + dir);
          const dow = result.getDay();
          if (dow !== 0 && dow !== 6) added++;
        }
      } else {
        result.setDate(result.getDate() + n);
      }
    } else if (unit === 'weeks') {
      result.setDate(result.getDate() + n * 7);
    } else if (unit === 'months') {
      result.setMonth(result.getMonth() + n);
    } else if (unit === 'years') {
      result.setFullYear(result.getFullYear() + n);
    }

    return App.utils.fmtDate(result);
  }

  // Get Urgency level
  function getUrgency(days, status) {
    if (status === 'COMPLETED') return { label: 'Completed', color: 'var(--text3)', cls: 'st-cancelled' };
    if (status === 'OVERDUE' || days < 0) return { label: 'Overdue', color: 'var(--red)', cls: 'st-overdue' };
    if (days <= 3) return { label: 'Critical', color: 'var(--red)', cls: 'st-overdue' };
    if (days <= 7) return { label: 'High Urgency', color: 'var(--gold)', cls: 'st-due' };
    if (days <= 30) return { label: 'Medium', color: 'var(--teal)', cls: 'st-active' };
    return { label: 'Low', color: 'var(--text2)', cls: 'st-draft' };
  }

  // Render Section 1: Executive KPI Summary Cards
  function renderExecutiveKpis(items) {
    const todayStr = App.utils.todayISO();
    const formattedToday = App.utils.fmtDate(todayStr);

    const upcoming = items.filter((i) => i.daysRemaining > 0 && i.status !== 'COMPLETED');
    const dueToday = items.filter((i) => i.daysRemaining === 0 && i.status !== 'COMPLETED');
    const overdue = items.filter((i) => i.daysRemaining < 0 && i.status !== 'COMPLETED');
    const next7Days = items.filter((i) => i.daysRemaining >= 0 && i.daysRemaining <= 7 && i.status !== 'COMPLETED');
    const next30Days = items.filter((i) => i.daysRemaining >= 0 && i.daysRemaining <= 30 && i.status !== 'COMPLETED');
    const next90Days = items.filter((i) => i.daysRemaining >= 0 && i.daysRemaining <= 90 && i.status !== 'COMPLETED');

    const futureItems = items.filter((i) => i.daysRemaining > 0 && i.status !== 'COMPLETED');
    const longest = futureItems.length ? futureItems.reduce((max, it) => it.daysRemaining > max.daysRemaining ? it : max, futureItems[0]) : null;

    return `
      <div class="grid-4" style="margin-bottom:16px;gap:12px">
        <div class="kpi c-gold">
          <div class="kpi-label">📅 Today</div>
          <div class="kpi-value" style="font-size:18px">${formattedToday}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Base Reference Date</div>
        </div>
        <div class="kpi c-teal">
          <div class="kpi-label">🎯 Upcoming Dates</div>
          <div class="kpi-value">${upcoming.length}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Future active milestones</div>
        </div>
        <div class="kpi ${dueToday.length ? 'c-gold' : ''}" style="${dueToday.length ? 'border-color:var(--gold)' : ''}">
          <div class="kpi-label">⚡ Due Today</div>
          <div class="kpi-value" style="color:${dueToday.length ? 'var(--gold)' : 'var(--text)'}">${dueToday.length}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Immediate actions required</div>
        </div>
        <div class="kpi ${overdue.length ? 'c-red' : ''}" style="${overdue.length ? 'border-color:var(--red)' : ''}">
          <div class="kpi-label">⚠️ Overdue</div>
          <div class="kpi-value" style="color:${overdue.length ? 'var(--red)' : 'var(--text)'}">${overdue.length}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Pending past milestones</div>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom:20px;gap:12px">
        <div class="kpi">
          <div class="kpi-label">Next 7 Days</div>
          <div class="kpi-value" style="font-size:20px;color:var(--teal)">${next7Days.length}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">This week's horizon</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Next 30 Days</div>
          <div class="kpi-value" style="font-size:20px;color:var(--gold)">${next30Days.length}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">1-month horizon</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Next 90 Days</div>
          <div class="kpi-value" style="font-size:20px">${next90Days.length}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Quarterly outlook</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Furthest Horizon</div>
          <div class="kpi-value" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${longest ? longest.title : '—'}">
            ${longest ? `${longest.daysRemaining}d` : '—'}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${longest ? App.utils.escapeHtml(longest.title) : 'No future dates'}
          </div>
        </div>
      </div>
    `;
  }

  // Render Section 2: User Custom Intelligence Cards (Age, Experience, Custom Countdowns)
  function renderCustomCardsSection(customCards) {
    const todayStr = App.utils.todayISO();

    return `
      <div class="panel" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
          <div>
            <div class="chart-title" style="margin:0;display:flex;align-items:center;gap:8px">
              <span>⭐</span>
              <span>My Custom Intelligence Cards (${customCards.length})</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">
              User-created live cards: exact Age &amp; living duration, multi-company Career Experience with overlap detection, and custom event countdowns.
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="btnToggleAllCustomCards" style="font-size:11.5px">
              ${state.allCollapsed ? '⤢ Expand All' : '⤡ Collapse All'}
            </button>
            <button class="btn btn-gold btn-sm" id="btnAddNewCustomCard" style="font-size:11.5px">
              ➕ Add Custom Card
            </button>
          </div>
        </div>

        ${customCards.length === 0 ? `
          <div style="text-align:center;padding:32px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;color:var(--text3)">
            <div style="font-size:32px;margin-bottom:8px">💡</div>
            <div style="font-size:14px;font-weight:600;color:var(--text)">No custom cards yet</div>
            <div style="font-size:12px;margin-top:4px;max-width:420px;margin-left:auto;margin-right:auto">
              Create an <b>Age Card</b> that automatically counts your exact living duration daily, an <b>Experience Card</b> with chronological company tenures &amp; overlap detection, or a custom <b>Event Countdown Card</b>.
            </div>
            <button class="btn btn-gold btn-sm" id="btnEmptyAddCustomCard" style="margin-top:12px">+ Create First Card</button>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(340px, 1fr));gap:16px">
            ${customCards.map((card) => {
              const isCollapsed = state.collapsedCardIds.has(card.id) || state.allCollapsed;

              if (card.cardType === 'age') {
                const ageInfo = calcExactAge(card.startDate, card.endDateMode === 'LIVE' ? todayStr : (card.fixedEndDate || todayStr));
                return `
                  <div class="integration-card" style="padding:14px;position:relative;border:1px solid ${card.isPinned ? 'var(--gold)' : 'var(--border)'};box-shadow:${card.isPinned ? '0 0 10px rgba(201,168,76,0.12)' : 'none'}">
                    <!-- Card Header -->
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                      <div style="display:flex;align-items:center;gap:6px">
                        <span class="badge" style="background:rgba(201,168,76,0.15);color:var(--gold);font-size:10px">🎂 Age Card</span>
                        ${card.endDateMode === 'LIVE' ? '<span class="badge st-active" style="font-size:9.5px">● Live (Auto-updates daily)</span>' : '<span class="badge" style="font-size:9.5px">Fixed End</span>'}
                        ${card.isPinned ? '<span style="font-size:11px;color:var(--gold)">📌</span>' : ''}
                      </div>
                      <div style="display:flex;gap:4px;align-items:center">
                        <button class="icon-btn" data-edit-custom-card="${card.id}" title="Edit card" style="padding:2px 5px;font-size:11px">✏️</button>
                        <button class="icon-btn del" data-del-custom-card="${card.id}" title="Delete card" style="padding:2px 5px;font-size:11px">&times;</button>
                        <button class="icon-btn" data-toggle-collapse-card="${card.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}" style="padding:2px 5px;font-size:11px">
                          ${isCollapsed ? '▼' : '▲'}
                        </button>
                      </div>
                    </div>

                    <!-- Title -->
                    <div style="font-weight:700;font-size:14.5px;color:var(--text);margin-bottom:6px">
                      ${App.utils.escapeHtml(card.title)}
                    </div>

                    ${ageInfo ? `
                      <!-- Prominent Age Banner -->
                      <div style="background:var(--fill-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;border:1px solid var(--border)">
                        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Exact Current Age (Years, Months, Weeks, Days)</div>
                        <div style="font-size:17px;font-weight:700;color:var(--gold);margin-top:2px">
                          ${ageInfo.years} <span style="font-size:12px;color:var(--text2)">yrs</span>,
                          ${ageInfo.months} <span style="font-size:12px;color:var(--text2)">mos</span>,
                          ${Math.floor(ageInfo.days / 7)} <span style="font-size:12px;color:var(--text2)">wks</span>,
                          ${ageInfo.days % 7} <span style="font-size:12px;color:var(--text2)">days</span>
                        </div>
                        <div style="font-size:11px;color:var(--text3);margin-top:3px">
                          Born ${App.utils.fmtDate(card.startDate)} &bull; ${card.endDateMode === 'LIVE' ? 'Calculated as of Today' : `Target: ${App.utils.fmtDate(card.fixedEndDate)}`}
                        </div>
                      </div>

                      ${!isCollapsed ? `
                        <!-- Expanded Metrics & Birthday Alert (Including Total Months) -->
                        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:10px">
                          <div style="background:var(--fill-1);border-radius:6px;padding:8px;border:1px solid var(--border)">
                            <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Total Months</div>
                            <div style="font-size:14px;font-weight:700;color:var(--gold)">${ageInfo.totalMonths.toLocaleString('en-IN')} mos</div>
                          </div>
                          <div style="background:var(--fill-1);border-radius:6px;padding:8px;border:1px solid var(--border)">
                            <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Total Weeks</div>
                            <div style="font-size:14px;font-weight:700;color:var(--text)">${ageInfo.totalWeeks.toLocaleString('en-IN')} wks</div>
                          </div>
                          <div style="background:var(--fill-1);border-radius:6px;padding:8px;border:1px solid var(--border)">
                            <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Total Days</div>
                            <div style="font-size:14px;font-weight:700;color:var(--teal)">${ageInfo.totalDays.toLocaleString('en-IN')} d</div>
                          </div>
                        </div>

                        <!-- Next Birthday Highlight -->
                        <div style="background:rgba(22,201,163,0.08);border:1px solid rgba(22,201,163,0.25);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center">
                          <div>
                            <div style="font-size:10px;color:var(--text3)">Upcoming Birthday</div>
                            <div style="font-weight:600;font-size:12px;color:var(--teal)">${App.utils.fmtDate(ageInfo.nextBirthdayDate)}</div>
                          </div>
                          <div style="text-align:right">
                            <span class="badge st-due" style="font-size:10px">${ageInfo.daysUntilNextBirthday === 0 ? 'Today!' : `${ageInfo.daysUntilNextBirthday} days left`}</span>
                          </div>
                        </div>
                      ` : ''}
                    ` : '<div style="color:var(--red);font-size:12px">Invalid birth date.</div>'}
                  </div>
                `;
              } else if (card.cardType === 'experience') {
                const expInfo = calcExperienceBreakdown(card.organizations || []);
                return `
                  <div class="integration-card" style="padding:14px;position:relative;border:1px solid ${card.isPinned ? 'var(--gold)' : 'var(--border)'};box-shadow:${card.isPinned ? '0 0 10px rgba(201,168,76,0.12)' : 'none'}">
                    <!-- Card Header -->
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <span class="badge" style="background:rgba(79,142,247,0.15);color:#4f8ef7;font-size:10px">💼 Experience Card</span>
                        <span class="badge" style="font-size:9.5px">${(card.organizations || []).length} Roles</span>
                        ${expInfo && expInfo.hasOverlaps ? '<span class="badge st-overdue" style="font-size:9.5px">⚠️ Overlap Detected</span>' : ''}
                        ${card.isPinned ? '<span style="font-size:11px;color:var(--gold)">📌</span>' : ''}
                      </div>
                      <div style="display:flex;gap:4px;align-items:center">
                        <button class="icon-btn" data-edit-custom-card="${card.id}" title="Edit card" style="padding:2px 5px;font-size:11px">✏️</button>
                        <button class="icon-btn del" data-del-custom-card="${card.id}" title="Delete card" style="padding:2px 5px;font-size:11px">&times;</button>
                        <button class="icon-btn" data-toggle-collapse-card="${card.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}" style="padding:2px 5px;font-size:11px">
                          ${isCollapsed ? '▼' : '▲'}
                        </button>
                      </div>
                    </div>

                    <!-- Title -->
                    <div style="font-weight:700;font-size:14.5px;color:var(--text);margin-bottom:6px">
                      ${App.utils.escapeHtml(card.title)}
                    </div>

                    ${expInfo ? `
                      <!-- Total Experience Summary Banner with Total Months -->
                      <div style="background:var(--fill-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;border:1px solid var(--border)">
                        <div style="display:flex;justify-content:space-between;align-items:baseline">
                          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Net Career Duration (Years, Months, Weeks, Days)</div>
                          <div style="font-size:11px;color:var(--teal);font-weight:600">${expInfo.netCalendarDays.toLocaleString('en-IN')} net days</div>
                        </div>
                        <div style="font-size:17px;font-weight:700;color:var(--teal);margin-top:2px">
                          ${expInfo.netTenure.years} <span style="font-size:12px;color:var(--text2)">yrs</span>,
                          ${expInfo.netTenure.months} <span style="font-size:12px;color:var(--text2)">mos</span>,
                          ${Math.floor(expInfo.netTenure.days / 7)} <span style="font-size:12px;color:var(--text2)">wks</span>,
                          ${expInfo.netTenure.days % 7} <span style="font-size:12px;color:var(--text2)">days</span>
                          <span style="font-size:12px;font-weight:600;color:var(--gold);margin-left:6px">(${expInfo.netTenure.totalMonths} Total Months)</span>
                        </div>
                        ${expInfo.hasOverlaps ? `
                          <div style="font-size:11px;color:var(--text3);margin-top:3px">
                            Total cumulative stints: <b>${expInfo.sumTenure.years} yrs, ${expInfo.sumTenure.months} mos (${expInfo.sumTenure.totalMonths} mos), ${Math.floor(expInfo.sumTenure.days / 7)} wks, ${expInfo.sumTenure.days % 7} days</b> (${expInfo.totalSummedDays.toLocaleString('en-IN')} d)
                          </div>
                        ` : ''}
                      </div>

                      ${!isCollapsed ? `
                        <!-- Overlap Warning Banner if applicable -->
                        ${expInfo.hasOverlaps ? `
                          <div style="background:rgba(217,83,79,0.08);border:1px solid rgba(217,83,79,0.25);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:var(--text)">
                            <div style="font-weight:700;color:var(--red);margin-bottom:3px">⚠️ Concurrent Employment Detected</div>
                            ${expInfo.overlaps.map((ov) => `
                              <div>&bull; Overlap between <b>${App.utils.escapeHtml(ov.orgA)}</b> and <b>${App.utils.escapeHtml(ov.orgB)}</b> (${ov.overlapDays} days / ~${ov.approxMonths} mos).</div>
                            `).join('')}
                          </div>
                        ` : ''}

                        <!-- Chronological Stints Breakdown List (With Total Months) -->
                        <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Chronological Organizations</div>
                        <div style="display:flex;flex-direction:column;gap:6px">
                          ${expInfo.stints.map((s, idx) => `
                            <div style="background:var(--fill-1);border:1px solid var(--border);border-radius:6px;padding:8px 10px">
                              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                                <div>
                                  <b style="font-size:12.5px;color:var(--text)">${App.utils.escapeHtml(s.company || 'Organization')}</b>
                                  ${s.role ? `<div style="font-size:11px;color:var(--text2)">${App.utils.escapeHtml(s.role)}</div>` : ''}
                                </div>
                                <div style="text-align:right">
                                  <span class="badge" style="background:rgba(255,255,255,0.06);font-size:10px;font-weight:700;color:var(--gold)">
                                    ${s.years ? `${s.years}y ` : ''}${s.months}m [${s.totalMonths} mos] ${Math.floor(s.days / 7)}w ${s.days % 7}d
                                  </span>
                                  ${s.isCurrent ? '<div style="font-size:9.5px;color:var(--teal);margin-top:2px">● Present</div>' : ''}
                                </div>
                              </div>
                              <div style="font-size:10.5px;color:var(--text3);margin-top:4px">
                                ${App.utils.fmtDate(s.startDate)} &rarr; ${s.isCurrent ? 'Present (Today)' : App.utils.fmtDate(s.endDate)}
                                &bull; ${s.durationDays} days (${s.totalMonths} months)
                              </div>
                            </div>
                          `).join('')}
                        </div>
                      ` : ''}
                    ` : '<div style="color:var(--text3);font-size:12px">No organizations added.</div>'}
                  </div>
                `;
              } else {
                // Card Type 3: Custom Event Countdown Card
                const days = getDaysBetween(todayStr, card.targetDate);
                const remainingText = formatTimeRemaining(days);
                const urgency = getUrgency(days, days < 0 ? 'OVERDUE' : 'UPCOMING');

                return `
                  <div class="integration-card" style="padding:14px;position:relative;border:1px solid ${card.isPinned ? 'var(--gold)' : 'var(--border)'};box-shadow:${card.isPinned ? '0 0 10px rgba(201,168,76,0.12)' : 'none'}">
                    <!-- Header -->
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                      <div style="display:flex;align-items:center;gap:6px">
                        <span class="badge" style="background:rgba(155,89,182,0.15);color:var(--purple);font-size:10px">⏳ Countdown Card</span>
                        <span class="badge ${urgency.cls}" style="font-size:9.5px">${urgency.label}</span>
                        ${card.repeatsYearly ? '<span class="badge" style="font-size:9.5px">Repeats Yearly</span>' : ''}
                        ${card.isPinned ? '<span style="font-size:11px;color:var(--gold)">📌</span>' : ''}
                      </div>
                      <div style="display:flex;gap:4px;align-items:center">
                        <button class="icon-btn" data-edit-custom-card="${card.id}" title="Edit card" style="padding:2px 5px;font-size:11px">✏️</button>
                        <button class="icon-btn del" data-del-custom-card="${card.id}" title="Delete card" style="padding:2px 5px;font-size:11px">&times;</button>
                        <button class="icon-btn" data-toggle-collapse-card="${card.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}" style="padding:2px 5px;font-size:11px">
                          ${isCollapsed ? '▼' : '▲'}
                        </button>
                      </div>
                    </div>

                    <!-- Title -->
                    <div style="font-weight:700;font-size:14.5px;color:var(--text);margin-bottom:6px">
                      ${App.utils.escapeHtml(card.title)}
                    </div>

                    <!-- Countdown Highlight -->
                    <div style="background:var(--fill-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;border:1px solid var(--border)">
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Target Date</div>
                          <div style="font-size:13px;font-weight:600;color:var(--text)">${App.utils.fmtDate(card.targetDate)}</div>
                        </div>
                        <div style="text-align:right">
                          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Time Left</div>
                          <div style="font-size:14px;font-weight:700;color:${urgency.color}">
                            ${remainingText}
                          </div>
                        </div>
                      </div>
                      <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);display:flex;justify-content:space-between;align-items:center;font-size:11px">
                        <span style="color:var(--text3)">Units (Y/M/W/D):</span>
                        <div>${formatDetailedUnits(days).chipHtml}</div>
                      </div>
                      <div style="font-size:10.5px;color:var(--text2);margin-top:3px;text-align:right">
                        ${formatDetailedUnits(days).fullText}
                      </div>
                    </div>

                    ${!isCollapsed && card.notes ? `
                      <div style="font-size:11.5px;color:var(--text3);background:var(--fill-1);padding:6px 10px;border-radius:4px;border:1px solid var(--border)">
                        ${App.utils.escapeHtml(card.notes)}
                      </div>
                    ` : ''}
                  </div>
                `;
              }
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  // Dialog to Create or Edit a Custom Card (Age, Experience, Countdown)
  function openCustomCardModal(existingCard, onDone) {
    let cardType = (existingCard && existingCard.cardType) || 'age';

    let orgsState = (existingCard && existingCard.organizations) ? JSON.parse(JSON.stringify(existingCard.organizations)) : [
      { id: 'stint_' + Date.now(), company: '', role: '', startDate: '', endDate: '', isCurrent: false, notes: '' },
    ];

    function renderModalBody() {
      return `
        <div style="margin-bottom:14px">
          <!-- Card Type Switcher -->
          <div style="margin-bottom:14px">
            <label style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px">Select Card Type</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              <button type="button" class="btn btn-sm ${cardType === 'age' ? 'btn-gold' : 'btn-outline'}" data-card-type-sel="age" style="padding:8px 6px;font-size:11.5px">
                🎂 Age / Duration Card
              </button>
              <button type="button" class="btn btn-sm ${cardType === 'experience' ? 'btn-gold' : 'btn-outline'}" data-card-type-sel="experience" style="padding:8px 6px;font-size:11.5px">
                💼 Experience Tracker
              </button>
              <button type="button" class="btn btn-sm ${cardType === 'countdown' ? 'btn-gold' : 'btn-outline'}" data-card-type-sel="countdown" style="padding:8px 6px;font-size:11.5px">
                ⏳ Custom Countdown
              </button>
            </div>
          </div>

          <!-- Type 1: Age Card Fields -->
          <div id="fieldsTypeAge" style="${cardType === 'age' ? 'display:block' : 'display:none'}">
            <div style="display:flex;flex-direction:column;gap:10px">
              <div>
                <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Card Title <span class="req">*</span></label>
                <input type="text" id="inpAgeTitle" class="form-input" value="${App.utils.escapeHtml((existingCard && existingCard.title) || 'My Age')}" placeholder="e.g. My Age, Child's Age, Company Age" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                  <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Birth Date / Inception Date <span class="req">*</span></label>
                  <input type="date" id="inpAgeStartDate" class="form-input" value="${(existingCard && existingCard.startDate) || '1995-05-14'}" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                </div>
                <div>
                  <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">End Date Calculation</label>
                  <select id="selAgeEndMode" class="form-input" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                    <option value="LIVE" ${(existingCard && existingCard.endDateMode === 'LIVE') || !existingCard ? 'selected' : ''}>● Live / Today (Auto-increments every morning)</option>
                    <option value="FIXED" ${(existingCard && existingCard.endDateMode === 'FIXED') ? 'selected' : ''}>Fixed Target Date</option>
                  </select>
                </div>
              </div>
              <div id="wrapFixedEndDate" style="${(existingCard && existingCard.endDateMode === 'FIXED') ? 'display:block' : 'display:none'}">
                <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Specific Fixed End Date</label>
                <input type="date" id="inpAgeFixedEndDate" class="form-input" value="${(existingCard && existingCard.fixedEndDate) || App.utils.todayISO()}" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
              </div>
              <div>
                <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Notes (optional)</label>
                <input type="text" id="inpAgeNotes" class="form-input" value="${App.utils.escapeHtml((existingCard && existingCard.notes) || '')}" placeholder="Optional milestone reminder" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
              </div>
            </div>
          </div>

          <!-- Type 2: Career Experience Fields -->
          <div id="fieldsTypeExp" style="${cardType === 'experience' ? 'display:block' : 'display:none'}">
            <div style="display:flex;flex-direction:column;gap:10px">
              <div>
                <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Card Title <span class="req">*</span></label>
                <input type="text" id="inpExpTitle" class="form-input" value="${App.utils.escapeHtml((existingCard && existingCard.title) || 'Total Career Experience')}" placeholder="e.g. Total Career Experience, IT Industry Experience" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
              </div>

              <!-- Organizations Stint List -->
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <label style="font-size:11.5px;color:var(--text2);margin:0">Organizations &amp; Employment Stints</label>
                  <button type="button" class="btn btn-outline btn-xs" id="btnAddStintBtn" style="font-size:11px;padding:2px 8px">+ Add Organization</button>
                </div>
                <div id="orgsStintsListHost" style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto;padding-right:4px">
                  <!-- Stint Rows will be dynamically rendered here -->
                </div>
              </div>
            </div>
          </div>

          <!-- Type 3: Custom Countdown Fields -->
          <div id="fieldsTypeCountdown" style="${cardType === 'countdown' ? 'display:block' : 'display:none'}">
            <div style="display:flex;flex-direction:column;gap:10px">
              <div>
                <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Event / Milestone Title <span class="req">*</span></label>
                <input type="text" id="inpCdTitle" class="form-input" value="${App.utils.escapeHtml((existingCard && existingCard.title) || '')}" placeholder="e.g. 30th Birthday, HCL Joining, New Year 2027" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                  <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Target Date <span class="req">*</span></label>
                  <input type="date" id="inpCdTargetDate" class="form-input" value="${(existingCard && existingCard.targetDate) || App.utils.todayISO()}" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                </div>
                <div>
                  <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Category</label>
                  <select id="selCdCategory" class="form-input" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                    <option value="Personal" ${(existingCard && existingCard.category === 'Personal') ? 'selected' : ''}>Personal</option>
                    <option value="Career" ${(existingCard && existingCard.category === 'Career') ? 'selected' : ''}>Career / Employment</option>
                    <option value="Birthday" ${(existingCard && existingCard.category === 'Birthday') ? 'selected' : ''}>Birthday</option>
                    <option value="Anniversary" ${(existingCard && existingCard.category === 'Anniversary') ? 'selected' : ''}>Anniversary</option>
                    <option value="Financial" ${(existingCard && existingCard.category === 'Financial') ? 'selected' : ''}>Financial Milestone</option>
                    <option value="Travel" ${(existingCard && existingCard.category === 'Travel') ? 'selected' : ''}>Travel / Vacation</option>
                  </select>
                </div>
              </div>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);cursor:pointer;margin-top:2px">
                <input type="checkbox" id="chkCdRepeatsYearly" ${(existingCard && existingCard.repeatsYearly) ? 'checked' : ''}>
                <span>Repeats Yearly (advances countdown to next year once current date passes)</span>
              </label>
              <div>
                <label style="font-size:11.5px;color:var(--text2);display:block;margin-bottom:4px">Notes (optional)</label>
                <input type="text" id="inpCdNotes" class="form-input" value="${App.utils.escapeHtml((existingCard && existingCard.notes) || '')}" placeholder="Optional details" style="width:100%;font-size:12px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
              </div>
            </div>
          </div>
        </div>
      `;
    }

    App.ui.open({
      title: existingCard ? '✏️ Edit Custom Intelligence Card' : '➕ Create Custom Intelligence Card',
      small: false,
      bodyHtml: `<div id="customCardModalHost">${renderModalBody()}</div>`,
      onMount: (modalBody) => {
        function renderStintRows() {
          const host = modalBody.querySelector('#orgsStintsListHost');
          if (!host) return;

          host.innerHTML = orgsState.map((stint, idx) => `
            <div style="background:var(--fill-1);border:1px solid var(--border);border-radius:6px;padding:8px 10px;position:relative" data-stint-idx="${idx}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-weight:700;font-size:11.5px;color:var(--gold)">Stint #${idx + 1}</span>
                ${orgsState.length > 1 ? `<button type="button" class="icon-btn del" data-remove-stint="${idx}" style="font-size:12px;padding:1px 4px">&times; Remove</button>` : ''}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">
                <input type="text" class="form-input inp-stint-company" value="${App.utils.escapeHtml(stint.company || '')}" placeholder="Company / Organization Name" style="font-size:11.5px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                <input type="text" class="form-input inp-stint-role" value="${App.utils.escapeHtml(stint.role || '')}" placeholder="Role / Designation" style="font-size:11.5px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center">
                <div>
                  <div style="font-size:10px;color:var(--text3)">Start Date</div>
                  <input type="date" class="form-input inp-stint-start" value="${stint.startDate || ''}" style="font-size:11px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text3)">End Date</div>
                  <input type="date" class="form-input inp-stint-end" value="${stint.endDate || ''}" ${stint.isCurrent ? 'disabled' : ''} style="font-size:11px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                </div>
                <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2);cursor:pointer;white-space:nowrap;margin-top:14px">
                  <input type="checkbox" class="chk-stint-current" ${stint.isCurrent ? 'checked' : ''}>
                  <span>Current</span>
                </label>
              </div>
            </div>
          `).join('');

          // Wire stint inputs
          host.querySelectorAll('[data-stint-idx]').forEach((rowEl) => {
            const idx = Number(rowEl.dataset.stintIdx);
            const stint = orgsState[idx];
            if (!stint) return;

            rowEl.querySelector('.inp-stint-company')?.addEventListener('input', (e) => { stint.company = e.target.value; });
            rowEl.querySelector('.inp-stint-role')?.addEventListener('input', (e) => { stint.role = e.target.value; });
            const startInp = rowEl.querySelector('.inp-stint-start');
            const endInp = rowEl.querySelector('.inp-stint-end');
            const syncStart = (e) => { stint.startDate = e.target.value; };
            const syncEnd = (e) => { stint.endDate = e.target.value; };
            startInp?.addEventListener('input', syncStart);
            startInp?.addEventListener('change', syncStart);
            endInp?.addEventListener('input', syncEnd);
            endInp?.addEventListener('change', syncEnd);

            // Mobile-friendly tap handler to trigger native calendar picker
            [startInp, endInp].forEach((inp) => {
              if (!inp) return;
              inp.addEventListener('click', () => {
                if (typeof inp.showPicker === 'function') {
                  try { inp.showPicker(); } catch (_) {}
                }
              });
            });

            rowEl.querySelector('.chk-stint-current')?.addEventListener('change', (e) => {
              stint.isCurrent = e.target.checked;
              if (endInp) {
                endInp.disabled = stint.isCurrent;
                if (stint.isCurrent) {
                  endInp.value = '';
                  stint.endDate = '';
                }
              }
            });
            rowEl.querySelector('[data-remove-stint]')?.addEventListener('click', () => {
              orgsState.splice(idx, 1);
              renderStintRows();
            });
          });
        }

        // Mobile date picker click enhancements for Age and Countdown dates
        ['#inpAgeStartDate', '#inpAgeFixedEndDate', '#inpCdTargetDate'].forEach((sel) => {
          const inp = modalBody.querySelector(sel);
          if (inp) {
            inp.addEventListener('click', () => {
              if (typeof inp.showPicker === 'function') {
                try { inp.showPicker(); } catch (_) {}
              }
            });
          }
        });

        // Wire Type Buttons
        modalBody.querySelectorAll('[data-card-type-sel]').forEach((btn) => {
          btn.addEventListener('click', () => {
            cardType = btn.dataset.cardTypeSel;
            modalBody.querySelectorAll('[data-card-type-sel]').forEach((b) => b.className = 'btn btn-sm ' + (b === btn ? 'btn-gold' : 'btn-outline'));
            modalBody.querySelector('#fieldsTypeAge').style.display = cardType === 'age' ? 'block' : 'none';
            modalBody.querySelector('#fieldsTypeExp').style.display = cardType === 'experience' ? 'block' : 'none';
            modalBody.querySelector('#fieldsTypeCountdown').style.display = cardType === 'countdown' ? 'block' : 'none';
          });
        });

        // Wire Age End Mode Toggle
        const selEndMode = modalBody.querySelector('#selAgeEndMode');
        const wrapFixed = modalBody.querySelector('#wrapFixedEndDate');
        if (selEndMode && wrapFixed) {
          selEndMode.addEventListener('change', () => {
            wrapFixed.style.display = selEndMode.value === 'FIXED' ? 'block' : 'none';
          });
        }

        // Wire Add Stint Button
        modalBody.querySelector('#btnAddStintBtn')?.addEventListener('click', () => {
          orgsState.push({ id: 'stint_' + Date.now(), company: '', role: '', startDate: '', endDate: '', isCurrent: false, notes: '' });
          renderStintRows();
        });

        renderStintRows();
      },
      actions: [
        { label: 'Cancel', className: 'btn-outline', onClick: App.ui.close },
        {
          label: existingCard ? 'Save Changes' : 'Create Card',
          className: 'btn-gold',
          onClick: async () => {
            let payload = {
              id: existingCard ? existingCard.id : undefined,
              cardType,
              isPinned: existingCard ? existingCard.isPinned : true,
            };

            if (cardType === 'age') {
              const title = App.utils.qs('#inpAgeTitle').value.trim();
              const startDate = App.utils.qs('#inpAgeStartDate').value;
              const endDateMode = App.utils.qs('#selAgeEndMode').value;
              const fixedEndDate = App.utils.qs('#inpAgeFixedEndDate')?.value;
              const notes = App.utils.qs('#inpAgeNotes')?.value.trim();

              if (!title) { App.utils.toast('Card title is required', 'err'); return; }
              if (!startDate) { App.utils.toast('Birth / Start date is required', 'err'); return; }

              payload.title = title;
              payload.startDate = startDate;
              payload.endDateMode = endDateMode;
              payload.fixedEndDate = endDateMode === 'FIXED' ? fixedEndDate : null;
              payload.notes = notes;
            } else if (cardType === 'experience') {
              const title = App.utils.qs('#inpExpTitle').value.trim();
              if (!title) { App.utils.toast('Card title is required', 'err'); return; }

              const validOrgs = orgsState.filter((o) => o.company && o.company.trim().length > 0 && o.startDate);
              if (!validOrgs.length) {
                App.utils.toast('Add at least one organization with company name and start date', 'err');
                return;
              }

              payload.title = title;
              payload.organizations = validOrgs;
            } else {
              const title = App.utils.qs('#inpCdTitle').value.trim();
              const targetDate = App.utils.qs('#inpCdTargetDate').value;
              const category = App.utils.qs('#selCdCategory').value;
              const repeatsYearly = App.utils.qs('#chkCdRepeatsYearly').checked;
              const notes = App.utils.qs('#inpCdNotes')?.value.trim();

              if (!title) { App.utils.toast('Title is required', 'err'); return; }
              if (!targetDate) { App.utils.toast('Target date is required', 'err'); return; }

              payload.title = title;
              payload.targetDate = targetDate;
              payload.category = category;
              payload.repeatsYearly = repeatsYearly;
              payload.notes = notes;
            }

            try {
              await addOrUpdateCustomCard(payload);
              App.utils.toast(existingCard ? 'Custom card updated!' : 'Custom card created!', 'ok');
              App.ui.close();
              if (typeof onDone === 'function') onDone();
            } catch (err) {
              App.utils.toast('Could not save card: ' + (err.message || err), 'err');
            }
          },
        },
      ],
    });
  }

  // Render Section 3: Visual "My Countdowns"
  function renderCountdowns(items) {
    const todayStr = App.utils.todayISO();

    let filtered = items.filter((it) => {
      if (state.categoryFilter !== 'All' && it.category !== state.categoryFilter) return false;
      if (state.statusFilter === 'Upcoming' && (it.daysRemaining <= 0 || it.status === 'COMPLETED')) return false;
      if (state.statusFilter === 'Today' && it.daysRemaining !== 0) return false;
      if (state.statusFilter === 'Overdue' && (it.daysRemaining >= 0 || it.status === 'COMPLETED')) return false;
      if (state.statusFilter === 'Completed' && it.status !== 'COMPLETED') return false;
      if (state.priorityFilter !== 'All' && it.priority !== state.priorityFilter) return false;

      if (state.periodFilter === '7d' && (it.daysRemaining < 0 || it.daysRemaining > 7)) return false;
      if (state.periodFilter === '30d' && (it.daysRemaining < 0 || it.daysRemaining > 30)) return false;
      if (state.periodFilter === '90d' && (it.daysRemaining < 0 || it.daysRemaining > 90)) return false;
      if (state.periodFilter === '6mo' && (it.daysRemaining < 0 || it.daysRemaining > 180)) return false;
      if (state.periodFilter === '1yr' && (it.daysRemaining < 0 || it.daysRemaining > 365)) return false;

      return true;
    });

    const categoryCounts = {};
    items.forEach((it) => { categoryCounts[it.category] = (categoryCounts[it.category] || 0) + 1; });

    return `
      <div class="panel" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
          <div>
            <div class="chart-title" style="margin:0;display:flex;align-items:center;gap:8px">
              <span>⏳</span>
              <span>All Portfolio Countdowns (${filtered.length})</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">
              Milestones from Deals, Payments, SIPs, FDs, and Calendar Events.
            </div>
          </div>

          <!-- Quick Period Filters -->
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm ${state.periodFilter === 'All' ? 'btn-gold' : 'btn-outline'}" data-period-filter="All" style="padding:3px 8px;font-size:11px">All Time</button>
            <button class="btn btn-sm ${state.periodFilter === '7d' ? 'btn-gold' : 'btn-outline'}" data-period-filter="7d" style="padding:3px 8px;font-size:11px">Next 7 Days</button>
            <button class="btn btn-sm ${state.periodFilter === '30d' ? 'btn-gold' : 'btn-outline'}" data-period-filter="30d" style="padding:3px 8px;font-size:11px">Next 30 Days</button>
            <button class="btn btn-sm ${state.periodFilter === '90d' ? 'btn-gold' : 'btn-outline'}" data-period-filter="90d" style="padding:3px 8px;font-size:11px">Next 90 Days</button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px;background:var(--fill-1);border:1px solid var(--border);border-radius:8px;padding:8px 12px">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Category:</div>
          <div class="chip-row" style="margin:0;gap:4px">
            <div class="chip ${state.categoryFilter === 'All' ? 'active' : ''}" data-intel-cat="All">All (${items.length})</div>
            <div class="chip ${state.categoryFilter === 'Deal' ? 'active' : ''}" data-intel-cat="Deal">Deals (${categoryCounts['Deal'] || 0})</div>
            <div class="chip ${state.categoryFilter === 'Payment' ? 'active' : ''}" data-intel-cat="Payment">Payments (${categoryCounts['Payment'] || 0})</div>
            <div class="chip ${state.categoryFilter === 'Recurring' ? 'active' : ''}" data-intel-cat="Recurring">SIPs (${categoryCounts['Recurring'] || 0})</div>
            <div class="chip ${state.categoryFilter === 'Account' ? 'active' : ''}" data-intel-cat="Account">FDs &amp; Accounts (${categoryCounts['Account'] || 0})</div>
            <div class="chip ${state.categoryFilter === 'Goal' ? 'active' : ''}" data-intel-cat="Goal">Goals (${categoryCounts['Goal'] || 0})</div>
            <div class="chip ${state.categoryFilter === 'Personal' ? 'active' : ''}" data-intel-cat="Personal">Personal Events (${categoryCounts['Personal'] || 0})</div>
            <div class="chip ${state.categoryFilter === 'Expense' ? 'active' : ''}" data-intel-cat="Expense">Expenses (${categoryCounts['Expense'] || 0})</div>
          </div>

          <div style="display:flex;gap:12px;margin-left:auto;align-items:center;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--text3)">Status:</span>
              <select id="selIntelStatus" class="form-input" style="font-size:11.5px;padding:3px 8px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                <option value="All" ${state.statusFilter === 'All' ? 'selected' : ''}>All Statuses</option>
                <option value="Upcoming" ${state.statusFilter === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
                <option value="Today" ${state.statusFilter === 'Today' ? 'selected' : ''}>Due Today</option>
                <option value="Overdue" ${state.statusFilter === 'Overdue' ? 'selected' : ''}>Overdue</option>
                <option value="Completed" ${state.statusFilter === 'Completed' ? 'selected' : ''}>Completed</option>
              </select>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--text3)">Priority:</span>
              <select id="selIntelPriority" class="form-input" style="font-size:11.5px;padding:3px 8px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                <option value="All" ${state.priorityFilter === 'All' ? 'selected' : ''}>All Priorities</option>
                <option value="High" ${state.priorityFilter === 'High' ? 'selected' : ''}>High</option>
                <option value="Medium" ${state.priorityFilter === 'Medium' ? 'selected' : ''}>Medium</option>
                <option value="Low" ${state.priorityFilter === 'Low' ? 'selected' : ''}>Low</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Cards Grid -->
        ${filtered.length === 0 ? `
          <div style="text-align:center;padding:40px 16px;color:var(--text3);background:var(--bg2);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:32px;margin-bottom:8px">🔍</div>
            <div style="font-weight:600;font-size:14px;color:var(--text)">No dates match current filters</div>
            <div style="font-size:12px;margin-top:4px">Try clearing or broadening the category and status filters above.</div>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(290px, 1fr));gap:14px">
            ${filtered.map((it) => {
              const urgency = getUrgency(it.daysRemaining, it.status);
              const remainingText = formatTimeRemaining(it.daysRemaining);
              const isCollapsed = state.collapsedCardIds.has(it.id) || state.allCollapsed;

              let progressPct = null;
              let elapsedDays = null;
              let totalSpan = null;
              if (it.startDate && it.targetDate) {
                totalSpan = getDaysBetween(it.startDate, it.targetDate);
                elapsedDays = getDaysBetween(it.startDate, todayStr);
                if (totalSpan > 0) {
                  progressPct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalSpan) * 100)));
                }
              }

              return `
                <div class="integration-card" style="padding:14px;position:relative;border:1px solid ${it.isPinned ? 'var(--gold)' : 'var(--border)'};box-shadow:${it.isPinned ? '0 0 12px rgba(201,168,76,0.15)' : 'none'}">
                  <!-- Header: Category & Pin & Collapse -->
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                      <span class="badge" style="background:rgba(255,255,255,0.06);font-size:10px">${App.utils.escapeHtml(it.category)}</span>
                      <span class="badge ${urgency.cls}" style="font-size:10px">${urgency.label}</span>
                      ${it.isPinned ? '<span style="font-size:11px;color:var(--gold)">📌 Pinned</span>' : ''}
                    </div>
                    <div style="display:flex;gap:4px;align-items:center">
                      <button class="icon-btn" data-toggle-pin="${it.id}" title="${it.isPinned ? 'Unpin countdown' : 'Pin to top'}" style="font-size:13px;padding:2px 5px">
                        ${it.isPinned ? '📌' : '📍'}
                      </button>
                      <button class="icon-btn" data-toggle-collapse-item="${it.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}" style="font-size:11px;padding:2px 5px">
                        ${isCollapsed ? '▼' : '▲'}
                      </button>
                    </div>
                  </div>

                  <!-- Title & Amount -->
                  <div style="font-weight:700;font-size:14px;color:var(--text);line-height:1.3;margin-bottom:4px">
                    ${App.utils.escapeHtml(it.title)}
                  </div>
                  ${it.amount ? `<div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:6px">${App.utils.fmtMoney(it.amount)}</div>` : ''}

                  <!-- Countdown Highlight -->
                  <div style="background:var(--fill-2);border-radius:6px;padding:8px 10px;margin-bottom:10px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <div>
                        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Target Date</div>
                        <div style="font-size:12.5px;font-weight:600;color:var(--text)">${App.utils.fmtDate(it.targetDate)}</div>
                      </div>
                      <div style="text-align:right">
                        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Timeline</div>
                        <div style="font-size:12.5px;font-weight:700;color:${urgency.color}">
                          ${remainingText}
                        </div>
                      </div>
                    </div>
                    <div style="margin-top:5px;padding-top:5px;border-top:1px dashed var(--border);display:flex;justify-content:space-between;align-items:center;font-size:10.5px">
                      <span style="color:var(--text3)">Units (Y/M/W/D):</span>
                      <div>${formatDetailedUnits(it.daysRemaining).chipHtml}</div>
                    </div>
                    <div style="font-size:10px;color:var(--text2);margin-top:2px;text-align:right">
                      ${formatDetailedUnits(it.daysRemaining).fullText}
                    </div>
                  </div>

                  ${!isCollapsed ? `
                    <!-- Progress Bar (for range-based investments/events) -->
                    ${progressPct !== null ? `
                      <div style="margin-bottom:10px">
                        <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text3);margin-bottom:3px">
                          <span>Progress: Day ${elapsedDays} of ${totalSpan}</span>
                          <span><b>${progressPct}%</b></span>
                        </div>
                        <div style="height:5px;background:var(--fill-3);border-radius:3px;overflow:hidden">
                          <div style="height:100%;width:${progressPct}%;background:${progressPct === 100 ? 'var(--teal)' : 'var(--gold)'};border-radius:3px;transition:width 0.3s"></div>
                        </div>
                      </div>
                    ` : ''}

                    <!-- Footer / Module attribution -->
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)">
                      <span>${it.institution ? App.utils.escapeHtml(it.institution) : App.utils.escapeHtml(it.subType || '')}</span>
                      <a href="#${it.linkedModule}" style="color:var(--teal);text-decoration:none;font-weight:600">View in ${App.utils.escapeHtml(it.linkedModule)} &rarr;</a>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  // Render Section 4: Date Difference Matrix & Multi-Date Comparison Tool
  function renderDifferenceTools(items) {
    const todayStr = App.utils.todayISO();

    const dateOptions = items.slice(0, 40).map((it) => ({
      id: it.id,
      label: `${it.title} (${it.targetDate})`,
      date: it.targetDate,
    }));

    const dtA = state.cmpDateA || (dateOptions[0] ? dateOptions[0].date : todayStr);
    const dtB = state.cmpDateB === 'TODAY' ? todayStr : (state.cmpDateB || todayStr);

    const diffDays = getDaysBetween(dtA, dtB);
    const detail = formatDetailedDiff(diffDays);
    const relation = diffDays === 0 ? 'is on the exact same day as' : (diffDays > 0 ? `is ${diffDays} days AFTER` : `is ${Math.abs(diffDays)} days BEFORE`);

    let matrixItems = state.matrixDateIds.map((id) => items.find((i) => i.id === id)).filter(Boolean);
    if (matrixItems.length < 2) {
      matrixItems = items.slice(0, 3);
    }

    return `
      <div class="panel" style="margin-bottom:20px">
        <div class="chart-title" style="margin-bottom:4px;display:flex;align-items:center;gap:8px">
          <span>📐</span>
          <span>Date Difference Matrix &amp; Comparative Intelligence</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:14px">
          Compare any two milestone dates or build a multi-date distance matrix to map intervals between portfolio commitments.
        </div>

        <!-- Tool 1: 2-Date Comparison Bar -->
        <div style="background:var(--fill-1);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:18px">
          <div style="font-weight:700;font-size:13px;color:var(--gold);margin-bottom:10px">Simple Date Comparison</div>
          <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:flex-end">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Date A (Start / Baseline):</label>
              <input type="date" id="inpCmpDateA" class="form-input" value="${dtA}" style="font-size:12px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
            </div>
            <div style="padding-bottom:8px;font-size:14px;color:var(--text3)">&harr;</div>
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <label style="font-size:11px;color:var(--text3);margin:0">Date B (Target / Comparison):</label>
                <button type="button" class="btn btn-xs ${state.cmpDateB === 'TODAY' ? 'btn-gold' : 'btn-outline'}" id="btnSetCmpToday" style="padding:1px 6px;font-size:10px">Set End = Today</button>
              </div>
              <input type="date" id="inpCmpDateB" class="form-input" value="${dtB}" style="font-size:12px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
            </div>
          </div>

          <!-- Dynamic Result Display -->
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:11px;color:var(--text3)">Comparative Result:</div>
              <div style="font-size:14px;font-weight:700;color:var(--text);margin-top:2px">
                ${App.utils.fmtDate(dtB)} <b>${relation}</b> ${App.utils.fmtDate(dtA)}
              </div>
            </div>
            <div style="display:flex;gap:16px;text-align:right">
              <div>
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Total Distance</div>
                <div style="font-size:18px;font-weight:700;color:var(--teal)">${detail.totalDays.toLocaleString('en-IN')} days</div>
              </div>
              <div>
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Detailed Breakdown</div>
                <div style="font-size:13px;font-weight:600;color:var(--gold)">${detail.readable}</div>
                <div style="font-size:10.5px;color:var(--text3)">${detail.weeksFormat}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tool 2: Multi-Date Matrix -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
            <div style="font-weight:700;font-size:13px;color:var(--text)">
              Multi-Date Difference Matrix (${matrixItems.length} Milestones)
            </div>
            <div style="font-size:11.5px;color:var(--text3)">
              Calculates absolute intervals between every pair of milestones simultaneously
            </div>
          </div>

          <!-- Matrix Table -->
          <div class="table-scroll" style="border:1px solid var(--border);border-radius:8px">
            <table class="data" style="margin:0;font-size:12px;width:100%">
              <thead>
                <tr>
                  <th style="background:var(--fill-2)">Milestone</th>
                  ${matrixItems.map((col) => `
                    <th style="text-align:center;background:var(--fill-2)">
                      <b>${App.utils.escapeHtml(col.title)}</b>
                      <div style="font-size:10px;font-weight:normal;color:var(--text3)">${App.utils.fmtDate(col.targetDate)}</div>
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${matrixItems.map((row) => `
                  <tr>
                    <td style="font-weight:700;white-space:nowrap;background:var(--fill-1)">
                      ${App.utils.escapeHtml(row.title)}
                      <div style="font-size:10px;font-weight:normal;color:var(--text3)">${App.utils.fmtDate(row.targetDate)}</div>
                    </td>
                    ${matrixItems.map((col) => {
                      if (row.id === col.id) {
                        return `<td style="text-align:center;color:var(--text3);background:rgba(255,255,255,0.02)">—</td>`;
                      }
                      const dist = Math.abs(getDaysBetween(row.targetDate, col.targetDate));
                      return `
                        <td style="text-align:center;font-weight:600;color:${dist <= 7 ? 'var(--red)' : (dist <= 30 ? 'var(--gold)' : 'var(--teal)')}">
                          ${dist.toLocaleString('en-IN')} d
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // Render Section 5: Date Calculator & Business Days Utility
  function renderDateCalculator() {
    const todayStr = App.utils.todayISO();
    const baseDate = state.calcStartDate || todayStr;
    const computed = computeShiftedDate(baseDate, state.calcAmount, state.calcUnit, state.calcOp, state.calcExcludeWeekends);

    return `
      <div class="panel" style="margin-bottom:20px">
        <div class="chart-title" style="margin-bottom:4px;display:flex;align-items:center;gap:8px">
          <span>🧮</span>
          <span>Quick Date Calculator &amp; Business Days Utility</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
          Add or subtract intervals, calculate holding periods, or determine target delivery dates accounting for weekends.
        </div>

        <div style="background:var(--fill-1);border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:12px;align-items:flex-end">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Starting Date:</label>
              <input type="date" id="inpCalcStartDate" class="form-input" value="${baseDate}" style="font-size:12px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Operation:</label>
              <select id="selCalcOp" class="form-input" style="font-size:12px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                <option value="+" ${state.calcOp === '+' ? 'selected' : ''}>+ Add Time (Future)</option>
                <option value="-" ${state.calcOp === '-' ? 'selected' : ''}>- Subtract Time (Past)</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Amount:</label>
              <input type="number" id="inpCalcAmount" class="form-input" value="${state.calcAmount}" min="1" max="1000" style="font-size:12px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Unit:</label>
              <select id="selCalcUnit" class="form-input" style="font-size:12px;width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--border)">
                <option value="days" ${state.calcUnit === 'days' ? 'selected' : ''}>Days</option>
                <option value="weeks" ${state.calcUnit === 'weeks' ? 'selected' : ''}>Weeks</option>
                <option value="months" ${state.calcUnit === 'months' ? 'selected' : ''}>Months</option>
                <option value="years" ${state.calcUnit === 'years' ? 'selected' : ''}>Years</option>
              </select>
            </div>
          </div>

          <!-- Weekend Exclusion Toggle -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap;gap:8px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);cursor:pointer;user-select:none;margin:0">
              <input type="checkbox" id="chkCalcBusinessDays" ${state.calcExcludeWeekends ? 'checked' : ''}>
              <span>Business Days Only (skip Saturdays &amp; Sundays)</span>
            </label>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:11px;color:var(--text3)">Computed Target:</span>
              <span style="font-size:15px;font-weight:700;color:var(--gold);background:var(--bg2);padding:4px 12px;border-radius:6px;border:1px solid var(--border)">
                ${computed}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Render Section 6: Chronological Timeline, Conflict Detection & Smart Insights
  function renderTimelineAndInsights(items) {
    const todayStr = App.utils.todayISO();

    const byDate = {};
    items.forEach((it) => {
      byDate[it.targetDate] = byDate[it.targetDate] || [];
      byDate[it.targetDate].push(it);
    });

    const conflicts = Object.entries(byDate).filter(([dt, list]) => list.length >= 2 && dt >= todayStr).slice(0, 5);
    const upcomingTop10 = items.filter((i) => i.daysRemaining >= 0 && i.status !== 'COMPLETED').slice(0, 10);

    const next7DaysFinancial = items.filter((i) => i.daysRemaining >= 0 && i.daysRemaining <= 7 && i.amount > 0 && i.status !== 'COMPLETED');
    const total7DaysAmount = next7DaysFinancial.reduce((sum, i) => sum + (i.amount || 0), 0);

    const maturingNext30 = items.filter((i) => i.category === 'Deal' && i.daysRemaining >= 0 && i.daysRemaining <= 30 && i.status !== 'COMPLETED');
    const totalMaturingAmount = maturingNext30.reduce((sum, i) => sum + (i.amount || 0), 0);

    return `
      <div class="grid-2" style="margin-bottom:20px;gap:14px">
        <!-- Left: Conflict Alerts & Smart Insights -->
        <div>
          <!-- Smart Insights -->
          <div class="panel" style="margin-bottom:14px">
            <div class="chart-title" style="margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <span>💡</span>
              <span>Deterministic Date Insights</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="background:var(--fill-1);border-left:3px solid var(--teal);padding:8px 12px;border-radius:4px;font-size:12px;line-height:1.4">
                <b>Cash Flow Horizon:</b> You have <b>${next7DaysFinancial.length}</b> financial commitments scheduled in the next 7 days totaling <b>${App.utils.fmtMoney(total7DaysAmount)}</b>.
              </div>
              ${maturingNext30.length ? `
                <div style="background:var(--fill-1);border-left:3px solid var(--gold);padding:8px 12px;border-radius:4px;font-size:12px;line-height:1.4">
                  <b>Capital Liquidity Return:</b> <b>${maturingNext30.length}</b> deal${maturingNext30.length > 1 ? 's are' : ' is'} maturing within 30 days returning <b>${App.utils.fmtMoney(totalMaturingAmount)}</b> principal.
                </div>
              ` : ''}
              <div style="background:var(--fill-1);border-left:3px solid var(--purple);padding:8px 12px;border-radius:4px;font-size:12px;line-height:1.4">
                <b>Tracking Active:</b> Monitoring <b>${items.length}</b> total portfolio dates across Deals, SIPs, Fixed Deposits, and Calendar Events.
              </div>
            </div>
          </div>

          <!-- Conflict Detection -->
          <div class="panel">
            <div class="chart-title" style="margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <span>⚠️</span>
              <span>Event Conflict &amp; Cash-Flow Clusters</span>
            </div>
            ${conflicts.length === 0 ? `
              <div style="font-size:12px;color:var(--text3);padding:12px 0">
                No overlapping event conflicts detected in upcoming dates.
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:8px">
                ${conflicts.map(([dt, list]) => `
                  <div style="background:rgba(217,83,79,0.08);border:1px solid rgba(217,83,79,0.25);border-radius:8px;padding:10px 12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                      <div style="font-weight:700;color:var(--red);font-size:12px">
                        ${list.length} Important Events on ${App.utils.fmtDate(dt)}
                      </div>
                      <span class="badge st-overdue" style="font-size:10px">${getDaysBetween(todayStr, dt)}d remaining</span>
                    </div>
                    <ul style="margin:0;padding-left:16px;font-size:11.5px;color:var(--text2)">
                      ${list.map((it) => `
                        <li>
                          <b>${App.utils.escapeHtml(it.title)}</b> (${it.category})
                          ${it.amount ? ` &mdash; <span style="color:var(--gold);font-weight:600">${App.utils.fmtMoney(it.amount)}</span>` : ''}
                        </li>
                      `).join('')}
                    </ul>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Right: Chronological Timeline & Top 10 Coming Next -->
        <div class="panel">
          <div class="chart-title" style="margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span>⚡</span>
            <span>What's Coming Next? (Chronological Timeline)</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:10px">
            ${upcomingTop10.map((it, idx) => {
              const isToday = it.daysRemaining === 0;
              const urgency = getUrgency(it.daysRemaining, it.status);

              return `
                <div style="display:flex;align-items:center;gap:12px;padding:8px 10px;background:var(--fill-1);border-radius:8px;border:1px solid ${isToday ? 'var(--gold)' : 'var(--border)'}">
                  <div style="font-size:13px;font-weight:700;color:var(--text3);min-width:20px">${idx + 1}.</div>
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:6px">
                      <b style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${App.utils.escapeHtml(it.title)}</b>
                      <span class="badge" style="font-size:9.5px">${App.utils.escapeHtml(it.category)}</span>
                    </div>
                    <div style="font-size:11px;color:var(--text3);margin-top:2px">
                      ${App.utils.fmtDate(it.targetDate)} ${it.institution ? `&bull; ${App.utils.escapeHtml(it.institution)}` : ''}
                    </div>
                  </div>
                  <div style="text-align:right">
                    ${it.amount ? `<div style="font-size:12px;font-weight:700;color:var(--gold)">${App.utils.fmtMoney(it.amount)}</div>` : ''}
                    <div style="font-size:11px;font-weight:600;color:${urgency.color}">
                      ${it.daysRemaining === 0 ? 'Today' : (it.daysRemaining === 1 ? 'Tomorrow' : `${it.daysRemaining}d`)}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Master render method mounted into Calendar view's tab host
  async function render(container) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--text3)">
        <div style="font-size:32px;margin-bottom:12px">⏳</div>
        <div>Loading normalized date intelligence...</div>
      </div>
    `;

    try {
      // Sync latest custom cards from Supabase PostgreSQL table and Auth user metadata across browsers
      try {
        await fetchSupabaseCustomCards();
        const client = App.auth && App.auth.getClient ? App.auth.getClient() : null;
        if (client && client.auth && client.auth.getUser) {
          const { data } = await client.auth.getUser();
          const authUser = data?.user;
          if (authUser && authUser.user_metadata && Array.isArray(authUser.user_metadata.custom_intel_cards)) {
            const cloudCards = authUser.user_metadata.custom_intel_cards;
            if (cloudCards.length > 0) {
              try { localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(cloudCards)); } catch (_) {}
              if (App.state && App.state.profile) {
                App.state.profile.preferences = Object.assign({}, App.state.profile.preferences || {}, { custom_intel_cards: cloudCards });
              }
            }
          }
        }
      } catch (_) {}

      const items = await loadAllDateItems();
      const customCards = getCustomCards();

      function updateView() {
        container.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:4px">
            <!-- Executive Summary Cards -->
            ${renderExecutiveKpis(items)}

            <!-- User Custom Intelligence Cards (Age, Experience, Custom Countdowns) -->
            ${renderCustomCardsSection(customCards)}

            <!-- Visual My Countdowns Grid -->
            ${renderCountdowns(items)}

            <!-- Date Difference Matrix & Comparison -->
            ${renderDifferenceTools(items)}

            <!-- Date Calculator & Business Days -->
            ${renderDateCalculator()}

            <!-- Timeline, Conflicts & Insights -->
            ${renderTimelineAndInsights(items)}
          </div>
        `;

        wireEvents();
      }

      function wireEvents() {
        // Wire Global Expand / Collapse All Button
        container.querySelector('#btnToggleAllCustomCards')?.addEventListener('click', () => {
          state.allCollapsed = !state.allCollapsed;
          if (state.allCollapsed) {
            customCards.forEach((c) => state.collapsedCardIds.add(c.id));
            items.forEach((i) => state.collapsedCardIds.add(i.id));
          } else {
            state.collapsedCardIds.clear();
          }
          updateView();
        });

        // Wire Add Custom Card Buttons
        container.querySelector('#btnAddNewCustomCard')?.addEventListener('click', () => {
          openCustomCardModal(null, () => render(container));
        });
        container.querySelector('#btnEmptyAddCustomCard')?.addEventListener('click', () => {
          openCustomCardModal(null, () => render(container));
        });

        // Wire Edit Custom Card Buttons
        container.querySelectorAll('[data-edit-custom-card]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cardId = btn.dataset.editCustomCard;
            const target = customCards.find((c) => c.id === cardId);
            if (target) openCustomCardModal(target, () => render(container));
          });
        });

        // Wire Delete Custom Card Buttons with 2-step verification
        container.querySelectorAll('[data-del-custom-card]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cardId = btn.dataset.delCustomCard;
            const target = customCards.find((c) => c.id === cardId);
            if (!target) return;

            App.ui.confirmTwoStepDelete({
              title: 'Delete Custom Intelligence Card',
              itemName: target.title || 'Custom Card',
              itemType: 'Intelligence Card',
              warningText: `Deleting "${target.title}" will remove this card from your date intelligence dashboard. It will be moved to the Recycle Bin.`,
              onConfirm: async () => {
                await deleteCustomCard(cardId);
                App.utils.toast('Custom card deleted.', 'ok');
                render(container);
              },
            });
          });
        });

        // Wire Individual Card Collapse Toggles
        container.querySelectorAll('[data-toggle-collapse-card]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cardId = btn.dataset.toggleCollapseCard;
            if (state.collapsedCardIds.has(cardId)) {
              state.collapsedCardIds.delete(cardId);
            } else {
              state.collapsedCardIds.add(cardId);
            }
            updateView();
          });
        });

        container.querySelectorAll('[data-toggle-collapse-item]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const itemId = btn.dataset.toggleCollapseItem;
            if (state.collapsedCardIds.has(itemId)) {
              state.collapsedCardIds.delete(itemId);
            } else {
              state.collapsedCardIds.add(itemId);
            }
            updateView();
          });
        });

        // Wire Category Chips
        container.querySelectorAll('[data-intel-cat]').forEach((chip) => {
          chip.addEventListener('click', () => {
            state.categoryFilter = chip.dataset.intelCat;
            updateView();
          });
        });

        // Wire Period Quick Buttons
        container.querySelectorAll('[data-period-filter]').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.periodFilter = btn.dataset.periodFilter;
            updateView();
          });
        });

        // Wire Status & Priority selects
        const selStatus = container.querySelector('#selIntelStatus');
        if (selStatus) {
          selStatus.addEventListener('change', (e) => {
            state.statusFilter = e.target.value;
            updateView();
          });
        }

        const selPriority = container.querySelector('#selIntelPriority');
        if (selPriority) {
          selPriority.addEventListener('change', (e) => {
            state.priorityFilter = e.target.value;
            updateView();
          });
        }

        // Wire Pin Toggles
        container.querySelectorAll('[data-toggle-pin]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.togglePin;
            await togglePin(id);
            render(container);
          });
        });

        // Wire 2-Date Comparison Inputs
        const inpA = container.querySelector('#inpCmpDateA');
        const inpB = container.querySelector('#inpCmpDateB');
        const btnToday = container.querySelector('#btnSetCmpToday');

        if (inpA) inpA.addEventListener('change', (e) => { state.cmpDateA = e.target.value; updateView(); });
        if (inpB) inpB.addEventListener('change', (e) => { state.cmpDateB = e.target.value; updateView(); });
        if (btnToday) btnToday.addEventListener('click', () => { state.cmpDateB = 'TODAY'; updateView(); });

        // Wire Date Calculator Inputs
        const calcStart = container.querySelector('#inpCalcStartDate');
        const calcOp = container.querySelector('#selCalcOp');
        const calcAmt = container.querySelector('#inpCalcAmount');
        const calcUnit = container.querySelector('#selCalcUnit');
        const calcWknd = container.querySelector('#chkCalcBusinessDays');

        if (calcStart) calcStart.addEventListener('change', (e) => { state.calcStartDate = e.target.value; updateView(); });
        if (calcOp) calcOp.addEventListener('change', (e) => { state.calcOp = e.target.value; updateView(); });
        if (calcAmt) calcAmt.addEventListener('input', (e) => { state.calcAmount = Number(e.target.value); updateView(); });
        if (calcUnit) calcUnit.addEventListener('change', (e) => { state.calcUnit = e.target.value; updateView(); });
        if (calcWknd) calcWknd.addEventListener('change', (e) => { state.calcExcludeWeekends = e.target.checked; updateView(); });
      }

      updateView();
    } catch (err) {
      container.innerHTML = `
        <div style="padding:32px;color:var(--red);text-align:center">
          Failed to load date intelligence: ${App.utils.escapeHtml(err.message || String(err))}
        </div>
      `;
    }
  }

  return {
    render,
    loadAllDateItems,
    getCustomCards,
    addOrUpdateCustomCard,
    deleteCustomCard,
    calcExactAge,
    calcExperienceBreakdown,
    getDaysBetween,
    calculateBusinessDays,
    computeShiftedDate,
    togglePin,
    openCustomCardModal,
  };
})();
