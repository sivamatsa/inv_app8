// send-bot-notifications - Dispatches pending portfolio alerts and notifications
// to verified Telegram chats and WhatsApp numbers.
//
// Deployed via the Supabase CLI:
//   supabase functions deploy send-bot-notifications
//   supabase secrets set TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
//   supabase secrets set WHATSAPP_API_TOKEN="EAA..."
//   supabase secrets set WHATSAPP_PHONE_NUMBER_ID="10987654321..."
//
// Invoked via:
// 1. Cron job (every 15 min or 5 min in Database -> Cron Jobs)
// 2. Database Webhook on notifications INSERT
// 3. Admin / User manual trigger from Settings -> "Trigger Bot Dispatch"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const WHATSAPP_API_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN') || '';
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';

interface NotificationRow {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  created_at: string;
  telegram_sent_at?: string | null;
  whatsapp_sent_at?: string | null;
}

interface BotLinkRow {
  user_id: string;
  platform: 'telegram' | 'whatsapp';
  chat_id: string;
  is_verified: boolean;
  preferences: {
    daily_digest?: boolean;
    urgent_alerts?: boolean;
    due_reminders?: boolean;
    gold_alerts?: boolean;
    automation_rules?: boolean;
  };
}

function formatNotificationForTelegram(n: NotificationRow): string {
  const icon = n.priority === 'Urgent' ? '🚨' : n.priority === 'High' ? '⚠️' : '🔔';
  return `${icon} <b>Investment OS &bull; ${n.type}</b>\n\n<b>${escapeHtml(n.title)}</b>\n${escapeHtml(n.message)}\n\n<i>Priority: ${n.priority} &bull; ${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</i>`;
}

function formatNotificationForWhatsApp(n: NotificationRow): string {
  const icon = n.priority === 'Urgent' ? '🚨' : n.priority === 'High' ? '⚠️' : '🔔';
  return `${icon} *Investment OS • ${n.type}*\n\n*${n.title}*\n${n.message}\n\n_Priority: ${n.priority}_`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured in secrets' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description || 'Telegram API error' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function sendWhatsAppMessage(recipientPhone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: 'WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured' };
  }
  try {
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const res = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });
    const data = await res.json();
    if (data.error) {
      return { ok: false, error: data.error.message || 'WhatsApp Cloud API error' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase configuration missing in edge function' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let telegramSent = 0;
  let whatsappSent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: any[] = [];

  try {
    // 1. Fetch active, verified bot links
    const { data: links, error: linksError } = await supabase
      .from('bot_links')
      .select('*')
      .eq('is_verified', true);

    if (linksError) throw linksError;

    if (!links || links.length === 0) {
      return new Response(JSON.stringify({
        status: 'no_verified_links',
        telegramSent: 0,
        whatsappSent: 0,
        message: 'No users have linked Telegram or WhatsApp bot yet.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map links by user_id
    const telegramLinksByUser = new Map<string, BotLinkRow>();
    const whatsappLinksByUser = new Map<string, BotLinkRow>();

    links.forEach((l: BotLinkRow) => {
      if (l.platform === 'telegram') telegramLinksByUser.set(l.user_id, l);
      if (l.platform === 'whatsapp') whatsappLinksByUser.set(l.user_id, l);
    });

    // 2. Fetch recent unnotified alerts (past 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(100);

    if (notifError) throw notifError;

    // Process each notification
    for (const notif of (notifications || [])) {
      const tgLink = telegramLinksByUser.get(notif.user_id);
      const waLink = whatsappLinksByUser.get(notif.user_id);

      // Telegram dispatch
      if (tgLink && tgLink.chat_id) {
        const text = formatNotificationForTelegram(notif);
        const res = await sendTelegramMessage(tgLink.chat_id, text);
        if (res.ok) {
          telegramSent++;
          await supabase.from('bot_message_logs').insert({
            user_id: notif.user_id,
            platform: 'telegram',
            direction: 'outbound',
            chat_id: tgLink.chat_id,
            command: 'alert',
            message_text: notif.title,
            status: 'success',
          }).catch(() => {});
        } else {
          failed++;
          errors.push({ platform: 'telegram', user_id: notif.user_id, error: res.error });
        }
      }

      // WhatsApp dispatch
      if (waLink && waLink.chat_id) {
        const text = formatNotificationForWhatsApp(notif);
        const res = await sendWhatsAppMessage(waLink.chat_id, text);
        if (res.ok) {
          whatsappSent++;
          await supabase.from('bot_message_logs').insert({
            user_id: notif.user_id,
            platform: 'whatsapp',
            direction: 'outbound',
            chat_id: waLink.chat_id,
            command: 'alert',
            message_text: notif.title,
            status: 'success',
          }).catch(() => {});
        } else {
          failed++;
          errors.push({ platform: 'whatsapp', user_id: notif.user_id, error: res.error });
        }
      }

      if (!tgLink && !waLink) {
        skipped++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      telegramSent,
      whatsappSent,
      skipped,
      failed,
      errors: errors.slice(0, 10),
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || 'Error processing bot notifications',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
