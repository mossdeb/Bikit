-- IMU lab sessions (lab tool, owner-only route). The raw recording lives in
-- Storage as the untouched JSON the sensor produced; this table holds only
-- the summary the session list needs, so listing never downloads a file.
-- Raw data is never rewritten — derived metrics are computed on read.
create table if not exists imu_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Optional: which bike carried the sensor. set null on delete rather than
  -- cascade — the recording outlives the bike it was strapped to.
  bike_id uuid references bikes(id) on delete set null,
  name text not null,
  -- Path inside the imu-sessions bucket: {user_id}/{session_id}.json. The
  -- user_id folder is the authorization mechanism, not housekeeping — the
  -- storage policies match on it.
  storage_path text not null,
  format text not null,
  duration_ms integer not null,
  sample_rate_hz numeric not null,
  sample_count integer not null,
  max_g numeric,
  event_count integer not null default 0,
  curve_count integer not null default 0,
  jump_count integer not null default 0,
  impact_count integer not null default 0,
  airtime_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists imu_sessions_user_id_idx on imu_sessions (user_id, created_at desc);

alter table imu_sessions enable row level security;

create policy "imu_sessions_select_own" on imu_sessions
  for select using ((select auth.uid()) = user_id);

create policy "imu_sessions_insert_own" on imu_sessions
  for insert with check ((select auth.uid()) = user_id);

create policy "imu_sessions_update_own" on imu_sessions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "imu_sessions_delete_own" on imu_sessions
  for delete using ((select auth.uid()) = user_id);

-- Private bucket for the raw files. 25 MB ceiling: a 20-minute session at
-- 200 Hz is ~24 MB of JSON, so the near future fits with margin. JSON only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imu-sessions', 'imu-sessions', false, 26214400, array['application/json'])
on conflict (id) do nothing;

-- Storage RLS: the first folder of the object path must be the caller's own
-- uid. The browser uploads and downloads directly — these policies, not our
-- server, are what stands between accounts.
create policy "imu_sessions_storage_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'imu-sessions' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "imu_sessions_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imu-sessions' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "imu_sessions_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imu-sessions' and (storage.foldername(name))[1] = (select auth.uid()::text));
