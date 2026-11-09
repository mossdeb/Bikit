import type { BikitTransport } from "./transport";

/**
 * A logger in software (2026-11-08): it speaks the protocol of the Logger
 * area — PING, INFO with its block, SESSIONS, and the CONFIG/SET pair the
 * firmware does not have yet — so the area can be built and checked before
 * the firmware catches up. Reached with `?simulate=1` on /pro/logger;
 * nothing else uses it.
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
  };

  constructor(private readonly delayMs = 250) {}

  connect() {
    return new Promise<{ name: string }>((resolve) =>
      setTimeout(() => resolve({ name: "BIKIT-SIMULATED" }), this.delayMs),
    );
  }

  disconnect() {
    for (const d of [...this.disconnects]) d();
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
          ((k === "AUTO_STOP" || k === "AUTO_SLEEP" || k === "GPS_FIX_PROTECTION") &&
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
