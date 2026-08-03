-- Wires season_profiles.team_name into actual use. The table (and its RLS
-- policies, extended earlier for managed profiles) already existed, but
-- nothing anywhere read or wrote team_name — every standings/history view
-- displayed users.display_name instead (set once at signup from the
-- email's local-part via handle_new_auth_user, never editable). Confirmed
-- via a full codebase search: zero references to team_name or
-- season_profiles outside the schema itself before this migration.
--
-- get_season_standings doesn't need its own change — it gets display_name
-- by passing through whatever get_week_standings returns, so fixing the
-- one function fixes both.

create or replace function public.get_week_standings(p_week_id uuid)
returns table(user_id uuid, display_name text, raw_score integer, hst_correct boolean, gotw_combined_diff integer, gotw_margin_diff integer, win_the_week boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_week_type week_type;
  v_season_id uuid;
  v_gotw_away_score int;
  v_gotw_home_score int;
  v_actual_margin int;
  v_actual_combined int;
  v_max_team_score int;
begin
  select w.week_type, w.season_id into v_week_type, v_season_id
  from weeks w where w.id = p_week_id;

  if v_week_type = 'conference_title' then
    return query
    select
      u.id,
      coalesce(sp.team_name, u.display_name),
      get_weekly_raw_score(u.id, p_week_id),
      null::boolean, null::int, null::int, false
    from public.users u
    left join season_profiles sp on sp.user_id = u.id and sp.season_id = v_season_id;
    return;
  end if;

  select g.away_score, g.home_score
  into v_gotw_away_score, v_gotw_home_score
  from games g
  where g.week_id = p_week_id and g.game_of_week = true
  limit 1;

  if v_gotw_away_score is not null and v_gotw_home_score is not null then
    v_actual_combined := v_gotw_away_score + v_gotw_home_score;
    v_actual_margin := v_gotw_home_score - v_gotw_away_score;
  end if;

  select max(greatest(coalesce(g.away_score, -1), coalesce(g.home_score, -1)))
  into v_max_team_score
  from games g
  where g.week_id = p_week_id and g.status <> 'canceled';

  return query
  with base as (
    select
      u.id as uid,
      coalesce(sp.team_name, u.display_name) as dname,
      get_weekly_raw_score(u.id, p_week_id) as raw_pts,
      ws.tiebreaker_team as tb_team,
      ws.gotw_away_score_prediction as pred_away,
      ws.gotw_home_score_prediction as pred_home
    from public.users u
    left join season_profiles sp on sp.user_id = u.id and sp.season_id = v_season_id
    left join weekly_selections ws on ws.user_id = u.id and ws.week_id = p_week_id
  ),
  scored as (
    select
      uid, dname, raw_pts,
      case
        when tb_team is null or v_max_team_score is null then null
        else exists (
          select 1 from games g
          where g.week_id = p_week_id and g.status <> 'canceled'
            and (
              (g.away_team = tb_team and g.away_score = v_max_team_score)
              or (g.home_team = tb_team and g.home_score = v_max_team_score)
            )
        )
      end as is_hst_correct,
      case
        when pred_away is null or pred_home is null or v_actual_combined is null then null
        else abs((pred_away + pred_home) - v_actual_combined)
      end as diff_combined,
      case
        when pred_away is null or pred_home is null or v_actual_margin is null then null
        else abs((pred_home - pred_away) - v_actual_margin)
      end as diff_margin
    from base
  ),
  ranked as (
    select *,
      rank() over (
        order by
          raw_pts desc,
          case when is_hst_correct then 0 else 1 end asc,
          diff_combined asc nulls last,
          diff_margin asc nulls last
      ) as rnk
    from scored
  )
  select uid, dname, raw_pts, is_hst_correct, diff_combined, diff_margin, (rnk = 1)
  from ranked;
end;
$function$;
