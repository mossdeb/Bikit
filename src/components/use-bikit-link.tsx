"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProDict } from "@/components/pro-locale";
import {
  forgetDevicePin,
  loadDevicePin,
  saveDevicePin,
} from "@/lib/bikit-ble/pin-store";
import {
  AUTH_REQUIRED,
  BikitDevice,
  BikitDeviceError,
} from "@/lib/bikit-ble/protocol";
import {
  WebBluetoothTransport,
  hasWebBluetooth,
} from "@/lib/bikit-ble/web-bluetooth-transport";
import { SimulatedLoggerTransport } from "@/lib/bikit-ble/simulated-transport";

/**
 * A link to the logger, from the picker to past the PIN (2026-11-22): the
 * Logger area's and the setup's live SAG. The import dialog keeps its own
 * for now — its phases carry the card's listing.
 *
 * The lock is the import dialog's, per connection: a PIN remembered for the
 * device first (refused, it is forgotten and asked for again); with none,
 * the caller's first command is tried, and only the device's AUTH_REQUIRED
 * brings up the form. Nothing assumes the device remembers us — it forgets
 * at disconnect.
 *
 * The link lives and dies with the component: unmounting lets the device go.
 */
export type BikitLinkPhase =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "auth"; hadSaved: boolean }
  | { kind: "authenticating" }
  | { kind: "connected" };

export const describeError = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export function useBikitLink({
  simulate,
  onAuthenticated,
  onLost,
}: {
  /** Talk to the logger in software (`?simulate=1`). */
  simulate: boolean;
  /** Past the lock: the caller's first commands. Runs with the phase
   * already "connected"; a throw lands in `error`, with the link kept if it
   * is still up. An AUTH_REQUIRED from it brings up the PIN form. */
  onAuthenticated: (device: BikitDevice) => Promise<void>;
  /** The link dropped or was let go. */
  onLost?: () => void;
}) {
  const td = useProDict().importing.device;
  const bluetooth = useSyncExternalStore(
    () => () => {},
    () => hasWebBluetooth(),
    () => true,
  );
  const [phase, setPhase] = useState<BikitLinkPhase>({ kind: "idle" });
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [rememberPin, setRememberPin] = useState(true);
  const deviceRef = useRef<BikitDevice | null>(null);
  // The latest callbacks, so a link made earlier calls today's.
  const onAuthenticatedRef = useRef(onAuthenticated);
  const onLostRef = useRef(onLost);
  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
    onLostRef.current = onLost;
  });

  useEffect(() => () => deviceRef.current?.disconnect(), []);
  /** Stable across renders, so effects can depend on it. */
  const device = useCallback(() => deviceRef.current, []);

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
        setPhase({ kind: "idle" });
        setNotice(td.deviceDisconnected);
        onLostRef.current?.();
      });
      await device.ping();
      await authenticate(device);
    } catch (e) {
      fail(e);
    }
  }

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
    }
    await afterAuth(device);
  }

  async function afterAuth(device: BikitDevice) {
    setPhase({ kind: "connected" });
    try {
      await onAuthenticatedRef.current(device);
    } catch (e) {
      if (e instanceof BikitDeviceError && e.raw === AUTH_REQUIRED) {
        setPhase({ kind: "auth", hadSaved: false });
        return;
      }
      throw e;
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
      fail(e);
    }
  }

  function fail(e: unknown) {
    // Closing the picker is a decision, not a failure.
    if (!/cancel/i.test(describeError(e))) setError(describeError(e));
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
    setNotice(null);
    setPhase({ kind: "idle" });
    if (device) onLostRef.current?.();
  }

  return {
    supported: simulate || bluetooth,
    phase,
    deviceName,
    error,
    setError,
    notice,
    pin,
    setPin,
    rememberPin,
    setRememberPin,
    /** The linked device, or null. */
    device,
    connect,
    submitPin,
    disconnect,
  };
}

export type BikitLink = ReturnType<typeof useBikitLink>;

/** The PIN form the device's lock asks for — the Logger area's, shared. */
export function BikitPinForm({
  link,
  idPrefix,
  className,
}: {
  link: BikitLink;
  /** For the inputs' ids, unique on the page. */
  idPrefix: string;
  className?: string;
}) {
  const td = useProDict().importing.device;
  // Not a <form>: it may sit inside one (the setup's), and forms do not
  // nest. Enter in the field submits it, as a form would.
  return (
    <div className={className ?? "max-w-sm space-y-3"}>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-pin`}>{td.pinLabel}</Label>
        <Input
          id={`${idPrefix}-pin`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="••••••"
          value={link.pin}
          onChange={(event) => link.setPin(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void link.submitPin();
          }}
        />
      </div>
      <label
        htmlFor={`${idPrefix}-remember`}
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Checkbox
          id={`${idPrefix}-remember`}
          checked={link.rememberPin}
          onCheckedChange={(checked) => link.setRememberPin(checked === true)}
        />
        {td.rememberPin}
      </label>
      <Button
        type="button"
        variant="inverted"
        className="w-full"
        disabled={!link.pin.trim()}
        onClick={() => void link.submitPin()}
      >
        {td.authenticate}
      </Button>
    </div>
  );
}
