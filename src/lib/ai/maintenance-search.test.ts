import { describe, expect, it } from "vitest";
import { maintenanceSearchResponseSchema, sanitizeMaintenance } from "./maintenance-search";

// sanitizeMaintenance serves both the single-component search and each item
// of the batch — one set of tests covers both callers.

describe("sanitizeMaintenance", () => {
  it("clamps confidence into [0,1] instead of voiding the schedule", () => {
    const parsed = maintenanceSearchResponseSchema.safeParse(
      sanitizeMaintenance({
        found: true,
        maintenance: [{ name: "Lower Leg Service", type: "hours", interval: 50 }],
        confidence: 95,
      })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.confidence).toBe(1);
  });

  it("still drops malformed entries without sinking the rest", () => {
    const parsed = maintenanceSearchResponseSchema.safeParse(
      sanitizeMaintenance({
        found: true,
        maintenance: [
          { name: "Lower Leg Service", type: "hours", interval: 50 },
          { name: "x".repeat(200), type: "hours", interval: 50 },
          { name: "Damper Service", type: "hours", interval: 0 },
        ],
        confidence: 0.9,
      })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.maintenance).toHaveLength(1);
      expect(parsed.data.maintenance[0].name).toBe("Lower Leg Service");
    }
  });
});
