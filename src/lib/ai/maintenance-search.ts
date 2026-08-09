// The AI half of the Maintenance Catalog: given one component, search the
// manufacturer's service documentation and extract EVERY recommended
// maintenance with its interval. Same contract as bike-search: strict wire
// schema, Zod as the second line, citations for the source, no persistence.

import { getOpenAIClient, OPENAI_MODEL } from "./openai";
import { extractFirstCitationUrl } from "./citations";
import { CANONICAL_INTERVAL_NAMES, INTERVAL_TYPES } from "./intervals";
import { z } from "zod";

export const maintenanceSearchResponseSchema = z.strictObject({
  found: z.boolean(),
  maintenance: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(120),
        type: z.enum(INTERVAL_TYPES),
        interval: z.number().positive().max(100000),
      })
    )
    .max(20),
  confidence: z.number().min(0).max(1),
});

export type MaintenanceSearchResponse = z.infer<typeof maintenanceSearchResponseSchema>;

// Hand-written for the same reason as bike-search's: OpenAI strict mode
// takes a JSON Schema subset. The two schemas travel together.
const WIRE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    maintenance: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: [...INTERVAL_TYPES] },
          interval: { type: "number" },
        },
        required: ["name", "type", "interval"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number" },
  },
  required: ["found", "maintenance", "confidence"],
  additionalProperties: false,
} as const;

export interface MaintenanceSearchInput {
  brand: string;
  model: string;
  year: number | null;
}

export type MaintenanceSearchOutcome =
  | { outcome: "found"; data: MaintenanceSearchResponse; sourceUrl: string | null; tokens: number | null }
  | { outcome: "not_found"; tokens: number | null }
  | { outcome: "invalid"; tokens: number | null }
  | { outcome: "error"; message: string };

function buildPrompt(input: MaintenanceSearchInput): string {
  const label = [input.brand, input.model, input.year ? `(${input.year})` : null].filter(Boolean).join(" ");
  return [
    `Find the official maintenance schedule for the bicycle component: ${label}.`,
    "",
    "Search the web, preferring the manufacturer's own service documentation.",
    "",
    "Rules:",
    "- Do not invent anything. Every maintenance item and interval must come from the source. If you cannot find credible service documentation for this component, return found=false with an empty list.",
    "- Extract ALL recommended maintenance types, each with its interval in km, hours (of riding) or months — whichever unit the source uses.",
    "- When the source gives both a usage and a time interval for the same service (e.g. \"every 125 hours or once a year\"), emit the usage-based one only.",
    `- Name each service in concise English. Prefer these canonical names when they fit: ${CANONICAL_INTERVAL_NAMES.join(", ")}.`,
    "- `confidence` is your estimate (0 to 1) that this schedule is accurate for this exact component.",
  ].join("\n");
}

export async function searchMaintenanceWithAI(input: MaintenanceSearchInput): Promise<MaintenanceSearchOutcome> {
  let response;
  try {
    response = await getOpenAIClient().responses.create({
      model: OPENAI_MODEL,
      input: buildPrompt(input),
      tools: [{ type: "web_search" }],
      text: {
        format: {
          type: "json_schema",
          name: "component_maintenance",
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

  const result = maintenanceSearchResponseSchema.safeParse(sanitizeMaintenance(parsed));
  if (!result.success) return { outcome: "invalid", tokens };
  if (!result.data.found || result.data.maintenance.length === 0) return { outcome: "not_found", tokens };

  return {
    outcome: "found",
    data: result.data,
    sourceUrl: extractFirstCitationUrl(response),
    tokens,
  };
}

/** Same mercy as bike-search's sanitizeComponents: one malformed entry —
 * a zero interval, an over-long name, a list past the cap — must not turn
 * the whole schedule into an 'invalid'. Bad entries are dropped. */
function sanitizeMaintenance(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return parsed;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.maintenance)) return parsed;
  const maintenance = p.maintenance
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
    .filter(
      (m) =>
        typeof m.name === "string" &&
        m.name.trim() &&
        m.name.length <= 120 &&
        typeof m.interval === "number" &&
        m.interval > 0 &&
        m.interval <= 100000
    )
    .slice(0, 20);
  return { ...p, maintenance };
}
