"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * A probe for a BLE Cycling Speed and Cadence sensor. Not a feature.
 *
 * It exists to answer one question before anything is built on top of it:
 * **does the cumulative counter survive the sensor going to sleep?** If it
 * carries on, Bikit can read the sensor whenever it likes and take the
 * difference — an odometer sync, the same shape as the Strava one. If it
 * restarts at zero, the app has to be connected for the whole ride, which is
 * a different and much larger product.
 *
 * Measured on 2026-08-17: with a connection open the sensor kept notifying for
 * thousands of messages without the value moving, so an open connection
 * appears to hold it awake. The 60-second sleep therefore only applies once
 * nothing is connected — which makes disconnect, wait, reconnect the only
 * sequence that can answer the question.
 *
 * It reads and shows, and writes nothing: no bike is touched, no total moves,
 * nothing reaches the server.
 *
 * Everything that can throw is caught and put on screen. This runs on a phone
 * in a garage, where there is no console to open — an error nobody can see is
 * an error nobody can report.
 */

const CSC_SERVICE = 0x1816;
const CSC_MEASUREMENT = 0x2a5b;

interface Sample {
  /** Monotonic. `timestamp + bytes` collided, because the sensor repeats a
   * reading many times a second, and that showed up as rows out of order. */
  id: number;
  at: number;
  wheelRevs: number | null;
  wheelEventTime: number | null;
  crankRevs: number | null;
  crankEventTime: number | null;
  raw: string;
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
function parseCsc(view: DataView): Omit<Sample, "id" | "at" | "raw"> {
  const out: Omit<Sample, "id" | "at" | "raw"> = {
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

const hex = (view: DataView) =>
  Array.from({ length: view.byteLength }, (_, i) => view.getUint8(i).toString(16).padStart(2, "0")).join(" ");

const describe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

export function CscProbe() {
  const [status, setStatus] = useState("Pronto.");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  /** The reading this session opened with, pinned so the capped list can never
   * evict it — otherwise "first reading" quietly becomes "a minute ago". */
  const [baseline, setBaseline] = useState<Sample | null>(null);
  const [received, setReceived] = useState(0);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [errors, setErrors] = useState<string[]>([]);

  const deviceRef = useRef<{ gatt?: { disconnect: () => void } } | null>(null);
  const seqRef = useRef(0);
  const lastRef = useRef<string | null>(null);

  const supported = useSyncExternalStore(
    () => () => {},
    () => "bluetooth" in navigator,
    () => true
  );

  // Anything that escapes lands on screen. There is no console on a phone in a
  // garage, and "a página deu erro" is not something anyone can act on.
  useEffect(() => {
    const onError = (e: ErrorEvent) => setErrors((prev) => [`window: ${e.message}`, ...prev].slice(0, 6));
    const onRejection = (e: PromiseRejectionEvent) =>
      setErrors((prev) => [`promise: ${describe(e.reason)}`, ...prev].slice(0, 6));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // The clock ticks from the connection to *now*. It used to measure to the
  // newest distinct reading, so a stationary wheel froze it and the screen said
  // 66 s for as long as anyone cared to wait.
  useEffect(() => {
    if (connectedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);

  async function connect() {
    try {
      setErrors([]);
      setStatus("A abrir o seletor do browser…");

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

      // Let go of the previous handle first: reconnecting on top of a live one
      // leaves two subscriptions feeding the same list.
      try {
        deviceRef.current?.gatt?.disconnect();
      } catch {
        // Already gone. Nothing to do, and nothing worth reporting.
      }

      setSamples([]);
      setBaseline(null);
      setReceived(0);
      setConnectedAt(null);
      lastRef.current = null;

      const device = await nav.bluetooth.requestDevice({ filters: [{ services: [CSC_SERVICE] }] });
      deviceRef.current = device;
      setDeviceName(device.name ?? "(sem nome)");
      device.addEventListener("gattserverdisconnected", () =>
        setStatus("Ligação caiu. Gira a roda e liga outra vez — a primeira leitura é a resposta.")
      );

      setStatus("A ligar…");
      const gatt = device.gatt;
      if (!gatt) throw new Error("O dispositivo não expõe GATT.");
      const server = await gatt.connect();
      const service = await server.getPrimaryService(CSC_SERVICE);
      const characteristic = await service.getCharacteristic(CSC_MEASUREMENT);
      await characteristic.startNotifications();

      characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
        try {
          const view = (event.target as unknown as { value?: DataView }).value;
          if (!view) return;
          const raw = hex(view);
          setReceived((n) => n + 1);

          const sample: Sample = { id: (seqRef.current += 1), at: Date.now(), raw, ...parseCsc(view) };
          setBaseline((b) => b ?? sample);

          // Only distinct readings reach the list. A stationary sensor repeats
          // the same bytes; sixty of those said nothing and filled the window.
          if (raw === lastRef.current) return;
          lastRef.current = raw;
          setSamples((prev) => [sample, ...prev].slice(0, 60));
        } catch (e) {
          setErrors((prev) => [`notificação: ${describe(e)}`, ...prev].slice(0, 6));
        }
      });

      setConnectedAt(Date.now());
      setNow(Date.now());
      setStatus("Ligado. GIRA A RODA — o sensor só conta em movimento.");
    } catch (e) {
      setStatus(`Falhou: ${describe(e)}`);
      setErrors((prev) => [`ligar: ${describe(e)}`, ...prev].slice(0, 6));
    }
  }

  function disconnect() {
    try {
      deviceRef.current?.gatt?.disconnect();
      setConnectedAt(null);
      setStatus("Desligado. Espera 5 min com a roda quieta, depois liga outra vez.");
    } catch (e) {
      setErrors((prev) => [`desligar: ${describe(e)}`, ...prev].slice(0, 6));
    }
  }

  const last = samples[0];
  const elapsed = connectedAt === null ? null : Math.max(0, Math.round((now - connectedAt) / 1000));

  return (
    <div className="space-y-4">
      {!supported && (
        <p className="rounded-sm bg-destructive/10 p-4 text-sm">
          Este browser não tem Web Bluetooth. É preciso Chrome em Android. O Safari não suporta e não vai suportar.
        </p>
      )}

      {errors.length > 0 && (
        <div className="rounded-sm bg-destructive/10 p-4 text-sm">
          <p className="font-semibold">Erros</p>
          {errors.map((e, i) => (
            <p key={`${i}-${e}`} className="mt-1 font-mono text-xs break-words">
              {e}
            </p>
          ))}
        </div>
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
          <strong>Ligado há:</strong> {elapsed === null ? "—" : `${elapsed} s`} · {received} notificações ·{" "}
          {samples.length} distintas
        </p>
      </div>

      {/* The answer lives in the first reading of a session that began after a
          real disconnection: if it comes back where the last one left off, the
          counter survived. */}
      {baseline && (
        <div className="rounded-sm border border-border p-4 text-sm">
          <p className="font-semibold">Primeira leitura desta ligação</p>
          <p className="mt-1 font-mono">
            roda {baseline.wheelRevs ?? "—"} · pedaleira {baseline.crankRevs ?? "—"}
          </p>
          {last && (
            <>
              <p className="mt-3 font-semibold">Agora</p>
              <p className="mt-1 font-mono">
                roda {last.wheelRevs ?? "—"}
                {baseline.wheelRevs != null && last.wheelRevs != null && (
                  <span className="ml-2 font-semibold">(Δ {last.wheelRevs - baseline.wheelRevs})</span>
                )}{" "}
                · pedaleira {last.crankRevs ?? "—"}
                {baseline.crankRevs != null && last.crankRevs != null && (
                  <span className="ml-2 font-semibold">(Δ {last.crankRevs - baseline.crankRevs})</span>
                )}
              </p>
            </>
          )}
        </div>
      )}

      <div className="space-y-1">
        {samples.map((s) => (
          <p key={s.id} className="font-mono text-xs">
            {new Date(s.at).toLocaleTimeString("pt-PT")} · roda {s.wheelRevs ?? "—"}@{s.wheelEventTime ?? "—"} ·
            pedaleira {s.crankRevs ?? "—"}@{s.crankEventTime ?? "—"} · <span className="opacity-60">{s.raw}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
