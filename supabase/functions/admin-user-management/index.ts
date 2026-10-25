// admin-user-management - the one Edge Function in this project that can
// create, deactivate, reactivate, or permanently delete a real Supabase
// Auth account. This needs the service-role key (regular RLS-respecting
// clients have no way to touch auth.users), which is exactly why it can
// only ever live in an Edge Function, never in frontend JS.
//
// Every action re-verifies the CALLER is an admin on every single call
// (never trusts a prior check) using a separate, anon-key client built from
// the caller's own JWT - the service-role client is only ever constructed
// AFTER that check passes, and is never handed back to the caller in any
// form.
//
// Confirmed product decisions (see the plan's Context section):
//   - deactivate/reactivate is the default, fully reversible action (blocks
//     sign-in via Supabase Auth's own ban_duration, keeps every row the
//     user ever created).
//   - permanent delete exists too, but the frontend gates it behind typing
//     the user's email to confirm before this function is ever called -
//     deleting a real auth.users row cascades (existing "on delete cascade"
//     foreign keys) and permanently erases every deal/payment/contact/
//     message that user ever created. There is no undo.
//   - a newly created user's password is generated here, returned ONCE in
//     the response, and never stored anywhere - admin relays it manually
//     (no dependency on Supabase's own email deliverability).
//
// Deployed via: supabase functions deploy admin-user-management
// (no extra secrets beyond the two Supabase ones every Edge Function in
// this project already gets automatically: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ~100 years - Supabase Auth's ban_duration wants a Go duration string, not
// a special "forever" sentinel; this is the same trick every ban-forever
// implementation using this API resorts to. 'none' un-bans.
const BAN_FOREVER = '876000h';

function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  // Base64url is safe to display/copy and always satisfies Supabase's
  // default password rules (length + mixed character classes) - a plain
  // hex string would be long but single-case, which some project-level
  // password policies reject.
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, 'A').replace(/\//g, 'b').replace(/=/g, '') + '!9';
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

    const { data: profile, error: profileErr } = await callerClient.from('profiles').select('is_admin').eq('id', userData.user.id).single();
    if (profileErr || !profile?.is_admin) return json({ ok: false, error: 'Only an admin can do this.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY).auth.admin;
    const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (action === 'create') {
      const email = (body.email || '').trim();
      const fullName = (body.fullName || '').trim();
      const customPassword = (body.password || '').trim();
      const isAdmin = body.isAdmin === true;
      if (!email) return json({ ok: false, error: 'Email is required.' }, 400);
      const tempPassword = customPassword || generateTempPassword();
      const { data: created, error: createErr } = await admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (createErr) return json({ ok: false, error: createErr.message }, 400);
      if (created?.user?.id && (isAdmin || fullName)) {
        await serviceDb.from('profiles').update({
          is_admin: isAdmin,
          full_name: fullName || undefined,
        }).eq('id', created.user.id);
      }
      return json({ ok: true, userId: created.user?.id, email, tempPassword });
    }

    if (action === 'update') {
      const targetUserId = body.userId as string;
      const fullName = body.fullName;
      const email = body.email;
      const mobile = body.mobile;
      const isAdmin = body.isAdmin;
      const isActive = body.isActive;
      const newPassword = body.newPassword;

      if (!targetUserId) return json({ ok: false, error: 'userId is required.' }, 400);

      const profilePatch: Record<string, unknown> = {};
      if (fullName !== undefined) profilePatch.full_name = fullName;
      if (email !== undefined) profilePatch.email = email;
      if (mobile !== undefined) profilePatch.mobile = mobile;
      if (isAdmin !== undefined) profilePatch.is_admin = isAdmin;
      if (isActive !== undefined) profilePatch.is_active = isActive;

      if (Object.keys(profilePatch).length) {
        const { error: pErr } = await serviceDb.from('profiles').update(profilePatch).eq('id', targetUserId);
        if (pErr) return json({ ok: false, error: pErr.message }, 400);
      }

      const authPatch: Record<string, unknown> = {};
      if (email) authPatch.email = email;
      if (newPassword) authPatch.password = newPassword;
      if (isActive !== undefined) authPatch.ban_duration = isActive ? 'none' : BAN_FOREVER;
      if (fullName) authPatch.user_metadata = { full_name: fullName };

      if (Object.keys(authPatch).length) {
        const { error: aErr } = await admin.updateUserById(targetUserId, authPatch);
        if (aErr) return json({ ok: false, error: aErr.message }, 400);
      }

      return json({ ok: true, userId: targetUserId });
    }

    if (action === 'deactivate' || action === 'reactivate') {
      const targetUserId = body.userId as string;
      if (!targetUserId) return json({ ok: false, error: 'userId is required.' }, 400);
      if (targetUserId === userData.user.id) return json({ ok: false, error: 'You cannot deactivate your own account.' }, 400);
      const { error: banErr } = await admin.updateUserById(targetUserId, { ban_duration: action === 'deactivate' ? BAN_FOREVER : 'none' });
      if (banErr) return json({ ok: false, error: banErr.message }, 400);
      const { error: mirrorErr } = await serviceDb.from('profiles').update({ is_active: action === 'reactivate' }).eq('id', targetUserId);
      if (mirrorErr) return json({ ok: false, error: mirrorErr.message }, 400);
      return json({ ok: true });
    }

    if (action === 'delete') {
      const targetUserId = body.userId as string;
      const confirmEmail = (body.confirmEmail || '').trim().toLowerCase();
      if (!targetUserId) return json({ ok: false, error: 'userId is required.' }, 400);
      if (targetUserId === userData.user.id) return json({ ok: false, error: 'You cannot delete your own account.' }, 400);
      const { data: targetProfile } = await serviceDb.from('profiles').select('email').eq('id', targetUserId).single();
      if (!targetProfile || targetProfile.email?.toLowerCase() !== confirmEmail) {
        return json({ ok: false, error: 'Confirmation email does not match this user - nothing was deleted.' }, 400);
      }
      const { error: deleteErr } = await admin.deleteUser(targetUserId);
      if (deleteErr) return json({ ok: false, error: deleteErr.message }, 400);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: message }, 500);
  }
});
