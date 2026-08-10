// Maintenance Catalog resolution, in two phases: everything cheap first
// (code defaults, catalog lookups — free), then ONE batched AI call for
// whatever remains unresolved. Together with the bike search that makes a
// brand-new bike cost two AI calls total — and the catalog is the half of
// the pattern that fills fastest, so most bikes never reach phase two: a
// FOX 38 or a Code RSC appears on half the bikes out there, and the second
// bike carrying one resolves free.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import { normalizeBrand, normalizeModel } from "./normalize";
import { modelMatchCandidates, pickMaintenanceProfile } from "./profile-match";
import { searchMaintenanceBatchWithAI } from "./maintenance-search";
import { saveMaintenanceProfile } from "./catalog";
import { defaultIntervalsFor } from "./default-profiles";
import { selectTopIntervals, type MaintenanceInterval } from "./intervals";
import type { AiBikeComponent } from "./bike-search";

type Supabase = SupabaseClient<Database>;

export interface ResolvedIntervals {
  /** Everything the profile documents — shown in the preview for swapping. */
  intervals: MaintenanceInterval[];
  /** The app's pick for the 3 slots (selectTopIntervals). */
  selected: MaintenanceInterval[];
  sourceUrl: string | null;
  /** 'none' means no profile and no usable AI answer: the component is still
   * created, just without intervals — partial success, not failure.
   * 'default' is a code-defined schedule (default-profiles.ts): no catalog
   * row and no AI call behind it. */
  origin: "profile" | "ai" | "none" | "default";
}

/**
 * The AI fallback only fires for categories where manufacturers actually
 * publish service schedules — measured on the first real bike, every tire,
 * saddle, cockpit and brake search came back empty and cost the same as a
 * hit, so more than half the spend bought nothing. Catalog lookups still
 * run for EVERY category (they're free); this list only gates paid
 * searches. Widening coverage is adding a category here.
 */
export const AI_MAINTENANCE_SEARCH_CATEGORIES: ReadonlySet<string> = new Set([
  "Front Suspension (Fork)",
  "Rear Suspension",
  "Seatpost",
  "Frame",
  "Electric",
]);

/** More components than this in one AI call and per-component quality drops;
 * a rare parts-heavy e-bike simply gets a second batch. */
const MAX_BATCH = 6;

export async function resolveIntervalsForComponents(
  supabase: Supabase,
  userId: string,
  components: AiBikeComponent[],
  /** The bike's BIKE_TYPES entry — code-defined defaults scale their cadence
   * to how the bike is ridden (a spoke check quarterly on an enduro rig,
   * yearly on a road bike). */
  bikeType: string
): Promise<ResolvedIntervals[]> {
  // Two identical tires must not cost two AI resolutions — resolve unique
  // keys once and fan the answers back out. The category is part of the key:
  // house brands reuse one model name across parts ("Canyon G5" is a stem,
  // a bar AND a dropper), and without it the first arrival's resolution —
  // possibly "category not searchable" — silenced the rest.
  const keyOf = (c: AiBikeComponent) =>
    `${c.category}|${normalizeBrand(c.brand)}|${normalizeModel(c.model)}|${c.year ?? ""}`;
  const unique = new Map<string, AiBikeComponent>();
  for (const component of components) {
    if (!unique.has(keyOf(component))) unique.set(keyOf(component), component);
  }

  const resolved = new Map<string, ResolvedIntervals>();
  const pending: [string, AiBikeComponent][] = [];

  // Phase 1 — free: defaults, then catalog lookups (a handful of indexed
  // selects; run together).
  await Promise.all(
    [...unique.entries()].map(async ([key, component]) => {
      const defaults = defaultIntervalsFor(component.category, bikeType);
      if (defaults) {
        resolved.set(key, {
          intervals: defaults,
          selected: selectTopIntervals(defaults),
          sourceUrl: null,
          origin: "default",
        });
        return;
      }

      // The candidates are every whole-token prefix of the model, fetched in
      // one select — spec sheets name trims ("38 Factory Grip X2") while the
      // curated library keys by base model ("38"). profile-match.ts decides.
      const { data: rows } = await supabase
        .from("maintenance_profiles")
        .select("model, year, intervals, source_url")
        .eq("brand", normalizeBrand(component.brand))
        .in("model", modelMatchCandidates(normalizeModel(component.model)));

      const profile = pickMaintenanceProfile(rows ?? [], component.year);
      if (profile) {
        const intervals = profile.intervals as unknown as MaintenanceInterval[];
        resolved.set(key, {
          intervals,
          selected: selectTopIntervals(intervals),
          sourceUrl: profile.source_url,
          origin: "profile",
        });
        return;
      }

      if (!AI_MAINTENANCE_SEARCH_CATEGORIES.has(component.category)) {
        // Not searched, not logged, not negative-cached: the component is
        // still created and the user adds reminders by hand, as always.
        resolved.set(key, { intervals: [], selected: [], sourceUrl: null, origin: "none" });
        return;
      }

      pending.push([key, component]);
    })
  );

  // Phase 2 — paid: one batched call for everything the lookup left open.
  for (let i = 0; i < pending.length; i += MAX_BATCH) {
    const batch = pending.slice(i, i + MAX_BATCH);
    await resolveBatch(supabase, userId, batch, resolved);
  }

  return components.map((component) => resolved.get(keyOf(component))!);
}

async function resolveBatch(
  supabase: Supabase,
  userId: string,
  batch: [string, AiBikeComponent][],
  resolved: Map<string, ResolvedIntervals>
) {
  const inputs = batch.map(([, c]) => ({ brand: c.brand, model: c.model, year: c.year }));
  const outcome = await searchMaintenanceBatchWithAI(inputs);

  if (outcome.outcome !== "ok") {
    // Provider error or unparseable batch: nothing is negative-cached (it
    // says nothing about the documentation) and everyone falls to 'none'.
    if (outcome.outcome === "error") console.error("[ai-setup] maintenance batch failed:", outcome.message);
    await logBatch(supabase, userId, batch, () => outcome.outcome, "tokens" in outcome ? outcome.tokens : null);
    for (const [key] of batch) {
      resolved.set(key, { intervals: [], selected: [], sourceUrl: null, origin: "none" });
    }
    return;
  }

  await logBatch(
    supabase,
    userId,
    batch,
    (i) => {
      const r = outcome.results[i];
      return r == null ? "invalid" : r.found && r.maintenance.length > 0 ? "found" : "not_found";
    },
    outcome.tokens
  );

  await Promise.all(
    batch.map(async ([key, component], i) => {
      const result = outcome.results[i];

      if (result && result.found && result.maintenance.length > 0) {
        // Saved before returning (no fire-and-forget in a serverless
        // runtime) so the next bike carrying this component resolves free.
        await saveMaintenanceProfile({
          brand: component.brand,
          model: component.model,
          year: component.year,
          intervals: result.maintenance,
          sourceUrl: outcome.sourceUrl,
          confidence: result.confidence,
        });
        resolved.set(key, {
          intervals: result.maintenance,
          selected: selectTopIntervals(result.maintenance),
          sourceUrl: outcome.sourceUrl,
          origin: "ai",
        });
        return;
      }

      if (result && !result.found) {
        // Negative cache: an EMPTY profile row, so no future bike carrying
        // this component re-pays a search that found nothing. Only for a
        // genuine not_found — a dropped/misaligned entry (result null) says
        // nothing about the documentation. Deleting the row is how curation
        // re-opens the search.
        await saveMaintenanceProfile({
          brand: component.brand,
          model: component.model,
          year: component.year,
          intervals: [],
          sourceUrl: null,
          confidence: 0,
        });
      }
      resolved.set(key, { intervals: [], selected: [], sourceUrl: null, origin: "none" });
    })
  );
}

/** One ledger row per component, same as the single-call era, so the quota
 * and cost queries keep working — the batch's tokens are split evenly
 * across its rows (they can't be attributed more precisely). */
async function logBatch(
  supabase: Supabase,
  userId: string,
  batch: [string, AiBikeComponent][],
  outcomeOf: (index: number) => string,
  totalTokens: number | null
) {
  const perRow = totalTokens != null ? Math.round(totalTokens / batch.length) : null;
  const { error } = await supabase.from("ai_request_log").insert(
    batch.map(([, component], i) => ({
      user_id: userId,
      kind: "component",
      input: { brand: component.brand, model: component.model, year: component.year },
      outcome: outcomeOf(i),
      tokens: perRow,
    }))
  );
  if (error) console.error("[ai-setup] failed to log AI batch:", error.message);
}
