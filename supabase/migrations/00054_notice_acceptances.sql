-- The confidentiality, IP and patent notice shown after every sign-in
-- (2026-10-29): the first time each user accepted it. Later acceptances
-- leave the row as it is — the record is of the first. `notice` names the
-- text accepted, so a new version of it can be asked for again.
create table if not exists notice_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice text not null,
  first_accepted_at timestamptz not null default now(),
  primary key (user_id, notice)
);

alter table notice_acceptances enable row level security;

create policy "notice_acceptances_select_own" on notice_acceptances
  for select using ((select auth.uid()) = user_id);

create policy "notice_acceptances_insert_own" on notice_acceptances
  for insert with check ((select auth.uid()) = user_id);
