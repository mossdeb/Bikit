"use client";

import { useState } from "react";
import { Bluetooth } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastManager } from "@/components/ui/toast";
import { CSC_SERVICE, readCscWheelCount } from "@/lib/csc";
import { syncBikeSensor } from "@/lib/actions/sensor";

const TOAST_ID = "sensor-sync";

/**
 * The sensor bike's counterpart to the Strava reload button, in the same
 * slot of the details grid. Reads the paired sensor over Web Bluetooth and
 * hands the count to the server, which owns the arithmetic.
 *
 * The picker asks by SERVICE, the same request pairing makes, because that
 * is the one shape every engine this runs on has actually answered — the
 * first field test (iPhone, Bluefy, 2026-08-18) never showed a picker for a
 * name filter with `optionalServices`; Bluefy's partial Web Bluetooth
 * rejected it outright. The wrong-device guard — a neighbouring sensor's
 * reading nearly rewrote a day's conclusions that same morning — moved from
 * the filter to a name check after the choice, here and again on the
 * server.
 *
 * Lab test — PT strings by the probe's precedent.
 */
export function SensorSyncButton({ bikeId, sensorName }: { bikeId: string; sensorName: string }) {
  const [busy, setBusy] = useState(false);
  // The probe's lesson, relearned on this button's first field test: a toast
  // dismisses itself, and with it went the only copy of what went wrong.
  // Failures stay on screen, with the browser's own error name, until the
  // next attempt starts.
  const [lastError, setLastError] = useState<string | null>(null);
  const toastManager = useToastManager();

  async function sync() {
    setBusy(true);
    setLastError(null);
    toastManager.add({ id: TOAST_ID, description: "A ler o sensor…", type: "loading", timeout: 0 });
    try {
      const reading = await readCscWheelCount([{ services: [CSC_SERVICE] }]);
      // Checked before the count goes anywhere; the server refuses again on
      // its side, but the person in the garage deserves the answer here.
      if (reading.deviceName !== sensorName) {
        throw new Error(
          `Sensor errado — ligaste ao ${reading.deviceName}; esta bicicleta usa o ${sensorName}.`
        );
      }
      const result = await syncBikeSensor(bikeId, {
        name: reading.deviceName,
        wheelRevs: reading.wheelRevs,
      });

      if (result.status === "synced") {
        toastManager.add({
          id: TOAST_ID,
          description:
            result.revs === 0
              ? "Sem quilómetros novos desde o último sync."
              : `+${result.km.toFixed(2)} km (${result.revs} revoluções).`,
          type: "success",
        });
      } else if (result.status === "reset") {
        toastManager.add({
          id: TOAST_ID,
          description: "O sensor reiniciou (pilha trocada?). Contador guardado; nada foi somado.",
          type: "error",
        });
      } else if (result.status === "wrong-sensor") {
        toastManager.add({
          id: TOAST_ID,
          description: `Sensor errado — esta bicicleta está associada ao ${result.expected}.`,
          type: "error",
        });
      } else {
        setLastError(result.message);
        toastManager.add({ id: TOAST_ID, description: result.message, type: "error" });
      }
    } catch (e) {
      // The DOMException's name travels too — "NotFoundError: …" says which
      // layer refused, where the bare message often says nothing.
      const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setLastError(message);
      toastManager.add({ id: TOAST_ID, description: message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={sync}
        // Same footprint as the Strava reload button beside whose slot this
        // lives — a third of the details grid on a phone.
        className="h-7 gap-1 rounded-full bg-transparent px-2 text-xs sm:px-2.5 sm:text-sm [&_svg:not([class*='size-'])]:size-3"
      >
        <Bluetooth className={busy ? "size-3 motion-safe:animate-pulse" : "size-3"} />
        Sincronizar
      </Button>
      {lastError && (
        <p className="mt-1.5 max-w-56 rounded-sm bg-destructive/10 p-2 text-xs break-words">{lastError}</p>
      )}
    </>
  );
}
