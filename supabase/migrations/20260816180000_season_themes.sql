-- Season theme planning: commissioner plans a theme per week_number for a
-- whole season at once, ahead of any actual `weeks` rows existing for
-- those weeks (weeks are created just-in-time, confirmed empty for the
-- real 2026 season right now). Keyed on (season_id, week_number) rather
-- than week_id so planning isn't blocked on the week already being built.
--
-- Reveal rule: participants only see a theme once a week with that
-- season_id + week_number exists AND is no longer 'upcoming' -- i.e. once
-- picks open for it (matches the same "picks open" moment as the
-- Activate Week action elsewhere in the app). Stays visible after the
-- week completes too, consistent with how past weeks stay browsable
-- elsewhere (WeekSelector, standings, etc). Commissioner always sees
-- everything, including themes for weeks that don't exist yet.

create table public.season_themes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_number integer not null,
  theme text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, week_number)
);

alter table public.season_themes enable row level security;

create policy "commissioner manages season themes"
  on public.season_themes for all
  using (is_commissioner())
  with check (is_commissioner());

create policy "participants view revealed season themes"
  on public.season_themes for select
  using (
    exists (
      select 1 from weeks w
      where w.season_id = season_themes.season_id
        and w.week_number = season_themes.week_number
        and w.status <> 'upcoming'
    )
  );
