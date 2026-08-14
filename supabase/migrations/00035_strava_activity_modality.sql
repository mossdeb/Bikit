-- Ride Stress needs two things the ledger was not keeping.
--
-- sport_type: what Strava says the ride was. The Ride Stress model takes its
-- modality from the bike's type, not from here — Strava cannot tell an Enduro
-- from a Downhill, and the bike knows what it is. This is stored because the
-- payload already carries it and because the day the two disagree (a road
-- ride logged on the enduro bike) is the day the question gets asked, and by
-- then a column added late would be empty for every ride already synced.
--
-- utc_offset: seconds east of UTC, as Strava reports it for the ride. The
-- report lists rides by day, and the day someone rode is their day, not UTC's
-- — a ride that starts at 23:30 in Lisbon in August is already tomorrow in
-- UTC. Only the offset is stored, never start_date_local: the local clock is
-- activity_date plus this, and a second copy of a derived instant is a chance
-- for the two to disagree. Same reasoning that kept average_speed out in
-- 00033.
alter table strava_activities
  add column if not exists sport_type text,
  add column if not exists utc_offset integer;

comment on column strava_activities.sport_type is
  'Strava sport_type for the ride. Ride Stress reads modality from bikes.type instead — Strava has no Enduro/Downhill/XC.';
comment on column strava_activities.utc_offset is
  'Seconds east of UTC for this ride. Local wall clock = activity_date + this. start_date_local is deliberately not stored.';

-- Retention, revisited. 00033 shipped a delete-past-90-days policy, written
-- and switched off, on the grounds that no sync path re-presents an activity
-- older than 30 days and an unreachable row is safe to drop.
--
-- That is no longer true. Lifetime Ride Stress is the sum of every ride's
-- stress since the bike entered Bikit, so deleting a row makes a number the
-- user reads go DOWN, and Ride Intensity is a chain whose state lives in the
-- order those rows are in. The delete is now destructive to something on
-- screen, not just to a debugging trail.
--
-- What replaces it, if this table ever grows enough to need replacing, is
-- compaction rather than deletion: fold everything past the cutoff into one
-- checkpoint row per bike carrying the summed stress, the intensity value and
-- the date it had it. Ride Intensity only depends on the past through those
-- two numbers, so a checkpoint reproduces it exactly rather than approximating
-- it. src/lib/ride-stress.ts already accepts such a checkpoint; there is no
-- table and no job, because at ~0.1 KB a ride there is nothing to solve yet,
-- and compacting freezes each folded ride's stress at whatever the reference
-- values were that day — which is precisely what should stay unfrozen while
-- the model is still being tuned.
--
--   DO NOT delete from strava_activities. It is no longer only a ledger.
