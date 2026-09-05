-- The PIN of each BIKIT logger, per account. The device asks for it on every
-- BLE connection (it forgets at disconnect), and the owner opens the lab from
-- a laptop and from a phone — so the PIN lives with the account and not with
-- one browser. Keyed by the device's advertised name (BIKIT-176D), which is
-- known before authentication; the chip uid is not.
--
-- Stored as text. It is a six-digit device PIN behind RLS, not a password to
-- anything else: the threat model is a saved Wi-Fi key, and the lab is
-- owner-only. If the lab ever opens to other accounts, encrypt here first.
create table if not exists imu_device_pins (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null,
  pin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_name)
);

alter table imu_device_pins enable row level security;

create policy "imu_device_pins_select_own" on imu_device_pins
  for select using ((select auth.uid()) = user_id);

create policy "imu_device_pins_insert_own" on imu_device_pins
  for insert with check ((select auth.uid()) = user_id);

create policy "imu_device_pins_update_own" on imu_device_pins
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "imu_device_pins_delete_own" on imu_device_pins
  for delete using ((select auth.uid()) = user_id);
