-- Whether a session's trim came from a timed track's start and finish lines
-- (src/lib/imu/timed-track.ts) rather than from the scissors (2026-10-24).
-- A run trimmed by the lines goes back to the whole recording once it
-- passes no track any more — a track deleted or redrawn elsewhere — while a
-- trim set by hand stays.
alter table imu_sessions
  add column if not exists trim_by_track boolean not null default false;
