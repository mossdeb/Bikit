import { describe, expect, it } from "vitest";
import { BikitDevice, BikitDeviceError } from "./protocol";
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
    });
  });

  it("is null on a firmware without settings", async () => {
    const device = await BikitDevice.connect(scripted({}));
    expect(await device.readConfig()).toBeNull();
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
    });
  });

  it("stores a value and reads it back", async () => {
    const device = await BikitDevice.connect(new SimulatedLoggerTransport(0));
    const stored = await device.setConfig("SLEEP_MIN", "15");
    expect(stored.sleepMinutes).toBe(15);
    expect((await device.readConfig())?.sleepMinutes).toBe(15);
    expect((await device.setConfig("VEHICLE", "MOTORCYCLE")).vehicle).toBe("MOTORCYCLE");
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
