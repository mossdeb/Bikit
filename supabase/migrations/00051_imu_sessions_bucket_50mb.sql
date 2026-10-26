-- The imu-sessions bucket takes files up to 50 MB (was 25, 00039): a
-- recording left running for a morning — ~5 KB/s, so 25 MB is ~80 minutes —
-- was refused at import with "The object exceeded the maximum allowed size"
-- (2026-10-25). 50 MB is ~2 h 40 min.
update storage.buckets
  set file_size_limit = 52428800
  where id = 'imu-sessions';
