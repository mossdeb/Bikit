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
 * The rider's weight rides along (by request, 2026-09-11: "o peso do
 * rider para futuras considerações"), kitted up, in kg — the load the
 * suspension and the tyres were set for. It is part of the setup, not of
 * a rider record the lab does not have: it compares, diffs and inherits
 * like any knob, so a run 3 kg heavier reads as a different setup.
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
  /** The travel, mm: the fork's, or the shock's own stroke — the shaft
   * the O-ring rides, which is what its sag is measured against (by
   * request, 2026-09-23). Rarely changes; it is here so the sag can be
   * read as a share of it. */
  travelMm?: number;
  /** Sag, mm, as the O-ring shows it — measured in the workshop with the
   * rider on the bike (by request, 2026-09-12; in mm rather than a share
   * since 2026-09-23, with the share worked out from the travel:
   * sagPercent). It discounts the rider's weight the way a pressure
   * cannot, so two riders on one bike compare by it. */
  sagMm?: number;
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

/** The rider as the bike carried them: weight with the kit on, kg. */
export interface ImuRiderSetup {
  weightKg?: number;
}

export interface ImuSetupValues {
  fork?: ImuDamperSetup;
  shock?: ImuDamperSetup;
  tires?: ImuTireSetup;
  rider?: ImuRiderSetup;
}

/** The numbers, in the order they are compared and listed — low speed
 * before high, the form's order. */
export const DAMPER_FIELDS = [
  "pressurePsi",
  "springRateLbs",
  "travelMm",
  "sagMm",
  "compression",
  "compressionLow",
  "compressionHigh",
  "rebound",
  "reboundLow",
  "reboundHigh",
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

function isRider(value: unknown): value is ImuRiderSetup {
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).every(
    ([key, v]) => key === "weightKg" && (v === undefined || isFiniteNumber(v)),
  );
}

/** The shape check on what comes back from the `values` column. */
export function isSetupValues(value: unknown): value is ImuSetupValues {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).every(
      (k) => k === "fork" || k === "shock" || k === "tires" || k === "rider",
    ) &&
    (v.fork === undefined || isDamper(v.fork)) &&
    (v.shock === undefined || isDamper(v.shock)) &&
    (v.tires === undefined || isTires(v.tires)) &&
    (v.rider === undefined || isRider(v.rider))
  );
}

/** The sag as a share of the travel, %, rounded to the unit — what the
 * workshop card says and what the trade compares by. Null without both
 * numbers, or with a travel of nothing. */
export function sagPercent(damper: ImuDamperSetup | undefined): number | null {
  const sag = damper?.sagMm;
  const travel = damper?.travelMm;
  if (!isFiniteNumber(sag) || !isFiniteNumber(travel) || travel <= 0)
    return null;
  return Math.round((sag * 100) / travel);
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
    "travelMm",
    "sagMm",
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
  if (isFiniteNumber(values.rider?.weightKg))
    out.rider = { weightKg: values.rider.weightKg };
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
  if (d.sagMm != null) {
    const share = sagPercent(d);
    bits.push(
      `sag ${pt(d.sagMm)} mm${share != null ? ` (${pt(share)} %)` : ""}`,
    );
  }
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
  if (v.rider?.weightKg != null) parts.push(`Rider ${pt(v.rider.weightKg)} kg`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What each knob is called in a difference — the trade's own letters
 * (LSC, HSR…) for the two-dial circuits, C and R for the single ones (by
 * request, 2026-09-12: "corrige o sinal nas cápsulas para que fique mais
 * perceptível"). */
const DAMPER_FIELD_SHORT: Record<DamperField, string> = {
  pressurePsi: "pressão",
  springRateLbs: "mola",
  travelMm: "curso",
  sagMm: "sag",
  compression: "C",
  compressionHigh: "HSC",
  compressionLow: "LSC",
  rebound: "R",
  reboundHigh: "HSR",
  reboundLow: "LSR",
};
const DAMPER_FIELD_UNIT: Record<DamperField, string> = {
  pressurePsi: " psi",
  springRateLbs: " lbs",
  travelMm: " mm",
  sagMm: " mm",
  compression: "",
  compressionHigh: "",
  compressionLow: "",
  rebound: "",
  reboundHigh: "",
  reboundLow: "",
};

/** What a knob is, for the words a change carries: clicks open or close,
 * a spring firms or softens, sag is the spring the other way round, a
 * tyre hardens or softens, and a weight is just a weight. */
export type SetupChangeKind =
  "clicks" | "spring" | "travel" | "sag" | "tire" | "rider";
const DAMPER_FIELD_KIND: Record<DamperField, SetupChangeKind> = {
  pressurePsi: "spring",
  springRateLbs: "spring",
  travelMm: "travel",
  sagMm: "sag",
  compression: "clicks",
  compressionHigh: "clicks",
  compressionLow: "clicks",
  rebound: "clicks",
  reboundHigh: "clicks",
  reboundLow: "clicks",
};

export interface SetupChange {
  /** The knob, in words: "garfo LSR", "pneu tr.". */
  label: string;
  from: number | null;
  to: number | null;
  unit: string;
  kind: SetupChangeKind;
}

/**
 * Every knob that differs between two setups — the reference's and a
 * pass's, on a Snapshot page — so a line can say "garfo LSR +2 · mais
 * aberto" and the reader knows what changed between two runs of the same
 * corner without opening either. Knobs neither setup filled in are not a
 * change. A damper that went from air to coil shows its pressure leaving
 * and its spring rate arriving, the two knobs it is.
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
        kind: DAMPER_FIELD_KIND[field],
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
      kind: "tire",
    });
  }
  const wa = a.rider?.weightKg ?? null;
  const wb = b.rider?.weightKg ?? null;
  if (wa !== wb)
    changes.push({
      label: "rider",
      from: wa,
      to: wb,
      unit: " kg",
      kind: "rider",
    });
  return changes;
}

/** The direction a change went, in the words a mechanic uses: clicks
 * counted from closed open as they grow; more pressure or a stiffer
 * spring firms; more sag softens; a harder tyre is a harder tyre. */
function changeDirection(kind: SetupChangeKind, delta: number): string | null {
  const up = delta > 0;
  switch (kind) {
    case "clicks":
      return up ? "mais aberto" : "mais fechado";
    case "spring":
      return up ? "mais firme" : "mais macio";
    case "sag":
      return up ? "mais macio" : "mais firme";
    case "tire":
      return up ? "mais duro" : "mais mole";
    case "travel":
    case "rider":
      return null;
  }
}

/** "garfo LSR +2 · mais aberto", "pneu tr. −2 psi · mais mole", "amort.
 * pressão → 205 psi" when the reference had none, "garfo HSC 2 → —" when
 * this pass has none. */
export function formatSetupChange(change: SetupChange): string {
  const { label, from, to, unit, kind } = change;
  if (from != null && to != null) {
    const d = to - from;
    const direction = changeDirection(kind, d);
    return `${label} ${d > 0 ? "+" : "−"}${pt(Math.abs(d))}${unit}${direction ? ` · ${direction}` : ""}`;
  }
  if (to != null) return `${label} → ${pt(to)}${unit}`;
  return `${label} ${pt(from!)}${unit} → —`;
}

/** The knobs a set of setups agree on and the ones they differ in — the
 * sentence at the head of a comparison: "Mantiveste constantes o Fox X2 a
 * 100 psi, os pneus a 20/22 psi e o peso a 80 kg. O que varia: LSC e HSC
 * do Fox X2." Only the knobs at least one setup filled in count; a knob
 * one setup has and another lacks varies. The springs, sags, tyres and
 * weight are named with their values; the clicks that did not move are
 * only counted (`constantClicks`), or the sentence would list nine of
 * them to say nothing. */
export function setupSpread(
  setups: ImuSetupValues[],
  labels: { fork?: string | null; shock?: string | null } = {},
): { constant: string[]; varying: string[]; constantClicks: number } {
  const all = setups.map(normalizeSetupValues);
  if (all.length === 0) return { constant: [], varying: [], constantClicks: 0 };
  const constant: string[] = [];
  const varying: string[] = [];
  let constantClicks = 0;
  const same = (values: (number | null)[]) =>
    values.every((v) => v === values[0]);
  for (const block of ["fork", "shock"] as const) {
    const name = labels[block] || (block === "fork" ? "garfo" : "amortecedor");
    for (const field of DAMPER_FIELDS) {
      const values = all.map((v) => v[block]?.[field] ?? null);
      if (values.every((v) => v == null)) continue;
      const knob = DAMPER_FIELD_SHORT[field];
      if (same(values)) {
        const v = pt(values[0]!);
        if (DAMPER_FIELD_KIND[field] === "clicks") constantClicks++;
        else
          constant.push(
            field === "sagMm"
              ? `o sag do ${name} a ${v} mm`
              : field === "travelMm"
                ? `o curso do ${name} a ${v} mm`
                : `o ${name} a ${v}${DAMPER_FIELD_UNIT[field]}`,
          );
      } else varying.push(`${knob} do ${name}`);
    }
  }
  const front = all.map((v) => v.tires?.frontPsi ?? null);
  const rear = all.map((v) => v.tires?.rearPsi ?? null);
  const hasTires =
    !front.every((v) => v == null) || !rear.every((v) => v == null);
  if (hasTires) {
    if (same(front) && same(rear))
      constant.push(
        `os pneus a ${front[0] != null ? pt(front[0]) : "–"}/${rear[0] != null ? pt(rear[0]) : "–"} psi`,
      );
    else {
      if (!same(front)) varying.push("pneu da frente");
      if (!same(rear)) varying.push("pneu de trás");
    }
  }
  const weight = all.map((v) => v.rider?.weightKg ?? null);
  if (!weight.every((v) => v == null)) {
    if (same(weight)) constant.push(`o peso a ${pt(weight[0]!)} kg`);
    else varying.push("peso do rider");
  }
  return { constant, varying, constantClicks };
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
    v.rider?.weightKg ?? "",
  ].join("|");
}
