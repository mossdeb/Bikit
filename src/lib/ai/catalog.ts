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
/** Below this, the AI's own spelling is a guess and must not become a
 * catalog key — it answered about a bike whose name it did not quite
 * recognize. The searched spelling is still stored, so nothing is lost. */
const SPELLING_TRUST_THRESHOLD = 0.95;

/**
 * Which keys one answer is filed under — usually one, two when the AI read
 * past a typo.
 *
 * A search for "Monterra LT 2" comes back as "Moterra Neo / Carbon LT 2":
 * the model corrects the spelling silently, and keying only on what was
 * typed buried a good 24-component answer under a name no correct search
 * will ever ask for. Measured on one Cannondale (2026-08-11): three
 * spellings, three paid searches, three rows — and the right spelling
 * missing all of them.
 *
 * The searched key comes FIRST and unconditionally: it is what this reader
 * will type again, and it must exist even if the second write fails. The
 * AI's spelling is an addition, never a replacement, and only when it is
 * confident enough for its spelling to be worth trusting.
 */
export function catalogKeysFor(
  searched: { brand: string; model: string; version: string | null; year: number },
  display: { brand: string; model: string; version: string },
  confidence: number
) {
  const keys = [bikeCatalogKey(searched)];
  if (confidence < SPELLING_TRUST_THRESHOLD) return keys;

  const identified = bikeCatalogKey({
    brand: display.brand,
    model: display.model,
    version: display.version,
    // The user's year stays authoritative — the model emits 0 when the
    // source doesn't state one, and the year is the key.
    year: searched.year,
  });
  const differs =
    identified.brand !== keys[0].brand ||
    identified.model !== keys[0].model ||
    identified.version !== keys[0].version;
  return differs ? [...keys, identified] : keys;
}

export async function saveBikeCatalogEntry(input: {
  searched: { brand: string; model: string; version: string | null; year: number };
  display: { brand: string; model: string; version: string; year: number; type: string };
  components: AiBikeComponent[];
  sourceUrl: string | null;
  confidence: number;
}): Promise<void> {
  const admin = createAdminClient();
  const row = {
    display: input.display as unknown as Json,
    components: input.components as unknown as Json,
    source_url: input.sourceUrl,
    confidence: input.confidence,
    status: statusForConfidence(input.confidence),
  };

  for (const key of catalogKeysFor(input.searched, input.display, input.confidence)) {
    const { error } = await admin
      .from("bike_catalog")
      .upsert({ ...key, ...row }, { onConflict: "brand,model,version,year" });
    if (error) console.error("[ai-setup] failed to save bike catalog entry:", error.message);
  }
}

/** Profile rows are keyed per model year when the component has one — a 2024
 * and a 2025 fork may genuinely differ — and on the null "any year" row when
 * it doesn't. The nulls-not-distinct unique key keeps the null row singular,
 * and ON CONFLICT resolves against it (verified against Postgres 17). */
export async function saveMaintenanceProfile(input: {
  brand: string;
  model: string;
  year: number | null;
  /** The category of the component this answer was bought for — stored so the
   * lookup can keep a fork off a shock's profile without having to guess the
   * kind from the service names (migration 00031). Null only when the caller
   * genuinely has no category. */
  category: string | null;
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
      category: input.category,
      intervals: input.intervals as unknown as Json,
      source_url: input.sourceUrl,
      confidence: input.confidence,
      status: statusForConfidence(input.confidence),
    },
    { onConflict: "brand,model,year" }
  );
  if (error) console.error("[ai-setup] failed to save maintenance profile:", error.message);
}
