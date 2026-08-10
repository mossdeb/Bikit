// Catalog keys are matched by string equality in the database, so both
// writers and readers must funnel every key part through these functions.
// The catalogs store the normalized form; the original spelling travels
// separately (bike_catalog.display) for presentation.

/** Lowercase, accent-stripped, punctuation collapsed to single spaces:
 * "YT Industries " → "yt industries", "S-Works" → "s works",
 * "Suspensão" → "suspensao". Deterministic and idempotent — safe to apply
 * twice, so callers never need to know whether a value is already
 * normalized. */
export function normalizeKeyPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Corporate suffixes that riders drop but spec sheets keep. Stripped as
 * whole tokens wherever they appear, so "YT Industries", "Santa Cruz
 * Bicycles" and "Cycles Devinci" all shed them — but only while something
 * remains, so a brand literally named "Bikes" would survive intact. */
const BRAND_NOISE_TOKENS = new Set(["industries", "bicycles", "bikes", "cycles", "bike", "cycle", "gmbh", "inc", "co"]);

/** Brand normalization: key normalization plus corporate-suffix stripping,
 * so "YT" and "YT Industries" resolve to the same catalog row. */
export function normalizeBrand(value: string): string {
  const base = normalizeKeyPart(value);
  const kept = base.split(" ").filter((token) => !BRAND_NOISE_TOKENS.has(token));
  return kept.length > 0 ? kept.join(" ") : base;
}

/** The maintenance-profile key deliberately ignores the variant: "38 Factory"
 * and "38 Factory Grip X2" must resolve to the same service profile. Callers
 * pass the model WITHOUT the variant concatenated. */
export function normalizeModel(value: string): string {
  return normalizeKeyPart(value);
}

/**
 * Model and version collapsed into one normalized token string — "Nomad" +
 * "6 S", "Nomad 6" + "S" and "Nomad 6 S" + "" all yield "nomad 6 s". The
 * catalog lookup falls back to this when the exact model/version split
 * misses: users split the same bike name differently across the two fields,
 * and each split is a distinct unique key. Equality of the FULL combined
 * name is deliberate — no prefix loosening here, because build levels
 * ("Nomad 6 S" vs "Nomad 6 R") differ in components and must never match.
 */
export function combinedBikeName(model: string, version?: string | null): string {
  return normalizeKeyPart(`${model} ${version ?? ""}`);
}

/** The bike-catalog key. `version` is "" when the bike has none — the column
 * is non-null so the unique key treats versionless rows as equal. */
export function bikeCatalogKey(input: { brand: string; model: string; version?: string | null; year: number }) {
  return {
    brand: normalizeBrand(input.brand),
    model: normalizeKeyPart(input.model),
    version: normalizeKeyPart(input.version ?? ""),
    year: input.year,
  };
}
