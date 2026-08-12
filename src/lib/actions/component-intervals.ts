"use server";

// The manual component form's half of the shared catalog. Same resolution
// the Smart Setup preview does — code defaults first, then a maintenance
// profile lookup — minus the half that costs money.
//
// LOOKUP ONLY, deliberately: no AI call, no quota, no ledger row. Adding a
// component by hand must stay free, so a model the catalog has never heard
// of simply comes back empty and the three slots stay as they were. The
// biggest win here isn't even the catalog: brakes, wheels and drivetrain
// are excluded from paid search on purpose but always have a code-defined
// schedule, and until now the reader faced three empty boxes for a job the
// app already knew the answer to.

import { createClient } from "@/lib/supabase/server";
import { normalizeBrand, normalizeModel } from "@/lib/ai/normalize";
import { modelMatchCandidates, pickMaintenanceProfile } from "@/lib/ai/profile-match";
import { defaultIntervalsFor } from "@/lib/ai/default-profiles";
import { selectTopIntervals, type MaintenanceInterval } from "@/lib/ai/intervals";

export interface IntervalSuggestion {
  intervals: MaintenanceInterval[];
  /** Where they came from, so the form can say so rather than filling
   * itself in silently. */
  origin: "default" | "profile";
}

export async function suggestComponentIntervals(input: {
  category: string;
  brand: string;
  model: string;
  year: number | null;
  /** Drives the code defaults' cadence — a spoke check is quarterly on an
   * enduro rig and yearly on a road bike. */
  bikeType: string;
}): Promise<IntervalSuggestion | null> {
  const brand = input.brand.trim();
  const model = input.model.trim();
  if (!brand || !model) return null;

  // Same precedence as resolveIntervalsForComponents: a code default wins
  // over the catalog, because it is scaled to how this bike is ridden and
  // the catalog cannot know that.
  const defaults = defaultIntervalsFor(input.category, input.bikeType, model);
  if (defaults) return { intervals: selectTopIntervals(defaults), origin: "default" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Every whole-token range of the model in one indexed select — spec sheets
  // name trims ("38 Factory Grip X2") and do not always put the base model
  // first ("Float Factory 36"). Same call as the Smart Setup's, candidates and
  // category included: without the category this path handed a fork the FOX
  // Float REAR SHOCK's schedule, which is exactly the bug the guard exists to
  // stop — it was just never wired up here.
  const candidates = modelMatchCandidates(normalizeModel(model));
  const { data: rows } = await supabase
    .from("maintenance_profiles")
    .select("model, year, category, intervals, source_url")
    .eq("brand", normalizeBrand(brand))
    .in("model", candidates);

  const profile = pickMaintenanceProfile(rows ?? [], input.year, {
    candidates,
    category: input.category,
  });
  if (!profile) return null;

  const intervals = profile.intervals as unknown as MaintenanceInterval[];
  // A curated empty profile is a negative cache — "this genuinely has no
  // schedule" — and must not be presented as a suggestion.
  if (intervals.length === 0) return null;

  return { intervals: selectTopIntervals(intervals), origin: "profile" };
}
