import type { BikitTransport } from "./transport";

/**
 * A logger in software (2026-11-08): it speaks the protocol of the Logger
 * area — PING, INFO with its block, SESSIONS, the CONFIG/SET pair and the
 * live SAG — so the screens can be built and checked before the firmware
 * catches up. Reached with `?simulate=1` on /pro/logger and on a bike's
 * page (the setup's live SAG).
 *
 * It holds its settings for as long as the page lives, and answers with a
 * short delay, so the screen's "saving" state is seen as it will be on the
 * air. `SET` follows the contract: SET_OK with the value as stored, or
 * ERROR INVALID_SETTING for a key or value out of it.
 */
export class SimulatedLoggerTransport implements BikitTransport {
  private status = new Set<(m: string) => void>();
  private disconnects = new Set<() => void>();
  private settings: Record<string, string> = {
    AUTO_STOP: "1",
    AUTO_SLEEP: "1",
    SLEEP_MIN: "5",
    VEHICLE: "BICYCLE",
    GPS_FIX_PROTECTION: "1",
    // The linear sensors (firmware V19.0.036), both recorded by default.
    LINEAR_ENABLED: "1",
    SHOCK_ENABLED: "1",
    // What each channel carries (firmware V20.7.2): 0 linear, 1 infrared.
    LINEAR_TYPE: "0",
    SHOCK_TYPE: "0",
  };

  private readonly bornAt = Date.now();
  /** The live SAG's 20 Hz stream (firmware V19.0.038), while it is on. */
  private sagTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly delayMs = 250) {}

  connect() {
    return new Promise<{ name: string }>((resolve) =>
      setTimeout(() => resolve({ name: "BIKIT-SIMULATED" }), this.delayMs),
    );
  }

  disconnect() {
    this.stopSag();
    for (const d of [...this.disconnects]) d();
  }

  private stopSag() {
    if (this.sagTimer) clearInterval(this.sagTimer);
    this.sagTimer = null;
  }

  /**
   * A rider getting on: both ends compress over ~1.5 s, sway for a couple
   * of seconds more and settle at 45.4 mm (fork) and 21.2 mm (shock), the
   * contract's example, with a tenth or two of jitter — so the panel's
   * "steady" wait can be seen to work.
   */
  private startSag() {
    this.stopSag();
    const startedAt = Date.now();
    const at = (target: number, s: number) => {
      const ramp = Math.min(1, s / 1.5);
      const sway = s < 4 ? Math.sin(s * 5) * 3 * Math.max(0, 1 - s / 4) : 0;
      return target * ramp + sway + (Math.random() - 0.5) * 0.3;
    };
    this.sagTimer = setInterval(() => {
      const s = (Date.now() - startedAt) / 1000;
      const tenths = (mm: number) => String(Math.round(mm * 10));
      this.send(`SAG ${tenths(at(45.4, s))} ${tenths(at(21.2, s))}`);
    }, 50);
  }

  subscribeStatus(handler: (m: string) => void) {
    this.status.add(handler);
    return () => this.status.delete(handler);
  }

  subscribeData() {
    return () => {};
  }

  subscribeDisconnect(handler: () => void) {
    this.disconnects.add(handler);
    return () => this.disconnects.delete(handler);
  }

  writeControl(command: string): Promise<void> {
    setTimeout(() => this.answer(command.trim()), this.delayMs);
    return Promise.resolve();
  }

  private send(...lines: string[]) {
    for (const line of lines) for (const h of [...this.status]) h(line);
  }

  private answer(command: string) {
    const [head = "", key = "", value = ""] = command.split(/\s+/);
    switch (head.toUpperCase()) {
      case "PING":
        return this.send("PONG");
      case "AUTH":
        return this.send("ERROR UNKNOWN_COMMAND");
      case "INFO":
        return this.send(
          "INFO 1 18.9.000-sim 0123456789ABCDEF",
          "INFO_BAT 96 4113",
          "INFO_GPS NO_FIX 0 9999 NONE 1100",
          "INFO_SD OK",
          "INFO_IMU OK",
          "INFO_CAL VALID 3",
          "INFO_END",
        );
      case "GPS_STATUS": {
        // A receiver warming up: no fix for the first 6 s, then 3D with a
        // few satellites, so every state the panel draws can be seen.
        const s = (Date.now() - this.bornAt) / 1000;
        if (s < 3) return this.send("GPS_STATUS NA NA NA NA NA NO_DATA");
        if (s < 6) return this.send("GPS_STATUS 0 5 0 NA 900 NO_FIX");
        if (s < 9) return this.send("GPS_STATUS 3 9 3 41000 800 LOW_SATS");
        return this.send("GPS_STATUS 3 12 9 4200 600 READY");
      }
      case "SAG":
        if (key.toUpperCase() === "START") {
          this.send("SAG_OK 20");
          this.startSag();
          return;
        }
        if (key.toUpperCase() === "STOP") {
          this.stopSag();
          return this.send("SAG_STOPPED");
        }
        return this.send("ERROR UNKNOWN_COMMAND");
      case "SESSIONS":
        return this.send("LIST_BEGIN 0", "LIST_END");
      case "CONFIG":
        return this.send(
          ...Object.entries(this.settings).map(([k, v]) => `CONFIG ${k} ${v}`),
          "CONFIG_END",
        );
      case "SET": {
        const k = key.toUpperCase();
        const v = value.toUpperCase();
        const valid =
          ((k === "AUTO_STOP" ||
            k === "AUTO_SLEEP" ||
            k === "GPS_FIX_PROTECTION" ||
            k === "LINEAR_ENABLED" ||
            k === "SHOCK_ENABLED" ||
            k === "LINEAR_TYPE" ||
            k === "SHOCK_TYPE") &&
            (v === "0" || v === "1")) ||
          (k === "SLEEP_MIN" && ["5", "10", "15"].includes(v)) ||
          (k === "VEHICLE" && (v === "BICYCLE" || v === "MOTORCYCLE"));
        if (!valid) return this.send("ERROR INVALID_SETTING");
        this.settings[k] = v;
        return this.send(`SET_OK ${k} ${v}`);
      }
      default:
        return this.send("ERROR UNKNOWN_COMMAND");
    }
  }
}
