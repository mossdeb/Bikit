-- Groups of IMU sessions: one outing, one place, one day — "Fonte Ferrea ·
-- 6.9.26" — under which the recordings of that day are listed together and
-- folded away as one. The group is only a name and a day: the same name on
-- another day is another group, because the rider's question is "what did I
-- record at Fonte Ferrea on the 6th", not "everything ever at Fonte Ferrea".
--
-- Sessions point at their group; a deleted group releases them (set null)
-- rather than taking the recordings with it. A group can be empty — it is
-- deleted by hand, never swept.
create table if not exists imu_session_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- The rider's local day at import, not a timestamp: two imports at 23:50
  -- and 00:10 belong to the outing the rider was on, and only the browser
  -- knows which day that was.
  day date not null,
  created_at timestamptz not null default now(),
  unique (user_id, name, day)
);

create index if not exists imu_session_groups_user_idx
  on imu_session_groups (user_id, day desc, created_at desc);

alter table imu_session_groups enable row level security;

create policy "imu_session_groups_select_own" on imu_session_groups
  for select using ((select auth.uid()) = user_id);

create policy "imu_session_groups_insert_own" on imu_session_groups
  for insert with check ((select auth.uid()) = user_id);

create policy "imu_session_groups_update_own" on imu_session_groups
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "imu_session_groups_delete_own" on imu_session_groups
  for delete using ((select auth.uid()) = user_id);

alter table imu_sessions
  add column if not exists group_id uuid references imu_session_groups(id) on delete set null;

create index if not exists imu_sessions_group_id_idx on imu_sessions (group_id);
