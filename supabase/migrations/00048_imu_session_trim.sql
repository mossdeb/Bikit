-- A session's trim: the stretch of the recording that IS the run — the
-- descent without the walk to the top and the roll-out at the bottom — as
-- two instants on the file's own timeline, ms. Non-destructive: the file
-- in Storage is never rewritten, and every reader crops on load
-- (loadImuSession) and re-zeroes time at trim_start_ms, so the run opens
-- at 00:00. Null on both is "the whole recording". The stored summary
-- (duration, counts, track_index) is recomputed for the trimmed stretch by
-- the action that sets it, so the list and the comparisons read the run
-- and not the walk. Decided 2026-09-13.
alter table imu_sessions
  add column if not exists trim_start_ms integer,
  add column if not exists trim_end_ms integer,
  add constraint imu_sessions_trim_window check (
    (trim_start_ms is null and trim_end_ms is null)
    or (trim_start_ms >= 0 and trim_end_ms > trim_start_ms)
  );
