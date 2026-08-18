import { describe, expect, it } from "vitest";
import { WHEEL_RIM_ISO_MM, sensorSyncOutcome, wheelCircumferenceMm } from "./sensor-sync";

describe("wheelCircumferenceMm", () => {
  it("lands within 1% of the published chart for 29×2.3\"", () => {
    // Garmin's chart says 2326 for 29×2.3; the π-formula gives 2321.
    const mm = wheelCircumferenceMm(WHEEL_RIM_ISO_MM['29"'], 2.3 * 25.4);
    expect(mm).toBeGreaterThan(2326 * 0.99);
    expect(mm).toBeLessThan(2326 * 1.01);
  });

  it("lands within 1% of the published chart for 700×25c", () => {
    // Published 2105; the formula gives 2111.
    const mm = wheelCircumferenceMm(WHEEL_RIM_ISO_MM["700c"], 25);
    expect(mm).toBeGreaterThan(2105 * 0.99);
    expect(mm).toBeLessThan(2105 * 1.01);
  });

  it("shares a rim between 29\" and 700c, and between 27.5\" and 650b", () => {
    expect(WHEEL_RIM_ISO_MM['29"']).toBe(WHEEL_RIM_ISO_MM["700c"]);
    expect(WHEEL_RIM_ISO_MM['27.5"']).toBe(WHEEL_RIM_ISO_MM["650b"]);
  });
});

describe("sensorSyncOutcome", () => {
  it("turns a counter advance into km through the circumference", () => {
    // The measured night: 38 at close, 107 on reconnect, 29er wheel.
    const outcome = sensorSyncOutcome(38, 107, 2326);
    expect(outcome).toEqual({ kind: "advance", revs: 69, km: (69 * 2326) / 1_000_000 });
  });

  it("reads an unchanged counter as an advance of zero, not a reset", () => {
    expect(sensorSyncOutcome(107, 107, 2326)).toEqual({ kind: "advance", revs: 0, km: 0 });
  });

  it("reads a lower counter as a sensor restart and contributes nothing", () => {
    // The battery-swap rule: never a negative distance.
    expect(sensorSyncOutcome(38, 5, 2326)).toEqual({ kind: "reset" });
  });

  it("survives a counter near the uint32 ceiling without wrapping logic", () => {
    const outcome = sensorSyncOutcome(4294967200, 4294967295, 2326);
    expect(outcome.kind).toBe("advance");
    if (outcome.kind === "advance") expect(outcome.revs).toBe(95);
  });
});
