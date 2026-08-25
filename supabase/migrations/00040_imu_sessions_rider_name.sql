-- Who rode the recording. Nullable and additive: every session imported
-- before this column exists keeps reading exactly as it did, with no rider
-- rather than a wrong one. Free text, like the rest of the lab's metadata —
-- the rider is whoever the person importing says it was, not a user id: the
-- sensor can be strapped to someone else's bike and someone else's ride.
alter table imu_sessions add column if not exists rider_name text;
