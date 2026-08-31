/**
 * Derived metrics over a normalized IMU session.
 *
 * The raw channels are never modified: everything here computes a new array
 * or a scalar on read. Adding a metric in the future is adding a function
 * here (and a filter entry in the chart) — the stored file does not change.
 */

import type { GpsChannels, ImuEvent, ImuSessionData } from "./format";
import { lowerBoundIndex, upperBoundIndex } from "./downsample";

/**
 * The G-force series: the file's own when it recorded one, otherwise
 * √(ax² + ay² + az²) computed from the accelerometer.
 */
export function gForceOf(session: ImuSessionData): Float32Array {
  const { ax, ay, az, gForce } = session.channels;
  if (gForce) return gForce;
  const out = new Float32Array(ax.length);
  for (let i = 0; i < ax.length; i++) {
    out[i] = Math.sqrt(ax[i] * ax[i] + ay[i] * ay[i] + az[i] * az[i]);
  }
  return out;
}

export interface ImuSessionSummary {
  durationMs: number;
  sampleRateHz: number;
  sampleCount: number;
  maxG: number;
  eventCount: number;
  curveCount: number;
  jumpCount: number;
  impactCount: number;
  brakingCount: number;
  /** Total airtime across every jump, ms. */
  airtimeMs: number;
  /** Total time inside rough sections, ms. */
  roughMs: number;
  /** Distance ridden in metres — the receiver's cumulative figure when the
   * file carries one, integrated speed otherwise. Null without GPS. */
  distanceM: number | null;
  /** Fastest fix of the session, km/h. Null without GPS. */
  maxSpeedKmh: number | null;
}

/** The numbers the session list and the report header show — computed once
 * at import (stored on the row) and again on the analysis page. */
export function sessionSummary(session: ImuSessionData): ImuSessionSummary {
  const g = gForceOf(session);
  let maxG = 0;
  for (let i = 0; i < g.length; i++) if (g[i] > maxG) maxG = g[i];

  let curveCount = 0;
  let jumpCount = 0;
  let impactCount = 0;
  let brakingCount = 0;
  let airtimeMs = 0;
  let roughMs = 0;
  for (const event of session.events) {
    if (event.kind === "curve") curveCount++;
    else if (event.kind === "jump") {
      jumpCount++;
      airtimeMs += event.airtimeMs;
    } else if (event.kind === "impact") impactCount++;
    else if (event.kind === "braking") brakingCount++;
    else if (event.kind === "rough_section")
      roughMs += event.endMs - event.startMs;
  }

  const gps = session.gps;
  let distanceM: number | null = null;
  let maxSpeedKmh: number | null = null;
  if (gps && gps.tMs.length > 0) {
    distanceM = gpsDistance(gps, gps.tMs[0], gps.tMs[gps.tMs.length - 1]);
    let maxMps = 0;
    for (let i = 0; i < gps.speedMps.length; i++) {
      if (gps.speedMps[i] > maxMps) maxMps = gps.speedMps[i];
    }
    maxSpeedKmh = maxMps * 3.6;
  }

  return {
    durationMs: session.durationMs,
    sampleRateHz: session.sampleRateHz,
    sampleCount: session.sampleCount,
    maxG,
    eventCount: session.events.length,
    curveCount,
    jumpCount,
    impactCount,
    brakingCount,
    airtimeMs,
    roughMs,
    distanceM,
    maxSpeedKmh,
  };
}

/**
 * Index of the sample nearest to a target time — the cursor's question.
 * Binary search over the (monotonic) timestamps; O(log n) per pointer move.
 */
export function nearestSampleIndex(
  tMs: Float64Array,
  targetMs: number,
): number {
  const n = tMs.length;
  if (n === 0) return -1;
  if (targetMs <= tMs[0]) return 0;
  if (targetMs >= tMs[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tMs[mid] <= targetMs) lo = mid;
    else hi = mid;
  }
  return targetMs - tMs[lo] <= tMs[hi] - targetMs ? lo : hi;
}

/** The events covering an instant: ranged events that span it, point events
 * (impact, jump) within a small window around it. */
export function eventsAt(
  events: ImuEvent[],
  timeMs: number,
  pointWindowMs = 150,
): ImuEvent[] {
  return events.filter((event) => {
    switch (event.kind) {
      case "curve":
      case "rough_section":
      case "braking":
        return timeMs >= event.startMs && timeMs <= event.endMs;
      case "jump":
      case "drop":
        return timeMs >= event.takeoffMs && timeMs <= event.landingMs;
      case "impact":
        return Math.abs(event.timeMs - timeMs) <= pointWindowMs;
    }
  });
}

/**
 * Largest |value| across [fromMs, toMs] — the "how hard" figure for an
 * event's window: lateral G through a curve, landing G after a jump.
 * Null when the window holds no samples.
 */
export function windowPeak(
  tMs: Float64Array,
  values: ArrayLike<number>,
  fromMs: number,
  toMs: number,
): number | null {
  if (tMs.length === 0 || toMs < tMs[0] || fromMs > tMs[tMs.length - 1])
    return null;
  const i0 = lowerBoundIndex(tMs, fromMs);
  const i1 = upperBoundIndex(tMs, toMs);
  if (i0 > i1 || i0 >= tMs.length) return null;
  let peak = 0;
  for (let i = i0; i <= i1; i++) {
    const a = Math.abs(values[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

/**
 * RMS deviation from `center` across the window — the vibration figure for
 * rough sections. Center 1 for G force, where gravity reads 1 G at rest, so
 * smooth ground scores near zero.
 */
export function windowRms(
  tMs: Float64Array,
  values: ArrayLike<number>,
  fromMs: number,
  toMs: number,
  center = 0,
): number | null {
  if (tMs.length === 0 || toMs < tMs[0] || fromMs > tMs[tMs.length - 1])
    return null;
  const i0 = lowerBoundIndex(tMs, fromMs);
  const i1 = upperBoundIndex(tMs, toMs);
  if (i0 > i1 || i0 >= tMs.length) return null;
  let sum = 0;
  for (let i = i0; i <= i1; i++) {
    const d = values[i] - center;
    sum += d * d;
  }
  return Math.sqrt(sum / (i1 - i0 + 1));
}

/**
 * ∫ dynamicG² dt over a window (trapezoidal), in G²·s, where dynamicG is the
 * G-force's deviation from 1 G. The energy behind the impact-severity index:
 * it combines peak, duration and shape in one figure, so a long shallow jolt
 * and a short sharp one stop reading the same.
 */
export function impactEnergy(
  tMs: Float64Array,
  g: ArrayLike<number>,
  fromMs: number,
  toMs: number,
): number | null {
  if (tMs.length === 0 || toMs < tMs[0] || fromMs > tMs[tMs.length - 1])
    return null;
  const i0 = lowerBoundIndex(tMs, fromMs);
  const i1 = upperBoundIndex(tMs, toMs);
  if (i0 >= i1) return null;
  let energy = 0;
  let prev = Math.abs(g[i0] - 1);
  for (let i = i0 + 1; i <= i1; i++) {
    const d = Math.abs(g[i] - 1);
    energy += ((prev * prev + d * d) / 2) * ((tMs[i] - tMs[i - 1]) / 1000);
    prev = d;
  }
  return energy;
}

/**
 * Provisional reference: the energy that reads as severity 100. Chosen so the
 * demo file's spread lands sensibly — its medium impact reads ~47, its hard
 * ones 62–86. A RELATIVE Bikit index to recalibrate against real recordings;
 * never an absolute mechanical force on the components.
 */
export const IMPACT_SEVERITY_REF_ENERGY = 1.4;

/** 0–100 severity index from an impact's energy: 100·√(E/ref), clamped. The
 * square root keeps the spread readable — energy grows with the square of G,
 * and a linear map crushed every medium impact into the bottom decile. */
export function impactSeverityIndex(energy: number): number {
  if (!Number.isFinite(energy) || energy <= 0) return 0;
  return Math.min(
    100,
    Math.round(100 * Math.sqrt(energy / IMPACT_SEVERITY_REF_ENERGY)),
  );
}

/**
 * Roughness: rolling RMS of dynamicG over a ~windowMs window, one value per
 * sample. Gravity and slow components drop out through the deviation-from-1G
 * baseline; spectral separation of fast vibration from single hits is future
 * work. Two-pointer sliding window, O(n).
 */
export function roughnessSeries(
  tMs: Float64Array,
  g: ArrayLike<number>,
  windowMs = 500,
): Float32Array {
  const n = tMs.length;
  const out = new Float32Array(n);
  const half = windowMs / 2;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && tMs[hi] <= tMs[i] + half) {
      const d = g[hi] - 1;
      sum += d * d;
      hi++;
    }
    while (tMs[lo] < tMs[i] - half) {
      const d = g[lo] - 1;
      sum -= d * d;
      lo++;
    }
    out[i] = Math.sqrt(Math.max(0, sum) / (hi - lo));
  }
  return out;
}

/**
 * Jerk: rate of change of the G force, in G/s. The signal is smoothed with a
 * short moving average before differencing, because differentiation
 * amplifies noise — raw sample-to-sample deltas at 100 Hz read as fuzz.
 * Central difference; the ends copy their neighbour.
 */
export function jerkSeries(
  tMs: Float64Array,
  g: ArrayLike<number>,
  smoothRadius = 2,
): Float32Array {
  const n = tMs.length;
  const out = new Float32Array(n);
  if (n < 3) return out;
  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - smoothRadius);
    const to = Math.min(n - 1, i + smoothRadius);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += g[j];
    smooth[i] = sum / (to - from + 1);
  }
  for (let i = 1; i < n - 1; i++) {
    const dt = (tMs[i + 1] - tMs[i - 1]) / 1000;
    out[i] = dt > 0 ? (smooth[i + 1] - smooth[i - 1]) / dt : 0;
  }
  out[0] = out[1];
  out[n - 1] = out[n - 2];
  return out;
}

/**
 * Estimated lean (roll) angle in degrees, via a complementary filter: the
 * gyro's roll rate integrated for the fast component, pulled toward the
 * accelerometer's atan2(ay, az) for the slow one, with time constant tauMs.
 * This is sensor fusion's cheapest honest form — NOT integration alone,
 * which drifts without bound.
 *
 * An ESTIMATE, uncalibrated: strong lateral acceleration mid-curve bends the
 * accelerometer's idea of "down" toward the bike's own vertical, and impacts
 * kick it around. Labeled (est.) everywhere it appears; validation against
 * real recordings is the price of removing that suffix.
 */
export function leanSeries(
  tMs: Float64Array,
  ay: ArrayLike<number>,
  az: ArrayLike<number>,
  gx: ArrayLike<number>,
  tauMs = 500,
): Float32Array {
  const n = tMs.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  const toDeg = 180 / Math.PI;
  let roll = Math.atan2(ay[0], az[0]) * toDeg;
  out[0] = roll;
  for (let i = 1; i < n; i++) {
    const dtMs = tMs[i] - tMs[i - 1];
    const accRoll = Math.atan2(ay[i], az[i]) * toDeg;
    const alpha = tauMs / (tauMs + dtMs);
    roll = alpha * (roll + gx[i] * (dtMs / 1000)) + (1 - alpha) * accRoll;
    out[i] = roll;
  }
  return out;
}

/**
 * A GPS channel resampled onto the IMU timeline — one value per IMU sample,
 * so the chart and the cursor treat it exactly like any other series.
 * Linear interpolation between fixes (10 Hz against the IMU's 100): the
 * receiver's own values are already smoothed, so the straight line between
 * two fixes is honest in a way a staircase is not. Clamped at the ends —
 * before the first fix and after the last, the nearest one holds.
 */
function resampleGpsSeries(
  tMs: Float64Array,
  gT: Float64Array,
  gV: ArrayLike<number>,
  scale: number,
): Float32Array {
  const n = tMs.length;
  const out = new Float32Array(n);
  const m = gT.length;
  if (m === 0) return out;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const t = tMs[i];
    while (hi < m && gT[hi] < t) hi++;
    let v: number;
    if (hi === 0) v = gV[0];
    else if (hi >= m) v = gV[m - 1];
    else {
      const t0 = gT[hi - 1];
      const t1 = gT[hi];
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      v = gV[hi - 1] + f * (gV[hi] - gV[hi - 1]);
    }
    out[i] = v * scale;
  }
  return out;
}

/** Ground speed on the IMU timeline, km/h. Recorded, not derived: the
 * receiver's Doppler speed resampled, never integrated from acceleration. */
export function speedKmhSeries(
  tMs: Float64Array,
  gps: GpsChannels,
): Float32Array {
  return resampleGpsSeries(tMs, gps.tMs, gps.speedMps, 3.6);
}

/** Altitude on the IMU timeline, metres above mean sea level. */
export function altitudeMSeries(
  tMs: Float64Array,
  gps: GpsChannels,
): Float32Array {
  return resampleGpsSeries(tMs, gps.tMs, gps.altitudeM, 1);
}

/** A GPS channel's value at one instant — linear between the surrounding
 * fixes, clamped to the track's ends. Null on an empty track. */
function gpsValueAt(
  gT: Float64Array,
  gV: ArrayLike<number>,
  timeMs: number,
): number | null {
  const m = gT.length;
  if (m === 0) return null;
  if (timeMs <= gT[0]) return gV[0];
  if (timeMs >= gT[m - 1]) return gV[m - 1];
  const hi = lowerBoundIndex(gT, timeMs);
  const lo = hi > 0 ? hi - 1 : 0;
  const t0 = gT[lo];
  const t1 = gT[hi];
  const f = t1 > t0 ? (timeMs - t0) / (t1 - t0) : 0;
  return gV[lo] + f * (gV[hi] - gV[lo]);
}

/** Ground speed at an instant, m/s — the takeoff speed question. */
export function gpsSpeedAt(gps: GpsChannels, timeMs: number): number | null {
  return gpsValueAt(gps.tMs, gps.speedMps, timeMs);
}

/**
 * Mean ground speed across a window, m/s — time-weighted (trapezoidal over
 * the fixes inside plus interpolated endpoints), so an uneven fix spacing
 * cannot bias the figure. Null when the window is empty or degenerate.
 */
export function gpsMeanSpeed(
  gps: GpsChannels,
  fromMs: number,
  toMs: number,
): number | null {
  if (toMs <= fromMs) return null;
  const gT = gps.tMs;
  const m = gT.length;
  if (m === 0) return null;
  const nodesT: number[] = [fromMs];
  const nodesV: number[] = [gpsValueAt(gT, gps.speedMps, fromMs)!];
  for (let i = 0; i < m; i++) {
    if (gT[i] > fromMs && gT[i] < toMs) {
      nodesT.push(gT[i]);
      nodesV.push(gps.speedMps[i]);
    }
  }
  nodesT.push(toMs);
  nodesV.push(gpsValueAt(gT, gps.speedMps, toMs)!);
  let area = 0;
  for (let i = 1; i < nodesT.length; i++) {
    area += ((nodesV[i - 1] + nodesV[i]) / 2) * (nodesT[i] - nodesT[i - 1]);
  }
  return area / (toMs - fromMs);
}

/**
 * Highest ground speed across a window, m/s — the peak beside the mean above.
 *
 * The fixes inside the window plus the interpolated ends, and not a scan of
 * the IMU timeline: the receiver samples at 1 Hz where the IMU runs at 100,
 * so resampling first would only interpolate the same fixes into ninety-nine
 * copies of themselves and could never surface a value the track does not
 * hold. The ends matter because a short window may enclose no fix at all.
 */
export function gpsPeakSpeed(
  gps: GpsChannels,
  fromMs: number,
  toMs: number,
): number | null {
  if (toMs < fromMs) return null;
  const gT = gps.tMs;
  if (gT.length === 0) return null;
  let peak = Math.max(
    gpsValueAt(gT, gps.speedMps, fromMs)!,
    gpsValueAt(gT, gps.speedMps, toMs)!,
  );
  for (let i = 0; i < gT.length; i++) {
    if (gT[i] > fromMs && gT[i] < toMs && gps.speedMps[i] > peak)
      peak = gps.speedMps[i];
  }
  return Number.isFinite(peak) ? peak : null;
}

/**
 * Distance travelled across a window, metres. The receiver's own cumulative
 * distance when the file carries it (interpolated at both ends); otherwise
 * the mean speed times the duration — same integral, one step removed.
 */
export function gpsDistance(
  gps: GpsChannels,
  fromMs: number,
  toMs: number,
): number | null {
  if (toMs <= fromMs) return null;
  const d0 = gpsValueAt(gps.tMs, gps.distanceM, fromMs);
  const d1 = gpsValueAt(gps.tMs, gps.distanceM, toMs);
  if (d0 != null && d1 != null && Number.isFinite(d0) && Number.isFinite(d1)) {
    return Math.max(0, d1 - d0);
  }
  const mean = gpsMeanSpeed(gps, fromMs, toMs);
  return mean != null ? mean * ((toMs - fromMs) / 1000) : null;
}

/**
 * Mean magnitude of a channel across [fromMs, toMs] — the steady figure for
 * an event's window where the peak overstates: a curve's yaw rate holds for
 * seconds, and the radius comes from what it held, not what it spiked.
 */
export function windowMeanAbs(
  tMs: Float64Array,
  values: ArrayLike<number>,
  fromMs: number,
  toMs: number,
): number | null {
  if (tMs.length === 0 || toMs < tMs[0] || fromMs > tMs[tMs.length - 1])
    return null;
  const i0 = lowerBoundIndex(tMs, fromMs);
  const i1 = upperBoundIndex(tMs, toMs);
  if (i0 > i1 || i0 >= tMs.length) return null;
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += Math.abs(values[i]);
  return sum / (i1 - i0 + 1);
}

/**
 * Where the bike was at an instant — the map needle's question. Linear
 * interpolation between the two GPS fixes around the time; at 10 Hz and
 * riding speeds the fixes are under a metre apart, so the straight segment
 * is well inside the receiver's own accuracy. Clamped to the track's ends.
 */
export function gpsPositionAt(
  gps: GpsChannels,
  timeMs: number,
): { latDeg: number; lonDeg: number } | null {
  const gT = gps.tMs;
  const m = gT.length;
  if (m === 0) return null;
  if (timeMs <= gT[0]) return { latDeg: gps.latDeg[0], lonDeg: gps.lonDeg[0] };
  if (timeMs >= gT[m - 1])
    return { latDeg: gps.latDeg[m - 1], lonDeg: gps.lonDeg[m - 1] };
  const hi = lowerBoundIndex(gT, timeMs);
  const lo = gT[hi] === timeMs ? hi : hi - 1;
  const next = Math.min(m - 1, lo + 1);
  const t0 = gT[lo];
  const t1 = gT[next];
  const f = t1 > t0 ? (timeMs - t0) / (t1 - t0) : 0;
  return {
    latDeg: gps.latDeg[lo] + f * (gps.latDeg[next] - gps.latDeg[lo]),
    lonDeg: gps.lonDeg[lo] + f * (gps.lonDeg[next] - gps.lonDeg[lo]),
  };
}

/**
 * Estimated pitch angle in degrees — nose up positive — via the same
 * complementary filter as leanSeries, on the other axis: the gyro's pitch
 * rate for the fast component, pulled toward the accelerometer's
 * atan2(-ax, √(ay²+az²)) for the slow one. The same caveats too: braking
 * and acceleration bend the accelerometer's idea of "down" forward and
 * back — which is precisely what the pitch axis measures — so this is an
 * ESTIMATE, labelled (est.) wherever it appears.
 */
export function pitchSeries(
  tMs: Float64Array,
  ax: ArrayLike<number>,
  ay: ArrayLike<number>,
  az: ArrayLike<number>,
  gy: ArrayLike<number>,
  tauMs = 500,
): Float32Array {
  const n = tMs.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  const toDeg = 180 / Math.PI;
  const accPitchAt = (i: number) =>
    Math.atan2(-ax[i], Math.sqrt(ay[i] * ay[i] + az[i] * az[i])) * toDeg;
  let pitch = accPitchAt(0);
  out[0] = pitch;
  for (let i = 1; i < n; i++) {
    const dtMs = tMs[i] - tMs[i - 1];
    const alpha = tauMs / (tauMs + dtMs);
    pitch =
      alpha * (pitch + gy[i] * (dtMs / 1000)) + (1 - alpha) * accPitchAt(i);
    out[i] = pitch;
  }
  return out;
}

/** mm:ss.mmm for the details panel, mm:ss for axes. */
export function formatSessionTime(ms: number, withMillis = false): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (!withMillis) return base;
  const millis = Math.floor(clamped % 1000);
  return `${base}.${String(millis).padStart(3, "0")}`;
}
