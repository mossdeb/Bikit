-- What the athlete actually granted, as Strava reports it on the OAuth
-- redirect. Until now every connection had the same two read scopes and the
-- column would have been a constant; writing a maintenance note back to an
-- activity needs activity:write, which is asked for separately and can be
-- refused, so the app has to be able to tell the difference between "not
-- enabled" and "enabled but never authorised" instead of discovering it as
-- a 401 once a ride lands.
--
-- Null means a connection made before this column existed: read-only, since
-- activity:write was never requested.
alter table strava_connections
  add column if not exists scopes text;
