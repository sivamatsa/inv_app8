/* ==========================================================================
   Personal Investment OS - Client-Side Telegram Polling Engine
   Runs directly in the browser / PWA on GitHub Pages & static domains.
   Communicates directly with Telegram Bot API (CORS-friendly) and Supabase.
   ========================================================================== */

(function () {
  'use strict';

  window.App = window.App || {};

  let isRunning = false;
  let abortController = null;
  let lastUpdateId = 0;
  let activeToken = null;
  let botUsername = null;
  let pollTimeoutId = null;

  const stats = {
    active: false,
    mode: 'client_polling',
    startedAt: null,
    lastPollAt: null,
    updatesProcessed: 0,
    errorsCount: 0,
    lastError: null,
  };

  // Helper to format currency
  function fmtINR(amount) {
    const n = Math.round(Number(amount) || 0);
    return '₹' + n.toLocaleString('en-IN');
  }

  // Escape HTML for Telegram HTML parse_mode
  function escapeTg(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Get active user ID from Supabase
  function getUserId() {
    return App.auth?.getUser()?.id || null;
  }

  // Fetch portfolio stats directly from Supabase
  async function getLivePortfolioSummary() {
    const sb = App.supabase?.client;
    const uid = getUserId();
    if (!sb || !uid) return null;

    try {
      const [dealsRes, schedRes, profileRes] = await Promise.all([
        sb.from('deals').select('*').eq('user_id', uid),
        sb.from('payment_schedules').select('*').eq('user_id', uid),
        sb.from('profiles').select('full_name, preferred_currency').eq('id', uid).maybeSingle(),
      ]);

      const deals = dealsRes.data || [];
      const schedules = schedRes.data || [];
      const profile = profileRes.data || {};

      let activeCapital = 0;
      let activeDealsCount = 0;
      let closedDealsCount = 0;
      let returnedCapital = 0;

      deals.forEach((d) => {
        const principal = Number(d.principal_amount) || 0;
        const status = (d.status || '').toLowerCase();
        if (status === 'active' || status === 'ongoing') {
          activeCapital += principal;
          activeDealsCount++;
        } else if (status === 'closed' || status === 'completed' || status === 'matured') {
          returnedCapital += principal;
          closedDealsCount++;
        }
      });

      // Monthly expected interest
      let monthlyIncome = 0;
      deals.forEach((d) => {
        const principal = Number(d.principal_amount) || 0;
        const rate = Number(d.interest_rate) || 0;
        const status = (d.status || '').toLowerCase();
        if ((status === 'active' || status === 'ongoing') && rate > 0) {
          const rateType = (d.rate_type || 'per_month').toLowerCase();
          if (rateType.includes('month') || rateType === 'pm') {
            monthlyIncome += (principal * rate) / 100;
          } else {
            monthlyIncome += (principal * (rate / 100)) / 12;
          }
        }
      });

      // Overdue & Due next 30 days
      const today = new Date().toISOString().slice(0, 10);
      const next30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      let dueNext30 = 0;
      let dueNext30Count = 0;
      let overdueAmount = 0;
      let overdueCount = 0;

      schedules.forEach((s) => {
        const isPaid = (s.status || '').toLowerCase() === 'paid' || s.is_paid === true;
        if (isPaid) return;
        const amt = Number(s.amount || s.expected_amount) || 0;
        const dDate = s.due_date || s.date;
        if (!dDate) return;

        if (dDate < today) {
          overdueAmount += amt;
          overdueCount++;
        } else if (dDate <= next30) {
          dueNext30 += amt;
          dueNext30Count++;
        }
      });

      return {
        investorName: profile.full_name || 'Investor',
        activeCapital,
        activeDealsCount,
        monthlyIncome,
        dueNext30,
        dueNext30Count,
        overdueAmount,
        overdueCount,
        closedDealsCount,
        returnedCapital,
        totalDeals: deals.length,
      };
    } catch (err) {
      console.warn('[TelegramPoller] Summary query notice:', err);
      return null;
    }
  }

  // Fetch upcoming payouts (next 30 days)
  async function getUpcomingPayouts() {
    const sb = App.supabase?.client;
    const uid = getUserId();
    if (!sb || !uid) return [];

    try {
      const today = new Date().toISOString().slice(0, 10);
      const next30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      const { data: schedules } = await sb
        .from('payment_schedules')
        .select('*, deals(deal_name, borrower_name)')
        .eq('user_id', uid)
        .gte('due_date', today)
        .lte('due_date', next30)
        .order('due_date', { ascending: true })
        .limit(10);

      return schedules || [];
    } catch (e) {
      return [];
    }
  }

  // Fetch overdue payouts
  async function getOverduePayouts() {
    const sb = App.supabase?.client;
    const uid = getUserId();
    if (!sb || !uid) return [];

    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: schedules } = await sb
        .from('payment_schedules')
        .select('*, deals(deal_name, borrower_name)')
        .eq('user_id', uid)
        .lt('due_date', today)
        .order('due_date', { ascending: true })
        .limit(10);

      return (schedules || []).filter((s) => (s.status || '').toLowerCase() !== 'paid' && !s.is_paid);
    } catch (e) {
      return [];
    }
  }

  // Fetch gold portfolio stats
  async function getGoldSummary() {
    const sb = App.supabase?.client;
    const uid = getUserId();
    if (!sb || !uid) return null;

    try {
      const { data: goldRows } = await sb.from('gold_purchases').select('*').eq('user_id', uid);
      const rows = goldRows || [];
      let totalGrams = 0;
      let totalCost = 0;

      rows.forEach((r) => {
        totalGrams += Number(r.quantity_grams || r.grams) || 0;
        totalCost += Number(r.purchase_price || r.total_cost) || 0;
      });

      // Default Hyderabad 24K bullion benchmark
      const liveRate24k = 15328.0;
      const liveRate22k = 14051.0;
      const currentValue = totalGrams * liveRate24k;
      const unrealizedPnl = currentValue - totalCost;

      return {
        totalGrams: totalGrams.toFixed(2),
        totalCost,
        currentValue,
        unrealizedPnl,
        rate24k: liveRate24k,
        rate22k: liveRate22k,
        recordsCount: rows.length,
      };
    } catch (e) {
      return null;
    }
  }

  // Send message back to Telegram via Telegram Bot API
  async function sendTelegramMessage(chatId, text, options = {}) {
    if (!activeToken) return false;
    try {
      const url = `https://api.telegram.org/bot${activeToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: options.parse_mode || 'HTML',
          disable_web_page_preview: options.disable_web_page_preview ?? true,
          reply_markup: options.reply_markup || undefined,
        }),
      });
      const data = await res.json();
      return data.ok;
    } catch (err) {
      console.warn('[TelegramPoller] Send error:', err.message);
      return false;
    }
  }

  // Handle incoming Telegram message
  async function handleMessage(msg) {
    if (!msg || !msg.chat) return;

    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const fromUser = msg.from?.username || msg.from?.first_name || 'Friend';
    const sb = App.supabase?.client;
    const uid = getUserId();

    console.log(`[TelegramPoller] Inbound from @${fromUser} (Chat: ${chatId}): ${text}`);

    // Command parsing
    const parts = text.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase().replace(/@.+$/, ''); // Remove bot handle if any

    // 1. /start command (with optional linking code)
    if (cmd === '/start') {
      const codeArg = parts[1]?.trim();

      // Check if user has an active bot_link in Supabase
      if (sb && uid) {
        try {
          const { data: linkRow } = await sb
            .from('bot_links')
            .select('*')
            .eq('user_id', uid)
            .eq('platform', 'telegram')
            .maybeSingle();

          if (codeArg && linkRow && linkRow.verification_code === codeArg) {
            // Match! Link chat ID
            await sb.from('bot_links').update({
              chat_id: chatId,
              username: msg.from?.username || fromUser,
              is_verified: true,
              last_active_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', linkRow.id);

            await sendTelegramMessage(
              chatId,
              `🎉 <b>Personal Investment OS Connected!</b>\n\n` +
              `Hello <b>${escapeTg(fromUser)}</b>, your Telegram account is now securely linked to your portfolio vault.\n\n` +
              `You can now use:\n` +
              `• <b>/summary</b> — Portfolio balance & yield overview\n` +
              `• <b>/due</b> — Upcoming repayments next 30 days\n` +
              `• <b>/overdue</b> — Overdue schedules needing attention\n` +
              `• <b>/gold</b> — Live physical gold holdings & bullion valuation\n` +
              `• <b>/digest</b> — Comprehensive daily briefing\n` +
              `• Or ask any natural language question!`
            );
            return;
          } else if (linkRow && linkRow.chat_id === chatId) {
            await sendTelegramMessage(
              chatId,
              `💼 <b>Welcome back to Personal Investment OS!</b>\n\n` +
              `Your vault is connected. Type <b>/summary</b> to see your active investments or ask any financial question.`
            );
            return;
          }
        } catch (e) {
          console.warn('[TelegramPoller] Link update error:', e);
        }
      }

      // If no code, or not linked yet
      await sendTelegramMessage(
        chatId,
        `👋 <b>Hello ${escapeTg(fromUser)}! Welcome to Personal Investment OS Bot.</b>\n\n` +
        `Your Telegram Chat ID is: <code>${chatId}</code>\n\n` +
        `To link this chat to your portfolio:\n` +
        `1. Open your Investment OS Web App / PWA\n` +
        `2. Go to <b>Settings &rarr; Notification Integrations &rarr; Telegram</b>\n` +
        `3. Click <b>Link Telegram Account</b> to generate your 6-digit link code\n` +
        `4. Send <code>/start &lt;YOUR-CODE&gt;</code> here to complete verification.`
      );
      return;
    }

    // 2. /summary command
    if (cmd === '/summary') {
      const sum = await getLivePortfolioSummary();
      if (!sum) {
        await sendTelegramMessage(chatId, `⚠️ Could not retrieve portfolio data. Ensure your app is signed in.`);
        return;
      }

      const pnlSign = sum.overdueAmount > 0 ? '⚠️' : '✅';
      const msgText =
        `💼 <b>Personal Investment OS • Portfolio Summary</b>\n\n` +
        `👤 <b>Investor:</b> ${escapeTg(sum.investorName)}\n` +
        `💰 <b>Active Capital:</b> ${fmtINR(sum.activeCapital)} (${sum.activeDealsCount} active deals)\n` +
        `📈 <b>Exp. Monthly Income:</b> ${fmtINR(sum.monthlyIncome)}/mo (~${fmtINR(sum.monthlyIncome * 12)}/yr)\n` +
        `⏳ <b>Due Next 30 Days:</b> ${fmtINR(sum.dueNext30)} (${sum.dueNext30Count} payouts)\n` +
        `🚨 <b>Overdue Capital:</b> ${fmtINR(sum.overdueAmount)} (${sum.overdueCount} overdue) ${pnlSign}\n` +
        `📦 <b>Closed Deals:</b> ${sum.closedDealsCount} deals (${fmtINR(sum.returnedCapital)} returned)\n\n` +
        `<i>Updated live from your Investment OS Vault</i>`;

      await sendTelegramMessage(chatId, msgText);
      return;
    }

    // 3. /due command
    if (cmd === '/due') {
      const payouts = await getUpcomingPayouts();
      if (!payouts.length) {
        await sendTelegramMessage(chatId, `✅ <b>No payouts due in the next 30 days.</b>\n\nAll current borrower schedules are on track.`);
        return;
      }

      let textOut = `⏳ <b>Upcoming Payouts (Next 30 Days)</b>\n\n`;
      payouts.forEach((p, i) => {
        const dName = p.deals?.deal_name || p.deals?.borrower_name || 'Investment Deal';
        const amt = fmtINR(p.amount || p.expected_amount);
        const type = p.payment_type ? `(${p.payment_type})` : '';
        textOut += `${i + 1}. <b>${escapeTg(p.due_date)}</b>: ${amt} &bull; ${escapeTg(dName)} ${type}\n`;
      });
      textOut += `\n<i>Total upcoming records: ${payouts.length}</i>`;

      await sendTelegramMessage(chatId, textOut);
      return;
    }

    // 4. /overdue command
    if (cmd === '/overdue') {
      const overdue = await getOverduePayouts();
      if (!overdue.length) {
        await sendTelegramMessage(chatId, `🎉 <b>Zero Overdue Payouts!</b>\n\nAll borrower payment obligations are in good standing.`);
        return;
      }

      let textOut = `🚨 <b>Overdue Payout Alert</b>\n\n`;
      overdue.forEach((p, i) => {
        const dName = p.deals?.deal_name || p.deals?.borrower_name || 'Borrower';
        const amt = fmtINR(p.amount || p.expected_amount);
        textOut += `${i + 1}. <b>${escapeTg(p.due_date)}</b>: ${amt} &bull; ${escapeTg(dName)}\n`;
      });
      textOut += `\n⚠️ <i>Please follow up with counter-parties via WhatsApp or Phone in Investment OS.</i>`;

      await sendTelegramMessage(chatId, textOut);
      return;
    }

    // 5. /gold command
    if (cmd === '/gold') {
      const gold = await getGoldSummary();
      if (!gold) {
        await sendTelegramMessage(chatId, `🥇 <b>Physical Gold Vault</b>\n\nNo gold purchase entries found in your vault.`);
        return;
      }

      const pnlText = gold.unrealizedPnl >= 0 ? `+${fmtINR(gold.unrealizedPnl)}` : `-${fmtINR(Math.abs(gold.unrealizedPnl))}`;
      const textOut =
        `🥇 <b>Physical Gold Holdings & Valuation</b>\n\n` +
        `⚖️ <b>Total Quantity:</b> ${gold.totalGrams} grams\n` +
        `💵 <b>Purchase Cost:</b> ${fmtINR(gold.totalCost)}\n` +
        `📈 <b>Current Value:</b> ${fmtINR(gold.currentValue)}\n` +
        `✨ <b>Unrealized Gain:</b> ${pnlText}\n\n` +
        `🏷️ <b>Live Rates (Hyderabad / India):</b>\n` +
        `• 24K (99.9%): ₹${gold.rate24k}/g\n` +
        `• 22K (91.6%): ₹${gold.rate22k}/g`;

      await sendTelegramMessage(chatId, textOut);
      return;
    }

    // 6. /digest command
    if (cmd === '/digest') {
      const sum = await getLivePortfolioSummary();
      const overdue = await getOverduePayouts();
      const payouts = await getUpcomingPayouts();

      const textOut =
        `📰 <b>Personal Investment OS • Daily Intelligence Digest</b>\n\n` +
        `💰 <b>Active Portfolio:</b> ${sum ? fmtINR(sum.activeCapital) : '₹0'}\n` +
        `📈 <b>Monthly Yield:</b> ${sum ? fmtINR(sum.monthlyIncome) : '₹0'}/mo\n` +
        `🚨 <b>Attention Needed:</b> ${overdue.length} overdue payments\n` +
        `📅 <b>Next 30 Days:</b> ${payouts.length} scheduled distributions\n\n` +
        `<i>Log in to https://sri.qzz.io/ to review transaction vouchers.</i>`;

      await sendTelegramMessage(chatId, textOut);
      return;
    }

    // 7. /help command
    if (cmd === '/help') {
      await sendTelegramMessage(
        chatId,
        `🤖 <b>Personal Investment OS Bot Help</b>\n\n` +
        `Available Commands:\n` +
        `• <b>/summary</b> — Portfolio balance, active deals & monthly yield\n` +
        `• <b>/due</b> — Upcoming payment schedules next 30 days\n` +
        `• <b>/overdue</b> — Immediate overdue payments requiring follow-up\n` +
        `• <b>/gold</b> — Physical gold weight, valuation & live market rates\n` +
        `• <b>/digest</b> — Daily consolidated portfolio brief\n` +
        `• <b>/start</b> — Verification & chat linking\n\n` +
        `<i>You can also type any general investment question.</i>`
      );
      return;
    }

    // 8. General Financial / AI Query
    try {
      const sum = await getLivePortfolioSummary();
      const prompt = `User asks via Telegram: "${text}". Briefly answer like a private institutional wealth manager. Portfolio summary: Active capital ${sum ? fmtINR(sum.activeCapital) : 'unknown'}, ${sum ? sum.activeDealsCount : '0'} active deals, monthly income ${sum ? fmtINR(sum.monthlyIncome) : '0'}. Keep answer under 4 sentences.`;

      let aiReply = null;
      if (App.api?.queryAi) {
        const res = await App.api.queryAi(prompt).catch(() => null);
        aiReply = res?.text || res?.reply;
      }

      if (!aiReply) {
        aiReply = `I received your message: "${escapeTg(text)}".\nUse <b>/summary</b> for active investments or <b>/due</b> for payment schedules.`;
      }

      await sendTelegramMessage(chatId, aiReply);
    } catch (e) {
      await sendTelegramMessage(chatId, `I received your message. Use <b>/summary</b> to see your portfolio metrics.`);
    }
  }

  // Polling loop
  async function pollUpdates() {
    if (!isRunning || !activeToken) return;

    stats.lastPollAt = new Date().toISOString();
    abortController = new AbortController();

    try {
      const url = `https://api.telegram.org/bot${activeToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
      const res = await fetch(url, { signal: abortController.signal });

      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            stats.updatesProcessed++;
            if (update.message) {
              await handleMessage(update.message);
            }
          }
        }
      } else if (res.status === 409) {
        // Conflict: a webhook was set on Telegram. Attempt to delete webhook so getUpdates works!
        console.warn('[TelegramPoller] 409 Conflict: Webhook is active. Attempting deleteWebhook...');
        await fetch(`https://api.telegram.org/bot${activeToken}/deleteWebhook?drop_pending_updates=false`).catch(() => {});
      } else {
        const errText = await res.text().catch(() => '');
        stats.errorsCount++;
        stats.lastError = `HTTP ${res.status}: ${errText.slice(0, 100)}`;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        stats.errorsCount++;
        stats.lastError = err.message;
        console.warn('[TelegramPoller] Poll tick notice:', err.message);
      }
    }

    // Schedule next poll tick
    if (isRunning) {
      pollTimeoutId = setTimeout(pollUpdates, 1000);
    }
  }

  // Public Telegram Client Poller API
  App.telegramClientPoller = {
    start: async function (token, username) {
      if (token) activeToken = token;
      if (username) botUsername = username;

      if (!activeToken) {
        activeToken = localStorage.getItem('ios_telegram_bot_token') || null;
      }
      if (!botUsername) {
        botUsername = localStorage.getItem('ios_telegram_bot_username') || null;
      }

      if (!activeToken) {
        console.log('[TelegramPoller] No bot token configured, poller idle.');
        return false;
      }

      if (isRunning) {
        console.log('[TelegramPoller] Already running.');
        return true;
      }

      // Clear any conflicting webhook on Telegram before starting long polling
      try {
        await fetch(`https://api.telegram.org/bot${activeToken}/deleteWebhook?drop_pending_updates=false`);
      } catch (_) {}

      isRunning = true;
      stats.active = true;
      stats.startedAt = new Date().toISOString();
      console.log(`[TelegramPoller] Starting in-browser Telegram poller for @${botUsername || 'bot'}`);
      pollUpdates();
      return true;
    },

    stop: function () {
      isRunning = false;
      stats.active = false;
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
      console.log('[TelegramPoller] Stopped.');
    },

    restart: async function () {
      App.telegramClientPoller.stop();
      return await App.telegramClientPoller.start();
    },

    getStats: function () {
      return Object.assign({}, stats, {
        active: isRunning,
        botUsername: botUsername || 'bot',
        hasToken: !!activeToken,
      });
    },

    setToken: function (token, username) {
      activeToken = token;
      botUsername = username;
      if (token) localStorage.setItem('ios_telegram_bot_token', token);
      if (username) localStorage.setItem('ios_telegram_bot_username', username);
    },

    getToken: function () {
      return activeToken || localStorage.getItem('ios_telegram_bot_token');
    },

    // Broadcast urgent notifications to linked Telegram chat directly
    broadcastAlert: async function (title, body) {
      if (!activeToken) return false;
      const sb = App.supabase?.client;
      const uid = getUserId();
      if (!sb || !uid) return false;

      try {
        const { data: linkRow } = await sb
          .from('bot_links')
          .select('chat_id, is_verified')
          .eq('user_id', uid)
          .eq('platform', 'telegram')
          .maybeSingle();

        if (linkRow && linkRow.chat_id && linkRow.is_verified) {
          const text = `🔔 <b>${escapeTg(title)}</b>\n\n${escapeTg(body)}`;
          return await sendTelegramMessage(linkRow.chat_id, text);
        }
      } catch (err) {
        console.warn('[TelegramPoller] Broadcast notice:', err);
      }
      return false;
    },
  };

  // Auto-start on load if token exists in localStorage or Supabase
  document.addEventListener('DOMContentLoaded', async () => {
    const cachedToken = localStorage.getItem('ios_telegram_bot_token');
    const cachedUser = localStorage.getItem('ios_telegram_bot_username');
    if (cachedToken) {
      App.telegramClientPoller.setToken(cachedToken, cachedUser);
      setTimeout(() => {
        App.telegramClientPoller.start();
      }, 1500);
    }
  });

})();
