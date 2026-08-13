import { z } from "zod";
import { COMPONENT_CATEGORIES } from "@/lib/constants";
import { INTERVAL_TYPES } from "@/lib/ai/intervals";

const currentYear = new Date().getFullYear();

/** The AI search needs what the catalog key needs: brand, model and year are
 * mandatory (unlike the manual bike form, where everything is optional) —
 * without them there is nothing to search for.
 *
 * Year is capped to 2010..current year: outside that range a paid search is
 * near-guaranteed to come back empty — manufacturers rarely keep older spec
 * sheets online — so the bounds are cost protection as much as validation.
 * Current year + 1 because the industry launches next model year mid-year:
 * a "2027" bike is on sale in September 2026. */
export const aiSetupSearchSchema = z.object({
  brand: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(120),
  version: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().max(120).nullable()
  ),
  year: z.coerce.number().int().min(2010).max(currentYear + 1),
});

export type AiSetupSearchInput = z.infer<typeof aiSetupSearchSchema>;

/** The preview's output, revalidated on the server: nothing the client sends
 * is trusted — categories must be canonical, intervals capped at the 3 slots,
 * list sizes bounded. The same rules the AI's own answer had to pass. */
export const aiSetupCreateSchema = z.object({
  bike: z.object({
    brand: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
    version: z.string().trim().max(120),
    // Same 2010..current bounds as the search schema — the created bike's
    // year is always the searched year.
    year: z.number().int().min(2010).max(currentYear + 1),
    type: z.string().trim().min(1).max(60),
    total_km: z.number().min(0).max(1000000).nullable(),
    total_hours: z.number().min(0).max(1000000).nullable(),
    /** Chosen on the Strava step; null when skipped or not connected. */
    strava_gear_id: z.string().trim().max(120).nullable(),
  }),
  /** Factory components inherit the bike's usage (baseline 0); replaced ones
   * start fresh (baseline = the bike's current totals). */
  factory: z.boolean(),
  components: z
    .array(
      z.object({
        category: z.enum(COMPONENT_CATEGORIES),
        brand: z.string().trim().min(1).max(120),
        model: z.string().trim().min(1).max(120),
        variant: z.string().trim().max(120),
        year: z.number().int().min(1990).max(2100).nullable(),
        // Smart Setup components carry up to 5 reminders (the manual form
        // stays at 3) — matched by the slot 1-5 check in migration 00029.
        intervals: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              type: z.enum(INTERVAL_TYPES),
              interval: z.number().positive().max(100000),
              // Declared, and it has to be: z.object strips what it doesn't
              // name, without erroring. Leaving it out let the preview send
              // the merged service list and the server drop it on the floor
              // — a silent loss, which is the failure mode this project keeps
              // paying for. Curation writes it, so it is optional here.
              includes: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
            })
          )
          .max(5),
      })
    )
    .min(1)
    .max(40),
});

export type AiSetupCreateInput = z.infer<typeof aiSetupCreateSchema>;
