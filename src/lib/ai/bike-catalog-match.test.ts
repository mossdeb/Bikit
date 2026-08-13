import { describe, expect, it } from "vitest";
import { nearestBrand, pickCatalogEntry, MAX_YEAR_DISTANCE } from "./bike-catalog-match";

const KNOWN = ["cannondale", "canyon", "santa cruz", "yt", "specialized", "orbea", "fox", "bos"];

describe("nearestBrand", () => {
  it("returns an exact match untouched", () => {
    expect(nearestBrand("canyon", KNOWN)).toBe("canyon");
  });

  it("recovers the typo measured in production", () => {
    // A real row sits under "cannonda" holding a complete Moterra SL that
    // nobody spelling the brand correctly could ever reach.
    expect(nearestBrand("cannonda", KNOWN)).toBe("cannondale");
  });

  it("forgives one edit in a long brand", () => {
    expect(nearestBrand("specialised", KNOWN)).toBe("specialized");
    expect(nearestBrand("santa cruzz", KNOWN)).toBe("santa cruz");
  });

  it("never guesses a short brand, but still matches one exactly", () => {
    // "fox" and "bos" are one substitution apart from each other and from
    // plenty of things that are not brands, so nothing short is guessed at.
    expect(nearestBrand("box", KNOWN)).toBeNull();
    expect(nearestBrand("fix", KNOWN)).toBeNull();
    // The length rule gates the GUESS, never the exact match — "yt" is a
    // real brand and has to keep resolving to itself.
    expect(nearestBrand("yt", KNOWN)).toBe("yt");
    expect(nearestBrand("fox", KNOWN)).toBe("fox");
  });

  it("refuses a tie rather than tossing a coin", () => {
    // Equally close to two brands is not an answer — and this guess is paid
    // for in silence, since a wrong catalog hit never fails.
    expect(nearestBrand("marino", ["marina", "marine"])).toBeNull();
  });

  it("resolves a tie in favour of the brand it is the start of", () => {
    // The tie measured in production: an earlier truncated search left
    // "cannonda" in the catalog, so "cannondal" sat one edit from both it
    // and the real brand, and the guess was refused.
    expect(nearestBrand("cannondal", ["cannondale", "cannonda", "canyon"])).toBe("cannondale");
  });

  it("still refuses when two brands both continue the input", () => {
    expect(nearestBrand("special", ["specialx", "specialy"])).toBeNull();
  });

  it("stays away when nothing is close", () => {
    expect(nearestBrand("rockrider", KNOWN)).toBeNull();
  });
});

const row = (model: string, version: string | null, year: number, confidence = 0.9) => ({
  model,
  version,
  year,
  confidence,
});

describe("pickCatalogEntry", () => {
  const wanted = { model: "Nomad 6", version: "S", year: 2024 };

  it("matches the same name split differently across model and version", () => {
    const rows = [row("nomad", "6 s", 2024)];
    expect(pickCatalogEntry(rows, wanted)).toBe(rows[0]);
  });

  it("is indifferent to where the punctuation fell", () => {
    // "Core4" and "Core 4" normalise to different keys and only meet here.
    const rows = [row("decoy", "core4", 2024)];
    expect(pickCatalogEntry(rows, { model: "Decoy", version: "Core 4", year: 2024 })).toBe(rows[0]);
  });

  it("reaches one year either side", () => {
    const rows = [row("nomad", "6 s", 2023)];
    expect(pickCatalogEntry(rows, wanted)).toBe(rows[0]);
  });

  it("does not reach across a generation", () => {
    expect(pickCatalogEntry([row("nomad", "6 s", 2024 - MAX_YEAR_DISTANCE - 1)], wanted)).toBeNull();
  });

  it("prefers the exact year over a near one, whatever the confidence", () => {
    const near = row("nomad", "6 s", 2023, 0.99);
    const exact = row("nomad 6", "s", 2024, 0.7);
    expect(pickCatalogEntry([near, exact], wanted)).toBe(exact);
  });

  it("breaks a same-year tie on confidence, then on recency", () => {
    const weak = row("nomad", "6 s", 2024, 0.8);
    const strong = row("nomad 6", "s", 2024, 0.96);
    expect(pickCatalogEntry([weak, strong], wanted)).toBe(strong);
  });

  it("never matches a different build", () => {
    // The whole reason nothing here is fuzzy: one token apart, different
    // parts list.
    expect(pickCatalogEntry([row("nomad", "6 r", 2024)], wanted)).toBeNull();
  });

  it("never matches on a prefix", () => {
    expect(pickCatalogEntry([row("nomad", "6", 2024)], wanted)).toBeNull();
    expect(pickCatalogEntry([row("nomad", "6 s x", 2024)], wanted)).toBeNull();
  });

  it("returns null for an empty catalog", () => {
    expect(pickCatalogEntry([], wanted)).toBeNull();
  });
});
