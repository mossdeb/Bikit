import { describe, expect, it } from "vitest";
import { throttleBleProgress } from "./progress";
import type { TransferProgress } from "./protocol";

describe("visual BLE progress", () => {
  it("limits a burst to initial and final progress without dropping final bytes", () => {
    let time = 0;
    const seen: TransferProgress[] = [];
    const report = throttleBleProgress((p) => seen.push(p), () => time);
    for (let n = 0; n <= 100; n++) {
      time = n / 2;
      report({ uniqueBytes: n, totalBytes: 100 });
    }
    expect(seen).toEqual([
      { uniqueBytes: 0, totalBytes: 100 },
      { uniqueBytes: 100, totalBytes: 100 },
    ]);
  });
  it("delivers the latest received value at the 100 ms boundary", () => {
    let time = 0;
    const seen: number[] = [];
    const report = throttleBleProgress((p) => seen.push(p.uniqueBytes), () => time);
    report({ uniqueBytes: 0, totalBytes: 1000 });
    time = 99; report({ uniqueBytes: 240, totalBytes: 1000 });
    time = 100; report({ uniqueBytes: 480, totalBytes: 1000 });
    time = 199; report({ uniqueBytes: 720, totalBytes: 1000 });
    time = 200; report({ uniqueBytes: 960, totalBytes: 1000 });
    time = 201; report({ uniqueBytes: 1000, totalBytes: 1000 });
    expect(seen).toEqual([0, 480, 960, 1000]);
  });
  it("has independent timing for each transfer and never schedules a callback", async () => {
    const seen: number[] = [];
    const first = throttleBleProgress((p) => seen.push(p.uniqueBytes), () => 0);
    first({ uniqueBytes: 0, totalBytes: 1000 });
    first({ uniqueBytes: 240, totalBytes: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 110));
    expect(seen).toEqual([0]);
    const next = throttleBleProgress((p) => seen.push(p.uniqueBytes), () => 0);
    next({ uniqueBytes: 240, totalBytes: 1000 });
    expect(seen).toEqual([0, 240]);
  });
});
