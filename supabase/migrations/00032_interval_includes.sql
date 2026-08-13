-- What a merged service actually covers, as data instead of as prose in the name.
--
-- The 2026-08-12 curation collapsed a FOX fork's three 125 h services into
-- one, because in a workshop they are one job and one afternoon. The merge
-- was right and the information loss was real: the owner stopped being able
-- to see that the revision covers lowers, damper and air spring. The patch
-- was to write the list into the name — "Full Service (Lowers | Damper | Air
-- Spring)" — and that breaks a rule this project already paid to learn: the
-- name is interface text AND the translation key. It reaches pills, emails
-- and push titles, and anything outside CANONICAL_INTERVAL_NAMES shows
-- verbatim in both languages.
--
-- A list of canonical service names, not free text. Every entry is already a
-- key in components.intervalNames, so the popover translates itself with the
-- dictionary that exists and a merged interval costs no new strings. Free
-- prose here would have recreated the exact problem the column removes.
--
-- Nullable and additive: a plain interval declares nothing, and code that
-- has never heard of the column keeps working — the same shape as 00031.
--
-- component_interval_status is deliberately NOT recreated. The component page
-- reads this table with select("*"), so it picks the column up on its own,
-- and the six queries that read the view name their columns explicitly and
-- do not ask for it. Changing a view is retroactive (see 00030) and there is
-- no reason to take that risk for a field only the detail screen renders.

alter table component_service_intervals add column if not exists includes text[];

comment on column component_service_intervals.includes is
  'Canonical English service names this reminder covers, or null. Rendered as a popover list on the component page; each entry is a components.intervalNames key so it needs no dictionary of its own.';
