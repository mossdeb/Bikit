import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Bike, Cog, ClipboardList, Inbox, AlertTriangle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CHECKOUT_INTENT_COOKIE } from "@/lib/checkout-intent";
import { selectActiveInterval, type NamedIntervalStatusInput } from "@/lib/maintenance/calculation";
import { bikeHealthLevel, classifyHealth, healthPercent, type HealthLevel } from "@/lib/maintenance/health";
import { formatDate, formatDistance, formatHours } from "@/lib/format";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { Button } from "@/components/ui/button";
import { HealthBadge, HealthPercentBadge } from "@/components/health-badge";
import { BikeIcon } from "@/components/bike-icon";
import { ToolIcon } from "@/components/tool-icon";
import { BikeCarousel } from "@/components/bike-carousel";
import { ComponentIcon } from "@/components/component-icon";
import { InterventionIcon } from "@/components/intervention-icon";
import { ServiceIntervalBar } from "@/components/service-interval-bar";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { StravaBadgeIcon } from "@/components/strava-icon";
import { NewToBikitCard } from "@/components/new-to-bikit-card";
import { UpgradeToPersonalCard } from "@/components/upgrade-to-personal-card";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_LIMITS, PLAN_FEATURES } from "@/lib/plans";
import { loadScoredRidesForBikes } from "@/lib/ride-stress-data";
import { rideIntensity } from "@/lib/ride-stress";
import { RideLoadGlyph } from "@/components/ride-load-icons";
import { AnimatedNumber } from "@/components/animated-number";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { InstallAppDialog } from "@/components/install-app-dialog";

import { completeOnboarding } from "@/lib/actions/onboarding";
import { NotificationsPromptDialog } from "@/components/notifications-prompt-dialog";
import { dismissInstallPrompt, dismissNotificationsPrompt } from "@/lib/actions/install-prompt";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { onboarding } = await searchParams;

  // Every way into the app lands here, which makes this the one place that has
  // to notice a plan picked before the account existed. Checked before any
  // query so a request that is about to redirect doesn't pay for a dashboard
  // nobody sees; /checkout/resume is the one that validates it and, either
  // way, clears the cookie.
  if ((await cookies()).has(CHECKOUT_INTENT_COOKIE)) {
    redirect("/checkout/resume");
  }

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getClaims();
  const claims = userData?.claims;
  const displayName =
    (claims?.user_metadata as { full_name?: string } | undefined)?.full_name?.split(" ")[0] ??
    (claims?.email as string | undefined)?.split("@")[0] ??
    "there";
  // The settings page's "User Onboarding" row re-opens the tour on demand
  // via ?onboarding=1, regardless of whether it was already completed.
  const showOnboarding =
    onboarding === "1" ||
    !(claims?.user_metadata as { onboarding_completed?: boolean } | undefined)?.onboarding_completed;
  const locale = localeFromMetadata(claims?.user_metadata);
  const dict = getDictionary(locale);
  const distanceUnit = ((claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const userId = claims?.sub as string | undefined;

  const [subscription, { data: bikes }, { data: componentRows }, { data: intervalRows }, { data: recentRaw }] =
    await Promise.all([
      userId
        ? getUserSubscription(userId)
        : Promise.resolve({
            plan: "free" as const,
            status: "active" as const,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            hasBillingAccount: false,
          }),
      supabase
        .from("bikes")
        .select("id, name, type, brand, model, year, total_km, total_hours, strava_gear_id")
        .order("usage_updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true }),
      // Archived parts are off the bike, so they carry no upcoming service and
      // no health. Filtered in both queries rather than only in the component
      // list: an archived part's intervals would otherwise still be fetched,
      // just to be matched against a component that isn't there.
      supabase
        .from("components")
        .select("id, bike_id, name")
        .is("retired_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("component_interval_status")
        .select(
          "id, component_id, name, interval_type, interval_value, install_date, component_created_at, last_intervention_date, bike_km_at_install, bike_hours_at_install, last_service_km, last_service_hours"
        )
        .is("retired_at", null),
      supabase
        .from("interventions")
        .select("id, type, date, kms, hours_used, component_id")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  // Same gate and same one-query-for-every-card shape as the bike list. Second
  // round trip for the same reason: it needs the ids the batch above returns.
  const rideLoadBikes =
    PLAN_FEATURES[subscription.plan].rideLoad
      ? (bikes ?? []).filter((bike) => bike.strava_gear_id).map((bike) => ({ id: bike.id, type: bike.type }))
      : [];
  const ridesByBike = await loadScoredRidesForBikes(supabase, rideLoadBikes);

  const rideStressNow = new Date();
  const rideLoadById = new Map(
    [...ridesByBike].map(([bikeId, rides]) => [bikeId, rideIntensity(rides, rideStressNow)])
  );

  const components = componentRows ?? [];
  const componentInfo = new Map(components.map((c) => [c.id, c]));
  const bikeInfo = new Map((bikes ?? []).map((b) => [b.id, b]));

  const intervalsByComponent = new Map<string, NamedIntervalStatusInput[]>();
  for (const row of intervalRows ?? []) {
    if (!row.component_id || !row.id || !row.name) continue;
    const bike = bikeInfo.get(componentInfo.get(row.component_id)?.bike_id ?? "");
    const list = intervalsByComponent.get(row.component_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      intervalType: row.interval_type as "km" | "hours" | "months" | null,
      intervalValue: row.interval_value,
      installDate: row.install_date,
      componentCreatedAt: row.component_created_at,
      lastInterventionDate: row.last_intervention_date,
      currentKm: bike?.total_km ?? null,
      currentHours: bike?.total_hours ?? null,
      bikeKmAtInstall: row.bike_km_at_install,
      bikeHoursAtInstall: row.bike_hours_at_install,
      bikeKmAtLastService: row.last_service_km,
      bikeHoursAtLastService: row.last_service_hours,
    });
    intervalsByComponent.set(row.component_id, list);
  }

  const statusByComponent = new Map(
    components.map((c) => [c.id, selectActiveInterval(intervalsByComponent.get(c.id) ?? [])?.status ?? null])
  );

  const totalBikes = bikes?.length ?? 0;
  // The first bike is the earliest point where installing buys the owner
  // anything, so it is the gate — not the count. Someone who dismissed this
  // with one bike should not be asked again on their third. Whether the app
  // is already installed, and on what, only the browser knows: the dialog
  // itself decides that and renders nothing when it shouldn't.
  // The flag itself, and not "the install card isn't showing": someone with
  // no bikes yet also isn't being shown it, and has nothing to be notified
  // about either. It is what the notifications card reads before asking from
  // a plain tab.
  const installPromptSeen = !!(claims?.user_metadata as { pwa_install_prompt_seen?: boolean } | undefined)
    ?.pwa_install_prompt_seen;
  const showInstallPrompt = totalBikes > 0 && !installPromptSeen;
  // No bike condition on this one: it only fires inside the installed app,
  // and getting that far is a stronger signal of intent than owning a bike.
  // Whether notifications are even askable is the dialog's own call.
  const showNotificationsPrompt = !(claims?.user_metadata as { push_prompt_seen?: boolean } | undefined)
    ?.push_prompt_seen;
  const totalComponents = components.length;
  const maxBikes = PLAN_LIMITS[subscription.plan].maxBikes;
  const atBikeLimit = maxBikes !== null && totalBikes >= maxBikes;
  const loggedThisYear =
    recentRaw?.filter((iv) => new Date(iv.date).getFullYear() === new Date().getFullYear()).length ?? 0;

  const bikeHealthById = new Map<string, HealthLevel | null>();
  for (const bike of bikes ?? []) {
    const percents = components
      .filter((c) => c.bike_id === bike.id)
      .map((c) => healthPercent(statusByComponent.get(c.id)?.fractionUsed ?? null));
    bikeHealthById.set(bike.id, bikeHealthLevel(percents));
  }

  const needsAttention = components
    .map((c) => {
      const fractionUsed = statusByComponent.get(c.id)?.fractionUsed ?? null;
      return { component: c, fractionUsed, percent: healthPercent(fractionUsed) };
    })
    .filter(
      (c): c is { component: (typeof components)[number]; fractionUsed: number; percent: number } =>
        c.percent != null && c.percent < 25
    )
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 6);

  return (
    <div className="pt-4 sm:pt-8">
      <OnboardingDialog
        open={showOnboarding}
        steps={dict.onboarding.steps.map((s) => ({
          ...s,
          greeting: s.greeting?.(displayName),
        }))}
        labels={{
          getStarted: dict.onboarding.getStarted,
          next: dict.onboarding.next,
          skip: dict.onboarding.skip,
          addFirstBike: dict.onboarding.addFirstBike,
          addLater: dict.onboarding.addLater,
        }}
        action={completeOnboarding}
      />
      {/* Not while the tour is up: two dialogs would stack, and the install
          ask only makes sense once there is a bike to come back to. */}
      {showInstallPrompt && !showOnboarding && (
        <InstallAppDialog labels={dict.installPrompt} action={dismissInstallPrompt} />
      )}
      {/* The two never collide: the install card hides itself once the app
          runs standalone, which is the one state this one appears in. */}
      {showNotificationsPrompt && !showOnboarding && (
        <NotificationsPromptDialog
          labels={dict.notificationsPrompt}
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
          installPromptAnswered={installPromptSeen}
          action={dismissNotificationsPrompt}
        />
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">{dict.dashboard.welcome(displayName)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.dashboard.bikeCount(totalBikes)} · {dict.dashboard.componentCount(totalComponents)}
            {needsAttention.length > 0 && ` · ${dict.dashboard.needsAttentionCount(needsAttention.length)}`}
          </p>
        </div>
        <Button render={<Link href="/bikes" />} nativeButton={false} variant="outline" className="hidden sm:inline-flex">
          <ToolIcon className="size-4" />
          {dict.dashboard.logMaintenance}
        </Button>
      </div>

      <div className="hidden gap-4 sm:mb-6 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg bg-emphasis p-5 text-emphasis-foreground">
          <div className="mb-4 flex size-9 items-center justify-center rounded-full bg-emphasis-foreground/10">
            <Bike className="size-4" />
          </div>
          <p className="text-xs text-emphasis-foreground/60">{dict.dashboard.totalBikes}</p>
          <p className="font-display text-2xl font-bold">{totalBikes}</p>
        </div>
        <div className={`rounded-lg bg-card p-5 ${DARK_CARD_HAIRLINE}`}>
          <div className="mb-4 flex size-9 items-center justify-center rounded-full bg-muted">
            <Cog className="size-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">{dict.dashboard.componentsTracked}</p>
          <p className="font-display text-2xl font-bold">{totalComponents}</p>
        </div>
        <div className={`rounded-lg bg-card p-5 ${DARK_CARD_HAIRLINE}`}>
          <div className="mb-4 flex size-9 items-center justify-center rounded-full bg-muted">
            <ClipboardList className="size-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">{dict.dashboard.loggedThisYear}</p>
          <p className="font-display text-2xl font-bold">{loggedThisYear}</p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display font-bold">{dict.dashboard.yourBikes}</h2>
        <Link href="/bikes" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {dict.dashboard.viewAll}
        </Link>
      </div>

      {!bikes || bikes.length === 0 ? (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <NewToBikitCard heading={dict.bikes.newToBikit} cta={dict.bikes.createFirstBike} compact />
          <div className="hidden rounded-lg bg-card/30 lg:block" />
          <div className="hidden rounded-lg bg-card/30 lg:block" />
        </div>
      ) : (
        <div className="mb-6">
          <BikeCarousel>
            {bikes.map((bike) => (
              <Link
                key={bike.id}
                href={`/bikes/${bike.id}`}
                className={`flex h-full min-h-[250px] flex-col rounded-lg bg-card p-6 sm:min-h-0 sm:p-5 ${CLICKABLE_CARD_HOVER} ${DARK_CARD_HAIRLINE}`}
              >
                <div className="flex items-start justify-end gap-3 sm:justify-between">
                  <BikeIcon type={bike.type} plain className="hidden sm:block" />
                  <HealthBadge level={bikeHealthById.get(bike.id) ?? null} dict={dict} />
                </div>
                <div className="flex flex-1 flex-col justify-center sm:flex-none sm:justify-start">
                  <BikeIcon type={bike.type} plain className="mb-1 sm:hidden" />
                  <h3 className="font-display text-[26px] font-bold sm:text-[20px]">{bike.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    {bike.strava_gear_id && <StravaBadgeIcon className="size-[12px] shrink-0" />}
                    {[bike.type, bike.brand, bike.model, bike.year].filter(Boolean).join(" · ") || dict.bikes.noDetailsYet}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  {/* Mono and full-contrast, like the totals in the bike header
                      they mirror — the muted grey was the odd one out. */}
                  <p className="flex items-center gap-1.5 tabular-nums text-sm font-semibold text-foreground">
                    {/* Two nodes rather than one joined string — see the note
                        on the bike list, which does exactly this. */}
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
                    {/* Same third reading as the bike list — see the note there
                        for why the glyph carries the name and why it stays
                        uncoloured next to a health badge. */}
                    {rideLoadById.get(bike.id) && (
                      <>
                        <span aria-hidden className="text-muted-foreground">·</span>
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
            )}
          </BikeCarousel>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`rounded-lg bg-card p-5 ${DARK_CARD_HAIRLINE}`}>
          <h2 className="mb-3 font-display font-bold">{dict.dashboard.needsAttention}</h2>
          {needsAttention.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {dict.dashboard.nothingNeedsAttention}
            </p>
          ) : (
            <div>
              {needsAttention.map(({ component, fractionUsed, percent }, i) => {
                const bike = bikeInfo.get(component.bike_id!);
                return (
                  <Link
                    key={component.id}
                    href={`/bikes/${component.bike_id}/components/${component.id}`}
                    className={`flex items-center gap-3 py-3 ${CLICKABLE_CARD_HOVER} ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <ComponentIcon icon={classifyHealth(percent) === "critical" ? AlertTriangle : Clock} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{component.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[bike?.type, bike?.name].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <ServiceIntervalBar fraction={fractionUsed} className="mt-2 max-w-[220px]" />
                    </div>
                    <HealthPercentBadge percent={percent} className="shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className={`rounded-lg bg-card p-5 ${DARK_CARD_HAIRLINE}`}>
          <h2 className="mb-3 font-display font-bold">{dict.dashboard.recentInterventions}</h2>
          {!recentRaw || recentRaw.length === 0 ? (
            <div className="py-6 text-center">
              <Inbox className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{dict.dashboard.noMaintenanceLogged}</p>
            </div>
          ) : (
            <div>
              {recentRaw.map((iv, i) => {
                const component = componentInfo.get(iv.component_id);
                const bike = component?.bike_id ? bikeInfo.get(component.bike_id) : undefined;
                const type = iv.type as "service" | "repair" | "replacement";
                return (
                  <Link
                    key={iv.id}
                    href={`/bikes/${component?.bike_id}/components/${iv.component_id}`}
                    className={`flex items-center gap-3 py-3 ${CLICKABLE_CARD_HOVER} ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <InterventionIcon type={type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {dict.interventionType[type]} — {component?.name ?? "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {bike?.name ?? "—"} · {formatDate(iv.date)}
                      </p>
                    </div>
                    <div className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {iv.kms != null ? formatDistance(iv.kms, distanceUnit, locale) : iv.hours_used != null ? formatHours(iv.hours_used, locale) : ""}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
