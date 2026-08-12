// Which maintenance_profiles row serves a component. Pure functions, split
// from profiles.ts so they can be tested without the Supabase client.
//
// Three fallbacks live here, all born of the curated library: manufacturers
// key their schedules by base model and model year, while bike specs name
// components by trim — "38 Factory Grip X2" must find the "38" profile — and
// a component may carry no year, or one the library doesn't list. The third
// is the category guard below.

/**
 * Every whole-token RANGE of a NORMALIZED model, longest first and leftmost
 * within a length: "38 factory grip x2" starts at the full string and ends at
 * the single tokens. The lookup queries all of them in one indexed select and
 * pickMaintenanceProfile prefers the earliest candidate that has rows, so a
 * base-model row never outranks an exact match for the full trim.
 *
 * Ranges and not just prefixes because the base model is not always written
 * first. Measured in production: the Cannondale Moterra SL 2024 lists its fork
 * as "Float Factory 36", whose prefixes are "float factory 36" → "float
 * factory" → "float" — and "float" is the FOX Float REAR SHOCK, which matched
 * happily and dressed a fork in air-sleeve services. The "36" that the rider
 * actually owns was never reachable from the left.
 */
export function modelMatchCandidates(model: string): string[] {
  const tokens = model.split(" ").filter(Boolean);
  const candidates: string[] = [];
  for (let length = tokens.length; length >= 1; length--) {
    for (let start = 0; start + length <= tokens.length; start++) {
      candidates.push(tokens.slice(start, start + length).join(" "));
    }
  }
  return [...new Set(candidates)];
}

/**
 * What a profile is FOR, read from the services it documents. The catalog key
 * is (brand, model, year) with no category, so this is the only thing standing
 * between a fork and a shock that share a name.
 *
 * The markers are the services that only one kind of part can have, verified
 * against the whole library on 2026-08-12: of 2.605 profiles carrying any
 * marker, 1.233 were fork/post-only and 320 shock-only, and NOT ONE carried
 * markers of two kinds. Deliberately narrow — "Air Spring Service" and "Damper
 * Service" appear on both and say nothing.
 */
const KIND_MARKERS = {
  fork: /lower leg|dust wiper/i,
  shock: /air sleeve|air can/i,
  post: /upper post|lower post/i,
} as const;

type ProfileKind = keyof typeof KIND_MARKERS;

const CATEGORY_KIND: Readonly<Record<string, ProfileKind>> = {
  "Front Suspension (Fork)": "fork",
  "Rear Suspension": "shock",
  Seatpost: "post",
};

/** Null when nothing matches (most profiles — motors, drivetrains, negative
 * caches) and also when two kinds somehow match: an ambiguous profile must not
 * be filtered out on a guess. */
function profileKind(intervals: unknown): ProfileKind | null {
  if (!Array.isArray(intervals)) return null;
  const names = intervals
    .map((interval) => (interval as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string")
    .join(" | ");
  const kinds = (Object.keys(KIND_MARKERS) as ProfileKind[]).filter((kind) => KIND_MARKERS[kind].test(names));
  return kinds.length === 1 ? kinds[0] : null;
}

/** A fork never wants a shock's schedule. Only ever excludes when BOTH sides
 * are known — an unknown category or an unmarked profile keeps the row, so
 * this can only remove matches that are provably wrong. */
function categoryAllows(category: string | null | undefined, intervals: unknown): boolean {
  const wanted = category ? CATEGORY_KIND[category] : undefined;
  if (!wanted) return true;
  const kind = profileKind(intervals);
  return kind === null || kind === wanted;
}

export interface PickProfileOptions {
  /** The component's category, to reject profiles of another kind. */
  category?: string | null;
  /** The candidate list that fetched these rows, in priority order. Given it,
   * specificity is the candidate's rank instead of the model string's length,
   * which stops a long one-token match outranking a short two-token one now
   * that candidates are ranges. It does NOT separate two candidates of equal
   * token count — "float" and "36" are both single tokens of "float factory
   * 36", and the leftmost wins. Only `category` tells those two apart. */
  candidates?: string[];
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
export function pickMaintenanceProfile<T extends { model: string; year: number | null; intervals?: unknown }>(
  rows: T[],
  componentYear: number | null,
  options: PickProfileOptions = {}
): T | null {
  const eligible = rows.filter((row) => categoryAllows(options.category, row.intervals));
  if (eligible.length === 0) return null;

  // Rank by candidate order when we have it; otherwise longest string, which
  // is the same thing back when every candidate was a prefix.
  const rank = (model: string) => {
    const index = options.candidates?.indexOf(model) ?? -1;
    return index === -1 ? Number.MAX_SAFE_INTEGER - model.length : index;
  };
  const specific = eligible.reduce((a, b) => (rank(b.model) < rank(a.model) ? b : a)).model;
  const candidates = eligible.filter((row) => row.model === specific);

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
