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
