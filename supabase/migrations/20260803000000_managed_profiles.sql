-- Managed profiles: lets one real login "contain" additional participant
-- profiles for people who share an inbox and can't get their own sign-in
-- code (e.g. a household email with no per-person aliasing support).
--
-- public.users.id has a hard FK to auth.users.id, so a managed profile
-- still needs a real (synthetic, never-logged-into) auth.users row to
-- exist — managed_by is what actually links it back to the real login
-- that's allowed to act on its behalf.

alter table users add column if not exists managed_by uuid references users(id);
create index if not exists idx_users_managed_by on users(managed_by) where managed_by is not null;

-- Extend every ownership check (picks, weekly_selections, season_profiles)
-- from "this is yours" to "this is yours, or you manage it."

alter policy "users can insert own picks" on picks
with check (
  (auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = picks.user_id))
  and exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time > now())
);

alter policy "users can update own picks" on picks
using (
  (auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = picks.user_id))
  and exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time > now())
);

alter policy "users can view own picks anytime" on picks
using (
  auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = picks.user_id)
);

alter policy "users can insert own selections" on weekly_selections
with check (
  auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = weekly_selections.user_id)
);

alter policy "users can update own selections" on weekly_selections
using (
  auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = weekly_selections.user_id)
);

alter policy "users can view own selections anytime" on weekly_selections
using (
  auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = weekly_selections.user_id)
);

alter policy "users manage own season_profile" on season_profiles
with check (
  auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = season_profiles.user_id)
);

alter policy "users update own season_profile" on season_profiles
using (
  auth.uid() = user_id or auth.uid() = (select managed_by from users where users.id = season_profiles.user_id)
);
