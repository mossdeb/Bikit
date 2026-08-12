-- What a maintenance profile is FOR, as a fact instead of a guess.
--
-- profile-match.ts had to infer a profile's kind from the words in its
-- service names — "Lower Leg" meant fork, "Air Sleeve" meant shock — because
-- the table had no category. That coupling bit on 2026-08-12: collapsing the
-- FOX shocks' 125 h services into one "Full Service" erased "Air Sleeve", the
-- profile stopped declaring what it was, and a fork went straight back to
-- matching the "float" rear shock. Renaming a service is ordinary editorial
-- work; it must not silently change which component a profile serves.
--
-- Nullable and NOT in the unique key, deliberately.
--
-- Nullable because a wrong category is worse than none: null keeps today's
-- behaviour (the profile is simply silent and stays eligible), while a wrong
-- one actively excludes the right profile and sends the component to a paid
-- AI search. So it is filled only where the answer is certain.
--
-- Out of the key because putting it in would let a mis-categorised AI answer
-- create a SECOND row for a part that already has one — two rows, two paid
-- searches — to fix two known collisions (SR Suntour names both a fork and a
-- shock EPICON; Canyon calls a stem, a bar and a dropper G5). The collisions
-- stay unfixed and the upsert target stays (brand, model, year).
--
-- Values are the canonical English COMPONENT_CATEGORIES strings, the same
-- ones components.category holds, so no translation layer sits in between.

alter table maintenance_profiles add column if not exists category text;

comment on column maintenance_profiles.category is
  'Canonical English COMPONENT_CATEGORIES string, or null when unknown. Read by profile-match.ts to keep a fork off a shock profile. Null means "no opinion" and stays eligible.';

create index if not exists maintenance_profiles_brand_category_idx
  on maintenance_profiles (brand, category)
  where category is not null;
