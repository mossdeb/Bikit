// Writes to the two shared catalogs. RLS gives them no write policy at all —
// every write comes through here, on the service-role admin client, from a
// server action; the same arrangement as the Stripe webhook writing
// subscriptions.
//
// What gets stored is what the AI found at the source, never the user's
// edits: a correction and a personalization are indistinguishable, and one
// user's custom fork must not become everyone's factory spec.

import { createAdminClient } from "../supabase/admin";
import { bikeCatalogKey, normalizeBrand, normalizeModel } from "./normalize";
import type { AiBikeComponent } from "./bike-search";
import type { MaintenanceInterval } from "./intervals";
import type { Json } from "../../types/database.types";

/** Self-reported confidence is a triage heuristic, not a probability. At or
 * above the threshold an entry lands as 'unverified'; below it,
 * 'low_confidence' — still serving its own searcher, but flagged for review
 * before it should be trusted at scale. 'verified' is future human curation
 * and is never written here. */
const CONFIDENCE_THRESHOLD = 0.95;

export function statusForConfidence(confidence: number): "unverified" | "low_confidence" {
  return confidence >= CONFIDENCE_THRESHOLD ? "unverified" : "low_confidence";
}

/** Upsert, not insert: two users racing to search the same unknown bike both
 * land here, and the unique key makes the second write an update. A failed
 * catalog write is logged and swallowed — the user still gets their result;
 * only the NEXT searcher pays again. */
export async function saveBikeCatalogEntry(input: {
  searched: { brand: string; model: string; version: string | null; year: number };
  display: { brand: string; model: string; version: string; year: number; type: string };
  components: AiBikeComponent[];
  sourceUrl: string | null;
  confidence: number;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("bike_catalog").upsert(
    {
      ...bikeCatalogKey(input.searched),
      display: input.display as unknown as Json,
      components: input.components as unknown as Json,
      source_url: input.sourceUrl,
      confidence: input.confidence,
      status: statusForConfidence(input.confidence),
    },
    { onConflict: "brand,model,version,year" }
  );
  if (error) console.error("[ai-setup] failed to save bike catalog entry:", error.message);
}

/** Profile rows are keyed per model year when the component has one — a 2024
 * and a 2025 fork may genuinely differ — and on the null "any year" row when
 * it doesn't. The nulls-not-distinct unique key keeps the null row singular,
 * and ON CONFLICT resolves against it (verified against Postgres 17). */
export async function saveMaintenanceProfile(input: {
  brand: string;
  model: string;
  year: number | null;
  intervals: MaintenanceInterval[];
  sourceUrl: string | null;
  confidence: number;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("maintenance_profiles").upsert(
    {
      brand: normalizeBrand(input.brand),
      model: normalizeModel(input.model),
      year: input.year,
      intervals: input.intervals as unknown as Json,
      source_url: input.sourceUrl,
      confidence: input.confidence,
      status: statusForConfidence(input.confidence),
    },
    { onConflict: "brand,model,year" }
  );
  if (error) console.error("[ai-setup] failed to save maintenance profile:", error.message);
}
