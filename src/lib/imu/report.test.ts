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
  it("answers in all three dimensions, with the figures the ride was drawn with", () => {
    const report = buildSessionReport(ride());
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

  it("says what it cannot say without a track", () => {
    const report = buildSessionReport(ride(false));
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
        label: "Retenção nas curvas",
        value: `${retention} %`,
        raw: retention,
        better: "higher",
        tie: 2,
      },
      { label: "Velocidade máx", value: "40" },
      { label: "Velocidade média", value: "26,4", raw: 26.4, tie: 0.5 },
    ]),
    bike: section("Bike", [
      {
        label: "Harshness",
        value: harsh.toFixed(1).replace(".", ","),
        unit: "×",
        raw: harsh,
        better: "lower",
        tie: 0.2,
      },
      {
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
    const rows = compareReports(report(3.1, 180, 71), report(3.6, 190, 76));
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
    expect(compareReports(faster, report(3.6, 190, 76))[1].tone).toBe(
      "neutral",
    );
    // A metric only one report has, or one without a number, is left out.
    const partial = report(3.1, 180, 71);
    partial.bike.metrics.pop();
    expect(compareReports(partial, report(3.6, 190, 76))).toHaveLength(3);
  });
});
