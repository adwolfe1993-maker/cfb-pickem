-- Lightweight in-app bug/feedback reporting, ahead of real beta rollout
-- to ~30 people this weekend — a persistent, organized alternative to
-- scattered texts across three family groups.

create type feedback_status as enum ('open', 'resolved');

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  message text not null,
  status feedback_status not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "users can submit feedback"
on public.feedback
for insert
with check (auth.uid() = user_id);

create policy "users can view own feedback"
on public.feedback
for select
using (auth.uid() = user_id);

create policy "commissioner can view all feedback"
on public.feedback
for select
using (exists (select 1 from users where id = auth.uid() and role = 'commissioner'));

create policy "commissioner can update feedback status"
on public.feedback
for update
using (exists (select 1 from users where id = auth.uid() and role = 'commissioner'))
with check (exists (select 1 from users where id = auth.uid() and role = 'commissioner'));
