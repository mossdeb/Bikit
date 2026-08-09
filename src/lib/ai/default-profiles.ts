// Code-defined maintenance defaults, for categories where the sensible
// schedule is a rule of thumb rather than a manufacturer document — no
// catalog row, no AI search, always applied. The preview shows them
// pre-selected like any other interval; unticking is the opt-out.
//
// Wheels are the first case: spoke checks aren't in any spec sheet (every
// wheel search on the first real bike came back empty), but the right
// cadence is common knowledge and depends on how the bike is ridden, which
// the AI can't know from a wheel's model name — and the bike's type says.

import type { MaintenanceInterval } from "./intervals";

/** Ride styles that hammer wheels: check quarterly instead of yearly.
 * Values are BIKE_TYPES entries; anything else (Road, Gravel, XC, …) gets
 * the gentle-use cadence. */
const HARD_USE_BIKE_TYPES = new Set(["Enduro", "Downhill", "E-MTB"]);

// Brake cadences in months per BIKE_TYPES entry: bleed, piston clean/lube,
// full caliper service. Endurance road and Urban ride like Road; Other sits
// with Gravel in the middle of the table.
const BRAKE_MONTHS: Record<string, { bleed: number; pistons: number; caliper: number }> = {
  Road: { bleed: 12, pistons: 12, caliper: 36 },
  "Endurance road": { bleed: 12, pistons: 12, caliper: 36 },
  "Urban / Commuter": { bleed: 12, pistons: 12, caliper: 36 },
  XC: { bleed: 12, pistons: 12, caliper: 24 },
  Gravel: { bleed: 12, pistons: 12, caliper: 24 },
  Other: { bleed: 12, pistons: 12, caliper: 24 },
  Enduro: { bleed: 6, pistons: 6, caliper: 24 },
  "E-MTB": { bleed: 6, pistons: 6, caliper: 18 },
  Downhill: { bleed: 3, pistons: 3, caliper: 12 },
};

// Drivetrain defaults are the same for every ride style: cleaning is a
// monthly habit, and chain lube is an every-ride one — approximated as 3
// riding hours, since the interval engine counts km/hours/months, not
// rides, and a typical outing is about that long.

/** The default schedule for a category, or null when the category has none
 * and the normal catalog/AI path should run. Names are canonical English,
 * translated at presentation like every interval name. */
export function defaultIntervalsFor(category: string, bikeType: string): MaintenanceInterval[] | null {
  if (category === "Wheels") {
    return [
      {
        name: "Spoke Tension Check",
        type: "months",
        interval: HARD_USE_BIKE_TYPES.has(bikeType) ? 3 : 12,
      },
    ];
  }
  if (category === "Brakes") {
    const cadence = BRAKE_MONTHS[bikeType] ?? BRAKE_MONTHS.Other;
    return [
      { name: "Brake Bleed", type: "months", interval: cadence.bleed },
      { name: "Piston Cleaning & Lubrication", type: "months", interval: cadence.pistons },
      { name: "Caliper Full Service", type: "months", interval: cadence.caliper },
    ];
  }
  if (category === "Transmission") {
    return [
      { name: "Drivetrain Cleaning", type: "months", interval: 1 },
      { name: "Chain Lube", type: "hours", interval: 3 },
    ];
  }
  return null;
}
