-- How the app is used (by request, 2026-11-09): one row per account per
-- day — when it was first and last seen, how many pages it opened, which
-- areas of the app, and roughly where from (country and city as Vercel
-- reads them off the IP; the IP itself is never stored). Written by the
-- server on each page the account opens (src/lib/actions/activity.ts),
-- through record_user_activity below; nothing is kept on the device.
--
-- Kept small on purpose: a day's summary, not a click stream. Twelve
-- months are kept; the function trims the account's older rows as it
-- writes. No policy lets an account read the table — it is the owner's
-- view of the product, read with the service role.
create table if not exists user_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The day in Portugal's time, the product's home.
  day date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  page_views integer not null default 1,
  -- The pages opened, with ids taken out ("/pro/sessoes/:id"), each once.
  areas text[] not null default '{}',
  -- "mobile", "tablet" or "desktop", each once.
  devices text[] not null default '{}',
  -- The latest of the day; null where the host gave none (local dev).
  country text,
  city text,
  primary key (user_id, day)
);

alter table user_activity_days enable row level security;

create or replace function public.record_user_activity(
  p_area text,
  p_device text,
  p_country text,
  p_city text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Europe/Lisbon')::date;
  area text := left(nullif(p_area, ''), 120);
  device text := left(nullif(p_device, ''), 16);
begin
  if uid is null then
    return;
  end if;
  insert into user_activity_days as a
    (user_id, day, areas, devices, country, city)
  values (
    uid,
    today,
    case when area is null then '{}' else array[area] end,
    case when device is null then '{}' else array[device] end,
    left(nullif(p_country, ''), 8),
    left(nullif(p_city, ''), 80)
  )
  on conflict (user_id, day) do update set
    last_seen_at = now(),
    page_views = a.page_views + 1,
    areas = case
      when area is null or area = any(a.areas) or cardinality(a.areas) >= 60
        then a.areas
      else a.areas || area
    end,
    devices = case
      when device is null or device = any(a.devices) then a.devices
      else a.devices || device
    end,
    country = coalesce(excluded.country, a.country),
    city = coalesce(excluded.city, a.city);
  delete from user_activity_days
    where user_id = uid and day < today - interval '12 months';
end;
$$;

revoke all on function public.record_user_activity(text, text, text, text)
  from public, anon;
grant execute on function public.record_user_activity(text, text, text, text)
  to authenticated;
