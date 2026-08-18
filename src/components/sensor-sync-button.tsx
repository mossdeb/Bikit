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
 * The picker is filtered to the paired sensor's NAME — on 2026-08-18 an
 * unfiltered picker connected to a neighbouring sensor and its reading
 * nearly rewrote a day's conclusions. `optionalServices` must carry the CSC
 * service: a name filter grants access to the name alone, and the GATT
 * lookup would be refused without it.
 *
 * Lab test — PT strings by the probe's precedent.
 */
export function SensorSyncButton({ bikeId, sensorName }: { bikeId: string; sensorName: string }) {
  const [busy, setBusy] = useState(false);
  const toastManager = useToastManager();

  async function sync() {
    setBusy(true);
    toastManager.add({ id: TOAST_ID, description: "A ler o sensor…", type: "loading", timeout: 0 });
    try {
      const reading = await readCscWheelCount([{ name: sensorName }], {
        optionalServices: [CSC_SERVICE],
      });
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
        toastManager.add({ id: TOAST_ID, description: result.message, type: "error" });
      }
    } catch (e) {
      toastManager.add({
        id: TOAST_ID,
        description: e instanceof Error ? e.message : String(e),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
