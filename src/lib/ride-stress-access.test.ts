import { describe, expect, it } from "vitest";
import { hasRideStressAccess } from "./ride-stress-access";

describe("hasRideStressAccess", () => {
  it("lets the owner in", () => {
    expect(hasRideStressAccess("miguelgomesdzn@gmail.com")).toBe(true);
    expect(hasRideStressAccess("  MiguelGomesdzn@Gmail.com  ")).toBe(true);
  });

  it("keeps everyone else out, including the second test account", () => {
    expect(hasRideStressAccess("miguel_gomes@sapo.pt")).toBe(false);
    expect(hasRideStressAccess("")).toBe(false);
    expect(hasRideStressAccess(null)).toBe(false);
    expect(hasRideStressAccess(undefined)).toBe(false);
  });
});
