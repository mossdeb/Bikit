/**
 * The setup dynamics (by request, 2026-09-15, from a supplied layout): the
 * bike's behaviour on one trail read as four axes of a radar — absorption,
 * control, recovery, support — each from the report's own figures, and
 * each setup scored against the best of the setups compared.
 *
 * The scale is the honest one the data allows. The figures are physical
 * (G, %, ×, °) with no natural hundred, so 100 % is the best median among
 * the setups on this trail, and a setup loses points by how far its
 * median sits from that best IN NOISE: the metric's own tie, or the
 * widest spread between two runs on one setup when any was ridden twice,
 * whichever is larger — the same yardstick the table's verdicts use.
 * DYNAMICS_NOISE_SPAN noises away is 0 %, so one noise costs a quarter of
 * the axis, and everything within one noise of the best — the ring the
 * radar draws — is a tie with it. Where an axis leans on two figures, its
 * score is the mean of theirs.
 *
 * With one setup only every axis is 100 % by construction, which says
 * nothing: the caller shows the chart from two setups up.
 */

import type { ReportMetric, SessionReport } from "./report";

export const DYNAMICS_NOISE_SPAN = 4;

export type DynamicsAxisKey = "absorption" | "control" | "recovery" | "support";

export interface DynamicsAxis {
  key: DynamicsAxisKey;
  name: string;
  /** What the axis reads, in one line (the supplied layout's). */
  description: string;
  /** The figures it is made of, by the report's labels. */
  metrics: string[];
  /** Those figures in words, for the bullet under the description. */
  parts: string;
}

/** Clockwise from the top: absorption, control, support, recovery — the
 * supplied layout's compass. */
export const DYNAMICS_AXES: DynamicsAxis[] = [
  {
    key: "absorption",
    name: "Absorção",
    description: "Quanto do terreno chega ao chassis e ao rider",
    metrics: ["Harshness", "Chatter 12–60 Hz"],
    parts: "Harshness e chatter em terreno acidentado",
  },
  {
    key: "control",
    name: "Controlo",
    description: "Capacidade de estabilizar depois de cada pancada",
    metrics: ["Oscilação residual"],
    parts: "Oscilação residual depois de um impacto",
  },
  {
    key: "support",
    name: "Suporte",
    description: "Quanto o chassis resiste a transferências e compressões",
    metrics: ["Estabilidade"],
    parts: "Pitch do quadro em terreno acidentado",
  },
  {
    key: "recovery",
    name: "Recuperação",
    description: "Capacidade de lidar com impactos sucessivos",
    metrics: ["Recuperação"],
    parts: "O que sobra de um impacto quando chega o seguinte",
  },
];

export interface DynamicsSetup {
  letter: string;
  /** The median of each figure across the setup's runs, by label. */
  medians: Map<string, number>;
  /** Every run's value of each figure, for the spread. */
  values: Map<string, number[]>;
}

export interface DynamicsPart {
  label: string;
  /** The setup's median, in the figure's own unit. */
  value: number;
  /** 0–100 against the best of the setups. */
  score: number;
  /** Within one noise of the best. */
  tie: boolean;
}

export interface DynamicsAxisScore {
  key: DynamicsAxisKey;
  /** Null where the setup has none of the axis's figures. */
  score: number | null;
  parts: DynamicsPart[];
}

export interface DynamicsScore {
  letter: string;
  axes: DynamicsAxisScore[];
}

/** The figure's way and tie, from any report that carries it. */
export function dynamicsMetricRules(
  reports: SessionReport[],
): Map<string, Pick<ReportMetric, "better" | "tie" | "unit" | "value">> {
  const rules = new Map<
    string,
    Pick<ReportMetric, "better" | "tie" | "unit" | "value">
  >();
  for (const r of reports)
    for (const m of [...r.rider.metrics, ...r.bike.metrics, ...r.trail.metrics])
      if (m.raw != null && !rules.has(m.label))
        rules.set(m.label, {
          better: m.better,
          tie: m.tie,
          unit: m.unit,
          value: m.value,
        });
  return rules;
}

/** The noise a difference in this figure has to beat: its tie, or the
 * widest spread between two runs on one setup. */
export function dynamicsNoise(
  label: string,
  setups: DynamicsSetup[],
  tie: number | undefined,
): number {
  let spread = 0;
  for (const s of setups) {
    const v = s.values.get(label) ?? [];
    if (v.length > 1) spread = Math.max(spread, Math.max(...v) - Math.min(...v));
  }
  return Math.max(tie ?? 0, spread);
}

export function scoreDynamics(
  setups: DynamicsSetup[],
  rules: Map<string, Pick<ReportMetric, "better" | "tie">>,
): DynamicsScore[] {
  // Per figure: the best median among the setups that have it, and the
  // noise.
  const bests = new Map<string, { best: number; noise: number }>();
  for (const axis of DYNAMICS_AXES)
    for (const label of axis.metrics) {
      const rule = rules.get(label);
      const have = setups
        .map((s) => s.medians.get(label))
        .filter((v): v is number => v != null);
      if (!rule?.better || have.length === 0) continue;
      const best =
        rule.better === "lower" ? Math.min(...have) : Math.max(...have);
      bests.set(label, { best, noise: dynamicsNoise(label, setups, rule.tie) });
    }

  return setups.map((s) => ({
    letter: s.letter,
    axes: DYNAMICS_AXES.map((axis) => {
      const parts: DynamicsPart[] = [];
      for (const label of axis.metrics) {
        const value = s.medians.get(label);
        const b = bests.get(label);
        if (value == null || !b) continue;
        const away = Math.abs(value - b.best);
        const score =
          b.noise > 0
            ? 100 * Math.max(0, 1 - away / (DYNAMICS_NOISE_SPAN * b.noise))
            : away === 0
              ? 100
              : 0;
        // Exactly one noise away is a tie — with the slack a float needs
        // for 3,2 − 3,0 to be 0,2.
        parts.push({ label, value, score, tie: away <= b.noise * (1 + 1e-9) });
      }
      return {
        key: axis.key,
        score:
          parts.length > 0
            ? parts.reduce((a, p) => a + p.score, 0) / parts.length
            : null,
        parts,
      };
    }),
  }));
}
