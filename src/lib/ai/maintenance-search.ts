// The AI half of the Maintenance Catalog: given one component, search the
// manufacturer's service documentation and extract EVERY recommended
// maintenance with its interval. Same contract as bike-search: strict wire
// schema, Zod as the second line, citations for the source, no persistence.

import { getOpenAIClient, OPENAI_MODEL } from "./openai";
import { clampConfidence, zodIssueSummary } from "./bike-search";
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
    console.error(`[ai-setup] maintenance search: output_text is not JSON (${response.output_text.length} chars)`);
    return { outcome: "invalid", tokens };
  }

  const result = maintenanceSearchResponseSchema.safeParse(sanitizeMaintenance(parsed));
  if (!result.success) {
    console.error("[ai-setup] maintenance search: schema rejected response:", zodIssueSummary(result.error));
    return { outcome: "invalid", tokens };
  }
  if (!result.data.found || result.data.maintenance.length === 0) return { outcome: "not_found", tokens };

  return {
    outcome: "found",
    data: result.data,
    sourceUrl: extractFirstCitationUrl(response),
    tokens,
  };
}

// ── Batched variant ────────────────────────────────────────────────────────
// One call for SEVERAL components at once. The per-call fixed cost is small
// (web search fees dominate and are per-search), but batching lets the model
// share searches between siblings — one visit to fox.com serves the fork and
// the shock — and collapses a new bike to two AI calls total: bike, then one
// batch for whatever the catalog lookup left unresolved.

const BATCH_ITEM_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string" },
    model: { type: "string" },
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
  required: ["brand", "model", "found", "maintenance", "confidence"],
  additionalProperties: false,
} as const;

const BATCH_WIRE_SCHEMA = {
  type: "object",
  properties: { results: { type: "array", items: BATCH_ITEM_SCHEMA } },
  required: ["results"],
  additionalProperties: false,
} as const;

const batchResultSchema = z.strictObject({
  brand: z.string(),
  model: z.string(),
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

const batchResponseSchema = z.strictObject({
  results: z.array(batchResultSchema).max(12),
});

export type MaintenanceBatchResult = z.infer<typeof batchResultSchema>;

export type MaintenanceBatchOutcome =
  | {
      outcome: "ok";
      /** Aligned with the request: results[i] answers inputs[i], matched by
       * echoed brand/model with the request order as tie-break; null when
       * the model dropped an item. */
      results: (MaintenanceBatchResult | null)[];
      /** First web-search citation of the whole batch — coarser than the
       * single-call era's per-component URL, the price of batching. */
      sourceUrl: string | null;
      tokens: number | null;
    }
  | { outcome: "invalid"; tokens: number | null }
  | { outcome: "error"; message: string };

function buildBatchPrompt(inputs: MaintenanceSearchInput[]): string {
  const list = inputs
    .map((c, i) => `${i + 1}. ${[c.brand, c.model, c.year ? `(${c.year})` : null].filter(Boolean).join(" ")}`)
    .join("\n");
  return [
    "Find the official maintenance schedule for EACH of the following bicycle components:",
    "",
    list,
    "",
    "Rules, applying to every component independently:",
    "- Do not invent anything. Every maintenance item and interval must come from a source you found. A component without credible service documentation gets found=false and an empty list — the others are unaffected.",
    "- Extract ALL recommended maintenance types, each with its interval in km, hours (of riding) or months — whichever unit the source uses.",
    "- When the source gives both a usage and a time interval for the same service (e.g. \"every 125 hours or once a year\"), emit the usage-based one only.",
    `- Name each service in concise English. Prefer these canonical names when they fit: ${CANONICAL_INTERVAL_NAMES.join(", ")}.`,
    "- Components from the same manufacturer usually share documentation — reuse what one search finds.",
    "- Return `results` in the SAME ORDER as the list above, one entry per component, echoing its brand and model.",
    "- `confidence` is your estimate (0 to 1) that that component's schedule is accurate.",
  ].join("\n");
}

/** Loose brand+model key just for matching a response entry back to its
 * request — echoes come back with cosmetic differences. */
function matchKey(brand: string, model: string): string {
  return `${brand}|${model}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, "");
}

export async function searchMaintenanceBatchWithAI(
  inputs: MaintenanceSearchInput[]
): Promise<MaintenanceBatchOutcome> {
  let response;
  try {
    response = await getOpenAIClient().responses.create({
      model: OPENAI_MODEL,
      input: buildBatchPrompt(inputs),
      tools: [{ type: "web_search" }],
      text: {
        format: {
          type: "json_schema",
          name: "component_maintenance_batch",
          strict: true,
          schema: BATCH_WIRE_SCHEMA as unknown as Record<string, unknown>,
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
    console.error(`[ai-setup] maintenance batch: output_text is not JSON (${response.output_text.length} chars)`);
    return { outcome: "invalid", tokens };
  }

  // Same per-item mercy as the single-component path, applied inside each
  // result before validating the whole.
  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as Record<string, unknown>).results)) {
    (parsed as Record<string, unknown>).results = ((parsed as Record<string, unknown>).results as unknown[])
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r) => sanitizeMaintenance(r))
      .slice(0, 12);
  }

  const result = batchResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[ai-setup] maintenance batch: schema rejected response:", zodIssueSummary(result.error));
    return { outcome: "invalid", tokens };
  }

  // Align answers with requests: echoed brand/model first, order as fallback.
  const byKey = new Map<string, MaintenanceBatchResult>();
  for (const entry of result.data.results) {
    const key = matchKey(entry.brand, entry.model);
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  const aligned = inputs.map((input, i) => {
    const byEcho = byKey.get(matchKey(input.brand, input.model));
    return byEcho ?? result.data.results[i] ?? null;
  });

  return { outcome: "ok", results: aligned, sourceUrl: extractFirstCitationUrl(response), tokens };
}

/** Same mercy as bike-search's sanitizeComponents: one malformed entry —
 * a zero interval, an over-long name, a list past the cap — must not turn
 * the whole schedule into an 'invalid'. Bad entries are dropped.
 * Exported for tests only. */
export function sanitizeMaintenance(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return parsed;
  const p = parsed as Record<string, unknown>;
  // Same clamp as the bike search — the wire schema can't bound numbers,
  // and a 95-for-0.95 must not void the schedule that carries it.
  const confidence = clampConfidence(p.confidence);
  if (!Array.isArray(p.maintenance)) return { ...p, confidence };
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
  return { ...p, confidence, maintenance };
}
