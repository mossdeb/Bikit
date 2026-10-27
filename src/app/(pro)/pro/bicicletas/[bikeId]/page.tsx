import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { localeFromMetadata } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { BikeIcon } from "@/components/bike-icon";
import { ImuBikeSetups } from "@/components/imu-bike-setups";
import { ProDeleteBikeButton } from "@/components/pro-bike-actions";
import { ImuSessionSetup } from "@/components/imu-session-setup";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { ImuSetupLabels } from "@/components/imu-session-setup";
import type { BikeType } from "@/lib/constants";
import { groupBikeSetups, type BikeSetupRow } from "@/lib/imu/bike-setups";
import { isSetupValues } from "@/lib/imu/setup";
import {
  SETUP_COMPONENT_CATEGORIES,
  setupLabelsOf,
} from "@/lib/imu/setup-labels";

/**
 * Bikit Pro: one bike, and only its setups (2026-09-24) — the distinct
 * sets of values its sessions rode on (groupBikeSetups), each opening
 * the setup form in its read-only dress. The bike's upkeep stays on the
 * app's side; here it is the thing the sensor was on. Same gate as the
 * rest of Pro, and a bike of another account reads as nonexistent.
 */
export default async function ProBikePage({
  params,
}: {
  params: Promise<{ bikeId: string }>;
}) {
  const { bikeId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email)) notFound();
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const t = getProDictionary(locale);

  const { data: bike } = await supabase
    .from("bikes")
    .select("id, name, type, brand, model, year")
    .eq("id", bikeId)
    .eq("user_id", userId)
    .single();
  if (!bike) notFound();

  const [{ data: setupRows }, { data: sessions }, { data: dampers }] =
    await Promise.all([
      supabase
        .from("imu_setups")
        .select("id, values, note, created_at")
        .eq("user_id", userId)
        .eq("bike_id", bikeId),
      supabase
        .from("imu_sessions")
        .select("id, name, setup_id, created_at")
        .eq("user_id", userId)
        .eq("bike_id", bikeId)
        .order("created_at", { ascending: false }),
      // What the bike calls its dampers and tyres, for the form's
      // headings — the session page's own lookup.
      supabase
        .from("components")
        .select("category, name, brand, model")
        .eq("bike_id", bikeId)
        .eq("user_id", userId)
        .is("retired_at", null)
        .in("category", SETUP_COMPONENT_CATEGORIES),
    ]);
  const rows: BikeSetupRow[] = (setupRows ?? [])
    .filter((r) => isSetupValues(r.values))
    .map((r) => ({
      id: r.id,
      values: r.values as never,
      note: r.note,
      createdAt: r.created_at,
    }));
  // What a new setup starts from: the bike's latest, the one imports
  // inherit — a new setup is usually that one with a knob turned.
  const latestRow = rows.reduce<BikeSetupRow | null>(
    (best, r) => (!best || r.createdAt! > best.createdAt! ? r : best),
    null,
  );
  const setups = groupBikeSetups(
    rows,
    (sessions ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      setupId: s.setup_id,
      createdAt: s.created_at,
    })),
  );
  const labels: ImuSetupLabels = setupLabelsOf(dampers);
  const sessionCount = sessions?.length ?? 0;

  return (
    <div className="pt-4 sm:pt-8">
      <div className={cn("mb-6 rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        {/* The delete button in the card's top-right corner (by request,
            2026-10-27), level with the bike's mark. */}
        <div className="relative px-5 py-5 sm:px-6 sm:py-6">
          <div className="absolute top-5 right-5 flex gap-2 sm:top-6 sm:right-6">
            {/* A setup for the next ride (2026-10-27): the setup form,
                saved to the bike rather than a session. */}
            <ImuSessionSetup
              sessionId=""
              bikeId={bike.id}
              values={latestRow?.values ?? {}}
              note={null}
              labels={labels}
              bikeType={(bike.type as BikeType | undefined) ?? null}
              title={t.report.bikes.newSetupTitle}
              triggerLabel={t.report.bikes.newSetup}
              triggerIcon={<Plus className="size-4" aria-hidden />}
              triggerClassName={buttonVariants({
                variant: "inverted",
                size: "sm",
                className: "px-4",
              })}
            />
            <ProDeleteBikeButton
              bikeId={bike.id}
              bikeName={bike.name}
              sessionCount={t.common.session(sessionCount)}
            />
          </div>
          <BikeIcon type={bike.type} plain />
          <h1 className="mt-2 font-display text-2xl font-bold">{bike.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[bike.type, bike.brand, bike.model, bike.year]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t.report.bikes.setupsInSessions(
              t.common.setup(setups.length),
              t.common.session(sessionCount),
            )}
            {" · "}
            <Link
              href={`/bikes/${bike.id}`}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {t.report.bikes.bikeInApp}
            </Link>
          </p>
        </div>
      </div>

      {setups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t.report.bikes.noSetups}
        </p>
      ) : (
        <ImuBikeSetups
          bikeId={bike.id}
          setups={setups}
          labels={labels}
          bikeType={(bike.type as BikeType | null) ?? null}
        />
      )}
    </div>
  );
}
