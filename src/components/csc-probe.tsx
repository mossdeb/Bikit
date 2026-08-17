"use client";

import { useRef, useState, useSyncExternalStore } from "react";

/**
 * A probe for a BLE Cycling Speed and Cadence sensor. Not a feature.
 *
 * It exists to answer one question before anything is built on top of it:
 * **does the cumulative counter survive the sensor going to sleep?** The
 * Van Rysel sleeps after 60 seconds without movement. If the counter carries
 * on where it left off, Bikit can read the sensor whenever it likes and take
 * the difference — an odometer sync, the same shape as the Strava one. If it
 * restarts at zero, the app has to be connected for the whole ride, which is
 * a different and much larger product.
 *
 * So it reads and shows, and writes nothing. No bike is touched, no total is
 * moved, nothing is stored on the server. Every number here is raw.
 *
 * Both revolution counters are shown because the sensor does speed OR
 * cadence depending on where it is mounted — hub or bottom bracket — and the
 * same characteristic carries either, chosen by a flags byte. Assuming one
 * would have made the probe lie about the other.
 */

// The standardised profile: any sensor claiming CSC exposes these.
const CSC_SERVICE = 0x1816;
const CSC_MEASUREMENT = 0x2a5b;

interface Sample {
  at: number;
  wheelRevs: number | null;
  wheelEventTime: number | null;
  crankRevs: number | null;
  crankEventTime: number | null;
  raw: string;
}

/** CSC Measurement, little-endian. Byte 0 is flags: bit 0 says wheel data
 * follows, bit 1 says crank data follows. The fields are only present when
 * their bit is set, so the offsets move — reading at fixed positions is how
 * this gets silently wrong on a sensor in the other mode. */
function parseCsc(view: DataView): Omit<Sample, "at" | "raw"> {
  const flags = view.getUint8(0);
  let offset = 1;
  let wheelRevs: number | null = null;
  let wheelEventTime: number | null = null;
  let crankRevs: number | null = null;
  let crankEventTime: number | null = null;

  if (flags & 0x01) {
    wheelRevs = view.getUint32(offset, true);
    offset += 4;
    wheelEventTime = view.getUint16(offset, true);
    offset += 2;
  }
  if (flags & 0x02) {
    crankRevs = view.getUint16(offset, true);
    offset += 2;
    crankEventTime = view.getUint16(offset, true);
  }
  return { wheelRevs, wheelEventTime, crankRevs, crankEventTime };
}

const hex = (view: DataView) =>
  Array.from({ length: view.byteLength }, (_, i) => view.getUint8(i).toString(16).padStart(2, "0")).join(" ");

export function CscProbe() {
  const [status, setStatus] = useState("Pronto.");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const deviceRef = useRef<{ gatt?: { disconnect: () => void } } | null>(null);

  // Read through useSyncExternalStore, not during render: the server has no
  // navigator, so `"bluetooth" in navigator` is false there and true here, and
  // the two trees disagree. The server snapshot is optimistic on purpose —
  // rendering the warning for everyone and then taking it back is worse than
  // showing it a beat late to the few browsers that need it.
  const supported = useSyncExternalStore(
    () => () => {},
    () => "bluetooth" in navigator,
    () => true
  );

  async function connect() {
    try {
      setStatus("A abrir o seletor do browser…");
      // The chooser is the browser's own and cannot be skipped or scripted:
      // there is no silent scan in Web Bluetooth, by design.
      const nav = navigator as unknown as {
        bluetooth: {
          requestDevice: (o: unknown) => Promise<{
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
            addEventListener: (t: string, h: () => void) => void;
          }>;
        };
      };

      const device = await nav.bluetooth.requestDevice({ filters: [{ services: [CSC_SERVICE] }] });
      deviceRef.current = device;
      setDeviceName(device.name ?? "(sem nome)");

      device.addEventListener("gattserverdisconnected", () => setStatus("Desligado pelo sensor."));

      setStatus("A ligar…");
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(CSC_SERVICE);
      const characteristic = await service.getCharacteristic(CSC_MEASUREMENT);
      await characteristic.startNotifications();

      characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
        const view = (event.target as unknown as { value: DataView }).value;
        const parsed = parseCsc(view);
        // Newest first, and capped: this runs for minutes at a time and the
        // question it answers lives in the first and last readings.
        setSamples((prev) => [{ at: Date.now(), raw: hex(view), ...parsed }, ...prev].slice(0, 60));
      });

      setStatus("Ligado. GIRA A RODA (ou a pedaleira) — o sensor só transmite em movimento.");
    } catch (e) {
      setStatus(`Falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function disconnect() {
    deviceRef.current?.gatt?.disconnect();
    setStatus("Desligado.");
  }

  const first = samples[samples.length - 1];
  const last = samples[0];

  return (
    <div className="space-y-4">
      {!supported && (
        <p className="rounded-sm bg-destructive/10 p-4 text-sm">
          Este browser não tem Web Bluetooth. É preciso Chrome em Android (ou no desktop). O Safari não suporta e não
          vai suportar.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={connect}
          disabled={!supported}
          className="h-11 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-40"
        >
          Ligar ao sensor
        </button>
        <button
          type="button"
          onClick={disconnect}
          className="h-11 rounded-full border border-border px-5 text-sm font-semibold"
        >
          Desligar
        </button>
      </div>

      <div className="rounded-sm bg-muted p-4 text-sm">
        <p>
          <strong>Estado:</strong> {status}
        </p>
        {deviceName && (
          <p className="mt-1">
            <strong>Sensor:</strong> {deviceName}
          </p>
        )}
        <p className="mt-1">
          <strong>Amostras:</strong> {samples.length}
        </p>
      </div>

      {/* The whole point of the probe: the first reading against the latest.
          Leave it connected, stop pedalling for over a minute so the sensor
          sleeps, then move again — if the counter carries on from where it
          was, the odometer model works. */}
      {first && last && (
        <div className="rounded-sm border border-border p-4 text-sm">
          <p className="font-semibold">Primeira leitura → última</p>
          <p className="mt-2 font-mono">
            roda: {first.wheelRevs ?? "—"} → {last.wheelRevs ?? "—"}
            {first.wheelRevs != null && last.wheelRevs != null && (
              <span className="ml-2 font-semibold">(Δ {last.wheelRevs - first.wheelRevs})</span>
            )}
          </p>
          <p className="font-mono">
            pedaleira: {first.crankRevs ?? "—"} → {last.crankRevs ?? "—"}
            {first.crankRevs != null && last.crankRevs != null && (
              <span className="ml-2 font-semibold">(Δ {last.crankRevs - first.crankRevs})</span>
            )}
          </p>
        </div>
      )}

      <div className="space-y-1">
        {samples.map((s) => (
          <p key={`${s.at}-${s.raw}`} className="font-mono text-xs">
            {new Date(s.at).toLocaleTimeString("pt-PT")} · roda {s.wheelRevs ?? "—"}@{s.wheelEventTime ?? "—"} ·
            pedaleira {s.crankRevs ?? "—"}@{s.crankEventTime ?? "—"} · <span className="opacity-60">{s.raw}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
