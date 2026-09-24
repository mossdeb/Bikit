import { describe, expect, it } from "vitest";
import {
  circuitMode,
  damperSpring,
  formatSetupChange,
  isSetupEmpty,
  isSetupValues,
  normalizeSetupValues,
  setupDiff,
  setupKey,
  setupSpread,
  setupSummary,
  setupValuesEqual,
  sagPercent,
} from "./setup";

describe("setup values", () => {
  it("accepts the shape and refuses strays", () => {
    expect(
      isSetupValues({
        fork: { pressurePsi: 78, reboundLow: 8 },
        tires: { frontPsi: 24 },
      }),
    ).toBe(true);
    expect(isSetupValues({})).toBe(true);
    expect(isSetupValues({ fork: { pressurePsi: "78" } })).toBe(false);
    expect(isSetupValues({ wheels: { frontPsi: 24 } })).toBe(false);
    expect(isSetupValues({ fork: { sag: 30 } })).toBe(false);
    expect(isSetupValues(null)).toBe(false);
  });

  it("drops the blanks and compares what is left", () => {
    const a = {
      fork: { pressurePsi: 78, compressionLow: undefined },
      shock: {},
      tires: { frontPsi: 24, rearPsi: 26 },
    };
    expect(normalizeSetupValues(a)).toEqual({
      fork: { pressurePsi: 78 },
      tires: { frontPsi: 24, rearPsi: 26 },
    });
    expect(
      setupValuesEqual(a, {
        fork: { pressurePsi: 78 },
        tires: { frontPsi: 24, rearPsi: 26 },
      }),
    ).toBe(true);
    expect(
      setupValuesEqual(a, { ...a, tires: { frontPsi: 22, rearPsi: 26 } }),
    ).toBe(false);
    expect(isSetupEmpty({ fork: {}, shock: { reboundHigh: undefined } })).toBe(
      true,
    );
    expect(isSetupEmpty(a)).toBe(false);
  });

  it("writes the header line with the bike's own names and dashes for the half-filled pairs", () => {
    const values = {
      fork: {
        pressurePsi: 78,
        compressionHigh: 2,
        compressionLow: 12,
        reboundLow: 8,
      },
      shock: { pressurePsi: 205 },
      tires: { frontPsi: 24, rearPsi: 26 },
    };
    expect(setupSummary(values, { fork: "Fox 38", shock: null }, "pt")).toBe(
      "Fox 38 78 psi · C 12/2 · R 8/– · Amortecedor 205 psi · Pneus 24/26 psi",
    );
    expect(setupSummary(values, { fork: "Fox 38", shock: null }, "en")).toBe(
      "Fox 38 78 psi · C 12/2 · R 8/– · Shock 205 psi · Tyres 24/26 psi",
    );
    expect(setupSummary({ tires: { rearPsi: 26 } }, {}, "pt")).toBe(
      "Pneus –/26 psi",
    );
    expect(setupSummary({}, {}, "pt")).toBeNull();
  });
});

describe("air or coil, one dial or two", () => {
  it("reads the choices, written or implied", () => {
    expect(damperSpring({ pressurePsi: 80 })).toBe("air");
    expect(damperSpring({ springRateLbs: 450 })).toBe("coil");
    expect(damperSpring({ spring: "coil" })).toBe("coil");
    expect(damperSpring(undefined)).toBe("air");
    expect(circuitMode({ compression: 8 }, "compression")).toBe("simple");
    expect(circuitMode({ compressionLow: 8 }, "compression")).toBe("dual");
    expect(circuitMode({ reboundMode: "simple" }, "rebound")).toBe("simple");
    expect(circuitMode(undefined, "rebound")).toBe("dual");
    expect(isSetupValues({ shock: { spring: "coil", rebound: 8 } })).toBe(true);
    expect(isSetupValues({ shock: { spring: "steel" } })).toBe(false);
  });

  it("keeps the numbers of the choice taken and drops the others", () => {
    const coil = {
      shock: {
        spring: "coil" as const,
        pressurePsi: 205,
        springRateLbs: 450,
        compressionMode: "simple" as const,
        compression: 8,
        compressionLow: 12,
        reboundHigh: 3,
      },
    };
    expect(normalizeSetupValues(coil)).toEqual({
      shock: {
        spring: "coil",
        springRateLbs: 450,
        compressionMode: "simple",
        compression: 8,
        reboundHigh: 3,
      },
    });
    // The defaults are not written down, so an older setup compares equal.
    expect(
      normalizeSetupValues({
        fork: { spring: "air", pressurePsi: 78, compressionMode: "dual" },
      }),
    ).toEqual({ fork: { pressurePsi: 78 } });
    expect(setupSummary(coil, { shock: "DHX2" }, "pt")).toBe(
      "DHX2 450 lbs · C 8 · R –/3",
    );
    expect(
      setupDiff({ fork: { pressurePsi: 78 } }, coil, "pt").map((c) =>
        formatSetupChange(c, "pt"),
      ),
    ).toEqual([
      "garfo pressão 78 psi → —",
      "amort. mola → 450 lbs",
      "amort. C → 8",
      "amort. HSR → 3",
    ]);
  });
});

describe("setup differences", () => {
  const reference = {
    fork: { pressurePsi: 78, reboundLow: 8 },
    shock: { reboundLow: 10 },
    tires: { frontPsi: 24, rearPsi: 26 },
  };

  it("names every knob that moved, and only those", () => {
    const next = {
      fork: { pressurePsi: 78, reboundLow: 10, compressionLow: 12 },
      shock: {},
      tires: { frontPsi: 24, rearPsi: 24 },
    };
    const changes = setupDiff(reference, next, "pt");
    expect(changes.map((c) => formatSetupChange(c, "pt"))).toEqual([
      "garfo LSC → 12",
      "garfo LSR +2 · mais aberto",
      "amort. LSR 10 → —",
      "pneu tr. −2 psi · mais mole",
    ]);
    expect(
      setupDiff(reference, next, "en").map((c) => formatSetupChange(c, "en")),
    ).toEqual([
      "fork LSC → 12",
      "fork LSR +2 · more open",
      "shock LSR 10 → —",
      "rear tyre −2 psi · softer",
    ]);
    expect(setupDiff(reference, reference, "pt")).toEqual([]);
  });

  it("keys the same numbers the same, whatever the blanks", () => {
    expect(setupKey(reference)).toBe(
      setupKey({
        ...reference,
        shock: { reboundLow: 10, reboundHigh: undefined },
      }),
    );
    expect(setupKey(reference)).not.toBe(
      setupKey({ ...reference, tires: { frontPsi: 22, rearPsi: 26 } }),
    );
    expect(setupKey({})).toBe("||,|");
  });
});

describe("the rider's weight", () => {
  it("is kept, summed up, compared and diffed like a knob", () => {
    const base = { fork: { pressurePsi: 100 }, rider: { weightKg: 80 } };
    expect(isSetupValues(base)).toBe(true);
    expect(isSetupValues({ rider: { heightCm: 180 } })).toBe(false);
    expect(normalizeSetupValues({ rider: { weightKg: undefined } })).toEqual(
      {},
    );
    expect(isSetupEmpty({ rider: { weightKg: 80 } })).toBe(false);
    expect(setupSummary(base, {}, "pt")).toBe("Garfo 100 psi · Rider 80 kg");
    expect(setupSummary(base, {}, "en")).toBe("Fork 100 psi · Rider 80 kg");
    const heavier = { ...base, rider: { weightKg: 82.5 } };
    expect(setupValuesEqual(base, heavier)).toBe(false);
    expect(
      setupDiff(base, heavier, "pt").map((c) => formatSetupChange(c, "pt")),
    ).toEqual(["rider +2,5 kg"]);
    // The decimal follows the language.
    expect(
      setupDiff(base, heavier, "en").map((c) => formatSetupChange(c, "en")),
    ).toEqual(["rider +2.5 kg"]);
  });
});

describe("sag and the spread of a set of setups", () => {
  it("keeps the sag with either spring, in the summary and the differences", () => {
    const a = { fork: { pressurePsi: 100, travelMm: 160, sagMm: 40 } };
    expect(
      normalizeSetupValues({ fork: { spring: "coil", sagMm: 30 } }),
    ).toEqual({ fork: { spring: "coil", sagMm: 30 } });
    // The share comes from the travel: 40 mm of 160 is 25 % — with the
    // Portuguese space before the sign, and without it in English.
    expect(setupSummary(a, { fork: "Fox X2" }, "pt")).toBe(
      "Fox X2 100 psi · sag 40 mm (25 %)",
    );
    expect(setupSummary(a, { fork: "Fox X2" }, "en")).toBe(
      "Fox X2 100 psi · sag 40 mm (25%)",
    );
    // Without a travel the sag stands alone.
    expect(
      setupSummary({ fork: { sagMm: 48 } }, { fork: "Fox X2" }, "pt"),
    ).toBe("Fox X2 sag 48 mm");
    expect(
      setupDiff(
        a,
        { fork: { pressurePsi: 90, travelMm: 160, sagMm: 48 } },
        "pt",
      ).map((c) => formatSetupChange(c, "pt")),
    ).toEqual([
      "garfo pressão −10 psi · mais macio",
      "garfo sag +8 mm · mais macio",
    ]);
  });

  it("reads the sag as a share of the travel, and says so only with both", () => {
    expect(sagPercent({ travelMm: 160, sagMm: 48 })).toBe(30);
    // The shock: its own stroke, not the wheel's travel.
    expect(sagPercent({ travelMm: 65, sagMm: 19.5 })).toBe(30);
    expect(sagPercent({ sagMm: 48 })).toBeNull();
    expect(sagPercent({ travelMm: 0, sagMm: 48 })).toBeNull();
    expect(sagPercent(undefined)).toBeNull();
  });

  it("says what a set of setups holds constant and what it varies", () => {
    const base = {
      fork: { pressurePsi: 100, compressionLow: 10, compressionHigh: 4 },
      shock: { spring: "coil" as const, springRateLbs: 434 },
      tires: { frontPsi: 20, rearPsi: 22 },
      rider: { weightKg: 80 },
    };
    const set = [
      base,
      { ...base, fork: { ...base.fork, compressionLow: 12 } },
      { ...base, fork: { ...base.fork, compressionHigh: 6 } },
    ];
    const labels = { fork: "Fox X2", shock: "Öhlins TTX22" };
    const spread = setupSpread(set, labels, "pt");
    expect(spread.constant).toEqual([
      "o Fox X2 a 100 psi",
      "o Öhlins TTX22 a 434 lbs",
      "os pneus a 20/22 psi",
      "o peso a 80 kg",
    ]);
    expect(spread.varying).toEqual(["LSC do Fox X2", "HSC do Fox X2"]);
    expect(spread.constantClicks).toBe(0);
    const english = setupSpread(set, labels, "en");
    expect(english.constant).toEqual([
      "the Fox X2 at 100 psi",
      "the Öhlins TTX22 at 434 lbs",
      "the tyres at 20/22 psi",
      "the weight at 80 kg",
    ]);
    expect(english.varying).toEqual(["LSC on the Fox X2", "HSC on the Fox X2"]);
    expect(
      setupSpread([base, { ...base, rider: { weightKg: 82 } }], {}, "pt")
        .constantClicks,
    ).toBe(2);
    expect(setupSpread([], {}, "pt")).toEqual({
      constant: [],
      varying: [],
      constantClicks: 0,
    });
  });
});
