import { describe, expect, it } from "vitest";
import {
  DYNAMICS_AXES,
  DYNAMICS_NOISE_SPAN,
  dynamicsNoise,
  scoreDynamics,
  type DynamicsSetup,
} from "./setup-dynamics";

// The figures by the report's keys (ReportMetricKey), as the axes name them.
const rules = new Map<string, { better?: "lower" | "higher"; tie?: number }>([
  ["harshness", { better: "lower", tie: 0.2 }],
  ["chatter", { better: "lower", tie: 0.04 }],
  ["residualOscillation", { better: "lower", tie: 1 }],
  ["stability", { better: "lower", tie: 1 }],
  ["recovery", { better: "lower", tie: 1 }],
]);

function setup(letter: string, runs: Record<string, number[]>): DynamicsSetup {
  const values = new Map(Object.entries(runs));
  const medians = new Map(
    [...values].map(([label, list]) => {
      const s = [...list].sort((a, b) => a - b);
      const mid = s.length >> 1;
      return [label, s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2];
    }),
  );
  return { letter, medians, values };
}

describe("scoreDynamics", () => {
  it("gives the best setup 100 on every axis and the other by its distance in noise", () => {
    const a = setup("A", {
      harshness: [3.0],
      chatter: [0.3],
      residualOscillation: [7.5],
      stability: [4],
      recovery: [5],
    });
    // B: harshness one tie worse, chatter equal, oscillation two ties
    // worse, pitch better by one, recovery four ties worse.
    const b = setup("B", {
      harshness: [3.2],
      chatter: [0.3],
      residualOscillation: [9.5],
      stability: [3],
      recovery: [9],
    });
    const [sa, sb] = scoreDynamics([a, b], rules);
    const axis = (s: typeof sa, key: string) =>
      s.axes.find((x) => x.key === key)!;

    // A is the best everywhere but support, which B took by exactly one
    // noise — a tie, but the score still moves.
    expect(axis(sa, "absorption").score).toBe(100);
    expect(axis(sa, "control").score).toBe(100);
    expect(axis(sa, "recovery").score).toBe(100);
    expect(axis(sa, "support").score).toBeCloseTo(75);
    expect(axis(sa, "support").parts[0].tie).toBe(true);

    // B: the mean of harshness (75) and chatter (100); two noises off on
    // control; four on recovery, the floor.
    expect(axis(sb, "absorption").score).toBeCloseTo(87.5);
    expect(axis(sb, "absorption").parts.map((p) => p.tie)).toEqual([
      true,
      true,
    ]);
    expect(axis(sb, "control").score).toBeCloseTo(50);
    expect(axis(sb, "control").parts[0].tie).toBe(false);
    expect(axis(sb, "recovery").score).toBe(0);
    expect(axis(sb, "support").score).toBe(100);
  });

  it("widens the noise to the spread between two runs on one setup", () => {
    const a = setup("A", { harshness: [3.0, 3.8] });
    const b = setup("B", { harshness: [3.6] });
    expect(dynamicsNoise("harshness", [a, b], 0.2)).toBeCloseTo(0.8);
    const [sa, sb] = scoreDynamics([a, b], rules);
    // A's median is 3.4, the best; B is 0.2 away, a quarter of a noise.
    expect(sa.axes[0].score).toBe(100);
    expect(sb.axes[0].score).toBeCloseTo(100 - 100 / (4 * DYNAMICS_NOISE_SPAN));
    expect(sb.axes[0].parts[0].tie).toBe(true);
  });

  it("leaves an axis null where the setup has none of its figures", () => {
    const a = setup("A", { harshness: [3.0] });
    const b = setup("B", { residualOscillation: [8] });
    const [sa, sb] = scoreDynamics([a, b], rules);
    expect(sa.axes.find((x) => x.key === "control")!.score).toBeNull();
    expect(sb.axes.find((x) => x.key === "absorption")!.score).toBeNull();
    // Alone on a figure, a setup is its own best.
    expect(sa.axes.find((x) => x.key === "absorption")!.score).toBe(100);
    expect(sb.axes.find((x) => x.key === "control")!.score).toBe(100);
  });

  it("reads the axes in the compass order the layout draws", () => {
    expect(DYNAMICS_AXES.map((a) => a.key)).toEqual([
      "absorption",
      "control",
      "support",
      "recovery",
    ]);
  });
});
