/**
 * IMU session file parsing — the normalization layer.
 *
 * Everything downstream (summary, chart, details panel) consumes the
 * normalized ImuSessionData and never the file's own shape, so a new sensor
 * format is one more parser in the registry and nothing else moves. The
 * parsed samples are the raw data: they are stored in typed arrays for
 * memory and speed, and nothing in the app ever writes back into them —
 * derived metrics are computed on read (see derive.ts).
 */

import { isBktFile, parseBktFile } from "./bkt";

export type ImuEvent =
  | {
      kind: "curve";
      direction: "left" | "right";
      startMs: number;
      endMs: number;
      confidence: number | null;
    }
  | {
      kind: "jump";
      takeoffMs: number;
      landingMs: number;
      airtimeMs: number;
      confidence: number | null;
    }
  /** A drop: airborne off a ledge rather than off a lip. Same shape as a
   * jump — an IMU sees the same thing — but kept apart because the trail
   * feature is different, and the two wear different marks. No file produces
   * one yet; the parser is ready for when one does. */
  | {
      kind: "drop";
      takeoffMs: number;
      landingMs: number;
      airtimeMs: number;
      confidence: number | null;
    }
  | {
      kind: "impact";
      timeMs: number;
      severity: string | null;
      confidence: number | null;
    }
  | {
      kind: "rough_section";
      startMs: number;
      endMs: number;
      confidence: number | null;
    }
  | {
      kind: "braking";
      startMs: number;
      endMs: number;
      confidence: number | null;
    };

export interface ImuChannels {
  /** Sample timestamps in ms from session start. Monotonically increasing. */
  tMs: Float64Array;
  ax: Float32Array;
  ay: Float32Array;
  az: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
  gz: Float32Array;
  /** G force as the file recorded it, or null when the file carries none —
   * then it is derived on read (gForceOf), never written back here. */
  gForce: Float32Array | null;
}

/**
 * The GNSS track, when the recording carries one (format v2's
 * `gps_samples`, or the XIAO exporter's `gnss_samples` — see
 * parseGpsSamples for the two spellings). Its own clock and its own rate —
 * 10 Hz in the simulated file, 1 Hz off the real receiver, against the
 * IMU's 100 to 416 — joined to the IMU channels by the shared `t_ms`.
 */
export interface GpsChannels {
  /** GPS sample timestamps in ms from session start. Monotonic. */
  tMs: Float64Array;
  /** Degrees, kept in doubles: a Float32 carries ~7 significant digits,
   * which at these latitudes rounds a coordinate by about a metre. */
  latDeg: Float64Array;
  lonDeg: Float64Array;
  /** Metres above mean sea level. */
  altitudeM: Float32Array;
  /** Ground speed in m/s — the recorded speed, never integrated from
   * acceleration. */
  speedMps: Float32Array;
  /** Heading over ground, degrees true. NaN where the file omits it. */
  headingDeg: Float32Array;
  /** Cumulative distance in metres. NaN where the file omits it. */
  distanceM: Float32Array;
  /** Horizontal accuracy in metres. NaN where the file omits it — kept for
   * gating derived metrics on fix quality, not shown as a channel. */
  hAccM: Float32Array;
}

/**
 * The logger's calibration snapshot, taken with the bike upright, level and
 * still (button held ≥3 s) and copied into every session recorded after it.
 *
 * `gravityRefG` is where "down" is in the SENSOR's frame — which is the
 * same as saying how the sensor is mounted on the bike. `gyroBiasDps` is
 * what each gyro axis reads at rest. Between them they let the app express
 * the channels in the bike's frame (alignSessionToBike in derive.ts): lean
 * and pitch become the bike's, not the sensor's, and the gyro stops
 * drifting by its bias.
 *
 * Gravity fixes two of three degrees of freedom. Which way is "forward" —
 * the rotation about the vertical — it cannot say, and is left as is.
 */
export interface ImuCalibration {
  gravityRefG: [number, number, number];
  gyroBiasDps: [number, number, number];
  gravityMagnitudeG: number;
  accelStddevG: number;
  gyroStddevDps: number;
  sampleCount: number;
  calibrationCount: number;
}

export interface ImuSessionData {
  /** Which parser produced this — travels to the DB row for provenance. */
  format: string;
  sessionId: string | null;
  durationMs: number;
  sampleRateHz: number;
  sampleCount: number;
  channels: ImuChannels;
  /** Null when the file records no GNSS — every v1 file, and a v2 file
   * whose valid fixes all dropped out. The speed series and the map exist
   * only when this does. */
  gps: GpsChannels | null;
  events: ImuEvent[];
  /** The mounting calibration the file carries, or null when it carries
   * none (v1 files, or a logger never calibrated). */
  calibration: ImuCalibration | null;
  /** True once alignSessionToBike has expressed the channels in the bike's
   * frame. The parsers always produce false: they hand over the sensor's
   * frame, which is what the file recorded. */
  aligned: boolean;
  /** Where "forward" was found, when the ride could say — see
   * estimateMountingYaw in derive.ts. Null from the parsers, and null when
   * the session had no GPS or too little motion to tell. */
  mounting: MountingYaw | null;
}

/**
 * The third degree of freedom the calibration cannot fix: the rotation
 * about the vertical that puts the bike's forward on +X. Found from the
 * ride itself — the accelerometer's horizontal component agrees with the
 * GPS speed's derivative when the bike accelerates and brakes — and
 * checked against the GPS heading's turns.
 */
export interface MountingYaw {
  /** Degrees the sensor's X axis sits from the bike's forward, measured
   * about +Z (counter-clockwise from above). Applied as the inverse. */
  yawDeg: number;
  /** 0–1: how well the rotated forward acceleration explains the GPS
   * speed changes (correlation), tempered by how many intervals there were. */
  confidence: number;
  /** GPS intervals with enough speed change to count. */
  intervals: number;
  /** The independent check on the lateral axis: in turns, the yaw gyro and
   * the lateral acceleration must agree with the GPS heading's direction.
   * "ok" when they do, "inverted" when they consistently do not — a sign
   * the sensor's axes are not the right-handed set the maths assumes —
   * and "insufficient" when the ride had no turns to tell. */
  headingCheck: "ok" | "inverted" | "insufficient";
  /** True once applyMountingYaw has rotated the channels by -yawDeg. */
  applied: boolean;
}

export type ImuParseResult =
  { ok: true; session: ImuSessionData } | { ok: false; error: string };

interface ImuParser {
  id: string;
  matches: (json: unknown) => boolean;
  parse: (json: unknown) => ImuParseResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Confidence is optional everywhere: an absent one is "not stated", which
 * the UI shows as nothing rather than as 0%. */
function confidenceOf(event: Record<string, unknown>): number | null {
  return finiteNumber(event.confidence);
}

/**
 * `bikit_imu_session` v1 — the format the demo sensor writes.
 *
 * Events are lenient by design: an event whose type this build does not know
 * is dropped rather than failing the file, because events are the moving part
 * of this format while samples are settled. Samples are strict: one sample
 * with a missing axis is a corrupt recording, not a variant.
 */
const bikitImuV1: ImuParser = {
  id: "bikit_imu_session",
  matches: (json) => isRecord(json) && json.format === "bikit_imu_session",
  parse: (json) => {
    if (!isRecord(json))
      return { ok: false, error: "O ficheiro não é um objeto JSON." };
    const meta = isRecord(json.session) ? json.session : null;
    if (!meta)
      return { ok: false, error: 'Falta o bloco "session" com os metadados.' };

    const samples = Array.isArray(json.samples) ? json.samples : null;
    if (!samples || samples.length === 0) {
      return { ok: false, error: 'O ficheiro não tem amostras ("samples").' };
    }

    const n = samples.length;
    const tMs = new Float64Array(n);
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const az = new Float32Array(n);
    const gx = new Float32Array(n);
    const gy = new Float32Array(n);
    const gz = new Float32Array(n);
    let gForce: Float32Array | null = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const s = samples[i];
      if (!isRecord(s))
        return { ok: false, error: `A amostra ${i} não é um objeto.` };
      const t = finiteNumber(s.t_ms);
      const vax = finiteNumber(s.ax_g);
      const vay = finiteNumber(s.ay_g);
      const vaz = finiteNumber(s.az_g);
      const vgx = finiteNumber(s.gx_dps);
      const vgy = finiteNumber(s.gy_dps);
      const vgz = finiteNumber(s.gz_dps);
      if (
        t == null ||
        vax == null ||
        vay == null ||
        vaz == null ||
        vgx == null ||
        vgy == null ||
        vgz == null
      ) {
        return {
          ok: false,
          error: `A amostra ${i} tem campos em falta ou não numéricos.`,
        };
      }
      if (i > 0 && t < tMs[i - 1]) {
        return {
          ok: false,
          error: `O tempo anda para trás na amostra ${i} (${t} ms após ${tMs[i - 1]} ms).`,
        };
      }
      tMs[i] = t;
      ax[i] = vax;
      ay[i] = vay;
      az[i] = vaz;
      gx[i] = vgx;
      gy[i] = vgy;
      gz[i] = vgz;
      const g = finiteNumber(s.g_force);
      if (g == null) gForce = null;
      else if (gForce) gForce[i] = g;
    }

    const events: ImuEvent[] = [];
    if (Array.isArray(json.events)) {
      for (const raw of json.events) {
        if (!isRecord(raw)) continue;
        const event = normalizeBikitEvent(raw);
        if (event) events.push(event);
      }
    }

    // Two spellings of the same block: `gps_samples` is what the simulated
    // v2 file carried, `gnss_samples` is what the XIAO exporter writes. The
    // first one present wins; a file with neither is a recording without
    // a receiver.
    const gpsKey =
      json.gps_samples != null
        ? "gps_samples"
        : json.gnss_samples != null
          ? "gnss_samples"
          : null;
    const gpsResult = parseGpsSamples(gpsKey ? json[gpsKey] : null, gpsKey);
    if (!gpsResult.ok) return { ok: false, error: gpsResult.error };

    const lastT = tMs[n - 1];
    const durationMs = finiteNumber(meta.duration_ms) ?? lastT;
    // The declared rate when present, otherwise measured off the recording
    // itself — n samples across lastT milliseconds.
    const sampleRateHz =
      finiteNumber(meta.sample_rate_hz) ??
      (lastT > 0 ? (n - 1) / (lastT / 1000) : 0);

    return {
      ok: true,
      session: {
        format: "bikit_imu_session",
        sessionId: typeof meta.session_id === "string" ? meta.session_id : null,
        durationMs,
        sampleRateHz,
        sampleCount: n,
        channels: { tMs, ax, ay, az, gx, gy, gz, gForce },
        gps: gpsResult.gps,
        events,
        calibration: parseJsonCalibration(json.calibration),
        aligned: false,
        mounting: null,
      },
    };
  },
};

/**
 * The exporter's `calibration` block — the same CAL1 snapshot the binary
 * carries, as JSON: `gravity_reference_g: {x,y,z}`, `gyro_bias_dps:
 * {x,y,z}`, and the quality figures. `available: false` (or no block at
 * all) is a logger never calibrated; a block with a non-finite number is
 * dropped whole rather than half-applied.
 */
function parseJsonCalibration(raw: unknown): ImuCalibration | null {
  if (!isRecord(raw) || raw.available !== true) return null;
  const g = isRecord(raw.gravity_reference_g) ? raw.gravity_reference_g : null;
  const b = isRecord(raw.gyro_bias_dps) ? raw.gyro_bias_dps : null;
  if (!g || !b) return null;
  const vec = (r: Record<string, unknown>): [number, number, number] | null => {
    const x = finiteNumber(r.x);
    const y = finiteNumber(r.y);
    const z = finiteNumber(r.z);
    return x != null && y != null && z != null ? [x, y, z] : null;
  };
  const gravityRefG = vec(g);
  const gyroBiasDps = vec(b);
  if (!gravityRefG || !gyroBiasDps) return null;
  return {
    gravityRefG,
    gyroBiasDps,
    gravityMagnitudeG:
      finiteNumber(raw.gravity_magnitude_g) ?? Math.hypot(...gravityRefG),
    accelStddevG: finiteNumber(raw.accel_stddev_g) ?? NaN,
    gyroStddevDps: finiteNumber(raw.gyro_stddev_dps) ?? NaN,
    sampleCount: finiteNumber(raw.sample_count) ?? 0,
    calibrationCount: finiteNumber(raw.calibration_count) ?? 0,
  };
}

/**
 * The GNSS block (format v2). Absent in v1 files — that is not an error, it
 * is a recording without a receiver. When present, the core fields are
 * strict the way IMU samples are: a GPS sample missing its time or its
 * coordinates is a corrupt recording, not a variant. Two exceptions:
 *
 * - A sample the receiver itself flags as invalid is skipped rather than
 *   failing the file — no fix is a tunnel, not corruption, and its
 *   coordinates are whatever the receiver last guessed.
 * - Heading, cumulative distance and accuracy are optional per sample (NaN
 *   when missing): useful when there, nothing downstream requires them.
 *
 * TWO DIALECTS OF THE SAME BLOCK, and this reads both. The simulated v2
 * file spelled it `gps_samples` with `latitude_deg` / `longitude_deg` /
 * `altitude_msl_m` / `ground_speed_mps` and one `fix_valid` flag. The XIAO
 * exporter (bikit_mac_exporter v5, 2026-09) writes `gnss_samples` with
 * `latitude` / `longitude` / `altitude_m` / `speed_m_s`, a `heading_deg`
 * that is `null` while the receiver has no heading, an `hdop` instead of
 * an accuracy in metres, no cumulative distance, and a `valid` object with
 * one flag per quantity. Each field below tries the simulated name first
 * and the exporter's second; whichever the file carries is read. One
 * parser and not two, because the difference is spelling — the data is
 * the same receiver saying the same things — and a format that forks on
 * spelling would need every downstream consumer to know which fork it got.
 *
 * `hdop` is NOT mapped onto `hAccM`: it is a dimensionless dilution, not
 * metres, and pretending otherwise would let a future gate on accuracy
 * compare the two as if they were one scale. Left unread until something
 * needs it.
 */
function parseGpsSamples(
  raw: unknown,
  key: string | null,
): { ok: true; gps: GpsChannels | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, gps: null };
  if (!Array.isArray(raw)) {
    return { ok: false, error: `"${key ?? "gps_samples"}" não é uma lista.` };
  }

  const kept: {
    t: number;
    lat: number;
    lon: number;
    alt: number;
    speed: number;
    heading: number;
    dist: number;
    hAcc: number;
  }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!isRecord(s)) {
      return { ok: false, error: `A amostra GPS ${i} não é um objeto.` };
    }
    // The receiver's own verdict on the fix, in either dialect. The
    // exporter flags each quantity apart; a sample whose position, altitude
    // or speed it distrusts is skipped whole, because those three are the
    // strict core below and a value the receiver itself disowns is not a
    // reading — it is the last guess. Heading is handled per field: a
    // receiver standing still has no heading and says so, and that is not
    // a reason to lose the position.
    if (s.fix_valid === false) continue;
    const valid = isRecord(s.valid) ? s.valid : null;
    if (
      valid &&
      (valid.position === false ||
        valid.altitude === false ||
        valid.speed === false)
    )
      continue;
    const t = finiteNumber(s.t_ms);
    const lat = finiteNumber(s.latitude_deg) ?? finiteNumber(s.latitude);
    const lon = finiteNumber(s.longitude_deg) ?? finiteNumber(s.longitude);
    const alt = finiteNumber(s.altitude_msl_m) ?? finiteNumber(s.altitude_m);
    const speed = finiteNumber(s.ground_speed_mps) ?? finiteNumber(s.speed_m_s);
    if (
      t == null ||
      lat == null ||
      lon == null ||
      alt == null ||
      speed == null
    ) {
      return {
        ok: false,
        error: `A amostra GPS ${i} tem campos em falta ou não numéricos.`,
      };
    }
    const prev = kept[kept.length - 1];
    if (prev && t < prev.t) {
      return {
        ok: false,
        error: `O tempo anda para trás na amostra GPS ${i} (${t} ms após ${prev.t} ms).`,
      };
    }
    kept.push({
      t,
      lat,
      lon,
      alt,
      speed,
      // `null` in the exporter's file while there is no heading; the flag
      // says the same thing. Either way it is NaN here, the documented
      // "omitted".
      heading:
        valid?.heading === false ? NaN : (finiteNumber(s.heading_deg) ?? NaN),
      dist: finiteNumber(s.distance_m) ?? NaN,
      hAcc: finiteNumber(s.horizontal_accuracy_m) ?? NaN,
    });
  }
  if (kept.length === 0) return { ok: true, gps: null };

  const m = kept.length;
  const gps: GpsChannels = {
    tMs: new Float64Array(m),
    latDeg: new Float64Array(m),
    lonDeg: new Float64Array(m),
    altitudeM: new Float32Array(m),
    speedMps: new Float32Array(m),
    headingDeg: new Float32Array(m),
    distanceM: new Float32Array(m),
    hAccM: new Float32Array(m),
  };
  for (let i = 0; i < m; i++) {
    const s = kept[i];
    gps.tMs[i] = s.t;
    gps.latDeg[i] = s.lat;
    gps.lonDeg[i] = s.lon;
    gps.altitudeM[i] = s.alt;
    gps.speedMps[i] = s.speed;
    gps.headingDeg[i] = s.heading;
    gps.distanceM[i] = s.dist;
    gps.hAccM[i] = s.hAcc;
  }
  return { ok: true, gps };
}

function normalizeBikitEvent(raw: Record<string, unknown>): ImuEvent | null {
  const confidence = confidenceOf(raw);
  switch (raw.type) {
    case "curve": {
      const startMs = finiteNumber(raw.start_ms);
      const endMs = finiteNumber(raw.end_ms);
      const direction =
        raw.direction === "left" || raw.direction === "right"
          ? raw.direction
          : null;
      if (startMs == null || endMs == null || !direction) return null;
      return { kind: "curve", direction, startMs, endMs, confidence };
    }
    case "jump":
    case "drop": {
      const takeoffMs =
        finiteNumber(raw.takeoff_ms) ?? finiteNumber(raw.start_ms);
      const landingMs = finiteNumber(raw.landing_ms);
      if (takeoffMs == null || landingMs == null) return null;
      const airtimeMs = finiteNumber(raw.airtime_ms) ?? landingMs - takeoffMs;
      return { kind: raw.type, takeoffMs, landingMs, airtimeMs, confidence };
    }
    case "impact": {
      const timeMs = finiteNumber(raw.time_ms);
      if (timeMs == null) return null;
      return {
        kind: "impact",
        timeMs,
        severity: typeof raw.severity === "string" ? raw.severity : null,
        confidence,
      };
    }
    case "rough_section": {
      const startMs = finiteNumber(raw.start_ms);
      const endMs = finiteNumber(raw.end_ms);
      if (startMs == null || endMs == null) return null;
      return { kind: "rough_section", startMs, endMs, confidence };
    }
    case "braking": {
      const startMs = finiteNumber(raw.start_ms);
      const endMs = finiteNumber(raw.end_ms);
      if (startMs == null || endMs == null) return null;
      return { kind: "braking", startMs, endMs, confidence };
    }
    default:
      return null;
  }
}

const PARSERS: ImuParser[] = [bikitImuV1];

/**
 * Parses an imported file into the normalized session, trying each known
 * format in turn. The error strings are user-facing (they appear on the
 * import form, written on screen — not in a toast).
 */
export function parseImuFile(json: unknown): ImuParseResult {
  const parser = PARSERS.find((p) => p.matches(json));
  if (!parser) {
    return {
      ok: false,
      error:
        'Formato não reconhecido. Esperado um ficheiro com "format": "bikit_imu_session".',
    };
  }
  return parser.parse(json);
}

/**
 * The entry point for a file's bytes — what the import form and the session
 * page both call. Picks the parser by the first bytes: the logger's `.BKT`
 * binary by its "BKTL" magic, everything else decoded as text and read as
 * JSON through the registry above. The two paths end in the same
 * ImuSessionData, which is the whole point of having a normalization layer.
 *
 * A file that is neither says so in one message rather than two — "not
 * JSON" would be misleading for a binary that merely lost its first bytes.
 */
export function parseImuBytes(bytes: ArrayBuffer): ImuParseResult {
  if (isBktFile(bytes)) return parseBktFile(bytes);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {
      ok: false,
      error: "O ficheiro não é JSON válido nem um .BKT do sensor.",
    };
  }
  return parseImuFile(json);
}
