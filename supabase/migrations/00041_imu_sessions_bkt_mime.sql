-- The IMU lab imports the logger's native .BKT binary alongside the JSON.
-- The bucket was JSON-only; the binary uploads as application/octet-stream.
-- Nothing else changes: the same {user_id}/{uuid}.<ext> path, the same
-- policies on the first folder, the same 25 MB ceiling — which in the binary
-- is about eighty minutes of riding at 416 Hz, against four in JSON.
update storage.buckets
set allowed_mime_types = array['application/json', 'application/octet-stream']
where id = 'imu-sessions';
