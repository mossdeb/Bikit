// Maintenance Catalog resolution: for each component of a found bike, use a
// stored profile when one exists and fall back to one AI search when it
// doesn't. This is the half of the pattern that fills fastest — a FOX 38 or
// a Code RSC appears on half the bikes out there, so the second bike that
// carries one resolves free.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import { normalizeBrand, normalizeModel } from "./normalize";
import { searchMaintenanceWithAI, type MaintenanceSearchOutcome } from "./maintenance-search";
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

/** Gentle on OpenAI's rate limits without serializing 14 lookups. */
const CONCURRENCY = 4;

export async function resolveIntervalsForComponents(
  supabase: Supabase,
  userId: string,
  components: AiBikeComponent[],
  /** The bike's BIKE_TYPES entry — code-defined defaults scale their cadence
   * to how the bike is ridden (a spoke check quarterly on an enduro rig,
   * yearly on a road bike). */
  bikeType: string
): Promise<ResolvedIntervals[]> {
  // Two identical tires must not cost two AI calls — resolve unique keys
  // once and fan the answers back out. The category is part of the key:
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
  const entries = [...unique.entries()];
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY);
    const answers = await Promise.all(chunk.map(([, component]) => resolveOne(supabase, userId, component, bikeType)));
    chunk.forEach(([key], j) => resolved.set(key, answers[j]));
  }

  return components.map((component) => resolved.get(keyOf(component))!);
}

async function resolveOne(
  supabase: Supabase,
  userId: string,
  component: AiBikeComponent,
  bikeType: string
): Promise<ResolvedIntervals> {
  // Code-defined defaults win outright for their categories — no lookup, no
  // search, no negative cache to shadow them. The preview's checkbox is the
  // opt-out.
  const defaults = defaultIntervalsFor(component.category, bikeType);
  if (defaults) {
    return { intervals: defaults, selected: selectTopIntervals(defaults), sourceUrl: null, origin: "default" };
  }

  const brand = normalizeBrand(component.brand);
  const model = normalizeModel(component.model);

  const { data: rows } = await supabase
    .from("maintenance_profiles")
    .select("year, intervals, source_url")
    .eq("brand", brand)
    .eq("model", model);

  const profile = pickProfile(rows ?? [], component.year);
  if (profile) {
    const intervals = profile.intervals as unknown as MaintenanceInterval[];
    return { intervals, selected: selectTopIntervals(intervals), sourceUrl: profile.source_url, origin: "profile" };
  }

  if (!AI_MAINTENANCE_SEARCH_CATEGORIES.has(component.category)) {
    // Not searched, not logged, not negative-cached: the component is still
    // created and the user adds reminders by hand, as they always could.
    return { intervals: [], selected: [], sourceUrl: null, origin: "none" };
  }

  const outcome = await searchMaintenanceWithAI({
    brand: component.brand,
    model: component.model,
    year: component.year,
  });
  await logComponentRequest(supabase, userId, component, outcome);

  if (outcome.outcome === "found") {
    const intervals = outcome.data.maintenance;
    // Saved before returning (no fire-and-forget in a serverless runtime) so
    // the next bike carrying this component resolves free.
    await saveMaintenanceProfile({
      brand: component.brand,
      model: component.model,
      year: component.year,
      intervals,
      sourceUrl: outcome.sourceUrl,
      confidence: outcome.data.confidence,
    });
    return { intervals, selected: selectTopIntervals(intervals), sourceUrl: outcome.sourceUrl, origin: "ai" };
  }
  if (outcome.outcome === "not_found") {
    // Negative cache: an EMPTY profile row, so no future bike carrying this
    // component re-pays a search that found nothing — without it, every
    // catalog hit re-ran the failed searches and the "free" path wasn't.
    // Only for a genuine not_found: 'invalid' is our parsing, 'error' is
    // the provider, and neither says anything about the documentation.
    // Deleting the row is how curation re-opens the search.
    await saveMaintenanceProfile({
      brand: component.brand,
      model: component.model,
      year: component.year,
      intervals: [],
      sourceUrl: null,
      confidence: 0,
    });
  }
  if (outcome.outcome === "error") {
    console.error("[ai-setup] maintenance search failed:", outcome.message);
  }
  return { intervals: [], selected: [], sourceUrl: null, origin: "none" };
}

/** An exact model-year row wins; the year-agnostic (null) row is the
 * fallback. A row for a DIFFERENT year is neither — a 2020 damper schedule
 * asserting itself over a 2025 fork would be worse than asking. */
function pickProfile<T extends { year: number | null }>(rows: T[], componentYear: number | null): T | null {
  if (componentYear != null) {
    const exact = rows.find((r) => r.year === componentYear);
    if (exact) return exact;
  }
  return rows.find((r) => r.year === null) ?? null;
}

async function logComponentRequest(
  supabase: Supabase,
  userId: string,
  component: AiBikeComponent,
  outcome: MaintenanceSearchOutcome
) {
  const { error } = await supabase.from("ai_request_log").insert({
    user_id: userId,
    kind: "component",
    input: { brand: component.brand, model: component.model, year: component.year },
    outcome: outcome.outcome,
    tokens: "tokens" in outcome ? outcome.tokens : null,
  });
  if (error) console.error("[ai-setup] failed to log AI request:", error.message);
}
