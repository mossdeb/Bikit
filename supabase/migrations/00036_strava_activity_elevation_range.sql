-- The vertical a ride moved through, so gravity riding stops scoring zero on
-- the one factor that describes it.
--
-- Ride Load weights elevation at 30% for Downhill and 40% for Enduro, and the
-- number feeding it was Strava's total_elevation_gain — which counts CLIMBING.
-- A shuttled or lifted run climbs nothing: the van climbs. So the ride forfeit
-- the whole of that weight, on exactly the modalities where going down is what
-- wears the bike out.
--
-- elev_high minus elev_low is the vertical range of the ride. For a top-to-
-- bottom run that is the descent, near enough. For a lap it equals the climb.
-- It is a lower bound on total descent — a rolling lap descends more than its
-- range — which is why the engine takes max(climb, range) rather than swapping
-- one for the other: no ride can score lower than it did, and a day with three
-- climbs keeps the 1800 m it earned instead of dropping to the 600 m of its
-- range.
--
-- Nullable, like everything since 00033. Null means a row written before this
-- column existed, and the engine falls back to the climb alone.
alter table strava_activities
  add column if not exists elev_high_m numeric,
  add column if not exists elev_low_m numeric;

comment on column strava_activities.elev_high_m is
  'Highest point of the ride. With elev_low_m gives the vertical range, which is what a shuttled descent has instead of a climb.';
comment on column strava_activities.elev_low_m is
  'Lowest point of the ride. See elev_high_m.';
