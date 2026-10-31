import { crc32 } from "@/lib/imu/bkt";
import type { ImuMountOrientation, ImuRiderSag } from "@/lib/imu/format";
import { storedRiderSag, type StoredRiderSag } from "@/lib/imu/rider-sag";

/**
 * The rider-sag reading straight from the logger's card (by request,
 * 2026-10-31), for a bike's setup with no recording to read it from. It takes
 * two files: /BIKIT.SAG holds the rider-on gravity in the sensor's frame, and
 * only /BIKIT.CAL's orientation says which way that frame sits on the bike.
 *
 * Read in the browser; only the resulting reading is saved, with the setup.
 *
 *   BIKIT.SAG  40 bytes   "SAG1", laid out as in a .BKT (see bkt.ts)
 *   BIKIT.CAL  128 bytes  "BCAL" header, CAL1 at 8, ORI1 at 64, file CRC at 124
 */

export type SagFileError =
  "unknown" | "needsSag" | "needsCal" | "corrupt" | "otherCalibration";

const SAG_SIZE = 40;
const CAL_FILE_SIZE = 128;
const ORI_OFFSET = 64;
const ORI_SIZE = 60;

const ascii = (u8: Uint8Array, offset: number) =>
  String.fromCharCode(...u8.subarray(offset, offset + 4));

/** A record's CRC is over all of it, with the field itself read as zero. */
function recordCrcOk(u8: Uint8Array, offset: number, size: number): boolean {
  const copy = u8.slice(offset, offset + size);
  const view = new DataView(copy.buffer);
  const stored = view.getUint32(size - 4, true);
  copy.fill(0, size - 4, size);
  return crc32(copy) === stored;
}

function readSag(u8: Uint8Array): ImuRiderSag | null {
  if (!recordCrcOk(u8, 0, SAG_SIZE)) return null;
  const view = new DataView(u8.buffer, u8.byteOffset, SAG_SIZE);
  const f = (i: number) => view.getFloat32(8 + i * 4, true);
  return {
    gravityG: [f(0), f(1), f(2)],
    accelStddevG: f(3),
    gyroStddevDps: f(4),
    sampleCount: view.getUint32(28, true),
    calibrationCount: view.getUint32(32, true),
  };
}

function readOrientation(u8: Uint8Array): ImuMountOrientation | null {
  if (
    ascii(u8, ORI_OFFSET) !== "ORI1" ||
    !recordCrcOk(u8, ORI_OFFSET, ORI_SIZE)
  )
    return null;
  const view = new DataView(u8.buffer, u8.byteOffset + ORI_OFFSET, ORI_SIZE);
  const vec = (i: number): [number, number, number] => [
    view.getFloat32(8 + i * 12, true),
    view.getFloat32(12 + i * 12, true),
    view.getFloat32(16 + i * 12, true),
  ];
  return {
    up: vec(0),
    front: vec(1),
    left: vec(2),
    confidence: view.getFloat32(44, true),
    voteCount: view.getUint16(48, true),
    calibrationCount: view.getUint32(52, true),
  };
}

/** The reading from the files as picked, in any order and told apart by
 * their contents. The two must be from one calibration: another's orientation
 * would turn the gravity the wrong way. */
export function parseSagFiles(
  files: ArrayBuffer[],
): { ok: true; reading: StoredRiderSag } | { ok: false; error: SagFileError } {
  const all = files.map((f) => new Uint8Array(f));
  const sagFile = all.find(
    (u8) => u8.byteLength === SAG_SIZE && ascii(u8, 0) === "SAG1",
  );
  const calFile = all.find(
    (u8) => u8.byteLength === CAL_FILE_SIZE && ascii(u8, 0) === "BCAL",
  );
  if (!sagFile && !calFile) return { ok: false, error: "unknown" };
  if (!sagFile) return { ok: false, error: "needsSag" };
  if (!calFile) return { ok: false, error: "needsCal" };
  const sag = readSag(sagFile);
  const orientation = readOrientation(calFile);
  if (!sag || !orientation) return { ok: false, error: "corrupt" };
  if (sag.calibrationCount !== orientation.calibrationCount)
    return { ok: false, error: "otherCalibration" };
  const reading = storedRiderSag(sag, orientation);
  return reading ? { ok: true, reading } : { ok: false, error: "corrupt" };
}
