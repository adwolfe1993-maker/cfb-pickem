-- Auto-suggested emoji to accompany a theme, kept as a plain editable
-- column (not a computed value) so the commissioner can always override
-- a bad keyword-match guess. Nullable -- historical playlist entries
-- added before this migration won't have one, callers fall back to a
-- generic 🎵.

alter table public.season_themes add column if not exists emoji text;
alter table public.playlists add column if not exists emoji text;
