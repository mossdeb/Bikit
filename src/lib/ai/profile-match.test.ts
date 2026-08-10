import { describe, expect, it } from "vitest";
import { modelMatchCandidates, pickMaintenanceProfile } from "./profile-match";

describe("modelMatchCandidates", () => {
  it("produces every whole-token prefix, longest first", () => {
    expect(modelMatchCandidates("38 factory grip x2")).toEqual([
      "38 factory grip x2",
      "38 factory grip",
      "38 factory",
      "38",
    ]);
  });

  it("returns a single-token model as-is", () => {
    expect(modelMatchCandidates("transfer")).toEqual(["transfer"]);
  });
});

describe("pickMaintenanceProfile", () => {
  const row = (model: string, year: number | null) => ({ model, year });

  it("returns null with no rows", () => {
    expect(pickMaintenanceProfile([], 2025)).toBeNull();
  });

  it("prefers the most specific model even when a broader one has the exact year", () => {
    const rows = [row("36 float performance", null), row("36", 2016)];
    expect(pickMaintenanceProfile(rows, 2016)).toBe(rows[0]);
  });

  it("prefers an exact year over the any-year row within the same model", () => {
    const rows = [row("36", null), row("36", 2016)];
    expect(pickMaintenanceProfile(rows, 2016)).toBe(rows[1]);
  });

  it("prefers the any-year row over a nearby year", () => {
    const rows = [row("float x", null), row("float x", 2017)];
    expect(pickMaintenanceProfile(rows, 2018)).toBe(rows[0]);
  });

  it("falls back to the nearest listed year", () => {
    const rows = [row("float x", 2015), row("float x", 2017)];
    expect(pickMaintenanceProfile(rows, 2018)).toBe(rows[1]);
  });

  it("breaks a nearest-year tie toward the newer row", () => {
    const rows = [row("dhx", 2016), row("dhx", 2018)];
    expect(pickMaintenanceProfile(rows, 2017)).toBe(rows[1]);
  });

  it("gives a yearless component the newest dated row", () => {
    const rows = [row("38", 2021), row("38", 2027), row("38", 2024)];
    expect(pickMaintenanceProfile(rows, null)).toBe(rows[1]);
  });

  it("gives a yearless component the any-year row when one exists", () => {
    const rows = [row("d o s s", null), row("transfer", 2024)];
    expect(pickMaintenanceProfile([rows[0]], null)).toBe(rows[0]);
  });
});
