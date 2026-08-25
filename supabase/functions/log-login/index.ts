// log-login - called once per sign-in from the client to record customer visit/login telemetry.
// Captures IP, location (city/region/country), device type (Mobile/Tablet/Desktop),
// browser, OS, screen resolution, timezone, and language.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function parseUserAgent(ua: string): { browser: string; os: string; deviceType: string } {
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /OPR\/|Opera/i.test(ua) ? 'Opera' :
    /SamsungBrowser/i.test(ua) ? 'Samsung Internet' :
    /Chrome\//i.test(ua) ? 'Chrome' :
    /Firefox\//i.test(ua) ? 'Firefox' :
    /Safari\//i.test(ua) && !/Chrome/i.test(ua) ? 'Safari' :
    'Other';

  const os =
    /Windows/i.test(ua) ? 'Windows' :
    /Android/i.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/i.test(ua) ? 'iOS' :
    /Mac OS/i.test(ua) ? 'macOS' :
    /Linux/i.test(ua) ? 'Linux' :
    /CrOS/i.test(ua) ? 'Chrome OS' :
    'Other';

  const deviceType =
    /iPad|Tablet|playbook|silk/i.test(ua) ? 'Tablet' :
    /Mobile|Android|iPhone|iPod|IEMobile|BlackBerry/i.test(ua) ? 'Mobile' :
    'Desktop';

  return { browser, os, deviceType };
}

async function geoLookup(ip: string): Promise<{ city: string | null; region: string | null; country: string | null }> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { city: null, region: null, country: null };
  }
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'PortfolioApp/1.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.error) {
        return { city: data.city || null, region: data.region || null, country: data.country_name || null };
      }
    }
  } catch {}

  // Fallback to freeipapi
  try {
    const res = await fetch(`https://freeipapi.com/api/json/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return { city: data.cityName || null, region: data.regionName || null, country: data.countryName || null };
    }
  } catch {}

  return { city: null, region: null, country: null };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: 'Not authenticated.' }, 401);

    const body = await req.json().catch(() => ({}));
    const clientUserAgent = typeof body?.userAgent === 'string' ? body.userAgent : (req.headers.get('user-agent') || '');

    const parsedUa = clientUserAgent ? parseUserAgent(clientUserAgent) : { browser: 'Unknown', os: 'Unknown', deviceType: 'Desktop' };
    const browser = body?.browser || parsedUa.browser;
    const os = body?.os || parsedUa.os;
    const deviceType = body?.deviceType || parsedUa.deviceType;

    // Detect IP from headers or client payload
    const forwardedHeader = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '';
    const headerIp = forwardedHeader.split(',')[0].trim();
    const ip = headerIp || body?.clientIp || null;

    let city = body?.city || null;
    let region = body?.region || null;
    let country = body?.country || null;

    // If client didn't supply geo, perform server lookup
    if ((!city || !country) && ip) {
      const geo = await geoLookup(ip);
      if (!city) city = geo.city;
      if (!region) region = geo.region;
      if (!country) country = geo.country;
    }

    const row: Record<string, unknown> = {
      user_id: userData.user.id,
      occurred_at: new Date().toISOString(),
      ip_address: ip,
      user_agent: clientUserAgent || null,
      browser,
      os,
      device_type: deviceType,
      city,
      region,
      country,
      screen_resolution: body?.screenResolution || null,
      language: body?.language || null,
      timezone: body?.timezone || null,
      consent_given: true,
    };

    const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: insertErr } = await serviceDb.from('login_events').insert(row);
    if (insertErr) {
      console.error('log-login: insert failed for user', userData.user.id, insertErr.message);
      return json({ ok: false, error: insertErr.message }, 500);
    }

    console.log('log-login: recorded sign-in for user', userData.user.id, 'device=', deviceType, 'location=', city, country);
    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('log-login: unhandled error:', message);
    return json({ ok: false, error: message }, 500);
  }
});

