/**
 * BikitTransport over Web Bluetooth. Moves bytes and text between the browser
 * and the logger's three characteristics — and does nothing with them.
 *
 * TypeScript's DOM lib does not ship the Web Bluetooth API, so the slice we
 * touch is typed here by hand, the way `csc.ts` already does for the speed
 * sensor. Only what is called is declared.
 *
 * Two details that matter on this carrier:
 * - A notification's `event.target.value` is a DataView the browser may reuse
 *   for the next notification. Every packet is COPIED before it leaves this
 *   file, so the protocol layer can hold onto it.
 * - ACKs go `writeValueWithoutResponse`: one per 1440-byte window, on the hot
 *   path, and the protocol has its own reply (the next window). Commands go
 *   with a response so a write the device rejects is an error here and not a
 *   silence upstairs.
 */

import {
  BIKIT_CONTROL_UUID,
  BIKIT_DATA_UUID,
  BIKIT_SERVICE_UUID,
  BIKIT_STATUS_UUID,
  type BikitTransport,
  type ControlWriteMode,
} from "./transport";

interface BtCharacteristic {
  value?: DataView | null;
  startNotifications(): Promise<unknown>;
  addEventListener(
    type: "characteristicvaluechanged",
    handler: (event: Event) => void,
  ): void;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface BtService {
  getCharacteristic(uuid: string): Promise<BtCharacteristic>;
}

interface BtServer {
  getPrimaryService(uuid: string): Promise<BtService>;
}

interface BtDevice {
  name?: string;
  gatt?: {
    connect(): Promise<BtServer>;
    disconnect(): void;
    connected: boolean;
  };
  addEventListener(type: "gattserverdisconnected", handler: () => void): void;
}

type BluetoothNavigator = {
  bluetooth: {
    requestDevice(options: unknown): Promise<BtDevice>;
  };
};

/** Whether this browser can reach the device at all. Chrome and Edge on
 * desktop and Android, Bluefy on iOS; Safari and Firefox cannot. */
export function hasWebBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class WebBluetoothTransport implements BikitTransport {
  private device: BtDevice | null = null;
  private control: BtCharacteristic | null = null;
  private readonly statusHandlers = new Set<(message: string) => void>();
  private readonly dataHandlers = new Set<(packet: Uint8Array) => void>();
  private readonly disconnectHandlers = new Set<() => void>();
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  async connect(): Promise<{ name: string }> {
    if (!hasWebBluetooth()) {
      throw new Error(
        "Este browser não tem Web Bluetooth. Usa Chrome ou Edge (ou Bluefy em iOS).",
      );
    }
    const nav = navigator as unknown as BluetoothNavigator;
    // Filter by the service and not the name: the name is "BIKIT-" plus four
    // hex digits of the chip id, different on every board.
    const device = await nav.bluetooth.requestDevice({
      filters: [{ services: [BIKIT_SERVICE_UUID] }],
    });
    if (!device.gatt) throw new Error("O dispositivo não expõe GATT.");
    this.device = device;
    device.addEventListener("gattserverdisconnected", () => {
      this.control = null;
      for (const handler of this.disconnectHandlers) handler();
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BIKIT_SERVICE_UUID);
    const [control, status, data] = await Promise.all([
      service.getCharacteristic(BIKIT_CONTROL_UUID),
      service.getCharacteristic(BIKIT_STATUS_UUID),
      service.getCharacteristic(BIKIT_DATA_UUID),
    ]);
    this.control = control;

    status.addEventListener("characteristicvaluechanged", (event) => {
      const view = (event.target as unknown as { value?: DataView | null })
        .value;
      if (!view) return;
      const message = this.decoder.decode(view).trim();
      for (const handler of this.statusHandlers) handler(message);
    });
    data.addEventListener("characteristicvaluechanged", (event) => {
      const view = (event.target as unknown as { value?: DataView | null })
        .value;
      if (!view) return;
      // Copy: the browser owns that buffer and may overwrite it next tick.
      const packet = new Uint8Array(view.byteLength);
      packet.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      for (const handler of this.dataHandlers) handler(packet);
    });
    // STATUS before DATA, so the TRANSFER_BEGIN that sizes the buffer can
    // never arrive after the first packet it describes.
    await status.startNotifications();
    await data.startNotifications();

    return { name: device.name ?? "BIKIT" };
  }

  disconnect(): void {
    try {
      this.device?.gatt?.disconnect();
    } catch {
      // Already gone; the disconnect event has fired or never will.
    }
    this.control = null;
  }

  async writeControl(command: string, mode: ControlWriteMode): Promise<void> {
    const control = this.control;
    if (!control) throw new Error("Sem ligação ao dispositivo.");
    const bytes = this.encoder.encode(command);
    if (mode === "no-response") await control.writeValueWithoutResponse(bytes);
    else await control.writeValueWithResponse(bytes);
  }

  subscribeStatus(handler: (message: string) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  subscribeData(handler: (packet: Uint8Array) => void): () => void {
    this.dataHandlers.add(handler);
    return () => this.dataHandlers.delete(handler);
  }

  subscribeDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }
}
