import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
import { formatDistance, formatHours } from "@/lib/format";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { BikeIcon } from "@/components/bike-icon";
import { StravaBadgeIcon } from "@/components/strava-icon";

/**
 * Bikit Pro: the account's bikes (2026-09-24), the app's own list without
 * its verdicts — no health badge, no Ride Load: here a bike is the thing
 * the sensor rode on, and its page under Pro is its setups. Same cards,
 * same order (most recently ridden first), same totals. Adding a bike
 * stays the app's business, so there is no button for it here.
 */
export default async function ProBikesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email)) notFound();
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  // The app's dictionary for the words the app's own bike cards use, and
  // Pro's for what is Pro's: the title, the empty state, the sessions.
  const dict = getDictionary(locale);
  const t = getProDictionary(locale);
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as
    string | undefined) ?? "km") as "km" | "mi";

  const [{ data: bikes }, { data: sessions }] = await Promise.all([
    supabase
      .from("bikes")
      .select(
        "id, name, type, brand, model, year, total_km, total_hours, strava_gear_id",
      )
      .eq("user_id", userId)
      .order("usage_updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase.from("imu_sessions").select("bike_id").eq("user_id", userId),
  ]);
  const sessionCount = new Map<string, number>();
  for (const s of sessions ?? [])
    if (s.bike_id)
      sessionCount.set(s.bike_id, (sessionCount.get(s.bike_id) ?? 0) + 1);

  return (
    <div className="pt-4 sm:pt-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">
          {t.report.bikes.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dict.bikes.fleetCount(bikes?.length ?? 0)}
        </p>
      </div>

      {!bikes || bikes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.report.bikes.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bikes.map((bike) => {
            const count = sessionCount.get(bike.id) ?? 0;
            return (
              <Link
                key={bike.id}
                href={`/pro/bicicletas/${bike.id}`}
                className={`flex h-full flex-col rounded-lg bg-card p-5 ${CLICKABLE_CARD_HOVER} ${DARK_CARD_HAIRLINE}`}
              >
                {/* The app's card without its badge (by request): the
                    mark alone at the head. */}
                <div className="mb-2 flex items-start justify-between gap-3">
                  <BikeIcon type={bike.type} plain />
                </div>
                <h2 className="font-display text-[20px] font-bold">
                  {bike.name}
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  {bike.strava_gear_id && (
                    <StravaBadgeIcon className="size-[12px] shrink-0" />
                  )}
                  {[bike.type, bike.brand, bike.model, bike.year]
                    .filter(Boolean)
                    .join(" · ") || dict.bikes.noDetailsYet}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums">
                    <span className="inline-flex items-baseline whitespace-pre">
                      {bike.total_km != null &&
                        formatDistance(bike.total_km, distanceUnit, locale)}
                      {bike.total_km != null && bike.total_hours != null && (
                        <span>{" · "}</span>
                      )}
                      {bike.total_hours != null &&
                        formatHours(bike.total_hours, locale)}
                    </span>
                    {/* The sensor's own reading of the bike, after the
                        app's totals: how many sessions rode on it. */}
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                    <span>{t.common.session(count)}</span>
                  </p>
                  <span className="flex h-11 shrink-0 items-center justify-center rounded-full bg-muted px-4 text-sm font-semibold">
                    {dict.bikes.viewBike}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
