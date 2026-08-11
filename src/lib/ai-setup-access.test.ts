import { describe, expect, it } from "vitest";
import { hasAiSetupAccess, hasUnlimitedAiSearches } from "./ai-setup-access";
import { PLAN_FEATURES } from "./plans";

describe("hasAiSetupAccess", () => {
  // The closed beta ended on 2026-08-11: no allowlist, no email, access is
  // whatever the plan says.
  it("grants every plan, Free included — capped by quota, not locked out", () => {
    expect(hasAiSetupAccess("pro")).toBe(true);
    expect(hasAiSetupAccess("personal")).toBe(true);
    expect(hasAiSetupAccess("free")).toBe(true);
  });

  it("answers from PLAN_FEATURES, so a plan losing the capability loses access", () => {
    for (const plan of ["free", "personal", "pro"] as const) {
      expect(hasAiSetupAccess(plan)).toBe(PLAN_FEATURES[plan].aiSetup);
    }
  });
});

describe("hasUnlimitedAiSearches", () => {
  it("exempts the owner, case- and whitespace-insensitively", () => {
    expect(hasUnlimitedAiSearches("miguelgomesdzn@gmail.com")).toBe(true);
    expect(hasUnlimitedAiSearches(" MiguelGomesDZN@gmail.com ")).toBe(true);
  });

  it("does not exempt other beta members or missing emails", () => {
    expect(hasUnlimitedAiSearches("roque.rangel.ines@gmail.com")).toBe(false);
    expect(hasUnlimitedAiSearches(undefined)).toBe(false);
    expect(hasUnlimitedAiSearches(null)).toBe(false);
  });
});
