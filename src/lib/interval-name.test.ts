import { describe, expect, it } from "vitest";
import { splitIntervalNote } from "./interval-name";

/** Every bracketed interval name in production on 2026-08-18, which is what
 * the heuristic was measured against. */
describe("splitIntervalNote", () => {
  it("moves prose that lists actions with a comma", () => {
    expect(splitIntervalNote("Lower Leg Service (clean/inspect lowers, change oil bath if necessary)")).toEqual({
      name: "Lower Leg Service",
      note: "clean/inspect lowers, change oil bath if necessary",
    });
    expect(
      splitIntervalNote("Bushing service (loosen collar, clean old grease, apply suspension-specific light grease)")
    ).toEqual({
      name: "Bushing service",
      note: "loosen collar, clean old grease, apply suspension-specific light grease",
    });
  });

  it("moves prose separated by a semicolon", () => {
    expect(splitIntervalNote("Internal inspection (inspect internals for wear; replace as needed)")).toEqual({
      name: "Internal inspection",
      note: "inspect internals for wear; replace as needed",
    });
  });

  it("moves prose that merely runs long", () => {
    // No comma; 44 characters carries it over the line on length alone.
    expect(splitIntervalNote("Coil Spring Service (replace protective tubes and re-grease spring)")).toEqual({
      name: "Coil Spring Service",
      note: "replace protective tubes and re-grease spring",
    });
    expect(splitIntervalNote("Battery Health Check (fully charge when stored/not in use)")).toEqual({
      name: "Battery Health Check",
      note: "fully charge when stored/not in use",
    });
  });

  it("keeps a short qualifier, because it is the name", () => {
    // One component holds this AND a plain "Full Service": stripping would
    // print the same name twice on the same card.
    expect(splitIntervalNote("Full Service (trail / off‑road use)")).toEqual({
      name: "Full Service (trail / off‑road use)",
      note: null,
    });
    expect(splitIntervalNote("Storage Temperature — mid term (≤3 months)")).toEqual({
      name: "Storage Temperature — mid term (≤3 months)",
      note: null,
    });
    expect(splitIntervalNote("Storage Temperature — short term (≤1 month)")).toEqual({
      name: "Storage Temperature — short term (≤1 month)",
      note: null,
    });
  });

  it("leaves a name without brackets alone", () => {
    expect(splitIntervalNote("Full Service")).toEqual({ name: "Full Service", note: null });
    expect(splitIntervalNote("Sangria dos travões")).toEqual({ name: "Sangria dos travões", note: null });
  });

  it("ignores a bracket that is not at the end", () => {
    const name = "Service (every season) before winter";
    expect(splitIntervalNote(name)).toEqual({ name, note: null });
  });

  it("refuses to leave the name empty", () => {
    const name = "(inspect internals for wear; replace as needed)";
    expect(splitIntervalNote(name)).toEqual({ name, note: null });
  });
});
