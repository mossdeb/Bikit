-- One service, one intervention — every reminder on the same cadence resets.
--
-- An intervention names ONE interval in reset_interval_id (the active one,
-- resolved server-side), and this view read that column literally: the last
-- intervention that reset THIS interval, and no other. That was right while a
-- component's reminders were independent, and wrong the moment two of them
-- describe the same visit to the workshop.
--
-- Measured in the curated library on 2026-08-12: 1.082 profiles document two
-- services on the same cadence and 446 document three. A FOX fork from 2015 on
-- has Lower Leg Full Service, Damper Service and Air Spring Service all at
-- 125 h — one job, in one shop, on one afternoon. The owner logged it once and
-- watched one reminder go green while the other two stayed overdue, kept their
-- red badge, and kept emailing. Clearing them meant inventing two more
-- interventions for work done once.
--
-- So the lateral now matches any intervention that reset a SIBLING of the same
-- cadence — same component, same interval_type, same interval_value. The
-- interval's own id still matches (it is trivially its own sibling), so
-- nothing that worked before stops working.
--
-- Deliberately NOT keyed on the service name: names differ precisely because
-- the tasks differ, and it is the shared cadence that says "these are done
-- together". Nor on the type alone — 50 h and 125 h are different visits.
--
-- Retroactive by construction, and checked before applying: of the three
-- interventions in the database carrying a reset_interval_id, none points at
-- an interval that has a same-cadence sibling. No existing reading moves.

drop view if exists component_interval_status;

create view component_interval_status
with (security_invoker = true) -- critical: without this it bypasses RLS
as
select
  csi.id,
  csi.component_id,
  c.name as component_name,
  c.bike_id,
  c.user_id,
  c.retired_at,
  csi.slot,
  csi.name,
  csi.interval_type,
  csi.interval_value,
  c.install_date,
  c.created_at::date as component_created_at,
  c.bike_km_at_install,
  c.bike_hours_at_install,
  li.date as last_intervention_date,
  li.bike_km_at_intervention as last_service_km,
  li.bike_hours_at_intervention as last_service_hours
from component_service_intervals csi
join components c on c.id = csi.component_id
left join lateral (
  select i.date, i.bike_km_at_intervention, i.bike_hours_at_intervention
  from interventions i
  join component_service_intervals r on r.id = i.reset_interval_id
  where r.component_id = csi.component_id
    and r.interval_type = csi.interval_type
    and r.interval_value = csi.interval_value
  order by i.date desc, i.created_at desc
  limit 1
) li on true;
