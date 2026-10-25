-- ============================================================================
-- 041: Direct Admin User Management in Database
--      Allows admin to create, edit, activate/deactivate, reset passwords,
--      and permanently delete users directly in PostgreSQL without requiring
--      external edge function deployments.
-- ============================================================================

-- Grant appropriate schema usage
grant usage on schema public to authenticated;
grant usage on schema extensions to authenticated;

-- ----------------------------------------------------------------------------
-- 1. fn_admin_create_user
-- Creates a new Supabase Auth user + profile with password so they can log in.
-- ----------------------------------------------------------------------------
create or replace function public.fn_admin_create_user(
  p_email text,
  p_password text,
  p_full_name text default null,
  p_is_admin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions', 'auth'
as $$
declare
  v_caller_id uuid;
  v_is_caller_admin boolean;
  v_user_id uuid;
  v_clean_email text;
  v_encrypted_pw text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select is_admin into v_is_caller_admin
  from public.profiles
  where id = v_caller_id;

  if not coalesce(v_is_caller_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Permission denied: Only administrators can create accounts');
  end if;

  v_clean_email := lower(trim(p_email));
  if v_clean_email is null or v_clean_email = '' or v_clean_email not like '%@%.%' then
    return jsonb_build_object('ok', false, 'error', 'Valid email address is required');
  end if;

  if p_password is null or length(trim(p_password)) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Password must be at least 6 characters');
  end if;

  -- Check if user already exists
  if exists (select 1 from auth.users where email = v_clean_email) then
    return jsonb_build_object('ok', false, 'error', 'A user with email ' || v_clean_email || ' already exists');
  end if;

  v_user_id := gen_random_uuid();
  v_encrypted_pw := crypt(trim(p_password), gen_salt('bf'));

  -- Insert into auth.users
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change,
    phone_change_token,
    email_change_token_current,
    email_change_confirm_status,
    is_sso_user
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    v_encrypted_pw,
    now(),
    null,
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', coalesce(p_full_name, split_part(v_clean_email, '@', 1))),
    false,
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    0,
    false
  );

  -- Insert into auth.identities
  begin
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_user_id,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
      'email',
      v_user_id::text,
      null,
      now(),
      now()
    ) on conflict do nothing;
  exception when others then
    -- Some Supabase versions manage identities automatically
  end;

  -- Ensure public.profiles is created/updated
  insert into public.profiles (
    id,
    email,
    full_name,
    is_admin,
    is_active,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_clean_email,
    coalesce(p_full_name, split_part(v_clean_email, '@', 1)),
    coalesce(p_is_admin, false),
    true,
    now(),
    now()
  ) on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_admin = excluded.is_admin,
    is_active = excluded.is_active,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'userId', v_user_id,
    'email', v_clean_email,
    'fullName', coalesce(p_full_name, split_part(v_clean_email, '@', 1))
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. fn_admin_set_user_active
-- Toggles active/deactivated status for a user.
-- ----------------------------------------------------------------------------
create or replace function public.fn_admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_caller_id uuid;
  v_is_caller_admin boolean;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select is_admin into v_is_caller_admin
  from public.profiles
  where id = v_caller_id;

  if not coalesce(v_is_caller_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Permission denied: Only administrators can modify accounts');
  end if;

  if p_user_id = v_caller_id then
    return jsonb_build_object('ok', false, 'error', 'You cannot deactivate your own admin account');
  end if;

  update public.profiles
  set is_active = coalesce(p_is_active, true),
      updated_at = now()
  where id = p_user_id;

  -- Also ban or unban in auth.users if ban_duration column exists
  begin
    update auth.users
    set banned_until = case when coalesce(p_is_active, true) then null else (now() + interval '100 years') end
    where id = p_user_id;
  exception when others then
    -- ignore if column differs
  end;

  return jsonb_build_object('ok', true, 'userId', p_user_id, 'is_active', coalesce(p_is_active, true));
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. fn_admin_update_user
-- Updates full name, email, phone, role, status, and optional new password.
-- ----------------------------------------------------------------------------
create or replace function public.fn_admin_update_user(
  p_user_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_mobile text default null,
  p_is_admin boolean default null,
  p_is_active boolean default null,
  p_new_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions', 'auth'
as $$
declare
  v_caller_id uuid;
  v_is_caller_admin boolean;
  v_clean_email text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select is_admin into v_is_caller_admin
  from public.profiles
  where id = v_caller_id;

  if not coalesce(v_is_caller_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Permission denied: Only administrators can update users');
  end if;

  if p_email is not null and trim(p_email) <> '' then
    v_clean_email := lower(trim(p_email));
  end if;

  -- Update profiles table
  update public.profiles
  set full_name = coalesce(p_full_name, full_name),
      email = coalesce(v_clean_email, email),
      mobile = coalesce(p_mobile, mobile),
      is_admin = coalesce(p_is_admin, is_admin),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where id = p_user_id;

  -- Update auth.users email / metadata
  if v_clean_email is not null or p_full_name is not null then
    update auth.users
    set email = coalesce(v_clean_email, email),
        raw_user_meta_data = case
          when p_full_name is not null then coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', p_full_name)
          else raw_user_meta_data
        end,
        updated_at = now()
    where id = p_user_id;
  end if;

  -- If a new password is provided
  if p_new_password is not null and length(trim(p_new_password)) >= 6 then
    update auth.users
    set encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
        updated_at = now()
    where id = p_user_id;
  end if;

  -- Update banned state if is_active provided
  if p_is_active is not null then
    begin
      update auth.users
      set banned_until = case when p_is_active then null else (now() + interval '100 years') end
      where id = p_user_id;
    exception when others then
    end;
  end if;

  return jsonb_build_object('ok', true, 'userId', p_user_id);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. fn_admin_delete_user
-- Permanently deletes a user from auth.users and profiles with email confirmation.
-- ----------------------------------------------------------------------------
create or replace function public.fn_admin_delete_user(
  p_user_id uuid,
  p_confirm_email text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_caller_id uuid;
  v_is_caller_admin boolean;
  v_target_email text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select is_admin into v_is_caller_admin
  from public.profiles
  where id = v_caller_id;

  if not coalesce(v_is_caller_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Permission denied: Only administrators can delete users');
  end if;

  if p_user_id = v_caller_id then
    return jsonb_build_object('ok', false, 'error', 'You cannot delete your own admin account');
  end if;

  select email into v_target_email
  from public.profiles
  where id = p_user_id;

  if v_target_email is null then
    select email into v_target_email from auth.users where id = p_user_id;
  end if;

  if lower(trim(coalesce(p_confirm_email, ''))) <> lower(trim(coalesce(v_target_email, ''))) then
    return jsonb_build_object('ok', false, 'error', 'Confirmation email does not match user account email: ' || coalesce(v_target_email, 'unknown'));
  end if;

  -- Delete from auth.users (cascades to public.profiles, deals, payments, etc.)
  delete from auth.users where id = p_user_id;
  delete from public.profiles where id = p_user_id;

  return jsonb_build_object('ok', true, 'deletedUserId', p_user_id);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

-- Grant execution permissions on these functions to authenticated users
revoke execute on function public.fn_admin_create_user(text, text, text, boolean) from public, anon;
grant execute on function public.fn_admin_create_user(text, text, text, boolean) to authenticated;

revoke execute on function public.fn_admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.fn_admin_set_user_active(uuid, boolean) to authenticated;

revoke execute on function public.fn_admin_update_user(uuid, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.fn_admin_update_user(uuid, text, text, text, boolean, boolean, text) to authenticated;

revoke execute on function public.fn_admin_delete_user(uuid, text) from public, anon;
grant execute on function public.fn_admin_delete_user(uuid, text) to authenticated;
