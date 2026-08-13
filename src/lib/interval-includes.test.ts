import { describe, it, expect } from "vitest";
import { asIncludes, parseIntervalIncludes } from "./interval-includes";

describe("asIncludes", () => {
  it("keeps an array of names", () => {
    expect(asIncludes(["Lower Leg Service", "Damper Service"])).toEqual(["Lower Leg Service", "Damper Service"]);
  });

  it("reads anything that is not an array as no list", () => {
    // The curation slip this exists for: a single name written without the
    // brackets. It would have reached .map() in a render.
    expect(asIncludes("Lower Leg Service")).toBeUndefined();
    expect(asIncludes(null)).toBeUndefined();
    expect(asIncludes(undefined)).toBeUndefined();
    expect(asIncludes({ 0: "Lower Leg Service" })).toBeUndefined();
  });

  it("drops non-string and blank entries, and an all-blank list entirely", () => {
    expect(asIncludes(["Damper Service", 42, null, "  "])).toEqual(["Damper Service"]);
    expect(asIncludes([])).toBeUndefined();
    expect(asIncludes(["", "   "])).toBeUndefined();
  });

  it("caps a runaway list", () => {
    expect(asIncludes(Array.from({ length: 40 }, (_, i) => `Service ${i}`))).toHaveLength(20);
  });
});

describe("parseIntervalIncludes", () => {
  const payload = JSON.stringify({
    for: "Full Service",
    includes: ["Lower Leg Service", "Damper Service", "Air Spring Service"],
  });

  it("returns the list when the submitted name still matches", () => {
    expect(parseIntervalIncludes(payload, "Full Service")).toEqual([
      "Lower Leg Service",
      "Damper Service",
      "Air Spring Service",
    ]);
  });

  it("ignores case and surrounding space in the match", () => {
    expect(parseIntervalIncludes(payload, "  full service ")).toHaveLength(3);
  });

  it("drops the list when the reminder was renamed", () => {
    // Renaming repurposes the slot; a list that travelled along would be
    // describing a reminder that no longer exists.
    expect(parseIntervalIncludes(payload, "My fork thing")).toBeUndefined();
  });

  it("never throws on junk, it just reads as no list", () => {
    expect(parseIntervalIncludes("{not json", "Full Service")).toBeUndefined();
    expect(parseIntervalIncludes("null", "Full Service")).toBeUndefined();
    expect(parseIntervalIncludes("[]", "Full Service")).toBeUndefined();
    expect(parseIntervalIncludes("", "Full Service")).toBeUndefined();
    expect(parseIntervalIncludes(null, "Full Service")).toBeUndefined();
    expect(parseIntervalIncludes(JSON.stringify({ includes: ["A"] }), "Full Service")).toBeUndefined();
  });
});
