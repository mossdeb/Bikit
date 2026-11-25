import { describe, expect, it } from "vitest";
import {
  BikitDevice,
  BikitDeviceError,
  parseGpsStatus,
  parseLiveSag,
} from "./protocol";
import { SimulatedLoggerTransport } from "./simulated-transport";
import type { BikitTransport } from "./transport";

/** A logger that answers only the lines it is given, per command. */
function scripted(replies: Record<string, string[]>): BikitTransport {
  const status = new Set<(m: string) => void>();
  return {
    connect: () => Promise.resolve({ name: "BIKIT-TEST" }),
    disconnect: () => {},
    subscribeStatus: (h) => (status.add(h), () => status.delete(h)),
    subscribeData: () => () => {},
    subscribeDisconnect: () => () => {},
    writeControl: (command) => {
      const lines = replies[command.split(/\s+/)[0]] ?? ["ERROR UNKNOWN_COMMAND"];
      setTimeout(() => lines.forEach((l) => status.forEach((h) => h(l))), 0);
      return Promise.resolve();
    },
  };
}

describe("CONFIG / SET", () => {
  it("reads every setting the logger sends", async () => {
    const device = await BikitDevice.connect(new SimulatedLoggerTransport(0));
    expect(await device.readConfig()).toEqual({
      autoStop: true,
      autoSleep: true,
      sleepMinutes: 5,
      vehicle: "BICYCLE",
      gpsFixProtection: true,
      forkEnabled: true,
      shockEnabled: true,
      forkType: "LINEAR",
      shockType: "LINEAR",
    });
  });

  it("reads each channel's sensor type, and none from older firmware", async () => {
    const device = await BikitDevice.connect(
      scripted({
        CONFIG: [
          "CONFIG LINEAR_ENABLED 1",
          "CONFIG SHOCK_ENABLED 0",
          "CONFIG LINEAR_TYPE 1",
          "CONFIG SHOCK_TYPE 0",
          "CONFIG_END",
        ],
      }),
    );
    const config = await device.readConfig();
    expect(config?.forkType).toBe("INFRARED");
    expect(config?.shockType).toBe("LINEAR");
    const older = await BikitDevice.connect(
      scripted({ CONFIG: ["CONFIG SHOCK_ENABLED 1", "CONFIG LINEAR_TYPE 7", "CONFIG_END"] }),
    );
    const read = await older.readConfig();
    expect(read?.forkType).toBeNull();
    expect(read?.shockType).toBeNull();
  });

  it("is null on a firmware without settings", async () => {
    const device = await BikitDevice.connect(scripted({}));
    expect(await device.readConfig()).toBeNull();
  });

  it("reads a V19.0.034 logger's linear sensors: the shock, and no fork key", async () => {
    const device = await BikitDevice.connect(
      scripted({
        CONFIG: [
          "CONFIG GPS_FIX_PROTECTION 1",
          "CONFIG LINEAR_DETECTION 0",
          "CONFIG SHOCK_ENABLED 1",
          "CONFIG_END",
        ],
      }),
    );
    const config = await device.readConfig();
    // LINEAR_DETECTION is a presence check, not the fork's switch: ignored.
    expect(config?.forkEnabled).toBeNull();
    expect(config?.shockEnabled).toBe(true);
  });

  it("leaves out what was not sent or is out of the contract", async () => {
    const device = await BikitDevice.connect(
      scripted({
        CONFIG: ["CONFIG AUTO_STOP 0", "CONFIG SLEEP_MIN 7", "CONFIG LED 1", "CONFIG_END"],
      }),
    );
    expect(await device.readConfig()).toEqual({
      autoStop: false,
      autoSleep: null,
      sleepMinutes: null,
      vehicle: null,
      gpsFixProtection: null,
      forkEnabled: null,
      shockEnabled: null,
      forkType: null,
      shockType: null,
    });
  });

  it("stores a value and reads it back", async () => {
    const device = await BikitDevice.connect(new SimulatedLoggerTransport(0));
    const stored = await device.setConfig("SLEEP_MIN", "15");
    expect(stored.sleepMinutes).toBe(15);
    expect((await device.readConfig())?.sleepMinutes).toBe(15);
    expect((await device.setConfig("VEHICLE", "MOTORCYCLE")).vehicle).toBe("MOTORCYCLE");
    // The linear sensors, each on or off on its own.
    expect((await device.setConfig("LINEAR_ENABLED", "0")).forkEnabled).toBe(false);
    expect((await device.setConfig("SHOCK_ENABLED", "0")).shockEnabled).toBe(false);
    const read = await device.readConfig();
    expect(read?.forkEnabled).toBe(false);
    expect(read?.shockEnabled).toBe(false);
    // Each channel's type on its own, kept while the channel is off.
    expect((await device.setConfig("LINEAR_TYPE", "1")).forkType).toBe("INFRARED");
    expect((await device.setConfig("SHOCK_TYPE", "1")).shockType).toBe("INFRARED");
    const typed = await device.readConfig();
    expect(typed?.forkType).toBe("INFRARED");
    expect(typed?.forkEnabled).toBe(false);
    expect(typed?.shockType).toBe("INFRARED");
    expect((await device.setConfig("GPS_FIX_PROTECTION", "0")).gpsFixProtection).toBe(false);
    expect((await device.readConfig())?.gpsFixProtection).toBe(false);
  });

  it("rejects with the device's own refusal", async () => {
    const device = await BikitDevice.connect(new SimulatedLoggerTransport(0));
    await expect(device.setConfig("SLEEP_MIN", "7")).rejects.toBeInstanceOf(BikitDeviceError);
    const busy = await BikitDevice.connect(scripted({ SET: ["BUSY RECORDING"] }));
    await expect(busy.setConfig("AUTO_STOP", "0")).rejects.toMatchObject({
      raw: "BUSY RECORDING",
    });
  });
});

describe("GPS_STATUS", () => {
  it("reads every field, NA as null", () => {
    expect(parseGpsStatus("GPS_STATUS 3 12 4 28000 1000 READY")).toEqual({
      fixType: 3,
      visible: 12,
      used: 4,
      hAccMm: 28000,
      ageMs: 1000,
      state: "READY",
    });
    expect(parseGpsStatus("GPS_STATUS NA 7 NA NA NA NO_PVT")).toEqual({
      fixType: null,
      visible: 7,
      used: null,
      hAccMm: null,
      ageMs: null,
      state: "NO_PVT",
    });
    expect(parseGpsStatus("INFO_GPS FIX 9 90 GOOD 100")).toBeNull();
  });

  it("asks the logger, and is null on a firmware without it", async () => {
    const device = await BikitDevice.connect(
      scripted({ GPS_STATUS: ["GPS_STATUS 2 8 5 12000 400 READY"] }),
    );
    expect((await device.gpsStatus())?.fixType).toBe(2);
    const old = await BikitDevice.connect(scripted({}));
    expect(await old.gpsStatus()).toBeNull();
  });
});

describe("live SAG", () => {
  it("reads a SAG line in tenths of a mm, NA per channel", () => {
    expect(parseLiveSag("SAG 454 212")).toEqual({ forkMm: 45.4, shockMm: 21.2 });
    expect(parseLiveSag("SAG 454 NA")).toEqual({ forkMm: 45.4, shockMm: null });
    expect(parseLiveSag("SAG -12 NA")).toEqual({ forkMm: -1.2, shockMm: null });
    expect(parseLiveSag("SAG_OK 20")).toBeNull();
    expect(parseLiveSag("SAG 4.5 1")).toBeNull();
    expect(parseLiveSag("SAG 454")).toBeNull();
  });

  it("starts, streams readings and stops", async () => {
    const device = await BikitDevice.connect(new SimulatedLoggerTransport(0));
    const readings: { forkMm: number | null; shockMm: number | null }[] = [];
    const live = await device.startLiveSag(
      (r) => readings.push(r),
      () => {},
    );
    expect(live.rateHz).toBe(20);
    await new Promise((r) => setTimeout(r, 180));
    await live.stop();
    const count = readings.length;
    expect(count).toBeGreaterThanOrEqual(2);
    await new Promise((r) => setTimeout(r, 120));
    // Nothing after STOP.
    expect(readings.length).toBe(count);
    device.disconnect();
  });

  it("refuses with the logger's reason when the suspension is not calibrated", async () => {
    const device = await BikitDevice.connect(scripted({ SAG: ["SAG_NO_CAL"] }));
    await expect(device.startLiveSag(() => {}, () => {})).rejects.toMatchObject({
      raw: "SAG_NO_CAL",
    });
  });

  it("tells when the logger ends it on its own", async () => {
    const device = await BikitDevice.connect(
      scripted({ SAG: ["SAG_OK 20", "SAG 400 200", "SAG_BUSY"] }),
    );
    const readings: unknown[] = [];
    let ended: string | null = null;
    await device.startLiveSag(
      (r) => readings.push(r),
      (reason) => (ended = reason),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(readings).toHaveLength(1);
    expect(ended).toMatch(/a gravar, a calibrar ou a transferir/);
  });
});
