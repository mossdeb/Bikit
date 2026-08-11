import { describe, expect, it } from "vitest";
import { catalogKeysFor, statusForConfidence } from "./catalog";

const searched = { brand: "Cannondale", model: "Monterra", version: "LT 2", year: 2023 };

describe("catalogKeysFor", () => {
  // The measured case (2026-08-11): the AI read past the typo and answered
  // about "Moterra Neo / Carbon LT 2", and filing it only under "monterra"
  // meant no correctly-spelled search would ever find those 24 components.
  it("files under the AI's spelling too when it corrected a typo", () => {
    const keys = catalogKeysFor(searched, { brand: "Cannondale", model: "Moterra Neo", version: "Carbon LT 2" }, 0.96);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toEqual({ brand: "cannondale", model: "monterra", version: "lt 2", year: 2023 });
    expect(keys[1]).toEqual({ brand: "cannondale", model: "moterra neo", version: "carbon lt 2", year: 2023 });
  });

  it("keeps the searched key first, so it survives a failed second write", () => {
    const keys = catalogKeysFor(searched, { brand: "Cannondale", model: "Moterra Neo", version: "Carbon LT 2" }, 0.99);
    expect(keys[0].model).toBe("monterra");
  });

  // Below the threshold the AI answered about a bike it didn't quite
  // recognize — its spelling is a guess, and a guess must not become the
  // key everyone else lands on.
  it("does not trust the AI's spelling when confidence is low", () => {
    const keys = catalogKeysFor(searched, { brand: "Cannondale", model: "Moterra SL", version: "2" }, 0.88);
    expect(keys).toHaveLength(1);
    expect(keys[0].model).toBe("monterra");
  });

  it("writes one key when the spellings agree apart from case and spacing", () => {
    const keys = catalogKeysFor(
      { brand: "Santa Cruz", model: "Nomad", version: "6 S", year: 2024 },
      { brand: "SANTA CRUZ", model: "nomad", version: "6  s" },
      0.99
    );
    expect(keys).toHaveLength(1);
  });

  // The year is the catalog key and stays the user's: the model emits 0
  // when the source doesn't state one.
  it("never takes the year from the AI", () => {
    const keys = catalogKeysFor(searched, { brand: "Cannondale", model: "Moterra Neo", version: "Carbon LT 2" }, 0.99);
    expect(keys.every((k) => k.year === 2023)).toBe(true);
  });
});

describe("statusForConfidence", () => {
  it("splits at the threshold", () => {
    expect(statusForConfidence(0.95)).toBe("unverified");
    expect(statusForConfidence(0.94)).toBe("low_confidence");
  });
});
