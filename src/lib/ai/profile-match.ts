// Which maintenance_profiles row serves a component. Pure functions, split
// from profiles.ts so they can be tested without the Supabase client.
//
// Two fallbacks live here, both born of the curated library (2026-08-10):
// manufacturers key their schedules by base model and model year, while bike
// specs name components by trim — "38 Factory Grip X2" must find the "38"
// profile — and a component may carry no year, or one the library doesn't
// list.

/**
 * Progressively shorter whole-token prefixes of a NORMALIZED model:
 * "38 factory grip x2" → ["38 factory grip x2", "38 factory grip",
 * "38 factory", "38"]. The lookup queries all of them in one indexed
 * select; pickMaintenanceProfile prefers the longest one that has rows, so
 * a base-model row never outranks an exact match for the full trim.
 */
export function modelMatchCandidates(model: string): string[] {
  const tokens = model.split(" ").filter(Boolean);
  const candidates: string[] = [];
  for (let length = tokens.length; length >= 1; length--) {
    candidates.push(tokens.slice(0, length).join(" "));
  }
  return candidates;
}

/**
 * Model first, year second: the most specific model that has any row wins,
 * and only then does the year choose among that model's rows — exact year,
 * then the "any year" null row, then the nearest listed year (newer on a
 * tie).
 *
 * Nearest-year replaced "a different year is no match": that rule made
 * sense when every row was an AI answer for one specific year, but the
 * curated library holds contiguous per-year runs where schedules only
 * change at era boundaries — the nearest row is almost always the same
 * era, and refusing it forced a paid AI search that re-bought the same
 * schedule (or, for a year outside the run, bought nothing).
 */
export function pickMaintenanceProfile<T extends { model: string; year: number | null }>(
  rows: T[],
  componentYear: number | null
): T | null {
  if (rows.length === 0) return null;

  // All models here are prefixes of the same component model, so longest
  // string = most tokens = most specific.
  const specific = rows.reduce((a, b) => (b.model.length > a.model.length ? b : a)).model;
  const candidates = rows.filter((row) => row.model === specific);

  if (componentYear != null) {
    const exact = candidates.find((row) => row.year === componentYear);
    if (exact) return exact;
  }

  const anyYear = candidates.find((row) => row.year === null);
  if (anyYear) return anyYear;

  const dated = candidates.filter((row): row is T & { year: number } => row.year != null);
  if (componentYear == null) {
    // No year to be near — a yearless component is most likely current.
    return dated.reduce((a, b) => (b.year > a.year ? b : a));
  }
  return dated.reduce((a, b) => {
    const distanceA = Math.abs(a.year - componentYear);
    const distanceB = Math.abs(b.year - componentYear);
    if (distanceB < distanceA) return b;
    if (distanceB === distanceA && b.year > a.year) return b;
    return a;
  });
}
