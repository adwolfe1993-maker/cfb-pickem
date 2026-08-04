-- Lets a participant edit their own display_name (and any managed
-- profile's), alongside the existing per-season team_name editing.
-- Deliberately narrow, same reasoning as mark_welcomed(): a general
-- "users can update own row" policy would let someone edit their own role.

create or replace function public.update_display_name(p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() != p_user_id
     and auth.uid() != (select managed_by from users where id = p_user_id) then
    raise exception 'Not authorized to update this profile';
  end if;

  update users set display_name = p_display_name where id = p_user_id;
end;
$function$;

grant execute on function public.update_display_name(uuid, text) to authenticated;
