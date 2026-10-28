import {
  normalizeSetupValues,
  sagPercent,
  type ImuDamperSetup,
  type ImuSetupValues,
} from "./setup";
import {
  rearMinusFrontDropMm,
  riderSagDropsMm,
  type StoredRiderSag,
} from "./rider-sag";

/**
 * The setup comparison's Balance (by request, 2026-10-28): how each setup
 * sits on the bike — the sags as shares of the travel, the rider-sag step's
 * reading and what it means in mm — and, for the knobs the setups differ
 * in, what each one did to a figure. Context and a lead, never a verdict:
 * the runs per setup are few and the day varies, which the page says.
 */

/** Where a sag reads as the trade sets it, %: the fork's 15–30 and the
 * shock's 25–35. From SAG_DANGER_PCT up, half the travel is gone before
 * the first bump. A guide, not a rule — the manufacturer's chart is. */
export const SAG_RANGE: Record<"fork" | "shock", [number, number]> = {
  fork: [15, 30],
  shock: [25, 35],
};
export const SAG_DANGER_PCT = 50;

export type SagTone = "good" | "warn" | "danger";

/** The sag's reading against SAG_RANGE: inside it, outside it, or past
 * half the travel. */
export function sagTone(block: "fork" | "shock", pct: number): SagTone {
  if (pct >= SAG_DANGER_PCT) return "danger";
  const [lo, hi] = SAG_RANGE[block];
  return pct >= lo && pct <= hi ? "good" : "warn";
}

export interface SetupBalance {
  forkSagPct: number | null;
  shockSagPct: number | null;
  /** The rider-sag pitch, nose up positive, degrees — the median of the
   * readings its runs carry; null without any. */
  pitchDeg: number | null;
  /** How many distinct calibrations the pitch comes from. */
  calibrations: number;
  /** The rear's drop less the front's, mm; needs the wheelbase. */
  rearMinusFrontMm: number | null;
  /** Each end's drop, mm; needs the wheelbase, the head angle and the
   * fork's sag too. */
  frontMm: number | null;
  rearMm: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** One setup's balance from its values and its runs' readings. A reading
 * repeats in every file until the logger is calibrated again, so each
 * calibration counts once. */
export function setupBalance(
  setup: ImuSetupValues,
  readings: (StoredRiderSag | null | undefined)[],
): SetupBalance {
  const v = normalizeSetupValues(setup);
  const byCalibration = new Map<string, number>();
  for (const r of readings)
    if (r)
      byCalibration.set(
        `${r.calibrationCount}:${r.gravityG.join(",")}`,
        r.pitchDeg,
      );
  const pitchDeg = median([...byCalibration.values()]);
  const wheelbase = v.frame?.wheelbaseMm ?? null;
  const headAngle = v.frame?.headAngleDeg ?? null;
  const forkSag = v.fork?.sagMm ?? null;
  const drops =
    pitchDeg != null &&
    wheelbase != null &&
    headAngle != null &&
    forkSag != null
      ? riderSagDropsMm({
          pitchDeg,
          wheelbaseMm: wheelbase,
          headAngleDeg: headAngle,
          forkSagMm: forkSag,
        })
      : null;
  return {
    forkSagPct: sagPercent(v.fork),
    shockSagPct: sagPercent(v.shock),
    pitchDeg,
    calibrations: byCalibration.size,
    rearMinusFrontMm:
      pitchDeg != null && wheelbase != null
        ? rearMinusFrontDropMm(pitchDeg, wheelbase)
        : null,
    frontMm: drops?.frontMm ?? null,
    rearMm: drops?.rearMm ?? null,
  };
}

/** The knobs an effect can be read for: the dampers' numbers, the sags as
 * shares of the travel, the tyres and the rider's weight. */
export type EffectKnobId =
  | `${"fork" | "shock"}.${keyof ImuDamperSetup}`
  | `${"fork" | "shock"}.sagPct`
  | "tires.frontPsi"
  | "tires.rearPsi"
  | "rider.weightKg";

const DAMPER_KNOBS = [
  "pressurePsi",
  "springRateLbs",
  "sagMm",
  "compression",
  "compressionLow",
  "compressionHigh",
  "rebound",
  "reboundLow",
  "reboundHigh",
] as const satisfies readonly (keyof ImuDamperSetup)[];

export const EFFECT_KNOBS: EffectKnobId[] = [
  ...(["shock", "fork"] as const).flatMap((block) => [
    ...DAMPER_KNOBS.map((f) => `${block}.${f}` as EffectKnobId),
    `${block}.sagPct` as EffectKnobId,
  ]),
  "tires.rearPsi",
  "tires.frontPsi",
  "rider.weightKg",
];

/** A knob's value in a setup, null when it was not filled in. */
export function knobValue(
  setup: ImuSetupValues,
  knob: EffectKnobId,
): number | null {
  const v = normalizeSetupValues(setup);
  const [block, field] = knob.split(".") as [string, string];
  if (block === "fork" || block === "shock") {
    const d = v[block];
    if (field === "sagPct") return sagPercent(d);
    return (d?.[field as keyof ImuDamperSetup] as number | undefined) ?? null;
  }
  if (block === "tires")
    return v.tires?.[field as "frontPsi" | "rearPsi"] ?? null;
  return v.rider?.weightKg ?? null;
}

/** The same quantity said twice — a sag in mm and as a share — never
 * counts as a second change beside the other. */
function sameFamily(a: EffectKnobId, b: EffectKnobId): boolean {
  const [ba, fa] = a.split(".");
  const [bb, fb] = b.split(".");
  const sag = (f: string) =>
    f === "sagMm" || f === "sagPct" || f === "travelMm";
  return ba === bb && sag(fa) && sag(fb);
}

export interface KnobEffect {
  knob: EffectKnobId;
  /** The setups with a value for the knob, by letter. */
  values: { letter: string; value: number }[];
  /** The other knobs that also changed between those setups — what the
   * effect cannot be told apart from. */
  confounded: EffectKnobId[];
}

/**
 * The knobs worth an effect: filled in by two setups or more, with two
 * values or more between them. Each with what else moved among the same
 * setups, so a trend read off it says when it is not that knob's alone.
 */
export function knobEffects(
  setups: { letter: string; setup: ImuSetupValues }[],
): KnobEffect[] {
  const effects: KnobEffect[] = [];
  for (const knob of EFFECT_KNOBS) {
    const values = setups.flatMap(({ letter, setup }) => {
      const value = knobValue(setup, knob);
      return value == null ? [] : [{ letter, value }];
    });
    if (values.length < 2 || new Set(values.map((x) => x.value)).size < 2)
      continue;
    const involved = setups.filter((s) =>
      values.some((x) => x.letter === s.letter),
    );
    const confounded = EFFECT_KNOBS.filter((other) => {
      if (other === knob || sameFamily(other, knob)) return false;
      const seen = new Set(
        involved.map((s) => String(knobValue(s.setup, other))),
      );
      return seen.size > 1;
    });
    effects.push({ knob, values, confounded });
  }
  return effects;
}
