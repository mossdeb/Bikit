/**
 * The session report: one recording read in three dimensions — the rider,
 * the bike, the trail — each a headline in words, a handful of figures, and
 * the three instants worth going back to (by request, 2026-09-10, from a
 * table of questions: "corner performance", "harshness", "impact density"…).
 *
 * Everything here is computed on read from the aligned session, the way
 * the analysis page's cards are: nothing is stored, and a metric added
 * later is a function added here.
 *
 * The honest limit, written where it applies: one sensor on the frame
 * measures trail × bike × rider. The rider has the GPS and the corners'
 * kinematics for anchors, the trail has geometry and event counts, but the
 * bike has none of its own — what the frame felt is the trail as filtered
 * by the bike, and only another pass on the same trail separates the two.
 * The Bike section says so, and its figures are proxies until the group
 * comparison exists.
 */

import type { ImuEvent, ImuSessionData } from "./format";
import {
  curveMomentum,
  fusedSpeedKmhSeries,
  gForceOf,
  gpsMeanSpeed,
  impactEnergy,
  impactSeverityIndex,
  jerkSeries,
  leanSeries,
  pitchSeries,
  roughnessSeries,
  sessionSummary,
  windowMeanAbs,
  windowRms,
} from "./derive";
import { lowerBoundIndex } from "./downsample";

export interface ReportMetric {
  label: string;
  value: string;
  unit?: string;
  /** One line under the figure saying what it is or how it was read. */
  hint?: string;
  /** The figure as a number, on the metrics another session's report is
   * compared against (compareReports); with which way is better, and
   * under what difference two readings are the same. */
  raw?: number;
  better?: "lower" | "higher";
  tie?: number;
}

export interface ReportHighlight {
  title: string;
  timeMs: number;
  detail: string;
}

export interface ReportSection {
  title: "Rider" | "Bike" | "Trail";
  subtitle: string;
  /** The section's conclusion, in words, before any number. */
  headline: string;
  metrics: ReportMetric[];
  highlights: { heading: string; items: ReportHighlight[] } | null;
  /** What the figures cannot say, when there is something they cannot. */
  caveat: string | null;
}

export interface SessionReport {
  rider: ReportSection;
  bike: ReportSection;
  trail: ReportSection;
}

/** Below this the bike is stopped or walked, and nothing is averaged. */
const MOVING_KMH = 3;
/** A brake that ends within this before a corner starts was the corner's. */
const BRAKE_BEFORE_CURVE_MS = 2000;
/** An impact's energy is read over this each side, the card's window. */
const IMPACT_WINDOW_MS = 150;
/** After an impact, "settled" is the dynamic G staying under this for
 * SETTLE_HOLD_MS — the first moment the frame is back to riding. */
const SETTLE_G = 1.0;
const SETTLE_HOLD_MS = 100;
const SETTLE_CAP_MS = 2000;
/** How many of anything a highlights list names. */
const HIGHLIGHTS = 3;

const pt = (value: number, digits = 0) =>
  value.toLocaleString("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const pct = (ratio: number) => `${Math.round(100 * ratio)} %`;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stddev(values: number[]): number | null {
  const m = mean(values);
  if (m == null || values.length < 2) return null;
  return Math.sqrt(
    values.reduce((a, v) => a + (v - m) * (v - m), 0) / (values.length - 1),
  );
}

function quantile(sorted: Float32Array | number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  return sorted[Math.min(n - 1, Math.floor(q * n))];
}

export function buildSessionReport(session: ImuSessionData): SessionReport {
  const { tMs, ax, ay, az, gx, gz } = session.channels;
  const n = tMs.length;
  const g = gForceOf(session);
  const gps = session.gps;
  const summary = sessionSummary(session);
  const speed = gps
    ? fusedSpeedKmhSeries(tMs, session.mounting?.applied ? ax : null, gps)
    : null;
  const distanceKm =
    summary.distanceM != null && summary.distanceM > 0
      ? summary.distanceM / 1000
      : null;
  const perKm = (count: number) =>
    distanceKm != null ? count / distanceKm : null;
  const moving = (i: number) => speed == null || speed[i] > MOVING_KMH;
  const at = (ms: number) => Math.min(n - 1, lowerBoundIndex(tMs, ms));

  const curves = session.events.filter(
    (e): e is Extract<ImuEvent, { kind: "curve" }> => e.kind === "curve",
  );
  const brakings = session.events.filter(
    (e): e is Extract<ImuEvent, { kind: "braking" }> => e.kind === "braking",
  );
  const impacts = session.events.filter(
    (e): e is Extract<ImuEvent, { kind: "impact" }> => e.kind === "impact",
  );
  const roughSections = session.events.filter(
    (e): e is Extract<ImuEvent, { kind: "rough_section" }> =>
      e.kind === "rough_section",
  );

  return {
    rider: riderSection(),
    bike: bikeSection(),
    trail: trailSection(),
  };

  // ── Rider ────────────────────────────────────────────────────────────

  function riderSection(): ReportSection {
    const metrics: ReportMetric[] = [];
    const highlights: ReportHighlight[] = [];
    const parts: string[] = [];

    if (speed) {
      const movingSpeeds: number[] = [];
      for (let i = 0; i < n; i++) if (moving(i)) movingSpeeds.push(speed[i]);
      const avg = mean(movingSpeeds);
      if (avg != null)
        metrics.push({
          label: "Velocidade média",
          value: pt(avg, 1),
          unit: "km/h",
          hint: "em andamento, acima de 3 km/h",
        });
      if (summary.maxSpeedKmh != null)
        metrics.push({
          label: "Velocidade máx",
          value: pt(summary.maxSpeedKmh, 1),
          unit: "km/h",
        });
    }

    // Corners: the momentum figures, corrected for the hill where there is
    // a track to read the hill from.
    const corners = curves
      .map((curve, i) => ({
        curve,
        m: speed ? curveMomentum(tMs, speed, curves, i, gps) : null,
      }))
      .filter((c) => c.m != null)
      .map((c) => ({
        curve: c.curve,
        m: c.m!,
        retention: c.m!.retentionCorrected ?? c.m!.retention,
      }));
    if (corners.length > 0) {
      const all = corners.map((c) => c.retention);
      const right = corners
        .filter((c) => c.curve.direction === "right")
        .map((c) => c.retention);
      const left = corners
        .filter((c) => c.curve.direction === "left")
        .map((c) => c.retention);
      const avg = mean(all)!;
      const corrected = corners.some((c) => c.m.retentionCorrected != null);
      metrics.push({
        label: "Retenção nas curvas",
        value: pct(avg),
        raw: 100 * avg,
        better: "higher",
        tie: 2,
        hint: corrected
          ? "saída sobre a saída que a gravidade daria, média das curvas"
          : "saída sobre entrada, média das curvas",
      });
      const rightAvg = mean(right);
      const leftAvg = mean(left);
      if (rightAvg != null && leftAvg != null)
        metrics.push({
          label: "Direita · esquerda",
          value: `${pct(rightAvg)} · ${pct(leftAvg)}`,
          hint: `${right.length} curvas à direita, ${left.length} à esquerda`,
        });
      const apex = mean(corners.map((c) => c.m.apexLoss));
      if (apex != null)
        metrics.push({
          label: "Perda no ápice",
          value: pct(apex),
          hint: "quanto da entrada se perdeu até ao mínimo, média",
        });
      const spread = stddev(all);
      if (spread != null)
        metrics.push({
          label: "Consistência",
          value: `±${Math.round(100 * spread)}`,
          unit: "pontos",
          hint: "desvio da retenção entre curvas; menor é mais regular",
        });
      const worst = [...corners]
        .sort((a, b) => a.retention - b.retention)
        .slice(0, HIGHLIGHTS);
      for (const c of worst)
        highlights.push({
          title:
            c.curve.direction === "right"
              ? "Curva à direita"
              : "Curva à esquerda",
          timeMs: c.curve.startMs,
          detail: `${Math.round(c.m.entryKmh)} → ${Math.round(c.m.minKmh)} → ${Math.round(c.m.exitKmh)} km/h · retenção ${pct(c.retention)}`,
        });
      parts.push(
        `Reteve em média ${pct(avg)} nas curvas` +
          (rightAvg != null && leftAvg != null
            ? Math.abs(rightAvg - leftAvg) >= 0.05
              ? `, com as curvas ${rightAvg < leftAvg ? "à direita" : "à esquerda"} a custar mais (${pct(Math.min(rightAvg, leftAvg))} contra ${pct(Math.max(rightAvg, leftAvg))})`
              : ", sem diferença entre os dois lados"
            : "") +
          ".",
      );
    }

    // Braking: how often, and how much of it was the corners'.
    if (brakings.length > 0) {
      const beforeCurve = brakings.filter((b) =>
        curves.some(
          (c) =>
            c.startMs - b.endMs >= -200 &&
            c.startMs - b.endMs <= BRAKE_BEFORE_CURVE_MS,
        ),
      ).length;
      const rate = perKm(brakings.length);
      metrics.push({
        label: "Travagens",
        value: rate != null ? pt(rate, 1) : String(brakings.length),
        unit: rate != null ? "por km" : undefined,
        hint: `${beforeCurve} de ${brakings.length} à entrada de uma curva`,
      });
      parts.push(
        `Travou ${brakings.length} ${brakings.length === 1 ? "vez" : "vezes"}${rate != null ? `, ${pt(rate, 1)} por km` : ""}, ${pct(beforeCurve / brakings.length)} ${brakings.length === 1 ? "dela" : "delas"} à entrada de curvas.`,
      );
    }

    // Rough ground: the pace kept through it, against the stretch before.
    if (gps && roughSections.length > 0) {
      const ratios: number[] = [];
      for (const s of roughSections) {
        const durMs = s.endMs - s.startMs;
        const beforeFrom = Math.max(tMs[0], s.startMs - durMs);
        if (s.startMs - beforeFrom < 500) continue;
        const inside = gpsMeanSpeed(gps, s.startMs, s.endMs);
        const before = gpsMeanSpeed(gps, beforeFrom, s.startMs);
        if (inside != null && before != null && before > 0.5)
          ratios.push(inside / before);
      }
      const kept = mean(ratios);
      if (kept != null)
        metrics.push({
          label: "Vel. retida em acidentado",
          value: pct(kept),
          hint: "velocidade dentro das zonas acidentadas sobre a do troço antes",
        });
    }

    if (!gps)
      parts.unshift(
        "Sem GPS não há velocidades, e a condução lê-se pela velocidade: as curvas ficam sem retenção.",
      );
    if (parts.length === 0)
      parts.push(
        "Sem curvas nem travagens detetadas: nada para avaliar na condução.",
      );

    return {
      title: "Rider",
      subtitle: "Performance de condução",
      headline: parts.join(" "),
      metrics,
      highlights:
        highlights.length > 0
          ? { heading: "Curvas onde mais se perdeu", items: highlights }
          : null,
      caveat: gps ? null : null,
    };
  }

  // ── Bike ─────────────────────────────────────────────────────────────

  function bikeSection(): ReportSection {
    const metrics: ReportMetric[] = [];
    const highlights: ReportHighlight[] = [];
    const parts: string[] = [];

    // The dynamic G — the frame's motion with gravity taken out — over the
    // rough sections when there are any, the whole moving ride otherwise.
    const inRough = (i: number) =>
      roughSections.some((s) => tMs[i] >= s.startMs && tMs[i] <= s.endMs);
    const useRough = roughSections.length > 0;
    const dyn: number[] = [];
    for (let i = 0; i < n; i++)
      if (moving(i) && (!useRough || inRough(i))) dyn.push(Math.abs(g[i] - 1));
    if (dyn.length > 100) {
      const sorted = Float32Array.from(dyn).sort();
      const rms = Math.sqrt(dyn.reduce((a, v) => a + v * v, 0) / dyn.length);
      const p99 = quantile(sorted, 0.99);
      if (rms > 0)
        metrics.push({
          label: "Harshness",
          value: pt(p99 / rms, 1),
          unit: "×",
          raw: p99 / rms,
          better: "lower",
          tie: 0.2,
          hint: `pico (p99) sobre RMS da força dinâmica${useRough ? " nas zonas acidentadas" : ""}; maior é mais seco`,
        });
    }

    // Chatter: how fast the G changes, sample to sample, on rough ground.
    const jerk = jerkSeries(tMs, g);
    const chatter: number[] = [];
    for (let i = 0; i < n; i++)
      if (moving(i) && (!useRough || inRough(i))) chatter.push(jerk[i]);
    if (chatter.length > 100) {
      const rms = Math.sqrt(
        chatter.reduce((a, v) => a + v * v, 0) / chatter.length,
      );
      metrics.push({
        label: "Vibração",
        value: pt(rms, 0),
        unit: "G/s",
        raw: rms,
        better: "lower",
        tie: 5,
        hint: `RMS da variação da força${useRough ? " nas zonas acidentadas" : ""}`,
      });
    }

    // Settling: after each impact, how long until the frame is riding again.
    const settles: { impact: (typeof impacts)[number]; ms: number }[] = [];
    for (const impact of impacts) {
      const i0 = at(impact.timeMs);
      let settled: number | null = null;
      let quietSince: number | null = null;
      for (let i = i0; i < n && tMs[i] - impact.timeMs <= SETTLE_CAP_MS; i++) {
        if (Math.abs(g[i] - 1) < SETTLE_G) {
          if (quietSince == null) quietSince = tMs[i];
          else if (tMs[i] - quietSince >= SETTLE_HOLD_MS) {
            settled = quietSince - impact.timeMs;
            break;
          }
        } else quietSince = null;
      }
      settles.push({ impact, ms: settled ?? SETTLE_CAP_MS });
    }
    const settleMedian = median(settles.map((s) => s.ms));
    if (settleMedian != null) {
      metrics.push({
        label: "Assentamento",
        value: pt(settleMedian, 0),
        unit: "ms",
        raw: settleMedian,
        better: "lower",
        tie: 30,
        hint: "mediana do tempo até a força voltar abaixo de 1 G após um impacto",
      });
      for (const s of [...settles]
        .sort((a, b) => b.ms - a.ms)
        .slice(0, HIGHLIGHTS))
        highlights.push({
          title: "Impacto",
          timeMs: s.impact.timeMs,
          detail:
            s.ms >= SETTLE_CAP_MS
              ? `não assentou em ${pt(SETTLE_CAP_MS / 1000, 1)} s`
              : `assentou em ${pt(s.ms, 0)} ms`,
        });
    }

    // Attitude on rough ground: how much the frame pitched and rolled.
    if (useRough && session.aligned) {
      const lean = leanSeries(tMs, ay, az, gx, gz, speed);
      const pitch = pitchSeries(tMs, ax, ay, az);
      const leans: number[] = [];
      const pitches: number[] = [];
      for (let i = 0; i < n; i++)
        if (inRough(i)) {
          leans.push(lean[i]);
          pitches.push(pitch[i]);
        }
      const sl = stddev(leans);
      const sp = stddev(pitches);
      if (sl != null && sp != null)
        metrics.push({
          label: "Estabilidade",
          value: `±${pt(sp, 0)}° · ±${pt(sl, 0)}°`,
          hint: "desvio do pitch e da inclinação nas zonas acidentadas",
        });
    }

    if (settleMedian != null)
      parts.push(
        impacts.length === 1
          ? `Depois do único impacto o quadro voltou a andar em ${pt(settleMedian, 0)} ms.`
          : `Depois de um impacto o quadro volta a andar em ${pt(settleMedian, 0)} ms, mediana de ${impacts.length}.`,
      );
    const vib = metrics.find((m) => m.label === "Vibração");
    if (vib)
      parts.push(
        `Vibração de ${vib.value} G/s${useRough ? " em terreno acidentado" : " ao longo da gravação"}.`,
      );
    if (parts.length === 0)
      parts.push(
        "Sem impactos nem terreno acidentado, a bicicleta não foi posta à prova.",
      );

    return {
      title: "Bike",
      subtitle: "Comportamento da bicicleta",
      headline: parts.join(" "),
      metrics,
      highlights:
        highlights.length > 0
          ? { heading: "Impactos mais lentos a assentar", items: highlights }
          : null,
      caveat:
        "Um sensor no quadro mede o trilho filtrado pela bicicleta. Estes valores só ganham sentido comparados com outra passagem na mesma pista, com outra afinação ou outra bicicleta.",
    };
  }

  // ── Trail ────────────────────────────────────────────────────────────

  function trailSection(): ReportSection {
    const metrics: ReportMetric[] = [];
    const highlights: ReportHighlight[] = [];
    const parts: string[] = [];

    if (distanceKm != null)
      metrics.push({
        label: "Distância",
        value: pt(distanceKm, 2),
        unit: "km",
      });

    // Height and gradient, from the receiver's altitude at the two ends —
    // five fixes each, medianed, because a single fix wanders by metres.
    let dropM: number | null = null;
    if (gps && gps.tMs.length >= 10) {
      const first = median(
        Array.from(gps.altitudeM.slice(0, 5)).filter(Number.isFinite),
      );
      const last = median(
        Array.from(gps.altitudeM.slice(gps.altitudeM.length - 5)).filter(
          Number.isFinite,
        ),
      );
      if (first != null && last != null) {
        dropM = first - last;
        const gradient =
          distanceKm != null ? dropM / (distanceKm * 1000) : null;
        metrics.push({
          label: "Desnível",
          value: `${dropM >= 0 ? "−" : "+"}${pt(Math.abs(dropM), 0)}`,
          unit: "m",
          hint:
            gradient != null
              ? `gradiente médio ${pt(100 * Math.abs(gradient), 0)} % ${dropM >= 0 ? "a descer" : "a subir"}`
              : undefined,
        });
      }
    }

    // Roughness: the 0.5 s RMS about 1 G while moving, and the share of
    // the ride the detector called rough.
    const rough = roughnessSeries(tMs, g);
    const roughMoving: number[] = [];
    for (let i = 0; i < n; i++) if (moving(i)) roughMoving.push(rough[i]);
    const roughMean = mean(roughMoving);
    const roughShare =
      session.durationMs > 0 ? summary.roughMs / session.durationMs : 0;
    if (roughMean != null)
      metrics.push({
        label: "Rugosidade",
        value: pt(roughMean, 2),
        unit: "G RMS",
        hint: `${pct(roughShare)} do tempo em zonas acidentadas`,
      });

    // Impacts: how many per km, and how hard on average.
    if (impacts.length > 0) {
      const severities = impacts
        .map((im) =>
          impactEnergy(
            tMs,
            g,
            im.timeMs - IMPACT_WINDOW_MS,
            im.timeMs + IMPACT_WINDOW_MS,
          ),
        )
        .filter((e): e is number => e != null)
        .map(impactSeverityIndex);
      const rate = perKm(impacts.length);
      const sev = mean(severities);
      metrics.push({
        label: "Impactos",
        value: rate != null ? pt(rate, 1) : String(impacts.length),
        unit: rate != null ? "por km" : undefined,
        hint:
          sev != null
            ? `${impacts.length} no total, severidade média ${Math.round(sev)}/100`
            : `${impacts.length} no total`,
      });
    }

    // Corners: how many per km, and how tight.
    if (curves.length > 0) {
      const radii: number[] = [];
      if (gps)
        for (const c of curves) {
          const v = gpsMeanSpeed(gps, c.startMs, c.endMs);
          const omegaDeg = windowMeanAbs(tMs, gz, c.startMs, c.endMs);
          if (v != null && omegaDeg != null && omegaDeg > 1)
            radii.push(v / ((omegaDeg * Math.PI) / 180));
        }
      const rate = perKm(curves.length);
      const r = median(radii);
      metrics.push({
        label: "Curvas",
        value: rate != null ? pt(rate, 0) : String(curves.length),
        unit: rate != null ? "por km" : undefined,
        hint:
          r != null
            ? `${curves.length} no total, raio mediano ~${Math.round(r)} m`
            : `${curves.length} no total`,
      });
    }

    // The trail's own pace: the speed held on the straights, outside
    // corners, brakes and rough ground — what the ground allows.
    if (speed) {
      const inEvent = (i: number) =>
        curves.some((c) => tMs[i] >= c.startMs && tMs[i] <= c.endMs) ||
        brakings.some((b) => tMs[i] >= b.startMs && tMs[i] <= b.endMs) ||
        inRoughAt(i);
      const straights: number[] = [];
      for (let i = 0; i < n; i += 4)
        if (moving(i) && !inEvent(i)) straights.push(speed[i]);
      const natural = median(straights);
      if (natural != null)
        metrics.push({
          label: "Velocidade natural",
          value: pt(natural, 1),
          unit: "km/h",
          hint: "mediana nas retas, fora de curvas, travagens e acidentado",
        });
    }

    for (const s of [...roughSections]
      .map((s) => ({ s, rms: windowRms(tMs, g, s.startMs, s.endMs, 1) ?? 0 }))
      .sort((a, b) => b.rms - a.rms)
      .slice(0, HIGHLIGHTS))
      highlights.push({
        title: "Zona acidentada",
        timeMs: s.s.startMs,
        detail: `${pt((s.s.endMs - s.s.startMs) / 1000, 1)} s · ${pt(s.rms, 2)} G RMS`,
      });

    const bits: string[] = [];
    if (distanceKm != null) bits.push(`${pt(distanceKm, 2)} km`);
    if (dropM != null)
      bits.push(
        `${pt(Math.abs(dropM), 0)} m ${dropM >= 0 ? "a descer" : "a subir"}`,
      );
    if (curves.length > 0) bits.push(`${curves.length} curvas`);
    if (impacts.length > 0) bits.push(`${impacts.length} impactos`);
    if (roughShare > 0)
      bits.push(`${pct(roughShare)} do tempo em terreno acidentado`);
    parts.push(
      bits.length > 0 ? `${bits.join(", ")}.` : "Um percurso sem eventos.",
    );

    return {
      title: "Trail",
      subtitle: "Características do percurso",
      headline: parts.join(" "),
      metrics,
      highlights:
        highlights.length > 0
          ? { heading: "Troços mais duros", items: highlights }
          : null,
      caveat: null,
    };

    function inRoughAt(i: number) {
      return roughSections.some(
        (s) => tMs[i] >= s.startMs && tMs[i] <= s.endMs,
      );
    }
  }
}

/** One metric of this report set against the same metric of another —
 * the previous run of this bike on another setup, on the same trail. */
export interface ReportComparisonRow {
  label: string;
  unit?: string;
  value: string;
  previous: string;
  /** This minus the other, in the metric's own unit, and the decimals the
   * figure is printed with. */
  diff: number;
  digits: number;
  tone: "better" | "worse" | "tie";
}

/**
 * The metrics both reports carry a number for, each with its difference
 * and a verdict: better, worse, or within the metric's own tie. What the
 * Bike section can say once there IS another pass on the same trail — the
 * comparison its caveat asks for. The order is the current report's.
 */
export function compareReports(
  current: SessionReport,
  previous: SessionReport,
): ReportComparisonRow[] {
  const all = (r: SessionReport) => [
    ...r.rider.metrics,
    ...r.bike.metrics,
    ...r.trail.metrics,
  ];
  const before = new Map(
    all(previous)
      .filter((m) => m.raw != null)
      .map((m) => [m.label, m]),
  );
  const rows: ReportComparisonRow[] = [];
  for (const m of all(current)) {
    const o = before.get(m.label);
    if (m.raw == null || !m.better || o?.raw == null) continue;
    const diff = m.raw - o.raw;
    const tone =
      Math.abs(diff) <= (m.tie ?? 0)
        ? "tie"
        : (m.better === "lower" ? diff < 0 : diff > 0)
          ? "better"
          : "worse";
    rows.push({
      label: m.label,
      unit: m.unit,
      value: m.value,
      previous: o.value,
      diff,
      digits: (m.value.split(",")[1] ?? "").replace(/\D/g, "").length,
      tone,
    });
  }
  return rows;
}
