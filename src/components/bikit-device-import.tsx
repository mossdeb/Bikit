"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bluetooth, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  forgetDevicePin,
  loadDevicePin,
  saveDevicePin,
} from "@/lib/bikit-ble/pin-store";
import { throttleBleProgress } from "@/lib/bikit-ble/progress";
import {
  AUTH_REQUIRED,
  BikitDevice,
  BikitDeviceError,
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
import {
  firstTrackPassed,
  loadImportTracks,
  uploadAndRegisterImuSession,
  type ImportTrack,
} from "@/lib/imu/import-session";
import { alignSession } from "@/lib/imu/derive";
import { withBikeFrameEvents } from "@/lib/imu/events";
import {
  defaultGroupId,
  groupFormValid,
  groupRefFromForm,
  type ImuGroupOption,
} from "@/lib/imu/groups";
import { bikeFormValid, bikeRefFromForm } from "@/lib/imu/bike-ref";
import {
  ImuSessionDetailsFields,
  type BikeOption,
} from "@/components/imu-session-details-fields";
import { useProDict, useProLocale } from "@/components/pro-locale";
import {
  PRO_NUMBER_LOCALE,
  proNumber,
  type ProDictionary,
} from "@/lib/i18n/pro";
import type { Locale } from "@/lib/i18n";

/**
 * The device tab of the import dialog: connect to the BIKIT logger over BLE,
 * see what is on its card, pull one session down, and save it — the whole
 * flow inside the dialog, beside the file tab.
 *
 * Five steps, each its own screen in the same box:
 *   idle → connected (list) → transferring (bar + Cancel)
 *        → ready (validated; name/rider/bike, then Import) → saved.
 *
 * The transfer completing is not the ride being imported. The bytes go
 * through the same `.BKT` parser as a file picked from disk — every block's
 * CRC — and only when that passes does the details form appear. A transfer
 * that arrives whole but fails validation is reported as exactly that.
 *
 * Progress is unique bytes over the file size, never packet counts:
 * duplicates and retransmissions are normal protocol behaviour and must not
 * move the bar. The protocol's own counters stay behind "Transfer details".
 *
 * Every string here comes from the Pro dictionary (`importing.device`),
 * except what the BLE layer itself throws: a BikitDeviceError's message is
 * the protocol's own and is shown as it comes.
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
  | { kind: "saving"; sessions: BikitSessionEntry[]; sessionId: number }
  /** Several sessions, one after the other (by request, 2026-11-06):
   * `index` is the one on the wire, of `queue`. */
  | {
      kind: "transferringMany";
      sessions: BikitSessionEntry[];
      queue: BikitSessionEntry[];
      index: number;
      uniqueBytes: number;
      totalBytes: number;
    }
  /** The ones that arrived and validated, each named; the rest of the form
   * is shared, as in the file tab. */
  | { kind: "readyMany"; sessions: BikitSessionEntry[]; items: DeviceItem[] }
  | {
      kind: "savingMany";
      sessions: BikitSessionEntry[];
      items: DeviceItem[];
      progress: number;
    }
  /** Linked, PING answered, and the device wants its PIN before anything
   * else. `hadSaved`: a remembered PIN was tried and refused. */
  | { kind: "auth"; hadSaved: boolean }
  | { kind: "authenticating" };

/** One session pulled off the card in a several-at-once transfer,
 * validated, and named as the file tab names its files. */
interface DeviceItem {
  sessionId: number;
  bytes: ArrayBuffer;
  session: ImuSessionData;
  summary: ImuSessionSummary;
  name: string;
  /** The logger's code the name started from, "R0161". */
  base: string;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The decimal separator follows the reader's language; the units do not. */
const formatBytes = (n: number, locale: Locale) =>
  n >= 1_000_000
    ? `${proNumber(n / 1_000_000, locale, 2)} MB`
    : n >= 1000
      ? `${Math.round(n / 1000)} KB`
      : `${n} B`;

/** The quiet grey pill of the reference layout: Disconnect, Transfer. */
const MUTED_PILL = "bg-muted text-base text-foreground hover:bg-border";

/** Sessions listed at once, and added by each "Show more". */
const SESSIONS_PAGE = 15;

const sessionLabel = (id: number) => `S${String(id).padStart(4, "0")}`;

type DeviceInfoWords = ProDictionary["importing"]["device"]["info"];

/** One cell of the device's report: a label, a word, and a line under it. */
interface StatusCell {
  label: string;
  value: string;
  detail?: string;
  bad?: boolean;
}

/**
 * The receiver's snapshot as a cell: its state, and under it only what means
 * something in that state — with a fix, satellites and age; without one, the
 * fields the firmware fills with sentinels (HDOP 9999, signal NONE, 0
 * satellites) are left out, and "No fix · 1.1 s ago" is the whole truth.
 */
function gpsCell(
  gps: NonNullable<BikitDeviceInfo["gps"]>,
  t: DeviceInfoWords,
  locale: Locale,
): StatusCell {
  const value =
    gps.state === "FIX"
      ? t.gpsFix
      : gps.state === "NO_FIX"
        ? t.gpsNoFix
        : gps.state === "NO_DATA"
          ? t.gpsNoData
          : gps.state;
  const detail: string[] = [];
  if (gps.satellites > 0) detail.push(t.satellites(gps.satellites));
  if (Number.isFinite(gps.ageMs) && gps.state !== "NO_DATA")
    detail.push(t.ago(proNumber(gps.ageMs / 1000, locale, 1)));
  return {
    label: "GPS",
    value,
    detail: detail.join(" · ") || undefined,
    bad: gps.state === "NO_DATA",
  };
}

/**
 * The battery as the reference draws it (2026-11-06, Miguel's SVGs): the
 * cell's outline in the ink colour, filled by the charge — green, amber
 * under half, red under a fifth — with the percentage beside it and the
 * millivolts small, still the number to trust while the curve is validated.
 */
function BatteryReading({
  percent,
  millivolts,
  label,
}: {
  percent: number;
  millivolts: number;
  label: string;
}) {
  const locale = useProLocale();
  const p = Math.max(0, Math.min(100, percent));
  const fill = p >= 50 ? "#43F3AF" : p >= 20 ? "#FFC711" : "#E0442F";
  return (
    <div
      className="flex items-center gap-3.5"
      role="img"
      aria-label={`${label} ${p}% · ${proNumber(millivolts, locale)} mV`}
    >
      <svg width="42" height="20" viewBox="0 0 50 24" fill="none" aria-hidden>
        <path
          d="M4.01286 1H41.9871C43.6511 1 45 2.36352 45 4.04551V19.9545C45 21.6365 43.6511 23 41.9871 23H4.01286C2.3489 23 1 21.6365 1 19.9545V4.04551C1 2.36352 2.3489 1 4.01286 1Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M46.2147 7.88477H45V16.1173H46.2147C47.717 16.1173 48.9461 14.8069 48.9461 13.2052V10.7969C48.9461 9.19521 47.717 7.88477 46.2147 7.88477Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="4"
          y="4"
          width={(36 * Math.max(p, 4)) / 100}
          height="16"
          fill={fill}
        />
      </svg>
      <span className="font-display text-[22px] leading-none font-bold tabular-nums">
        {p}%
      </span>
      <span className="-ml-2 text-[10px] leading-none text-muted-foreground tabular-nums">
        {proNumber(millivolts, locale)} mV
      </span>
    </div>
  );
}

export function BikitDeviceImport({
  userId,
  riderDefault,
  riders,
  bikes,
  groups,
  onImported,
}: {
  userId: string;
  riderDefault: string;
  /** The riders the account's sessions know, most recent first. */
  riders: string[];
  bikes: BikeOption[];
  /** The account's groups, newest first; today's most recent is preselected. */
  groups: ImuGroupOption[];
  /** The session is in Storage and registered; the dialog decides what next. */
  onImported: () => void;
}) {
  const dict = useProDict();
  const t = dict.importing.device;
  const locale = useProLocale();
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
  /** How many of the card's sessions the list shows: no scroll inside the
   * dialog's own (by request, 2026-11-06), so it grows to a page of them
   * and "Show more" adds the next. */
  const [shown, setShown] = useState(SESSIONS_PAGE);
  /** The sessions ticked for a transfer of several at once. */
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  /** The account's tracks, read once for a several-at-once import and
   * grown by the tracks its first runs draw, so none is drawn twice. */
  const tracksRef = useRef<ImportTrack[] | null>(null);
  const [pin, setPin] = useState("");
  /** Remember the PIN with the account, for this device. On by default: the
   * PIN is asked on EVERY connection (the device forgets it when the link
   * drops), and typing it each time — on the laptop and again on the phone —
   * would make the lock the thing people remember about the feature. */
  const [rememberPin, setRememberPin] = useState(true);
  const [name, setName] = useState("");
  const [rider, setRider] = useState(riderDefault);
  const [bikeId, setBikeId] = useState("");
  const [newBikeName, setNewBikeName] = useState("");
  const [groupId, setGroupId] = useState(() => defaultGroupId(groups));
  const [newGroupName, setNewGroupName] = useState("");
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
          p.kind === "ready" ||
          p.kind === "saving" ||
          p.kind === "readyMany" ||
          p.kind === "savingMany"
            ? p
            : { kind: "idle" },
        );
        setNotice(t.deviceDisconnected);
      });
      await device.ping();
      await authenticate(device);
    } catch (e) {
      failConnect(e);
    }
  }

  /**
   * The lock, per connection. A PIN remembered for this device is tried
   * first; refused, it is forgotten and asked for again. With none saved,
   * INFO is tried before asking — a firmware without the lock answers it,
   * and a firmware with it says AUTH_REQUIRED, which is the cue for the
   * form. Nothing here assumes a device is still authenticated from last
   * time: the device forgets at disconnect, so this runs on every connect.
   */
  async function authenticate(device: BikitDevice) {
    setPhase({ kind: "authenticating" });
    const saved = await loadDevicePin(device.name);
    if (saved) {
      try {
        await device.auth(saved);
      } catch (e) {
        if (e instanceof BikitDeviceError && e.raw === "AUTH_FAIL") {
          void forgetDevicePin(device.name);
          setNotice(t.savedPinRefused);
          setPhase({ kind: "auth", hadSaved: true });
          return;
        }
        throw e;
      }
      await afterAuth(device);
      return;
    }
    try {
      await afterAuth(device);
    } catch (e) {
      if (e instanceof BikitDeviceError && e.raw === AUTH_REQUIRED) {
        setPhase({ kind: "auth", hadSaved: false });
        return;
      }
      throw e;
    }
  }

  /** Past the lock: read the device and its card. */
  async function afterAuth(device: BikitDevice) {
    setInfo(await device.info());
    setShown(SESSIONS_PAGE);
    setSelected(new Set());
    setPhase({ kind: "connected", sessions: null, listing: true });
    const sessions = await device.listSessions();
    setPhase({ kind: "connected", sessions, listing: false });
  }

  async function submitPin() {
    const device = deviceRef.current;
    if (!device || !pin.trim()) return;
    setError(null);
    setNotice(null);
    setPhase({ kind: "authenticating" });
    try {
      const result = await device.auth(pin);
      if (result === "ok" && rememberPin)
        void saveDevicePin(device.name, pin.trim());
      setPin("");
      await afterAuth(device);
    } catch (e) {
      if (e instanceof BikitDeviceError && e.raw === "AUTH_FAIL") {
        setError(t.wrongPin);
        setPhase({ kind: "auth", hadSaved: false });
        return;
      }
      failConnect(e);
    }
  }

  /** A command the device refused for want of a PIN — it forgot us (a
   * reconnect on its side) — is answered with the form, not an error. */
  function handleCommandError(e: unknown, fallback: () => void) {
    if (e instanceof BikitDeviceError && e.raw === AUTH_REQUIRED) {
      setPhase({ kind: "auth", hadSaved: false });
      return;
    }
    setError(describe(e));
    fallback();
  }

  function failConnect(e: unknown) {
    // Closing the picker is a decision, not a failure.
    if (!/cancel/i.test(describe(e))) setError(describe(e));
    if (deviceRef.current && deviceRef.current.isConnected) {
      // Connected but something after the link failed: stay connected, so
      // the session can still be asked for by number and the log read.
      setPhase({ kind: "connected", sessions: null, listing: false });
    } else {
      deviceRef.current?.disconnect();
      deviceRef.current = null;
      setPhase({ kind: "idle" });
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
    setShown(SESSIONS_PAGE);
    setSelected(new Set());
    setPhase((p) => (p.kind === "connected" ? { ...p, listing: true } : p));
    try {
      const sessions = await device.listSessions();
      setPhase({ kind: "connected", sessions, listing: false });
    } catch (e) {
      handleCommandError(e, () =>
        setPhase((p) =>
          p.kind === "connected" ? { ...p, listing: false } : p,
        ),
      );
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
        onProgress: throttleBleProgress(({ uniqueBytes, totalBytes }) =>
          setPhase((p) =>
            p.kind === "transferring" ? { ...p, uniqueBytes, totalBytes } : p,
          ),
        ),
      });
      setDiagnostics(diag);

      // Arrived whole is not the same as valid: the full .BKT validation —
      // header, calibration and every block's CRC — runs here, exactly as
      // for a file picked from disk.
      const parsed = parseImuBytes(bytes, locale);
      if (!parsed.ok) {
        setError(t.failedValidation(parsed.error));
        setPhase({ kind: "connected", sessions, listing: false });
        return;
      }
      setName(parsed.session.sessionId ?? sessionLabel(entry.id));
      setRider(riderDefault);
      setBikeId("");
      setGroupId(defaultGroupId(groups));
      setNewGroupName("");
      setPhase({
        kind: "ready",
        sessions,
        sessionId: entry.id,
        bytes,
        session: parsed.session,
        // Same summary the page computes: bike's frame, curves and braking
        // included. The transferred bytes are stored as they came.
        summary: sessionSummary(
          withBikeFrameEvents(alignSession(parsed.session)),
        ),
      });
    } catch (e) {
      handleCommandError(e, () =>
        setPhase(
          deviceRef.current
            ? { kind: "connected", sessions, listing: false }
            : { kind: "idle" },
        ),
      );
    } finally {
      abortRef.current = null;
    }
  }

  function resetDetails() {
    setRider(riderDefault);
    setBikeId("");
    setGroupId(defaultGroupId(groups));
    setNewGroupName("");
  }

  /**
   * Several sessions off the card, one after the other: each through the
   * same .BKT validation as a single one, a failed one named in the error
   * without stopping the rest. Cancel stops the queue and keeps what had
   * already arrived. Then they are named as the file tab names its files —
   * "R0161", and after the track it passes when it passes one.
   */
  async function transferMany(
    queue: BikitSessionEntry[],
    sessions: BikitSessionEntry[],
  ) {
    const device = deviceRef.current;
    if (!device || queue.length === 0) return;
    setError(null);
    setNotice(null);
    setDiagnostics(null);
    setSelected(new Set());
    const controller = new AbortController();
    abortRef.current = controller;
    const arrived: Omit<DeviceItem, "name">[] = [];
    const failures: string[] = [];
    try {
      for (let index = 0; index < queue.length; index++) {
        const entry = queue[index];
        if (controller.signal.aborted || !deviceRef.current) break;
        setPhase({
          kind: "transferringMany",
          sessions,
          queue,
          index,
          uniqueBytes: 0,
          totalBytes: entry.sizeBytes,
        });
        try {
          const { bytes, diagnostics: diag } = await device.download(entry.id, {
            signal: controller.signal,
            onProgress: throttleBleProgress(({ uniqueBytes, totalBytes }) =>
              setPhase((p) =>
                p.kind === "transferringMany"
                  ? { ...p, uniqueBytes, totalBytes }
                  : p,
              ),
            ),
          });
          setDiagnostics(diag);
          const parsed = parseImuBytes(bytes, locale);
          if (!parsed.ok) {
            failures.push(
              `${sessionLabel(entry.id)}: ${t.failedValidation(parsed.error)}`,
            );
            continue;
          }
          arrived.push({
            sessionId: entry.id,
            bytes,
            session: parsed.session,
            summary: sessionSummary(
              withBikeFrameEvents(alignSession(parsed.session)),
            ),
            base: parsed.session.sessionId ?? sessionLabel(entry.id),
          });
        } catch (e) {
          if (controller.signal.aborted) break;
          if (e instanceof BikitDeviceError && e.raw === AUTH_REQUIRED) {
            setPhase({ kind: "auth", hadSaved: false });
            return;
          }
          failures.push(`${sessionLabel(entry.id)}: ${describe(e)}`);
          if (!deviceRef.current) break;
        }
      }
    } finally {
      abortRef.current = null;
    }
    if (failures.length > 0) setError(failures.join("\n"));
    if (arrived.length === 0) {
      setPhase(
        deviceRef.current
          ? { kind: "connected", sessions, listing: false }
          : { kind: "idle" },
      );
      return;
    }
    const known = tracksRef.current ?? (await loadImportTracks());
    tracksRef.current = known;
    resetDetails();
    setPhase({
      kind: "readyMany",
      sessions,
      items: arrived.map((item) => {
        const track = firstTrackPassed(item.session, known);
        return {
          ...item,
          name: track ? `${item.base} - ${track.name}` : item.base,
        };
      }),
    });
  }

  /** One at a time, as the file tab imports several: a new bike or group
   * is made by the first and found by name for the rest, and a track a run
   * draws names the runs after it. A failure keeps what did not land. */
  async function saveMany() {
    if (phase.kind !== "readyMany") return;
    const { sessions, items } = phase;
    setError(null);
    let known = tracksRef.current ?? (await loadImportTracks());
    for (let i = 0; i < items.length; i++) {
      setPhase({ kind: "savingMany", sessions, items, progress: i + 1 });
      let item = items[i];
      if (item.name === item.base) {
        const track = firstTrackPassed(item.session, known);
        if (track) item = { ...item, name: `${item.base} - ${track.name}` };
      }
      const outcome = await uploadAndRegisterImuSession({
        userId,
        bytes: new Blob([item.bytes]),
        session: item.session,
        summary: item.summary,
        name: item.name,
        riderName: rider,
        bike: bikeRefFromForm(bikeId, newBikeName),
        group: groupRefFromForm(groupId, newGroupName),
        locale,
        tracks: known,
      });
      if (outcome.ok && outcome.track) known = [outcome.track, ...known];
      tracksRef.current = known;
      if (!outcome.ok) {
        setError(`${item.name}: ${outcome.error}`);
        setPhase({ kind: "readyMany", sessions, items: items.slice(i) });
        return;
      }
    }
    onImported();
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
      bike: bikeRefFromForm(bikeId, newBikeName),
      group: groupRefFromForm(groupId, newGroupName),
      locale,
    });
    if (!outcome.ok) {
      setError(outcome.error);
      setPhase({ kind: "ready", sessions, sessionId, bytes, session, summary });
      return;
    }
    onImported();
  }

  const connected = phase.kind !== "idle" && phase.kind !== "connecting";
  const battery = connected && info?.battery ? info.battery : null;
  // The device's report as cells, each only when its firmware sent it — a
  // line left out is not shown as OK.
  const cells: StatusCell[] = [];
  if (connected && info) {
    if (info.gps) cells.push(gpsCell(info.gps, t.info, locale));
    if (info.sd)
      cells.push({
        label: t.info.sdCard,
        value: info.sd === "OK" ? t.info.ok : info.sd,
        bad: info.sd !== "OK",
      });
    if (info.imu)
      cells.push({
        label: "IMU",
        value: info.imu === "OK" ? t.info.ok : info.imu,
        bad: info.imu !== "OK",
      });
    // The calibration the logger will record with (by request, 2026-10-27):
    // its state, and its steps once the firmware sends them.
    if (info.calibration)
      cells.push({
        label: t.info.calibration,
        value: info.calibration.valid ? t.info.ok : t.info.calInvalid,
        detail:
          info.calibration.valid && info.calibration.steps !== null
            ? t.info.calSteps(info.calibration.steps)
            : undefined,
        bad: !info.calibration.valid,
      });
  }
  const hasBody =
    connected || error != null || notice != null || logLines.length > 0;

  return (
    <div className="min-w-0">
      {/* The device itself (reference layout, 2026-11-06): who it is on the
          left, its battery and the link's button on the right, and what it
          says about its subsystems in a row of cells below. */}
      <div className="space-y-9 p-6 pb-8 sm:p-7 sm:pb-9">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-[24px] leading-tight font-semibold">
              {t.deviceTitle}
            </h3>
            {connected ? (
              <dl className="mt-1 text-sm leading-snug">
                <div className="flex gap-1.5">
                  <dt>{t.serialNumber}:</dt>
                  <dd className="min-w-0 truncate tabular-nums">
                    {info?.uid
                      ? // The serial as the device's own record writes it
                        // (DEV1, 2026-11-06): "BIKIT-" and the 16 hex digits.
                        /^BIKIT-/i.test(info.uid)
                        ? info.uid
                        : `BIKIT-${info.uid}`
                      : deviceName || "–"}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>{t.firmwareVersion}:</dt>
                  <dd className="min-w-0 truncate tabular-nums">
                    {info?.firmware.split("-")[0] || "–"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {!supported
                  ? t.noWebBluetooth
                  : phase.kind === "connecting"
                    ? t.connecting
                    : t.idleHint}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-7">
            {battery &&
              ("unavailable" in battery ? (
                // The line came but the ADC gave nothing — say so, rather
                // than leaving it out as if the firmware were old.
                <p className="text-xs text-muted-foreground">
                  {t.info.battery}: {t.info.noReading(battery.raw)}
                </p>
              ) : (
                <BatteryReading
                  percent={battery.percent}
                  millivolts={battery.millivolts}
                  label={t.info.battery}
                />
              ))}
            {connected ? (
              <Button
                variant="ghost"
                size="sm"
                className={cn(MUTED_PILL, "h-10 px-7 text-[15px]")}
                onClick={disconnect}
                disabled={
                  phase.kind === "saving" || phase.kind === "savingMany"
                }
              >
                {t.disconnect}
              </Button>
            ) : (
              <Button
                variant="inverted"
                size="sm"
                className="px-5 text-base"
                onClick={connect}
                disabled={!supported || phase.kind === "connecting"}
              >
                {phase.kind === "connecting" ? (
                  <Loader2
                    data-icon="inline-start"
                    className="motion-safe:animate-spin"
                  />
                ) : (
                  <Bluetooth data-icon="inline-start" />
                )}
                {t.connect}
              </Button>
            )}
          </div>
        </div>

        {cells.length > 0 && (
          <dl
            className="grid gap-px overflow-hidden rounded-[20px] border border-border bg-border"
            style={{
              gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
            }}
          >
            {cells.map((cell) => (
              <div
                key={cell.label}
                className="flex min-w-0 flex-col items-center justify-center bg-card px-1.5 py-2.5 text-center"
              >
                <dt className="text-xs text-muted-foreground">{cell.label}</dt>
                <dd
                  className={cn(
                    "mt-0.5 text-sm leading-tight font-bold sm:text-base",
                    cell.bad && "text-destructive",
                  )}
                >
                  {cell.value}
                </dd>
                {cell.detail && (
                  <dd className="text-xs text-muted-foreground tabular-nums">
                    {cell.detail}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}
      </div>

      {hasBody && (
        <div className="min-w-0 space-y-5 border-t border-border p-6 sm:p-7">
          {/* The lock. Asked on every connection, because the device forgets
          the moment the link drops; remembered here so it is typed once. */}
          {phase.kind === "auth" && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPin();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="ble-pin">{t.pinLabel}</Label>
                <Input
                  id="ble-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  placeholder="••••••"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                />
              </div>
              <label
                htmlFor="ble-remember"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Checkbox
                  id="ble-remember"
                  checked={rememberPin}
                  onCheckedChange={(checked) =>
                    setRememberPin(checked === true)
                  }
                />
                {t.rememberPin}
              </label>
              <Button
                type="submit"
                variant="inverted"
                className="w-full"
                disabled={!pin.trim()}
              >
                {t.authenticate}
              </Button>
            </form>
          )}

          {phase.kind === "authenticating" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2
                className="size-4 shrink-0 motion-safe:animate-spin"
                aria-hidden
              />
              {t.authenticating}
            </p>
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
              {t.listing}
            </p>
          )}

          {phase.kind === "connected" && !phase.listing && phase.sessions && (
            // First in its section, it sits right under the section's own line:
            // pulled up over the padding, with only its bottom border.
            <div className="-mx-6 -mt-6 overflow-hidden border-b border-border sm:-mx-7 sm:-mt-7">
              {phase.sessions.length === 0 ? (
                <p className="px-6 py-4 text-sm text-muted-foreground sm:px-7">
                  {t.emptyCard}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {phase.sessions.slice(0, shown).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-6 py-3 sm:px-7"
                    >
                      <label className="flex min-w-0 cursor-pointer items-center gap-3">
                        <Checkbox
                          checked={selected.has(entry.id)}
                          onCheckedChange={(checked) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (checked === true) next.add(entry.id);
                              else next.delete(entry.id);
                              return next;
                            })
                          }
                          aria-label={sessionLabel(entry.id)}
                          className="grid size-5 place-items-center rounded-[6px] data-[checked]:border-foreground data-[checked]:bg-foreground data-[checked]:text-primary [&_svg]:size-3.5"
                        />
                        <span className="font-semibold tabular-nums">
                          {sessionLabel(entry.id)}
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatBytes(entry.sizeBytes, locale)}
                        </span>
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(MUTED_PILL, "px-6")}
                        onClick={() => transfer(entry, phase.sessions!)}
                      >
                        {t.transfer}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3 sm:px-7">
                <button
                  type="button"
                  onClick={refreshSessions}
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  {t.refreshList}
                </button>
                {phase.sessions.length > shown && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-9 bg-muted px-4 text-sm text-foreground hover:bg-border"
                    onClick={() => setShown((n) => n + SESSIONS_PAGE)}
                  >
                    {t.showMore(phase.sessions.length - shown)}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Several at once (by request, 2026-11-06): the ticked ones, in
              the list's order, one after the other. */}
          {phase.kind === "connected" &&
            !phase.listing &&
            phase.sessions &&
            selected.size > 0 && (
              <Button
                variant="inverted"
                className="w-full"
                onClick={() =>
                  transferMany(
                    phase.sessions!.filter((entry) => selected.has(entry.id)),
                    phase.sessions!,
                  )
                }
              >
                {t.transferSelected(selected.size)}
              </Button>
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
              <div className="min-w-0 flex-1 space-y-2">
                <Label
                  htmlFor="ble-manual-id"
                  className="text-base font-semibold"
                >
                  {t.manualIdLabel}
                </Label>
                <Input
                  id="ble-manual-id"
                  inputMode="numeric"
                  placeholder="48"
                  value={manualId}
                  onChange={(event) =>
                    setManualId(
                      event.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                />
              </div>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className={cn(MUTED_PILL, "px-6")}
                disabled={!manualId}
              >
                {t.transfer}
              </Button>
            </form>
          )}

          {phase.kind === "transferringMany" && (
            <TransferProgressView
              label={t.transferringMany(
                sessionLabel(phase.queue[phase.index].id),
                phase.index + 1,
                phase.queue.length,
              )}
              uniqueBytes={phase.uniqueBytes}
              totalBytes={phase.totalBytes}
              onCancel={() => abortRef.current?.abort()}
            />
          )}

          {(phase.kind === "readyMany" || phase.kind === "savingMany") && (
            <>
              {/* The names as a list, read-only as in the file tab: each can be
              changed on the session afterwards. */}
              <ul className="divide-y divide-border rounded-[12px] border border-border">
                {phase.items.map((item) => (
                  <li
                    key={item.sessionId}
                    className="flex items-baseline justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatSessionTime(item.summary.durationMs)} ·{" "}
                      {dict.importing.dialog.events(item.summary.eventCount)}
                    </span>
                  </li>
                ))}
              </ul>
              {phase.items.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  {dict.importing.dialog.sharedHint}
                </p>
              )}
              <ImuSessionDetailsFields
                idPrefix="ble-many"
                rider={rider}
                onRiderChange={setRider}
                riderDefault={riderDefault}
                riders={riders}
                bikeId={bikeId}
                onBikeIdChange={setBikeId}
                bikes={bikes}
                newBikeName={newBikeName}
                onNewBikeNameChange={setNewBikeName}
                groups={groups}
                groupId={groupId}
                onGroupIdChange={setGroupId}
                newGroupName={newGroupName}
                onNewGroupNameChange={setNewGroupName}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={phase.kind === "savingMany"}
                  onClick={() =>
                    setPhase(
                      deviceRef.current
                        ? {
                            kind: "connected",
                            sessions: phase.sessions,
                            listing: false,
                          }
                        : { kind: "idle" },
                    )
                  }
                >
                  {t.backToList}
                </Button>
                <Button
                  variant="inverted"
                  className="flex-1"
                  disabled={
                    phase.kind === "savingMany" ||
                    !groupFormValid(groupId, newGroupName) ||
                    !bikeFormValid(bikeId, newBikeName)
                  }
                  onClick={saveMany}
                >
                  {phase.kind === "savingMany"
                    ? dict.importing.dialog.importingProgress(
                        phase.progress,
                        phase.items.length,
                      )
                    : dict.importing.dialog.importMany(phase.items.length)}
                </Button>
              </div>
            </>
          )}

          {phase.kind === "transferring" && (
            <TransferProgressView
              label={t.transferring(sessionLabel(phase.sessionId))}
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
                  {t.validated(sessionLabel(phase.sessionId))}
                </p>
                {phase.kind === "ready" && (
                  <p className="mt-0.5 text-muted-foreground">
                    {formatSessionTime(phase.summary.durationMs)} ·{" "}
                    {Math.round(phase.summary.sampleRateHz)} Hz ·{" "}
                    <span className="tabular-nums">
                      {proNumber(phase.summary.sampleCount, locale)}
                    </span>{" "}
                    {dict.common.units.samples}
                    {phase.session.gps ? " · GPS" : ""}
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
                riders={riders}
                bikeId={bikeId}
                onBikeIdChange={setBikeId}
                bikes={bikes}
                newBikeName={newBikeName}
                onNewBikeNameChange={setNewBikeName}
                groups={groups}
                groupId={groupId}
                onGroupIdChange={setGroupId}
                newGroupName={newGroupName}
                onNewGroupNameChange={setNewGroupName}
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
                  {t.backToList}
                </Button>
                <Button
                  variant="inverted"
                  className="flex-1"
                  disabled={
                    phase.kind === "saving" ||
                    !name.trim() ||
                    !groupFormValid(groupId, newGroupName) ||
                    !bikeFormValid(bikeId, newBikeName)
                  }
                  onClick={save}
                >
                  {phase.kind === "saving"
                    ? dict.importing.importingButton
                    : dict.importing.importButton}
                </Button>
              </div>
            </>
          )}

          {/* Written on screen, never a toast — the garage rule. */}
          {error && (
            <p className="text-sm whitespace-pre-line text-destructive">
              {error}
            </p>
          )}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

          {logLines.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowLog((s) => !s)}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {showLog ? t.hideLog : t.bleLog(logLines.length)}
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
                        `${new Date(line.at).toLocaleTimeString(PRO_NUMBER_LOCALE[locale], { hour12: false })}.${String(line.at % 1000).padStart(3, "0")} ${line.direction === "out" ? "→" : "←"} ${line.text}`,
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
                {showDetails ? t.hideDetails : t.transferDetails}
              </button>
              {showDetails && (
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <Diag label={t.diag.packets} value={diagnostics.packets} />
                  <Diag
                    label={t.diag.duplicates}
                    value={diagnostics.duplicates}
                  />
                  <Diag label={t.diag.windows} value={diagnostics.windows} />
                  <Diag label={t.diag.acks} value={diagnostics.acks} />
                  <Diag label={t.diag.reAcks} value={diagnostics.reAcks} />
                  <Diag
                    label={t.diag.payload}
                    value={`${diagnostics.payloadSize} B`}
                  />
                  <Diag
                    label={t.diag.window}
                    value={`${diagnostics.windowSize} B`}
                  />
                  <Diag
                    label={t.diag.time}
                    value={`${proNumber(diagnostics.elapsedMs / 1000, locale, 1)} s`}
                  />
                </dl>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Diag({ label, value }: { label: string; value: number | string }) {
  const locale = useProLocale();
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="text-foreground">
        {typeof value === "number" ? proNumber(value, locale) : value}
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
  const t = useProDict();
  const locale = useProLocale();
  const fraction = totalBytes > 0 ? Math.min(1, uniqueBytes / totalBytes) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X data-icon="inline-start" />
          {t.common.cancel}
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
        {Math.round(fraction * 100)}% · {formatBytes(uniqueBytes, locale)} /{" "}
        {formatBytes(totalBytes, locale)}
      </p>
    </div>
  );
}
