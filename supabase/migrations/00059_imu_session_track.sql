-- The one timed track a run belongs to (by request, 2026-11-15). Until now a
-- run counted on every track whose lines it crossed, so one ride could sit in
-- "Casa DH race" and "Casa Velha" at once. Each run now keeps a single track:
-- chosen in the browser from the tracks it passes (src/lib/imu/timed-track.ts,
-- pickTrack), at import and whenever the run is read, or set by hand.
--
-- `track_by_hand` keeps a choice made by the rider from being replaced by the
-- automatic one. A deleted track empties the field (on delete set null), and
-- the run takes the most similar of the tracks left the next time it is read.
alter table imu_sessions
  add column if not exists track_id uuid references imu_tracks (id) on delete set null,
  add column if not exists track_by_hand boolean not null default false;

create index if not exists imu_sessions_track_id_idx on imu_sessions (track_id);
