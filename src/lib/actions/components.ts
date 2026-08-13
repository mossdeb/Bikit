"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  componentSchema,
  componentIntervalSchema,
  componentInitialUsageSchema,
  type ComponentIntervalFormValues,
} from "@/lib/validations/component.schema";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_LIMITS } from "@/lib/plans";
import { unitToKm } from "@/lib/format";
import { rebaseBaselineOverAbsence } from "@/lib/maintenance/calculation";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { canonicalIntervalName } from "@/lib/interval-name";
import { parseIntervalIncludes } from "@/lib/interval-includes";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

// 5, not 3: Smart Setup components carry up to 5 reminders and the edit
// form shows them all. The manual CREATE form still renders only 3 slots,
// so nothing new becomes possible there — the parser just stops being the
// thing that silently drops an AI-created component's 4th and 5th reminder
// on its first manual edit.
const MAX_INTERVAL_SLOTS = 5;

function parseComponentFormData(formData: FormData) {
  return componentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    serial_number: formData.get("serial_number"),
    install_date: formData.get("install_date"),
    notes: formData.get("notes"),
    purchase_date: formData.get("purchase_date"),
    warranty: formData.get("warranty"),
    year: formData.get("year"),
  });
}

/**
 * A component has up to 3 independent, named maintenance intervals,
 * submitted as interval_name_{slot}/interval_type_{slot}/interval_value_{slot}
 * field triplets. A slot left untouched by the user (all three fields
 * empty) is simply skipped rather than validated.
 */
function parseComponentIntervals(
  formData: FormData,
  /** The reader's dictionary, used to turn a translated name back into the
   * canonical English the catalog and every other reader share. The form
   * shows Portuguese; the database keeps the key. */
  dict: Dictionary
): { success: true; data: ComponentIntervalFormValues[] } | { success: false; error: string } {
  const intervals: ComponentIntervalFormValues[] = [];
  for (let slot = 1; slot <= MAX_INTERVAL_SLOTS; slot++) {
    const name = formData.get(`interval_name_${slot}`);
    const type = formData.get(`interval_type_${slot}`);
    const value = formData.get(`interval_value_${slot}`);
    if (!name && !type && !value) continue;
    const canonical = typeof name === "string" ? canonicalIntervalName(dict, name) : name;
    const parsed = componentIntervalSchema.safeParse({
      name: canonical,
      interval_type: type,
      interval_value: value,
      includes:
        typeof canonical === "string"
          ? parseIntervalIncludes(formData.get(`interval_includes_${slot}`), canonical)
          : undefined,
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    intervals.push(parsed.data);
  }
  return { success: true, data: intervals };
}

/**
 * The component name is optional in the form — when left blank, fall back
 * to a generated display name so component.name always has something to
 * show in lists/headers rather than storing an empty string.
 */
function deriveComponentName(data: { name: string | null; brand: string | null; model: string | null; category: string | null }) {
  if (data.name) return data.name;
  const brandModel = [data.brand, data.model].filter(Boolean).join(" ");
  return brandModel || data.category || "Unnamed component";
}

export async function createComponent(bikeId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const parsed = parseComponentFormData(formData);
  if (!parsed.success) {
    redirect(
      `/bikes/${bikeId}/components/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const parsedIntervals = parseComponentIntervals(formData, getDictionary(localeFromMetadata(userData?.claims?.user_metadata)));
  if (!parsedIntervals.success) {
    redirect(`/bikes/${bikeId}/components/new?error=${encodeURIComponent(parsedIntervals.error)}`);
  }

  // Distances are always stored in km — interval_value and initial_km are
  // entered in whichever unit the user prefers and need converting before
  // they're saved alongside bike/component totals, which are always km.
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const intervals = parsedIntervals.data.map((interval) =>
    interval.interval_type === "km"
      ? { ...interval, interval_value: unitToKm(interval.interval_value, distanceUnit) }
      : interval
  );

  const { plan } = await getUserSubscription(userId);
  const maxComponents = PLAN_LIMITS[plan].maxComponents;
  if (maxComponents !== null) {
    // Archived parts don't count. The limit is about what someone is keeping
    // track of, not about how much history they've accumulated — and counting
    // the archive would push people back to deleting, which is the habit
    // archiving exists to replace.
    const { count } = await supabase
      .from("components")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("retired_at", null);
    if ((count ?? 0) >= maxComponents) {
      redirect(
        `/bikes/${bikeId}/components/new?error=${encodeURIComponent(`Your ${plan} plan is limited to ${maxComponents} components. Upgrade in Settings to add more.`)}`
      );
    }
  }

  // The user can give a new component a head start (e.g. a used part) via
  // initial_km/initial_hours — defaults to 0 for a brand-new part. From then on
  // usage is derived from the bike's totals, so this drives the install-time
  // baseline. It's also stored as-is: the baseline alone can't give it back,
  // because the bike's total at that moment isn't kept anywhere.
  const initialUsage = componentInitialUsageSchema.safeParse({
    initial_km: formData.get("initial_km"),
    initial_hours: formData.get("initial_hours"),
  });
  const initialKmRaw = (initialUsage.success ? initialUsage.data.initial_km : null) ?? 0;
  const initialKm = unitToKm(initialKmRaw, distanceUnit);
  const initialHours = (initialUsage.success ? initialUsage.data.initial_hours : null) ?? 0;

  const { data: bike } = await supabase.from("bikes").select("total_km, total_hours").eq("id", bikeId).single();

  const { data: component, error } = await supabase
    .from("components")
    .insert({
      ...parsed.data,
      name: deriveComponentName(parsed.data),
      bike_id: bikeId,
      user_id: userId,
      bike_km_at_install: (bike?.total_km ?? 0) - initialKm,
      bike_hours_at_install: (bike?.total_hours ?? 0) - initialHours,
      initial_km: initialKm,
      initial_hours: initialHours,
    })
    .select("id")
    .single();

  if (error || !component) {
    redirect(
      `/bikes/${bikeId}/components/new?error=${encodeURIComponent(error?.message ?? "Could not create component")}`
    );
  }

  if (intervals.length > 0) {
    await supabase.from("component_service_intervals").insert(
      intervals.map((interval, i) => ({
        ...interval,
        component_id: component.id,
        user_id: userId,
        slot: i + 1,
      }))
    );
  }

  revalidatePath(`/bikes/${bikeId}`);
  redirect(`/bikes/${bikeId}/components/${component.id}`);
}

export async function updateComponent(bikeId: string, componentId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const parsed = parseComponentFormData(formData);
  if (!parsed.success) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const parsedIntervals = parseComponentIntervals(formData, getDictionary(localeFromMetadata(userData?.claims?.user_metadata)));
  if (!parsedIntervals.success) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}/edit?error=${encodeURIComponent(parsedIntervals.error)}`
    );
  }

  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const intervals = parsedIntervals.data.map((interval) =>
    interval.interval_type === "km"
      ? { ...interval, interval_value: unitToKm(interval.interval_value, distanceUnit) }
      : interval
  );

  const { error } = await supabase
    .from("components")
    .update({ ...parsed.data, name: deriveComponentName(parsed.data) })
    .eq("id", componentId);
  if (error) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}/edit?error=${encodeURIComponent(error.message)}`
    );
  }

  // The interval set is always submitted as a whole (0-3 slots) — simplest
  // to replace it outright rather than diff against what's stored.
  await supabase.from("component_service_intervals").delete().eq("component_id", componentId);
  if (intervals.length > 0) {
    await supabase.from("component_service_intervals").insert(
      intervals.map((interval, i) => ({
        ...interval,
        component_id: componentId,
        user_id: userId,
        slot: i + 1,
      }))
    );
  }

  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath(`/bikes/${bikeId}/components/${componentId}`);
  redirect(`/bikes/${bikeId}/components/${componentId}`);
}

export async function deleteComponent(bikeId: string, componentId: string) {
  const supabase = await createClient();
  await supabase.from("components").delete().eq("id", componentId);
  revalidatePath(`/bikes/${bikeId}`);
  redirect(`/bikes/${bikeId}`);
}

/**
 * Takes a part off the bike without destroying what it did there.
 *
 * The bike's totals are recorded as they stand. Usage in this app is always
 * derived — bike total minus the part's baseline — so an archived part left
 * alone would go on collecting kilometres it never turned a wheel for. These
 * two numbers freeze the figures the archive shows, and are also how a restore
 * later knows how far the bike travelled without it.
 *
 * Outstanding notification claims are dropped: nothing should be pending for a
 * part that isn't fitted, and a restored one has to be able to warn again.
 */
export async function archiveComponent(bikeId: string, componentId: string) {
  const supabase = await createClient();

  const { data: bike } = await supabase
    .from("bikes")
    .select("total_km, total_hours")
    .eq("id", bikeId)
    .single();

  const { error } = await supabase
    .from("components")
    .update({
      retired_at: format(new Date(), "yyyy-MM-dd"),
      bike_km_at_retire: bike?.total_km ?? null,
      bike_hours_at_retire: bike?.total_hours ?? null,
    })
    .eq("id", componentId);
  if (error) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}?error=${encodeURIComponent(error.message)}`
    );
  }

  const { data: intervals } = await supabase
    .from("component_service_intervals")
    .select("id")
    .eq("component_id", componentId);
  const intervalIds = (intervals ?? []).map((interval) => interval.id);
  if (intervalIds.length > 0) {
    await supabase
      .from("component_interval_notifications")
      .delete()
      .in("service_interval_id", intervalIds);
  }

  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath(`/bikes/${bikeId}/components/${componentId}`);
  redirect(`/bikes/${bikeId}/components/${componentId}`);
}

/**
 * Puts an archived part back on the bike, resuming on the reading it left.
 *
 * The bike kept riding while the part was off it, and the baseline is measured
 * against the bike's odometer — so restoring without touching it would hand the
 * part every kilometre ridden in its absence. Pushing the baseline forward by
 * exactly that distance keeps the part's own figure where it was. It is the
 * same correction rebaseComponentBaselines makes when a bike's totals are
 * edited, for the same reason.
 */
export async function restoreComponent(bikeId: string, componentId: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;

  // Restoring puts a part back in service, so it meets the plan limit on the
  // same terms as adding one. Archived parts don't count; this one is about to
  // stop being archived.
  if (userId) {
    const { plan } = await getUserSubscription(userId);
    const maxComponents = PLAN_LIMITS[plan].maxComponents;
    if (maxComponents !== null) {
      const { count } = await supabase
        .from("components")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("retired_at", null);
      if ((count ?? 0) >= maxComponents) {
        redirect(
          `/bikes/${bikeId}/components/${componentId}?error=${encodeURIComponent(
            `Your ${plan} plan is limited to ${maxComponents} components in use. Archive another one or upgrade in Settings to restore this.`
          )}`
        );
      }
    }
  }

  const [{ data: bike }, { data: component }] = await Promise.all([
    supabase.from("bikes").select("total_km, total_hours").eq("id", bikeId).single(),
    supabase
      .from("components")
      .select("bike_km_at_install, bike_hours_at_install, bike_km_at_retire, bike_hours_at_retire")
      .eq("id", componentId)
      .single(),
  ]);

  const { error } = await supabase
    .from("components")
    .update({
      retired_at: null,
      bike_km_at_retire: null,
      bike_hours_at_retire: null,
      bike_km_at_install: rebaseBaselineOverAbsence(
        component?.bike_km_at_install,
        component?.bike_km_at_retire,
        bike?.total_km
      ),
      bike_hours_at_install: rebaseBaselineOverAbsence(
        component?.bike_hours_at_install,
        component?.bike_hours_at_retire,
        bike?.total_hours
      ),
    })
    .eq("id", componentId);
  if (error) {
    redirect(
      `/bikes/${bikeId}/components/${componentId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath(`/bikes/${bikeId}/components/${componentId}`);
  redirect(`/bikes/${bikeId}/components/${componentId}`);
}

