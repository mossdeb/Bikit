import { describe, expect, it } from "vitest";
import {
  BikitDevice,
  BikitDeviceError,
  describeDeviceMessage,
} from "./protocol";
import type { BikitTransport, ControlWriteMode } from "./transport";

/**
 * A fake logger that speaks the firmware's protocol over the transport
 * interface — which is exactly what the interface exists for. It sends
 * windows of DATA and waits for ACKs the way the real one does, and can be
 * told to misbehave in the ways the real one legitimately does: duplicate
 * a packet, lose an ACK and retransmit the window, refuse because it is
 * recording.
 */
class FakeLogger implements BikitTransport {
  private status = new Set<(m: string) => void>();
  private data = new Set<(p: Uint8Array) => void>();
  private disconnects = new Set<() => void>();
  readonly written: { command: string; mode: ControlWriteMode }[] = [];

  file = new Uint8Array(0);
  sessions: { id: number; size: number }[] = [];
  payload = 240;
  window = 1440;
  busy: string | null = null;
  /** Packet indexes (within the whole transfer) to send twice. */
  duplicateEvery = 0;
  /** Drop the first ACK of these window starts, then retransmit the window
   * — what the device does when an ACK is lost in the air. */
  loseAckForWindowStarts = new Set<number>();
  private lostOnce = new Set<number>();
  /** Swallow LIST_END — a notification lost in a burst, or a firmware that
   * stops after the last SESSION line. */
  dropListEnd = false;
  /** Send the INFO_* block newer firmware adds after the first INFO line. */
  extendedInfo = false;
  /** The device's PIN. Null = a firmware without the lock, which answers
   * AUTH with ERROR UNKNOWN_COMMAND and everything else at once. */
  pin: string | null = null;
  private authed = false;
  /** Delay the block by this much — an ADC read behind INFO_BAT is not
   * instant, and the block must still be waited for. */
  slowInfoMs = 0;

  private ackOffset = 0;
  private windowEnd = 0;
  private active = false;
  private sid = 0;
  private packetIndex = 0;

  connect() {
    return Promise.resolve({ name: "BIKIT-TEST" });
  }
  disconnect() {
    // Authentication is per connection — the device forgets it here.
    this.authed = false;
    for (const d of this.disconnects) d();
  }
  subscribeStatus(h: (m: string) => void) {
    this.status.add(h);
    return () => this.status.delete(h);
  }
  subscribeData(h: (p: Uint8Array) => void) {
    this.data.add(h);
    return () => this.data.delete(h);
  }
  subscribeDisconnect(h: () => void) {
    this.disconnects.add(h);
    return () => this.disconnects.delete(h);
  }

  private notify(m: string) {
    queueMicrotask(() => {
      for (const h of this.status) h(m);
    });
  }
  /** For subclasses that fake their own lines. */
  protected statusListeners() {
    return [...this.status];
  }

  async writeControl(command: string, mode: ControlWriteMode) {
    this.written.push({ command, mode });
    const [head, arg] = command.split(" ");
    if (head === "PING") this.notify("PONG");
    else if (head === "AUTH") {
      if (this.pin === null) return this.notify("ERROR UNKNOWN_COMMAND");
      if (arg === this.pin) {
        this.authed = true;
        return this.notify("AUTH_OK");
      }
      return this.notify("AUTH_FAIL");
    } else if (this.pin !== null && !this.authed)
      this.notify("ERROR AUTH_REQUIRED");
    else if (head === "INFO") {
      this.notify("INFO 1 0.3.11.0-test ABCDEF0123456789");
      if (this.extendedInfo) {
        const rest = () => {
          this.notify("INFO_BAT 82 3975");
          this.notify("INFO_GPS FIX 11 95 GOOD 420");
          this.notify("INFO_SD OK");
          this.notify("INFO_IMU OK");
          this.notify("INFO_END");
        };
        if (this.slowInfoMs > 0) setTimeout(rest, this.slowInfoMs);
        else rest();
      }
    } else if (head === "SESSIONS") {
      if (this.busy) return this.notify(`BUSY ${this.busy}`);
      this.notify(`LIST_BEGIN ${this.sessions.length}`);
      for (const s of this.sessions) this.notify(`SESSION ${s.id} ${s.size}`);
      if (!this.dropListEnd) this.notify("LIST_END");
    } else if (head === "GET") {
      if (this.busy) return this.notify(`BUSY ${this.busy}`);
      const id = Number(arg);
      if (!this.sessions.some((s) => s.id === id))
        return this.notify("ERROR SESSION_NOT_FOUND");
      this.sid = id;
      this.active = true;
      this.ackOffset = 0;
      this.packetIndex = 0;
      this.notify(
        `TRANSFER_BEGIN ${id} ${this.file.length} ${this.payload} ${this.window}`,
      );
      setTimeout(() => this.sendWindow(), 0);
    } else if (head === "ACK") {
      const off = Number(arg);
      if (!this.active) return this.notify("ERROR NO_TRANSFER");
      if (off === this.ackOffset) return; // duplicate ACK, harmless
      if (off !== this.windowEnd)
        return this.notify(`ERROR BAD_ACK ${off} ${this.windowEnd}`);
      if (
        this.loseAckForWindowStarts.has(this.ackOffset) &&
        !this.lostOnce.has(this.ackOffset)
      ) {
        // "Never saw it": retransmit the same window after a pause.
        this.lostOnce.add(this.ackOffset);
        setTimeout(() => this.sendWindow(), 5);
        return;
      }
      this.ackOffset = off;
      if (off >= this.file.length) {
        this.active = false;
        this.notify(`TRANSFER_END ${this.sid} ${this.file.length}`);
        return;
      }
      setTimeout(() => this.sendWindow(), 0);
    } else if (head === "CANCEL") {
      if (!this.active) return this.notify("CANCELLED NONE");
      this.active = false;
      this.notify(`TRANSFER_CANCELLED ${this.sid} ${this.ackOffset}`);
    } else this.notify("ERROR UNKNOWN_COMMAND");
  }

  private sendWindow() {
    if (!this.active) return;
    this.windowEnd = Math.min(this.ackOffset + this.window, this.file.length);
    for (let off = this.ackOffset; off < this.windowEnd; off += this.payload) {
      const end = Math.min(off + this.payload, this.windowEnd);
      const packet = new Uint8Array(4 + (end - off));
      new DataView(packet.buffer).setUint32(0, off, true);
      packet.set(this.file.subarray(off, end), 4);
      this.packetIndex++;
      const emit = () => {
        for (const h of this.data) h(packet.slice());
      };
      queueMicrotask(emit);
      if (this.duplicateEvery && this.packetIndex % this.duplicateEvery === 0)
        queueMicrotask(emit);
    }
  }
}

function makeFile(size: number) {
  const f = new Uint8Array(size);
  for (let i = 0; i < size; i++) f[i] = (i * 31 + (i >> 8)) & 0xff;
  return f;
}

describe("BikitDevice", () => {
  it("pings, reads info and lists sessions newest first", async () => {
    const logger = new FakeLogger();
    logger.sessions = [
      { id: 46, size: 311_296 },
      { id: 48, size: 3_100_672 },
      { id: 47, size: 335_872 },
    ];
    const device = await BikitDevice.connect(logger);
    expect(device.name).toBe("BIKIT-TEST");
    await device.ping();
    const info = await device.info();
    expect(info).toEqual({
      protocolVersion: 1,
      firmware: "0.3.11.0-test",
      uid: "ABCDEF0123456789",
      battery: null,
      gps: null,
      sd: null,
      imu: null,
    });
    const sessions = await device.listSessions();
    expect(sessions.map((s) => s.id)).toEqual([48, 47, 46]);
    expect(sessions[0].sizeBytes).toBe(3_100_672);
  });

  it("downloads a file byte-exact across many windows, with a partial last window", async () => {
    const logger = new FakeLogger();
    const file = makeFile(1440 * 3 + 500); // three full windows + a tail
    logger.file = file;
    logger.sessions = [{ id: 7, size: file.length }];
    const device = await BikitDevice.connect(logger);
    const progress: number[] = [];
    const result = await device.download(7, {
      onProgress: (p) => progress.push(p.uniqueBytes),
    });
    expect(new Uint8Array(result.bytes)).toEqual(file);
    expect(result.bytes.byteLength).toBe(file.length);
    expect(result.diagnostics.windows).toBe(4);
    expect(result.diagnostics.acks).toBe(4);
    expect(result.diagnostics.duplicates).toBe(0);
    // Progress climbs monotonically to the total and never past it.
    for (let i = 1; i < progress.length; i++)
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    expect(progress[progress.length - 1]).toBe(file.length);
    // ACKs go without response; commands with.
    expect(logger.written.find((w) => w.command.startsWith("ACK"))?.mode).toBe(
      "no-response",
    );
    expect(logger.written.find((w) => w.command.startsWith("GET"))?.mode).toBe(
      "response",
    );
  });

  it("tolerates duplicate packets: counted, harmless, and never moving progress", async () => {
    const logger = new FakeLogger();
    const file = makeFile(1440 * 2);
    logger.file = file;
    logger.sessions = [{ id: 1, size: file.length }];
    logger.duplicateEvery = 3;
    const device = await BikitDevice.connect(logger);
    let maxUnique = 0;
    const result = await device.download(1, {
      onProgress: (p) => {
        expect(p.uniqueBytes).toBeLessThanOrEqual(p.totalBytes);
        maxUnique = Math.max(maxUnique, p.uniqueBytes);
      },
    });
    expect(new Uint8Array(result.bytes)).toEqual(file);
    expect(result.diagnostics.duplicates).toBeGreaterThan(0);
    expect(result.diagnostics.packets).toBe(12 + result.diagnostics.duplicates);
    expect(maxUnique).toBe(file.length);
  });

  it("re-ACKs a completed boundary when the device retransmits an old window", async () => {
    const logger = new FakeLogger();
    const file = makeFile(1440 * 3);
    logger.file = file;
    logger.sessions = [{ id: 2, size: file.length }];
    logger.loseAckForWindowStarts.add(1440); // the ACK for window 2 is "lost"
    const device = await BikitDevice.connect(logger);
    const result = await device.download(2);
    expect(new Uint8Array(result.bytes)).toEqual(file);
    expect(result.diagnostics.reAcks).toBeGreaterThan(0);
    expect(result.diagnostics.duplicates).toBeGreaterThan(0);
    // The re-ACK repeats the boundary already reached, not a new one.
    const acks = logger.written
      .filter((w) => w.command.startsWith("ACK "))
      .map((w) => Number(w.command.slice(4)));
    expect(acks.filter((a) => a === 2880).length).toBeGreaterThanOrEqual(2);
  });

  it("refuses with the device's own reason while it is recording", async () => {
    const logger = new FakeLogger();
    logger.busy = "RECORDING";
    logger.sessions = [{ id: 1, size: 4096 }];
    const device = await BikitDevice.connect(logger);
    await expect(device.listSessions()).rejects.toMatchObject({
      name: "BikitDeviceError",
      raw: "BUSY RECORDING",
    });
    await expect(device.download(1)).rejects.toBeInstanceOf(BikitDeviceError);
  });

  it("reports a session that is no longer on the card", async () => {
    const logger = new FakeLogger();
    logger.sessions = [{ id: 1, size: 4096 }];
    const device = await BikitDevice.connect(logger);
    await expect(device.download(9)).rejects.toThrow("já não está no cartão");
  });

  it("cancels: writes CANCEL and rejects as cancelled", async () => {
    const logger = new FakeLogger();
    // A big file so the transfer is still running when we abort.
    logger.file = makeFile(1440 * 200);
    logger.sessions = [{ id: 3, size: logger.file.length }];
    const device = await BikitDevice.connect(logger);
    const controller = new AbortController();
    const pending = device.download(3, {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.uniqueBytes > 1440 * 2) controller.abort();
      },
    });
    await expect(pending).rejects.toMatchObject({ raw: "ABORTED" });
    expect(logger.written.some((w) => w.command === "CANCEL")).toBe(true);
  });

  it("fails when the link drops mid-transfer", async () => {
    const logger = new FakeLogger();
    logger.file = makeFile(1440 * 50);
    logger.sessions = [{ id: 4, size: logger.file.length }];
    const device = await BikitDevice.connect(logger);
    const pending = device.download(4, {
      onProgress: (p) => {
        if (p.uniqueBytes >= 1440) logger.disconnect();
      },
    });
    await expect(pending).rejects.toThrow("caiu");
    expect(device.isConnected).toBe(false);
  });
});

describe("BikitDevice — PIN authentication", () => {
  it("refuses everything but PING before AUTH, and opens up after AUTH_OK", async () => {
    const logger = new FakeLogger();
    logger.pin = "1234";
    logger.sessions = [{ id: 1, size: 4096 }];
    const device = await BikitDevice.connect(logger);
    await device.ping(); // allowed before auth
    await expect(device.info()).rejects.toMatchObject({
      raw: "ERROR AUTH_REQUIRED",
    });
    await expect(device.listSessions()).rejects.toMatchObject({
      raw: "ERROR AUTH_REQUIRED",
    });
    await expect(device.auth("0000")).rejects.toMatchObject({
      raw: "AUTH_FAIL",
      message: "PIN incorreto.",
    });
    await expect(device.auth("1234")).resolves.toBe("ok");
    expect((await device.listSessions()).map((s) => s.id)).toEqual([1]);
  });

  it("treats a firmware without the lock as not requiring a PIN", async () => {
    const logger = new FakeLogger(); // pin stays null
    const device = await BikitDevice.connect(logger);
    await expect(device.auth("1234")).resolves.toBe("not-required");
    await device.info();
  });

  it("never writes the PIN into the log", async () => {
    const logger = new FakeLogger();
    logger.pin = "1234";
    const device = await BikitDevice.connect(logger);
    await device.auth("1234");
    const out = device.log
      .filter((l) => l.direction === "out")
      .map((l) => l.text);
    expect(out).toContain("AUTH ••••");
    expect(out.some((t) => t.includes("1234"))).toBe(false);
    // The wire still carried the real one.
    expect(logger.written.some((w) => w.command === "AUTH 1234")).toBe(true);
  });
});

describe("BikitDevice — extended INFO", () => {
  it("reads battery, GPS, SD and IMU from the INFO_* block and stops at INFO_END", async () => {
    const logger = new FakeLogger();
    logger.extendedInfo = true;
    const device = await BikitDevice.connect(logger);
    const started = Date.now();
    const info = await device.info();
    // INFO_END settles it at once — no grace wait.
    expect(Date.now() - started).toBeLessThan(500);
    expect(info.firmware).toBe("0.3.11.0-test");
    expect(info.battery).toEqual({ percent: 82, millivolts: 3975 });
    expect(info.gps).toEqual({
      state: "FIX",
      satellites: 11,
      hdop: 0.95,
      signal: "GOOD",
      ageMs: 420,
    });
    expect(info.sd).toBe("OK");
    expect(info.imu).toBe("OK");
  });

  it("still gets the battery when the block starts late, and reads units off the numbers", async () => {
    const logger = new FakeLogger();
    logger.extendedInfo = true;
    logger.slowInfoMs = 300; // inside the first-line grace — the block wins
    const device = await BikitDevice.connect(logger);
    const info = await device.info();
    expect(info.battery).toEqual({ percent: 82, millivolts: 3975 });
    expect(info.gps?.state).toBe("FIX");
  });

  it("reports INFO_BAT NA as a reading that was not available, not as no line", async () => {
    class NaLogger extends FakeLogger {
      async writeControl(command: string, mode: ControlWriteMode) {
        if (command === "INFO") {
          this.written.push({ command, mode });
          for (const line of ["INFO 1 fw UID", "INFO_BAT NA", "INFO_END"])
            queueMicrotask(() => {
              for (const h of this.statusListeners()) h(line);
            });
          return;
        }
        return super.writeControl(command, mode);
      }
    }
    const device = await BikitDevice.connect(new NaLogger());
    const info = await device.info();
    expect(info.battery).toEqual({ unavailable: true, raw: "NA" });
  });

  it("tolerates units glued to the values", async () => {
    class UnitLogger extends FakeLogger {
      async writeControl(command: string, mode: ControlWriteMode) {
        if (command === "INFO") {
          this.written.push({ command, mode });
          for (const line of [
            "INFO 1 fw UID",
            "INFO_BAT 82% 3975mV",
            "INFO_END",
          ])
            queueMicrotask(() => this.emit(line));
          return;
        }
        return super.writeControl(command, mode);
      }
      emit(line: string) {
        // Reach the private status set through the public subscribe path.
        for (const h of this.statusListeners()) h(line);
      }
    }
    const device = await BikitDevice.connect(new UnitLogger());
    const info = await device.info();
    expect(info.battery).toEqual({ percent: 82, millivolts: 3975 });
  });
});

describe("BikitDevice — list robustness and log", () => {
  it("resolves the list from LIST_BEGIN's count when LIST_END never arrives", async () => {
    const logger = new FakeLogger();
    logger.sessions = [
      { id: 1, size: 4096 },
      { id: 2, size: 8192 },
    ];
    logger.dropListEnd = true;
    const device = await BikitDevice.connect(logger);
    const sessions = await device.listSessions();
    expect(sessions.map((s) => s.id)).toEqual([2, 1]);
  });

  it("keeps a log of every line in and every command out", async () => {
    const logger = new FakeLogger();
    logger.sessions = [{ id: 5, size: 4096 }];
    const device = await BikitDevice.connect(logger);
    const seen: string[] = [];
    device.onLog((entry) => seen.push(`${entry.direction} ${entry.text}`));
    await device.ping();
    await device.listSessions();
    expect(seen).toEqual([
      "out PING",
      "in PONG",
      "out SESSIONS",
      "in LIST_BEGIN 1",
      "in SESSION 5 4096",
      "in LIST_END",
    ]);
    expect(device.log.length).toBe(6);
  });
});

describe("describeDeviceMessage", () => {
  it("translates the firmware's refusals for the screen", () => {
    expect(describeDeviceMessage("BUSY RECORDING")).toMatch(/a gravar/);
    expect(describeDeviceMessage("ERROR SESSION_NOT_FOUND")).toMatch(/cartão/);
    expect(describeDeviceMessage("ERROR ACK_TIMEOUT 48 1440")).toMatch(
      /perdeu-se/,
    );
    expect(describeDeviceMessage("TRANSFER_CANCELLED 48 2880")).toMatch(
      /cancelada/,
    );
  });
});
