/**
 * The BIKIT BLE application protocol (v1), over any BikitTransport.
 *
 * Mirrors the transport the firmware validated on a 3.1 MB session (S0048:
 * 12,940 DATA packets, 20 duplicates, 0 missing bytes, 756/756 CRC-valid
 * blocks) and the Python receiver that validated it — the same window
 * discipline, the same re-ACK rule, the same tolerance for retransmission.
 * The transport is STABLE; this file implements it and does not redesign it.
 *
 * Commands are text on CONTROL; replies are text lines on STATUS; file bytes
 * arrive on DATA as `u32 LE offset` + payload. The device sends one window
 * (1440 bytes ≈ six 240-byte packets), then waits for `ACK <windowEnd>`.
 * If the ACK does not arrive within 900 ms it retransmits the whole window,
 * up to 20 times, then gives up with `ERROR ACK_TIMEOUT`. `ACK <fileSize>`
 * closes the transfer and the device answers `TRANSFER_END`.
 *
 * Three rules the receiver must keep, each learnt the hard way upstream:
 *
 * 1. **Reconstruct by absolute offset, never by packet order.** Every byte
 *    lands where its offset says; a bitmap remembers which bytes have been
 *    seen. That is what makes a retransmitted window harmless.
 * 2. **Duplicates are normal, not errors** — and they never move progress.
 *    Progress is `uniqueBytes / totalBytes`, counted off the bitmap.
 * 3. **Data from below the current window means our ACK was lost.** The
 *    device only goes backwards to retransmit; when it does, re-send the ACK
 *    for the boundary we already reached (rate-limited) instead of waiting
 *    for it to time out and try again.
 *
 * `download()` resolves only when the device says TRANSFER_END AND every
 * byte is accounted for. Even then the ride is not imported: the caller
 * validates the .BKT (every block's CRC) before anything is stored. A
 * transfer completing and a session being accepted are two different facts.
 */

import type { BikitTransport, ControlWriteMode } from "./transport";

export interface BikitDeviceInfo {
  protocolVersion: number;
  firmware: string;
  uid: string;
  /** `INFO_BAT <percent> <millivolts>`. The percentage is an estimate off
   * the LiPo curve; the millivolts are the number to trust while that
   * estimate is being validated. `INFO_BAT NA` — the firmware could not
   * read the ADC — is `{ unavailable: true }`, so the screen can say "no
   * reading" instead of showing nothing. Null on firmware that predates
   * the line. */
  battery:
    | { percent: number; millivolts: number }
    | { unavailable: true; raw: string }
    | null;
  /** `INFO_GPS <state> <satellites> <hdop×100> <signal> <age_ms>` — the last
   * GGA snapshot the receiver kept, fix or not, answered at once and not
   * waited for. `hdop` is already divided back (95 → 0.95). */
  gps: {
    state: "FIX" | "NO_FIX" | "NO_DATA" | string;
    satellites: number;
    hdop: number;
    signal: "GOOD" | "FAIR" | "WEAK" | "NONE" | string;
    ageMs: number;
  } | null;
  /** `INFO_SD <status>` and `INFO_IMU <status>` — "OK", or the firmware's
   * own word for what is wrong. Null when the line was not sent. */
  sd: string | null;
  imu: string | null;
}

export interface BikitSessionEntry {
  id: number;
  sizeBytes: number;
}

export interface TransferProgress {
  uniqueBytes: number;
  totalBytes: number;
}

/** Protocol-level counters. For the developer view — never the user's. */
export interface TransferDiagnostics {
  packets: number;
  duplicates: number;
  acks: number;
  reAcks: number;
  windows: number;
  elapsedMs: number;
  payloadSize: number;
  windowSize: number;
}

export interface TransferResult {
  bytes: ArrayBuffer;
  diagnostics: TransferDiagnostics;
}

/** The device said no, in its own words — translated for the screen. */
export class BikitDeviceError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "BikitDeviceError";
  }
}

const COMMAND_TIMEOUT_MS = 5_000;
/** The list is timed on silence between lines, not on the whole — see
 * listSessions. 20 s is generous for one SD open; the device pauses 12 ms
 * between lines when it is flowing. */
const LIST_SILENCE_MS = 20_000;
/** How long to wait for LIST_END once every announced line is in. */
const LIST_END_GRACE_MS = 1_500;
/** After the first INFO line, how long to wait for the extra lines a newer
 * firmware sends before settling for the first alone. Firmware that sends
 * INFO_END never waits this out. */
const INFO_GRACE_MS = 800;
/** Once an INFO_* line has shown the block is coming, how much silence
 * between its lines before giving up on INFO_END and using what came. */
const INFO_BLOCK_SILENCE_MS = 4_000;
/** Longer than the device's own give-up (20 retries × 900 ms = 18 s), so
 * its ERROR ACK_TIMEOUT arrives before ours does and the message is its. */
const TRANSFER_STALL_MS = 30_000;
const REACK_MIN_INTERVAL_MS = 80;

/** The firmware's refusals, in the words the screen should use. */
export function describeDeviceMessage(raw: string): string {
  const [head, code = ""] = raw.split(/\s+/, 2);
  if (head === "BUSY") {
    if (code === "RECORDING")
      return "O dispositivo está a gravar. Pára a gravação para transferir sessões.";
    if (code === "CALIBRATING")
      return "O dispositivo está a calibrar. Espera que termine.";
    return "O dispositivo está ocupado. Tenta outra vez daqui a pouco.";
  }
  if (head === "ERROR") {
    switch (code) {
      case "SESSION_NOT_FOUND":
        return "Essa sessão já não está no cartão.";
      case "INVALID_SESSION":
        return "Número de sessão inválido.";
      case "INVALID_BKT_SIZE":
        return "O ficheiro no cartão tem um tamanho inválido — gravação incompleta.";
      case "OPEN_FAILED":
      case "READ_FAILED":
        return "O dispositivo não conseguiu ler o cartão.";
      case "TRANSFER_ACTIVE":
        return "Já há uma transferência em curso no dispositivo.";
      case "ACK_TIMEOUT":
        return "A ligação perdeu-se a meio da transferência.";
      case "NO_TRANSFER":
        return "O dispositivo não tem nenhuma transferência em curso.";
      case "UNKNOWN_COMMAND":
        return "O dispositivo não reconheceu o comando — firmware desatualizado?";
      case "AUTH_REQUIRED":
        return "O dispositivo pede o PIN antes de continuar.";
      default:
        return `O dispositivo devolveu um erro (${code || raw}).`;
    }
  }
  if (head === "TRANSFER_CANCELLED") return "Transferência cancelada.";
  if (head === "AUTH_FAIL") return "PIN incorreto.";
  return raw;
}

const isRefusal = (message: string) =>
  message.startsWith("ERROR ") ||
  message === "ERROR" ||
  message.startsWith("BUSY") ||
  message.startsWith("AUTH_FAIL");

/** The device's refusal that means "authenticate first" — the one the UI
 * answers with the PIN form instead of an error line. */
export const AUTH_REQUIRED = "ERROR AUTH_REQUIRED";

/** One line of the conversation, for the developer view: what we wrote on
 * CONTROL and what came back on STATUS. DATA packets are not logged — there
 * are thousands, and the counters already describe them. */
export interface BikitLogEntry {
  at: number;
  direction: "in" | "out";
  text: string;
}

const LOG_CAPACITY = 200;

export class BikitDevice {
  readonly name: string;
  /** The last LOG_CAPACITY lines, oldest first. */
  readonly log: BikitLogEntry[] = [];
  private readonly logHandlers = new Set<(entry: BikitLogEntry) => void>();
  private readonly unsubscribe: (() => void)[] = [];
  private readonly statusHandlers = new Set<(message: string) => void>();
  private readonly dataHandlers = new Set<(packet: Uint8Array) => void>();
  private readonly disconnectHandlers = new Set<() => void>();
  private connected = true;

  private constructor(
    private readonly transport: BikitTransport,
    name: string,
  ) {
    this.name = name;
    this.unsubscribe.push(
      transport.subscribeStatus((message) => {
        this.record("in", message);
        for (const handler of [...this.statusHandlers]) handler(message);
      }),
      transport.subscribeData((packet) => {
        for (const handler of [...this.dataHandlers]) handler(packet);
      }),
      transport.subscribeDisconnect(() => {
        this.connected = false;
        for (const handler of [...this.disconnectHandlers]) handler();
      }),
    );
  }

  /** Opens the transport and wraps it. On Web Bluetooth this must run inside
   * a user gesture — the picker is the transport's, not ours. */
  static async connect(transport: BikitTransport): Promise<BikitDevice> {
    const { name } = await transport.connect();
    return new BikitDevice(transport, name);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  disconnect(): void {
    for (const off of this.unsubscribe) off();
    this.transport.disconnect();
    this.connected = false;
  }

  onLog(handler: (entry: BikitLogEntry) => void): () => void {
    this.logHandlers.add(handler);
    return () => this.logHandlers.delete(handler);
  }

  private record(direction: "in" | "out", text: string) {
    const entry = { at: Date.now(), direction, text };
    this.log.push(entry);
    if (this.log.length > LOG_CAPACITY) this.log.shift();
    for (const handler of [...this.logHandlers]) handler(entry);
  }

  /** Every CONTROL write goes through here so the log sees it — the PIN
   * excepted: the log is for pasting, and a secret must not ride in it. */
  private write(command: string, mode: ControlWriteMode): Promise<void> {
    this.record("out", command.startsWith("AUTH ") ? "AUTH ••••" : command);
    return this.transport.writeControl(command, mode);
  }

  /**
   * Writes a command and waits for the STATUS line that answers it. Any
   * ERROR/BUSY line in the meantime rejects with the device's own reason;
   * silence past the timeout rejects with ours.
   */
  private async request<T>(
    command: string,
    accept: (message: string) => T | undefined,
    timeoutMs = COMMAND_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.statusHandlers.delete(onStatus);
        this.disconnectHandlers.delete(onDisconnect);
        fn();
      };
      const onStatus = (message: string) => {
        const value = accept(message);
        if (value !== undefined) finish(() => resolve(value));
        else if (isRefusal(message))
          finish(() =>
            reject(
              new BikitDeviceError(describeDeviceMessage(message), message),
            ),
          );
      };
      const onDisconnect = () =>
        finish(() => reject(new Error("A ligação ao dispositivo caiu.")));
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(
              new Error(
                `O dispositivo não respondeu a ${command.split(" ")[0]}.`,
              ),
            ),
          ),
        timeoutMs,
      );
      this.statusHandlers.add(onStatus);
      this.disconnectHandlers.add(onDisconnect);
      this.write(command, "response").catch((error: unknown) =>
        finish(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        ),
      );
    });
  }

  ping(): Promise<void> {
    return this.request("PING", (m) => (m === "PONG" ? true : undefined)).then(
      () => undefined,
    );
  }

  /**
   * `AUTH <pin>` → `AUTH_OK`, or `AUTH_FAIL` (rejects with "PIN incorreto").
   *
   * Authentication is per BLE connection: the device forgets it the moment
   * the link drops, so every connect() runs this again — a saved PIN saves
   * the typing, never the step. Before AUTH_OK the device answers only PING
   * and AUTH; everything else gets `ERROR AUTH_REQUIRED`.
   *
   * Resolves "not-required" on firmware that predates the PIN — it answers
   * `ERROR UNKNOWN_COMMAND` to a command it has never heard of, and that is
   * a logger with no lock, not a wrong key.
   */
  auth(pin: string): Promise<"ok" | "not-required"> {
    return this.request(`AUTH ${pin.trim()}`, (m) => {
      if (m === "AUTH_OK") return "ok";
      if (m === "ERROR UNKNOWN_COMMAND") return "not-required";
      return undefined;
    });
  }

  /**
   * `INFO <protocol> <firmware> <uid>`, then — on firmware from 2026-09-05
   * on — `INFO_BAT`, `INFO_GPS`, `INFO_SD`, `INFO_IMU` and `INFO_END`.
   *
   * The first line is the contract older firmware honours alone, so this
   * resolves either way: at `INFO_END` when it comes, or after a short
   * grace with only the first line in hand. The extra lines fill in what
   * they describe; what was not sent stays null and the screen leaves it
   * out — no invented "OK".
   */
  info(): Promise<BikitDeviceInfo> {
    return new Promise<BikitDeviceInfo>((resolve, reject) => {
      let info: BikitDeviceInfo | null = null;
      let settled = false;
      let grace: ReturnType<typeof setTimeout> | null = null;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (grace) clearTimeout(grace);
        this.statusHandlers.delete(onStatus);
        this.disconnectHandlers.delete(onDisconnect);
        fn();
      };
      const done = () => {
        // A const copy: `info` is a `let` the closure below cannot narrow.
        const value = info;
        if (value) finish(() => resolve(value));
      };
      // Two waits, because two firmwares. Before any INFO_* line we do not
      // know which one is talking: a short grace settles for the first line
      // alone (old firmware). The moment an INFO_* line arrives we know the
      // block is coming and wait for its INFO_END with a longer silence —
      // the battery read behind INFO_BAT touches an ADC and may not be
      // instant, and a line that takes a second must not be the line that
      // gets dropped.
      let inBlock = false;
      const armGrace = () => {
        if (grace) clearTimeout(grace);
        grace = setTimeout(
          done,
          inBlock ? INFO_BLOCK_SILENCE_MS : INFO_GRACE_MS,
        );
      };
      // "82" and "82%" and "3975mV" all read as their number; a firmware
      // that grows a unit onto the value must not zero the reading.
      const num = (text: string | undefined) =>
        text === undefined ? NaN : parseFloat(text);

      const onStatus = (m: string) => {
        if (m.startsWith("INFO ")) {
          const [, version, firmware, uid] = m.split(/\s+/);
          info = {
            protocolVersion: Number(version) || 0,
            firmware: firmware ?? "",
            uid: uid ?? "",
            battery: null,
            gps: null,
            sd: null,
            imu: null,
          };
          armGrace();
          return;
        }
        if (!info) {
          if (isRefusal(m))
            finish(() =>
              reject(new BikitDeviceError(describeDeviceMessage(m), m)),
            );
          return;
        }
        const parts = m.split(/\s+/);
        const key = parts[0]?.toUpperCase();
        if (!key?.startsWith("INFO_")) return; // not ours
        inBlock = true;
        switch (key) {
          case "INFO_BAT": {
            const percent = num(parts[1]);
            const millivolts = num(parts[2]);
            info.battery =
              Number.isFinite(percent) && Number.isFinite(millivolts)
                ? { percent, millivolts }
                : // "NA" (or anything not a number): the line came, the
                  // reading did not.
                  { unavailable: true, raw: parts.slice(1).join(" ") };
            armGrace();
            return;
          }
          case "INFO_GPS": {
            const satellites = num(parts[2]);
            const hdopCenti = num(parts[3]);
            const ageMs = num(parts[5]);
            info.gps = {
              state: (parts[1] ?? "NO_DATA").toUpperCase(),
              satellites: Number.isFinite(satellites) ? satellites : 0,
              hdop: Number.isFinite(hdopCenti) ? hdopCenti / 100 : NaN,
              signal: (parts[4] ?? "NONE").toUpperCase(),
              ageMs: Number.isFinite(ageMs) ? ageMs : NaN,
            };
            armGrace();
            return;
          }
          case "INFO_SD":
            info.sd = parts.slice(1).join(" ") || null;
            armGrace();
            return;
          case "INFO_IMU":
            info.imu = parts.slice(1).join(" ") || null;
            armGrace();
            return;
          case "INFO_END":
            done();
            return;
          default:
            // An INFO_* line this build does not know: part of the block,
            // so keep waiting for its end, but nothing to read from it.
            armGrace();
            return;
        }
      };
      const onDisconnect = () =>
        finish(() => reject(new Error("A ligação ao dispositivo caiu.")));
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(new Error("O dispositivo não respondeu a INFO.")),
          ),
        COMMAND_TIMEOUT_MS,
      );

      this.statusHandlers.add(onStatus);
      this.disconnectHandlers.add(onDisconnect);
      this.write("INFO", "response").catch((error: unknown) =>
        finish(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        ),
      );
    });
  }

  /**
   * `LIST_BEGIN <n>`, then `SESSION <id> <bytes>` per session, then
   * `LIST_END`. The device only lists files whose size is a whole number of
   * 4096-byte blocks, so what comes back is already the importable set.
   *
   * Built to survive a slow card and a lost line, because the listing is
   * the one part of the protocol the Python receiver never exercised over
   * BLE (it went PING → GET). The device scans the card twice before and
   * during the list — once to count, once to send — with an SD open per
   * session each time, so the timeout is on SILENCE and not on the whole:
   * lines can trickle in for as long as they keep coming. And a LIST_END
   * that never arrives is not fatal when LIST_BEGIN said how many to expect
   * and that many have been seen — a notification lost in a burst should
   * not cost the whole list.
   */
  listSessions(): Promise<BikitSessionEntry[]> {
    return new Promise<BikitSessionEntry[]>((resolve, reject) => {
      const entries: BikitSessionEntry[] = [];
      let expected: number | null = null;
      let settled = false;
      let silence: ReturnType<typeof setTimeout> | null = null;
      let grace: ReturnType<typeof setTimeout> | null = null;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (silence) clearTimeout(silence);
        if (grace) clearTimeout(grace);
        this.statusHandlers.delete(onStatus);
        this.disconnectHandlers.delete(onDisconnect);
        fn();
      };
      const done = () =>
        finish(() => resolve([...entries].sort((a, b) => b.id - a.id)));
      const armSilence = () => {
        if (silence) clearTimeout(silence);
        silence = setTimeout(
          () =>
            finish(() =>
              reject(
                new Error(
                  entries.length > 0 || expected !== null
                    ? `A lista parou a meio: ${entries.length} sessão(ões) recebida(s)${expected !== null ? ` de ${expected}` : ""}, e nada mais em ${LIST_SILENCE_MS / 1000} s.`
                    : `O dispositivo não respondeu a SESSIONS em ${LIST_SILENCE_MS / 1000} s.`,
                ),
              ),
            ),
          LIST_SILENCE_MS,
        );
      };
      const maybeCompleteByCount = () => {
        if (expected === null || entries.length < expected) return;
        // All announced lines are in; give LIST_END a moment, then stop
        // waiting for it.
        if (grace) clearTimeout(grace);
        grace = setTimeout(() => {
          this.record(
            "in",
            "(LIST_END em falta — lista fechada pela contagem)",
          );
          done();
        }, LIST_END_GRACE_MS);
      };

      const onStatus = (message: string) => {
        if (message.startsWith("LIST_BEGIN")) {
          const n = Number(message.split(/\s+/)[1]);
          expected = Number.isFinite(n) ? n : null;
          armSilence();
          maybeCompleteByCount(); // an empty card announces 0 and may stop
          return;
        }
        if (message.startsWith("SESSION ")) {
          const [, id, size] = message.split(/\s+/);
          const entry = { id: Number(id), sizeBytes: Number(size) };
          if (Number.isFinite(entry.id) && Number.isFinite(entry.sizeBytes))
            entries.push(entry);
          armSilence();
          maybeCompleteByCount();
          return;
        }
        if (message === "LIST_END") {
          done();
          return;
        }
        if (isRefusal(message))
          finish(() =>
            reject(
              new BikitDeviceError(describeDeviceMessage(message), message),
            ),
          );
      };
      const onDisconnect = () =>
        finish(() => reject(new Error("A ligação ao dispositivo caiu.")));

      this.statusHandlers.add(onStatus);
      this.disconnectHandlers.add(onDisconnect);
      armSilence();
      this.write("SESSIONS", "response").catch((error: unknown) =>
        finish(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        ),
      );
    });
  }

  /** Asks the device to drop whatever transfer it has going. Safe to call
   * with none — it answers `CANCELLED NONE`. */
  async cancel(): Promise<void> {
    await this.write("CANCEL", "response").catch(() => {});
  }

  /**
   * Downloads one session's .BKT, byte-exact. Resolves with the file and the
   * protocol counters; rejects on the device's refusal, a stall, a dropped
   * link, or the caller's abort. The bytes are NOT validated here — see
   * the file header.
   */
  download(
    sessionId: number,
    options: {
      onProgress?: (progress: TransferProgress) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<TransferResult> {
    return new Promise<TransferResult>((resolve, reject) => {
      // ---- transfer state ------------------------------------------------
      let size = 0;
      let windowSize = 0;
      let buffer: Uint8Array | null = null;
      let have: Uint8Array | null = null;
      let unique = 0;
      let windowStart = 0;
      let windowEnd = 0;
      let windowReceived = 0;
      let ackInFlight = false;
      let lastReAckAt = 0;
      const startedAt = Date.now();
      const diagnostics: TransferDiagnostics = {
        packets: 0,
        duplicates: 0,
        acks: 0,
        reAcks: 0,
        windows: 0,
        elapsedMs: 0,
        payloadSize: 0,
        windowSize: 0,
      };

      let settled = false;
      let stallTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (stallTimer) clearTimeout(stallTimer);
        this.statusHandlers.delete(onStatus);
        this.dataHandlers.delete(onData);
        this.disconnectHandlers.delete(onDisconnect);
        options.signal?.removeEventListener("abort", onAbort);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const succeed = () => {
        if (settled || !buffer) return;
        settled = true;
        cleanup();
        diagnostics.elapsedMs = Date.now() - startedAt;
        // A fresh ArrayBuffer of exactly `size` bytes, owned by the caller.
        const out = buffer.slice().buffer as ArrayBuffer;
        resolve({ bytes: out, diagnostics });
      };
      const armStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          this.cancel();
          fail(
            new Error(
              `Sem resposta do dispositivo durante ${TRANSFER_STALL_MS / 1000} s.`,
            ),
          );
        }, TRANSFER_STALL_MS);
      };

      const setWindow = (start: number) => {
        windowStart = start;
        windowEnd = Math.min(start + windowSize, size);
        windowReceived = 0;
        ackInFlight = false;
        diagnostics.windows++;
      };

      const sendAck = async (offset: number, advance: boolean) => {
        // Counted when sent, not when the write resolves: the device can
        // answer the final ACK with TRANSFER_END before the write's promise
        // settles, and the transfer would close with one ACK unaccounted.
        if (advance) diagnostics.acks++;
        else diagnostics.reAcks++;
        try {
          await this.write(`ACK ${offset}`, "no-response");
        } catch (error) {
          fail(
            new Error(
              `Falhou o ACK em ${offset}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
          return;
        }
        if (settled) return;
        // Advance exactly one window. On the final ACK there is nothing to
        // advance to — the device answers TRANSFER_END — and ackInFlight
        // stays up so no second ACK goes out.
        if (advance && offset < size) setWindow(offset);
      };

      // ---- handlers --------------------------------------------------------
      const onStatus = (message: string) => {
        armStall();
        if (message.startsWith("TRANSFER_BEGIN ")) {
          const [, sid, total, payload, win] = message.split(/\s+/).map(Number);
          if (sid !== sessionId) {
            fail(
              new Error(
                `O dispositivo começou a enviar a sessão ${sid} em vez da ${sessionId}.`,
              ),
            );
            return;
          }
          if (!(total > 0) || !(payload > 0) || !(win > 0)) {
            fail(new Error("TRANSFER_BEGIN sem geometria — firmware antigo?"));
            return;
          }
          size = total;
          windowSize = win;
          diagnostics.payloadSize = payload;
          diagnostics.windowSize = win;
          buffer = new Uint8Array(size);
          have = new Uint8Array(size);
          setWindow(0);
          options.onProgress?.({ uniqueBytes: 0, totalBytes: size });
          return;
        }
        if (message.startsWith("TRANSFER_END")) {
          if (!buffer || unique !== size) {
            fail(
              new Error(
                `O dispositivo deu a transferência por terminada com ${size - unique} bytes em falta.`,
              ),
            );
            return;
          }
          succeed();
          return;
        }
        if (isRefusal(message) || message.startsWith("TRANSFER_CANCELLED")) {
          fail(new BikitDeviceError(describeDeviceMessage(message), message));
        }
        // PONG, INFO, BENCH_OK, CANCELLED NONE… — not ours, ignored.
      };

      const onData = (packet: Uint8Array) => {
        if (!buffer || !have || packet.length < 5) return;
        armStall();
        const view = new DataView(
          packet.buffer,
          packet.byteOffset,
          packet.byteLength,
        );
        const offset = view.getUint32(0, true);
        if (offset >= size) return;
        const end = Math.min(offset + packet.length - 4, size);
        diagnostics.packets++;

        // Land the bytes where they belong, whatever window they came from.
        let fresh = 0;
        for (let i = offset, p = 4; i < end; i++, p++) {
          buffer[i] = packet[p];
          if (have[i] === 0) {
            have[i] = 1;
            fresh++;
            if (i >= windowStart && i < windowEnd) windowReceived++;
          }
        }
        if (fresh === 0) diagnostics.duplicates++;
        else {
          unique += fresh;
          options.onProgress?.({ uniqueBytes: unique, totalBytes: size });
        }

        // Bytes from BELOW the current window: the device is retransmitting
        // a window we already completed, so it never saw our ACK. Say it
        // again, but not more than once per 80 ms and not while one is out.
        if (offset < windowStart && windowStart > 0 && !ackInFlight) {
          const now = Date.now();
          if (now - lastReAckAt >= REACK_MIN_INTERVAL_MS) {
            lastReAckAt = now;
            void sendAck(windowStart, false);
          }
        }

        // The current window is whole: acknowledge its end. Only the
        // current window drives this — stale packets cannot.
        if (windowReceived === windowEnd - windowStart && !ackInFlight) {
          ackInFlight = true;
          void sendAck(windowEnd, true);
        }
      };

      const onDisconnect = () =>
        fail(
          new Error("A ligação ao dispositivo caiu durante a transferência."),
        );

      const onAbort = () => {
        void this.cancel();
        fail(new BikitDeviceError("Transferência cancelada.", "ABORTED"));
      };

      if (options.signal?.aborted) {
        fail(new BikitDeviceError("Transferência cancelada.", "ABORTED"));
        return;
      }
      options.signal?.addEventListener("abort", onAbort);
      this.statusHandlers.add(onStatus);
      this.dataHandlers.add(onData);
      this.disconnectHandlers.add(onDisconnect);
      armStall();

      this.write(`GET ${sessionId}`, "response").catch((error: unknown) =>
        fail(error instanceof Error ? error : new Error(String(error))),
      );
    });
  }
}
