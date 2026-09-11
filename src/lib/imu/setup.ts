/**
 * A bike's setup on a run: what the fork, the shock and the tyres were set
 * to — the knobs a rider turns between two descents and then forgets (by
 * request, 2026-09-11: "quero introduzir os cliques da suspensão e a
 * pressão dos pneus", so that the Bike column of the report has something
 * to compare against).
 *
 * Pressures in psi; clicks counted from fully closed, the industry's
 * convention, because a fork's range is not known here and "from closed"
 * is what every manual prints. Every field is optional and only what was
 * filled in is kept, so a hardtail's setup is two tyre pressures and
 * nothing else.
 *
 * A damper is air or coil (by request, 2026-09-11: "se são Ar ou Mola"):
 * air has a pressure, coil a spring rate in lbs/in. And each damping
 * circuit is either one dial or two — low- and high-speed — as the damper
 * has them ("simples ou com alta e baixa velocidade"). Those choices are
 * stored with the numbers, air and two dials being the defaults that are
 * not written down; the numbers of the other choice are dropped on
 * normalising, so a setup never carries a pressure AND a spring rate.
 *
 * Setups are immutable rows shared by sessions (migration 00047): equal
 * values on save keep the row, changed values make a new one.
 */

export type ImuSpringKind = "air" | "coil";
export type ImuCircuitMode = "simple" | "dual";

export interface ImuDamperSetup {
  /** Air (the default) or coil. */
  spring?: ImuSpringKind;
  /** Air pressure, psi. */
  pressurePsi?: number;
  /** Coil spring rate, lbs/in. */
  springRateLbs?: number;
  /** One dial (simple) or low- and high-speed (dual, the default). */
  compressionMode?: ImuCircuitMode;
  /** Compression damping, clicks from closed — the single dial… */
  compression?: number;
  /** …or the two. */
  compressionHigh?: number;
  compressionLow?: number;
  reboundMode?: ImuCircuitMode;
  /** Rebound damping, clicks from closed. */
  rebound?: number;
  reboundHigh?: number;
  reboundLow?: number;
}

export interface ImuTireSetup {
  frontPsi?: number;
  rearPsi?: number;
}

export interface ImuSetupValues {
  fork?: ImuDamperSetup;
  shock?: ImuDamperSetup;
  tires?: ImuTireSetup;
}

/** The numbers, in the order they are compared and listed. */
export const DAMPER_FIELDS = [
  "pressurePsi",
  "springRateLbs",
  "compression",
  "compressionHigh",
  "compressionLow",
  "rebound",
  "reboundHigh",
  "reboundLow",
] as const satisfies readonly (keyof ImuDamperSetup)[];
type DamperField = (typeof DAMPER_FIELDS)[number];

const DAMPER_MODE_FIELDS = [
  "spring",
  "compressionMode",
  "reboundMode",
] as const satisfies readonly (keyof ImuDamperSetup)[];

export const TIRE_FIELDS = [
  "frontPsi",
  "rearPsi",
] as const satisfies readonly (keyof ImuTireSetup)[];

/** Which numbers belong to which choice. */
const SPRING_FIELDS: Record<ImuSpringKind, DamperField> = {
  air: "pressurePsi",
  coil: "springRateLbs",
};
const CIRCUIT_FIELDS = {
  compression: {
    simple: ["compression"],
    dual: ["compressionLow", "compressionHigh"],
  },
  rebound: { simple: ["rebound"], dual: ["reboundLow", "reboundHigh"] },
} as const satisfies Record<string, Record<ImuCircuitMode, DamperField[]>>;
export type ImuCircuit = keyof typeof CIRCUIT_FIELDS;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDamper(value: unknown): value is ImuDamperSetup {
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).every(([key, v]) => {
    if (v === undefined) return true;
    if ((DAMPER_FIELDS as readonly string[]).includes(key))
      return isFiniteNumber(v);
    if (key === "spring") return v === "air" || v === "coil";
    if (key === "compressionMode" || key === "reboundMode")
      return v === "simple" || v === "dual";
    return false;
  });
}

function isTires(value: unknown): value is ImuTireSetup {
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).every(
    ([key, v]) =>
      (TIRE_FIELDS as readonly string[]).includes(key) &&
      (v === undefined || isFiniteNumber(v)),
  );
}

/** The shape check on what comes back from the `values` column. */
export function isSetupValues(value: unknown): value is ImuSetupValues {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).every(
      (k) => k === "fork" || k === "shock" || k === "tires",
    ) &&
    (v.fork === undefined || isDamper(v.fork)) &&
    (v.shock === undefined || isDamper(v.shock)) &&
    (v.tires === undefined || isTires(v.tires))
  );
}

/** Air unless said otherwise — or unless only a spring rate was written,
 * which is a coil by any reading. */
export function damperSpring(
  damper: ImuDamperSetup | undefined,
): ImuSpringKind {
  if (damper?.spring) return damper.spring;
  return isFiniteNumber(damper?.springRateLbs) &&
    !isFiniteNumber(damper?.pressurePsi)
    ? "coil"
    : "air";
}

/** Two dials unless said otherwise — or unless only the single one was
 * written. */
export function circuitMode(
  damper: ImuDamperSetup | undefined,
  circuit: ImuCircuit,
): ImuCircuitMode {
  const explicit = damper?.[`${circuit}Mode`];
  if (explicit) return explicit;
  const [single] = CIRCUIT_FIELDS[circuit].simple;
  const dual = CIRCUIT_FIELDS[circuit].dual;
  return isFiniteNumber(damper?.[single]) &&
    !dual.some((f) => isFiniteNumber(damper?.[f]))
    ? "simple"
    : "dual";
}

/** The numbers a damper's choices make relevant, in DAMPER_FIELDS order. */
function activeFields(damper: ImuDamperSetup | undefined): DamperField[] {
  const active = new Set<DamperField>([
    SPRING_FIELDS[damperSpring(damper)],
    ...CIRCUIT_FIELDS.compression[circuitMode(damper, "compression")],
    ...CIRCUIT_FIELDS.rebound[circuitMode(damper, "rebound")],
  ]);
  return DAMPER_FIELDS.filter((f) => active.has(f));
}

function normalizeDamper(damper: ImuDamperSetup): ImuDamperSetup | null {
  const kept: ImuDamperSetup = {};
  for (const field of activeFields(damper))
    if (isFiniteNumber(damper[field])) kept[field] = damper[field];
  if (Object.keys(kept).length === 0) return null;
  // The choices travel with the numbers, but only the ones that are not
  // the default — so a setup written before there were choices reads the
  // same as one written after.
  if (damperSpring(damper) === "coil") kept.spring = "coil";
  if (circuitMode(damper, "compression") === "simple")
    kept.compressionMode = "simple";
  if (circuitMode(damper, "rebound") === "simple") kept.reboundMode = "simple";
  return kept;
}

/** Drops the blanks — an empty block goes with them — and the numbers of
 * the choices not taken, so two setups that differ only in what was left
 * unfilled compare equal. */
export function normalizeSetupValues(values: ImuSetupValues): ImuSetupValues {
  const out: ImuSetupValues = {};
  for (const block of ["fork", "shock"] as const) {
    const damper = values[block];
    if (!damper) continue;
    const kept = normalizeDamper(damper);
    if (kept) out[block] = kept;
  }
  if (values.tires) {
    const kept: ImuTireSetup = {};
    for (const field of TIRE_FIELDS)
      if (isFiniteNumber(values.tires[field]))
        kept[field] = values.tires[field];
    if (Object.keys(kept).length > 0) out.tires = kept;
  }
  return out;
}

/** Nothing filled in at all. */
export function isSetupEmpty(values: ImuSetupValues): boolean {
  return Object.keys(normalizeSetupValues(values)).length === 0;
}

/** Field by field, after normalising — the test for "did anything change". */
export function setupValuesEqual(
  a: ImuSetupValues,
  b: ImuSetupValues,
): boolean {
  return setupKey(a) === setupKey(b);
}

const pt = (n: number) =>
  n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });

function circuitSummary(
  letter: string,
  d: ImuDamperSetup,
  circuit: ImuCircuit,
): string | null {
  if (circuitMode(d, circuit) === "simple") {
    const v = d[CIRCUIT_FIELDS[circuit].simple[0]];
    return v != null ? `${letter} ${pt(v)}` : null;
  }
  const [low, high] = CIRCUIT_FIELDS[circuit].dual;
  const lo = d[low];
  const hi = d[high];
  if (lo == null && hi == null) return null;
  return `${letter} ${lo != null ? pt(lo) : "–"}/${hi != null ? pt(hi) : "–"}`;
}

function damperSummary(label: string, d: ImuDamperSetup): string | null {
  const bits: string[] = [];
  if (damperSpring(d) === "coil") {
    if (d.springRateLbs != null) bits.push(`${pt(d.springRateLbs)} lbs`);
  } else if (d.pressurePsi != null) bits.push(`${pt(d.pressurePsi)} psi`);
  const c = circuitSummary("C", d, "compression");
  if (c) bits.push(c);
  const r = circuitSummary("R", d, "rebound");
  if (r) bits.push(r);
  return bits.length > 0 ? `${label} ${bits.join(" · ")}` : null;
}

/**
 * One line for the session's header: "Fox 38 78 psi · C 12/2 · R 8/– ·
 * DHX2 450 lbs · R 10 · Pneus 24/26". Compression and rebound with two
 * dials read low/high — the form's order — with a dash where one of the
 * pair was not filled in; a single dial is one number. A coil damper
 * gives its spring rate where an air one gives its pressure. The labels
 * are the bike's own component names when it has them, "Garfo" and
 * "Amortecedor" otherwise. Null when nothing was filled in.
 */
export function setupSummary(
  values: ImuSetupValues,
  labels: { fork?: string | null; shock?: string | null } = {},
): string | null {
  const v = normalizeSetupValues(values);
  const parts: string[] = [];
  if (v.fork) {
    const s = damperSummary(labels.fork || "Garfo", v.fork);
    if (s) parts.push(s);
  }
  if (v.shock) {
    const s = damperSummary(labels.shock || "Amortecedor", v.shock);
    if (s) parts.push(s);
  }
  if (v.tires) {
    const f = v.tires.frontPsi != null ? pt(v.tires.frontPsi) : "–";
    const r = v.tires.rearPsi != null ? pt(v.tires.rearPsi) : "–";
    parts.push(`Pneus ${f}/${r} psi`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What each knob is called in a difference — short, because a pass line
 * may carry three or four of them: "garfo R baixa +2", "pneu tr. −2 psi". */
const DAMPER_FIELD_SHORT: Record<DamperField, string> = {
  pressurePsi: "pressão",
  springRateLbs: "mola",
  compression: "C",
  compressionHigh: "C alta",
  compressionLow: "C baixa",
  rebound: "R",
  reboundHigh: "R alta",
  reboundLow: "R baixa",
};
const DAMPER_FIELD_UNIT: Record<DamperField, string> = {
  pressurePsi: " psi",
  springRateLbs: " lbs",
  compression: "",
  compressionHigh: "",
  compressionLow: "",
  rebound: "",
  reboundHigh: "",
  reboundLow: "",
};

export interface SetupChange {
  /** The knob, in words: "garfo R baixa", "pneu tr.". */
  label: string;
  from: number | null;
  to: number | null;
  unit: string;
}

/**
 * Every knob that differs between two setups — the reference's and a
 * pass's, on a Snapshot page — so a line can say "garfo R baixa +2" and
 * the reader knows what changed between two runs of the same corner
 * without opening either. Knobs neither setup filled in are not a change.
 * A damper that went from air to coil shows its pressure leaving and its
 * spring rate arriving, the two knobs it is.
 */
export function setupDiff(
  from: ImuSetupValues,
  to: ImuSetupValues,
): SetupChange[] {
  const a = normalizeSetupValues(from);
  const b = normalizeSetupValues(to);
  const changes: SetupChange[] = [];
  for (const block of ["fork", "shock"] as const) {
    const word = block === "fork" ? "garfo" : "amort.";
    for (const field of DAMPER_FIELDS) {
      const x = a[block]?.[field] ?? null;
      const y = b[block]?.[field] ?? null;
      if (x === y) continue;
      changes.push({
        label: `${word} ${DAMPER_FIELD_SHORT[field]}`,
        from: x,
        to: y,
        unit: DAMPER_FIELD_UNIT[field],
      });
    }
  }
  for (const field of TIRE_FIELDS) {
    const x = a.tires?.[field] ?? null;
    const y = b.tires?.[field] ?? null;
    if (x === y) continue;
    changes.push({
      label: field === "frontPsi" ? "pneu dt." : "pneu tr.",
      from: x,
      to: y,
      unit: " psi",
    });
  }
  return changes;
}

/** "garfo R baixa +2", "pneu tr. −2 psi", "amort. pressão → 205 psi" when
 * the reference had none, "garfo C alta 2 → —" when this pass has none. */
export function formatSetupChange(change: SetupChange): string {
  const { label, from, to, unit } = change;
  if (from != null && to != null) {
    const d = to - from;
    return `${label} ${d > 0 ? "+" : "−"}${pt(Math.abs(d))}${unit}`;
  }
  if (to != null) return `${label} → ${pt(to)}${unit}`;
  return `${label} ${pt(from!)}${unit} → —`;
}

/** A stable key for "the same setup": the normalised values, serialised
 * with their keys in order. Two sessions on one setup row share it, and so
 * do two rows that happen to hold the same numbers. */
export function setupKey(values: ImuSetupValues): string {
  const v = normalizeSetupValues(values);
  const block = (d?: ImuDamperSetup) =>
    d
      ? [
          ...DAMPER_FIELDS.map((f) => d[f] ?? ""),
          ...DAMPER_MODE_FIELDS.map((f) => d[f] ?? ""),
        ].join(",")
      : "";
  return [
    block(v.fork),
    block(v.shock),
    TIRE_FIELDS.map((f) => v.tires?.[f] ?? "").join(","),
  ].join("|");
}
