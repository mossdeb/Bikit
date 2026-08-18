/**
 * BLE Cycling Speed and Cadence, shared between the lab probe and the sensor
 * sync. Client-side only — Web Bluetooth lives on `navigator` — but not a
 * component: this is the protocol, not a screen.
 */

export const CSC_SERVICE = 0x1816;
export const CSC_MEASUREMENT = 0x2a5b;

export interface CscReading {
  wheelRevs: number | null;
  wheelEventTime: number | null;
  crankRevs: number | null;
  crankEventTime: number | null;
}

/**
 * CSC Measurement, little-endian. Byte 0 is flags: bit 0 says wheel data
 * follows, bit 1 says crank data follows. The fields only exist when their bit
 * is set, so the offsets move — reading at fixed positions is how this gets
 * silently wrong on a sensor mounted in the other mode.
 *
 * Every read is bounds-checked. A truncated packet would otherwise throw a
 * RangeError inside a Bluetooth event handler, which is about the worst place
 * in the app for an exception to surface.
 */
export function parseCsc(view: DataView): CscReading {
  const out: CscReading = {
    wheelRevs: null,
    wheelEventTime: null,
    crankRevs: null,
    crankEventTime: null,
  };
  if (view.byteLength < 1) return out;

  const flags = view.getUint8(0);
  let offset = 1;

  if (flags & 0x01) {
    if (view.byteLength < offset + 6) return out;
    out.wheelRevs = view.getUint32(offset, true);
    offset += 4;
    out.wheelEventTime = view.getUint16(offset, true);
    offset += 2;
  }
  if (flags & 0x02) {
    if (view.byteLength < offset + 4) return out;
    out.crankRevs = view.getUint16(offset, true);
    offset += 2;
    out.crankEventTime = view.getUint16(offset, true);
  }
  return out;
}

/** The slice of Web Bluetooth these flows touch — TypeScript's DOM lib does
 * not ship the API, and the probe already established this minimal shape. */
export interface CscBluetoothDevice {
  name?: string;
  gatt?: {
    connect: () => Promise<{
      getPrimaryService: (s: number) => Promise<{
        getCharacteristic: (c: number) => Promise<{
          startNotifications: () => Promise<unknown>;
          addEventListener: (t: string, h: (e: Event) => void) => void;
        }>;
      }>;
    }>;
    disconnect: () => void;
  };
}

type BluetoothNavigator = {
  bluetooth: { requestDevice: (options: unknown) => Promise<CscBluetoothDevice> };
};

/**
 * One reading, one connection: opens the picker, connects, waits for the
 * first notification that carries a wheel count, and disconnects. Not for
 * watching a ride — the sync model is read-after-the-fact, and holding the
 * connection open would also hold the sensor awake.
 *
 * Distinguishes its failures because they mean different actions: crank-only
 * data means the sensor is mounted in cadence mode and must be moved to the
 * hub; silence means it is asleep and the wheel needs a spin. Must be called
 * from a user gesture — `requestDevice` refuses otherwise.
 */
export async function readCscWheelCount(
  filters: unknown[],
  options?: { optionalServices?: number[]; timeoutMs?: number }
): Promise<{ deviceName: string; wheelRevs: number }> {
  if (!("bluetooth" in navigator)) {
    throw new Error("Este browser não tem Web Bluetooth. Usa Chrome (ou Bluefy em iOS).");
  }
  const nav = navigator as unknown as BluetoothNavigator;

  const device = await nav.bluetooth.requestDevice({
    filters,
    ...(options?.optionalServices ? { optionalServices: options.optionalServices } : {}),
  });
  const gatt = device.gatt;
  if (!gatt) throw new Error("O dispositivo não expõe GATT.");

  try {
    const server = await gatt.connect();
    const service = await server.getPrimaryService(CSC_SERVICE);
    const characteristic = await service.getCharacteristic(CSC_MEASUREMENT);
    await characteristic.startNotifications();

    const wheelRevs = await new Promise<number>((resolve, reject) => {
      let sawCrank = false;
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              sawCrank
                ? "O sensor só envia cadência — monta-o no cubo da roda (modo velocidade) e tenta outra vez."
                : "Sem leituras. Gira a roda para acordar o sensor e tenta outra vez."
            )
          ),
        options?.timeoutMs ?? 20000
      );
      characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
        const view = (event.target as unknown as { value?: DataView }).value;
        if (!view) return;
        const reading = parseCsc(view);
        if (reading.crankRevs != null) sawCrank = true;
        if (reading.wheelRevs != null) {
          clearTimeout(timer);
          resolve(reading.wheelRevs);
        }
      });
    });

    return { deviceName: device.name ?? "(sem nome)", wheelRevs };
  } finally {
    // One reading is the contract — never leave the connection (and the
    // sensor's battery) held open on either success or failure.
    try {
      gatt.disconnect();
    } catch {
      // Already gone.
    }
  }
}
