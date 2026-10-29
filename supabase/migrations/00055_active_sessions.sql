-- One signed-in session per account (2026-10-29): the account's latest
-- sign-in, by the session id its tokens carry. A sign-in writes it and ends
-- the account's other sessions; every request checks its own session
-- against it and is signed out when it is not the latest
-- (src/lib/active-session.ts).
create table if not exists active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  updated_at timestamptz not null default now()
);

alter table active_sessions enable row level security;

create policy "active_sessions_select_own" on active_sessions
  for select using ((select auth.uid()) = user_id);

create policy "active_sessions_insert_own" on active_sessions
  for insert with check ((select auth.uid()) = user_id);

create policy "active_sessions_update_own" on active_sessions
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
