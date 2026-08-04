-- Personalized welcome flow: commissioner sets a real name when inviting
-- someone, and they see "Welcome, {name}!" exactly once on their first
-- login instead of the generic app title.

alter table allowed_emails add column if not exists default_display_name text;
alter table users add column if not exists welcomed_at timestamptz;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_default_name text;
begin
  select default_display_name into v_default_name
  from allowed_emails
  where lower(email) = lower(new.email);

  insert into public.users (id, email, display_name, role)
  values (new.id, new.email, coalesce(v_default_name, split_part(new.email, '@', 1)), 'participant');
  return new;
end;
$function$;

create or replace function public.mark_welcomed()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update users set welcomed_at = now() where id = auth.uid() and welcomed_at is null;
end;
$function$;

grant execute on function public.mark_welcomed() to authenticated;
