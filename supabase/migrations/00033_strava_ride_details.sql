-- The ledger keeps what it always kept; these four columns are the ride
-- itself, captured now because the Strava payload already carries them and
-- a column added later starts empty — the API can be re-walked, but only
-- for connections still alive, and never past the rate limit.
--
-- No average_speed: it is distance_km / moving_time_hours, both already on
-- the row. A third number that has to agree with two others is a chance to
-- disagree.
alter table strava_activities
  add column if not exists activity_date timestamptz,
  add column if not exists activity_name text,
  add column if not exists elevation_gain_m numeric,
  add column if not exists elapsed_time_hours numeric;

comment on column strava_activities.activity_date is
  'Strava start_date — the UTC instant the ride began, not the local wall clock.';
comment on column strava_activities.elapsed_time_hours is
  'Total elapsed including stops; moving_time_hours is what counts towards wear.';

-- Two jobs, one index. The FK has cascaded deletes since 00014 with nothing
-- to scan by, so removing a bike (or a user, which cascades through bikes)
-- reads the whole table; and "this bike's rides, newest first" is the query
-- a ride history would ask. The bike_id prefix serves the first, the pair
-- serves the second.
create index if not exists strava_activities_bike_id_activity_date_idx
  on strava_activities (bike_id, activity_date desc);
