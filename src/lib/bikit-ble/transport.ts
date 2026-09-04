/**
 * The transport boundary of the BIKIT BLE stack — the seam between "how bytes
 * get to and from the device" and "what the bytes mean".
 *
 * Everything above this interface (protocol.ts) knows about PING, SESSIONS,
 * GET, windows and ACKs. Everything below it (web-bluetooth-transport.ts)
 * knows about `navigator.bluetooth`, GATT and three characteristics — and
 * nothing else. The rule, written down because it is the one that gets
 * broken first: **no ACK, window or reconstruction logic lives in a
 * transport.** A transport moves messages. That is what lets the protocol
 * layer be tested against a fake device in vitest, and what would let it
 * run over a different carrier one day without being rewritten.
 *
 * The BIKIT Telemetry Service v1, as the firmware declares it:
 *   CONTROL  write / write-without-response, ≤64 chars — commands as text
 *   STATUS   notify, ≤96 chars — replies as text lines
 *   DATA     notify, ≤244 bytes — `u32 LE offset` + up to 240 raw .BKT bytes
 */

export const BIKIT_SERVICE_UUID = "7d2b0001-7c3a-4e6f-a5d4-42494b495401";
export const BIKIT_CONTROL_UUID = "7d2b0002-7c3a-4e6f-a5d4-42494b495401";
export const BIKIT_STATUS_UUID = "7d2b0003-7c3a-4e6f-a5d4-42494b495401";
export const BIKIT_DATA_UUID = "7d2b0004-7c3a-4e6f-a5d4-42494b495401";

/** How a CONTROL write is acknowledged at the GATT level. Commands go with a
 * response so a rejected write surfaces; ACKs go without, because they are
 * on the hot path of every window and the protocol has its own reply. */
export type ControlWriteMode = "response" | "no-response";

export interface BikitTransport {
  /** Opens the link. Must be called from a user gesture on Web Bluetooth —
   * the picker refuses otherwise. Resolves to the device's advertised name. */
  connect(): Promise<{ name: string }>;
  disconnect(): void;
  writeControl(command: string, mode: ControlWriteMode): Promise<void>;
  /** STATUS lines, already decoded and trimmed. Returns the unsubscribe. */
  subscribeStatus(handler: (message: string) => void): () => void;
  /** DATA packets, as a copy the handler may keep. Returns the unsubscribe. */
  subscribeData(handler: (packet: Uint8Array) => void): () => void;
  subscribeDisconnect(handler: () => void): () => void;
}
