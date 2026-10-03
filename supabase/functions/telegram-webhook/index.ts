// ============================================================================
// Supabase Edge Function: 24/7 Telegram Bot Webhook
// Serves Telegram Bot updates 24/7 with zero maintenance and zero external servers.
// Deploy via: supabase functions deploy telegram-webhook --no-verify-jwt
// Webhook URL: https://<your-project-ref>.supabase.co/functions/v1/telegram-webhook
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function fmtINR(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  return "₹" + n.toLocaleString("en-IN");
}

function escapeTg(str: string): string {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegram(chatId: string | number, text: string) {
  const token = TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }).catch((e) => console.error("Send error:", e));
}

serve(async (req: Request) => {
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok", service: "Investment OS Telegram Webhook" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const update = await req.json();
    const msg = update.message;
    if (!msg || !msg.chat) {
      return new Response("OK", { status: 200 });
    }

    const chatId = String(msg.chat.id);
    const text = (msg.text || "").trim();
    const fromUser = msg.from?.username || msg.from?.first_name || "Friend";

    // Handle /start [code]
    if (text.startsWith("/start")) {
      const code = text.split(" ")[1]?.trim();
      if (code) {
        const { data: link } = await supabase
          .from("bot_links")
          .select("*")
          .eq("verification_code", code)
          .eq("platform", "telegram")
          .maybeSingle();

        if (link) {
          await supabase.from("bot_links").update({
            chat_id: chatId,
            username: msg.from?.username || fromUser,
            is_verified: true,
            last_active_at: new Date().toISOString(),
          }).eq("id", link.id);

          await sendTelegram(
            chatId,
            `🎉 <b>Personal Investment OS Connected!</b>\n\nYour Telegram account is now securely linked to your portfolio vault.\n\nUse <b>/summary</b>, <b>/due</b>, <b>/gold</b>, or <b>/overdue</b>.`
          );
          return new Response("OK", { status: 200 });
        }
      }

      await sendTelegram(
        chatId,
        `👋 Hello <b>${escapeTg(fromUser)}</b>!\nYour Chat ID is <code>${chatId}</code>.\n\nGenerate a link code from your Investment OS Settings to connect.`
      );
      return new Response("OK", { status: 200 });
    }

    // Lookup user from chat_id
    const { data: linkRow } = await supabase
      .from("bot_links")
      .select("user_id, is_verified")
      .eq("chat_id", chatId)
      .eq("platform", "telegram")
      .maybeSingle();

    if (!linkRow || !linkRow.user_id) {
      await sendTelegram(chatId, `⚠️ Chat not linked. Type <b>/start</b> to begin.`);
      return new Response("OK", { status: 200 });
    }

    const uid = linkRow.user_id;

    // Handle /summary
    if (text === "/summary") {
      const [dealsRes, schedRes, profileRes] = await Promise.all([
        supabase.from("deals").select("*").eq("user_id", uid),
        supabase.from("payment_schedules").select("*").eq("user_id", uid),
        supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
      ]);

      const deals = dealsRes.data || [];
      const schedules = schedRes.data || [];
      const investor = profileRes.data?.full_name || "Investor";

      let activeCapital = 0;
      let activeDeals = 0;
      let monthlyIncome = 0;
      deals.forEach((d) => {
        const p = Number(d.principal_amount) || 0;
        const r = Number(d.interest_rate) || 0;
        const st = (d.status || "").toLowerCase();
        if (st === "active" || st === "ongoing") {
          activeCapital += p;
          activeDeals++;
          monthlyIncome += (p * (r > 0 ? r : 2)) / 100;
        }
      });

      const today = new Date().toISOString().slice(0, 10);
      let overdue = 0;
      schedules.forEach((s) => {
        if (!s.is_paid && s.status !== "paid" && s.due_date < today) {
          overdue += Number(s.amount || s.expected_amount) || 0;
        }
      });

      const reply =
        `💼 <b>Personal Investment OS • Portfolio Summary</b>\n\n` +
        `👤 <b>Investor:</b> ${escapeTg(investor)}\n` +
        `💰 <b>Active Capital:</b> ${fmtINR(activeCapital)} (${activeDeals} deals)\n` +
        `📈 <b>Monthly Yield:</b> ${fmtINR(monthlyIncome)}/mo\n` +
        `🚨 <b>Overdue:</b> ${fmtINR(overdue)}\n\n` +
        `<i>Delivered via 24/7 Supabase Cloud Webhook</i>`;

      await sendTelegram(chatId, reply);
      return new Response("OK", { status: 200 });
    }

    // Default reply
    await sendTelegram(
      chatId,
      `I received your message: "${escapeTg(text)}".\nType <b>/summary</b> to view your active portfolio.`
    );
    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
