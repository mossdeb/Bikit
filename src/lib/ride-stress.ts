import type { BikeType } from "./constants";

/**
 * Ride Stress — how hard a bike is being ridden, as opposed to how much.
 *
 * Two numbers, deliberately independent of everything else in the app. Neither
 * one moves a service interval, shortens a component's life or sends a
 * notification: the maintenance side of Bikit counts kilometres and hours, and
 * this counts effort. They are read side by side and never mixed.
 *
 *   Lifetime Ride Stress (LRS) — every ride's stress, summed. Only grows.
 *   Ride Intensity (RI)        — 0..100, how demanding the recent riding is.
 *
 * Nothing here is stored. Every value is derived from the rows in
 * strava_activities on read, for the same reason a component's usage is
 * derived from the bike's totals rather than kept in a column: a second copy
 * is a second thing that can be wrong. It also means the reference values
 * below can be re-tuned and every number in the app agrees with them on the
 * next request, with no migration and no recompute — which matters while the
 * model is still a beta.
 *
 * The whole module is pure and imports nothing but a type, so the tests can
 * reach it with a relative import (there is no vitest.config.ts, so the `@/`
 * alias does not resolve under vitest).
 */

// ---------------------------------------------------------------------------
// Modalities
// ---------------------------------------------------------------------------

export interface RideStressModality {
  /** Must sum to 1. There is a test. */
  weights: { distance: number; time: number; elevation: number };
  /** The ride that scores 100 — demanding but not exceptional for this kind of
   * riding. Everything is measured against it, so these are the numbers to
   * turn when the scale feels wrong, not the weights. */
  reference: { distanceKm: number; hours: number; elevationM: number };
}

/**
 * One entry per BIKE_TYPES entry — the modality of a ride is the kind of bike
 * it was ridden on, not what Strava called the activity. Strava has no word
 * for Enduro, Downhill or XC (they are all MountainBikeRide), and the bike
 * knows what it is. sport_type is stored on the row anyway, for the day the
 * two disagree loudly enough to matter.
 */
export const RIDE_STRESS_MODALITIES: Record<BikeType, RideStressModality> = {
  Road: {
    weights: { distance: 0.55, time: 0.35, elevation: 0.1 },
    reference: { distanceKm: 80, hours: 3, elevationM: 800 },
  },
  Gravel: {
    weights: { distance: 0.45, time: 0.35, elevation: 0.2 },
    reference: { distanceKm: 70, hours: 3.5, elevationM: 900 },
  },
  "Endurance road": {
    weights: { distance: 0.45, time: 0.45, elevation: 0.1 },
    reference: { distanceKm: 120, hours: 4.5, elevationM: 1200 },
  },
  Enduro: {
    weights: { distance: 0.25, time: 0.35, elevation: 0.4 },
    reference: { distanceKm: 30, hours: 3, elevationM: 900 },
  },
  XC: {
    weights: { distance: 0.4, time: 0.3, elevation: 0.3 },
    reference: { distanceKm: 35, hours: 2, elevationM: 800 },
  },
  // Downhill carries a caveat worth knowing about before trusting the number:
  // Strava's total_elevation_gain counts climbing, and a shuttled or lifted DH
  // day climbs almost nothing while doing all its damage on the way down. The
  // reference is set low so those days are not crushed by the 30% elevation
  // weight, but a truly uplifted day still forfeits that share. Fixing it
  // properly needs descent, which the summary payload does not carry.
  Downhill: {
    weights: { distance: 0.1, time: 0.6, elevation: 0.3 },
    reference: { distanceKm: 20, hours: 2.5, elevationM: 300 },
  },
  "E-MTB": {
    weights: { distance: 0.2, time: 0.35, elevation: 0.45 },
    reference: { distanceKm: 45, hours: 3, elevationM: 1400 },
  },
  "Urban / Commuter": {
    weights: { distance: 0.6, time: 0.35, elevation: 0.05 },
    reference: { distanceKm: 20, hours: 1, elevationM: 150 },
  },
  Other: {
    weights: { distance: 0.4, time: 0.4, elevation: 0.2 },
    reference: { distanceKm: 50, hours: 2.5, elevationM: 600 },
  },
};

const MODALITY_BY_KEY = new Map(
  Object.entries(RIDE_STRESS_MODALITIES).map(([type, modality]) => [type.toLowerCase(), modality])
);

/** bikes.type is free text and nullable — anything unrecognised rides as
 * Other, which is what Other is for. */
export function modalityFor(bikeType: string | null | undefined): RideStressModality {
  return MODALITY_BY_KEY.get((bikeType ?? "").trim().toLowerCase()) ?? RIDE_STRESS_MODALITIES.Other;
}

// ---------------------------------------------------------------------------
// One ride
// ---------------------------------------------------------------------------

export interface RideStressActivity {
  id: number;
  name: string | null;
  /** The UTC instant the ride started. Every duration in here is computed from
   * these, never from the local clock, so a rider crossing a timezone does not
   * bend the decay. */
  date: string;
  /** Seconds east of UTC, as Strava reported it for this ride. Display only. */
  utcOffsetSeconds: number | null;
  distanceKm: number;
  movingHours: number;
  elapsedHours: number | null;
  elevationM: number | null;
}

/**
 * Below BOTH of these, a ride does not move Ride Intensity.
 *
 * Measured on the owner's own history: after a real 24 km ride the index stood
 * at 67, and three parking-lot rides the next morning — 0.4 km, six minutes,
 * the kind of thing that lands in Strava by accident — dragged it to 12. The
 * model was working exactly as written (every ride replaces 30% of the memory,
 * whatever its size), and the result was a lie: nothing about that morning
 * made the bike's recent riding four times gentler.
 *
 * Both conditions, not either. A 5 km ride done in eight minutes is a real
 * ride that happens to be short, and a 900 m session that took half an hour is
 * a real session that happens to be slow. Only something small in distance AND
 * small in time is noise.
 *
 * They still count towards Lifetime Ride Stress. They happened, they added
 * their two points, and the lifetime figure is the one that is supposed to
 * remember everything.
 */
export const RIDE_INTENSITY_FLOOR = { distanceKm: 1, movingHours: 0.25 } as const;

export function countsTowardIntensity(activity: { distanceKm: number; movingHours: number }): boolean {
  return (
    activity.distanceKm >= RIDE_INTENSITY_FLOOR.distanceKm ||
    activity.movingHours >= RIDE_INTENSITY_FLOOR.movingHours
  );
}

export interface ScoredRide extends RideStressActivity {
  /** Activity Ride Stress. Uncapped: an epic is allowed to score 240. */
  stress: number;
  /** False for a ride under RIDE_INTENSITY_FLOOR — it is in the lifetime
   * total and in the list, and it leaves the intensity chain alone. */
  countsTowardIntensity: boolean;
  /** True when the ride had no elevation figure and the elevation weight was
   * redistributed over the two factors that were known. Treating a missing
   * climb as zero would claim the ride was flat, and dropping the ride would
   * claim it never happened; both are worse than saying "estimated". */
  estimated: boolean;
  /** YYYY-MM-DD on the rider's own clock — what they would call "the day I
   * rode". A ride starting 23:30 in Lisbon in August is already tomorrow in
   * UTC, and grouping it under tomorrow reads as wrong to the only person who
   * was there. */
  localDate: string;
}

export function activityRideStress(activity: RideStressActivity, modality: RideStressModality): {
  stress: number;
  estimated: boolean;
} {
  const { weights, reference } = modality;
  const distanceFactor = activity.distanceKm / reference.distanceKm;
  const timeFactor = activity.movingHours / reference.hours;

  if (activity.elevationM == null) {
    // Renormalise over what is known rather than scoring the unknown as zero.
    const known = weights.distance + weights.time;
    return {
      stress: (100 * (weights.distance * distanceFactor + weights.time * timeFactor)) / known,
      estimated: true,
    };
  }

  const elevationFactor = activity.elevationM / reference.elevationM;
  return {
    stress:
      100 *
      (weights.distance * distanceFactor + weights.time * timeFactor + weights.elevation * elevationFactor),
    estimated: false,
  };
}

export function localDateOf(isoInstant: string, utcOffsetSeconds: number | null): string {
  const shifted = new Date(new Date(isoInstant).getTime() + (utcOffsetSeconds ?? 0) * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Scores every ride and returns them oldest first — the order the intensity
 * chain has to be walked in, so it is established once here rather than
 * assumed by each caller. */
export function scoreRides(activities: RideStressActivity[], bikeType: string | null | undefined): ScoredRide[] {
  const modality = modalityFor(bikeType);
  return activities
    .map((activity) => ({
      ...activity,
      ...activityRideStress(activity, modality),
      countsTowardIntensity: countsTowardIntensity(activity),
      localDate: localDateOf(activity.date, activity.utcOffsetSeconds),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** The five figures the PDF derives and the score does not use. They are worth
 * showing per ride — they are how a rider recognises the ride — but none of
 * them enters the stress, which is why they live apart from it. */
export function derivedRideMetrics(ride: ScoredRide) {
  const movingSpeedKmh = ride.movingHours > 0 ? ride.distanceKm / ride.movingHours : null;
  const overallSpeedKmh = ride.elapsedHours && ride.elapsedHours > 0 ? ride.distanceKm / ride.elapsedHours : null;
  const elevationPerKm = ride.elevationM != null && ride.distanceKm > 0 ? ride.elevationM / ride.distanceKm : null;
  const elevationPerHour = ride.elevationM != null && ride.movingHours > 0 ? ride.elevationM / ride.movingHours : null;
  const movingRatio = ride.elapsedHours && ride.elapsedHours > 0 ? ride.movingHours / ride.elapsedHours : null;
  return { movingSpeedKmh, overallSpeedKmh, elevationPerKm, elevationPerHour, movingRatio };
}

// ---------------------------------------------------------------------------
// Lifetime Ride Stress
// ---------------------------------------------------------------------------

/**
 * The state a compaction would have to preserve, and all of it.
 *
 * strava_activities is not compacted today — at ~0.1 KB a ride there is
 * nothing to solve, and folding a ride freezes its stress at whatever the
 * reference values were that day, which is the last thing wanted while they
 * are still being tuned. The seam exists because Ride Intensity happens to be
 * a chain with no memory: today's value depends on the whole past through
 * exactly two numbers, the value and the instant it had it. So a checkpoint
 * reproduces the history rather than approximating it, and there is a test
 * that says so.
 */
export interface RideStressCheckpoint {
  /** Summed stress of every ride folded into this checkpoint. */
  stressTotal: number;
  /** Ride Intensity immediately after the last folded ride. */
  intensity: number;
  /** When that was — the instant, not the local date. */
  intensityAt: string;
}

export function lifetimeRideStress(rides: ScoredRide[], checkpoint?: RideStressCheckpoint | null): number {
  return rides.reduce((total, ride) => total + ride.stress, checkpoint?.stressTotal ?? 0);
}

// ---------------------------------------------------------------------------
// Ride Intensity
// ---------------------------------------------------------------------------

/** How much of the previous value survives one ride. */
const RI_MEMORY = 0.7;
/** How much of the new ride lands. RI_MEMORY + RI_ARRIVAL = 1. */
const RI_ARRIVAL = 0.3;
/** Per idle day. Applied on the fraction of a day too: a continuous curve
 * beats one that lurches at midnight, and two rides hours apart then decay by
 * a rounding error instead of by nothing or by a whole day. */
const RI_DAILY_DECAY = 0.99;
const MS_PER_DAY = 86_400_000;

export type RideIntensityBand = "light" | "moderate" | "high" | "extreme";

/** 0–25 · 26–50 · 51–75 · 76–100. The boundary value belongs to the band
 * below it, so a bike reading exactly 25 is Light and 26 is the first
 * Moderate — which is how the ranges are written down and therefore how
 * anyone reading them will expect the app to behave. */
export function rideIntensityBand(value: number): RideIntensityBand {
  if (value <= 25) return "light";
  if (value <= 50) return "moderate";
  if (value <= 75) return "high";
  return "extreme";
}

export interface RideIntensityState {
  value: number;
  at: string;
}

function decayed(state: RideIntensityState, to: Date): number {
  const days = (to.getTime() - new Date(state.at).getTime()) / MS_PER_DAY;
  // Never run the decay backwards: an activity that lands out of order would
  // otherwise inflate the value it was supposed to add to.
  if (days <= 0) return state.value;
  return state.value * Math.pow(RI_DAILY_DECAY, days);
}

/**
 * Walks the chain over `rides` (oldest first) and returns the state after the
 * last one.
 *
 * The first ride of a bike's life seeds the value instead of being averaged
 * against zero. Starting at zero is defensible as a limit and indefensible on
 * screen: one brutal opening ride would score 0.3 × 80 = 24 and be labelled
 * Light, which is the opposite of what happened.
 */
export function foldRideIntensity(
  rides: ScoredRide[],
  checkpoint?: RideStressCheckpoint | null
): RideIntensityState | null {
  let state: RideIntensityState | null = checkpoint
    ? { value: checkpoint.intensity, at: checkpoint.intensityAt }
    : null;

  for (const ride of rides) {
    if (!ride.countsTowardIntensity) continue;
    const arriving = Math.min(ride.stress, 100);
    state = state
      ? { value: RI_MEMORY * decayed(state, new Date(ride.date)) + RI_ARRIVAL * arriving, at: ride.date }
      : { value: arriving, at: ride.date };
  }

  return state;
}

/** Ride Intensity as of `asOf` — the folded chain, then decayed for however
 * long the bike has been standing still since the last ride. */
export function rideIntensity(
  rides: ScoredRide[],
  asOf: Date,
  checkpoint?: RideStressCheckpoint | null
): { value: number; band: RideIntensityBand; lastRideAt: string | null } | null {
  const state = foldRideIntensity(rides, checkpoint);

  // No rides at all is a bike with nothing to say, and gets no figure. Rides
  // that all sat under the floor is a different answer to the same question:
  // the bike has been ridden and none of it was demanding, which is a zero
  // rather than a silence.
  if (!state) {
    if (rides.length === 0) return null;
    return { value: 0, band: rideIntensityBand(0), lastRideAt: rides[rides.length - 1].date };
  }

  const value = decayed(state, asOf);
  return { value, band: rideIntensityBand(value), lastRideAt: state.at };
}

/**
 * One Ride Intensity value per local day, ending at `asOf`, for the trend
 * chart. Sampled at the end of each day so a day with a ride shows the value
 * that ride produced rather than the value it replaced.
 *
 * Rides before the window still count: the chain is folded up to the window's
 * start first, which is what makes the curve begin where the history left it
 * instead of at zero.
 */
export function rideIntensityDaily(
  rides: ScoredRide[],
  asOf: Date,
  days: number,
  options?: { checkpoint?: RideStressCheckpoint | null; utcOffsetSeconds?: number | null }
): { date: string; value: number }[] {
  const { checkpoint, utcOffsetSeconds = null } = options ?? {};
  const series: { date: string; value: number }[] = [];
  let state = checkpoint ? ({ value: checkpoint.intensity, at: checkpoint.intensityAt } as RideIntensityState) : null;
  let next = 0;

  for (let i = days - 1; i >= 0; i--) {
    const dayEnd = new Date(asOf.getTime() - i * MS_PER_DAY);

    while (next < rides.length && new Date(rides[next].date).getTime() <= dayEnd.getTime()) {
      const ride = rides[next++];
      if (!ride.countsTowardIntensity) continue;
      const arriving = Math.min(ride.stress, 100);
      state = state
        ? { value: RI_MEMORY * decayed(state, new Date(ride.date)) + RI_ARRIVAL * arriving, at: ride.date }
        : { value: arriving, at: ride.date };
    }

    series.push({
      date: localDateOf(dayEnd.toISOString(), utcOffsetSeconds),
      value: state ? decayed(state, dayEnd) : 0,
    });
  }

  return series;
}
