-- The rider-sag calibration step's reading, per session (2026-10-27).
--
-- Firmware V18 writes a SAG1 record into every .BKT: the frame's gravity
-- with the rider on, from the logger's three-step calibration. The file
-- stays the source of truth; this column keeps what the setup's history
-- needs without downloading every file of a bike — the reading as the app
-- worked it out (pitch and roll in the bike's frame, ORI1) and the record's
-- own figures. Null for a session whose file has no SAG1, which is every
-- file before V18. Written at import, and on opening a session imported
-- before the column existed.
alter table imu_sessions
  add column if not exists rider_sag jsonb;
