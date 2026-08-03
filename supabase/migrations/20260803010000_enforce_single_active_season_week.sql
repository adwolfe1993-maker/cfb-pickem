-- Enforces at most one active season, and at most one active week per
-- season, at the database level — the place nothing can bypass it,
-- including future code we haven't written yet.
--
-- Found via a real incident: activating a beta week also activates its
-- season (existing behavior), and with two seasons simultaneously active,
-- /picks' redirect logic (select ... where status = 'active' limit 1, no
-- order by) picked whichever one Postgres happened to return first —
-- which sent a commissioner-testing session into the real "2026" season's
-- Week 1 instead of the intended beta week. A better ORDER BY would only
-- have picked a *nicer* arbitrary winner; this makes the ambiguous state
-- impossible to create in the first place.

create unique index if not exists one_active_season
  on seasons ((true))
  where status = 'active';

create unique index if not exists one_active_week_per_season
  on weeks (season_id)
  where status = 'active';
