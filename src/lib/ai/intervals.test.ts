import { describe, expect, it } from "vitest";
import { frequencyScore, selectTopIntervals, withSafeIncludes, type MaintenanceInterval } from "./intervals";

const iv = (name: string, type: MaintenanceInterval["type"], interval: number): MaintenanceInterval => ({
  name,
  type,
  interval,
});

describe("frequencyScore", () => {
  it("ranks across units: 50h beats 12 months, 300km beats both", () => {
    expect(frequencyScore(iv("a", "km", 300))).toBeLessThan(frequencyScore(iv("b", "hours", 50)));
    expect(frequencyScore(iv("b", "hours", 50))).toBeLessThan(frequencyScore(iv("c", "months", 12)));
  });
});

describe("selectTopIntervals", () => {
  const foxProfile = [
    iv("Full Service", "hours", 200),
    iv("Lower Leg Service", "hours", 50),
    iv("Annual Service", "months", 12),
    iv("Damper Service", "hours", 125),
    iv("Air Spring Service", "hours", 125),
  ];

  it("keeps the three most frequent, comparing across units", () => {
    // 12 months ≈ 120 riding-hour equivalents, so the annual service slots
    // between the 50h lowers and the 125h damper — a time-based reminder
    // outranking a usage-based one it nearly matches is intended.
    expect(selectTopIntervals(foxProfile).map((i) => i.name)).toEqual([
      "Lower Leg Service",
      "Annual Service",
      "Damper Service",
    ]);
  });

  it("keeps source order on ties (sort stability)", () => {
    // Damper and Air Spring tie at 125h; the one the source listed first
    // takes the last slot and the other is what the preview offers to swap.
    const picked = selectTopIntervals(foxProfile);
    expect(picked[2].name).toBe("Damper Service");
    expect(picked.map((i) => i.name)).not.toContain("Air Spring Service");
  });

  it("drops duplicate names, first occurrence wins", () => {
    const withDup = [iv("Oil Change", "hours", 50), iv("oil change", "hours", 100), iv("Brake Bleed", "months", 6)];
    const picked = selectTopIntervals(withDup);
    expect(picked).toHaveLength(2);
    expect(picked[0]).toEqual(iv("Oil Change", "hours", 50));
  });

  it("returns everything when there are 3 or fewer", () => {
    const two = [iv("A", "km", 500), iv("B", "months", 3)];
    expect(selectTopIntervals(two)).toHaveLength(2);
  });

  it("returns an empty pick for an empty profile", () => {
    expect(selectTopIntervals([])).toEqual([]);
  });

  it("carries a merged service list through untouched", () => {
    const merged: MaintenanceInterval = {
      ...iv("Full Service", "hours", 125),
      includes: ["Lower Leg Service", "Damper Service", "Air Spring Service"],
    };
    const picked = selectTopIntervals([iv("Lower Leg Service", "hours", 50), merged]);
    expect(picked.find((i) => i.name === "Full Service")?.includes).toEqual([
      "Lower Leg Service",
      "Damper Service",
      "Air Spring Service",
    ]);
  });

  it("returns the SAME objects it was given, not copies", () => {
    // The Smart Setup preview maps a selected interval back to its row with
    // indexOf, which compares by reference. Turning this into a mapper would
    // break the pre-selection silently, so the guarantee is pinned here.
    const source = [iv("Lower Leg Service", "hours", 50), iv("Full Service", "hours", 125)];
    const picked = selectTopIntervals(source);
    expect(picked[0]).toBe(source[0]);
    expect(source.indexOf(picked[1])).toBe(1);
  });
});

describe("withSafeIncludes", () => {
  it("keeps a good list and erases a malformed one", () => {
    const good = { ...iv("Full Service", "hours", 125), includes: ["Damper Service"] };
    expect(withSafeIncludes(good).includes).toEqual(["Damper Service"]);

    // Curation writes this jsonb by hand and it is cast, not parsed — a name
    // written without the brackets must not reach a .map() in a render.
    const bad = { ...iv("Full Service", "hours", 125), includes: "Damper Service" as unknown as string[] };
    expect(withSafeIncludes(bad).includes).toBeUndefined();
  });
});
