import { describe, expect, it } from "vitest";
import { isAccessExpired } from "./lab-access";

const BETA = "wearewildpack@gmail.com";
const OWNER = "miguelgomesdzn@gmail.com";
// Midday in Portugal on 10 November 2026.
const NOW = new Date("2026-11-10T12:00:00Z");

describe("isAccessExpired", () => {
  it("is open without an end date", () => {
    expect(isAccessExpired({ email: BETA, app_metadata: {} }, NOW)).toBe(false);
  });
  it("is open before the end date", () => {
    expect(
      isAccessExpired(
        { email: BETA, app_metadata: { access_ends_on: "2026-11-11" } },
        NOW,
      ),
    ).toBe(false);
  });
  it("closes on the end date itself", () => {
    expect(
      isAccessExpired(
        { email: BETA, app_metadata: { access_ends_on: "2026-11-10" } },
        NOW,
      ),
    ).toBe(true);
  });
  it("never closes the owner's account", () => {
    expect(
      isAccessExpired(
        { email: OWNER, app_metadata: { access_ends_on: "2026-01-01" } },
        NOW,
      ),
    ).toBe(false);
  });
  it("ignores a malformed date", () => {
    expect(
      isAccessExpired(
        { email: BETA, app_metadata: { access_ends_on: "soon" } },
        NOW,
      ),
    ).toBe(false);
  });
});
