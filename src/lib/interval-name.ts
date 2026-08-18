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
 * Splits a trailing parenthetical off an interval name when it is a note
 * about the work rather than part of what the reminder is called.
 *
 * Some catalog names carry prose in brackets — "Lower Leg Service (clean/
 * inspect lowers, change oil bath if necessary)" — which belongs behind the
 * (i) and not in a heading that also wraps to three lines. Others carry a
 * qualifier that IS the identity: one component genuinely holds both "Full
 * Service (trail / off-road use)" and "Full Service", and stripping blindly
 * would print the same name twice on the same card.
 *
 * The two are told apart by shape, because nothing in the data marks them:
 * prose lists actions, so it carries a comma or a semicolon, or it simply
 * runs long. Measured against all nine bracketed names in production on
 * 2026-08-18 this separates them exactly; it is a heuristic on real data, not
 * a rule the data guarantees, so a name that defeats it shows its bracket
 * inline — which is today's behaviour and therefore no worse.
 *
 * Only a trailing parenthetical counts: a bracket in the middle is part of
 * the phrase around it.
 */
const NOTE_MIN_LENGTH = 30;

export function splitIntervalNote(name: string): { name: string; note: string | null } {
  const match = name.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!match) return { name, note: null };

  const [, head, inner] = match;
  if (!head.trim()) return { name, note: null };

  const readsAsProse = /[,;]/.test(inner) || inner.length >= NOTE_MIN_LENGTH;
  return readsAsProse ? { name: head.trim(), note: inner.trim() } : { name, note: null };
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
