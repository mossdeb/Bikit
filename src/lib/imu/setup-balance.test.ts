import { describe, expect, it } from "vitest";
import type { StoredRiderSag } from "./rider-sag";
import { knobEffects, knobValue, sagTone, setupBalance } from "./setup-balance";

const reading = (pitchDeg: number, calibrationCount = 4): StoredRiderSag => ({
  pitchDeg,
  rollDeg: 0,
  calibrationCount,
  gravityG: [0, Math.sin((pitchDeg * Math.PI) / 180), 1],
  sampleCount: 1664,
  accelStddevG: 0.01,
});

describe("sagTone", () => {
  it("reads the sag against the usual ranges and half the travel", () => {
    expect(sagTone("fork", 25)).toBe("good");
    expect(sagTone("fork", 33)).toBe("warn");
    expect(sagTone("shock", 30)).toBe("good");
    expect(sagTone("shock", 40)).toBe("warn");
    expect(sagTone("shock", 50)).toBe("danger");
  });
});

describe("setupBalance", () => {
  const setup = {
    fork: { travelMm: 180, sagMm: 45.4 },
    shock: { travelMm: 65, sagMm: 21.2 },
    frame: { wheelbaseMm: 1288, headAngleDeg: 63.9 },
  };

  it("gives the sags as shares and the rider sag in mm", () => {
    const b = setupBalance(setup, [reading(1.86)]);
    expect(b.forkSagPct).toBe(25);
    expect(b.shockSagPct).toBe(33);
    expect(b.pitchDeg).toBeCloseTo(1.86, 5);
    expect(b.rearMinusFrontMm).toBeCloseTo(41.8, 0);
    expect(b.frontMm).toBeCloseTo(40.8, 0);
    expect(b.rearMm).toBeCloseTo(82.6, 0);
  });

  it("counts a calibration once, however many runs repeat it", () => {
    const b = setupBalance(setup, [reading(1.86), reading(1.86), null]);
    expect(b.calibrations).toBe(1);
  });

  it("has no rider sag without a reading, and no mm without a wheelbase", () => {
    expect(setupBalance(setup, []).pitchDeg).toBeNull();
    const bare = setupBalance({ fork: { pressurePsi: 90 } }, [reading(2)]);
    expect(bare.pitchDeg).toBe(2);
    expect(bare.rearMinusFrontMm).toBeNull();
    expect(bare.forkSagPct).toBeNull();
  });
});

describe("knobEffects", () => {
  const a = {
    shock: { pressurePsi: 170, sagMm: 21, travelMm: 65 },
    fork: { pressurePsi: 90 },
  };
  const b = {
    shock: { pressurePsi: 180, sagMm: 19, travelMm: 65 },
    fork: { pressurePsi: 90 },
  };
  const c = {
    shock: { pressurePsi: 190, sagMm: 17, travelMm: 65 },
    fork: { pressurePsi: 95 },
  };

  it("lists the knobs that vary, with their values by setup", () => {
    const effects = knobEffects([
      { letter: "A", setup: a },
      { letter: "B", setup: b },
    ]);
    const pressure = effects.find((e) => e.knob === "shock.pressurePsi")!;
    expect(pressure.values).toEqual([
      { letter: "A", value: 170 },
      { letter: "B", value: 180 },
    ]);
    // The sag moved with it, but it is the same quantity said twice only
    // for its own share; the pressure's other changes are the sag's.
    expect(pressure.confounded).toContain("shock.sagMm");
    expect(effects.some((e) => e.knob === "fork.pressurePsi")).toBe(false);
    const sagPct = effects.find((e) => e.knob === "shock.sagPct")!;
    expect(sagPct.confounded).not.toContain("shock.sagMm");
  });

  it("says what else moved among the same setups", () => {
    const effects = knobEffects([
      { letter: "A", setup: a },
      { letter: "B", setup: b },
      { letter: "C", setup: c },
    ]);
    const pressure = effects.find((e) => e.knob === "shock.pressurePsi")!;
    expect(pressure.confounded).toContain("fork.pressurePsi");
    expect(knobValue(c, "shock.sagPct")).toBe(26);
  });
});
