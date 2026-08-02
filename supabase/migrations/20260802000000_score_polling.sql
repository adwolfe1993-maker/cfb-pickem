-- Score polling: CFBD + MLB, via pg_cron + pg_net
--
-- CFBD half (poll_cfbd_fetch, poll_cfbd_process, cfbd_poll_requests, and the
-- cfbd-poll-fetch/cfbd-poll-process cron jobs) was discovered already live in
-- the database during Phase 5 with no corresponding git history — origin
-- unconfirmed. This migration backfills documentation for it and adds the
-- MLB equivalent alongside it, so neither half is ever "mystery
-- infrastructure" again.
--
-- Pattern: pg_cron fires a SECURITY DEFINER function every 15 minutes. The
-- "fetch" function finds distinct unresolved (provider, date/year+week)
-- pairs in active weeks and dispatches one async HTTP GET per pair via
-- pg_net, logging the request. The "process" function reads back any
-- responses that have landed, parses the games out, and updates `games`
-- rows by api_game_id. Split into two functions (rather than one) because
-- pg_net calls are async — there's nothing to process until the next tick.

-- ============================================================
-- CFBD (backfilled documentation — already live prior to this migration)
-- ============================================================

create table if not exists cfbd_poll_requests (
  request_id bigint primary key,
  cfbd_year integer not null,
  cfbd_week integer not null,
  created_at timestamp with time zone not null default now(),
  processed boolean not null default false
);
alter table cfbd_poll_requests enable row level security;

create or replace function poll_cfbd_fetch()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pair record;
  v_request_id bigint;
  v_count int := 0;
begin
  for v_pair in
    select distinct g.cfbd_year, g.cfbd_week
    from games g
    join weeks w on w.id = g.week_id
    where w.status = 'active'
      and g.cfbd_year is not null
      and g.cfbd_week is not null
      and g.status not in ('final', 'canceled')
  loop
    v_request_id := net.http_get(
      url := 'https://api.collegefootballdata.com/games?year=' || v_pair.cfbd_year
             || '&week=' || v_pair.cfbd_week || '&seasonType=regular',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cfbd_api_key')
      ),
      timeout_milliseconds := 10000
    );

    insert into cfbd_poll_requests (request_id, cfbd_year, cfbd_week)
    values (v_request_id, v_pair.cfbd_year, v_pair.cfbd_week);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

create or replace function poll_cfbd_process()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req record;
  v_game jsonb;
  v_updated int := 0;
begin
  for v_req in
    select cpr.request_id, r.content
    from cfbd_poll_requests cpr
    join net._http_response r on r.id = cpr.request_id
    where cpr.processed = false
      and r.status_code = 200
  loop
    for v_game in select * from jsonb_array_elements(v_req.content::jsonb)
    loop
      if (v_game->>'completed')::boolean = true then
        update games
        set
          away_score = (v_game->>'awayPoints')::int,
          home_score = (v_game->>'homePoints')::int,
          winner = case
            when (v_game->>'homePoints')::int > (v_game->>'awayPoints')::int
              then v_game->>'homeTeam'
            else v_game->>'awayTeam'
          end,
          status = 'final'
        where api_game_id = v_game->>'id'
          and status not in ('final', 'canceled');

        get diagnostics v_updated = row_count;
      end if;
    end loop;

    update cfbd_poll_requests set processed = true where request_id = v_req.request_id;
  end loop;

  return v_updated;
end;
$function$;

-- ============================================================
-- MLB (new — Phase 5 beta)
-- ============================================================

create table if not exists mlb_poll_requests (
  request_id bigint primary key,
  mlb_date text not null,
  created_at timestamp with time zone not null default now(),
  processed boolean not null default false
);
alter table mlb_poll_requests enable row level security;

create or replace function poll_mlb_fetch()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_date record;
  v_request_id bigint;
  v_count int := 0;
begin
  for v_date in
    select distinct g.mlb_date
    from games g
    join weeks w on w.id = g.week_id
    where w.status = 'active'
      and g.provider = 'mlb'
      and g.mlb_date is not null
      and g.status not in ('final', 'canceled')
  loop
    v_request_id := net.http_get(
      url := 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=R&date=' || v_date.mlb_date,
      timeout_milliseconds := 10000
    );

    insert into mlb_poll_requests (request_id, mlb_date)
    values (v_request_id, v_date.mlb_date);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

create or replace function poll_mlb_process()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req record;
  v_date_obj jsonb;
  v_game jsonb;
  v_state text;
  v_away_score int;
  v_home_score int;
  v_updated int := 0;
  v_this_updated int;
begin
  for v_req in
    select mpr.request_id, r.content
    from mlb_poll_requests mpr
    join net._http_response r on r.id = mpr.request_id
    where mpr.processed = false
      and r.status_code = 200
  loop
    for v_date_obj in select * from jsonb_array_elements((v_req.content::jsonb)->'dates')
    loop
      for v_game in select * from jsonb_array_elements(v_date_obj->'games')
      loop
        v_state := v_game->'status'->>'abstractGameState';
        v_away_score := (v_game->'teams'->'away'->>'score')::int;
        v_home_score := (v_game->'teams'->'home'->>'score')::int;

        if v_state = 'Live' then
          update games
          set
            away_score = v_away_score,
            home_score = v_home_score,
            status = 'in_progress'
          where api_game_id = (v_game->>'gamePk')
            and provider = 'mlb'
            and status not in ('final', 'canceled');

        elsif v_state = 'Final' then
          update games
          set
            away_score = v_away_score,
            home_score = v_home_score,
            winner = case when v_home_score > v_away_score then home_team else away_team end,
            status = 'final'
          where api_game_id = (v_game->>'gamePk')
            and provider = 'mlb'
            and status not in ('final', 'canceled');

          get diagnostics v_this_updated = row_count;
          v_updated := v_updated + v_this_updated;
        end if;
      end loop;
    end loop;

    update mlb_poll_requests set processed = true where request_id = v_req.request_id;
  end loop;

  return v_updated;
end;
$function$;

-- ============================================================
-- Cron registration (all four jobs; safe to re-run)
-- ============================================================

select cron.schedule('cfbd-poll-fetch', '*/15 * * * *', $$select poll_cfbd_fetch()$$)
where not exists (select 1 from cron.job where jobname = 'cfbd-poll-fetch');

select cron.schedule('cfbd-poll-process', '*/15 * * * *', $$select poll_cfbd_process()$$)
where not exists (select 1 from cron.job where jobname = 'cfbd-poll-process');

select cron.schedule('poll-mlb-fetch', '*/15 * * * *', $$select poll_mlb_fetch()$$)
where not exists (select 1 from cron.job where jobname = 'poll-mlb-fetch');

select cron.schedule('poll-mlb-process', '*/15 * * * *', $$select poll_mlb_process()$$)
where not exists (select 1 from cron.job where jobname = 'poll-mlb-process');
