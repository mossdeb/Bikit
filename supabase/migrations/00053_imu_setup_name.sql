-- A setup's own name (2026-10-27): "Setup E" is a letter by first use;
-- a rider may call it something ("Race", "Molhado"). Optional, set from
-- the bike's Pro page; null keeps the letter.
alter table imu_setups
  add column if not exists name text;
