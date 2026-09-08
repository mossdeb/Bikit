-- A mounting orientation the session did not record but inherits: the
-- logger's two-step calibration (firmware V13.5's ORI1 record — up, front and
-- left in the sensor's frame) copied from a session that has it onto the
-- sessions recorded before it existed, with the sensor in the same place on
-- the bike. JSON, because it is the parsed record plus where it came from,
-- and it is read by one client component and written by one action. A file
-- that carries its own ORI1 wins over this column.
alter table imu_sessions
  add column if not exists mount_orientation jsonb;
