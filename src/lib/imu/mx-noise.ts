import { vibrationSeries } from "@/lib/imu/derive";
import type { ImuSessionData } from "@/lib/imu/format";

/**
 * MX — engine noise suppression (by request, 2026-10-30). Three parts, none of
 * which touches the original channels, which stay the analysis of record:
 *
 * 1. A SIGNAL FOR EVENTS (eventSignal): the channels with the periodic noise
 *    taken out and the highest frequencies with it.
 * 2. ADAPTIVE SUPPRESSION (suppressPeriodicNoise): short spectra of the channel.
 *    A narrow peak standing far above its neighbours, and still there in the
 *    frames around it, is mechanical noise and is attenuated there, wherever
 *    the revs have moved it. Not a fixed band: R0037's dominant tone wanders
 *    90-200 Hz, and that band also carries what an impact is made of. A frame
 *    with a transient in it is left alone.
 * 3. CLASSIFICATION (classifyMxEvents): the filtered force, the gyroscope and
 *    the High-G shocks together, each candidate with a kind and a confidence.
 *    It sorts what the signals show; it does not invent, and what shows no
 *    evidence of anything else is called vibration.
 *
 * Measured on R0037 (the sensor on top of a motocross fork) against two bicycle
 * rides: three narrow peaks hold 74 % of the vertical axis's energy there and
 * 1-2 % on the bicycles. The thresholds below are first values from those files,
 * with no recorded truth to check them against yet.
 */

const FRAME = 256;
const HOP = 64;
/** Below this, Hz, is the bike and the ground, not the engine. */
const MIN_TONE_HZ = 40;
/** A tone stands this many times above the median of its neighbourhood. */
const TONE_PROMINENCE = 8;
const NEIGHBOURHOOD_BINS = 12;
/** …and returns within this many bins in this many of the frames around it. */
const TRACK_BINS = 2;
const TRACK_REACH = 3;
const TRACK_MIN_FRAMES = 3;
/** How much of a tone is left, and how wide it is taken out, in bins. */
const TONE_GAIN = 0.1;
const TONE_HALF_WIDTH = 2;
/** A frame whose peak stands this far over its RMS holds a transient. */
const TRANSIENT_CREST = 4.5;

/** In-place radix-2 FFT; `inverse` without the 1/n. */
function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 0, j = 0; i < n; i++) {
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j & m) {
      j ^= m;
      m >>= 1;
    }
    j |= m;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = ((inverse ? 2 : -2) * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const c = Math.cos(step * k);
        const s = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

const HANN = Float64Array.from(
  { length: FRAME },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME),
);

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1] ?? 0;
}

/** The channel with its persistent narrow peaks attenuated. Same length. */
export function suppressPeriodicNoise(
  values: ArrayLike<number>,
  rateHz: number,
): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  if (n < FRAME) {
    for (let i = 0; i < n; i++) out[i] = values[i];
    return out;
  }
  const frames = Math.floor((n - FRAME) / HOP) + 1;
  const half = FRAME / 2;
  const firstBin = Math.ceil((MIN_TONE_HZ * FRAME) / rateHz);
  const spectra: { re: Float64Array; im: Float64Array; transient: boolean }[] =
    [];
  const peaks: number[][] = [];
  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    const re = new Float64Array(FRAME);
    const im = new Float64Array(FRAME);
    let mean = 0;
    for (let i = 0; i < FRAME; i++) mean += values[start + i];
    mean /= FRAME;
    let energy = 0;
    let top = 0;
    for (let i = 0; i < FRAME; i++) {
      const v = values[start + i] - mean;
      energy += v * v;
      top = Math.max(top, Math.abs(v));
      re[i] = values[start + i] * HANN[i];
    }
    fft(re, im);
    const power = new Float64Array(half);
    for (let k = 0; k < half; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    const found: number[] = [];
    for (let k = firstBin; k < half - 1; k++) {
      if (power[k] < power[k - 1] || power[k] < power[k + 1]) continue;
      const near: number[] = [];
      const from = Math.max(1, k - NEIGHBOURHOOD_BINS);
      const to = Math.min(half - 1, k + NEIGHBOURHOOD_BINS);
      for (let q = from; q <= to; q++)
        if (Math.abs(q - k) > TONE_HALF_WIDTH) near.push(power[q]);
      if (power[k] >= TONE_PROMINENCE * median(near)) found.push(k);
    }
    peaks.push(found);
    const rms = Math.sqrt(energy / FRAME);
    spectra.push({ re, im, transient: rms > 0 && top / rms > TRANSIENT_CREST });
  }
  const norm = new Float64Array(n);
  for (let f = 0; f < frames; f++) {
    const { re, im, transient } = spectra[f];
    if (!transient) {
      for (const k of peaks[f]) {
        let seen = 0;
        for (
          let g = Math.max(0, f - TRACK_REACH);
          g <= Math.min(frames - 1, f + TRACK_REACH);
          g++
        )
          if (g !== f && peaks[g].some((p) => Math.abs(p - k) <= TRACK_BINS))
            seen++;
        if (seen < TRACK_MIN_FRAMES) continue;
        for (let d = -TONE_HALF_WIDTH; d <= TONE_HALF_WIDTH; d++) {
          const q = k + d;
          if (q <= 0 || q >= half) continue;
          re[q] *= TONE_GAIN;
          im[q] *= TONE_GAIN;
          re[FRAME - q] *= TONE_GAIN;
          im[FRAME - q] *= TONE_GAIN;
        }
      }
    }
    fft(re, im, true);
    const start = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      out[start + i] += (re[i] / FRAME) * HANN[i];
      norm[start + i] += HANN[i] * HANN[i];
    }
  }
  for (let i = 0; i < n; i++)
    out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : values[i];
  return out;
}

/** Zero-phase low-pass: a one-pole filter run forwards and back, twice. */
export function lowPass(
  values: ArrayLike<number>,
  rateHz: number,
  cutoffHz: number,
): Float32Array {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / rateHz);
  const out = Float32Array.from(values as ArrayLike<number>);
  const n = out.length;
  if (n === 0) return out;
  for (let pass = 0; pass < 2; pass++) {
    let y = out[0];
    for (let i = 0; i < n; i++) out[i] = y = y * a + (1 - a) * out[i];
    y = out[n - 1];
    for (let i = n - 1; i >= 0; i--) out[i] = y = y * a + (1 - a) * out[i];
  }
  return out;
}

/** Up to here, Hz, the events' signal keeps: R0050, a downhill run, loses no
 * jump to it. */
const EVENT_CUTOFF_HZ = 60;

export interface MxEventSignal {
  ax: Float32Array;
  ay: Float32Array;
  az: Float32Array;
  /** Their norm, g. */
  force: Float32Array;
}

/** The signal events are read from. The analysis keeps the original. */
export function eventSignal(
  channels: ImuSessionData["channels"],
  rateHz: number,
): MxEventSignal {
  const clean = (v: ArrayLike<number>) =>
    lowPass(suppressPeriodicNoise(v, rateHz), rateHz, EVENT_CUTOFF_HZ);
  const ax = clean(channels.ax);
  const ay = clean(channels.ay);
  const az = clean(channels.az);
  const force = new Float32Array(ax.length);
  for (let i = 0; i < force.length; i++)
    force[i] = Math.hypot(ax[i], ay[i], az[i]);
  return { ax, ay, az, force };
}

/**
 * The session with the filter applied to its acceleration, for a session whose
 * rider chose it (engine_filter, off by default: it never runs by itself, so
 * no bicycle's reading can change). The file is untouched; the events keep what
 * the original found, and the warning keeps the original's vibration.
 */
export function withEngineFilter(session: ImuSessionData): ImuSessionData {
  const c = session.channels;
  if (c.tMs.length < FRAME || session.durationMs <= 0) return session;
  const rate = (c.tMs.length / session.durationMs) * 1000;
  const { ax, ay, az } = eventSignal(c, rate);
  return {
    ...session,
    unfilteredVibrationG: vibrationSeries(c.tMs, c.ax, c.ay, c.az),
    channels: { ...c, ax, ay, az },
  };
}

export type MxEventKind = "landing" | "impact" | "chassis" | "vibration";

export interface MxEvent {
  kind: MxEventKind;
  timeMs: number;
  /** 0-1: how many of the signals agree. Not yet checked against a recorded
   * truth, so it ranks events and does not promise a percentage. */
  confidence: number;
  peakG: number;
  gyroDps: number;
  highG: number | null;
  airMs: number;
}

const CANDIDATE_MIN_G = 3.5;
const CANDIDATE_MERGE_MS = 400;
const HIGH_G_MATCH_MS = 200;
const GYRO_WINDOW_MS = 200;
const GYRO_CUTOFF_HZ = 30;
/** A swing of the frame, °/s, that a road bump alone does not make. */
const CHASSIS_DPS = 120;
/** Flight before a landing: the force under this, g, for at least this long,
 * in the time looked back over. */
const AIR_G = 0.5;
const AIR_MIN_MS = 150;
const AIR_LOOK_MS = 1000;

/** Sorts a recording's candidates into the four kinds, each with a confidence. */
export function classifyMxEvents(session: ImuSessionData): MxEvent[] {
  const c = session.channels;
  const n = c.tMs.length;
  if (n < FRAME || session.durationMs <= 0) return [];
  const rate = (n / session.durationMs) * 1000;
  const { force } = eventSignal(c, rate);
  const gyro = [c.gx, c.gy, c.gz].map((g) => lowPass(g, rate, GYRO_CUTOFF_HZ));
  const indexAt = (ms: number) => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c.tMs[mid] < ms) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // The filtered force's peaks, one per merge window, and every shock the
  // High-G sensor recorded, which needs no threshold of ours.
  const candidates: number[] = [];
  for (const hit of session.highG ?? []) candidates.push(hit.timeMs);
  let best = -1;
  let bestAt = 0;
  for (let i = 0; i < n; i++) {
    if (force[i] < CANDIDATE_MIN_G) continue;
    if (best >= 0 && c.tMs[i] - bestAt > CANDIDATE_MERGE_MS) {
      candidates.push(bestAt);
      best = -1;
    }
    if (force[i] > best) {
      best = force[i];
      bestAt = c.tMs[i];
    }
  }
  if (best >= 0) candidates.push(bestAt);
  candidates.sort((a, b) => a - b);

  const events: MxEvent[] = [];
  for (const t of candidates) {
    const last = events[events.length - 1];
    if (last && t - last.timeMs < CANDIDATE_MERGE_MS) continue;
    const i0 = indexAt(t - GYRO_WINDOW_MS);
    const i1 = indexAt(t + GYRO_WINDOW_MS);
    let peakG = 0;
    let gyroDps = 0;
    for (let i = i0; i <= i1; i++) {
      peakG = Math.max(peakG, force[i]);
      gyroDps = Math.max(
        gyroDps,
        Math.hypot(gyro[0][i], gyro[1][i], gyro[2][i]),
      );
    }
    let highG: number | null = null;
    for (const hit of session.highG ?? [])
      if (Math.abs(hit.timeMs - t) <= HIGH_G_MATCH_MS)
        highG = Math.max(highG ?? 0, hit.peakG);
    let airMs = 0;
    let run = 0;
    for (let i = indexAt(t - AIR_LOOK_MS); i < i0; i++) {
      run = force[i] < AIR_G ? run + 1000 / rate : 0;
      airMs = Math.max(airMs, run);
    }
    const flew = airMs >= AIR_MIN_MS;
    const swung = gyroDps >= CHASSIS_DPS;
    let kind: MxEventKind;
    let confidence: number;
    if (flew && (highG != null || peakG >= CANDIDATE_MIN_G)) {
      kind = "landing";
      confidence = 0.4 + (highG != null ? 0.3 : 0) + (swung ? 0.2 : 0);
    } else if (highG != null) {
      kind = "impact";
      confidence = 0.6 + (swung ? 0.2 : 0);
    } else if (swung) {
      kind = "chassis";
      confidence = 0.4 + Math.min(0.3, (gyroDps - CHASSIS_DPS) / 500);
    } else {
      kind = "vibration";
      confidence = 0.5;
    }
    events.push({
      kind,
      timeMs: t,
      confidence: Math.round(confidence * 100) / 100,
      peakG,
      gyroDps,
      highG,
      airMs: Math.round(airMs),
    });
  }
  return events;
}
