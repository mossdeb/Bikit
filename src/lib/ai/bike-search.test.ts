import { describe, expect, it } from "vitest";
import { bikeSearchResponseSchema, sanitizeComponents } from "./bike-search";

// The wire schema can't carry maxLength (OpenAI strict mode rejects it), so
// the sanitizer is the only thing standing between a rambling spec-sheet
// quote and Zod throwing the whole response away.

const component = (overrides: Record<string, unknown> = {}) => ({
  category: "Front Suspension (Fork)",
  brand: "RockShox",
  model: "Lyrik Ultimate",
  variant: "",
  year: 2024,
  ...overrides,
});

const response = (components: Record<string, unknown>[]) => ({
  found: true,
  bike: { brand: "Cannondale", model: "Moterra SL", version: "2", year: 2024, type: "E-MTB" },
  components,
  confidence: 0.98,
});

describe("sanitizeComponents", () => {
  // The measured failure (2026-08-11): the bike was found with 24 components
  // and 0.98 confidence, and ONE overlong variant invalidated all of it.
  it("clamps an overlong variant instead of letting it sink the response", () => {
    const rambling = "DownLow dropper post, 100–150 mm travel depending on frame size, ".repeat(4);
    const parsed = bikeSearchResponseSchema.safeParse(
      sanitizeComponents(response([component({ variant: rambling }), component()]))
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.components).toHaveLength(2);
      expect(parsed.data.components[0].variant).toHaveLength(120);
    }
  });

  it("clamps the bike's own strings too", () => {
    const raw = response([component()]);
    raw.bike.version = "x".repeat(300);
    const parsed = bikeSearchResponseSchema.safeParse(sanitizeComponents(raw));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.bike?.version).toHaveLength(120);
  });

  // The wire schema can't bound numbers either — a model writing 95 for
  // 0.95 must not void the answer. At worst 1.0 files the catalog entry as
  // 'unverified', which a high confidence earns anyway.
  it("clamps confidence into [0,1]", () => {
    const parsed = bikeSearchResponseSchema.safeParse(
      sanitizeComponents({ ...response([component()]), confidence: 95 })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.confidence).toBe(1);
  });

  // Zod demands min(1) on the bike's brand/model; the wire schema can't.
  // The honest substitute for an empty one is what the user searched for —
  // the same authority the caller already gives the year.
  it("fills an empty bike brand/model from the searched input", () => {
    const raw = response([component()]);
    raw.bike.brand = "";
    const parsed = bikeSearchResponseSchema.safeParse(
      sanitizeComponents(raw, { brand: "Cannondale", model: "Moterra SL" })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.bike?.brand).toBe("Cannondale");
  });

  it("still drops components with no brand or model, and bad years", () => {
    const parsed = bikeSearchResponseSchema.safeParse(
      sanitizeComponents(response([component({ brand: " " }), component({ year: 0 })]))
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.components).toHaveLength(1);
      expect(parsed.data.components[0].year).toBeNull();
    }
  });
});
