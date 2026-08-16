-- get_week_pick_status (the "Who's Picked" roster, /picks/[weekId]/status)
-- selected from public.users with no participation filter at all -- every
-- account in the whole system, across every season, would show up on this
-- list for any given week, marked incomplete. Same class of bug already
-- found and fixed in get_week_standings/get_season_standings (phantom
-- Anna/Jack/Adah during the beta, see 20260812033111/033352) -- this
-- function was missed in that pass since it wasn't part of the
-- standings/scoring surface being audited then. Found during a full
-- post-beta bug-hunt pass, applied live and confirmed against real beta
-- data (Anna/Jack/Adah correctly dropped from the roster) before writing
-- this file.
--
-- Fix: same season-scoped participation filter already proven correct
-- elsewhere -- show a user if they have a season_profiles row for this
-- week's season, OR have submitted any pick anywhere in this season.

CREATE OR REPLACE FUNCTION public.get_week_pick_status(p_week_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, is_complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_week_type week_type;
  v_season_id uuid;
  v_pickable_game_count int;
  v_gotw_exists boolean;
begin
  select w.week_type, w.season_id into v_week_type, v_season_id from weeks w where w.id = p_week_id;

  select count(*) into v_pickable_game_count
  from games g
  where g.week_id = p_week_id and g.status <> 'canceled';

  select exists(
    select 1 from games g where g.week_id = p_week_id and g.game_of_week = true
  ) into v_gotw_exists;

  return query
  select
    u.id as user_id,
    u.display_name,
    case
      when v_week_type = 'conference_title' then
        (
          select count(*) from picks p join games g on g.id = p.game_id
          where p.user_id = u.id and g.week_id = p_week_id
            and g.status <> 'canceled' and p.picked_team is not null
        ) = v_pickable_game_count
        and
        (
          select count(*) from picks p join games g on g.id = p.game_id
          where p.user_id = u.id and g.week_id = p_week_id
            and g.status <> 'canceled' and p.confidence_points is not null
        ) = v_pickable_game_count
        and exists (
          select 1 from weekly_selections ws
          where ws.user_id = u.id and ws.week_id = p_week_id and ws.tiebreaker_team is not null
        )
      else
        (
          select count(*) from picks p join games g on g.id = p.game_id
          where p.user_id = u.id and g.week_id = p_week_id
            and g.status <> 'canceled' and p.picked_team is not null
        ) = v_pickable_game_count
        and exists (
          select 1 from picks p join games g on g.id = p.game_id
          where p.user_id = u.id and g.week_id = p_week_id and p.is_double_or_nothing = true
        )
        and exists (
          select 1 from weekly_selections ws
          where ws.user_id = u.id and ws.week_id = p_week_id and ws.tiebreaker_team is not null
        )
        and (
          not v_gotw_exists
          or exists (
            select 1 from weekly_selections ws
            where ws.user_id = u.id and ws.week_id = p_week_id
              and ws.gotw_away_score_prediction is not null
              and ws.gotw_home_score_prediction is not null
          )
        )
    end as is_complete
  from public.users u
  where exists (
    select 1 from season_profiles sp where sp.user_id = u.id and sp.season_id = v_season_id
  )
  or exists (
    select 1 from picks p
    join games g on g.id = p.game_id
    join weeks w2 on w2.id = g.week_id
    where p.user_id = u.id and w2.season_id = v_season_id
  );
end;
$function$;
