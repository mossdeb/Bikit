"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoggerDeviceCard } from "@/components/logger-device-card";
import { BIKE_ICON_FALLBACK } from "@/components/bike-type-icon";
import {
  AutoStopIcon,
  GpsFixIcon,
  MotionSleepIcon,
  MotorbikeIcon,
  SleepModeIcon,
  SleepTimerIcon,
  TimedSleepIcon,
} from "@/components/menu-icons";
import { useProDict } from "@/components/pro-locale";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { cn } from "@/lib/utils";
import {
  forgetDevicePin,
  loadDevicePin,
  saveDevicePin,
} from "@/lib/bikit-ble/pin-store";
import {
  AUTH_REQUIRED,
  BikitDevice,
  BikitDeviceError,
  SLEEP_MINUTES,
  type BikitConfigKey,
  type BikitDeviceConfig,
  type BikitDeviceInfo,
  type BikitGpsStatus,
  type BikitVehicleType,
} from "@/lib/bikit-ble/protocol";
import {
  WebBluetoothTransport,
  hasWebBluetooth,
} from "@/lib/bikit-ble/web-bluetooth-transport";
import { SimulatedLoggerTransport } from "@/lib/bikit-ble/simulated-transport";

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

type Phase =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "auth"; hadSaved: boolean }
  | { kind: "authenticating" }
  | { kind: "connected" };

type ConfigState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string }
  | { kind: "ready"; config: BikitDeviceConfig };

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LoggerArea({ simulate }: { simulate: boolean }) {
  const dict = useProDict();
  const t = dict.logger;
  const td = dict.importing.device;
  const bluetooth = useSyncExternalStore(
    () => () => {},
    () => hasWebBluetooth(),
    () => true,
  );
  const supported = simulate || bluetooth;

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [info, setInfo] = useState<BikitDeviceInfo | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [rememberPin, setRememberPin] = useState(true);
  const deviceRef = useRef<BikitDevice | null>(null);
  /** One command on the air at a time: Web Bluetooth refuses a write while
   * another is in flight, and the GPS detail polls beside the settings'
   * SETs (2026-11-09). Each command waits for the one before it. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = queueRef.current.then(fn, fn);
    queueRef.current = next.catch(() => undefined);
    return next;
  }

  useEffect(() => () => deviceRef.current?.disconnect(), []);

  async function connect() {
    setError(null);
    setNotice(null);
    setPhase({ kind: "connecting" });
    try {
      deviceRef.current?.disconnect();
      const device = await BikitDevice.connect(
        simulate ? new SimulatedLoggerTransport() : new WebBluetoothTransport(),
      );
      deviceRef.current = device;
      setDeviceName(device.name);
      device.onDisconnect(() => {
        if (deviceRef.current !== device) return;
        deviceRef.current = null;
        setInfo(null);
        setPhase({ kind: "idle" });
        setNotice(td.deviceDisconnected);
      });
      await device.ping();
      await authenticate(device);
    } catch (e) {
      failConnect(e);
    }
  }

  /** The same lock as the import dialog's: a remembered PIN first, then
   * INFO, and the form only when the device asks for it. */
  async function authenticate(device: BikitDevice) {
    setPhase({ kind: "authenticating" });
    const saved = await loadDevicePin(device.name);
    if (saved) {
      try {
        await device.auth(saved);
      } catch (e) {
        if (e instanceof BikitDeviceError && e.raw === "AUTH_FAIL") {
          void forgetDevicePin(device.name);
          setNotice(td.savedPinRefused);
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

  async function afterAuth(device: BikitDevice) {
    setInfo(await device.info());
    setPhase({ kind: "connected" });
    setConfig({ kind: "loading" });
    try {
      const read = await device.readConfig();
      setConfig(read ? { kind: "ready", config: read } : { kind: "unsupported" });
    } catch (e) {
      setConfig({ kind: "error", message: describe(e) });
    }
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
        setError(td.wrongPin);
        setPhase({ kind: "auth", hadSaved: false });
        return;
      }
      failConnect(e);
    }
  }

  function failConnect(e: unknown) {
    // Closing the picker is a decision, not a failure.
    if (!/cancel/i.test(describe(e))) setError(describe(e));
    if (deviceRef.current?.isConnected) {
      setPhase({ kind: "connected" });
    } else {
      deviceRef.current?.disconnect();
      deviceRef.current = null;
      setPhase({ kind: "idle" });
    }
  }

  function disconnect() {
    const device = deviceRef.current;
    deviceRef.current = null;
    device?.disconnect();
    setInfo(null);
    setNotice(null);
    setPhase({ kind: "idle" });
  }

  /** One SET; the screen moves to what the logger says it stored. */
  async function save(key: BikitConfigKey, value: string) {
    const device = deviceRef.current;
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
      const device = deviceRef.current;
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
  }, [isConnected]);
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
              <form
                className="max-w-sm space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitPin();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="logger-pin">{td.pinLabel}</Label>
                  <Input
                    id="logger-pin"
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
                  htmlFor="logger-remember"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Checkbox
                    id="logger-remember"
                    checked={rememberPin}
                    onCheckedChange={(checked) => setRememberPin(checked === true)}
                  />
                  {td.rememberPin}
                </label>
                <Button
                  type="submit"
                  variant="inverted"
                  className="w-full"
                  disabled={!pin.trim()}
                >
                  {td.authenticate}
                </Button>
              </form>
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
                    ready ? "bg-[#43F3AF]" : "bg-[#FFC711]",
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
}: {
  connected: boolean;
  state: ConfigState;
  save: SaveFn;
}) {
  const t = useProDict().logger.settings;
  const config = connected && state.kind === "ready" ? state.config : null;
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
      <div className="grid gap-4 lg:grid-cols-2">
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
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg bg-card p-6 sm:p-7", DARK_CARD_HAIRLINE)}>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
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
      setMessage({ text: describe(e), bad: true });
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
}: {
  label: string;
  /** Drawn on the title's line, left of it (Auto Stop, 2026-11-09). */
  icon?: ReactNode;
  /** A fixed line, or one that follows the switch (null: not read yet). */
  hint: string | ((on: boolean | null) => string);
  value: boolean | null;
  onSave: (on: boolean) => Promise<void>;
}) {
  const { shown, saving, message, commit } = useSaving(value, onSave);
  const hintText = typeof hint === "function" ? hint(shown) : hint;
  const disabled = value === null || saving;
  return (
    <div className="py-4 first:pt-0 last:pb-0">
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
    </div>
  );
}

/** The track-and-thumb of the lab's switches, at a size for a settings row. */
function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        checked ? "bg-foreground" : "bg-muted-foreground/30",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
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
    <div className="py-4 first:pt-0 last:pb-0">
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
    <div className="py-4 first:pt-0 last:pb-0">
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
              onClick={() => !active && void commit(o.value)}
              className={cn(
                // Top-aligned: a button centres its content, which sank the
                // title of the card with the shorter line.
                "flex flex-col justify-start rounded-[20px] border p-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                active
                  ? "border-foreground bg-muted"
                  : "border-border hover:border-muted-foreground/40",
                disabled ? "cursor-default" : "cursor-pointer",
                value === null && "opacity-50",
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
      {message?.bad && <RowStatus saving={false} message={message} />}
    </div>
  );
}
