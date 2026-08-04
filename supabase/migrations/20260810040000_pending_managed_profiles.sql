-- Lets the commissioner pre-create a managed profile at invite time,
-- before the managing person's own account exists yet — it gets linked
-- automatically on their first login, with nothing for them to do.

alter table allowed_emails add column if not exists pending_managed_profile_name text;
alter table allowed_emails add column if not exists pending_managed_profile_user_id uuid references users(id);

create or replace function public.claim_pending_managed_profile()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pending_id uuid;
  v_caller_email text;
begin
  select email into v_caller_email from users where id = auth.uid();

  select pending_managed_profile_user_id into v_pending_id
  from allowed_emails
  where lower(email) = lower(v_caller_email)
    and pending_managed_profile_user_id is not null;

  if v_pending_id is not null then
    update users
    set managed_by = auth.uid()
    where id = v_pending_id
      and managed_by is null;
  end if;
end;
$function$;

grant execute on function public.claim_pending_managed_profile() to authenticated;
