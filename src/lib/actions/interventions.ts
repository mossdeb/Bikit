"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { interventionSchema } from "@/lib/validations/intervention.schema";
import { unitToKm } from "@/lib/format";
import { selectActiveInterval, type NamedIntervalStatusInput } from "@/lib/maintenance/calculation";

function parseInterventionFormData(formData: FormData) {
  return interventionSchema.safeParse({
    type: formData.get("type"),
    date: formData.get("date"),
    hours_used: formData.get("hours_used"),
    kms: formData.get("kms"),
    description: formData.get("description"),
    notes: formData.get("notes"),
    resets_interval: formData.get("resets_interval"),
  });
}

/**
 * "Reset the maintenance interval" is a single toggle on the intervention
 * form, but a component can have up to 3 independent named intervals — so
 * resetting means resetting whichever one is currently closest to
 * expiring (the "active" one, same definition used everywhere else a
 * component's health is shown). Resolved here, before the new intervention
 * is inserted, so the new intervention's own kms/hours don't shift what
 * counts as "currently active".
 */
interface ResolvedReset {
  /** The interval the intervention is recorded against. */
  id: string;
  /** That interval AND every sibling on the same cadence — the set the view
   * of migration 00030 treats as serviced by this one intervention, and so
   * the set whose notification state has to clear. */
  cadenceIds: string[];
}

async function resolveActiveIntervalId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  componentId: string,
  bike: { total_km: number | null; total_hours: number | null } | null
): Promise<ResolvedReset | null> {
  const { data: rows } = await supabase
    .from("component_interval_status")
    .select(
      "id, name, interval_type, interval_value, install_date, component_created_at, last_intervention_date, bike_km_at_install, bike_hours_at_install, last_service_km, last_service_hours"
    )
    .eq("component_id", componentId);
  if (!rows || rows.length === 0) return null;

  const inputs: NamedIntervalStatusInput[] = rows
    .filter((r): r is typeof r & { id: string; name: string } => r.id != null && r.name != null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      intervalType: r.interval_type as "km" | "hours" | "months" | null,
      intervalValue: r.interval_value,
      installDate: r.install_date,
      componentCreatedAt: r.component_created_at,
      lastInterventionDate: r.last_intervention_date,
      currentKm: bike?.total_km ?? null,
      currentHours: bike?.total_hours ?? null,
      bikeKmAtInstall: r.bike_km_at_install,
      bikeHoursAtInstall: r.bike_hours_at_install,
      bikeKmAtLastService: r.last_service_km,
      bikeHoursAtLastService: r.last_service_hours,
    }));

  const active = selectActiveInterval(inputs)?.interval;
  if (!active) return null;

  const cadence = rows.find((r) => r.id === active.id);
  const cadenceIds = rows
    .filter(
      (r) =>
        r.id != null &&
        cadence != null &&
        r.interval_type === cadence.interval_type &&
        r.interval_value === cadence.interval_value
    )
    .map((r) => r.id as string);

  return { id: active.id, cadenceIds: cadenceIds.length > 0 ? cadenceIds : [active.id] };
}

export async function createIntervention(bikeId: string, componentId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const parsed = parseInterventionFormData(formData);
  if (!parsed.success) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}/interventions/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const kms = parsed.data.kms != null ? unitToKm(parsed.data.kms, distanceUnit) : null;

  // Snapshot the bike's current totals so km/hours-based maintenance
  // criteria can measure usage accrued since this service, the same way
  // bike_km_at_install works for usage since the component was installed.
  const { data: bike } = await supabase.from("bikes").select("total_km, total_hours").eq("id", bikeId).single();

  const reset = parsed.data.resets_interval ? await resolveActiveIntervalId(supabase, componentId, bike) : null;

  const { error } = await supabase.from("interventions").insert({
    ...parsed.data,
    kms,
    component_id: componentId,
    user_id: userId,
    bike_km_at_intervention: bike?.total_km ?? null,
    bike_hours_at_intervention: bike?.total_hours ?? null,
    reset_interval_id: reset?.id ?? null,
  });

  if (error) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}/interventions/new?error=${encodeURIComponent(error.message)}`
    );
  }

  // Servicing an interval clears whatever maintenance state the owner was
  // last notified about, so the next decline announces itself again. The
  // cron also clears this once it sees the interval healthy, but doing it
  // here closes the gap for an interval short enough to wear back down
  // before tomorrow's run.
  // Every reminder on that cadence, not just the one named: they were all
  // serviced by this intervention, and a sibling left holding a claimed band
  // would read as "already warned" and go silent until it recovers.
  if (reset) {
    await supabase.from("component_interval_notifications").delete().in("service_interval_id", reset.cadenceIds);
  }

  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath(`/bikes/${bikeId}/components/${componentId}`);
  redirect(`/bikes/${bikeId}/components/${componentId}`);
}

export async function updateIntervention(
  bikeId: string,
  componentId: string,
  interventionId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();

  const parsed = parseInterventionFormData(formData);
  if (!parsed.success) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}/interventions/${interventionId}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const kms = parsed.data.kms != null ? unitToKm(parsed.data.kms, distanceUnit) : null;

  // Re-derive which interval this reset targets from the component's
  // current configuration, same as on create — this is a full overwrite of
  // the row, not a diff, consistent with the rest of this action.
  let resetIntervalId: string | null = null;
  if (parsed.data.resets_interval) {
    const { data: bike } = await supabase.from("bikes").select("total_km, total_hours").eq("id", bikeId).single();
    resetIntervalId = (await resolveActiveIntervalId(supabase, componentId, bike))?.id ?? null;
  }

  const { error } = await supabase
    .from("interventions")
    .update({ ...parsed.data, kms, reset_interval_id: resetIntervalId })
    .eq("id", interventionId);

  if (error) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}/interventions/${interventionId}/edit?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath(`/bikes/${bikeId}/components/${componentId}`);
  redirect(`/bikes/${bikeId}/components/${componentId}`);
}

export async function deleteIntervention(bikeId: string, componentId: string, interventionId: string) {
  const supabase = await createClient();
  await supabase.from("interventions").delete().eq("id", interventionId);
  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath(`/bikes/${bikeId}/components/${componentId}`);
  redirect(`/bikes/${bikeId}/components/${componentId}`);
}
