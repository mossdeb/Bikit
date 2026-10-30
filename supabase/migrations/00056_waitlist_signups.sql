-- The landing's waitlist (2026-10-30): the addresses of people who asked for
-- early access to the device. RLS on and no policies: only the server's
-- privileged client reaches it (src/lib/actions/waitlist.ts).
create table if not exists waitlist_signups (
  email text primary key,
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

alter table waitlist_signups enable row level security;
