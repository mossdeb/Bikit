"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Strava or sensor, never both — the create/edit forms' one-method rule made
 * visible. Lab-gated by the caller (the server page checks the email), so
 * everyone else keeps today's Strava section untouched; PT-only strings by
 * the probe's precedent.
 *
 * Only the active method's fields render, so the inactive one submits
 * nothing; the server decides what to clear from `sync_method` alone, which
 * is what makes switching away from a method also unlink it. The sections
 * arrive as nodes because the Strava one is server-rendered (selects filled
 * from the Strava API) and this component only chooses between them.
 */
export function SyncMethodChooser({
  initial,
  strava,
  sensor,
}: {
  initial: "strava" | "sensor";
  strava: ReactNode;
  sensor: ReactNode;
}) {
  const [method, setMethod] = useState(initial);

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex gap-2">
        {(
          [
            ["strava", "Strava"],
            ["sensor", "Sensor BLE"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={method === value}
            onClick={() => setMethod(value)}
            className={cn(
              "h-9 rounded-full border px-4 text-sm font-semibold transition-colors",
              method === value
                ? "border-transparent bg-foreground text-background"
                : "border-border bg-transparent text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="sync_method" value={method} />
      {method === "strava" ? strava : sensor}
    </div>
  );
}
