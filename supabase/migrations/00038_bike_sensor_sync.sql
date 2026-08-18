-- Sensor-based odometer sync (lab test, one account). A bike syncs via
-- Strava OR via a paired BLE speed sensor, never both — the CHECK is the
-- database's word on that, mirroring the form and the server action.
--
-- sensor_baseline_count is the sensor's cumulative wheel-revolution counter
-- as of the last sync (or pairing). A sync reads the current counter and
-- adds (current - baseline) × sensor_wheel_mm to the bike's total_km; a
-- current value BELOW the baseline means the sensor restarted (battery
-- swap) and contributes nothing.
alter table public.bikes
  add column sensor_name text,
  add column sensor_baseline_count bigint,
  add column sensor_wheel_mm integer,
  add column sensor_synced_at timestamptz;

alter table public.bikes
  add constraint bikes_single_sync_method
  check (strava_gear_id is null or sensor_name is null);
