-- Smart Setup components may carry up to 5 reminders (2026-08-11); the
-- manual create form deliberately stays at 3. Widening the check is
-- backward-compatible — code that writes 1-3 keeps satisfying 1-5 — so this
-- can land in production ahead of the deploy that uses slots 4-5.
alter table component_service_intervals
  drop constraint component_service_intervals_slot_check;

alter table component_service_intervals
  add constraint component_service_intervals_slot_check check (slot between 1 and 5);
