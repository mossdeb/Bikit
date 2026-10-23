import { describe, expect, it } from "vitest";
import { homePathFor, signedInRedirect } from "./areas";

const OWNER = "miguelgomesdzn@gmail.com";
const OTHER = "someone@example.com";

describe("homePathFor", () => {
  it("is the Pro for a lab account and the beta page for the rest", () => {
    expect(homePathFor(OWNER, true)).toBe("/pro");
    expect(homePathFor(OTHER, true)).toBe("/beta");
  });

  it("is the dashboard for everyone while the maintenance app is shown", () => {
    expect(homePathFor(OWNER, false)).toBe("/dashboard");
    expect(homePathFor(OTHER, false)).toBe("/dashboard");
  });
});

describe("signedInRedirect, maintenance hidden", () => {
  it("sends the old area's routes home", () => {
    for (const path of ["/dashboard", "/bikes", "/bikes/abc/edit", "/settings", "/help/docs", "/legal/terms"]) {
      expect(signedInRedirect(path, OWNER, true)).toBe("/pro");
      expect(signedInRedirect(path, OTHER, true)).toBe("/beta");
    }
  });

  it("sends the sign-in pages home", () => {
    expect(signedInRedirect("/login", OWNER, true)).toBe("/pro");
    expect(signedInRedirect("/signup", OTHER, true)).toBe("/beta");
  });

  it("keeps the Pro to the accounts it is open to", () => {
    expect(signedInRedirect("/pro", OWNER, true)).toBeNull();
    expect(signedInRedirect("/pro/sessoes/1", OWNER, true)).toBeNull();
    expect(signedInRedirect("/pro", OTHER, true)).toBe("/beta");
    expect(signedInRedirect("/pro/definicoes", OTHER, true)).toBe("/beta");
  });

  it("lets the beta page through only to the accounts waiting", () => {
    expect(signedInRedirect("/beta", OTHER, true)).toBeNull();
    expect(signedInRedirect("/beta", OWNER, true)).toBe("/pro");
  });

  it("does not catch routes that only share a prefix, nor public pages", () => {
    expect(signedInRedirect("/bikesx", OTHER, true)).toBeNull();
    expect(signedInRedirect("/privacy", OTHER, true)).toBeNull();
    expect(signedInRedirect("/support", OTHER, true)).toBeNull();
    expect(signedInRedirect("/production", OTHER, true)).toBeNull();
  });
});

describe("signedInRedirect, maintenance shown", () => {
  it("behaves as before: only the sign-in pages redirect, to the dashboard", () => {
    expect(signedInRedirect("/login", OTHER, false)).toBe("/dashboard");
    expect(signedInRedirect("/dashboard", OTHER, false)).toBeNull();
    expect(signedInRedirect("/bikes", OWNER, false)).toBeNull();
    expect(signedInRedirect("/pro", OTHER, false)).toBeNull();
  });
});
