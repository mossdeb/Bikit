import { describe, expect, it } from "vitest";
import { modelMatchCandidates, pickMaintenanceProfile } from "./profile-match";

describe("modelMatchCandidates", () => {
  it("produces every whole-token range, longest first and leftmost within a length", () => {
    expect(modelMatchCandidates("36 factory grip")).toEqual([
      "36 factory grip",
      "36 factory",
      "factory grip",
      "36",
      "factory",
      "grip",
    ]);
  });

  it("still leads with the whole-token prefixes", () => {
    const candidates = modelMatchCandidates("38 factory grip x2");
    expect(candidates.slice(0, 2)).toEqual(["38 factory grip x2", "38 factory grip"]);
    expect(candidates.indexOf("38")).toBeLessThan(candidates.indexOf("x2"));
  });

  it("reaches a base model written last", () => {
    // The Moterra SL 2024 names its fork "Float Factory 36".
    expect(modelMatchCandidates("float factory 36")).toContain("36");
  });

  it("returns a single-token model as-is", () => {
    expect(modelMatchCandidates("transfer")).toEqual(["transfer"]);
  });

  it("does not repeat a token that appears twice", () => {
    expect(modelMatchCandidates("float float")).toEqual(["float float", "float"]);
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

  it("ranks by candidate order when given it, not by string length", () => {
    // "float" is the longer string, but "x2" is the leftmost token of the
    // component's own name and therefore the stronger match.
    const candidates = modelMatchCandidates("x2 float");
    const rows = [row("float", 2027), row("x2", 2027)];
    expect(pickMaintenanceProfile(rows, null, { candidates })).toBe(rows[1]);
  });

  it("cannot separate two single-token candidates on rank alone", () => {
    // Both "float" and "36" are one token of "float factory 36"; the leftmost
    // wins on rank. Only the category guard tells a shock from a fork here.
    const candidates = modelMatchCandidates("float factory 36");
    const rows = [row("float", 2027), row("36", 2027)];
    expect(pickMaintenanceProfile(rows, null, { candidates })).toBe(rows[0]);
  });
});

describe("pickMaintenanceProfile — the stored category", () => {
  // The column beats the service names, which is the whole point of it:
  // curation renames services and must not move which component a profile
  // serves.
  const storedShock = { model: "float", year: 2027, category: "Rear Suspension", intervals: [{ name: "Full Service" }] };
  const storedFork = { model: "36", year: 2027, category: "Front Suspension (Fork)", intervals: [{ name: "Full Service" }] };

  it("keeps a fork off a shock profile that no longer names any shock service", () => {
    expect(pickMaintenanceProfile([storedShock], 2027, { category: "Front Suspension (Fork)" })).toBeNull();
  });

  it("picks the stored fork over the stored shock, both silent in their names", () => {
    const candidates = modelMatchCandidates("float factory 36");
    expect(
      pickMaintenanceProfile([storedShock, storedFork], null, {
        candidates,
        category: "Front Suspension (Fork)",
      })
    ).toBe(storedFork);
  });

  it("prefers the stored category over what the names suggest", () => {
    // A shock profile that still carries a fork's word in a service name.
    const mislabelled = { model: "x", year: 2027, category: "Rear Suspension", intervals: [{ name: "Lower Leg Service" }] };
    expect(pickMaintenanceProfile([mislabelled], 2027, { category: "Front Suspension (Fork)" })).toBeNull();
    expect(pickMaintenanceProfile([mislabelled], 2027, { category: "Rear Suspension" })).toBe(mislabelled);
  });

  it("falls back to the service names when the column is null", () => {
    const legacy = { model: "float", year: 2027, category: null, intervals: [{ name: "Air Sleeve Service" }] };
    expect(pickMaintenanceProfile([legacy], 2027, { category: "Front Suspension (Fork)" })).toBeNull();
  });

  it("keeps a null-category negative cache eligible for any component", () => {
    // The 66 left null on purpose: skipping one re-buys a search that already
    // came back empty.
    const negativeCache = { model: "carbonara", year: 2020, category: null, intervals: [] };
    expect(pickMaintenanceProfile([negativeCache], 2020, { category: "Front Suspension (Fork)" })).toBe(negativeCache);
    expect(pickMaintenanceProfile([negativeCache], 2020, { category: "Rear Suspension" })).toBe(negativeCache);
  });
});

describe("pickMaintenanceProfile — category guard from service names", () => {
  const fork = { model: "36", year: 2024, intervals: [{ name: "Lower Leg Service" }] };
  const shock = { model: "float", year: 2024, intervals: [{ name: "Air Sleeve Service" }] };
  const post = { model: "reverb", year: 2024, intervals: [{ name: "Upper Post Service" }] };
  const unmarked = { model: "ep801", year: 2024, intervals: [{ name: "Motor Seal Cleaning" }] };

  it("keeps a fork off a shock profile", () => {
    expect(pickMaintenanceProfile([shock], 2024, { category: "Front Suspension (Fork)" })).toBeNull();
  });

  it("keeps a shock off a fork profile", () => {
    expect(pickMaintenanceProfile([fork], 2024, { category: "Rear Suspension" })).toBeNull();
  });

  it("picks the fork profile over the shock one for a fork, whatever the ranking", () => {
    // The production case: "Fox Float Factory 36" reaches both rows.
    const candidates = modelMatchCandidates("float factory 36");
    const chosen = pickMaintenanceProfile([shock, fork], null, {
      candidates,
      category: "Front Suspension (Fork)",
    });
    expect(chosen).toBe(fork);
  });

  it("does not filter a profile with no kind markers", () => {
    expect(pickMaintenanceProfile([unmarked], 2024, { category: "Front Suspension (Fork)" })).toBe(unmarked);
  });

  it("does not filter when the category has no known kind", () => {
    expect(pickMaintenanceProfile([shock], 2024, { category: "Other" })).toBe(shock);
    expect(pickMaintenanceProfile([shock], 2024, {})).toBe(shock);
  });

  it("prefers a profile that identifies as the right kind over a silent one", () => {
    // The regression of 2026-08-12: collapsing the FOX shocks' services into
    // one "Full Service" erased the "Air Sleeve" marker, so the shock profile
    // stopped declaring what it was and the guard had nothing to reject.
    const silentShock = { model: "float", year: 2027, intervals: [{ name: "Full Service" }] };
    const candidates = modelMatchCandidates("float factory 36");
    const chosen = pickMaintenanceProfile([silentShock, fork], null, {
      candidates,
      category: "Front Suspension (Fork)",
    });
    expect(chosen).toBe(fork);
  });

  it("still uses a silent profile when nothing declares the right kind", () => {
    // Most of the library says nothing — motors, drivetrains, negative caches.
    expect(pickMaintenanceProfile([unmarked], 2024, { category: "Front Suspension (Fork)" })).toBe(unmarked);
  });

  it("keeps a seatpost off a fork profile and vice versa", () => {
    expect(pickMaintenanceProfile([fork], 2024, { category: "Seatpost" })).toBeNull();
    expect(pickMaintenanceProfile([post], 2024, { category: "Front Suspension (Fork)" })).toBeNull();
  });
});
