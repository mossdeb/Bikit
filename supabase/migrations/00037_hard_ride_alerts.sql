-- The hard-ride alert claims live on the ride itself.
--
-- No new table and no claim function: the ride already has a row with a
-- primary key, so "has this one been announced on this channel" is a column
-- on it, and claiming is a single conditional update — `set ... where ... is
-- null returning *` is atomic on its own and hands the ride to exactly one
-- caller. The interval ledger needed an RPC because its key is a service
-- interval that many rides touch; a ride is announced once and never again.
--
-- Two columns and not one, because the channels claim at different moments:
-- push goes out on the Strava webhook seconds after the ride lands, and email
-- waits for the daily cron, which is where this project keeps email so that a
-- ride finished at 23:30 does not buzz an inbox.
--
-- A band-change trigger was explored instead and set aside: the index decays,
-- so catching a fall means evaluating daily, and a fall happens by not riding
-- — the alert would have announced rest as news.
alter table strava_activities
  add column if not exists hard_ride_push_at timestamptz,
  add column if not exists hard_ride_email_at timestamptz;

comment on column strava_activities.hard_ride_push_at is
  'When the hard-ride push was claimed for this ride. Null means unannounced; set once, never cleared.';
comment on column strava_activities.hard_ride_email_at is
  'When the hard-ride email was claimed for this ride. Claimed by the daily cron, not the webhook.';

-- The cron sweeps recent rides that still owe an email. Partial, so it indexes
-- only the handful that are actually pending rather than every ride ever.
create index if not exists strava_activities_hard_ride_email_pending_idx
  on strava_activities (activity_date desc)
  where hard_ride_email_at is null;
