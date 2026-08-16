import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { selectActiveInterval, type NamedIntervalStatusInput } from "@/lib/maintenance/calculation";
import { bikeHealthLevel, healthPercent } from "@/lib/maintenance/health";
import { Button } from "@/components/ui/button";
import { BikeIcon } from "@/components/bike-icon";
import { HealthBadge } from "@/components/health-badge";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { formatDistance, formatHours } from "@/lib/format";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { StravaBadgeIcon } from "@/components/strava-icon";
import { NewToBikitCard } from "@/components/new-to-bikit-card";
import { UpgradeToPersonalCard } from "@/components/upgrade-to-personal-card";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_LIMITS, PLAN_FEATURES } from "@/lib/plans";
import { loadScoredRidesForBikes } from "@/lib/ride-stress-data";
import { rideIntensity } from "@/lib/ride-stress";
import { RideLoadGlyph } from "@/components/ride-load-icons";
import { AnimatedNumber } from "@/components/animated-number";

export default async function BikesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const dict = getDictionary(locale);
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const userId = userData?.claims?.sub as string | undefined;

  const [subscription, { data: bikes }, { data: intervalRows }] = await Promise.all([
    userId
      ? getUserSubscription(userId)
      : Promise.resolve({
          plan: "free" as const,
          status: "active" as const,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          hasBillingAccount: false,
        }),
    // Most recently ridden first, same as the dashboard carousel:
    // usage_updated_at only moves when a bike's km/hours change (manual edit
    // or Strava sync), so a bike that was merely renamed keeps its place.
    // Bikes that have never logged any usage fall to the end, oldest first.
    supabase
      .from("bikes")
      .select("id, name, type, brand, model, year, total_km, total_hours, strava_gear_id")
      .order("usage_updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("component_interval_status")
      .select(
        "id, component_id, bike_id, name, interval_type, interval_value, install_date, component_created_at, last_intervention_date, bike_km_at_install, bike_hours_at_install, last_service_km, last_service_hours"
      ),
  ]);

  // Both halves of the same gate the bike page uses: the bike has to be linked
  // to Strava for rides to exist at all, and the plan has to be allowed to see
  // the reading. Unlike the bike page this cannot start until `bikes` has
  // landed — it needs their ids — so it is a second round trip rather than one
  // more promise in the batch above. One query for every card, though, not one
  // per card: the same shape the health rows above already use.
  const rideLoadBikes =
    PLAN_FEATURES[subscription.plan].rideLoad
      ? (bikes ?? []).filter((bike) => bike.strava_gear_id).map((bike) => ({ id: bike.id, type: bike.type }))
      : [];
  const ridesByBike = await loadScoredRidesForBikes(supabase, rideLoadBikes);

  const rideStressNow = new Date();
  const rideLoadById = new Map(
    [...ridesByBike].map(([bikeId, rides]) => [bikeId, rideIntensity(rides, rideStressNow)])
  );

  const bikeHealthById = new Map(
    (bikes ?? []).map((bike) => {
      const intervalsByComponent = new Map<string, NamedIntervalStatusInput[]>();
      for (const row of intervalRows ?? []) {
        if (row.bike_id !== bike.id || !row.component_id || !row.id || !row.name) continue;
        const list = intervalsByComponent.get(row.component_id) ?? [];
        list.push({
          id: row.id,
          name: row.name,
          intervalType: row.interval_type as "km" | "hours" | "months" | null,
          intervalValue: row.interval_value,
          installDate: row.install_date,
          componentCreatedAt: row.component_created_at,
          lastInterventionDate: row.last_intervention_date,
          currentKm: bike.total_km,
          currentHours: bike.total_hours,
          bikeKmAtInstall: row.bike_km_at_install,
          bikeHoursAtInstall: row.bike_hours_at_install,
          bikeKmAtLastService: row.last_service_km,
          bikeHoursAtLastService: row.last_service_hours,
        });
        intervalsByComponent.set(row.component_id, list);
      }
      const percents = [...intervalsByComponent.values()].map(
        (intervals) => healthPercent(selectActiveInterval(intervals)?.status.fractionUsed ?? null)
      );
      return [bike.id, bikeHealthLevel(percents)];
    })
  );

  const maxBikes = PLAN_LIMITS[subscription.plan].maxBikes;
  const atBikeLimit = maxBikes !== null && (bikes?.length ?? 0) >= maxBikes;

  // Same button in two places, like "Add component" on the bike detail page:
  // beside the heading on desktop, and at the foot of the stack on mobile,
  // where reaching the top of the screen costs a thumb stretch.
  const addBikeButton = atBikeLimit ? (
    <Button type="button" disabled variant="inverted" size="lg" className="disabled:opacity-10">
      <Plus className="size-4" />
      {dict.bikes.addBike}
    </Button>
  ) : (
    <Button render={<Link href="/bikes/new" />} nativeButton={false} variant="inverted" size="lg">
      <Plus className="size-4" />
      {dict.bikes.addBike}
    </Button>
  );

  return (
    <div className="pt-4 sm:pt-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">{dict.bikes.breadcrumb}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dict.bikes.fleetCount(bikes?.length ?? 0)}</p>
        </div>
        <div className="hidden sm:block">{addBikeButton}</div>
      </div>

      {!bikes || bikes.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <NewToBikitCard heading={dict.bikes.newToBikit} cta={dict.bikes.createFirstBike} compact />
          <div className="hidden rounded-lg bg-card/30 lg:block" />
          <div className="hidden rounded-lg bg-card/30 lg:block" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bikes.map((bike) => (
            <Link
              key={bike.id}
              href={`/bikes/${bike.id}`}
              className={`flex h-full flex-col rounded-lg bg-card p-5 ${CLICKABLE_CARD_HOVER}`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <BikeIcon type={bike.type} plain />
                <HealthBadge level={bikeHealthById.get(bike.id) ?? null} dict={dict} />
              </div>
              <h2 className="font-display text-[20px] font-bold">{bike.name}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                {bike.strava_gear_id && <StravaBadgeIcon className="size-[12px] shrink-0" />}
                {[bike.type, bike.brand, bike.model, bike.year].filter(Boolean).join(" · ") || dict.bikes.noDetailsYet}
              </p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                {/* Mono and full-contrast, like the totals in the bike header
                    they mirror — the muted grey was the odd one out. */}
                <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground">
                  {/* The two totals were one joined string; they are two nodes
                      now because each one rolls against its own baseline and
                      has to store the very same figure the bike's own header
                      stores. The separator moved out of the join for the same
                      reason and keeps the text colour it had — the muted one
                      below belongs to the Ride Load, which arrived later. */}
                  <span className="inline-flex items-baseline whitespace-pre">
                    {bike.total_km != null && (
                      <AnimatedNumber
                        value={formatDistance(bike.total_km, distanceUnit, locale)}
                        storageKey={`${bike.id}:km`}
                      />
                    )}
                    {bike.total_km != null && bike.total_hours != null && <span>{" · "}</span>}
                    {bike.total_hours != null && (
                      <AnimatedNumber value={formatHours(bike.total_hours, locale)} storageKey={`${bike.id}:hours`} />
                    )}
                  </span>
                  {/* Third reading on the line, behind the same separator the
                      other two use. The glyph carries the name instead of the
                      words "Ride Load": at this size the label would be longer
                      than the two totals it follows, and the same weight glyph
                      names the figure on the bike page and in the report. No
                      band colour — a card that already carries a health badge
                      would be showing two coloured verdicts on one bike, and
                      they are not the same scale. */}
                  {rideLoadById.get(bike.id) && (
                    <>
                      <span aria-hidden className="text-muted-foreground">·</span>
                      {/* Nudged up 1px, and the reason is not that it was off
                          centre — measured, the box centre and the digits'
                          optical centre are 0.35px apart. It is that the glyph
                          is 12px of solid ink while the digits are 10.6px and
                          never go below the baseline, so a centred icon dips
                          under the line the numbers sit on and reads as
                          hanging. Raising it puts its foot on their baseline. */}
                      <RideLoadGlyph className="size-3 -translate-y-px" />
                      <AnimatedNumber
                        value={String(Math.round(rideLoadById.get(bike.id)!.value))}
                        storageKey={`${bike.id}:load`}
                      />
                    </>
                  )}
                </p>
                <span className="flex h-11 shrink-0 items-center justify-center rounded-full bg-muted px-4 text-sm font-semibold">
                  {dict.bikes.viewBike}
                </span>
              </div>
            </Link>
          ))}

          {atBikeLimit && subscription.plan === "free" && (
            <>
              <UpgradeToPersonalCard
                heading={dict.bikes.upgradeHeading}
                feature1={dict.bikes.upgradeFeature1}
                feature2={dict.bikes.upgradeFeature2}
                price={dict.bikes.upgradePrice}
                priceUnit={dict.bikes.upgradePriceUnit}
                cta={dict.bikes.upgradeCta}
                yearly={{
                  price: dict.bikes.upgradePriceYearly,
                  priceUnit: dict.bikes.upgradePriceUnitYearly,
                  monthlyLabel: dict.settings.billing.intervalMonthly,
                  yearlyLabel: dict.settings.billing.intervalYearly,
                  savingLabel: dict.settings.billing.intervalSaving,
                }}
              />
              <div className="hidden rounded-lg bg-card/30 lg:block" />
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-center sm:hidden">{addBikeButton}</div>
    </div>
  );
}
