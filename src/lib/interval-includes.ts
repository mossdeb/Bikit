// The services one reminder covers, on the two boundaries where they arrive
// as untyped data: a hidden form field (a string, written by us but round
// tripping through the browser) and the catalog's jsonb (written by curation
// by hand). Both are parsed here so neither can reach a render as something
// other than an array of strings.
//
// This lives outside actions/components.ts on purpose: that file is
// "use server", where every export becomes an endpoint reachable from the
// client. A pure helper has no business being one — and it also makes this
// testable, which a server action is not.

/** Longest merge measured in the curated library is a Canyon frame's
 * 11-service annual; 20 leaves room without letting a bad row grow forever. */
const MAX_INCLUDES = 20;

/**
 * Anything that isn't an array of non-empty strings reads as "no list".
 * Never throws and never partially trusts: this is supplementary detail, and
 * a component must not fail to save — nor a page fail to render — over it.
 */
export function asIncludes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  return names.length > 0 ? names.slice(0, MAX_INCLUDES) : undefined;
}

/**
 * The hidden interval_includes_{slot} field: `{"for": "Full Service",
 * "includes": ["Lower Leg Service", …]}`.
 *
 * `for` is checked against the name actually submitted, because the name is a
 * free-text input. Someone who renames "Full Service" to "my fork thing" has
 * repurposed the slot, and a list that travelled along would describe a
 * reminder that no longer exists — so it is dropped rather than kept on a
 * guess. Renaming back is not a way to recover it; the catalog is.
 *
 * @param canonicalSubmittedName the submitted name AFTER canonicalIntervalName,
 *   since `for` is stored canonical and the visible field is translated.
 */
export function parseIntervalIncludes(
  raw: FormDataEntryValue | null,
  canonicalSubmittedName: string
): string[] | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { for: describes, includes } = parsed as { for?: unknown; includes?: unknown };
  if (typeof describes !== "string") return undefined;
  if (describes.trim().toLowerCase() !== canonicalSubmittedName.trim().toLowerCase()) return undefined;
  return asIncludes(includes);
}
