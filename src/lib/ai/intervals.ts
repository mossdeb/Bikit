// Maintenance-profile vocabulary and the 3-slot selection heuristic.
//
// A profile stores EVERY documented interval; component_service_intervals
// holds at most 3 per component (slot 1–3, a schema decision this feature
// deliberately does not reopen). So something has to choose, and it should
// be the same something for every user: the app, not the AI and not chance.

import { asIncludes } from "../interval-includes";

/** Smart Setup components may fill up to 5 reminder slots (2026-08-11,
 * migration 00029); the manual form deliberately keeps its 3. */
export const AI_SETUP_MAX_INTERVALS = 5;

export const INTERVAL_TYPES = ["km", "hours", "months"] as const;
export type IntervalType = (typeof INTERVAL_TYPES)[number];

export interface MaintenanceInterval {
  /** Canonical English — translated at presentation via intervalName(). */
  name: string;
  type: IntervalType;
  interval: number;
  /**
   * The services this one reminder covers, when curation merged several that
   * share a cadence — a FOX fork does lowers, damper and air spring together
   * at 125 h, which is one workshop visit and so one reminder.
   *
   * Canonical names, not prose, and that is the whole point: every entry is
   * already a components.intervalNames key, so the list translates itself and
   * a merge costs no new strings. The alternative — writing the list into the
   * name, as "Full Service (Lowers | Damper | Air Spring)" — put untranslated
   * interface text into a translation key and reached push titles that way.
   *
   * Curation writes this, never the AI: it is deliberately absent from the
   * wire schema in maintenance-search.ts, for the same reason the parenthesised
   * names were kept out of CANONICAL_INTERVAL_NAMES.
   */
  includes?: string[];
}

/**
 * Names the AI is asked to prefer, and the keys the dictionaries translate.
 * Not a closed enum: a service a manufacturer names differently still comes
 * through verbatim and shows untranslated rather than not at all.
 */
export const CANONICAL_INTERVAL_NAMES = [
  "Lower Leg Service",
  // "Lower Leg Full Service" is translated but deliberately NOT requested:
  // where a fork services lowers, damper and air spring on one cadence the
  // curated library calls that "Full Service", and asking the AI for a
  // fourth name would reintroduce the duplicate the curation removed.
  "Full Service",
  "Damper Service",
  "Air Spring Service",
  "Annual Service",
  "Oil Change",
  "Seal Replacement",
  "Bushing Service",
  "Bearing Service",
  "Brake Bleed",
  "Piston Cleaning & Lubrication",
  "Caliper Full Service",
  "Pad Replacement",
  "Chain Replacement",
  "Chain Lube",
  "Cassette Replacement",
  "Drivetrain Cleaning",
  "Tire Replacement",
  "Sealant Refresh",
  "Wheel Truing",
  "Spoke Tension Check",
  "Firmware Update",
  "Battery Health Check",
  "Motor Inspection",
] as const;

/**
 * Catalog rows arrive as jsonb and are cast, not parsed — the shape is
 * whatever curation last wrote by hand. This does not re-validate the whole
 * interval (that cast is older than this field and is left alone); it only
 * guarantees `includes` is an array of strings or absent, because it is the
 * one field that gets .map()'d straight into a render. A curation slip like
 * `includes: "Lower Leg Service"` would otherwise crash the page.
 */
export function withSafeIncludes(interval: MaintenanceInterval): MaintenanceInterval {
  const includes = asIncludes(interval.includes);
  return includes ? { ...interval, includes } : { ...interval, includes: undefined };
}

// Comparing "every 50 hours" with "every 1000 km" or "every 12 months" needs
// a common currency. These are riding-pattern guesses, not measurements —
// ~15 km covered per riding hour, ~10 riding hours per month — and they only
// have to rank intervals, not price them. Being off by 2× rarely changes
// which three come first.
const KM_PER_RIDING_HOUR = 15;
const RIDING_HOURS_PER_MONTH = 10;

/** An interval's cadence in riding-hour equivalents — lower is more frequent. */
export function frequencyScore(interval: MaintenanceInterval): number {
  switch (interval.type) {
    case "hours":
      return interval.interval;
    case "km":
      return interval.interval / KM_PER_RIDING_HOUR;
    case "months":
      return interval.interval * RIDING_HOURS_PER_MONTH;
  }
}

/**
 * The app's pick for the 3 slots: most frequent first, since the frequent
 * services are the ones a reminder earns its keep on — a fork's annual
 * overhaul is hard to forget, its 50-hour lowers service is not. Duplicate
 * names keep their first occurrence; ties keep the source's order (sort is
 * stable). The preview shows the rest, so the pick is a default, not a veto.
 */
export function selectTopIntervals(intervals: MaintenanceInterval[], max = 3): MaintenanceInterval[] {
  const seen = new Set<string>();
  const unique = intervals.filter((interval) => {
    const key = interval.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...unique].sort((a, b) => frequencyScore(a) - frequencyScore(b)).slice(0, max);
}
