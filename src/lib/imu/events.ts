/**
 * Event detection on a recording that carries none — every .BKT, since the
 * logger records and does not interpret. Run once on read, after the words
 * are realigned, so every session, old or new, gets the same events from
 * the same rules without being imported again.
 *
 * Four kinds here, all read off the G-force norm alone — so the mounting,
 * the calibration and which way is forward do not matter, and a file with
 * no orientation at all is detected exactly like one with it. (Curves and
 * braking, which need the bike's frame, are further down.)
 *
 * JUMP. In the air the sensor is in free fall and the norm collapses to
 * ~0 g, whatever the bike's attitude. A stretch under FALL_G lasting at
 * least MIN_AIRTIME_MS, with a landing after it (a peak over LANDING_G in
 * the LANDING_WINDOW_MS that follow), is a jump: takeoff where the norm
 * fell, landing where it came back. Short interruptions inside the fall —
 * a mid-air jolt, a wheel touching — are bridged when under BRIDGE_MS.
 * Every flight is a "jump": telling drops from jumps by the pre-load
 * before takeoff was tried on 2026-09-09 and, on R0050, labelled real
 * jumps as drops — the rider's word against the heuristic, and the rider
 * won. R0050 (a downhill run) has eighteen flights, 0.13 to 0.49 s.
 *
 * ROUGH SECTION. The 0.5 s RMS of the norm about 1 g — roughnessSeries,
 * the same figure the page plots — above a threshold for ROUGH_MIN_MS,
 * gaps under ROUGH_BRIDGE_MS bridged, while moving. A rock garden, a
 * cobbled stretch, a washboard.
 *
 * IMPACT. A peak of the norm above a threshold, at most one per
 * MERGE_WINDOW_MS (the highest wins), and not a landing — peaks inside a
 * jump's landing window belong to the jump and are its "Aterragem". The
 * threshold is the larger of IMPACT_MIN_G and IMPACT_P99_FACTOR × the
 * session's own 99th percentile: an absolute floor so a road ride's rare
 * 4 g hit counts, and a relative one so a downhill run does not report a
 * hundred impacts where the terrain simply is 5 g (R0050: p99 6.2 g →
 * threshold 9.3 g, ~ten impacts).
 *
 * Severity labels are the three the page already knows from the exporter's
 * JSON — light / medium / hard — by peak G. Confidence grows with how far
 * past the threshold an event sits, so the filters upstream can be strict.
 */

import type { ImuEvent, ImuSessionData } from "./format";
import { gForceOf, gpsSpeedAt, roughnessSeries } from "./derive";

/** In the air: the norm below this. Rest is 1 g; a hard compression is 3. */
const FALL_G = 0.4;
/** A dip shorter than this is a bump's rebound, not flight. */
const MIN_AIRTIME_MS = 120;
/** Longer than this is not a bicycle in the air. */
const MAX_AIRTIME_MS = 2500;
/** Interruptions inside a fall bridged when shorter than this. */
const BRIDGE_MS = 40;
/** A landing must show a peak at least this high… */
const LANDING_G = 1.8;
/** …within this long after the norm comes back. */
const LANDING_WINDOW_MS = 400;

/** Rough ground: the 0.5 s RMS of the norm about 1 g, sustained. The
 * threshold is the larger of an absolute floor — cobbles on a road ride —
 * and ROUGH_MEDIAN_FACTOR × the session's own median roughness, so on a
 * trail that is 1.2 g everywhere only what stands out from it is a
 * section (R0050: median 1.24 g → threshold 1.86 g). */
const ROUGH_MIN_G = 0.6;
const ROUGH_MEDIAN_FACTOR = 1.5;
const ROUGH_MIN_MS = 2000;
const ROUGH_BRIDGE_MS = 1000;
const ROUGH_MIN_SPEED_MPS = 1.5;

const IMPACT_MIN_G = 4;
const IMPACT_P99_FACTOR = 1.5;
/** Two peaks closer than this are one impact; the highest is kept. */
const MERGE_WINDOW_MS = 500;
/** Peaks this close to a jump's landing are the landing. */
const LANDING_EXCLUSION_MS = 400;

export interface ImuEventDetection {
  events: ImuEvent[];
  /** The impact threshold this session was judged by, g. */
  impactThresholdG: number;
  /** The roughness (0.5 s RMS about 1 g) a section had to sustain, g. */
  roughThresholdG: number;
}

export function detectImuEvents(session: ImuSessionData): ImuEventDetection {
  const { tMs } = session.channels;
  const n = tMs.length;
  const g = gForceOf(session);
  if (n < 2)
    return {
      events: [],
      impactThresholdG: IMPACT_MIN_G,
      roughThresholdG: ROUGH_MIN_G,
    };

  // The 0.5 s RMS about 1 g: the rough-section signal.
  const rough = roughnessSeries(tMs, g);

  // --- Jumps -------------------------------------------------------------
  // Runs of samples under FALL_G, then bridged, then filtered by length and
  // by having a landing.
  const falls: { from: number; to: number }[] = [];
  let i = 0;
  while (i < n) {
    if (g[i] >= FALL_G) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && g[j] < FALL_G) j++;
    const last = falls[falls.length - 1];
    if (last && tMs[i] - tMs[last.to] <= BRIDGE_MS) last.to = j - 1;
    else falls.push({ from: i, to: j - 1 });
    i = j;
  }

  const jumps: Extract<ImuEvent, { kind: "jump" }>[] = [];
  for (const fall of falls) {
    const takeoffMs = tMs[fall.from];
    const landingMs = fall.to + 1 < n ? tMs[fall.to + 1] : tMs[fall.to];
    const airtimeMs = landingMs - takeoffMs;
    if (airtimeMs < MIN_AIRTIME_MS || airtimeMs > MAX_AIRTIME_MS) continue;
    let landing = 0;
    for (
      let k = fall.to + 1;
      k < n && tMs[k] - landingMs <= LANDING_WINDOW_MS;
      k++
    )
      if (g[k] > landing) landing = g[k];
    if (landing < LANDING_G) continue;
    // Half a vote for being a plausible fall at all, the rest for airtime
    // past the minimum and a landing past the minimum.
    const confidence =
      0.5 +
      0.25 * Math.min(1, (airtimeMs - MIN_AIRTIME_MS) / 280) +
      0.25 * Math.min(1, (landing - LANDING_G) / 3);
    jumps.push({
      kind: "jump",
      takeoffMs,
      landingMs,
      airtimeMs,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  // --- Rough sections ----------------------------------------------------
  const roughSorted = Float32Array.from(rough).sort();
  const roughMedian = roughSorted[Math.floor(0.5 * (n - 1))];
  const roughThreshold = Math.max(
    ROUGH_MIN_G,
    ROUGH_MEDIAN_FACTOR * roughMedian,
  );
  const sections: Extract<ImuEvent, { kind: "rough_section" }>[] = [];
  i = 0;
  while (i < n) {
    if (rough[i] < roughThreshold) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && rough[j] >= roughThreshold) j++;
    const last = sections[sections.length - 1];
    if (last && tMs[i] - last.endMs <= ROUGH_BRIDGE_MS) last.endMs = tMs[j - 1];
    else
      sections.push({
        kind: "rough_section",
        startMs: tMs[i],
        endMs: tMs[j - 1],
        confidence: 0,
      });
    i = j;
  }
  const roughSections = sections.filter((s) => {
    if (s.endMs - s.startMs < ROUGH_MIN_MS) return false;
    if (session.gps) {
      const v0 = gpsSpeedAt(session.gps, s.startMs);
      const v1 = gpsSpeedAt(session.gps, s.endMs);
      if (v0 != null && v1 != null && (v0 + v1) / 2 < ROUGH_MIN_SPEED_MPS)
        return false;
    }
    // How far above the threshold the section sits, and how long it lasts.
    let sum = 0;
    let count = 0;
    for (let k = 0; k < n; k++)
      if (tMs[k] >= s.startMs && tMs[k] <= s.endMs) {
        sum += rough[k];
        count++;
      }
    const mean = count ? sum / count : roughThreshold;
    s.confidence =
      Math.round(
        (0.5 +
          0.25 * Math.min(1, (mean / roughThreshold - 1) / 0.5) +
          0.25 * Math.min(1, (s.endMs - s.startMs - ROUGH_MIN_MS) / 6000)) *
          100,
      ) / 100;
    return true;
  });

  // --- Impacts -----------------------------------------------------------
  const sorted = Float32Array.from(g).sort();
  const p99 = sorted[Math.floor(0.99 * (n - 1))];
  const threshold = Math.max(IMPACT_MIN_G, IMPACT_P99_FACTOR * p99);

  const isLanding = (ms: number) =>
    jumps.some(
      (j) => ms >= j.takeoffMs && ms <= j.landingMs + LANDING_EXCLUSION_MS,
    );

  const impacts: Extract<ImuEvent, { kind: "impact" }>[] = [];
  i = 0;
  while (i < n) {
    if (g[i] < threshold) {
      i++;
      continue;
    }
    // Everything above threshold within the merge window is one impact.
    let best = i;
    let j = i;
    while (j < n && tMs[j] - tMs[i] <= MERGE_WINDOW_MS) {
      if (g[j] > g[best]) best = j;
      j++;
    }
    if (!isLanding(tMs[best])) {
      const peak = g[best];
      impacts.push({
        kind: "impact",
        timeMs: tMs[best],
        severity: peak >= 9 ? "hard" : peak >= 6 ? "medium" : "light",
        confidence:
          Math.round(Math.min(1, 0.6 + (peak - threshold) / 10) * 100) / 100,
      });
    }
    i = j;
  }

  const events: ImuEvent[] = [...jumps, ...impacts, ...roughSections].sort(
    (a, b) => startOf(a) - startOf(b),
  );
  return {
    events,
    impactThresholdG: threshold,
    roughThresholdG: roughThreshold,
  };
}

// ---------------------------------------------------------------------------
// Events that need the bike's frame: curves and braking. Run AFTER
// alignment (alignSession), on the page and for the import summary alike.

/** A yaw rate this steady is a corner, not a wobble… */
const CURVE_MIN_DPS = 12;
/** …when it lasts this long… */
const CURVE_MIN_MS = 600;
/** …and peaks at least this high (30° in a second and a half). */
const CURVE_PEAK_DPS = 20;
/** Same-direction stretches closer than this are one corner. */
const CURVE_BRIDGE_MS = 300;
/** Smoothing for the yaw rate. */
const CURVE_SMOOTH_MS = 300;
/** Turning the bars while walking the bike is not a corner. */
const CURVE_MIN_SPEED_MPS = 1.5;

/** Braking: the dynamic forward acceleration under this… */
const BRAKE_MPS2 = -2.0;
/** …for this long, with a trough at least this deep. */
const BRAKE_MIN_MS = 500;
const BRAKE_PEAK_MPS2 = -2.5;
const BRAKE_BRIDGE_MS = 300;
/** Fast smoothing, and the slow trend the fast one is read against: on a
 * descent gravity leans on the forward axis for minutes at a time (−1.4
 * m/s² at 15 %, R0050), and it is the departure from that trend, not the
 * trend, that is a brake. The trend window is long so that a brake of a
 * few seconds barely moves it — at 8 s a 3 s brake pulled the trend a
 * third of the way down and hid itself. */
const BRAKE_SMOOTH_MS = 500;
const BRAKE_TREND_MS = 20_000;
/** With GPS, the speed has to have dropped by this much across the event,
 * read half a second past its end (the receiver lags). */
const BRAKE_GPS_DROP_MPS = 0.5;
/** A jump's landing throws the forward axis about; nothing there is braking. */
const BRAKE_JUMP_MARGIN_MS = 400;

/** Centred moving mean over `windowMs`, via a prefix sum. */
function movingMean(
  tMs: Float64Array,
  values: ArrayLike<number>,
  rateHz: number,
  windowMs: number,
): Float32Array {
  const n = tMs.length;
  const half = Math.max(1, Math.round((rateHz * windowMs) / 2000));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

/** Contiguous runs where `test(i)` holds, bridged across gaps under
 * `bridgeMs` when `same(i, j)` says the two sides belong together. */
function runs(
  tMs: Float64Array,
  test: (i: number) => boolean,
  bridgeMs: number,
  same: (a: number, b: number) => boolean = () => true,
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const n = tMs.length;
  let i = 0;
  while (i < n) {
    if (!test(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && test(j)) j++;
    const last = out[out.length - 1];
    if (last && tMs[i] - tMs[last.to] <= bridgeMs && same(last.to, i))
      last.to = j - 1;
    else out.push({ from: i, to: j - 1 });
    i = j;
  }
  return out;
}

/**
 * Curves from the yaw gyro and braking from the forward accelerometer, in
 * the bike's frame. Curves need only "up" (gravity on +Z: `aligned`);
 * braking needs "forward" too (`mounting.applied`). Each is skipped when
 * its frame is not there, and when the file already brought events of that
 * kind — the exporter's JSON did, and its own are kept.
 *
 * CURVE. The smoothed yaw rate past CURVE_MIN_DPS, one sign, for at least
 * CURVE_MIN_MS, peaking at CURVE_PEAK_DPS, while moving. +Z is up and the
 * frame right-handed, so a positive rate is a turn to the LEFT (R0050: 112
 * of 123 GPS turns agree with the sign).
 *
 * BRAKING. The forward acceleration smoothed over half a second, read
 * against its own eight-second trend so a descent's constant gravity
 * component does not read as a brake, below BRAKE_MPS2 for BRAKE_MIN_MS
 * with a trough under BRAKE_PEAK_MPS2; not inside a jump's landing; and,
 * when there is GPS, confirmed by the speed actually dropping.
 */
export function detectBikeFrameEvents(session: ImuSessionData): ImuEvent[] {
  const { tMs, ax, gz } = session.channels;
  const n = tMs.length;
  const rate = session.sampleRateHz;
  if (!session.aligned || n < 2 || !(rate > 0)) return [];
  const gps = session.gps;
  const has = (kind: ImuEvent["kind"]) =>
    session.events.some((e) => e.kind === kind);
  const out: ImuEvent[] = [];

  if (!has("curve")) {
    const yaw = movingMean(tMs, gz, rate, CURVE_SMOOTH_MS);
    const sign = (i: number) => Math.sign(yaw[i]);
    for (const r of runs(
      tMs,
      (i) => Math.abs(yaw[i]) >= CURVE_MIN_DPS,
      CURVE_BRIDGE_MS,
      (a, b) => sign(a) === sign(b),
    )) {
      const startMs = tMs[r.from];
      const endMs = tMs[r.to];
      const durationMs = endMs - startMs;
      if (durationMs < CURVE_MIN_MS) continue;
      let peak = 0;
      let sum = 0;
      for (let i = r.from; i <= r.to; i++) {
        sum += yaw[i];
        if (Math.abs(yaw[i]) > peak) peak = Math.abs(yaw[i]);
      }
      if (peak < CURVE_PEAK_DPS) continue;
      if (gps) {
        const v0 = gpsSpeedAt(gps, startMs);
        const v1 = gpsSpeedAt(gps, endMs);
        if (v0 != null && v1 != null && (v0 + v1) / 2 < CURVE_MIN_SPEED_MPS)
          continue;
      }
      const confidence =
        0.5 +
        0.25 * Math.min(1, (peak - CURVE_PEAK_DPS) / 40) +
        0.25 * Math.min(1, (durationMs - CURVE_MIN_MS) / 1400);
      out.push({
        kind: "curve",
        direction: sum > 0 ? "left" : "right",
        startMs,
        endMs,
        confidence: Math.round(confidence * 100) / 100,
      });
    }
  }

  if (!has("braking") && session.mounting?.applied) {
    const fast = movingMean(tMs, ax, rate, BRAKE_SMOOTH_MS);
    const trend = movingMean(tMs, ax, rate, BRAKE_TREND_MS);
    const dyn = new Float32Array(n);
    for (let i = 0; i < n; i++) dyn[i] = (fast[i] - trend[i]) * 9.81;
    const jumps = session.events.filter(
      (e) => e.kind === "jump" || e.kind === "drop",
    ) as Extract<ImuEvent, { kind: "jump" }>[];
    for (const r of runs(tMs, (i) => dyn[i] <= BRAKE_MPS2, BRAKE_BRIDGE_MS)) {
      const startMs = tMs[r.from];
      const endMs = tMs[r.to];
      const durationMs = endMs - startMs;
      if (durationMs < BRAKE_MIN_MS) continue;
      let trough = 0;
      for (let i = r.from; i <= r.to; i++) if (dyn[i] < trough) trough = dyn[i];
      if (trough > BRAKE_PEAK_MPS2) continue;
      if (
        jumps.some(
          (j) =>
            startMs <= j.landingMs + BRAKE_JUMP_MARGIN_MS &&
            endMs >= j.takeoffMs - BRAKE_JUMP_MARGIN_MS,
        )
      )
        continue;
      if (gps) {
        const v0 = gpsSpeedAt(gps, startMs);
        const v1 = gpsSpeedAt(gps, endMs + 500);
        if (v0 != null && v1 != null && v0 - v1 < BRAKE_GPS_DROP_MPS) continue;
      }
      const confidence =
        0.5 +
        0.25 * Math.min(1, (BRAKE_PEAK_MPS2 - trough) / 3) +
        0.25 * Math.min(1, (durationMs - BRAKE_MIN_MS) / 1500);
      out.push({
        kind: "braking",
        startMs,
        endMs,
        confidence: Math.round(confidence * 100) / 100,
      });
    }
  }

  return out;
}

/** The session with the bike-frame events added to what it already has,
 * in time order; the same session back when there is nothing to add. */
export function withBikeFrameEvents(session: ImuSessionData): ImuSessionData {
  const extra = detectBikeFrameEvents(session);
  if (extra.length === 0) return session;
  return {
    ...session,
    events: [...session.events, ...extra].sort(
      (a, b) => startOf(a) - startOf(b),
    ),
  };
}

function startOf(event: ImuEvent): number {
  switch (event.kind) {
    case "jump":
    case "drop":
      return event.takeoffMs;
    case "impact":
      return event.timeMs;
    default:
      return event.startMs;
  }
}
