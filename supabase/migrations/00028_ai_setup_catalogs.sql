-- AI Auto Setup: the two shared catalogs and the AI request log.
-- (See AI_AUTO_SETUP_SPEC.md.)
--
-- Both catalogs follow the same pattern: lookup first, AI only on a miss,
-- and the app — never the AI — does the writing. They are shared across all
-- users, which is what makes the AI cost trend to zero: the first user to
-- search a bike pays the AI call, everyone after gets the catalog row.

-- ── Bike catalog ─────────────────────────────────────────────────────────
-- One row per bike (brand + model + version + year), holding the component
-- list the AI extracted from the manufacturer's spec sheet.
--
-- The key columns store the NORMALIZED form (lowercase, trimmed, accents
-- stripped — src/lib/ai/normalize.ts is the single writer) so that "YT",
-- "yt " and "YT Industries" resolve to the same row. The original strings,
-- as the source spelled them, live in `display` for presentation.
--
-- `version` is not null with '' for "no version" rather than nullable:
-- a null would make the unique key treat every versionless row as distinct.
--
-- `components` is jsonb, not a child table: the list is written once when
-- the catalog entry is created and read whole on every hit — nothing ever
-- queries individual components relationally. Shape is the validated AI
-- response (canonical English categories enforced by schema + Zod before
-- anything reaches this table).
create table if not exists bike_catalog (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  version text not null default '',
  year int not null,
  display jsonb not null,
  components jsonb not null,
  source_url text,
  confidence numeric,
  -- The catalog stores what the AI found at the source, never a user's
  -- edits. Self-reported confidence is a triage heuristic, not a
  -- probability: >= threshold lands as 'unverified', below it as
  -- 'low_confidence'. 'verified' is reserved for future human curation.
  status text not null default 'unverified'
    check (status in ('unverified', 'low_confidence', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, model, version, year)
);

create trigger bike_catalog_set_updated_at
  before update on bike_catalog
  for each row execute function set_updated_at();

-- ── Maintenance profiles ─────────────────────────────────────────────────
-- One row per component model (brand + model, normalized, WITHOUT variant —
-- "38 Factory Grip X2" and "38 Factory" must resolve to the same profile),
-- holding ALL documented service intervals. The app picks the 3 most
-- relevant when creating a component; the 3-slot schema does not change.
--
-- `year` is null for "any year" — most profiles apply across model years,
-- and a year-specific row wins over the null row on lookup. `nulls not
-- distinct` is what keeps the unique key honest: without it Postgres would
-- treat every (brand, model, null) as distinct and allow duplicates.
--
-- Interval names inside `intervals` are canonical English ("Lower Leg
-- Service"); translation happens at presentation, following the component
-- category pattern. Shape per entry: { name, type: 'km'|'hours'|'months',
-- interval: number } — same vocabulary as component_service_intervals'
-- check constraint, validated by Zod before insert.
create table if not exists maintenance_profiles (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  year int,
  intervals jsonb not null,
  source_url text,
  confidence numeric,
  status text not null default 'unverified'
    check (status in ('unverified', 'low_confidence', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (brand, model, year)
);

create trigger maintenance_profiles_set_updated_at
  before update on maintenance_profiles
  for each row execute function set_updated_at();

-- Both catalogs: readable by any signed-in user (the lookup runs under the
-- caller's session), writable by nobody through RLS — all writes go through
-- server actions using the service-role admin client, same arrangement as
-- the Stripe webhook writing subscriptions. The upsert onto the unique keys
-- is what resolves two users racing to search the same unknown bike.
alter table bike_catalog enable row level security;
alter table maintenance_profiles enable row level security;

create policy "bike_catalog_select_authenticated" on bike_catalog
  for select using ((select auth.uid()) is not null);

create policy "maintenance_profiles_select_authenticated" on maintenance_profiles
  for select using ((select auth.uid()) is not null);

-- ── AI request log ───────────────────────────────────────────────────────
-- One row per AI call: who, what kind, what was asked, how it went, and
-- what it cost. This is both the quota counter (3 bike searches per user
-- per day — only kind = 'bike' with a consuming outcome counts; catalog
-- hits never reach this table) and the ledger that will prove, or
-- disprove, that the catalogs are actually shrinking the AI bill.
--
-- 'not_found' is logged but does not consume quota — the user got no value.
-- 'invalid' is a response that failed schema/Zod validation, treated as
-- not found by the flow but worth telling apart in the ledger.
create table if not exists ai_request_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bike', 'component')),
  input jsonb not null,
  outcome text not null check (outcome in ('found', 'not_found', 'invalid', 'error')),
  tokens int,
  created_at timestamptz not null default now()
);

-- The quota query is "this user's bike searches since midnight" — index
-- matches it directly.
create index if not exists ai_request_log_user_created_idx
  on ai_request_log (user_id, created_at);

alter table ai_request_log enable row level security;

-- Owner can read their own log (the quota check runs under the caller's
-- session). Inserts come from server actions under the caller's session
-- too, hence the insert policy — unlike the catalogs, this table is
-- per-user data.
create policy "ai_request_log_select_own" on ai_request_log
  for select using ((select auth.uid()) = user_id);

create policy "ai_request_log_insert_own" on ai_request_log
  for insert with check ((select auth.uid()) = user_id);
