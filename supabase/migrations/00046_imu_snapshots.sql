-- Snapshots: a stretch of trail kept as a reference — made from one event
-- of one session (a corner, a jump, a rough section, a brake) — so that
-- every pass through it, in any recording, can be found and compared. See
-- src/lib/imu/snapshot.ts for what a Snapshot is and how a pass is found.
--
-- The row holds only the DEFINITION: the two gates (position, direction of
-- travel, half-width) and the reference pass's time between them. Nothing
-- measured is stored — passes and their figures are read from the files
-- every time, so an improved algorithm reaches every Snapshot at once, and
-- a session imported tomorrow shows up in the Snapshots it passes without
-- any job running. The reference is the pass the Snapshot was made from
-- (decided 2026-09-10); if that session is deleted the reference is
-- released rather than the Snapshot removed — the place is still there.
create table if not exists imu_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- curve · jump · rough_section · braking (SnapshotKind).
  kind text not null,
  -- SnapshotDefinition: { kind, entry, exit, referenceDurationMs }.
  definition jsonb not null,
  reference_session_id uuid references imu_sessions(id) on delete set null,
  -- When the reference pass crossed each gate, ms into that session.
  reference_entry_ms integer not null,
  reference_exit_ms integer not null,
  created_at timestamptz not null default now()
);

create index if not exists imu_snapshots_user_idx
  on imu_snapshots (user_id, created_at desc);

alter table imu_snapshots enable row level security;

create policy "imu_snapshots_select_own" on imu_snapshots
  for select using ((select auth.uid()) = user_id);

create policy "imu_snapshots_insert_own" on imu_snapshots
  for insert with check ((select auth.uid()) = user_id);

create policy "imu_snapshots_update_own" on imu_snapshots
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "imu_snapshots_delete_own" on imu_snapshots
  for delete using ((select auth.uid()) = user_id);
