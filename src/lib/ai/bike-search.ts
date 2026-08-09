// The AI half of AI Auto Setup's bike search: one Responses API call with
// web search, constrained to a strict JSON schema. The AI never touches the
// database — this module returns data and the caller decides what to persist.
//
// Relative imports throughout src/lib/ai: these modules are exercised by
// vitest, which has no config and therefore no @/ alias.

import { BIKE_TYPES, COMPONENT_CATEGORIES } from "../constants";
import { getOpenAIClient, OPENAI_MODEL } from "./openai";
import { extractFirstCitationUrl } from "./citations";
import { z } from "zod";

export const aiBikeComponentSchema = z.strictObject({
  category: z.enum(COMPONENT_CATEGORIES),
  brand: z.string().min(1).max(120),
  model: z.string().min(1).max(120),
  /** "" when the component has no variant. Presentation concatenates it to
   * the model; the maintenance-profile key deliberately does NOT. */
  variant: z.string().max(120),
  year: z.number().int().min(1990).max(2100).nullable(),
});

export const bikeSearchResponseSchema = z.strictObject({
  found: z.boolean(),
  bike: z
    .strictObject({
      brand: z.string().min(1).max(120),
      model: z.string().min(1).max(120),
      version: z.string().max(120),
      // Unbounded on purpose: the model sometimes emits 0 when the source
      // doesn't state the year. The caller overrides it with the searched
      // year — the user's input is the catalog key and the authority.
      year: z.number().int(),
      type: z.enum(BIKE_TYPES),
    })
    .nullable(),
  components: z.array(aiBikeComponentSchema).max(40),
  confidence: z.number().min(0).max(1),
});

export type AiBikeComponent = z.infer<typeof aiBikeComponentSchema>;
export type BikeSearchResponse = z.infer<typeof bikeSearchResponseSchema>;

// The wire schema, hand-written rather than generated from Zod: OpenAI's
// strict mode accepts only a subset of JSON Schema (no minLength/minimum on
// this path), so the Zod refinements above act as the second line after the
// shape is enforced on the wire. The two travel together — a field added to
// one must be added to the other.
const WIRE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    bike: {
      anyOf: [
        {
          type: "object",
          properties: {
            brand: { type: "string" },
            model: { type: "string" },
            version: { type: "string" },
            year: { type: "integer" },
            type: { type: "string", enum: [...BIKE_TYPES] },
          },
          required: ["brand", "model", "version", "year", "type"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...COMPONENT_CATEGORIES] },
          brand: { type: "string" },
          model: { type: "string" },
          variant: { type: "string" },
          year: { type: ["integer", "null"] },
        },
        required: ["category", "brand", "model", "variant", "year"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number" },
  },
  required: ["found", "bike", "components", "confidence"],
  additionalProperties: false,
} as const;

export interface BikeSearchInput {
  brand: string;
  model: string;
  version: string | null;
  year: number;
}

export type BikeSearchOutcome =
  | {
      outcome: "found";
      data: BikeSearchResponse & { bike: NonNullable<BikeSearchResponse["bike"]> };
      sourceUrl: string | null;
      tokens: number | null;
    }
  | { outcome: "not_found"; tokens: number | null }
  | { outcome: "invalid"; tokens: number | null }
  | { outcome: "error"; message: string };

function buildPrompt(input: BikeSearchInput): string {
  const label = [input.brand, input.model, input.version, `(${input.year})`].filter(Boolean).join(" ");
  return [
    `Find the official specification sheet for the bicycle: ${label}.`,
    "",
    "Search the web, preferring the manufacturer's own website. From the spec sheet, extract the factory component build.",
    "",
    "Rules:",
    "- Do not invent anything. Every component must come from the source you found. If no authoritative spec exists for this bike, return found=false with an empty components list.",
    "- The official name may differ slightly from what the user typed (e.g. \"Decoy MX Core 4\" for \"Decoy Core 4\"): treat the closest official trim of the same model family and model year as a match, and report its official name in `bike`.",
    "- Omit a component rather than guessing it.",
    "- Map each component to exactly one of the allowed categories. Use \"Electric\" for motor, battery and display on e-bikes. Use \"Seatpost\" for seatposts and dropper posts. Use \"Other\" only when nothing else fits; skip accessories that are not maintainable parts (reflectors, bells).",
    "- The maintenance-relevant parts matter most: suspension, drivetrain, brakes, wheels, tires, dropper post, and motor/battery on e-bikes.",
    "- Put a component's trim or damper variant (e.g. \"Grip X2\") in `variant`, not in `model`. Use \"\" when there is none. Never put the component's role (Stem, Handlebar, Battery…) in `variant` — the category already says what it is.",
    "- `year` on a component is its model year only when the source states it; otherwise null.",
    "- `bike.version` is the trim level (e.g. \"Core 4\"). Use \"\" if the bike has no trim designation.",
    "- `bike.type`: any bike with a motor is \"E-MTB\", regardless of discipline — an electric enduro bike is \"E-MTB\", not \"Enduro\".",
    "- `confidence` is your estimate (0 to 1) that this build list is accurate and complete for this exact bike.",
  ].join("\n");
}

/** One search, one strictly-shaped answer. The source URL comes from the web
 * search citations, not from the model's text — a cited URL exists; a written
 * one might not. */
export async function searchBikeWithAI(input: BikeSearchInput): Promise<BikeSearchOutcome> {
  let response;
  try {
    response = await getOpenAIClient().responses.create({
      model: OPENAI_MODEL,
      input: buildPrompt(input),
      tools: [{ type: "web_search" }],
      text: {
        format: {
          type: "json_schema",
          name: "bike_spec",
          strict: true,
          schema: WIRE_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });
  } catch (error) {
    return { outcome: "error", message: error instanceof Error ? error.message : String(error) };
  }

  const tokens = response.usage?.total_tokens ?? null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    return { outcome: "invalid", tokens };
  }

  const result = bikeSearchResponseSchema.safeParse(sanitizeComponents(parsed));
  if (!result.success) return { outcome: "invalid", tokens };

  const { data } = result;
  if (!data.found || !data.bike || data.components.length === 0) {
    return { outcome: "not_found", tokens };
  }

  return {
    outcome: "found",
    // The searched year overrides whatever the model reported (it emits 0
    // when the source doesn't state one): the user's year is the catalog
    // key, and a bike filed under a different year than asked would be a
    // different catalog row anyway.
    data: { ...data, bike: { ...data.bike, year: input.year } },
    sourceUrl: extractFirstCitationUrl(response),
    tokens,
  };
}

/** One bad component must not sink the whole answer. The wire schema pins
 * the shape, but the model still emits things Zod rejects — year 0 on a
 * component, an empty brand, more entries than the cap — and rejecting the
 * response wholesale turned a 19-component find into an 'invalid'. Bad
 * years become null; components with no brand or model are dropped. */
function sanitizeComponents(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return parsed;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.components)) return parsed;
  const components = p.components
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map(
      (c): Record<string, unknown> => ({
        ...c,
        year: typeof c.year === "number" && c.year >= 1990 && c.year <= 2100 ? c.year : null,
      })
    )
    .filter((c) => typeof c.brand === "string" && c.brand.trim() && typeof c.model === "string" && c.model.trim())
    .slice(0, 40);
  return { ...p, components };
}
