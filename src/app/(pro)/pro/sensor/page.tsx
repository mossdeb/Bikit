import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { localeFromMetadata } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
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
 * sensors is worth designing. It was left untranslated for that reason until
 * the Pro i18n pass (2026-09-24) put every string under /pro in the Pro
 * dictionary; its keys sit under `importing.probe`, which says what it is.
 */
export default async function SensorLabPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  if (!hasLabAccess(email)) notFound();
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const t = getProDictionary(locale).importing.probe;

  return (
    <div className="pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold">{t.pageTitle}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {t.pageDescription}
      </p>
      <CscProbe />
    </div>
  );
}
