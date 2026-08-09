import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { manualSyncStrava } from "@/lib/actions/strava";
import { selectActiveInterval, calculateComponentUsage, type NamedIntervalStatusInput, type ActiveIntervalResult } from "@/lib/maintenance/calculation";
import { bikeHealthLevel, healthPercent } from "@/lib/maintenance/health";
import { formatDate, formatDistance, formatHours, kmToUnit } from "@/lib/format";
import { formatWarranty } from "@/lib/warranty";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { Button } from "@/components/ui/button";
import { HealthBadge, HealthPercentBadge } from "@/components/health-badge";
import { ServiceIntervalBar } from "@/components/service-interval-bar";
import { BikeIcon } from "@/components/bike-icon";
import { BikeDetailsToggle } from "@/components/bike-details-toggle";
import { StravaBadgeIcon } from "@/components/strava-icon";
import { PoweredByStrava } from "@/components/strava-brand";
import { StravaSyncToast } from "@/components/strava-sync-toast";
import { StravaSyncButton } from "@/components/strava-sync-button";
import { ComponentIcon } from "@/components/component-icon";
import { COMPONENT_CATEGORY_ICON } from "@/components/component-category-icon";
import { BadgedCategoryIcon, Measure } from "@/components/component-event-visuals";
import { ArchivedComponentsSection } from "@/components/archived-components-section";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BikeTimeline } from "@/components/bike-timeline";
import { buildBikeTimeline, type TimelineIntervention } from "@/lib/timeline";
import type { InterventionType } from "@/lib/intervention-type";
import type { ComponentCategory } from "@/lib/constants";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { categoryLabel, compareByCategory } from "@/lib/component-category";
import { UpgradeToPersonalCard } from "@/components/upgrade-to-personal-card";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_LIMITS, PLAN_FEATURES } from "@/lib/plans";
import { previewTimelineEvents } from "@/lib/timeline-preview";

function DetailField({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  if (value == null || value === "") return null;
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold", mono && "font-mono")}>{value}</p>
    </div>
  );
}

export default async function BikeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bikeId: string }>;
  searchParams: Promise<{ syncStatus?: string; syncCount?: string; syncMinutes?: string }>;
}) {
  const { bikeId } = await params;
  const { syncStatus, syncCount, syncMinutes } = await searchParams;
  const supabase = await createClient();

  // Auth and the bike row don't depend on each other.
  const [{ data: userData }, { data: bike }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("bikes").select("*").eq("id", bikeId).single(),
  ]);
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const dict = getDictionary(locale);
  if (!bike) notFound();

  const syncIsError = syncStatus === "error" || syncStatus === "rate-limited" || syncStatus === "not-connected";
  const syncMessage =
    syncStatus === "synced"
      ? Number(syncCount) > 0
        ? dict.bikes.detail.syncSynced(Number(syncCount))
        : dict.bikes.detail.syncNoActivity
      : syncStatus === "rate-limited"
        ? dict.bikes.detail.syncRateLimited(Number(syncMinutes))
        : syncStatus === "not-connected"
          ? dict.bikes.detail.syncNotConnected
          : syncStatus === "error"
            ? dict.bikes.detail.syncError
            : null;

  const userId = userData?.claims?.sub as string | undefined;

  // Subscription, this bike's component/interval rows, and the user's total
  // component count (for the plan-limit check) are all independent of each
  // other — fired together instead of two sequential round trips.
  const [subscription, { count: totalComponentCount }, { data: componentRows }, { data: intervalRows }] =
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
      userId
        ? supabase
            .from("components")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .is("retired_at", null)
        : Promise.resolve({ count: null }),
      supabase
        .from("components")
        .select(
          "id, name, category, brand, model, bike_km_at_install, bike_hours_at_install, install_date, initial_km, initial_hours, retired_at, bike_km_at_retire, bike_hours_at_retire"
        )
        .eq("bike_id", bikeId)
        .order("created_at", { ascending: true }),
      // Only fitted parts have a service interval worth reading. An archived
      // one keeps its rows, so that restoring it brings its reminders back.
      supabase
        .from("component_interval_status")
        .select(
          "id, component_id, name, interval_type, interval_value, install_date, component_created_at, last_intervention_date, bike_km_at_install, bike_hours_at_install, last_service_km, last_service_hours"
        )
        .eq("bike_id", bikeId)
        .is("retired_at", null),
    ]);

  // Cards are grouped by category rather than left in the order the parts were
  // added, which said nothing to a reader and scattered the two tyres and the
  // two wheels down the page. The query still orders by created_at and the sort
  // is stable, so that stays as the tie-break inside each category.
  const allComponents = componentRows ? [...componentRows].sort(compareByCategory) : null;

  // Archived parts leave the list, the count, and — through statusByComponent
  // below — the bike's health. A dead tyre sitting at 0% would otherwise hold
  // the whole bike at "Service Due" for as long as the row existed.
  const components = allComponents ? allComponents.filter((c) => !c.retired_at) : null;
  // The archive reads as a log, so it runs newest first rather than by
  // category: what you want there is what came off last.
  const archivedComponents = (allComponents ?? [])
    .filter((c) => c.retired_at)
    .sort((a, b) => (a.retired_at! < b.retired_at! ? 1 : a.retired_at! > b.retired_at! ? -1 : 0));

  // Nothing about the timeline is fetched for a plan that can't see it — the
  // preview is the same for everyone, so their own history never leaves the
  // database in the first place.
  const canSeeTimeline = PLAN_FEATURES[subscription.plan].timeline;
  const maxComponents = PLAN_LIMITS[subscription.plan].maxComponents;
  const atComponentLimit = maxComponents !== null && (totalComponentCount ?? 0) >= maxComponents;

  const intervalsByComponent = new Map<string, NamedIntervalStatusInput[]>();
  for (const row of intervalRows ?? []) {
    if (!row.component_id || !row.id || !row.name) continue;
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

  const activeByComponent = new Map<string, ActiveIntervalResult | null>(
    (components ?? []).map((c) => [c.id, selectActiveInterval(intervalsByComponent.get(c.id) ?? [])])
  );
  const statusByComponent = new Map(
    (components ?? []).map((c) => [c.id, activeByComponent.get(c.id)?.status ?? null])
  );
  const bikeHealth = bikeHealthLevel(
    [...statusByComponent.values()].map((s) => healthPercent(s?.fractionUsed ?? null))
  );

  // The timeline runs off every part the bike has ever carried, archived ones
  // included — their history is the reason the archive exists at all.
  const componentIds = (allComponents ?? [])
    .map((c) => c.id)
    .filter((id): id is string => id != null);
  const componentById = new Map((allComponents ?? []).map((c) => [c.id, c]));
  const { data: bikeInterventions } =
    canSeeTimeline && componentIds.length > 0
      ? await supabase
          .from("interventions")
          .select("id, component_id, type, date, description, kms, hours_used")
          .in("component_id", componentIds)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
      : { data: [] };

  const timelineInterventions: TimelineIntervention[] = (bikeInterventions ?? []).map((iv) => ({
    id: iv.id,
    componentId: iv.component_id,
    componentName: componentById.get(iv.component_id)?.name ?? "",
    componentCategory: componentById.get(iv.component_id)?.category ?? null,
    type: iv.type as InterventionType,
    date: iv.date,
    description: iv.description,
    kms: iv.kms,
    hoursUsed: iv.hours_used,
  }));

  const timelineEvents = canSeeTimeline
    ? buildBikeTimeline({
        bike: {
          brand: bike.brand,
          year: bike.year,
          purchase_date: bike.purchase_date,
          warranty: bike.warranty,
          created_at: bike.created_at,
        },
        interventions: timelineInterventions,
        // Every part the bike has carried, not just the ones still on it: an
        // install whose archive card sits above it is the pair that makes the
        // timeline worth reading.
        components: (allComponents ?? [])
          .filter((c) => c.install_date != null)
          .map((c) => ({
            id: c.id,
            name: c.name,
            category: c.category,
            installDate: c.install_date as string,
            initialKm: c.initial_km,
            initialHours: c.initial_hours,
          })),
        archived: archivedComponents.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          retiredAt: c.retired_at as string,
          // What it finished on: the bike's total when it came off, less the
          // baseline it started from. Null for either end leaves the line out
          // rather than printing a number built on a guess.
          km:
            c.bike_km_at_retire != null && c.bike_km_at_install != null
              ? c.bike_km_at_retire - c.bike_km_at_install
              : null,
          hours:
            c.bike_hours_at_retire != null && c.bike_hours_at_install != null
              ? c.bike_hours_at_retire - c.bike_hours_at_install
              : null,
        })),
      })
    : previewTimelineEvents(dict);

  const distanceDetail = bike.total_km != null ? formatDistance(bike.total_km, distanceUnit, locale) : null;
  const hoursDetail = bike.total_hours != null ? formatHours(bike.total_hours, locale) : null;

  const addComponentButton = atComponentLimit ? (
    <Button
      type="button"
      disabled
      variant="inverted"
      size="sm"
      className="h-[52px] w-[187px] text-sm disabled:opacity-10"
    >
      <Plus className="size-3.5" />
      {dict.bikes.detail.addComponent}
    </Button>
  ) : (
    <Button
      render={<Link href={`/bikes/${bike.id}/components/new`} />}
      nativeButton={false}
      variant="inverted"
      size="sm"
      className="h-[52px] w-[187px] text-sm"
    >
      <Plus className="size-3.5" />
      {dict.bikes.detail.addComponent}
    </Button>
  );

  const editButton = (
    <Button
      render={<Link href={`/bikes/${bike.id}/edit`} />}
      nativeButton={false}
      variant="outline"
      size="sm"
      className="bg-transparent"
    >
      <Pencil className="size-3.5" />
      {dict.bikes.detail.edit}
    </Button>
  );

  const fieldBasis = "shrink-0 grow-0 basis-[calc(33.333%-0.75rem)] sm:basis-[calc(25%-1.125rem)] lg:basis-[calc(16.666%-1.25rem)]";

  const detailsGrid = (
    <div className="flex flex-wrap gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-5">
      <DetailField label={dict.brandField.brand} value={bike.brand ?? "—"} className={fieldBasis} />
      <DetailField label={dict.bikes.form.model} value={bike.model ?? "—"} className={fieldBasis} />
      <DetailField label={dict.bikes.form.type} value={bike.type ?? "—"} className={fieldBasis} />
      <DetailField label={dict.bikes.detail.totalDistance} value={distanceDetail} mono className={fieldBasis} />
      <DetailField label={dict.bikes.detail.totalHours} value={hoursDetail} mono className={fieldBasis} />
      {bike.serial_number && (
        <DetailField label={dict.bikes.form.serialNumber} value={bike.serial_number} mono className={fieldBasis} />
      )}
      {bike.purchase_date && (
        <DetailField label={dict.bikes.form.purchaseDate} value={formatDate(bike.purchase_date)} className={fieldBasis} />
      )}
      {bike.warranty && (
        <DetailField
          label={dict.bikes.form.warranty}
          value={formatWarranty(bike.warranty, dict.format.warrantyYears)}
          className={fieldBasis}
        />
      )}
      {bike.year && <DetailField label={dict.bikes.form.year} value={bike.year} className={fieldBasis} />}
      {bike.frame_size && (
        <DetailField label={dict.bikes.form.frameSize} value={bike.frame_size} className={fieldBasis} />
      )}
      {bike.color && <DetailField label={dict.bikes.form.color} value={bike.color} className={fieldBasis} />}
      {bike.wheel_size && (
        <DetailField label={dict.bikes.form.wheelSize} value={bike.wheel_size} className={fieldBasis} />
      )}
      {bike.strava_gear_id && (
        <DetailField
          label={dict.bikes.detail.stravaGear}
          value={
            <span className="inline-flex items-center gap-1.5">
              <StravaBadgeIcon className="size-[12px] shrink-0" />
              {dict.settings.strava.connected}
            </span>
          }
          className={fieldBasis}
        />
      )}
      {bike.strava_gear_id && (
        <div className={cn("min-w-0", fieldBasis)}>
          <p className="text-xs text-muted-foreground">{dict.bikes.detail.stravaSync}</p>
          <form action={manualSyncStrava} className="mt-1.5">
            <input type="hidden" name="bikeId" value={bike.id} />
            <StravaSyncButton label={dict.bikes.detail.reload} pendingMessage={dict.bikes.detail.syncPending} />
          </form>
        </div>
      )}
      {bike.notes && (
        <DetailField label={dict.bikes.form.notes} value={bike.notes} className="min-w-[220px] flex-1" />
      )}
    </div>
  );

  return (
    <div className="sm:pt-8">
      {syncMessage && <StravaSyncToast message={syncMessage} isError={syncIsError} />}
      <div className="hidden text-sm text-muted-foreground sm:mb-2 sm:block">
        <Link href="/bikes" className="hover:text-foreground">
          {dict.bikes.breadcrumb}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{bike.name}</span>
      </div>

      {/* No radius while the card is full bleed — the corners had nothing to
          sit against. Desktop gets its margins back, and the radius with them.
          The bottom margin is 32px on a phone, to match the 32px the tab row
          leaves under itself (its mb-6 plus the 8px gap on the Tabs root). */}
      <div className="-mx-5 mb-8 bg-card px-[30px] pt-[37px] pb-6 sm:mx-0 sm:mb-6 sm:rounded-lg sm:px-6 sm:pt-6">
        {/* 12px between the name and the health badge on mobile, not 24: with
            30px of card padding the longest status ("Serviço Necessário")
            needs every pixel to stay on the name's line. Desktop, where the
            details grid and the edit button share this row, keeps its 24. */}
        <div className="flex flex-wrap items-end justify-between gap-3 sm:items-center sm:gap-6">
          <div className="flex items-end gap-4 sm:items-center">
            <BikeIcon type={bike.type} size="lg" plain />
            <div>
              <h1 className="text-[26px] leading-none font-display font-bold sm:text-xl sm:leading-normal">{bike.name}</h1>
              <HealthBadge level={bikeHealth} dict={dict} className="mt-1.5 hidden sm:block" />
            </div>
          </div>

          <HealthBadge level={bikeHealth} dict={dict} className="sm:hidden" />

          <div className="hidden flex-1 sm:block">{detailsGrid}</div>

          <div className="hidden sm:block">{editButton}</div>
        </div>

        <div className="mt-[51px] sm:hidden">
          <BikeDetailsToggle
            viewLabel={dict.bikes.detail.viewDetails}
            closeLabel={dict.bikes.detail.closeDetails}
            mark={bike.strava_gear_id ? <PoweredByStrava /> : null}
            compact={
              <div className="flex flex-wrap gap-6">
                <DetailField label={dict.bikes.detail.totalDistance} value={distanceDetail} mono />
                <DetailField label={dict.bikes.detail.totalHours} value={hoursDetail} mono />
              </div>
            }
            expanded={detailsGrid}
          />
        </div>

        {/* Strava asks for their mark wherever their data is on screen, and on
            this page that is the totals — which sit in the details grid on
            desktop and in the toggle's compact half on mobile, so the foot of
            the card is the one place under both. Only on a bike that is
            actually linked: an unlinked bike's totals are typed by hand, and
            crediting Strava for them would be the mark saying something
            untrue. */}
        {/* Desktop only. On a phone the mark travels with the figures inside
            the toggle, so that it sits beside them in either state instead of
            stranded under a collapsed row. */}
        {bike.strava_gear_id && (
          <div className="mt-4 hidden sm:flex sm:justify-end">
            <PoweredByStrava />
          </div>
        )}
      </div>

      <Tabs defaultValue="components">
        <div className="mb-6 flex items-center justify-center sm:mb-3 sm:justify-between">
          <TabsList variant="pill">
            <TabsTrigger
              value="components"
              className="flex-none px-5 py-2 text-base font-display font-medium"
            >
              {dict.bikes.detail.componentsTitle}
              {components && components.length > 0 && (
                // The trigger is an inline-flex with gap-1.5, so the count already sits
                // 6px off the title before any margin — pulled back to a plain space.
                <span className="-ml-0.5 font-normal text-muted-foreground">({components.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="flex-none px-5 py-2 text-base font-display font-medium"
            >
              {dict.bikes.detail.timelineTab}
            </TabsTrigger>
          </TabsList>
          <div className="hidden sm:block">{addComponentButton}</div>
        </div>

        <TabsContent value="components">
        {!components || components.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">{dict.bikes.detail.noComponentsYet}</p>
          </div>
        ) : (
          // Same column rule as the bike list: one card per row on a phone, two
          // from sm, three from lg. The gap stays at the 20px this page was
          // measured to rather than the list's 16px.
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {components.map((component) => {
              const fractionUsed = statusByComponent.get(component.id)?.fractionUsed ?? null;
              const percent = healthPercent(fractionUsed);
              const activeInterval = activeByComponent.get(component.id)?.interval ?? null;
              // No reminder means no percentage to badge. Rather than a bare
              // dash, show how far the component has come since it was fitted
              // — the one number that's always knowable without an interval.
              const usageKm =
                percent == null
                  ? calculateComponentUsage({
                      bikeTotalKm: bike.total_km,
                      bikeTotalHours: bike.total_hours,
                      bikeKmAtInstall: component.bike_km_at_install,
                      bikeHoursAtInstall: component.bike_hours_at_install,
                    }).km
                  : null;
              // The category now titles the card, so the second line is about
              // the next service only — falling back to brand/model when the
              // component has no reminder configured, so it isn't left blank.
              const serviceLine = activeInterval
                ? [
                    activeInterval.name,
                    dict.bikes.detail.every(
                      activeInterval.intervalType === "km" && activeInterval.intervalValue != null
                        ? Math.round(kmToUnit(activeInterval.intervalValue, distanceUnit) * 10) / 10
                        : activeInterval.intervalValue!,
                      activeInterval.intervalType!,
                      distanceUnit
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : // Falling back to brand and model says nothing when the name
                  // is already brand and model — which is exactly what it is
                  // whenever the custom name was left blank, since that's what
                  // deriveComponentName builds it from. Two identical lines
                  // read as a duplicated card.
                  (() => {
                    const brandModel = [component.brand, component.model].filter(Boolean).join(" ");
                    return brandModel === component.name ? null : brandModel;
                  })();
              return (
                <div
                  key={component.id}
                  className={cn(
                    "flex items-center gap-4 rounded-[20px] bg-card px-5 py-4 sm:gap-5 sm:px-6",
                    CLICKABLE_CARD_HOVER
                  )}
                >
                  <Link href={`/bikes/${bike.id}/components/${component.id}`} className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <ComponentIcon
                            size="flat"
                            icon={COMPONENT_CATEGORY_ICON[component.category as ComponentCategory]}
                            className="size-[22px]"
                          />
                          <span className="truncate text-base font-medium">{categoryLabel(dict, component.category)}</span>
                        </div>
                        <p className="mt-6 truncate font-display text-[22px] font-semibold leading-tight tracking-tight">
                          {component.name}
                        </p>
                        {serviceLine && (
                          <p className="truncate text-[13px] leading-tight text-muted-foreground">{serviceLine}</p>
                        )}
                      </div>
                      <HealthPercentBadge
                        percent={percent}
                        fallback={usageKm != null ? formatDistance(usageKm, distanceUnit, locale) : undefined}
                        className="shrink-0"
                      />
                    </div>
                    <ServiceIntervalBar fraction={fractionUsed} className="mt-1.5" />
                  </Link>
                  <Link
                    href={`/bikes/${bike.id}/components/${component.id}/interventions/new`}
                    title={dict.bikes.detail.logIntervention}
                    aria-label={dict.bikes.detail.logInterventionFor(component.name ?? "")}
                    // xl, not sm: the button plus its gap is 68px, a quarter of
                    // a card in the three-column layout, and it was cutting the
                    // component's own name to fit. It comes back only where the
                    // card is wide enough to carry it.
                    className="hidden size-12 shrink-0 items-center justify-center rounded-full border border-input text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground xl:flex"
                  >
                    <Plus className="size-4" />
                  </Link>
                </div>
              );
            })}

            {atComponentLimit && (
              <UpgradeToPersonalCard
                heading={dict.bikes.upgradeHeading}
                feature1={dict.bikes.upgradeFeature1}
                feature2={dict.bikes.upgradeFeature2}
                price={dict.bikes.upgradePrice}
                priceUnit={dict.bikes.upgradePriceUnit}
                cta={dict.bikes.upgradeCta}
                compact
              />
            )}
          </div>
        )}

        <div className="mt-4 flex justify-center sm:hidden">{addComponentButton}</div>

        {/* No plan gate, unlike the timeline beside it. Archiving is the gentle
            way out of a worn part, and charging for the only place you can see
            what you archived pushes a free rider straight back to deleting. */}
        {archivedComponents.length > 0 && (
          <ArchivedComponentsSection
            label={dict.bikes.detail.archivedTab}
            count={archivedComponents.length}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {archivedComponents.map((component) => {
                // Frozen at the moment it came off: the bike's total then, less
                // the baseline it started from.
                const finalKm =
                  component.bike_km_at_retire != null && component.bike_km_at_install != null
                    ? component.bike_km_at_retire - component.bike_km_at_install
                    : null;
                const finalHours =
                  component.bike_hours_at_retire != null && component.bike_hours_at_install != null
                    ? component.bike_hours_at_retire - component.bike_hours_at_install
                    : null;
                const measures = [
                  finalKm != null ? formatDistance(finalKm, distanceUnit, locale) : null,
                  finalHours != null ? formatHours(finalHours, locale) : null,
                ].filter((m): m is string => m != null);
                return (
                  <Link
                    key={component.id}
                    href={`/bikes/${bike.id}/components/${component.id}`}
                    className={cn(
                      "flex items-center gap-4 rounded-[20px] bg-card px-5 py-4 sm:px-6",
                      CLICKABLE_CARD_HOVER
                    )}
                  >
                    <BadgedCategoryIcon
                      category={component.category}
                      badge={<Ban className="size-3" strokeWidth={3} />}
                      badgeStyle="bg-foreground text-background"
                      dimmed
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] leading-tight text-muted-foreground">
                        {[formatDate(component.retired_at as string), categoryLabel(dict, component.category)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-1 truncate font-display text-[18px] leading-tight font-semibold">
                        {component.name}
                      </p>
                      <span className="mt-2 inline-block rounded-full bg-muted px-2.5 py-1 text-[11px] leading-none font-semibold tracking-wide text-muted-foreground">
                        {dict.bikes.detail.archivedPill}
                      </span>
                    </div>
                    {measures.length > 0 && (
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {measures.map((m) => (
                          <Measure key={m} text={m} />
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </ArchivedComponentsSection>
        )}
        </TabsContent>

        <TabsContent value="timeline">
          {!canSeeTimeline && (
            <div className="mb-6 overflow-hidden rounded-lg bg-card">
              <p className="px-5 pt-5 pb-4 text-center text-sm font-semibold">
                {dict.bikes.detail.timelineLocked}
              </p>
              <UpgradeToPersonalCard
                heading={dict.bikes.upgradeHeading}
                feature1={dict.bikes.upgradeFeature1}
                feature2={dict.bikes.upgradeFeature2}
                price={dict.bikes.upgradePrice}
                priceUnit={dict.bikes.upgradePriceUnit}
                cta={dict.bikes.upgradeCta}
                compact
              />
            </div>
          )}
          {/* `inert`, not just `pointer-events-none`: the cards are links, and
              a sample that can still be tabbed into would offer routes to
              components that don't exist. It also keeps the mock-up out of the
              accessibility tree, where it has nothing to say. */}
          <div inert={!canSeeTimeline || undefined} className={cn(
              !canSeeTimeline &&
                // A fixed hex needs its dark counterpart on the same string, or it
                // stays light in dark mode. `background` rather than `muted`: in
                // light the well sits below the cards, and muted is above them.
                "mx-auto w-[60%] rounded-lg border border-border bg-[#E8E8E8] p-4 dark:bg-background"
            )}>
            {/* `zoom`, not `scale`: a transform would shrink the drawing and
                leave its full-size box behind, so the well would end in twice
                the empty space it needs. Zoom reflows. */}
            <div className={cn(!canSeeTimeline && "[zoom:0.5]")}>
              <BikeTimeline
                events={timelineEvents}
                dict={dict}
                locale={locale}
                distanceUnit={distanceUnit}
                bikeId={bike.id}
                bikeType={bike.type}
                headLabel={canSeeTimeline ? undefined : dict.bikes.detail.timelinePreview.demo}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
