-- Timed tracks: a start line and a finish line fixed on the trail, so that
-- every run down the same track is timed between the same two lines,
-- whatever its trim and whichever day it was ridden (2026-10-24). See
-- src/lib/imu/timed-track.ts.
--
-- Like a Snapshot (00046) the row holds only the DEFINITION — the two gates
-- (position, direction of travel, half-width) and the reference run's time
-- between them; the runs are found in the files every time. The reference
-- session is where the lines were drawn from; if it is deleted the track
-- stays, since the trail is still there.
create table if not exists imu_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- TimedTrackDefinition: { entry (the start), exit (the finish),
  -- referenceDurationMs }.
  definition jsonb not null,
  reference_session_id uuid references imu_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists imu_tracks_user_idx
  on imu_tracks (user_id, created_at desc);

alter table imu_tracks enable row level security;

create policy "imu_tracks_select_own" on imu_tracks
  for select using ((select auth.uid()) = user_id);

create policy "imu_tracks_insert_own" on imu_tracks
  for insert with check ((select auth.uid()) = user_id);

create policy "imu_tracks_update_own" on imu_tracks
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "imu_tracks_delete_own" on imu_tracks
  for delete using ((select auth.uid()) = user_id);
