import { describe, expect, it } from "vitest";
import { crc32 } from "./bkt";
import { parseSagFiles } from "./sag-file";

function sagFile(count = 4, gravity = [0, Math.sin(0.1), Math.cos(0.1)]) {
  const u8 = new Uint8Array(40);
  const view = new DataView(u8.buffer);
  u8.set([0x53, 0x41, 0x47, 0x31]);
  view.setUint16(4, 1, true);
  view.setUint16(6, 40, true);
  gravity.forEach((g, i) => view.setFloat32(8 + i * 4, g, true));
  view.setUint32(28, 1664, true);
  view.setUint32(32, count, true);
  view.setUint32(36, crc32(u8), true);
  return u8.buffer;
}

/** Up is the sensor's z and front its y, so the gravity above is nose up. */
function calFile(count = 4) {
  const u8 = new Uint8Array(128);
  u8.set([0x42, 0x43, 0x41, 0x4c]);
  u8.set([0x4f, 0x52, 0x49, 0x31], 64);
  const view = new DataView(u8.buffer);
  [0, 0, 1, 0, 1, 0, -1, 0, 0, 0.8].forEach((v, i) =>
    view.setFloat32(72 + i * 4, v, true),
  );
  view.setUint32(116, count, true);
  view.setUint32(120, crc32(u8.subarray(64, 124)), true);
  return u8.buffer;
}

describe("parseSagFiles", () => {
  it("reads the pitch from the two files, in either order", () => {
    for (const files of [
      [sagFile(), calFile()],
      [calFile(), sagFile()],
    ]) {
      const result = parseSagFiles(files);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reading.pitchDeg).toBeCloseTo(5.73, 1);
        expect(result.reading.calibrationCount).toBe(4);
      }
    }
  });

  it("asks for the file that is missing", () => {
    expect(parseSagFiles([sagFile()])).toEqual({
      ok: false,
      error: "needsCal",
    });
    expect(parseSagFiles([calFile()])).toEqual({
      ok: false,
      error: "needsSag",
    });
    expect(parseSagFiles([new ArrayBuffer(12)])).toEqual({
      ok: false,
      error: "unknown",
    });
  });

  it("refuses two calibrations and a damaged file", () => {
    expect(parseSagFiles([sagFile(4), calFile(5)])).toEqual({
      ok: false,
      error: "otherCalibration",
    });
    const damaged = new Uint8Array(sagFile());
    damaged[10] ^= 0xff;
    expect(parseSagFiles([damaged.buffer, calFile()])).toEqual({
      ok: false,
      error: "corrupt",
    });
  });
});
