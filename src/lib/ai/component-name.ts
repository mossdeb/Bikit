// How a spec-sheet component becomes a name, a model and a note.
//
// The AI returns brand/model/variant separately, and the variant is two
// different things depending on the bike. Measured over the 328 variants in
// bike_catalog (2026-08-12): the average is 27 characters and most are the
// only thing telling two parts apart — a groupset gives crankset, chain,
// cassette and derailleur ONE model ("SRAM GX Eagle T-Type") and separates
// them with "chain", "long cage", "Crankset". Drop those and the bike gets
// four components with the same name.
//
// The other 63 are the manufacturer's prose: "160mm travel, Grip2 Damper,
// Kashima coating, 15x110mm Kabolt thru-axle, tapered steerer, 44mm offset"
// — 100 characters that wrap over three lines on a card and say nothing a
// reminder needs. Those go to components.notes and are shown under the name.

/**
 * At or under this length a variant is a qualifier and stays in the name;
 * longer, it is spec prose and moves to the notes. Arbitrary by nature — the
 * preview leaves the variant editable so a bad call costs one keystroke.
 */
export const VARIANT_NAME_LIMIT = 30;

export interface ComponentNaming {
  /** What the user sees as the component's name. */
  name: string;
  /** The model ALONE. Shorter is strictly better here: this is what keys the
   * catalog lookup that suggests a maintenance calendar when a component is
   * edited by hand, and a whole spec sheet in the field only adds noise. */
  model: string;
  /** The prose that did not earn a place in the name. */
  notes: string | null;
}

export function splitComponentNaming(brand: string, model: string, variant?: string | null): ComponentNaming {
  const cleanBrand = brand.trim();
  const cleanModel = model.trim();
  // A trailing separator would otherwise ride into the name as "36 160mm
  // travel," — spec sheets end in one often enough to be worth stripping.
  const cleanVariant = (variant ?? "").trim().replace(/[,;\s]+$/, "");
  const named = (qualifier: string) => [cleanBrand, cleanModel, qualifier].filter(Boolean).join(" ");

  if (!cleanVariant) return { name: named(""), model: cleanModel, notes: null };

  // Short enough to read on one line: today's behaviour, unchanged.
  if (cleanVariant.length <= VARIANT_NAME_LIMIT) {
    return { name: named(cleanVariant), model: cleanModel, notes: null };
  }

  return { name: named(""), model: cleanModel, notes: cleanVariant };
}
