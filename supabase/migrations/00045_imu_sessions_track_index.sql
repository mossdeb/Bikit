-- Where a session went, small enough to keep on the row: the GPS track
-- simplified to a few hundred points plus its bounding box (see
-- buildTrackIndex in src/lib/imu/snapshot.ts). It is what lets a Snapshot —
-- a stretch of trail kept as a reference — ask which sessions pass through
-- its gates WITHOUT downloading every file in the account: the outline says
-- which tracks come near, and only those files are fetched and read. Written
-- by the import, from the parsed file the browser already holds; null for a
-- recording without a track. Never read for figures — those always come from
-- the file, so a better algorithm reaches every session.
alter table imu_sessions
  add column if not exists track_index jsonb;
