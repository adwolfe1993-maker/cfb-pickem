-- Two of the three V1 push notification types (charter Section 5.1) were
-- never actually implemented — only "Picks are open" exists, wired to the
-- commissioner manually clicking Publish Week. "1 hour to kickoff" and
-- "All games finished" had no cron job, no trigger, nothing. Confirmed by
-- grepping the whole codebase for send-notification call sites: there's
-- exactly one, in the Publish Week handler.
--
-- This adds both missing jobs, following the exact fetch-cadence pattern
-- already established by poll_cfbd_fetch/poll_mlb_fetch (20260802000000):
-- SECURITY DEFINER function on a pg_cron schedule, dispatched via pg_net.
-- Unlike the score-polling jobs, these don't need a matching "process" step
-- — we don't care about the notification API's response body, just that
-- the request went out, so a single fire-and-forget function per job is
-- enough.
--
-- IMPORTANT — manual step required before these will actually work:
-- Both functions read a service-role key from Vault (same pattern as the
-- existing cfbd_api_key secret used by poll_cfbd_fetch) so pg_net can
-- authenticate to the send-notification edge function as a trusted system
-- caller. I could not confirm live whether this secret already exists
-- (Supabase connection was unavailable while writing this). Check via the
-- SQL editor:
--
--   select name from vault.decrypted_secrets;
--
-- If 'service_role_key' isn't listed, add it (Project Settings -> API for
-- the actual key value — never paste it into chat or commit it anywhere):
--
--   select vault.create_secret('<your service_role key>', 'service_role_key');
--
-- If it already exists under a different name, update the two
-- `where name = 'service_role_key'` lookups below to match before applying.

alter table public.weeks
  add column if not exists kickoff_reminder_sent_at timestamptz,
  add column if not exists all_games_finished_notified_at timestamptz;

create or replace function public.notify_kickoff_reminder()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_week record;
  v_service_key text;
  v_sent int := 0;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets where name = 'service_role_key';

  if v_service_key is null then
    raise notice 'service_role_key not found in Vault — skipping kickoff reminder check';
    return 0;
  end if;

  -- "First game of the week" per charter 5.1 — MIN(kickoff_time) across
  -- that week's non-canceled games, not every game individually.
  for v_week in
    select w.id, w.name, min(g.kickoff_time) as first_kickoff
    from weeks w
    join games g on g.week_id = w.id
    where w.status = 'active'
      and w.kickoff_reminder_sent_at is null
      and g.status <> 'canceled'
    group by w.id, w.name
    having min(g.kickoff_time) <= now() + interval '1 hour'
       and min(g.kickoff_time) > now()
  loop
    perform net.http_post(
      url := 'https://sscippvvqxbrizqisfeg.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'title', '1 hour to kickoff',
        'body', v_week.name || ' kicks off in about an hour — get your picks in!'
      ),
      timeout_milliseconds := 10000
    );

    update weeks set kickoff_reminder_sent_at = now() where id = v_week.id;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$function$;

create or replace function public.notify_all_games_finished()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_week record;
  v_service_key text;
  v_sent int := 0;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets where name = 'service_role_key';

  if v_service_key is null then
    raise notice 'service_role_key not found in Vault — skipping all-games-finished check';
    return 0;
  end if;

  -- Deliberately independent of weeks.status = 'complete', which is a
  -- separate, later, manual commissioner action (handleCompleteWeek in the
  -- commissioner UI — e.g. "verify standings look correct" per the charter's
  -- Saturday-night workflow step). This should fire as soon as scoring
  -- itself is done, not whenever the commissioner gets around to reviewing.
  for v_week in
    select w.id, w.name
    from weeks w
    where w.status = 'active'
      and w.all_games_finished_notified_at is null
      and exists (select 1 from games g where g.week_id = w.id and g.status <> 'canceled')
      and not exists (
        select 1 from games g
        where g.week_id = w.id
          and g.status not in ('final', 'canceled')
      )
  loop
    perform net.http_post(
      url := 'https://sscippvvqxbrizqisfeg.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'title', 'All games finished',
        'body', v_week.name || ' is all wrapped up — check the standings!'
      ),
      timeout_milliseconds := 10000
    );

    update weeks set all_games_finished_notified_at = now() where id = v_week.id;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$function$;

-- 5-minute cadence (finer than the 15-minute score-polling jobs) so the
-- kickoff reminder lands reasonably close to the actual T-60-minute mark
-- rather than drifting up to 15 minutes late.
select cron.schedule('notify-kickoff-reminder', '*/5 * * * *', $$select notify_kickoff_reminder()$$)
where not exists (select 1 from cron.job where jobname = 'notify-kickoff-reminder');

select cron.schedule('notify-all-games-finished', '*/5 * * * *', $$select notify_all_games_finished()$$)
where not exists (select 1 from cron.job where jobname = 'notify-all-games-finished');
