import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { CscProbe } from "@/components/csc-probe";

/**
 * Lab: read a BLE Cycling Speed and Cadence sensor and show the raw numbers.
 *
 * Not linked from anywhere. `notFound` and not a redirect or an "unavailable"
 * message, the same call the Ride Load report makes: to an account that may
 * not see this, the route does not exist, and saying "you may not see this"
 * tells them there is something to see.
 *
 * It answers one question — whether the sensor's cumulative counter survives
 * its 60-second sleep — and until that is answered nothing else about reading
 * sensors is worth designing. Deliberately untranslated: it is a probe, and a
 * dictionary key is a promise that this is a feature.
 */
export default async function SensorLabPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  if (!hasLabAccess(email)) notFound();

  return (
    <div className="pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold">Lab · Sensor CSC</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Lê e mostra. Não escreve nada — nenhuma bicicleta é tocada.
      </p>
      <CscProbe />
    </div>
  );
}
