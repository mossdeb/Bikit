"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bluetooth, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BikitDevice,
  type BikitDeviceInfo,
  type BikitLogEntry,
  type BikitSessionEntry,
  type TransferDiagnostics,
} from "@/lib/bikit-ble/protocol";
import {
  WebBluetoothTransport,
  hasWebBluetooth,
} from "@/lib/bikit-ble/web-bluetooth-transport";
import { parseImuBytes, type ImuSessionData } from "@/lib/imu/format";
import {
  formatSessionTime,
  sessionSummary,
  type ImuSessionSummary,
} from "@/lib/imu/derive";
import { uploadAndRegisterImuSession } from "@/lib/imu/import-session";
import {
  ImuSessionDetailsFields,
  type BikeOption,
} from "@/components/imu-session-details-fields";

/**
 * The device tab of the import dialog: connect to the BIKIT logger over BLE,
 * see what is on its card, pull one session down, and save it — the whole
 * flow inside the dialog, beside the file tab.
 *
 * Five steps, each its own screen in the same box:
 *   idle → connected (list) → transferring (bar + Cancelar)
 *        → ready (validated; name/rider/bike, then Importar) → saved.
 *
 * The transfer completing is not the ride being imported. The bytes go
 * through the same `.BKT` parser as a file picked from disk — every block's
 * CRC — and only when that passes does the details form appear. A transfer
 * that arrives whole but fails validation is reported as exactly that.
 *
 * Progress is unique bytes over the file size, never packet counts:
 * duplicates and retransmissions are normal protocol behaviour and must not
 * move the bar. The protocol's own counters stay behind "Detalhes".
 */

type Phase =
  | { kind: "idle" }
  | { kind: "connecting" }
  | {
      kind: "connected";
      sessions: BikitSessionEntry[] | null;
      listing: boolean;
    }
  | {
      kind: "transferring";
      sessions: BikitSessionEntry[];
      sessionId: number;
      uniqueBytes: number;
      totalBytes: number;
    }
  | {
      kind: "ready";
      sessions: BikitSessionEntry[];
      sessionId: number;
      bytes: ArrayBuffer;
      session: ImuSessionData;
      summary: ImuSessionSummary;
    }
  | { kind: "saving"; sessions: BikitSessionEntry[]; sessionId: number };

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

const formatBytes = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)} MB`
    : n >= 1000
      ? `${Math.round(n / 1000)} KB`
      : `${n} B`;

const sessionLabel = (id: number) => `S${String(id).padStart(4, "0")}`;

/**
 * The receiver's snapshot in one line, saying only what means something in
 * that state: with a fix, satellites, HDOP, signal and age; without one, the
 * fields the firmware fills with sentinels (HDOP 9999 → 99.99, signal NONE,
 * 0 satellites) are left out — "Sem fix · há 1,0 s" is the whole truth.
 */
function describeGps(gps: NonNullable<BikitDeviceInfo["gps"]>): string {
  const parts: string[] = [];
  parts.push(
    gps.state === "FIX"
      ? "Fix"
      : gps.state === "NO_FIX"
        ? "Sem fix"
        : gps.state === "NO_DATA"
          ? "Sem dados"
          : gps.state,
  );
  if (gps.state === "FIX") {
    parts.push(`${gps.satellites} sat`);
    if (Number.isFinite(gps.hdop) && gps.hdop < 50)
      parts.push(`HDOP ${gps.hdop.toFixed(2)}`);
    const signal =
      gps.signal === "GOOD"
        ? "sinal bom"
        : gps.signal === "FAIR"
          ? "sinal médio"
          : gps.signal === "WEAK"
            ? "sinal fraco"
            : gps.signal === "NONE"
              ? null
              : gps.signal;
    if (signal) parts.push(signal);
  } else if (gps.satellites > 0) {
    parts.push(`${gps.satellites} sat`);
  }
  if (Number.isFinite(gps.ageMs) && gps.state !== "NO_DATA")
    parts.push(`há ${(gps.ageMs / 1000).toFixed(1)} s`);
  return parts.join(" · ");
}

export function BikitDeviceImport({
  userId,
  riderDefault,
  bikes,
  onImported,
}: {
  userId: string;
  riderDefault: string;
  bikes: BikeOption[];
  /** The session is in Storage and registered; the dialog decides what next. */
  onImported: () => void;
}) {
  const supported = useSyncExternalStore(
    () => () => {},
    () => hasWebBluetooth(),
    () => true,
  );
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [info, setInfo] = useState<BikitDeviceInfo | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TransferDiagnostics | null>(
    null,
  );
  const [showDetails, setShowDetails] = useState(false);
  /** The CONTROL/STATUS conversation, for the developer fold — the thing to
   * paste when the device does not answer the way the firmware says it
   * should. */
  const [logLines, setLogLines] = useState<BikitLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [manualId, setManualId] = useState("");
  const [name, setName] = useState("");
  const [rider, setRider] = useState(riderDefault);
  const [bikeId, setBikeId] = useState("");
  const deviceRef = useRef<BikitDevice | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Let go of the link when the tab goes away — a held connection is a held
  // radio, and the logger cannot record while a client is attached.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      deviceRef.current?.disconnect();
    },
    [],
  );

  async function connect() {
    setError(null);
    setNotice(null);
    setDiagnostics(null);
    setPhase({ kind: "connecting" });
    try {
      deviceRef.current?.disconnect();
      const device = await BikitDevice.connect(new WebBluetoothTransport());
      deviceRef.current = device;
      setDeviceName(device.name);
      setLogLines([]);
      device.onLog((entry) =>
        setLogLines((lines) => [...lines.slice(-79), entry]),
      );
      device.onDisconnect(() => {
        deviceRef.current = null;
        setPhase((p) =>
          p.kind === "ready" || p.kind === "saving" ? p : { kind: "idle" },
        );
        setNotice("O dispositivo desligou-se.");
      });
      await device.ping();
      setInfo(await device.info());
      setPhase({ kind: "connected", sessions: null, listing: true });
      const sessions = await device.listSessions();
      setPhase({ kind: "connected", sessions, listing: false });
    } catch (e) {
      // Closing the picker is a decision, not a failure.
      if (!/cancel/i.test(describe(e))) setError(describe(e));
      if (deviceRef.current && deviceRef.current.isConnected) {
        // Connected but the list failed: stay connected, so the session can
        // still be asked for by number and the log can be read.
        setPhase({ kind: "connected", sessions: null, listing: false });
      } else {
        deviceRef.current?.disconnect();
        deviceRef.current = null;
        setPhase({ kind: "idle" });
      }
    }
  }

  function disconnect() {
    abortRef.current?.abort();
    deviceRef.current?.disconnect();
    deviceRef.current = null;
    setInfo(null);
    setPhase({ kind: "idle" });
  }

  async function refreshSessions() {
    const device = deviceRef.current;
    if (!device) return;
    setError(null);
    setPhase((p) => (p.kind === "connected" ? { ...p, listing: true } : p));
    try {
      const sessions = await device.listSessions();
      setPhase({ kind: "connected", sessions, listing: false });
    } catch (e) {
      setError(describe(e));
      setPhase((p) => (p.kind === "connected" ? { ...p, listing: false } : p));
    }
  }

  async function transfer(
    entry: BikitSessionEntry,
    sessions: BikitSessionEntry[],
  ) {
    const device = deviceRef.current;
    if (!device) return;
    setError(null);
    setNotice(null);
    setDiagnostics(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({
      kind: "transferring",
      sessions,
      sessionId: entry.id,
      uniqueBytes: 0,
      totalBytes: entry.sizeBytes,
    });
    try {
      const { bytes, diagnostics: diag } = await device.download(entry.id, {
        signal: controller.signal,
        onProgress: ({ uniqueBytes, totalBytes }) =>
          setPhase((p) =>
            p.kind === "transferring" ? { ...p, uniqueBytes, totalBytes } : p,
          ),
      });
      setDiagnostics(diag);

      // Arrived whole is not the same as valid: the full .BKT validation —
      // header, calibration and every block's CRC — runs here, exactly as
      // for a file picked from disk.
      const parsed = parseImuBytes(bytes);
      if (!parsed.ok) {
        setError(
          `A transferência chegou inteira mas o ficheiro não passou a validação: ${parsed.error}`,
        );
        setPhase({ kind: "connected", sessions, listing: false });
        return;
      }
      setName(parsed.session.sessionId ?? sessionLabel(entry.id));
      setRider(riderDefault);
      setBikeId("");
      setPhase({
        kind: "ready",
        sessions,
        sessionId: entry.id,
        bytes,
        session: parsed.session,
        summary: sessionSummary(parsed.session),
      });
    } catch (e) {
      setError(describe(e));
      setPhase(
        deviceRef.current
          ? { kind: "connected", sessions, listing: false }
          : { kind: "idle" },
      );
    } finally {
      abortRef.current = null;
    }
  }

  async function save() {
    if (phase.kind !== "ready") return;
    const { sessions, sessionId, bytes, session, summary } = phase;
    setError(null);
    setPhase({ kind: "saving", sessions, sessionId });
    const outcome = await uploadAndRegisterImuSession({
      userId,
      bytes: new Blob([bytes]),
      session,
      summary,
      name,
      riderName: rider,
      bikeId: bikeId || null,
    });
    if (!outcome.ok) {
      setError(outcome.error);
      setPhase({ kind: "ready", sessions, sessionId, bytes, session, summary });
      return;
    }
    onImported();
  }

  const connected = phase.kind !== "idle" && phase.kind !== "connecting";

  return (
    <div className="min-w-0 space-y-4">
      {/* Who we are talking to, or how to start. */}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">
          {!supported ? (
            "Este browser não tem Web Bluetooth. Usa Chrome ou Edge (ou Bluefy em iOS)."
          ) : phase.kind === "idle" ? (
            "Liga ao logger por Bluetooth e escolhe a sessão no cartão."
          ) : phase.kind === "connecting" ? (
            "A ligar…"
          ) : (
            <>
              <span className="font-medium text-foreground">{deviceName}</span>
              {info && <> · firmware {info.firmware}</>}
            </>
          )}
        </p>
        {connected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={disconnect}
            disabled={phase.kind === "saving"}
          >
            Desligar
          </Button>
        ) : (
          <Button
            variant="inverted"
            size="sm"
            onClick={connect}
            disabled={!supported || phase.kind === "connecting"}
          >
            <Bluetooth data-icon="inline-start" />
            Ligar
          </Button>
        )}
      </div>

      {/* What the logger says about itself, when its firmware says it: the
          battery in millivolts beside the estimate (the mV is the number to
          trust while the curve is being validated), the receiver's last GGA
          snapshot, and the two subsystems. A line the firmware did not send
          is left out, not shown as OK. */}
      {connected &&
        info &&
        (info.battery || info.gps || info.sd || info.imu) && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            {info.battery && (
              <>
                <dt>Bateria</dt>
                {"unavailable" in info.battery ? (
                  // The line came but the ADC gave nothing — say so, rather
                  // than leaving the row out as if the firmware were old.
                  <dd>sem leitura ({info.battery.raw})</dd>
                ) : (
                  <dd className="text-foreground">
                    {info.battery.percent}% ·{" "}
                    {info.battery.millivolts.toLocaleString("pt-PT")} mV
                  </dd>
                )}
              </>
            )}
            {info.gps && (
              <>
                <dt>GPS</dt>
                <dd className="text-foreground">{describeGps(info.gps)}</dd>
              </>
            )}
            {info.sd && (
              <>
                <dt>Cartão</dt>
                <dd
                  className={
                    info.sd === "OK" ? "text-foreground" : "text-destructive"
                  }
                >
                  {info.sd}
                </dd>
              </>
            )}
            {info.imu && (
              <>
                <dt>IMU</dt>
                <dd
                  className={
                    info.imu === "OK" ? "text-foreground" : "text-destructive"
                  }
                >
                  {info.imu}
                </dd>
              </>
            )}
          </dl>
        )}

      {/* The device scans its card twice before the first line comes back,
          which on a full card is seconds of nothing — the spinner is what
          says the wait is ours and not a hang. The app's own idiom, from
          loading.tsx; `motion-safe` so it holds still for whoever asked
          things to. */}
      {phase.kind === "connected" && phase.listing && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2
            className="size-4 shrink-0 motion-safe:animate-spin"
            aria-hidden
          />
          A ler a lista de sessões…
        </p>
      )}

      {phase.kind === "connected" && !phase.listing && phase.sessions && (
        <div className="rounded-[12px] border border-border">
          {phase.sessions.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-muted-foreground">
              O cartão não tem sessões.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-border">
              {phase.sessions.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-medium tabular-nums">
                      {sessionLabel(entry.id)}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatBytes(entry.sizeBytes)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => transfer(entry, phase.sessions!)}
                  >
                    Transferir
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-3.5 py-2">
            <button
              type="button"
              onClick={refreshSessions}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Atualizar lista
            </button>
          </div>
        </div>
      )}

      {/* By number, whatever the list did: the listing is the one command
          the Python receiver never ran over BLE, and a card that will not
          list still serves GET. It is also the golden test's own path —
          PING, then GET 48. */}
      {phase.kind === "connected" && !phase.listing && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = Number(manualId);
            if (Number.isInteger(id) && id >= 1 && id <= 9999)
              transfer({ id, sizeBytes: 0 }, phase.sessions ?? []);
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="ble-manual-id">Ou transferir a sessão nº</Label>
            <Input
              id="ble-manual-id"
              inputMode="numeric"
              placeholder="48"
              value={manualId}
              onChange={(event) =>
                setManualId(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </div>
          <Button type="submit" variant="outline" disabled={!manualId}>
            Transferir
          </Button>
        </form>
      )}

      {phase.kind === "transferring" && (
        <TransferProgressView
          label={`A transferir ${sessionLabel(phase.sessionId)}`}
          uniqueBytes={phase.uniqueBytes}
          totalBytes={phase.totalBytes}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {(phase.kind === "ready" || phase.kind === "saving") && (
        <>
          {/* The same summary card the file tab shows once its file parses:
              validated, and what it holds. */}
          <div className="rounded-[12px] border border-border px-3 py-2.5 text-sm">
            <p className="font-medium">
              {sessionLabel(phase.sessionId)} · validada
            </p>
            {phase.kind === "ready" && (
              <p className="mt-0.5 text-muted-foreground">
                {formatSessionTime(phase.summary.durationMs)} ·{" "}
                {Math.round(phase.summary.sampleRateHz)} Hz ·{" "}
                <span className="tabular-nums">
                  {phase.summary.sampleCount.toLocaleString("pt-PT")}
                </span>{" "}
                amostras{phase.session.gps ? " · GPS" : ""}
              </p>
            )}
          </div>
          <ImuSessionDetailsFields
            idPrefix="ble"
            name={name}
            onNameChange={setName}
            rider={rider}
            onRiderChange={setRider}
            riderDefault={riderDefault}
            bikeId={bikeId}
            onBikeIdChange={setBikeId}
            bikes={bikes}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={phase.kind === "saving"}
              onClick={() =>
                setPhase({
                  kind: "connected",
                  sessions: phase.sessions,
                  listing: false,
                })
              }
            >
              Voltar à lista
            </Button>
            <Button
              variant="inverted"
              className="flex-1"
              disabled={phase.kind === "saving" || !name.trim()}
              onClick={save}
            >
              {phase.kind === "saving" ? "A importar…" : "Importar"}
            </Button>
          </div>
        </>
      )}

      {/* Written on screen, never a toast — the garage rule. */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      {logLines.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowLog((s) => !s)}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {showLog ? "Ocultar registo" : `Registo BLE (${logLines.length})`}
          </button>
          {showLog && (
            // `max-w-full` and the `min-w-0` up the tree: a <pre> with long
            // lines is the widest thing in the dialog, and a grid/flex item
            // defaults to min-width auto — without the cap it was the pre
            // that sized the dialog, not the other way round.
            <pre className="mt-2 max-h-48 w-full max-w-full overflow-auto rounded-[8px] bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {logLines
                .map(
                  (line) =>
                    `${new Date(line.at).toLocaleTimeString("pt-PT", { hour12: false })}.${String(line.at % 1000).padStart(3, "0")} ${line.direction === "out" ? "→" : "←"} ${line.text}`,
                )
                .join("\n")}
            </pre>
          )}
        </div>
      )}

      {diagnostics && (
        <div>
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {showDetails ? "Ocultar detalhes" : "Detalhes da transferência"}
          </button>
          {showDetails && (
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <Diag label="Pacotes" value={diagnostics.packets} />
              <Diag label="Duplicados" value={diagnostics.duplicates} />
              <Diag label="Janelas" value={diagnostics.windows} />
              <Diag label="ACKs" value={diagnostics.acks} />
              <Diag label="Re-ACKs" value={diagnostics.reAcks} />
              <Diag label="Payload" value={`${diagnostics.payloadSize} B`} />
              <Diag label="Janela" value={`${diagnostics.windowSize} B`} />
              <Diag
                label="Tempo"
                value={`${(diagnostics.elapsedMs / 1000).toFixed(1)} s`}
              />
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function Diag({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="text-foreground">
        {typeof value === "number" ? value.toLocaleString("pt-PT") : value}
      </dd>
    </div>
  );
}

function TransferProgressView({
  label,
  uniqueBytes,
  totalBytes,
  onCancel,
}: {
  label: string;
  uniqueBytes: number;
  totalBytes: number;
  onCancel: () => void;
}) {
  const fraction = totalBytes > 0 ? Math.min(1, uniqueBytes / totalBytes) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X data-icon="inline-start" />
          Cancelar
        </Button>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-150"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
        {Math.round(fraction * 100)}% · {formatBytes(uniqueBytes)} /{" "}
        {formatBytes(totalBytes)}
      </p>
    </div>
  );
}
