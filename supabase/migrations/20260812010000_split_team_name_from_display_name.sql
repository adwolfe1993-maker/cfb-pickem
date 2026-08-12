-- Standings previously collapsed to a single "display_name" that was
-- team_name if set, else the real name — losing whichever one wasn't
-- shown. The standings view has historically shown both together, so
-- this splits it into two fields: display_name is now always the real
-- name, and a new team_name column carries the (nullable) team name
-- separately. The frontend decides how to combine them.

drop function if exists public.get_week_standings(uuid);

create function public.get_week_standings(p_week_id uuid)
returns table(user_id uuid, display_name text, team_name text, raw_score integer, hst_correct boolean, gotw_combined_diff integer, gotw_margin_diff integer, win_the_week boolean)
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
      u.display_name,
      sp.team_name,
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
      u.display_name as rname,
      sp.team_name as tname,
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
      uid, rname, tname, raw_pts,
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
  select uid, rname, tname, raw_pts, is_hst_correct, diff_combined, diff_margin, (rnk = 1)
  from ranked;
end;
$function$;

drop function if exists public.get_season_standings(uuid);

create function public.get_season_standings(p_season_id uuid)
returns table(user_id uuid, display_name text, team_name text, weeks_completed integer, gross_score integer, dropped_week_id uuid, dropped_week_name text, dropped_week_score integer, net_score integer, weeks_won integer, tiebreaker_avg numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with played_weeks as (
    select id as wk_id, name as wk_name, week_number as wk_num, week_type as wk_type
    from weeks
    where season_id = p_season_id and status = 'complete'
  ),
  week_contributions as (
    select
      pw.wk_id, pw.wk_name, pw.wk_num, pw.wk_type,
      ws.user_id as uid,
      ws.display_name as dname,
      ws.team_name as tname,
      (ws.raw_score + case when ws.win_the_week then 1 else 0 end) as wk_score,
      ws.win_the_week as won_week
    from played_weeks pw
    cross join lateral get_week_standings(pw.wk_id) ws
  ),
  gross as (
    select uid, dname, tname,
      count(*)::int as weeks_done,
      sum(wk_score)::int as total_score,
      sum(case when won_week then 1 else 0 end)::int as wins
    from week_contributions
    group by uid, dname, tname
  ),
  droppable as (
    select uid, wk_id, wk_name, wk_score,
      row_number() over (partition by uid order by wk_score asc, wk_num asc) as rn
    from week_contributions
    where wk_type = 'standard'
  ),
  dropped as (
    -- Drop-week only applies once at least 2 weeks are complete — dropping
    -- someone's *only* data point after Week 1 would misleadingly zero out
    -- an otherwise decent week. Charter §4.7 frames this as an end-of-season
    -- concept; this guard keeps it from firing prematurely on a 1-week sample.
    select d.uid, d.wk_id, d.wk_name, d.wk_score
    from droppable d
    join gross g on g.uid = d.uid
    where d.rn = 1 and g.weeks_done >= 2
  ),
  tiebreaker_points as (
    select
      ws.user_id as uid,
      case
        when g.away_team = ws.tiebreaker_team then g.away_score
        when g.home_team = ws.tiebreaker_team then g.home_score
        else null
      end as team_score
    from weekly_selections ws
    join played_weeks pw on pw.wk_id = ws.week_id
    left join games g on g.week_id = ws.week_id
      and (g.away_team = ws.tiebreaker_team or g.home_team = ws.tiebreaker_team)
      and g.status = 'final'
    where ws.tiebreaker_team is not null
  ),
  tb_avg as (
    select uid, avg(team_score) as avg_pts
    from tiebreaker_points
    where team_score is not null
    group by uid
  )
  select
    g.uid, g.dname, g.tname, g.weeks_done, g.total_score,
    d.wk_id, d.wk_name, d.wk_score,
    (g.total_score - coalesce(d.wk_score, 0))::int,
    g.wins,
    tb.avg_pts
  from gross g
  left join dropped d on d.uid = g.uid
  left join tb_avg tb on tb.uid = g.uid;
end;
$function$;
