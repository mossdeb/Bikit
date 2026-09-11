-- A bike's setup on a run — fork and shock pressures and clicks, tyre
-- pressures — kept as its own row so five descents on one setup share one
-- row and the sixth, with two more clicks of rebound, gets a new one (see
-- src/lib/imu/setup.ts). Rows are IMMUTABLE by convention: a change makes a
-- new row copied from the last, so a session recorded on last week's setup
-- never comes to point at this week's values. A session points at its
-- setup by setup_id; a session imported for a bike inherits that bike's
-- latest setup (createImuSession), and "alterei algo" opens the form
-- prefilled. Decided 2026-09-11.
create table if not exists imu_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid references bikes(id) on delete set null,
  -- ImuSetupValues: { fork?, shock?, tires? } — pressures in psi, clicks
  -- counted from fully closed. Only what was filled in is present.
  values jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists imu_setups_bike_idx
  on imu_setups (bike_id, created_at desc);

alter table imu_setups enable row level security;

create policy "imu_setups_select_own" on imu_setups
  for select using ((select auth.uid()) = user_id);

create policy "imu_setups_insert_own" on imu_setups
  for insert with check ((select auth.uid()) = user_id);

create policy "imu_setups_delete_own" on imu_setups
  for delete using ((select auth.uid()) = user_id);

alter table imu_sessions
  add column if not exists setup_id uuid references imu_setups(id) on delete set null;
