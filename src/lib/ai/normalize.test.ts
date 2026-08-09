import { describe, expect, it } from "vitest";
// Relative import: there is no vitest.config.ts, so the @/ alias does not
// resolve under the test runner.
import { bikeCatalogKey, normalizeBrand, normalizeKeyPart, normalizeModel } from "./normalize";

describe("normalizeKeyPart", () => {
  it("lowercases and trims", () => {
    expect(normalizeKeyPart("  Decoy ")).toBe("decoy");
  });

  it("strips accents", () => {
    expect(normalizeKeyPart("Suspensão Traseira")).toBe("suspensao traseira");
  });

  it("collapses punctuation and whitespace runs to single spaces", () => {
    expect(normalizeKeyPart("S-Works")).toBe("s works");
    expect(normalizeKeyPart("Core   4")).toBe("core 4");
    expect(normalizeKeyPart("Float X2, Factory")).toBe("float x2 factory");
  });

  it("keeps digits", () => {
    expect(normalizeKeyPart("38 Factory")).toBe("38 factory");
  });

  it("is idempotent", () => {
    const once = normalizeKeyPart("YT Industries");
    expect(normalizeKeyPart(once)).toBe(once);
  });

  it("returns empty string for empty or punctuation-only input", () => {
    expect(normalizeKeyPart("")).toBe("");
    expect(normalizeKeyPart(" - ")).toBe("");
  });
});

describe("normalizeBrand", () => {
  it("strips corporate suffixes so aliases share a key", () => {
    expect(normalizeBrand("YT Industries")).toBe("yt");
    expect(normalizeBrand("YT")).toBe("yt");
    expect(normalizeBrand("Santa Cruz Bicycles")).toBe("santa cruz");
  });

  it("strips noise tokens in any position", () => {
    expect(normalizeBrand("Cycles Devinci")).toBe("devinci");
  });

  it("keeps the base form when stripping would empty the brand", () => {
    expect(normalizeBrand("Bikes")).toBe("bikes");
  });

  it("normalizes case and accents like any key part", () => {
    expect(normalizeBrand("CANYON")).toBe("canyon");
  });
});

describe("normalizeModel", () => {
  it("does not receive the variant — same profile with or without it", () => {
    // The caller keeps model and variant apart; this documents that the
    // profile key comes from the model alone.
    expect(normalizeModel("38 Factory")).toBe("38 factory");
  });
});

describe("bikeCatalogKey", () => {
  it("builds the full normalized key", () => {
    expect(bikeCatalogKey({ brand: "YT Industries", model: "Decoy", version: "Core 4", year: 2024 })).toEqual({
      brand: "yt",
      model: "decoy",
      version: "core 4",
      year: 2024,
    });
  });

  it("maps a missing version to the empty string, matching the non-null column", () => {
    expect(bikeCatalogKey({ brand: "Canyon", model: "Spectral", version: null, year: 2023 }).version).toBe("");
    expect(bikeCatalogKey({ brand: "Canyon", model: "Spectral", year: 2023 }).version).toBe("");
  });
});
