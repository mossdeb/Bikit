import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuSessionData } from "./format";
import {
  buildSessionReport,
  compareReports,
  type SessionReport,
} from "./report";

/**
 * A ride drawn by hand, in the bike's frame (+X forward, +Z up), 100 Hz for
 * 40 s at a steady 8 m/s with a GPS fix a second: one right-hand corner at
 * 10–12 s, a brake into it at 8–9.5 s, a rough stretch at 20–24 s with a
 * hard hit in the middle. Enough for every section to have something to
 * say, and for the figures to be checked against what was drawn.
 */
function ride(withGps = true): ImuSessionData {
  const rate = 100;
  const seconds = 40;
  const n = seconds * rate;
  const tMs = new Float64Array(n);
  const ax = new Float32Array(n);
  const ay = new Float32Array(n);
  const az = new Float32Array(n).fill(1);
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const gz = new Float32Array(n);
  let seed = 7;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  };
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    tMs[i] = t * 1000;
    if (t >= 8 && t < 9.5) ax[i] = -3 / 9.81;
    if (t >= 10 && t < 12) {
      gz[i] = -30;
      ay[i] = -0.4;
    }
    if (t >= 20 && t < 24) az[i] = 1 + 2 * noise();
    if (t >= 22 && t < 22.03) az[i] = 8;
  }
  const m = seconds;
  const gps: GpsChannels = {
    tMs: new Float64Array(Array.from({ length: m }, (_, s) => s * 1000)),
    latDeg: new Float64Array(m).fill(37),
    lonDeg: new Float64Array(m).fill(-7),
    altitudeM: new Float32Array(
      Array.from({ length: m }, (_, s) => 300 - 0.8 * s),
    ),
    speedMps: new Float32Array(m).fill(8),
    headingDeg: new Float32Array(m),
    distanceM: new Float32Array(m).fill(NaN),
    hAccM: new Float32Array(m).fill(NaN),
  };
  return {
    format: "test",
    sessionId: null,
    durationMs: seconds * 1000,
    sampleRateHz: rate,
    sampleCount: n,
    channels: { tMs, ax, ay, az, gx, gy, gz, gForce: null },
    gps: withGps ? gps : null,
    events: [
      { kind: "braking", startMs: 8000, endMs: 9500, confidence: 0.9 },
      {
        kind: "curve",
        direction: "right",
        startMs: 10000,
        endMs: 12000,
        confidence: 0.9,
      },
      { kind: "rough_section", startMs: 20000, endMs: 24000, confidence: 0.8 },
      { kind: "impact", timeMs: 22000, severity: "hard", confidence: 0.95 },
    ],
    calibration: null,
    aligned: true,
    mounting: {
      yawDeg: 0,
      confidence: 0.9,
      intervals: 20,
      headingCheck: "ok",
      applied: true,
      source: "logger",
    },
  };
}

describe("buildSessionReport", () => {
  // The names and sentences asserted below are the Portuguese ones; the
  // English report is the same figures under the dictionary's other words.
  it("answers in all three dimensions, with the figures the ride was drawn with", () => {
    const report = buildSessionReport(ride(), "pt");
    const labels = (s: { metrics: { label: string }[] }) =>
      s.metrics.map((m) => m.label);

    // Rider: the corner's retention, the brake counted as the corner's.
    expect(labels(report.rider)).toEqual(
      expect.arrayContaining([
        "Velocidade média",
        "Retenção nas curvas",
        "Travagens",
        "Vel. retida em acidentado",
      ]),
    );
    expect(report.rider.headline).toMatch(/Reteve em média/);
    expect(report.rider.headline).toMatch(/Travou 1 vez,/);
    expect(
      report.rider.metrics.find((m) => m.label === "Travagens")?.hint,
    ).toBe("1 de 1 à entrada de uma curva");
    expect(report.rider.highlights?.items).toHaveLength(1);
    expect(report.rider.caveat).toBeNull();

    // Bike: the hit's decay, and the rough stretch gives the harshness
    // and the two bands something to measure.
    expect(labels(report.bike)).toEqual(
      expect.arrayContaining([
        "Harshness",
        "Chassis Movement 2–12 Hz",
        "Chatter 12–60 Hz",
        "Oscilação residual",
      ]),
    );
    expect(report.bike.caveat).toMatch(/outra passagem/);
    expect(report.bike.highlights?.items[0].timeMs).toBe(22000);

    // Trail: 312 m at 8 m/s between the first and last fix; the drop is
    // read between the medians of the first and last five fixes — the
    // fixes at 2 s and 37 s, 28 m apart on a 0.8 m/s descent — one corner,
    // one hit, 10 % rough.
    const trail = Object.fromEntries(
      report.trail.metrics.map((m) => [m.label, m]),
    );
    expect(trail["Distância"].value).toBe("0,31");
    expect(trail["Desnível"].value).toBe("−28");
    expect(trail["Desnível"].hint).toMatch(/a descer/);
    expect(trail["Rugosidade"].hint).toBe("10 % do tempo em zonas acidentadas");
    expect(trail["Curvas"].hint).toMatch(/1 no total, raio mediano ~15 m/);
    expect(report.trail.headline).toMatch(/1 curvas, 1 impactos/);
  });

  it("reads the recovery only where the hits come in runs", () => {
    // The drawn ride has one hit: nothing to recover from before a next.
    const one = buildSessionReport(ride(), "pt");
    expect(
      one.bike.metrics.find((m) => m.label === "Recuperação"),
    ).toBeUndefined();

    // Four hits 700 ms apart through the rough stretch, each an 8 G spike
    // with a 6 Hz bounce that dies in 80 ms: three successive pairs, and
    // the frame is settled long before each next hit.
    const runs = ride();
    const { tMs, az } = runs.channels;
    const hits = [21000, 21700, 22400, 23100];
    for (let i = 0; i < tMs.length; i++) {
      if (tMs[i] < 20000 || tMs[i] >= 24000) continue;
      let v = 1;
      for (const at of hits) {
        const dt = tMs[i] - at;
        if (dt < 0) continue;
        v +=
          dt < 30
            ? 7
            : 3 * Math.exp(-dt / 80) * Math.sin((2 * Math.PI * 6 * dt) / 1000);
      }
      az[i] = v;
    }
    runs.events = [
      ...runs.events.filter((e) => e.kind !== "impact"),
      ...hits.map((timeMs) => ({
        kind: "impact" as const,
        timeMs,
        severity: "hard" as const,
        confidence: 0.95,
      })),
    ];
    const report = buildSessionReport(runs, "pt");
    const recovery = report.bike.metrics.find((m) => m.label === "Recuperação");
    expect(recovery).toBeDefined();
    expect(recovery!.raw).toBeGreaterThanOrEqual(0);
    expect(recovery!.raw).toBeLessThan(10);
    expect(recovery!.better).toBe("lower");
    expect(recovery!.hint).toMatch(/mediana de 3/);
  });

  it("says what it cannot say without a track", () => {
    const report = buildSessionReport(ride(false), "pt");
    // The brake still counts — it is read off the accelerometer — but
    // nothing that needs a speed does.
    expect(report.rider.metrics.map((m) => m.label)).toEqual(["Travagens"]);
    expect(report.rider.headline).toMatch(/^Sem GPS/);
    expect(report.rider.highlights).toBeNull();
    // The bike and the trail still read the accelerometer.
    expect(report.bike.metrics.length).toBeGreaterThan(0);
    expect(
      report.trail.metrics.find((m) => m.label === "Rugosidade"),
    ).toBeDefined();
    expect(
      report.trail.metrics.find((m) => m.label === "Distância"),
    ).toBeUndefined();
  });

  it("writes the same figures in English, the English way", () => {
    const report = buildSessionReport(ride(), "en");
    const trail = Object.fromEntries(
      report.trail.metrics.map((m) => [m.label, m]),
    );
    expect(trail["Distance"].value).toBe("0.31");
    expect(trail["Roughness"].hint).toBe("10% of the time in rough sections");
    expect(report.rider.headline).toMatch(/^Kept .* Braked once,/);
    expect(report.trail.headline).toMatch(/1 corner, 1 impact,/);
    // The English tile names carry the same numbers as the Portuguese.
    const pt = buildSessionReport(ride(), "pt");
    expect(report.bike.metrics.map((m) => m.raw)).toEqual(
      pt.bike.metrics.map((m) => m.raw),
    );
  });
});

describe("compareReports", () => {
  const section = (
    title: "Rider" | "Bike" | "Trail",
    metrics: SessionReport["bike"]["metrics"],
  ): SessionReport["bike"] => ({
    title,
    subtitle: "",
    headline: "",
    metrics,
    highlights: null,
    caveat: null,
  });
  const report = (
    harsh: number,
    settle: number,
    retention: number,
  ): SessionReport => ({
    rider: section("Rider", [
      {
        key: "cornerRetention",
        label: "Retenção nas curvas",
        value: `${retention} %`,
        raw: retention,
        better: "higher",
        tie: 2,
      },
      { key: "maxSpeed", label: "Velocidade máx", value: "40" },
      {
        key: "avgSpeed",
        label: "Velocidade média",
        value: "26,4",
        raw: 26.4,
        tie: 0.5,
      },
    ]),
    bike: section("Bike", [
      {
        key: "harshness",
        label: "Harshness",
        value: harsh.toFixed(1).replace(".", ","),
        unit: "×",
        raw: harsh,
        better: "lower",
        tie: 0.2,
      },
      {
        key: "residualOscillation",
        label: "Assentamento",
        value: String(settle),
        unit: "ms",
        raw: settle,
        better: "lower",
        tie: 30,
      },
    ]),
    trail: section("Trail", []),
  });

  it("sets each numbered metric against the other report's, with a verdict", () => {
    const rows = compareReports(
      report(3.1, 180, 71),
      report(3.6, 190, 76),
      "pt",
    );
    expect(rows.map((r) => [r.label, r.tone, r.digits])).toEqual([
      ["Retenção nas curvas", "worse", 0],
      ["Velocidade média", "tie", 1],
      ["Harshness", "better", 1],
      ["Assentamento", "tie", 0],
    ]);
    expect(rows[2].diff).toBeCloseTo(-0.5);
    expect(rows[2].previous).toBe("3,6");
    // A metric with no better direction is neutral once past its tie.
    const faster = report(3.1, 180, 71);
    faster.rider.metrics[2].raw = 30;
    expect(compareReports(faster, report(3.6, 190, 76), "pt")[1].tone).toBe(
      "neutral",
    );
    // A metric only one report has, or one without a number, is left out.
    const partial = report(3.1, 180, 71);
    partial.bike.metrics.pop();
    expect(compareReports(partial, report(3.6, 190, 76), "pt")).toHaveLength(3);
  });

  it("counts the decimals by the language's own separator", () => {
    const english = (harsh: number): SessionReport => ({
      rider: section("Rider", []),
      bike: section("Bike", [
        {
          key: "harshness",
          label: "Harshness",
          value: harsh.toFixed(1),
          raw: harsh,
          tie: 0.2,
        },
      ]),
      trail: section("Trail", []),
    });
    expect(compareReports(english(3.1), english(3.6), "en")[0].digits).toBe(1);
  });
});
