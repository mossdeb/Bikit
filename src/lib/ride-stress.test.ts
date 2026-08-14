import { describe, expect, it } from "vitest";
import {
  RIDE_STRESS_MODALITIES,
  activityRideStress,
  countsTowardIntensity,
  derivedRideMetrics,
  foldRideIntensity,
  lifetimeRideStress,
  localDateOf,
  modalityFor,
  rideIntensity,
  rideIntensityBand,
  rideIntensityDaily,
  rideIntensityTrend,
  scoreRides,
  type RideStressActivity,
} from "./ride-stress";

const DAY = 86_400_000;

function ride(overrides: Partial<RideStressActivity> & { date: string }): RideStressActivity {
  return {
    id: 1,
    name: "ride",
    utcOffsetSeconds: 0,
    distanceKm: 45,
    movingHours: 3,
    elapsedHours: 3.5,
    elevationM: 1400,
    ...overrides,
  };
}

describe("modalities", () => {
  it("gives every bike type a weight set that sums to 1", () => {
    for (const [type, modality] of Object.entries(RIDE_STRESS_MODALITIES)) {
      const { distance, time, elevation } = modality.weights;
      expect(distance + time + elevation, type).toBeCloseTo(1, 10);
    }
  });

  it("gives every bike type a non-zero reference, since each one is a divisor", () => {
    for (const [type, modality] of Object.entries(RIDE_STRESS_MODALITIES)) {
      expect(modality.reference.distanceKm, type).toBeGreaterThan(0);
      expect(modality.reference.hours, type).toBeGreaterThan(0);
      expect(modality.reference.elevationM, type).toBeGreaterThan(0);
    }
  });

  it("falls back to Other for a null, unknown or differently cased type", () => {
    expect(modalityFor(null)).toBe(RIDE_STRESS_MODALITIES.Other);
    expect(modalityFor("Bicicleta de montanha")).toBe(RIDE_STRESS_MODALITIES.Other);
    expect(modalityFor("e-mtb")).toBe(RIDE_STRESS_MODALITIES["E-MTB"]);
    expect(modalityFor("  Downhill ")).toBe(RIDE_STRESS_MODALITIES.Downhill);
  });
});

describe("activityRideStress", () => {
  it("scores the reference ride of a modality at exactly 100", () => {
    for (const [type, modality] of Object.entries(RIDE_STRESS_MODALITIES)) {
      const reference = ride({
        date: "2026-08-01T08:00:00Z",
        distanceKm: modality.reference.distanceKm,
        movingHours: modality.reference.hours,
        elevationM: modality.reference.elevationM,
      });
      expect(activityRideStress(reference, modality).stress, type).toBeCloseTo(100, 10);
    }
  });

  it("does not cap — an epic scores above 100", () => {
    const epic = ride({ date: "2026-08-01T08:00:00Z", distanceKm: 90, movingHours: 6, elevationM: 2800 });
    expect(activityRideStress(epic, RIDE_STRESS_MODALITIES["E-MTB"]).stress).toBeCloseTo(200, 10);
  });

  it("redistributes the elevation weight when the climb is unknown, rather than scoring it flat", () => {
    const modality = RIDE_STRESS_MODALITIES["E-MTB"];
    const known = ride({ date: "2026-08-01T08:00:00Z", elevationM: null });

    const scored = activityRideStress(known, modality);
    expect(scored.estimated).toBe(true);
    // Distance and time are both at reference, so the ride reads as a full
    // reference ride on the evidence available — not as 55% of one, which is
    // what a zero climb would have made of it.
    expect(scored.stress).toBeCloseTo(100, 10);

    const asIfFlat = activityRideStress({ ...known, elevationM: 0 }, modality);
    expect(asIfFlat.stress).toBeCloseTo(55, 10);
    expect(asIfFlat.estimated).toBe(false);
  });
});

describe("local dates", () => {
  it("puts a late ride on the day the rider rode it, not the UTC day", () => {
    // 23:30 in Lisbon in August is already tomorrow in UTC.
    expect(localDateOf("2026-08-12T22:30:00Z", 3600)).toBe("2026-08-12");
    expect(localDateOf("2026-08-12T23:30:00Z", 3600)).toBe("2026-08-13");
  });

  it("falls back to UTC when the offset was never recorded", () => {
    expect(localDateOf("2026-08-12T23:30:00Z", null)).toBe("2026-08-12");
  });
});

describe("scoreRides", () => {
  it("returns rides oldest first whatever order they arrive in", () => {
    const scored = scoreRides(
      [
        ride({ id: 2, date: "2026-08-05T08:00:00Z" }),
        ride({ id: 1, date: "2026-08-01T08:00:00Z" }),
        ride({ id: 3, date: "2026-08-09T08:00:00Z" }),
      ],
      "E-MTB"
    );
    expect(scored.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("scores the same ride differently on a different bike", () => {
    const one = ride({ date: "2026-08-01T08:00:00Z" });
    const [asEmtb] = scoreRides([one], "E-MTB");
    const [asRoad] = scoreRides([one], "Road");
    expect(asEmtb.stress).toBeCloseTo(100, 10);
    expect(asRoad.stress).not.toBeCloseTo(asEmtb.stress, 1);
  });
});

describe("lifetimeRideStress", () => {
  it("sums every ride, uncapped", () => {
    const rides = scoreRides(
      [
        ride({ id: 1, date: "2026-08-01T08:00:00Z" }),
        ride({ id: 2, date: "2026-08-02T08:00:00Z", distanceKm: 90, movingHours: 6, elevationM: 2800 }),
      ],
      "E-MTB"
    );
    expect(lifetimeRideStress(rides)).toBeCloseTo(300, 8);
  });

  it("starts from a checkpoint's total when there is one", () => {
    const rides = scoreRides([ride({ date: "2026-08-01T08:00:00Z" })], "E-MTB");
    expect(
      lifetimeRideStress(rides, { stressTotal: 1200, intensity: 40, intensityAt: "2026-07-01T08:00:00Z" })
    ).toBeCloseTo(1300, 8);
  });

  it("is zero for a bike with no rides", () => {
    expect(lifetimeRideStress([])).toBe(0);
  });
});

describe("rideIntensity", () => {
  it("has no value at all for a bike that has never been ridden", () => {
    expect(rideIntensity([], new Date("2026-08-14T12:00:00Z"))).toBeNull();
  });

  it("seeds on the first ride instead of averaging it against zero", () => {
    const rides = scoreRides([ride({ date: "2026-08-14T08:00:00Z" })], "E-MTB");
    const ri = rideIntensity(rides, new Date("2026-08-14T08:00:00Z"));
    // A reference ride is a 100, and the bike's first ride being reported as
    // Light (0.3 x 100 = 30) would be the model contradicting the ride.
    expect(ri?.value).toBeCloseTo(100, 10);
    expect(ri?.band).toBe("extreme");
  });

  it("caps what one ride contributes at 100 while the lifetime keeps the surplus", () => {
    const rides = scoreRides(
      [
        ride({ id: 1, date: "2026-08-01T08:00:00Z", distanceKm: 5, movingHours: 0.3, elevationM: 100 }),
        ride({ id: 2, date: "2026-08-02T08:00:00Z", distanceKm: 90, movingHours: 6, elevationM: 2800 }),
      ],
      "E-MTB"
    );
    const state = foldRideIntensity(rides)!;
    const seeded = Math.min(rides[0].stress, 100);
    const expected = 0.7 * seeded * Math.pow(0.99, 1) + 0.3 * 100;
    expect(state.value).toBeCloseTo(expected, 10);
    expect(lifetimeRideStress(rides)).toBeGreaterThan(200);
  });

  it("decays while the bike stands still", () => {
    const rides = scoreRides([ride({ date: "2026-07-15T08:00:00Z" })], "E-MTB");
    const after30 = rideIntensity(rides, new Date("2026-08-14T08:00:00Z"))!;
    expect(after30.value).toBeCloseTo(100 * Math.pow(0.99, 30), 8);
    expect(after30.band).toBe("high");
  });

  it("decays by a rounding error between two rides on the same day", () => {
    const rides = scoreRides(
      [
        ride({ id: 1, date: "2026-08-14T08:00:00Z" }),
        ride({ id: 2, date: "2026-08-14T14:00:00Z" }),
      ],
      "E-MTB"
    );
    const state = foldRideIntensity(rides)!;
    expect(state.value).toBeCloseTo(0.7 * 100 * Math.pow(0.99, 0.25) + 0.3 * 100, 10);
    expect(state.value).toBeLessThan(100);
    expect(state.value).toBeGreaterThan(99.8);
  });

  it("never runs the decay backwards for a ride that lands out of order", () => {
    const rides = scoreRides([ride({ date: "2026-08-14T08:00:00Z" })], "E-MTB");
    // asOf before the ride: the value is what the ride produced, not more.
    expect(rideIntensity(rides, new Date("2026-08-13T08:00:00Z"))!.value).toBeCloseTo(100, 10);
  });
});

describe("the intensity floor", () => {
  it("counts a ride that clears either dimension", () => {
    // Short but quick — a real ride that happens not to last long.
    expect(countsTowardIntensity({ distanceKm: 5, movingHours: 0.13 })).toBe(true);
    // Slow but long — a session that happens not to cover ground.
    expect(countsTowardIntensity({ distanceKm: 0.5, movingHours: 0.5 })).toBe(true);
    // Exactly on both floors still counts: the floor is what is under it.
    expect(countsTowardIntensity({ distanceKm: 1, movingHours: 0 })).toBe(true);
    expect(countsTowardIntensity({ distanceKm: 0, movingHours: 0.25 })).toBe(true);
  });

  it("drops only what is small in both", () => {
    expect(countsTowardIntensity({ distanceKm: 0.4, movingHours: 0.1 })).toBe(false);
    expect(countsTowardIntensity({ distanceKm: 0, movingHours: 0.0028 })).toBe(false);
  });

  it("leaves the intensity where the last real ride left it", () => {
    // The case this exists for: one real ride, then a morning of parking-lot
    // rides. Before the floor those three took the index from 67 to 12.
    const rides = scoreRides(
      [
        ride({ id: 1, date: "2026-08-13T08:00:00Z", distanceKm: 24, movingHours: 2.17, elevationM: 969 }),
        ride({ id: 2, date: "2026-08-14T06:00:00Z", distanceKm: 0.5, movingHours: 0.2, elevationM: 0 }),
        ride({ id: 3, date: "2026-08-14T06:47:00Z", distanceKm: 0, movingHours: 0.003, elevationM: 0 }),
        ride({ id: 4, date: "2026-08-14T06:50:00Z", distanceKm: 0.4, movingHours: 0.1, elevationM: 0 }),
      ],
      "E-MTB"
    );
    const asOf = new Date("2026-08-14T09:00:00Z");

    const withNoise = rideIntensity(rides, asOf)!;
    const bigRideOnly = rideIntensity(rides.slice(0, 1), asOf)!;
    expect(withNoise.value).toBeCloseTo(bigRideOnly.value, 10);
    expect(withNoise.value).toBeGreaterThan(60);
  });

  it("still counts the dropped rides towards the lifetime total", () => {
    const rides = scoreRides(
      [
        ride({ id: 1, date: "2026-08-14T06:00:00Z", distanceKm: 0.5, movingHours: 0.2, elevationM: 3 }),
        ride({ id: 2, date: "2026-08-14T07:00:00Z", distanceKm: 0.4, movingHours: 0.1, elevationM: 0 }),
      ],
      "E-MTB"
    );
    expect(rides.every((r) => !r.countsTowardIntensity)).toBe(true);
    expect(lifetimeRideStress(rides)).toBeGreaterThan(0);
  });

  it("reads zero, not nothing, for a bike whose every ride is under the floor", () => {
    const rides = scoreRides(
      [ride({ date: "2026-08-14T06:00:00Z", distanceKm: 0.4, movingHours: 0.1, elevationM: 0 })],
      "E-MTB"
    );
    const ri = rideIntensity(rides, new Date("2026-08-14T09:00:00Z"));
    expect(ri).not.toBeNull();
    expect(ri!.value).toBe(0);
    expect(ri!.band).toBe("light");
  });

  it("keeps them out of the daily curve too", () => {
    const asOf = new Date("2026-08-14T12:00:00Z");
    const real = ride({ id: 1, date: "2026-08-10T08:00:00Z" });
    const noise = ride({ id: 2, date: "2026-08-12T08:00:00Z", distanceKm: 0.4, movingHours: 0.1, elevationM: 0 });

    const withNoise = rideIntensityDaily(scoreRides([real, noise], "E-MTB"), asOf, 30);
    const without = rideIntensityDaily(scoreRides([real], "E-MTB"), asOf, 30);
    for (let i = 0; i < withNoise.length; i++) {
      expect(withNoise[i].value, withNoise[i].date).toBeCloseTo(without[i].value, 10);
    }
  });
});

describe("rideIntensityBand", () => {
  it("splits at 25, 50 and 75, with the boundary belonging to the band below", () => {
    expect(rideIntensityBand(0)).toBe("light");
    expect(rideIntensityBand(25)).toBe("light");
    expect(rideIntensityBand(25.001)).toBe("moderate");
    expect(rideIntensityBand(50)).toBe("moderate");
    expect(rideIntensityBand(50.001)).toBe("high");
    expect(rideIntensityBand(75)).toBe("high");
    expect(rideIntensityBand(75.001)).toBe("extreme");
    expect(rideIntensityBand(100)).toBe("extreme");
  });
});

describe("rideIntensityTrend", () => {
  const asOf = new Date("2026-08-14T12:00:00Z");

  it("rises when a ride landed inside the last week", () => {
    const rides = scoreRides(
      [
        ride({ id: 1, date: "2026-06-01T08:00:00Z", distanceKm: 10, movingHours: 0.8, elevationM: 200 }),
        ride({ id: 2, date: "2026-08-11T08:00:00Z" }),
      ],
      "E-MTB"
    );
    expect(rideIntensityTrend(rides, asOf)).toBe("up");
  });

  it("falls when the last week was only decay", () => {
    const rides = scoreRides([ride({ date: "2026-08-05T08:00:00Z" })], "E-MTB");
    expect(rideIntensityTrend(rides, asOf)).toBe("down");
  });

  it("reads flat when the week moved it by less than a point", () => {
    // Decay alone over a week from a low value is under 1 point.
    const rides = scoreRides(
      [ride({ date: "2026-05-01T08:00:00Z", distanceKm: 5, movingHours: 0.4, elevationM: 100 })],
      "E-MTB"
    );
    expect(rideIntensityTrend(rides, asOf)).toBe("flat");
  });

  it("reads flat for a bike with no rides at all", () => {
    expect(rideIntensityTrend([], asOf)).toBe("flat");
  });

  it("rises for a bike whose whole history is inside the week", () => {
    const rides = scoreRides([ride({ date: "2026-08-12T08:00:00Z" })], "E-MTB");
    expect(rideIntensityTrend(rides, asOf)).toBe("up");
  });
});

describe("rideIntensityDaily", () => {
  const asOf = new Date("2026-08-14T12:00:00Z");

  it("returns one sample per day, oldest first, ending on asOf", () => {
    const rides = scoreRides([ride({ date: "2026-08-10T08:00:00Z" })], "E-MTB");
    const series = rideIntensityDaily(rides, asOf, 30);
    expect(series).toHaveLength(30);
    expect(series[0].date).toBe("2026-07-16");
    expect(series[29].date).toBe("2026-08-14");
  });

  it("reads zero before the bike's first ride and agrees with rideIntensity on the last day", () => {
    const rides = scoreRides([ride({ date: "2026-08-10T08:00:00Z" })], "E-MTB");
    const series = rideIntensityDaily(rides, asOf, 30);
    expect(series[0].value).toBe(0);
    expect(series[29].value).toBeCloseTo(rideIntensity(rides, asOf)!.value, 10);
  });

  it("starts the curve where the history left it, not at zero, when the rides predate the window", () => {
    const rides = scoreRides([ride({ date: "2026-06-01T08:00:00Z" })], "E-MTB");
    const series = rideIntensityDaily(rides, asOf, 30);
    expect(series[0].value).toBeGreaterThan(0);
    expect(series[0].value).toBeCloseTo(100 * Math.pow(0.99, (new Date("2026-07-16T12:00:00Z").getTime() - new Date("2026-06-01T08:00:00Z").getTime()) / DAY), 8);
  });
});

describe("compaction", () => {
  // The seam that makes deleting old rows survivable: fold the first half into
  // a checkpoint and the answer must not move a decimal, because Ride
  // Intensity depends on the past only through (value, instant).
  const rides = scoreRides(
    [
      ride({ id: 1, date: "2026-05-02T08:00:00Z", distanceKm: 30, movingHours: 2, elevationM: 700 }),
      ride({ id: 2, date: "2026-05-20T08:00:00Z", distanceKm: 60, movingHours: 4, elevationM: 1800 }),
      ride({ id: 3, date: "2026-06-11T08:00:00Z", distanceKm: 12, movingHours: 1, elevationM: 300 }),
      ride({ id: 4, date: "2026-07-30T08:00:00Z", distanceKm: 45, movingHours: 3, elevationM: 1400 }),
      ride({ id: 5, date: "2026-08-09T08:00:00Z", distanceKm: 22, movingHours: 1.6, elevationM: 930 }),
    ],
    "E-MTB"
  );
  const asOf = new Date("2026-08-14T12:00:00Z");

  it("gives the same intensity and lifetime whether or not the old rides were folded away", () => {
    const old = rides.slice(0, 3);
    const kept = rides.slice(3);
    const foldedState = foldRideIntensity(old)!;

    const checkpoint = {
      stressTotal: lifetimeRideStress(old),
      intensity: foldedState.value,
      intensityAt: foldedState.at,
    };

    expect(lifetimeRideStress(kept, checkpoint)).toBeCloseTo(lifetimeRideStress(rides), 10);
    expect(rideIntensity(kept, asOf, checkpoint)!.value).toBeCloseTo(rideIntensity(rides, asOf)!.value, 10);
  });

  it("gives the same daily curve too", () => {
    const old = rides.slice(0, 3);
    const kept = rides.slice(3);
    const foldedState = foldRideIntensity(old)!;
    const checkpoint = {
      stressTotal: lifetimeRideStress(old),
      intensity: foldedState.value,
      intensityAt: foldedState.at,
    };

    const full = rideIntensityDaily(rides, asOf, 30);
    const compacted = rideIntensityDaily(kept, asOf, 30, { checkpoint });
    for (let i = 0; i < full.length; i++) {
      expect(compacted[i].value, full[i].date).toBeCloseTo(full[i].value, 10);
    }
  });
});

describe("derivedRideMetrics", () => {
  it("computes the five figures the score does not use", () => {
    const [scored] = scoreRides(
      [ride({ date: "2026-08-01T08:00:00Z", distanceKm: 30, movingHours: 2, elapsedHours: 2.5, elevationM: 600 })],
      "E-MTB"
    );
    const m = derivedRideMetrics(scored);
    expect(m.movingSpeedKmh).toBeCloseTo(15, 10);
    expect(m.overallSpeedKmh).toBeCloseTo(12, 10);
    expect(m.elevationPerKm).toBeCloseTo(20, 10);
    expect(m.elevationPerHour).toBeCloseTo(300, 10);
    expect(m.movingRatio).toBeCloseTo(0.8, 10);
  });

  it("returns null rather than a division by zero for a ride that never moved", () => {
    const [scored] = scoreRides(
      [ride({ date: "2026-08-01T08:00:00Z", distanceKm: 0, movingHours: 0, elapsedHours: 0, elevationM: null })],
      "E-MTB"
    );
    const m = derivedRideMetrics(scored);
    expect(m.movingSpeedKmh).toBeNull();
    expect(m.overallSpeedKmh).toBeNull();
    expect(m.elevationPerKm).toBeNull();
    expect(m.elevationPerHour).toBeNull();
    expect(m.movingRatio).toBeNull();
  });
});
