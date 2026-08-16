-- Weekly Spotify playlist feature:
--  1. song_submissions -- optional, one per (user, week), editable any time
--     while the week is open (not locked to individual game kickoffs like
--     picks -- this is a fun extra, not a competitive pick).
--  2. playlists -- the historical archive of finished playlists the
--     commissioner has built (2023-present). Deliberately NOT tied via FK
--     to seasons/weeks: seasons 2023-2025 predate this app's schema and
--     have no corresponding rows there, so this is its own standalone
--     record keyed on (season_year, week_number). No Spotify API
--     integration -- commissioner pastes a link after curating manually,
--     same decision made earlier in the project for this feature.

create table public.song_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  song text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_id)
);

alter table public.song_submissions enable row level security;

-- Same managed_by pattern as picks/weekly_selections: a commissioner can
-- submit on behalf of a shared-inbox family member they manage.
create policy "users view own song submissions"
  on public.song_submissions for select
  using (
    auth.uid() = user_id
    or auth.uid() = (select managed_by from users where id = song_submissions.user_id)
  );

create policy "commissioner views all song submissions"
  on public.song_submissions for select
  using (is_commissioner());

create policy "users insert own song submissions while week open"
  on public.song_submissions for insert
  with check (
    (
      auth.uid() = user_id
      or auth.uid() = (select managed_by from users where id = song_submissions.user_id)
    )
    and exists (select 1 from weeks w where w.id = song_submissions.week_id and w.status = 'active')
  );

create policy "users update own song submissions while week open"
  on public.song_submissions for update
  using (
    (
      auth.uid() = user_id
      or auth.uid() = (select managed_by from users where id = song_submissions.user_id)
    )
    and exists (select 1 from weeks w where w.id = song_submissions.week_id and w.status = 'active')
  );

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null,
  week_number integer not null,
  theme text,
  spotify_url text not null,
  created_at timestamptz not null default now(),
  unique (season_year, week_number)
);

alter table public.playlists enable row level security;

create policy "anyone authenticated can view playlists"
  on public.playlists for select
  using (auth.role() = 'authenticated');

create policy "only commissioner can manage playlists"
  on public.playlists for all
  using (is_commissioner())
  with check (is_commissioner());
