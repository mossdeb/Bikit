// Which bike_catalog row answers a search, when the exact key missed.
//
// The exact key is (brand, model, version, year) and it is strict on purpose.
// What follows is the loosening — and every bit of it is deliberately narrow,
// because a WRONG catalog hit is the worst failure this feature has: it does
// not fail, does not search, does not write to the ledger. It is a hit. The
// only way to see it is to look at the card and know what should be there.
// A paid search is loud; a wrong free answer is silent.
//
// So: no fuzzy matching on the model, ever. Build levels differ by a single
// token — "Nomad 6 S" and "Nomad 6 R" carry different components — and any
// similarity threshold loose enough to forgive "Core4" for "Core 4" is also
// loose enough to hand someone another build's parts list.

import { combinedBikeName } from "./normalize";

/** Levenshtein, iterative, with an early bail on length alone. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** Below this many characters a brand is not guessed at all. Short names are
 * where edit distance lies: "bos", "fox" and "dvo" are one substitution from
 * each other and from plenty of non-brands. */
const MIN_BRAND_LENGTH = 6;

/**
 * The catalog brand a typed brand meant, or null when it is not worth
 * guessing. Exact match wins immediately; otherwise one edit per four
 * characters, capped at two.
 *
 * This exists because a brand typo produces an UNREACHABLE row, not just a
 * miss: measured in production, a search filed under "cannonda" holds a
 * complete Moterra SL that nobody typing "Cannondale" will ever reach. The
 * search was paid for and the answer is stranded.
 *
 * Brand only, never model. The brand set is small, closed and written by a
 * combobox; the model set is open and its neighbours are other builds of the
 * same bike.
 */
export function nearestBrand(wanted: string, known: readonly string[]): string | null {
  if (known.includes(wanted)) return wanted;
  if (wanted.length < MIN_BRAND_LENGTH) return null;

  const max = Math.min(2, Math.floor(wanted.length / 4));
  if (max < 1) return null;

  let bestDistance = max + 1;
  let closest: string[] = [];
  for (const candidate of known) {
    const distance = editDistance(wanted, candidate, max);
    if (distance > max) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = [candidate];
    } else if (distance === bestDistance) {
      closest.push(candidate);
    }
  }
  if (closest.length === 0) return null;
  if (closest.length === 1) return closest[0];

  // A tie is usually a coin toss and gets refused — but one shape of tie is
  // not. Typing stops early far more often than it goes wrong in the middle,
  // and a truncation that already produced a stranded row makes its own tie:
  // "cannondal" sits one edit from "cannondale" AND from "cannonda", a typo
  // row from an earlier search. Measured in production, exactly that pair
  // blocked the fix from firing. So prefer the brand the input is the start
  // of, and only give up when even that is ambiguous.
  const completions = closest.filter((candidate) => candidate.startsWith(wanted));
  return completions.length === 1 ? completions[0] : null;
}

/** How far from the searched year a row may sit. Adjacent model years of one
 * build are near enough always the same spec; a wider window starts reaching
 * across generations, where the parts genuinely change. Deliberately tighter
 * than the maintenance-profile lookup, which has no cap: a service cadence
 * survives a generation gap, a component list does not. */
export const MAX_YEAR_DISTANCE = 1;

export interface CatalogRow {
  model: string;
  version: string | null;
  year: number;
  confidence: number | null;
}

/**
 * The best row for a combined name, among rows already fetched for one brand.
 *
 * Equality of the FULL combined name — no prefixes, no subsets. The
 * loosening here is only the year: someone who types 2024 for a bike the
 * catalog knows as 2023 was paying for a search that already existed.
 * Nearest year first, then the more confident entry, then the more recent —
 * duplicate spellings of one bike are common and have to resolve somehow.
 */
export function pickCatalogEntry<T extends CatalogRow>(
  rows: readonly T[],
  wanted: { model: string; version: string | null; year: number }
): T | null {
  const name = combinedBikeName(wanted.model, wanted.version);
  const matches = rows
    .filter((row) => combinedBikeName(row.model, row.version) === name)
    .filter((row) => Math.abs(row.year - wanted.year) <= MAX_YEAR_DISTANCE);
  if (matches.length === 0) return null;

  return [...matches].sort((a, b) => {
    const byYear = Math.abs(a.year - wanted.year) - Math.abs(b.year - wanted.year);
    if (byYear !== 0) return byYear;
    const byConfidence = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (byConfidence !== 0) return byConfidence;
    return b.year - a.year;
  })[0];
}
