"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_LIMITS } from "@/lib/plans";
import { hasAiSetupAccess, hasUnlimitedAiSearches } from "@/lib/ai-setup-access";
import { aiSetupSearchSchema, aiSetupCreateSchema } from "@/lib/validations/ai-setup.schema";
import { bikeCatalogKey } from "@/lib/ai/normalize";
import { searchBikeWithAI, type AiBikeComponent, type BikeSearchOutcome } from "@/lib/ai/bike-search";
import { computeAllowance, startOfTodayUtcIso } from "@/lib/ai/quota";
import { resolveIntervalsForComponents } from "@/lib/ai/profiles";
import { saveBikeCatalogEntry } from "@/lib/ai/catalog";
import type { MaintenanceInterval } from "@/lib/ai/intervals";

/** What the client's preview receives. Unlike the form actions in this
 * folder, this returns data instead of redirecting: the caller is a client
 * component driving a multi-step flow, not a plain form post. */
export interface AiSetupBike {
  brand: string;
  model: string;
  version: string;
  year: number;
  type: string;
}

/** A component as the preview shows it: the AI/catalog identification plus
 * its maintenance profile — everything documented, and the app's pick for
 * the 3 slots (both editable before anything is created). */
export interface AiSetupComponent extends AiBikeComponent {
  intervals: MaintenanceInterval[];
  selected: MaintenanceInterval[];
  intervalSourceUrl: string | null;
}

export type AiSetupSearchResult =
  | { status: "invalid_input" }
  | { status: "forbidden" }
  | { status: "quota_exhausted" }
  | { status: "not_found"; remaining: number | null }
  | { status: "error" }
  | {
      status: "found";
      /** 'catalog' cost nothing and consumed no quota; 'ai' did both. */
      origin: "catalog" | "ai";
      bike: AiSetupBike;
      components: AiSetupComponent[];
      sourceUrl: string | null;
      confidence: number | null;
      /** null = no daily limit for this account; the UI hides the counter. */
      remaining: number | null;
    };

export async function searchBikeSetup(formData: FormData): Promise<AiSetupSearchResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const parsed = aiSetupSearchSchema.safeParse({
    brand: formData.get("brand"),
    model: formData.get("model"),
    version: formData.get("version"),
    year: formData.get("year"),
  });
  if (!parsed.success) return { status: "invalid_input" };

  const email = userData?.claims?.email as string | undefined;
  const { plan } = await getUserSubscription(userId);
  if (!hasAiSetupAccess(plan, email)) return { status: "forbidden" };

  // Exempt accounts skip the daily quota entirely: no allowance query, no
  // gate, and a null `remaining` so the UI drops the counter instead of
  // showing a number that never moves. The ledger still records every call.
  const unlimited = hasUnlimitedAiSearches(email);

  // Catalog first — a hit costs nothing and consumes no quota.
  const key = bikeCatalogKey(parsed.data);
  const { data: catalogHit } = await supabase
    .from("bike_catalog")
    .select("display, components, source_url, confidence")
    .match(key)
    .maybeSingle();

  const allowance = unlimited
    ? { allowed: true, remaining: null }
    : computeAllowance(
        (
          (
            await supabase
              .from("ai_request_log")
              .select("outcome")
              .eq("user_id", userId)
              .eq("kind", "bike")
              .gte("created_at", startOfTodayUtcIso())
          ).data ?? []
        ).map((r) => r.outcome)
      );

  if (catalogHit) {
    // The display jsonb holds what the AI's source called the bike; the
    // components jsonb was validated against the component schema when the
    // entry was written. Maintenance profiles are resolved fresh even on a
    // catalog hit — they live in their own catalog and may have improved
    // since this bike was first searched.
    const display = catalogHit.display as unknown as AiSetupBike;
    const components = catalogHit.components as AiBikeComponent[];
    return {
      status: "found",
      origin: "catalog",
      bike: display,
      components: await withIntervals(supabase, userId, components, display.type),
      sourceUrl: catalogHit.source_url,
      confidence: catalogHit.confidence,
      remaining: allowance.remaining,
    };
  }

  if (!allowance.allowed) return { status: "quota_exhausted" };

  const outcome = await searchBikeWithAI({
    brand: parsed.data.brand,
    model: parsed.data.model,
    version: parsed.data.version,
    year: parsed.data.year,
  });

  await logAiRequest(supabase, userId, parsed.data, outcome);

  switch (outcome.outcome) {
    case "found":
      // Saved before responding so the next user's search is a catalog hit.
      // The entry stores the AI result as found — edits the user makes in
      // the preview stay on their bike only.
      await saveBikeCatalogEntry({
        searched: parsed.data,
        display: outcome.data.bike,
        components: outcome.data.components,
        sourceUrl: outcome.sourceUrl,
        confidence: outcome.data.confidence,
      });
      return {
        status: "found",
        origin: "ai",
        bike: {
          brand: outcome.data.bike.brand,
          model: outcome.data.bike.model,
          version: outcome.data.bike.version,
          year: outcome.data.bike.year,
          type: outcome.data.bike.type,
        },
        components: await withIntervals(supabase, userId, outcome.data.components, outcome.data.bike.type),
        sourceUrl: outcome.sourceUrl,
        confidence: outcome.data.confidence,
        remaining: allowance.remaining === null ? null : Math.max(0, allowance.remaining - 1),
      };
    case "not_found":
    case "invalid":
      // Both read as "we couldn't find your bike" to the user; the ledger
      // keeps them apart. Neither consumed quota.
      return { status: "not_found", remaining: allowance.remaining };
    case "error":
      console.error("[ai-setup] bike search failed:", outcome.message);
      return { status: "error" };
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AiSetupCreateResult =
  | { status: "invalid_input" }
  | { status: "forbidden" }
  | { status: "limit_reached"; message: string }
  | { status: "error"; message: string };

/** Creates bike + components + intervals from the (possibly edited) preview.
 * Returns only on failure — success redirects to the new bike, throwing
 * internally like every redirect does, so no try/catch may wrap it. */
export async function createBikeFromAiSetup(payload: unknown): Promise<AiSetupCreateResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const parsed = aiSetupCreateSchema.safeParse(payload);
  if (!parsed.success) return { status: "invalid_input" };

  const { plan } = await getUserSubscription(userId);
  if (!hasAiSetupAccess(plan, userData?.claims?.email as string | undefined)) return { status: "forbidden" };

  const maxBikes = PLAN_LIMITS[plan].maxBikes;
  if (maxBikes !== null) {
    const { count } = await supabase.from("bikes").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= maxBikes) {
      return {
        status: "limit_reached",
        message: `Your ${plan} plan is limited to ${maxBikes} bike${maxBikes === 1 ? "" : "s"}. Upgrade in Settings to add more.`,
      };
    }
  }

  const { bike, factory, components } = parsed.data;
  const totalKm = bike.total_km ?? 0;
  const totalHours = bike.total_hours ?? 0;

  const { data: createdBike, error: bikeError } = await supabase
    .from("bikes")
    .insert({
      name: [bike.brand, bike.model, bike.version].filter(Boolean).join(" "),
      brand: bike.brand,
      model: bike.model,
      year: bike.year,
      type: bike.type,
      total_km: totalKm,
      total_hours: totalHours,
      user_id: userId,
    })
    .select("id")
    .single();
  if (bikeError || !createdBike) {
    return { status: "error", message: bikeError?.message ?? "Could not create bike" };
  }

  // Factory parts have been on since the bike's first kilometre — baseline 0
  // hands them the bike's whole usage. Recently replaced parts start fresh at
  // today's totals. (deriveComponentName's brand+model fallback, inlined:
  // the variant belongs in the display name but stays out of the model that
  // keys the maintenance profile.)
  const componentRows = components.map((component) => {
    const modelWithVariant = [component.model, component.variant].filter(Boolean).join(" ");
    return {
      name: [component.brand, modelWithVariant].join(" "),
      category: component.category,
      brand: component.brand,
      model: modelWithVariant,
      year: component.year,
      bike_id: createdBike.id,
      user_id: userId,
      bike_km_at_install: factory ? 0 : totalKm,
      bike_hours_at_install: factory ? 0 : totalHours,
      initial_km: 0,
      initial_hours: 0,
    };
  });

  const { data: createdComponents, error: componentsError } = await supabase
    .from("components")
    .insert(componentRows)
    .select("id");
  if (componentsError || !createdComponents || createdComponents.length !== components.length) {
    // The bike exists but its parts failed — surface the error; the user
    // lands on a bike they can fill manually rather than a silent half.
    return { status: "error", message: componentsError?.message ?? "Could not create components" };
  }

  const intervalRows = components.flatMap((component, i) =>
    component.intervals.map((interval, slot) => ({
      component_id: createdComponents[i].id,
      user_id: userId,
      slot: slot + 1,
      name: interval.name,
      interval_type: interval.type,
      interval_value: interval.interval,
    }))
  );
  if (intervalRows.length > 0) {
    const { error: intervalsError } = await supabase.from("component_service_intervals").insert(intervalRows);
    if (intervalsError) {
      return { status: "error", message: intervalsError.message };
    }
  }

  revalidatePath("/bikes");
  redirect(`/bikes/${createdBike.id}`);
}

async function withIntervals(
  supabase: SupabaseServerClient,
  userId: string,
  components: AiBikeComponent[],
  bikeType: string
): Promise<AiSetupComponent[]> {
  const resolved = await resolveIntervalsForComponents(supabase, userId, components, bikeType);
  return components.map((component, i) => ({
    ...component,
    intervals: resolved[i].intervals,
    selected: resolved[i].selected,
    intervalSourceUrl: resolved[i].sourceUrl,
  }));
}

async function logAiRequest(
  supabase: SupabaseServerClient,
  userId: string,
  input: { brand: string; model: string; version: string | null; year: number },
  outcome: BikeSearchOutcome
) {
  const { error } = await supabase.from("ai_request_log").insert({
    user_id: userId,
    kind: "bike",
    input,
    outcome: outcome.outcome,
    tokens: "tokens" in outcome ? outcome.tokens : null,
  });
  // A failed log line must not fail the search the user is waiting on —
  // but a silent gap in the quota ledger is worth a trace.
  if (error) console.error("[ai-setup] failed to log AI request:", error.message);
}
