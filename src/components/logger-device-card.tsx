"use client";

import { Bluetooth, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BikitDeviceInfo } from "@/lib/bikit-ble/protocol";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proNumber, type ProDictionary } from "@/lib/i18n/pro";
import type { Locale } from "@/lib/i18n";

/**
 * The logger as a card (reference layout, 2026-11-06): who it is on the
 * left, its battery and the link's button on the right, and what it says
 * about its subsystems in a row of cells below. One card for the two places
 * that connect to the logger — the import dialog's device tab and the
 * Logger area's header (2026-11-08) — so the two cannot drift apart.
 */

type DeviceInfoWords = ProDictionary["importing"]["device"]["info"];

/** The quiet grey pill of the reference layout: Disconnect, Transfer. */
export const MUTED_PILL = "bg-muted text-base text-foreground hover:bg-border";

/** One cell of the device's report: a label, a word, and a line under it. */
interface StatusCell {
  label: string;
  value: string;
  detail?: string;
  bad?: boolean;
  /** A status dot before the value (2026-11-09): green when fine, amber
   * while the GPS is not ready yet, red when something is wrong. */
  dot?: "ok" | "wait" | "bad";
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
  const value = gps.label
    ? gps.label
    : gps.state === "FIX"
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
    // Ready by GPS_STATUS where the logger said; by INFO_GPS's fix where
    // that is all there is.
    dot: (gps.ready ?? gps.state === "FIX") ? "ok" : "wait",
  };
}

/** The device's report as cells, each only when its firmware sent it — a
 * line left out is not shown as OK. */
function statusCells(
  info: BikitDeviceInfo,
  t: DeviceInfoWords,
  locale: Locale,
): StatusCell[] {
  const cells: StatusCell[] = [];
  if (info.gps) cells.push(gpsCell(info.gps, t, locale));
  if (info.sd)
    cells.push({
      label: t.sdCard,
      value: info.sd === "OK" ? t.ok : info.sd,
      bad: info.sd !== "OK",
      dot: info.sd === "OK" ? "ok" : "bad",
    });
  if (info.imu)
    cells.push({
      label: "IMU",
      value: info.imu === "OK" ? t.ok : info.imu,
      bad: info.imu !== "OK",
      dot: info.imu === "OK" ? "ok" : "bad",
    });
  // The calibration the logger will record with (by request, 2026-10-27):
  // its state, and its steps once the firmware sends them.
  if (info.calibration)
    cells.push({
      label: t.calibration,
      value: info.calibration.valid ? t.ok : t.calInvalid,
      detail:
        info.calibration.valid && info.calibration.steps !== null
          ? t.calSteps(info.calibration.steps)
          : undefined,
      bad: !info.calibration.valid,
      dot: info.calibration.valid ? "ok" : "bad",
    });
  return cells;
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
    // The millivolts on a line of their own, centred under the battery and
    // its percentage (2026-11-06).
    <div
      className="flex flex-col items-center gap-1.5"
      role="img"
      aria-label={`${label} ${p}% · ${proNumber(millivolts, locale)} mV`}
    >
      <div className="flex items-center gap-3.5">
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
      </div>
      <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
        {proNumber(millivolts, locale)} mV
      </span>
    </div>
  );
}

export function LoggerDeviceCard({
  connected,
  connecting,
  supported,
  info,
  deviceName,
  hint,
  onConnect,
  onDisconnect,
  disconnectDisabled = false,
  className,
}: {
  /** Linked (past the picker), whether or not INFO has come yet. */
  connected: boolean;
  connecting: boolean;
  /** Web Bluetooth is there to use. */
  supported: boolean;
  info: BikitDeviceInfo | null;
  deviceName: string | null;
  /** The line under the title while not connected. */
  hint: string;
  onConnect: () => void;
  onDisconnect: () => void;
  disconnectDisabled?: boolean;
  className?: string;
}) {
  const t = useProDict().importing.device;
  const locale = useProLocale();
  const battery = connected && info?.battery ? info.battery : null;
  const cells = connected && info ? statusCells(info, t.info, locale) : [];

  return (
    <div className={cn("space-y-9", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-[24px] leading-tight font-semibold">
            {t.deviceTitle}
          </h3>
          {connected ? (
            <dl className="mt-1 text-sm leading-snug">
              {/* The label keeps its line; on a phone the value drops
                  under it rather than breaking the label in two. */}
              <div className="flex flex-wrap gap-x-1.5">
                <dt className="whitespace-nowrap">{t.serialNumber}:</dt>
                <dd className="max-w-full min-w-0 truncate tabular-nums">
                  {info?.uid
                    ? // The serial as the device's own record writes it
                      // (DEV1, 2026-11-06): "BIKIT-" and the 16 hex digits.
                      /^BIKIT-/i.test(info.uid)
                      ? info.uid
                      : `BIKIT-${info.uid}`
                    : deviceName || "–"}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-1.5">
                <dt className="whitespace-nowrap">{t.firmwareVersion}:</dt>
                <dd className="max-w-full min-w-0 truncate tabular-nums">
                  {info?.firmware.split("-")[0] || "–"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              {!supported ? t.noWebBluetooth : connecting ? t.connecting : hint}
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
              onClick={onDisconnect}
              disabled={disconnectDisabled}
            >
              {t.disconnect}
            </Button>
          ) : (
            <Button
              variant="inverted"
              size="sm"
              className="px-5 text-base"
              onClick={onConnect}
              disabled={!supported || connecting}
            >
              {connecting ? (
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
                <span className="inline-flex items-center gap-1.5">
                  {cell.dot && (
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        cell.dot === "ok"
                          ? "bg-[#43F3AF]"
                          : cell.dot === "wait"
                            ? "bg-[#FFC711]"
                            : "bg-[#E0442F]",
                      )}
                    />
                  )}
                  {cell.value}
                </span>
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
  );
}
