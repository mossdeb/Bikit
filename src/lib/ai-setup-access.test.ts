import { describe, expect, it } from "vitest";
import { hasAiSetupAccess, hasUnlimitedAiSearches } from "./ai-setup-access";

describe("hasAiSetupAccess", () => {
  it("grants a beta email on a paid plan", () => {
    expect(hasAiSetupAccess("pro", "miguelgomesdzn@gmail.com")).toBe(true);
    expect(hasAiSetupAccess("personal", "miguelgomesdzn@gmail.com")).toBe(true);
  });

  it("is case- and whitespace-insensitive on the email", () => {
    expect(hasAiSetupAccess("pro", " MiguelGomesDZN@gmail.com ")).toBe(true);
  });

  it("denies paid-plan users outside the beta list", () => {
    expect(hasAiSetupAccess("pro", "roque.rangel.ines@gmail.com")).toBe(false);
  });

  it("grants the free plan too — capped by quota, not locked out (2026-08-11)", () => {
    expect(hasAiSetupAccess("free", "miguelgomesdzn@gmail.com")).toBe(true);
    expect(hasAiSetupAccess("free", "roque.rangel.ines@gmail.com")).toBe(false);
  });

  it("denies a missing email", () => {
    expect(hasAiSetupAccess("pro", undefined)).toBe(false);
    expect(hasAiSetupAccess("pro", null)).toBe(false);
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
