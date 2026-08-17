"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bikeSchema } from "@/lib/validations/bike.schema";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_LIMITS } from "@/lib/plans";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A component's "usage since install" is anchored to the bike's total at
 * the moment it was installed (bike_km_at_install/bike_hours_at_install),
 * not to an absolute number that's meant to stay fixed. If the bike's
 * total is later corrected (e.g. a typo), leaving those baselines untouched
 * would silently invalidate every component's derived usage — shifting
 * them by the same delta keeps already-accrued usage unchanged instead.
 */
async function rebaseComponentBaselines(
  supabase: SupabaseServerClient,
  bikeId: string,
  deltaKm: number,
  deltaHours: number
) {
  const { data: components } = await supabase
    .from("components")
    .select("id, bike_km_at_install, bike_hours_at_install")
    .eq("bike_id", bikeId);
  if (!components || components.length === 0) return;

  await Promise.all(
    components.map((c) =>
      supabase
        .from("components")
        .update({
          bike_km_at_install: c.bike_km_at_install != null ? c.bike_km_at_install + deltaKm : null,
          bike_hours_at_install: c.bike_hours_at_install != null ? c.bike_hours_at_install + deltaHours : null,
        })
        .eq("id", c.id)
    )
  );

  const { data: interventions } = await supabase
    .from("interventions")
    .select("id, bike_km_at_intervention, bike_hours_at_intervention")
    .in(
      "component_id",
      components.map((c) => c.id)
    );
  if (!interventions || interventions.length === 0) return;

  await Promise.all(
    interventions.map((i) =>
      supabase
        .from("interventions")
        .update({
          bike_km_at_intervention: i.bike_km_at_intervention != null ? i.bike_km_at_intervention + deltaKm : null,
          bike_hours_at_intervention:
            i.bike_hours_at_intervention != null ? i.bike_hours_at_intervention + deltaHours : null,
        })
        .eq("id", i.id)
    )
  );
}

function parseBikeFormData(formData: FormData) {
  return bikeSchema.safeParse({
    name: formData.get("name"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    year: formData.get("year"),
    type: formData.get("type"),
    color: formData.get("color"),
    serial_number: formData.get("serial_number"),
    total_km: formData.get("total_km"),
    total_hours: formData.get("total_hours"),
    notes: formData.get("notes"),
    purchase_date: formData.get("purchase_date"),
    warranty: formData.get("warranty"),
    frame_size: formData.get("frame_size"),
    wheel_size: formData.get("wheel_size"),
  });
}

/**
 * The bike name is optional in the form — when left blank, fall back to a
 * generated display name so bike.name always has something to show in
 * cards/headers rather than storing an empty string.
 */
function deriveBikeName(
  data: { name: string | null; brand: string | null; model: string | null; type: string | null },
  /** The create form's version field. `bikes` has no column for it — it is
   * part of how the bike is called, not a fact of its own, which is the same
   * treatment createBikeFromAiSetup gives it. */
  version?: string | null
) {
  if (data.name) return data.name;
  const brandModel = [data.brand, data.model, version].filter(Boolean).join(" ");
  return brandModel || data.type || "Unnamed bike";
}

export async function createBike(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const parsed = parseBikeFormData(formData);
  if (!parsed.success) {
    redirect(`/bikes/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  // Required on create only. Editing keeps the year among the optional
  // details, and updateBike shares the schema — so the rule lives here
  // rather than in bikeSchema.
  if (parsed.data.year == null) {
    redirect(`/bikes/new?error=${encodeURIComponent("The bike year is required.")}`);
  }

  const { plan } = await getUserSubscription(userId);
  const maxBikes = PLAN_LIMITS[plan].maxBikes;
  if (maxBikes !== null) {
    const { count } = await supabase.from("bikes").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= maxBikes) {
      redirect(
        `/bikes/new?error=${encodeURIComponent(`Your ${plan} plan is limited to ${maxBikes} bike${maxBikes === 1 ? "" : "s"}. Upgrade in Settings to add more.`)}`
      );
    }
  }

  const stravaGearId = (formData.get("strava_gear_id") as string) || null;
  const version = ((formData.get("version") as string) || "").trim() || null;

  const { data: bike, error } = await supabase
    .from("bikes")
    .insert({
      ...parsed.data,
      name: deriveBikeName(parsed.data, version),
      user_id: userId,
      strava_gear_id: stravaGearId,
    })
    .select("id")
    .single();

  if (error || !bike) {
    redirect(`/bikes/new?error=${encodeURIComponent(error?.message ?? "Could not create bike")}`);
  }

  revalidatePath("/bikes");
  // `created` is what turns the bike's page into the moment it was created —
  // the same flag Smart Setup's redirect carries, so one screen serves both.
  redirect(`/bikes/${bike.id}?created=1`);
}

export async function updateBike(bikeId: string, formData: FormData) {
  const supabase = await createClient();

  const parsed = parseBikeFormData(formData);
  if (!parsed.success) {
    redirect(
      `/bikes/${bikeId}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const { data: existingBike } = await supabase
    .from("bikes")
    .select("strava_gear_id, total_km, total_hours")
    .eq("id", bikeId)
    .single();

  // The gear select is only rendered when Strava is connected — if it's
  // absent from the submission, leave the existing link untouched.
  const stravaGearId = formData.has("strava_gear_id")
    ? (formData.get("strava_gear_id") as string) || null
    : (existingBike?.strava_gear_id ?? null);
  const willBeLinked = !!stravaGearId;
  const name = deriveBikeName(parsed.data);

  // Once a bike is linked to a Strava gear, its totals are Strava's to
  // manage — ignore whatever this form submitted for them (the fields are
  // read-only client-side, but a linked bike stays authoritative either way).
  const updateData = willBeLinked
    ? { ...parsed.data, name, total_km: undefined, total_hours: undefined, strava_gear_id: stravaGearId }
    : { ...parsed.data, name, strava_gear_id: stravaGearId };

  const { error } = await supabase.from("bikes").update(updateData).eq("id", bikeId);
  if (error) {
    // A unique violation means that Strava bike is already claimed by a bike
    // on a different Bikit account — the gear picker only knows about the
    // current account's own bikes, so this can slip past its "already
    // linked" check and needs to be surfaced here instead of failing silently.
    const message = error.code === "23505" ? "strava-gear-conflict" : error.message;
    redirect(`/bikes/${bikeId}/edit?error=${encodeURIComponent(message)}`);
  }

  // Rebase whenever this form wrote the totals — the same condition that put
  // them in updateData. Also asking whether the bike *was* linked would skip
  // the unlink case, where the totals are written but the baselines aren't.
  if (!willBeLinked) {
    const deltaKm = (parsed.data.total_km ?? 0) - (existingBike?.total_km ?? 0);
    const deltaHours = (parsed.data.total_hours ?? 0) - (existingBike?.total_hours ?? 0);
    if (deltaKm !== 0 || deltaHours !== 0) {
      await rebaseComponentBaselines(supabase, bikeId, deltaKm, deltaHours);
    }
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  redirect(`/bikes/${bikeId}`);
}

export async function deleteBike(bikeId: string) {
  const supabase = await createClient();
  await supabase.from("bikes").delete().eq("id", bikeId);
  revalidatePath("/bikes");
  redirect("/bikes");
}
