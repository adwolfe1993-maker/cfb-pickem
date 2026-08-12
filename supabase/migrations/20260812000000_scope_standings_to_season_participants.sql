-- Retroactively captures a fix applied live to production during beta
-- review, never committed here — closing that drift now.
--
-- get_week_standings joined public.users unconditionally, so every
-- system user (including people with zero connection to a given
-- season) showed up in that season's standings with a fabricated 0
-- score and a fake "dropped week." Confirmed via the beta: 3 users
-- (no season_profiles row, zero picks anywhere in the season) appeared
-- in the exported beta standings PNG as if they'd played and missed
-- every pick.
--
-- Participation is scoped to the SEASON, not the individual week: a
-- participant who skips a week still counts as playing it (0 score,
-- eligible as their drop week per charter 4.7) — they just don't show
-- at all if they never touched this season in the first place. This
-- distinction matters: an earlier, wrong first pass at this fix scoped
-- participation per-week instead, which incorrectly excluded partial
-- participants' skipped weeks from counting as played weeks at all.

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
    left join season_profiles sp on sp.user_id = u.id and sp.season_id = v_season_id
    where sp.user_id is not null
       or exists (
         select 1 from picks p
         join games g on g.id = p.game_id
         join weeks w2 on w2.id = g.week_id
         where p.user_id = u.id and w2.season_id = v_season_id
       );
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
    where sp.user_id is not null
       or exists (
         select 1 from picks p
         join games g on g.id = p.game_id
         join weeks w2 on w2.id = g.week_id
         where p.user_id = u.id and w2.season_id = v_season_id
       )
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
