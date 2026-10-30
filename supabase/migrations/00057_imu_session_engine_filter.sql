-- The motorbike's engine noise filter (2026-10-30): a choice per session, off
-- by default and only ever set by hand, so no bicycle's reading can change.
alter table imu_sessions
  add column if not exists engine_filter boolean not null default false;
