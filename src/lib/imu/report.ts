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

import type { Locale } from "@/lib/i18n";
import {
  getProDictionary,
  proNumber,
  proPercent,
  type ProDictionary,
} from "@/lib/i18n/pro";
import type { ImuEvent, ImuSessionData } from "./format";
import {
  bandpassSeries,
  CHASSIS_BAND_HZ,
  CHATTER_BAND_HZ,
  curveMomentum,
  DECAY_TO_MS,
  fusedSpeedKmhSeries,
  impactDecayRatio,
  impactRecoveryRatio,
  RECOVERY_GAP_MS,
  RECOVERY_HIT_G,
  recoveryHits,
  gForceOf,
  gpsMeanSpeed,
  impactEnergy,
  impactSeverityIndex,
  leanSeries,
  pitchSeries,
  roughnessSeries,
  sessionSummary,
  windowMeanAbs,
  windowRms,
} from "./derive";

/** The figure's name in the dictionary (`report.metric`): what a
 * comparison matches figures by, whatever language each report was
 * built in. */
export type ReportMetricKey = keyof ProDictionary["report"]["metric"];

export interface ReportMetric {
  key: ReportMetricKey;
  label: string;
  value: string;
  unit?: string;
  /** One line under the figure saying what it is or how it was read. */
  hint?: string;
  /** The figure as a number, on the metrics another session's report is
   * compared against (compareReports); with which way is better — none
   * when neither is — and under what difference two readings are the
   * same. */
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
/** How many of anything a highlights list names. */
const HIGHLIGHTS = 3;
/** Fewer successive impacts than this and the recovery says nothing. */
const RECOVERY_MIN_PAIRS = 3;

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

/**
 * The report in the reader's language (2026-09-24): every name, hint and
 * sentence comes from the Pro dictionary, and the figures are written the
 * way that language writes them — "16,3" and "30 %" in Portuguese, "16.3"
 * and "30%" in English. Two reports set side by side (compareReports) must
 * be built in the same language, since the metrics are matched by name.
 */
export function buildSessionReport(
  session: ImuSessionData,
  locale: Locale,
): SessionReport {
  const t = getProDictionary(locale).report;
  const num = (value: number, digits = 0) => proNumber(value, locale, digits);
  const pct = (ratio: number) => proPercent(100 * ratio, locale, 0);
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
          key: "avgSpeed",
          label: t.metric.avgSpeed,
          value: num(avg, 1),
          unit: "km/h",
          raw: avg,
          tie: 0.5,
          hint: t.hint.avgSpeed,
        });
      if (summary.maxSpeedKmh != null)
        metrics.push({
          key: "maxSpeed",
          label: t.metric.maxSpeed,
          value: num(summary.maxSpeedKmh, 1),
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
        key: "cornerRetention",
        label: t.metric.cornerRetention,
        value: pct(avg),
        raw: 100 * avg,
        better: "higher",
        tie: 2,
        hint: corrected ? t.hint.retentionCorrected : t.hint.retention,
      });
      const rightAvg = mean(right);
      const leftAvg = mean(left);
      if (rightAvg != null && leftAvg != null)
        metrics.push({
          key: "rightLeft",
          label: t.metric.rightLeft,
          value: `${pct(rightAvg)} · ${pct(leftAvg)}`,
          hint: t.hint.rightLeft(right.length, left.length),
        });
      const apex = mean(corners.map((c) => c.m.apexLoss));
      if (apex != null)
        metrics.push({
          key: "apexLoss",
          label: t.metric.apexLoss,
          value: pct(apex),
          hint: t.hint.apexLoss,
        });
      const spread = stddev(all);
      if (spread != null)
        metrics.push({
          key: "consistency",
          label: t.metric.consistency,
          value: `±${Math.round(100 * spread)}`,
          unit: t.units.points,
          hint: t.hint.consistency,
        });
      const worst = [...corners]
        .sort((a, b) => a.retention - b.retention)
        .slice(0, HIGHLIGHTS);
      for (const c of worst)
        highlights.push({
          title:
            c.curve.direction === "right"
              ? t.highlight.cornerRight
              : t.highlight.cornerLeft,
          timeMs: c.curve.startMs,
          detail: t.highlight.corner(
            Math.round(c.m.entryKmh),
            Math.round(c.m.minKmh),
            Math.round(c.m.exitKmh),
            pct(c.retention),
          ),
        });
      // The side that cost more, when the two are five points or more
      // apart; "none" when they are within that; null without both.
      const worse =
        rightAvg != null && leftAvg != null
          ? Math.abs(rightAvg - leftAvg) >= 0.05
            ? rightAvg < leftAvg
              ? "right"
              : "left"
            : "none"
          : null;
      parts.push(
        t.headline.corners(
          pct(avg),
          worse,
          pct(Math.min(rightAvg ?? 0, leftAvg ?? 0)),
          pct(Math.max(rightAvg ?? 0, leftAvg ?? 0)),
        ),
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
        key: "brakings",
        label: t.metric.brakings,
        value: rate != null ? num(rate, 1) : String(brakings.length),
        unit: rate != null ? t.units.perKm : undefined,
        hint: t.hint.brakings(beforeCurve, brakings.length),
      });
      parts.push(
        t.headline.brakings(
          brakings.length,
          rate != null ? num(rate, 1) : null,
          pct(beforeCurve / brakings.length),
        ),
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
          key: "speedKeptInRough",
          label: t.metric.speedKeptInRough,
          value: pct(kept),
          hint: t.hint.speedKeptInRough,
        });
    }

    if (!gps) parts.unshift(t.headline.noGps);
    if (parts.length === 0) parts.push(t.headline.noRiding);

    return {
      title: "Rider",
      subtitle: t.subtitle.rider,
      headline: parts.join(" "),
      metrics,
      highlights:
        highlights.length > 0
          ? { heading: t.highlights.rider, items: highlights }
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
          key: "harshness",
          label: t.metric.harshness,
          value: num(p99 / rms, 1),
          unit: "×",
          raw: p99 / rms,
          better: "lower",
          tie: 0.2,
          hint: t.hint.harshness(useRough ? t.hint.inRough : ""),
        });
    }

    // The two bands of the frame's motion (by request, 2026-09-12, over
    // the jerk RMS that weighed every frequency alike): the chassis's own
    // bobbing in 2–12 Hz, which the compression damping controls, and the
    // chatter in 12–60 Hz, which the tyres and the small stones put
    // through. Both RMS over the same ground as the harshness.
    const dynamic = new Float32Array(n);
    for (let i = 0; i < n; i++) dynamic[i] = g[i] - 1;
    const chassis = bandpassSeries(tMs, dynamic, ...CHASSIS_BAND_HZ);
    const chatterBand = bandpassSeries(tMs, dynamic, ...CHATTER_BAND_HZ);
    const bandRms = (band: Float32Array) => {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < n; i++)
        if (moving(i) && (!useRough || inRough(i))) {
          sum += band[i] * band[i];
          count++;
        }
      return count > 100 ? Math.sqrt(sum / count) : null;
    };
    const where = useRough ? t.hint.inRough : "";
    const chassisRms = bandRms(chassis);
    if (chassisRms != null)
      metrics.push({
        key: "chassisMovement",
        label: t.metric.chassisMovement,
        value: num(chassisRms, 2),
        unit: "G",
        raw: chassisRms,
        better: "lower",
        tie: 0.04,
        hint: t.hint.chassisMovement(where),
      });
    const chatterRms = bandRms(chatterBand);
    if (chatterRms != null)
      metrics.push({
        key: "chatter",
        label: t.metric.chatter,
        value: num(chatterRms, 2),
        unit: "G",
        raw: chatterRms,
        better: "lower",
        tie: 0.04,
        hint: t.hint.chatter(where),
      });

    // Decay: how much of each impact goes on bobbing in the chassis band
    // over the 300 ms that follow it, over the hit's own peak — the
    // damper's work, read where it is done. (The settling time that stood
    // here counted until the force stayed under 1 G, and so measured the
    // trail after the hit: two runs on one setup gave 558 and 1065 ms.)
    const decays: { impact: (typeof impacts)[number]; ratio: number }[] = [];
    for (const impact of impacts) {
      const ratio = impactDecayRatio(tMs, chassis, dynamic, impact.timeMs);
      if (ratio != null) decays.push({ impact, ratio });
    }
    const decayMedian = median(decays.map((d) => d.ratio));
    if (decayMedian != null) {
      metrics.push({
        key: "residualOscillation",
        label: t.metric.residualOscillation,
        value: num(100 * decayMedian, 1),
        unit: "%",
        raw: 100 * decayMedian,
        better: "lower",
        tie: 1,
        hint: t.hint.residualOscillation(DECAY_TO_MS),
      });
      for (const d of [...decays]
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, HIGHLIGHTS))
        highlights.push({
          title: t.highlight.impact,
          timeMs: d.impact.timeMs,
          detail: t.highlight.impactDetail(pct(d.ratio)),
        });
    }

    // Recovery: what is left of a hit when the next one lands, for the
    // hits that come in runs (within RECOVERY_GAP_MS of each other) — the
    // "Recuperação" axis of the setup dynamics (by request, 2026-09-15).
    // Where the decay reads the damper closing one hit, this reads whether
    // it was done before the next: the bike arriving settled, or still
    // bobbing and packing down through the run. The hits are read at the
    // detector's floor and not from the impacts, which a run keeps to its
    // strongest few, seconds apart.
    const hits = recoveryHits(tMs, dynamic);
    const recoveries: number[] = [];
    for (let k = 0; k + 1 < hits.length; k++) {
      const ratio = impactRecoveryRatio(
        tMs,
        chassis,
        dynamic,
        hits[k],
        hits[k + 1],
      );
      if (ratio != null) recoveries.push(ratio);
    }
    const recoveryMedian =
      recoveries.length >= RECOVERY_MIN_PAIRS ? median(recoveries) : null;
    if (recoveryMedian != null)
      metrics.push({
        key: "recovery",
        label: t.metric.recovery,
        value: num(100 * recoveryMedian, 1),
        unit: "%",
        raw: 100 * recoveryMedian,
        better: "lower",
        tie: 1,
        hint: t.hint.recovery(
          num(RECOVERY_HIT_G + 1),
          num(RECOVERY_GAP_MS / 1000, 1),
          recoveries.length,
        ),
      });

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
      // The number the figure is compared on is the pitch alone — the
      // "Suporte" axis of the setup dynamics (2026-09-15): how much the
      // frame dived and rocked through the rough is what the chassis
      // resisted, where the lean is the rider's line as much as the bike.
      if (sl != null && sp != null)
        metrics.push({
          key: "stability",
          label: t.metric.stability,
          value: `±${num(sp, 0)}° · ±${num(sl, 0)}°`,
          raw: sp,
          better: "lower",
          tie: 1,
          hint: t.hint.stability,
        });
    }

    if (decayMedian != null)
      parts.push(
        decays.length === 1
          ? t.headline.decayOne(pct(decayMedian))
          : t.headline.decay(pct(decayMedian), decays.length),
      );
    if (chassisRms != null && chatterRms != null)
      parts.push(
        t.headline.bands(num(chassisRms, 2), num(chatterRms, 2), useRough),
      );
    if (parts.length === 0) parts.push(t.headline.bikeUntested);

    return {
      title: "Bike",
      subtitle: t.subtitle.bike,
      headline: parts.join(" "),
      metrics,
      highlights:
        highlights.length > 0
          ? { heading: t.highlights.bike, items: highlights }
          : null,
      caveat: t.headline.bikeCaveat,
    };
  }

  // ── Trail ────────────────────────────────────────────────────────────

  function trailSection(): ReportSection {
    const metrics: ReportMetric[] = [];
    const highlights: ReportHighlight[] = [];
    const parts: string[] = [];

    if (distanceKm != null)
      metrics.push({
        key: "distance",
        label: t.metric.distance,
        value: num(distanceKm, 2),
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
          key: "elevation",
          label: t.metric.elevation,
          value: `${dropM >= 0 ? "−" : "+"}${num(Math.abs(dropM), 0)}`,
          unit: "m",
          hint:
            gradient != null
              ? t.hint.gradient(pct(Math.abs(gradient)), dropM >= 0)
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
        key: "roughness",
        label: t.metric.roughness,
        value: num(roughMean, 2),
        unit: "G RMS",
        hint: t.hint.roughness(pct(roughShare)),
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
        key: "impacts",
        label: t.metric.impacts,
        value: rate != null ? num(rate, 1) : String(impacts.length),
        unit: rate != null ? t.units.perKm : undefined,
        raw: rate ?? impacts.length,
        tie: rate != null ? 0.5 : 0,
        hint: t.hint.impacts(
          impacts.length,
          sev != null ? Math.round(sev) : null,
        ),
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
        key: "corners",
        label: t.metric.corners,
        value: rate != null ? num(rate, 0) : String(curves.length),
        unit: rate != null ? t.units.perKm : undefined,
        hint: t.hint.corners(curves.length, r != null ? Math.round(r) : null),
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
          key: "naturalSpeed",
          label: t.metric.naturalSpeed,
          value: num(natural, 1),
          unit: "km/h",
          hint: t.hint.naturalSpeed,
        });
    }

    // Flights: every time both wheels left the ground, lip or ledge — the
    // count the analysis page's résumé calls "Saltos" (by request,
    // 2026-09-14, the report's supplied layout).
    metrics.push({
      key: "jumps",
      label: t.metric.jumps,
      value: String(summary.jumpCount),
      hint: t.hint.jumps(
        summary.jumpCount > 0 ? num(summary.airtimeMs / 1000, 1) : null,
      ),
    });

    for (const s of [...roughSections]
      .map((s) => ({ s, rms: windowRms(tMs, g, s.startMs, s.endMs, 1) ?? 0 }))
      .sort((a, b) => b.rms - a.rms)
      .slice(0, HIGHLIGHTS))
      highlights.push({
        title: t.highlight.roughSection,
        timeMs: s.s.startMs,
        detail: `${num((s.s.endMs - s.s.startMs) / 1000, 1)} s · ${num(s.rms, 2)} G RMS`,
      });

    const bits: string[] = [];
    if (distanceKm != null) bits.push(`${num(distanceKm, 2)} km`);
    if (dropM != null)
      bits.push(t.headline.drop(num(Math.abs(dropM), 0), dropM >= 0));
    if (curves.length > 0) bits.push(t.headline.cornersCount(curves.length));
    if (impacts.length > 0) bits.push(t.headline.impactsCount(impacts.length));
    if (roughShare > 0) bits.push(t.headline.roughShare(pct(roughShare)));
    parts.push(bits.length > 0 ? `${bits.join(", ")}.` : t.headline.noEvents);

    return {
      title: "Trail",
      subtitle: t.subtitle.trail,
      headline: parts.join(" "),
      metrics,
      highlights:
        highlights.length > 0
          ? { heading: t.highlights.trail, items: highlights }
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
  key: ReportMetricKey;
  label: string;
  unit?: string;
  value: string;
  previous: string;
  /** This minus the other, in the metric's own unit, and the decimals the
   * figure is printed with. */
  diff: number;
  digits: number;
  /** Neutral where the metric has no better direction. */
  tone: "better" | "worse" | "tie" | "neutral";
}

/**
 * The metrics both reports carry a number for, each with its difference
 * and a verdict: better, worse, within the metric's own tie, or neutral
 * where neither direction is better. What the
 * Bike section can say once there IS another pass on the same trail — the
 * comparison its caveat asks for. The order is the current report's.
 *
 * The metrics are matched by key, so the two reports may have been built
 * in different languages; `locale` is the one the current report's
 * figures were printed in, which says which decimal separator to count
 * the decimals back from.
 */
export function compareReports(
  current: SessionReport,
  previous: SessionReport,
  locale: Locale,
): ReportComparisonRow[] {
  const decimal = locale === "pt" ? "," : ".";
  const all = (r: SessionReport) => [
    ...r.rider.metrics,
    ...r.bike.metrics,
    ...r.trail.metrics,
  ];
  const before = new Map(
    all(previous)
      .filter((m) => m.raw != null)
      .map((m) => [m.key, m]),
  );
  const rows: ReportComparisonRow[] = [];
  for (const m of all(current)) {
    const o = before.get(m.key);
    if (m.raw == null || o?.raw == null) continue;
    const diff = m.raw - o.raw;
    const tone =
      Math.abs(diff) <= (m.tie ?? 0)
        ? "tie"
        : !m.better
          ? "neutral"
          : (m.better === "lower" ? diff < 0 : diff > 0)
            ? "better"
            : "worse";
    rows.push({
      key: m.key,
      label: m.label,
      unit: m.unit,
      value: m.value,
      previous: o.value,
      diff,
      digits: (m.value.split(decimal)[1] ?? "").replace(/\D/g, "").length,
      tone,
    });
  }
  return rows;
}
