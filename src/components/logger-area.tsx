"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bluetooth,
  Check,
  ChevronDown,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoggerDeviceCard } from "@/components/logger-device-card";
import { BIKE_ICON_FALLBACK, MotorbikeIcon } from "@/components/bike-type-icon";
import {
  AutoStopIcon,
  GpsFixIcon,
  MotionSleepIcon,
  SleepModeIcon,
  SleepTimerIcon,
  TimedSleepIcon,
  LinearSensorIcon,
  InfraredSensorIcon,
} from "@/components/menu-icons";
import { useProDict } from "@/components/pro-locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { cn } from "@/lib/utils";
import {
  SENSOR_TYPE_VALUE,
  SLEEP_MINUTES,
  type BikitConfigKey,
  type BikitDeviceConfig,
  type BikitDeviceInfo,
  type BikitGpsStatus,
  type BikitRemoteLive,
  type BikitSensorType,
  type BikitVehicleType,
} from "@/lib/bikit-ble/protocol";
import { BikitPinForm, useBikitLink } from "@/components/use-bikit-link";

/**
 * The Logger area (2026-11-08): connect to the logger, see it in the header
 * — the same card as the import dialog's device tab — and change how it
 * records in the Settings tab. More tabs will join Settings (the card's
 * sessions, calibration, firmware); the connection is the page's, so they
 * will share it.
 *
 * The connection lives and dies with this page. A held link is a held
 * radio, and the logger cannot record while a client is attached, so
 * leaving the page lets go of it. The import dialog keeps its own link for
 * now; moving it onto this one is the next step, not this one.
 *
 * Every setting is the logger's, not the account's: CONFIG reads them, and
 * each change is one SET that is shown as saved only when SET_OK comes
 * back. A refusal puts the control back where it was, with the logger's
 * reason. A firmware without CONFIG (all of them, until the firmware's
 * phase 1) says so and leaves the controls off.
 */

type ConfigState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string }
  | { kind: "ready"; config: BikitDeviceConfig };

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The rider said no before anything was sent: the control goes back, with
 * no message (the remote's warning, 2026-11-26). */
class SaveCancelled extends Error {}

export function LoggerArea({ simulate }: { simulate: boolean }) {
  const dict = useProDict();
  const t = dict.logger;
  const td = dict.importing.device;
  const [info, setInfo] = useState<BikitDeviceInfo | null>(null);
  const [config, setConfig] = useState<ConfigState>({ kind: "loading" });
  /** One command on the air at a time: Web Bluetooth refuses a write while
   * another is in flight, and the GPS detail polls beside the settings'
   * SETs (2026-11-09). Each command waits for the one before it. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  /** The remote's notifications (2026-11-26), newer than the last CONFIG
   * for the keys they carry. Listened to from the moment the PIN is
   * accepted — the logger sends them right after it, before INFO answers. */
  const [remoteLive, setRemoteLive] = useState<BikitRemoteLive>({});
  const stopRemoteRef = useRef<(() => void) | null>(null);
  /** A fresh CONFIG is newer than any notification for the keys it sent. */
  const takeConfig = (read: BikitDeviceConfig) => {
    setRemoteLive((live) => ({
      available: read.remoteAvailable !== null ? undefined : live.available,
      connected: read.remoteConnected !== null ? undefined : live.connected,
      battery: read.remoteBattery !== null ? undefined : live.battery,
    }));
    setConfig({ kind: "ready", config: read });
  };
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = queueRef.current.then(fn, fn);
    queueRef.current = next.catch(() => undefined);
    return next;
  }

  // The picker, the PIN and the link's ups and downs are the shared hook's
  // (2026-11-22, with the setup's live SAG): past the lock, INFO for the
  // header, then CONFIG for the Settings tab.
  const link = useBikitLink({
    simulate,
    // Through the queue: the GPS detail starts polling as soon as the link
    // is up, and the two must not write at once.
    onAuthenticated: async (device) => {
      stopRemoteRef.current?.();
      setRemoteLive({});
      stopRemoteRef.current = device.watchRemote((live) =>
        setRemoteLive((r) => ({ ...r, ...live })),
      );
      setInfo(await serial(() => device.info()));
      setConfig({ kind: "loading" });
      try {
        const read = await serial(() => device.readConfig());
        if (read) takeConfig(read);
        else setConfig({ kind: "unsupported" });
      } catch (e) {
        setConfig({ kind: "error", message: describe(e) });
      }
    },
    onLost: () => {
      setInfo(null);
      stopRemoteRef.current?.();
      stopRemoteRef.current = null;
      setRemoteLive({});
    },
  });
  const { phase, error, notice, deviceName, supported } = link;
  const linkedDevice = link.device;
  const connect = link.connect;
  const disconnect = link.disconnect;

  /** One SET; the screen moves to what the logger says it stored. */
  async function save(key: BikitConfigKey, value: string) {
    const device = linkedDevice();
    if (!device) throw new Error(td.deviceDisconnected);
    const stored = await serial(() => device.setConfig(key, value));
    setConfig((c) => {
      if (c.kind !== "ready") return c;
      const next = { ...c.config };
      for (const [k, v] of Object.entries(stored))
        if (v !== null) (next as Record<string, unknown>)[k] = v;
      return { kind: "ready", config: next };
    });
  }

  /** CONFIG again, all of it, and only done at CONFIG_END (the remote's
   * sync, 2026-11-26): the screen takes the logger's whole answer. */
  async function resync() {
    const device = linkedDevice();
    if (!device) throw new Error(td.deviceDisconnected);
    const read = await serial(() => device.readConfig({ strict: true }));
    if (read) takeConfig(read);
  }

  const connected = phase.kind !== "idle" && phase.kind !== "connecting";

  // The GPS, asked every two seconds while connected (GPS_STATUS), for the
  // header's cell and the folded detail alike. A firmware without the
  // command is asked once; its cell keeps INFO's reading.
  const [gps, setGps] = useState<GpsReading>({ kind: "reading" });
  const isConnected = phase.kind === "connected";
  useEffect(() => {
    if (!isConnected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const device = linkedDevice();
      if (!device) return;
      try {
        const value = await serial(() => device.gpsStatus());
        if (stopped) return;
        if (!value) {
          setGps({ kind: "unsupported" });
          return;
        }
        setGps({ kind: "ok", value });
      } catch (e) {
        if (stopped) return;
        setGps({ kind: "error", message: describe(e) });
      }
      if (!stopped) timer = setTimeout(poll, GPS_POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      setGps({ kind: "reading" });
    };
  }, [isConnected, linkedDevice]);
  // The cell names the state as the GPS detail does (by request,
  // 2026-11-09): "Ready", not "Fix".
  const shownInfo =
    info && gps.kind === "ok"
      ? {
          ...info,
          gps: {
            ...gpsCellFrom(gps.value),
            label: t.gps.states[gps.value.state] ?? gps.value.state,
          },
        }
      : info;

  return (
    <div className="pt-4 sm:pt-8">
      <div className={cn("mb-6 rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <LoggerDeviceCard
          className="p-6 pb-8 sm:p-7 sm:pb-9"
          connected={connected}
          connecting={phase.kind === "connecting"}
          supported={supported}
          info={shownInfo}
          deviceName={deviceName}
          hint={t.idleHint}
          onConnect={connect}
          onDisconnect={disconnect}
        />
        {phase.kind === "connected" && (
          <GpsDetails status={gps} />
        )}
        {(phase.kind === "auth" ||
          phase.kind === "authenticating" ||
          error ||
          notice ||
          simulate) && (
          <div className="space-y-4 border-t border-border p-6 sm:p-7">
            {simulate && (
              <p className="text-xs text-muted-foreground">{t.simulated}</p>
            )}
            {phase.kind === "auth" && (
              <BikitPinForm link={link} idPrefix="logger" />
            )}
            {phase.kind === "authenticating" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden />
                {td.authenticating}
              </p>
            )}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </div>

      <Tabs defaultValue="settings">
        <TabsList variant="pill" className="border border-border">
          <TabsTrigger value="settings" className="px-5 py-2 text-sm">
            {t.tabs.settings}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-4">
          <LoggerSettings
            connected={phase.kind === "connected"}
            state={config}
            save={save}
            resync={resync}
            remoteLive={remoteLive}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────── GPS details ───────────────────────── */

/** How often the open panel asks the logger again, ms. */
const GPS_POLL_MS = 2000;

/**
 * The receiver in detail (GPS_STATUS, firmware V18.10), folded under the
 * header's cells behind "GPS details" so the page stays quiet (by request,
 * 2026-11-09): the state GPS Fix Protection judges START by, the fix, the
 * satellites, the accuracy and the reading's age. The page asks every two
 * seconds while connected; the header's GPS cell reads the same answer.
 */
type GpsReading =
  | { kind: "reading" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string }
  | { kind: "ok"; value: BikitGpsStatus };

/** The INFO_GPS shape the header's cell draws, from a GPS_STATUS reading —
 * so the cell and the detail say the same thing (2026-11-09). */
function gpsCellFrom(v: BikitGpsStatus): NonNullable<BikitDeviceInfo["gps"]> {
  const fix = v.fixType === 2 || v.fixType === 3;
  return {
    state:
      v.state === "NO_DATA" ? "NO_DATA" : fix && v.state !== "STALE" ? "FIX" : "NO_FIX",
    satellites: v.used ?? 0,
    hdop: NaN,
    signal: "NONE",
    ageMs: v.ageMs ?? NaN,
    ready: v.state === "READY",
  };
}

function GpsDetails({ status }: { status: GpsReading }) {
  const t = useProDict().logger.gps;
  const [open, setOpen] = useState(false);

  const v = status.kind === "ok" ? status.value : null;
  const ready = v?.state === "READY";
  const n = (x: number | null) => (x == null ? t.na : String(x));
  return (
    <div className="-mt-4 px-6 pb-6 sm:px-7">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? t.hide : t.show}
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-3 rounded-[20px] border border-border p-4">
          {status.kind === "reading" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
              {t.reading}
            </p>
          )}
          {status.kind === "unsupported" && (
            <p className="text-sm text-muted-foreground">{t.unsupported}</p>
          )}
          {status.kind === "error" && (
            <p className="text-sm text-destructive">{status.message}</p>
          )}
          {v && (
            <>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    ready ? "bg-[#D9FF00]" : "bg-[#FFC711]",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-base font-semibold">
                    {t.states[v.state] ?? v.state}
                  </p>
                  {t.explain[v.state] && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {t.explain[v.state]}
                    </p>
                  )}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">{t.fix}</dt>
                  <dd className="font-semibold tabular-nums">
                    {v.fixType === 2 || v.fixType === 3
                      ? `${v.fixType}D`
                      : v.fixType == null
                        ? t.na
                        : t.fixNone}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t.satellites}
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {t.satellitesValue(n(v.used), n(v.visible))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.accuracy}</dt>
                  <dd className="font-semibold tabular-nums">
                    {v.hAccMm == null ? t.na : `± ${Math.round(v.hAccMm / 1000)} m`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.age}</dt>
                  <dd className="font-semibold tabular-nums">
                    {v.ageMs == null
                      ? t.na
                      : t.ageValue((v.ageMs / 1000).toFixed(1))}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Settings tab ───────────────────────── */

type SaveFn = (key: BikitConfigKey, value: string) => Promise<void>;

function LoggerSettings({
  connected,
  state,
  save,
  resync,
  remoteLive,
}: {
  connected: boolean;
  state: ConfigState;
  save: SaveFn;
  resync: () => Promise<void>;
  remoteLive: BikitRemoteLive;
}) {
  const t = useProDict().logger.settings;
  const config = connected && state.kind === "ready" ? state.config : null;
  /** A firmware with the remote works REMOTE_AVAILABLE out from the
   * suspension's switches, so a change to them is read back — quietly: the
   * sensor's own SET_OK already counted, and the remote's lock follows the
   * switches on this side anyway. */
  const saveSuspension: SaveFn = async (key, value) => {
    await save(key, value);
    if (config?.remoteEnabled != null) await resync().catch(() => undefined);
  };
  /** Turning a suspension sensor on switches the Bluetooth remote off (its
   * button and its BLE link), so the rider is warned first (by request,
   * 2026-11-26) — only when the remote is on and not already locked. No is
   * thrown as SaveCancelled, before any SET. */
  const [askRemote, setAskRemote] = useState<((ok: boolean) => void) | null>(
    null,
  );
  const remoteWouldDrop =
    config !== null &&
    config.remoteEnabled === true &&
    config.forkEnabled !== true &&
    config.shockEnabled !== true;
  async function confirmSensorsOn(on: boolean) {
    if (!on || !remoteWouldDrop) return;
    const ok = await new Promise<boolean>((resolve) =>
      setAskRemote(() => resolve),
    );
    if (!ok) throw new SaveCancelled();
  }
  const answerRemote = (ok: boolean) => {
    askRemote?.(ok);
    setAskRemote(null);
  };
  const status = !connected
    ? t.disconnected
    : state.kind === "loading"
      ? t.loading
      : state.kind === "unsupported"
        ? t.unsupported
        : state.kind === "error"
          ? t.readError(state.message)
          : null;

  return (
    <div className="space-y-4">
      <WarningDialog
        open={askRemote !== null}
        onClose={() => answerRemote(false)}
        title={t.connectivity.warnTitle}
        text={t.connectivity.warnText}
        cancel={t.connectivity.warnCancel}
        confirm={t.connectivity.warnConfirm}
        onConfirm={() => answerRemote(true)}
      />
      {status && (
        <p
          className={cn(
            "flex items-center gap-2 text-sm",
            state.kind === "error" && connected
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {connected && state.kind === "loading" && (
            <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden />
          )}
          {status}
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* The left column stacks too: Power, then Connectivity. */}
        <div className="space-y-4">
        <SettingsCard title={t.power.title}>
          <ToggleRow
            label={t.power.autoStop}
            // 28 px, centred on the title and hint together.
            icon={<AutoStopIcon className="size-7 shrink-0" />}
            hint={(on) => (on === false ? t.power.autoStopOff : t.power.autoStopOn)}
            value={config ? config.autoStop : null}
            onSave={(on) => save("AUTO_STOP", on ? "1" : "0")}
          />
          <ToggleRow
            label={t.power.gpsFix}
            icon={<GpsFixIcon className="size-7 shrink-0" />}
            hint={(on) => (on === false ? t.power.gpsFixOff : t.power.gpsFixOn)}
            value={config ? config.gpsFixProtection : null}
            onSave={(on) => save("GPS_FIX_PROTECTION", on ? "1" : "0")}
          />
          {/* Sleep Mode (2026-11-08): AUTO_SLEEP picks HOW the logger sleeps
              when it is not recording, not WHETHER — it always sleeps, by
              the timer, and the timer counts in both modes. */}
          <ChoiceRow
            label={t.power.sleepMode}
            hint={t.power.sleepModeHint}
            icon={<SleepModeIcon className="size-7 shrink-0" />}
            value={config ? config.autoSleep : null}
            options={[
              {
                value: true,
                label: t.power.timedSleep,
                hint: t.power.timedSleepHint,
                icon: <TimedSleepIcon className="size-6" />,
              },
              {
                value: false,
                label: t.power.motionSleep,
                hint: t.power.motionSleepHint,
                icon: <MotionSleepIcon className="h-6 w-auto" />,
              },
            ]}
            onSave={(timed) => save("AUTO_SLEEP", timed ? "1" : "0")}
          />
          <SleepSliderRow
            value={config ? config.sleepMinutes : null}
            onSave={(n) => save("SLEEP_MIN", String(n))}
          />
        </SettingsCard>
        {/* Connectivity (2026-11-26): the Bluetooth remote. Drawn and
            disabled until CONFIG is read, as the other cards (by request,
            2026-11-26); hidden once a CONFIG without REMOTE_ENABLE says the
            firmware has no remote. */}
        {(config === null || config.remoteEnabled !== null) && (
          <SettingsCard title={t.connectivity.title}>
            <RemoteRow
              config={config}
              live={remoteLive}
              onSave={async (on) => {
                await save("REMOTE_ENABLE", on ? "1" : "0");
                try {
                  await resync();
                } catch (e) {
                  throw new Error(t.connectivity.syncError(describe(e)));
                }
              }}
            />
          </SettingsCard>
        )}
        </div>
        {/* The right column stacks: the vehicle, then the linear sensors
            (2026-11-22), so the left card's height is not left empty. */}
        <div className="space-y-4">
          <SettingsCard title={t.vehicle.title} hint={t.vehicle.hint}>
            <ChoiceRow
              label={t.vehicle.title}
              hideLabel
              value={config ? config.vehicle : null}
              options={[
                {
                  value: "BICYCLE",
                  label: t.vehicle.bicycle,
                  hint: t.vehicle.bicycleHint,
                  icon: <BIKE_ICON_FALLBACK className="h-6 w-auto" />,
                },
                {
                  value: "MOTORCYCLE",
                  label: t.vehicle.motorcycle,
                  hint: t.vehicle.motorcycleHint,
                  icon: <MotorbikeIcon className="h-6 w-auto" />,
                },
              ]}
              onSave={(v: BikitVehicleType) => save("VEHICLE", v)}
            />
          </SettingsCard>
          {/* The suspension's sensors (renamed from "linear" on 2026-11-25,
              when the infrared one came): each in or out of the recordings,
              and under each, while on, its type. LINEAR_ENABLED (the
              fork, CH0) and SHOCK_ENABLED (the shock, CH1), the same switch
              for both (by request, 2026-11-22; firmware V19.0.036). Before
              it the firmware sends only the shock's, and the fork's switch
              stays disabled, saying why. A logger whose CONFIG sends
              neither has no linear sensors. */}
          <SettingsCard
            title={t.linear.title}
            hint={
              config &&
              config.forkEnabled === null &&
              config.shockEnabled === null
                ? t.linear.unsupported
                : t.linear.hint
            }
            action={
              <CardToggle
                label={t.linear.both}
                values={
                  config ? [config.forkEnabled, config.shockEnabled] : [null]
                }
                onSave={async (on) => {
                  await confirmSensorsOn(on);
                  const value = on ? "1" : "0";
                  await save("LINEAR_ENABLED", value);
                  await saveSuspension("SHOCK_ENABLED", value);
                }}
              />
            }
          >
            <ToggleRow
              label={t.linear.fork}
              hint={(on) =>
                config && config.forkEnabled === null && config.shockEnabled !== null
                  ? t.linear.forkNotSent
                  : on === false
                    ? t.linear.forkOff
                    : t.linear.forkOn
              }
              value={config ? config.forkEnabled : null}
              onSave={async (on) => {
                await confirmSensorsOn(on);
                await saveSuspension("LINEAR_ENABLED", on ? "1" : "0");
              }}
            >
              {() => (
                <SensorTypeRow
                  label={t.linear.fork}
                  value={config ? config.forkType : null}
                  onSave={(type) => save("LINEAR_TYPE", SENSOR_TYPE_VALUE[type])}
                />
              )}
            </ToggleRow>
            <ToggleRow
              label={t.linear.shock}
              hint={(on) => (on === false ? t.linear.shockOff : t.linear.shockOn)}
              value={config ? config.shockEnabled : null}
              onSave={async (on) => {
                await confirmSensorsOn(on);
                await saveSuspension("SHOCK_ENABLED", on ? "1" : "0");
              }}
            >
              {() => (
                <SensorTypeRow
                  label={t.linear.shock}
                  value={config ? config.shockType : null}
                  onSave={(type) => save("SHOCK_TYPE", SENSOR_TYPE_VALUE[type])}
                />
              )}
            </ToggleRow>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}

/**
 * The Bluetooth remote (2026-11-26). The switch is REMOTE_ENABLE, the
 * rider's preference; REMOTE_AVAILABLE only says whether it can work now,
 * never that a remote is connected. With a suspension sensor on, the switch
 * is locked off and nothing is written — the logger keeps the preference,
 * and the switch shows it again once both sensors are off. A change counts
 * as saved after SET_OK and a full CONFIG read back to CONFIG_END.
 */
function RemoteRow({
  config,
  live,
  onSave,
}: {
  /** Null until CONFIG is read: the switch is drawn off and disabled. */
  config: BikitDeviceConfig | null;
  live: BikitRemoteLive;
  onSave: (on: boolean) => Promise<void>;
}) {
  const t = useProDict().logger.settings.connectivity;
  const blocked =
    config !== null && (config.forkEnabled === true || config.shockEnabled === true);
  // The notification where one came since the last CONFIG, else CONFIG's.
  const available = live.available ?? config?.remoteAvailable ?? null;
  const remoteConnected = live.connected ?? config?.remoteConnected ?? null;
  const battery =
    live.battery !== undefined ? live.battery : (config?.remoteBattery ?? null);
  const { shown, saving, message, commit } = useSaving(
    blocked ? false : (config?.remoteEnabled ?? null),
    onSave,
  );
  const hint = blocked
    ? t.blocked
    : shown === true && !saving && available === false
      ? t.unavailable
      : t.remoteHint;
  /** The locked switch explains itself when clicked (by request,
   * 2026-11-26): during an acquisition with the suspension sensors on, the
   * remote's button does nothing. */
  const [lockedInfo, setLockedInfo] = useState(false);
  const actions = [
    [t.singleClick, t.startStop],
    [t.doubleClick, t.appBluetooth],
    [t.longPress, t.calibration],
  ];
  return (
    <div>
      <WarningDialog
        open={lockedInfo}
        onClose={() => setLockedInfo(false)}
        title={t.lockedTitle}
        text={t.lockedText}
        confirm={t.lockedOk}
        onConfirm={() => setLockedInfo(false)}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Bluetooth className="size-7 shrink-0" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            <p className="text-base font-semibold">{t.remote}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {!message?.bad && <RowStatus saving={saving} message={message} />}
          <Switch
            label={t.remote}
            checked={shown === true}
            disabled={!blocked && (shown === null || saving)}
            dimmed={blocked}
            onChange={(on) => (blocked ? setLockedInfo(true) : void commit(on))}
          />
        </div>
      </div>
      {message?.bad && <RowStatus saving={false} message={message} />}
      {/* The remote itself (REMOTE_CONNECTED / REMOTE_BATTERY): drawn once
          the logger has said, never guessed from REMOTE_AVAILABLE. The
          firmware sends no name, so the line names the state alone. */}
      {shown === true && !blocked && remoteConnected !== null && (
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
          {/* A green dot, the text in ink (by request, 2026-11-26); grey
              dot and muted text with no remote. */}
          <p
            className={cn(
              "flex items-center gap-2.5 text-base font-medium",
              !remoteConnected && "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                remoteConnected ? "bg-success" : "bg-muted-foreground/40",
              )}
            />
            {remoteConnected ? t.remoteConnected : t.remoteDisconnected}
          </p>
          {remoteConnected && battery !== null && (
            <RemoteBattery percent={battery} label={t.battery} />
          )}
        </div>
      )}
      {shown === true && !blocked && (
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-xs font-medium text-muted-foreground">{t.actions}</p>
          <dl className="mt-3 space-y-3">
            {actions.map(([gesture, action]) => (
              <div key={gesture}>
                <dt className="text-sm text-muted-foreground">{gesture}</dt>
                <dd className="text-base">{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** The remote's charge, in the header battery's drawing at a row's size —
 * filled in the ink colour at every level, never green/amber/red (by
 * request, 2026-11-26). */
function RemoteBattery({ percent, label }: { percent: number; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${label} ${percent}%`}
      className="flex shrink-0 items-center gap-2"
    >
      <svg width="25" height="12" viewBox="0 0 50 24" fill="none" aria-hidden>
        <path
          d="M4.01286 1H41.9871C43.6511 1 45 2.36352 45 4.04551V19.9545C45 21.6365 43.6511 23 41.9871 23H4.01286C2.3489 23 1 21.6365 1 19.9545V4.04551C1 2.36352 2.3489 1 4.01286 1Z"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M46.2147 7.88477H45V16.1173H46.2147C47.717 16.1173 48.9461 14.8069 48.9461 13.2052V10.7969C48.9461 9.19521 47.717 7.88477 46.2147 7.88477Z"
          fill="currentColor"
        />
        <rect
          x="4"
          y="4"
          width={(37 * Math.max(percent, 4)) / 100}
          height="16"
          fill="currentColor"
        />
      </svg>
      <span className="text-base font-semibold tabular-nums">{percent}%</span>
    </span>
  );
}

/**
 * The Logger area's warnings (2026-11-26): a monochrome warning sign above
 * the title, twice the dialog's own padding, and the confirm button white
 * on dark rather than the lime primary — all by request. Without `cancel`
 * it is a notice with a single button.
 */
function WarningDialog({
  open,
  onClose,
  title,
  text,
  cancel,
  confirm,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
  cancel?: string;
  confirm: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="p-8">
        <AlertDialogHeader>
          <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-muted">
            <TriangleAlert className="size-6 text-foreground" aria-hidden />
          </span>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-8 -mb-8 p-8">
          {cancel && <AlertDialogCancel>{cancel}</AlertDialogCancel>}
          <AlertDialogAction type="button" variant="inverted" onClick={onConfirm}>
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SettingsCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  /** Drawn on the title's line, at its right — a switch for the card. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg bg-card p-6 sm:p-7", DARK_CARD_HAIRLINE)}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-5 divide-y divide-border">{children}</div>
    </section>
  );
}

/**
 * A setting's save cycle: the value shown while SET is on the air (so the
 * control moves at once), the logger's answer once it comes, and the
 * logger's refusal — with the control back where it was — if it says no.
 */
function useSaving<T>(value: T | null, onSave: (v: T) => Promise<void>) {
  const t = useProDict().logger.settings;
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(
    null,
  );
  async function commit(next: T) {
    setPending({ value: next });
    setMessage(null);
    try {
      await onSave(next);
      setMessage({ text: t.saved, bad: false });
    } catch (e) {
      setMessage(
        e instanceof SaveCancelled ? null : { text: describe(e), bad: true },
      );
    } finally {
      setPending(null);
    }
  }
  return {
    shown: pending ? pending.value : value,
    saving: pending !== null,
    message,
    commit,
  };
}

function RowStatus({
  saving,
  message,
}: {
  saving: boolean;
  message: { text: string; bad: boolean } | null;
}) {
  if (saving)
    return (
      <Loader2
        className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin"
        aria-hidden
      />
    );
  if (!message) return null;
  return message.bad ? (
    <p className="mt-2 text-xs text-destructive">{message.text}</p>
  ) : (
    <Check className="size-4 shrink-0 text-muted-foreground" aria-label={message.text} />
  );
}

function ToggleRow({
  label,
  icon,
  hint,
  value,
  onSave,
  children,
}: {
  label: string;
  /** Drawn on the title's line, left of it (Auto Stop, 2026-11-09). */
  icon?: ReactNode;
  /** A fixed line, or one that follows the switch (null: not read yet). */
  hint: string | ((on: boolean | null) => string);
  value: boolean | null;
  onSave: (on: boolean) => Promise<void>;
  /** Under the row, while the switch is on — a sensor's type (2026-11-25). */
  children?: (on: boolean) => ReactNode;
}) {
  const { shown, saving, message, commit } = useSaving(value, onSave);
  const hintText = typeof hint === "function" ? hint(shown) : hint;
  const disabled = value === null || saving;
  return (
    <div className="py-8 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        {/* The icon has a column of its own, so the hint lines up with the
            title's text rather than running under the icon. */}
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <p className="text-base font-semibold">{label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{hintText}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {!message?.bad && <RowStatus saving={saving} message={message} />}
          <Switch
            label={label}
            checked={shown === true}
            disabled={disabled}
            onChange={(on) => void commit(on)}
          />
        </div>
      </div>
      {message?.bad && <RowStatus saving={false} message={message} />}
      {children && shown === true && children(true)}
    </div>
  );
}

/**
 * A sensor's type under its switch (by request, 2026-11-25; LINEAR_TYPE /
 * SHOCK_TYPE, firmware V20.7.2): a dropdown of the two, saved with its own
 * SET as every setting. Not drawn where the firmware did not send the key;
 * the type is kept by the logger while its channel is off, and shown again
 * when it comes back on.
 */
function SensorTypeRow({
  label,
  value,
  onSave,
}: {
  label: string;
  value: BikitSensorType | null;
  onSave: (type: BikitSensorType) => Promise<void>;
}) {
  const t = useProDict().logger.settings.linear;
  const { shown, saving, message, commit } = useSaving(value, onSave);
  if (value === null) return null;
  // Cards as Sleep Mode's, not a dropdown (by request, 2026-11-25).
  return (
    <div className="mt-5">
      <ChoiceCards
        label={`${label}: ${t.type}`}
        options={[
          {
            value: "LINEAR" as const,
            label: t.typeLinear,
            hint: t.typeLinearHint,
            icon: <LinearSensorIcon className="size-6" />,
          },
          {
            value: "INFRARED" as const,
            label: t.typeInfrared,
            hint: t.typeInfraredHint,
            icon: <InfraredSensorIcon className="size-6" />,
          },
        ]}
        shown={shown}
        saving={saving}
        disabled={saving}
        unread={false}
        onPick={(v) => void commit(v)}
      />
      {shown === "INFRARED" && (
        <p className="mt-3 text-xs text-muted-foreground">{t.infraredNote}</p>
      )}
      {message?.bad && <RowStatus saving={false} message={message} />}
    </div>
  );
}

/**
 * A switch on a card's title line that sets several keys at once — the
 * linear sensors' "both on / both off" (by request, 2026-11-22). On when
 * every one is on; a click turns them all off from there, and all on from
 * anything else. The keys go one after the other (one command on the air at
 * a time), and a refusal stops there, with the logger's reason under the
 * title — the rows then show what each key really holds.
 */
function CardToggle({
  label,
  values,
  onSave,
}: {
  label: string;
  /** Null while not read, or when the logger did not send one of them. */
  values: (boolean | null)[];
  onSave: (on: boolean) => Promise<void>;
}) {
  const known = values.every((v) => v !== null);
  const allOn = known && values.every((v) => v === true);
  const { shown, saving, message, commit } = useSaving(
    known ? allOn : null,
    onSave,
  );
  return (
    <div className="flex shrink-0 flex-col items-end">
      <div className="flex items-center gap-2">
        {!message?.bad && <RowStatus saving={saving} message={message} />}
        <Switch
          label={label}
          checked={shown === true}
          disabled={!known || saving}
          onChange={(on) => void commit(on)}
        />
      </div>
      {message?.bad && <RowStatus saving={false} message={message} />}
    </div>
  );
}

/** The track-and-thumb of the lab's switches, at a size for a settings row. */
function Switch({
  label,
  checked,
  disabled,
  dimmed = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  /** Drawn as disabled yet still clickable — to explain why it is locked. */
  dimmed?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      aria-disabled={dimmed || undefined}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        checked ? "bg-foreground" : "bg-muted-foreground/30",
        disabled ? "cursor-default opacity-50" : dimmed ? "cursor-pointer opacity-50" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 size-5 rounded-full bg-background shadow-sm transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

/**
 * Three stops on a slide bar — 5, 10, 15 minutes. Sent when the thumb is let
 * go (or a key moves it), not on every step of a drag: each SET is a write
 * to the logger's flash.
 */
function SleepSliderRow({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (minutes: number) => Promise<void>;
}) {
  const t = useProDict().logger.settings.power;
  const { shown, saving, message, commit } = useSaving(value, onSave);
  const [dragging, setDragging] = useState<number | null>(null);
  const current = dragging ?? shown ?? SLEEP_MINUTES[0];
  const index = Math.max(0, SLEEP_MINUTES.indexOf(current as 5 | 10 | 15));
  const disabled = value === null || saving;
  const finish = () => {
    if (dragging !== null && dragging !== shown) void commit(dragging);
    setDragging(null);
  };
  return (
    <div className="py-8 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        {/* Laid out as ToggleRow's icon column (2026-11-09). */}
        <div className="flex min-w-0 items-center gap-3">
          <SleepTimerIcon className="size-7 shrink-0" />
          <div className="min-w-0">
            <p className="text-base font-semibold">{t.sleepAfter}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t.sleepAfterHint}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {!message?.bad && <RowStatus saving={saving} message={message} />}
          <span className="font-display text-lg font-bold tabular-nums">
            {value === null ? "–" : t.minutes(current)}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={SLEEP_MINUTES.length - 1}
        step={1}
        value={index}
        disabled={disabled}
        aria-label={t.sleepAfter}
        aria-valuetext={t.minutes(current)}
        onChange={(event) => setDragging(SLEEP_MINUTES[Number(event.target.value)])}
        onPointerUp={finish}
        onKeyUp={finish}
        onBlur={finish}
        className="mt-4 w-full cursor-pointer accent-foreground disabled:cursor-default"
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
        {SLEEP_MINUTES.map((n) => (
          <span key={n}>{t.minutes(n)}</span>
        ))}
      </div>
      {message?.bad && <RowStatus saving={false} message={message} />}
    </div>
  );
}

/** Two or more cards to pick one from — the Sleep Mode and the Vehicle Type. */
function ChoiceRow<T extends string | boolean>({
  label,
  hint,
  icon,
  hideLabel = false,
  value,
  options,
  onSave,
}: {
  label: string;
  hint?: string;
  /** Drawn left of the label and hint (Sleep Mode, 2026-11-09). */
  icon?: ReactNode;
  /** The card's own title already says it (Vehicle Type). */
  hideLabel?: boolean;
  value: T | null;
  options: { value: T; label: string; hint: string; icon?: ReactNode }[];
  onSave: (v: T) => Promise<void>;
}) {
  const { shown, saving, message, commit } = useSaving(value, onSave);
  const disabled = value === null || saving;
  return (
    <div className="py-8 first:pt-0 last:pb-0">
      {!hideLabel && (
        // ToggleRow's icon column; the cards below keep the full width.
        <div className="mb-3 flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <p className="text-base font-semibold">{label}</p>
            {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
          </div>
        </div>
      )}
      <ChoiceCards
        label={label}
        options={options}
        shown={shown}
        saving={saving}
        disabled={disabled}
        unread={value === null}
        onPick={(v) => void commit(v)}
      />
      {message?.bad && <RowStatus saving={false} message={message} />}
    </div>
  );
}

/** The cards of a choice — Sleep Mode's, the vehicle's, a sensor's type. */
function ChoiceCards<T extends string | boolean>({
  label,
  options,
  shown,
  saving,
  disabled,
  unread,
  onPick,
}: {
  label: string;
  options: { value: T; label: string; hint: string; icon?: ReactNode }[];
  shown: T | null;
  saving: boolean;
  disabled: boolean;
  unread: boolean;
  onPick: (v: T) => void;
}) {
  return (
      <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const active = shown === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => !active && onPick(o.value)}
              className={cn(
                // Top-aligned: a button centres its content, which sank the
                // title of the card with the shorter line.
                "flex flex-col justify-start rounded-[20px] border p-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                active
                  ? "border-foreground bg-muted"
                  : "border-border hover:border-muted-foreground/40",
                disabled ? "cursor-default" : "cursor-pointer",
                unread && "opacity-50",
              )}
            >
              {o.icon && <span className="mb-3 block text-foreground">{o.icon}</span>}
              <span className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold">{o.label}</span>
                {active &&
                  (saving ? (
                    <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  ))}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{o.hint}</span>
            </button>
          );
        })}
      </div>
  );
}
