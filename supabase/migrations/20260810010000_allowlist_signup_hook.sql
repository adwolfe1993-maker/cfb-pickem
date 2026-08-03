-- Restricts real self-service signup to pre-approved emails only, via
-- Supabase's "before user created" Auth Hook.
--
-- Supersedes the earlier invite-participant Edge Function's approach
-- (direct admin.createUser, immediate account creation): that flow didn't
-- match what was actually wanted — someone gets a link, enters their own
-- email, and does normal self-service login. The allowlist hook enables
-- exactly that self-service flow while still enforcing invite-only,
-- rather than the commissioner creating each account directly.
-- invite-participant is left in place (still commissioner-gated, no
-- harm), but nothing calls it anymore.
--
-- "Allow new users to sign up" is (re-)enabled at the project level for
-- this to work at all — the allowlist hook is what actually enforces
-- invite-only now, not that toggle.

create table if not exists public.allowed_emails (
  email text primary key,
  invited_by uuid references users(id),
  created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;

create policy "commissioner can manage allowed_emails"
on public.allowed_emails
for all
using (exists (select 1 from users where id = auth.uid() and role = 'commissioner'))
with check (exists (select 1 from users where id = auth.uid() and role = 'commissioner'));

-- security definer (not the default invoker) — otherwise this function,
-- when called by the supabase_auth_admin role during signup, can't
-- actually read allowed_emails and every signup attempt fails with a
-- permission error rather than a real allow/deny decision. Found via a
-- live test: the first version of this function used the default
-- (invoker) security and failed exactly this way.
create or replace function public.hook_restrict_signup_to_allowed_emails(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  incoming_email text;
  is_allowed int;
begin
  incoming_email := event->'user'->>'email';

  select count(*) into is_allowed
  from public.allowed_emails
  where lower(email) = lower(incoming_email);

  if is_allowed > 0 then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'This email has not been invited. Contact the commissioner for access.',
      'http_code', 403
    )
  );
end;
$$;

grant execute
  on function public.hook_restrict_signup_to_allowed_emails
  to supabase_auth_admin;

revoke execute
  on function public.hook_restrict_signup_to_allowed_emails
  from authenticated, anon, public;

-- Note: registering this as the actual "Before User Created" hook still
-- requires a one-time manual step in Authentication → Hooks in the
-- Supabase dashboard — that wiring isn't expressible in SQL.
