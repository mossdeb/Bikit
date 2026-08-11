import type { Dictionary } from "@/lib/i18n/dictionaries/en";

/**
 * The reader-facing name of a maintenance interval from the shared catalog.
 *
 * Stored names are canonical English (see CANONICAL_INTERVAL_NAMES in
 * src/lib/ai/intervals.ts) because the Maintenance Catalog is shared by all
 * users across both languages — same arrangement as component categories.
 * Unlike categories the set is open: the AI may bring a manufacturer-specific
 * name, which shows verbatim rather than not at all.
 *
 * User-typed interval names pass through here too and fall out untouched,
 * since they won't match any canonical key.
 */
export function intervalName(dict: Dictionary, name: string): string {
  const labels: Record<string, string | undefined> = dict.components.intervalNames;
  return labels[name] ?? name;
}

/**
 * The way back: a reader-facing label to the canonical English it stands
 * for, so what is SHOWN can be Portuguese while what is STORED stays the
 * shared key. Without this, prefilling a form with a translated name would
 * write "Sangria dos travões" into the database — a string that no longer
 * matches any dictionary entry and therefore stops translating the moment
 * the reader switches language.
 *
 * Anything that isn't a known label falls through untouched, which is what
 * keeps hand-written names ("Revisão do meu mecânico") intact. A label that
 * two canonical names share (both dropper "tube" services translate the
 * same) resolves to the first — they mean the same job and render
 * identically, so the choice is not observable.
 */
export function canonicalIntervalName(dict: Dictionary, label: string): string {
  const trimmed = label.trim();
  for (const [canonical, translated] of Object.entries(dict.components.intervalNames)) {
    if (translated === trimmed) return canonical;
  }
  return trimmed;
}
