import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Inbox } from "lucide-react";
import { archiveComponent, restoreComponent } from "@/lib/actions/components";
import { ComponentActionsMenu } from "@/components/component-actions-menu";
import { FormError } from "@/components/form-error";
import { ToolIcon } from "@/components/tool-icon";
import { createClient } from "@/lib/supabase/server";
import {
  calculateComponentStatus,
  calculateComponentUsage,
  selectActiveInterval,
  type NamedIntervalStatusInput,
} from "@/lib/maintenance/calculation";
import { healthPercent, classifyHealth } from "@/lib/maintenance/health";
import { formatDate, formatDistance, formatHours, kmToUnit } from "@/lib/format";
import { formatWarranty } from "@/lib/warranty";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { BikeIcon } from "@/components/bike-icon";
import { Button } from "@/components/ui/button";
import { HealthBadge, HealthPercentBadge } from "@/components/health-badge";
import { ServiceIntervalBar } from "@/components/service-interval-bar";
import { MaintenanceIcon } from "@/components/interval-icons";
import { TypeBadge, INTERVENTION_TYPE_DOT_STYLES } from "@/components/type-badge";
import { ComponentIcon } from "@/components/component-icon";
import { COMPONENT_CATEGORY_ICON } from "@/components/component-category-icon";
import { BadgedCategoryIcon } from "@/components/component-event-visuals";
import type { ComponentCategory } from "@/lib/constants";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { categoryLabel } from "@/lib/component-category";

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

const fieldBasis = "shrink-0 grow-0 basis-[calc(33.333%-0.75rem)] sm:basis-[calc(25%-1.125rem)] lg:basis-[calc(16.666%-1.25rem)]";

export default async function ComponentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bikeId: string; componentId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { bikeId, componentId } = await params;
  // Restoring can be refused — a plan limit, or a write that failed — and this
  // is where the attempt lands back.
  const { error: actionError } = await searchParams;
  const supabase = await createClient();

  // None of these depend on each other's results (all keyed off the URL's
  // bikeId/componentId), so they fire as one round trip instead of five.
  const [{ data: userData }, { data: bike }, { data: component }, { data: interventions }, { data: rawIntervals }] =
    await Promise.all([
      supabase.auth.getClaims(),
      supabase.from("bikes").select("id, name, type, total_km, total_hours").eq("id", bikeId).single(),
      supabase.from("components").select("*").eq("id", componentId).eq("bike_id", bikeId).single(),
      supabase
        .from("interventions")
        .select("*")
        .eq("component_id", componentId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("component_service_intervals").select("*").eq("component_id", componentId).order("slot"),
    ]);

  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const dict = getDictionary(locale);

  if (!bike) notFound();
  if (!component) notFound();

  // An archived part is measured against the bike's odometer as it stood when
  // the part came off, not as it stands now. Reading it live would have the
  // part quietly collecting every kilometre ridden since, which is the one
  // number on this page that has to stay still.
  const usage = calculateComponentUsage({
    bikeTotalKm: component.retired_at ? component.bike_km_at_retire : bike.total_km,
    bikeTotalHours: component.retired_at ? component.bike_hours_at_retire : bike.total_hours,
    bikeKmAtInstall: component.bike_km_at_install,
    bikeHoursAtInstall: component.bike_hours_at_install,
  });

  // Each interval's own baseline is the most recent intervention that reset
  // THAT interval or one on the same cadence (not just the most recent one on
  // the component) — derived from the already-fetched interventions array
  // (sorted newest-first) rather than a second round-trip.
  //
  // Same rule as component_interval_status (migration 00030), and it has to
  // be: this page and the view would otherwise disagree about when a part was
  // last serviced. Reminders sharing a cadence describe one visit — a FOX fork
  // services lowers, damper and air spring together at 125 h — so servicing
  // any of them services all.
  const sameCadence = (a: { interval_type: string; interval_value: number }) => (id: string | null) => {
    const reset = (rawIntervals ?? []).find((i) => i.id === id);
    return reset != null && reset.interval_type === a.interval_type && reset.interval_value === a.interval_value;
  };
  const intervals = (rawIntervals ?? []).map((interval) => {
    const matches = sameCadence(interval);
    const lastReset = (interventions ?? []).find((iv) => matches(iv.reset_interval_id)) ?? null;
    const input: NamedIntervalStatusInput = {
      id: interval.id,
      name: interval.name,
      intervalType: interval.interval_type as "km" | "hours" | "months",
      intervalValue: interval.interval_value,
      installDate: component.install_date,
      componentCreatedAt: component.created_at.slice(0, 10),
      lastInterventionDate: lastReset?.date ?? null,
      currentKm: bike.total_km,
      currentHours: bike.total_hours,
      bikeKmAtInstall: component.bike_km_at_install,
      bikeHoursAtInstall: component.bike_hours_at_install,
      bikeKmAtLastService: lastReset?.bike_km_at_intervention ?? null,
      bikeHoursAtLastService: lastReset?.bike_hours_at_intervention ?? null,
    };
    return { interval: input, status: calculateComponentStatus(input) };
  });

  const activeResult = selectActiveInterval(intervals.map((i) => i.interval));
  const percent = healthPercent(activeResult?.status.fractionUsed ?? null);
  const healthLevel = percent != null ? classifyHealth(percent) : null;

  const distanceDetail = usage.km != null ? formatDistance(usage.km, distanceUnit, locale) : null;
  const hoursDetail = usage.hours != null ? formatHours(usage.hours, locale) : null;

  const logMaintenanceButton = (
    <Button
      render={<Link href={`/bikes/${bike.id}/components/${component.id}/interventions/new`} />}
      nativeButton={false}
      variant="inverted"
      size="sm"
      className="h-[52px] w-[196px] text-sm"
    >
      <ToolIcon className="size-3.5" />
      {dict.dashboard.logMaintenance}
    </Button>
  );

  const isArchived = component.retired_at != null;

  // Archived, the glyph carries the same mark the archive list and the timeline
  // put on it, so the part is recognisable as retired before any label is read.
  const componentGlyph = isArchived ? (
    <BadgedCategoryIcon
      category={component.category}
      badge={<Ban className="size-3" strokeWidth={3} />}
      badgeStyle="bg-foreground text-background"
      dimmed
    />
  ) : (
    <ComponentIcon size="flat" icon={COMPONENT_CATEGORY_ICON[component.category as ComponentCategory]} />
  );

  // One control for both actions, in both states. The pencil it replaces was a
  // verb promising the edit form, which is the wrong thing for a menu to hang
  // off; and archiving used to sit up here while restoring sat at the foot of
  // the card, so the same action moved depending on the part's state.
  const actionsMenu = (
    <ComponentActionsMenu
      editHref={`/bikes/${bike.id}/components/${component.id}/edit`}
      editLabel={dict.components.detail.edit}
      menuLabel={dict.components.detail.actionsMenu}
      isArchived={isArchived}
      lifecycleLabel={
        isArchived ? dict.bikes.detail.restoreAction : dict.bikes.detail.archiveAction
      }
      lifecycleAction={
        isArchived
          ? restoreComponent.bind(null, bike.id, component.id)
          : archiveComponent.bind(null, bike.id, component.id)
      }
      confirmTitle={
        isArchived ? dict.bikes.detail.restoreConfirmTitle : dict.bikes.detail.archiveConfirmTitle
      }
      confirmDescription={
        isArchived
          ? dict.bikes.detail.restoreConfirmDesc(component.name)
          : dict.bikes.detail.archiveConfirmDesc(component.name)
      }
      confirmLabel={
        isArchived ? dict.bikes.detail.restoreConfirm : dict.bikes.detail.archiveConfirm
      }
      cancelLabel={dict.components.form.cancel}
    />
  );

  const archivedPill = isArchived ? (
    <span className="inline-block shrink-0 rounded-full bg-muted px-3 py-1.5 text-[11px] leading-none font-semibold tracking-wide text-muted-foreground">
      {dict.bikes.detail.archivedPill}
    </span>
  ) : null;

  return (
    <div className="pt-4 sm:pt-8">
      <div className="hidden text-sm text-muted-foreground sm:mb-2 sm:block">
        <Link href="/bikes" className="hover:text-foreground">
          {dict.bikes.breadcrumb}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/bikes/${bike.id}`} className="hover:text-foreground">
          {bike.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{component.name}</span>
      </div>

      <FormError message={actionError} />

      {/* Mobile only: a tab peeking out from behind the component card, tying
          the part back to the bike it's fitted to. Desktop already says it in
          the breadcrumb, so it would be a second copy of the same fact. The
          card below is `relative` so it paints over the tab's hidden half —
          block backgrounds and inline text are painted in separate phases, so
          tree order alone doesn't guarantee the cover. */}
      <Link
        href={`/bikes/${bike.id}`}
        className="mx-6 -mb-[23px] flex items-center gap-2 rounded-[20px] bg-[#F7F7F7] px-5 pt-2 pb-8 dark:bg-muted sm:hidden"
      >
        <BikeIcon type={bike.type} plain className="size-7" />
        <span className="truncate text-[15px] font-bold">{bike.name}</span>
      </Link>

      <div className="relative mb-6 rounded-lg bg-card px-6 pt-6 pb-6">
        {/* Desktop: icon + name/badge, full details grid inline, edit far right */}
        <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div className="flex items-center gap-4">
            {componentGlyph}
            <div>
              <h1 className="text-xl font-display font-bold">{component.name}</h1>
              <HealthBadge level={healthLevel} dict={dict} className="mt-1.5" />
            </div>
          </div>
          <div className="flex flex-1 flex-wrap gap-x-4 gap-y-5 sm:gap-x-6">
            <DetailField label={dict.brandField.brand} value={component.brand ?? "—"} className={fieldBasis} />
            <DetailField label={dict.components.form.model} value={component.model ?? "—"} className={fieldBasis} />
            <DetailField label={dict.components.form.category} value={categoryLabel(dict, component.category) ?? "—"} className={fieldBasis} />
            <DetailField label={dict.components.detail.totalDistance} value={distanceDetail} mono className={fieldBasis} />
            <DetailField label={dict.components.detail.totalHours} value={hoursDetail} mono className={fieldBasis} />
            {component.serial_number && (
              <DetailField label={dict.components.form.serialNumber} value={component.serial_number} mono className={fieldBasis} />
            )}
            {component.install_date && (
              <DetailField label={dict.components.form.installDate} value={formatDate(component.install_date)} className={fieldBasis} />
            )}
            {component.purchase_date && (
              <DetailField label={dict.components.form.purchaseDate} value={formatDate(component.purchase_date)} className={fieldBasis} />
            )}
            {component.warranty && (
              <DetailField
                label={dict.components.form.warranty}
                value={formatWarranty(component.warranty, dict.format.warrantyYears)}
                className={fieldBasis}
              />
            )}
            {component.year && (
              <DetailField label={dict.components.form.year} value={component.year} className={fieldBasis} />
            )}
            {component.notes && (
              <DetailField label={dict.components.form.notes} value={component.notes} className="min-w-[220px] flex-1" />
            )}
          </div>
          {archivedPill}
          {actionsMenu}
        </div>

        {/* Mobile: icon + name/subtitle, then compact stat rows */}
        <div className="sm:hidden">
          <div className="flex items-center gap-4">
            {componentGlyph}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-display font-bold">{component.name}</h1>
              {/* No bike name here: the tab peeking out above the card already
                  says it, and repeating it costs the line the room the brand
                  and model need before it truncates. */}
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {[categoryLabel(dict, component.category), component.brand, component.model].filter(Boolean).join(" · ") ||
                  dict.bikes.noDetailsYet}
              </p>
            </div>
            {/* Sits beside the name rather than in the shared header, so the
                actions read as belonging to this component. The header's own
                edit button skips this route because of it. */}
            {actionsMenu}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-6">
            <DetailField label={dict.components.detail.totalDistance} value={distanceDetail} mono />
            <DetailField label={dict.components.detail.totalHours} value={hoursDetail} mono />
            {archivedPill && <div className="ml-auto">{archivedPill}</div>}
          </div>
        </div>

        {/* An archived part has no next service and nothing left to log, so the
            reminders and the maintenance button go. Their rows are kept in the
            database: putting the part back brings its reminders back with it. */}
        {isArchived ? null : intervals.length > 0 ? (
          // Pulled out to the card's edges so the rule above spans it whole,
          // then padded back in — half the card's own 24px on mobile, so the
          // pills sit wider than the text above them.
          <div className="-mx-6 mt-6 space-y-4 border-t border-border px-3 pt-6 sm:px-6">
            {intervals.map(({ interval, status }) => {
              const rowPercent = healthPercent(status.fractionUsed);
              const isActive = activeResult?.interval.id === interval.id;
              const cadence =
                interval.intervalType && interval.intervalValue != null
                  ? dict.components.detail.every(
                      interval.intervalType === "km"
                        ? Math.round(kmToUnit(interval.intervalValue, distanceUnit) * 10) / 10
                        : interval.intervalValue,
                      interval.intervalType,
                      distanceUnit
                    )
                  : null;
              // The amount is kept apart from the sentence it goes into so it
              // can carry the weight on its own: the dictionary builds the
              // label by interpolating exactly this string, so splitting on it
              // gives back the words either side of it, in either language.
              const amount =
                status.amountRemaining != null
                  ? interval.intervalType === "km"
                    ? formatDistance(Math.abs(status.amountRemaining), distanceUnit, locale)
                    : formatHours(Math.abs(status.amountRemaining), locale)
                  : status.daysRemaining != null
                    ? `${Math.abs(status.daysRemaining)}d`
                    : null;
              const isOverdue = (status.amountRemaining ?? status.daysRemaining ?? 1) <= 0;
              const label =
                amount == null
                  ? null
                  : isOverdue
                    ? dict.components.detail.overdueLabel(amount)
                    : dict.components.detail.remainingLabel(amount);
              const [before, after] = label?.split(amount!) ?? [];

              return (
                <div
                  key={interval.id}
                  className="flex items-center gap-4 rounded-[22px] bg-[#F4F4F4] p-3 dark:bg-muted"
                >
                  <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-card">
                    <MaintenanceIcon className="size-5 text-foreground" />
                  </span>
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm text-muted-foreground">
                      {interval.name}
                      {cadence ? ` · ${cadence}` : ""}
                      {/* Which of the up-to-3 reminders drives the percentage
                          and colour the component shows everywhere else. The
                          tag sits on `bg-card` rather than the `bg-muted` it
                          used before the pills: against a #F4F4F4 pill that
                          was a three-point difference, invisible either way. */}
                      {isActive && (
                        <span className="ml-2 inline-block shrink-0 rounded-[7px] bg-card px-2 py-0.5 align-middle text-[11px] font-semibold text-muted-foreground">
                          {dict.components.detail.activeIntervalTag}
                        </span>
                      )}
                    </p>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      {label && (
                        <p className="min-w-0 truncate text-base">
                          {before}
                          <span className="font-semibold">{amount}</span>
                          {after}
                        </p>
                      )}
                      <HealthPercentBadge percent={rowPercent} className="ml-auto shrink-0" />
                    </div>
                    {/* The pill is near enough the bar's own `bg-muted` track
                        that the empty half disappeared into it, and the bar
                        read as being much shorter than it was. */}
                    <ServiceIntervalBar fraction={status.fractionUsed} className="mt-2 bg-border" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">{dict.components.detail.noIntervalsYet}</p>
        )}

        {!isArchived && <div className="mt-6 flex justify-center sm:hidden">{logMaintenanceButton}</div>}
      </div>

      <div className="mb-6 flex items-center justify-center sm:mb-3 sm:justify-between">
        <h2 className="font-display font-bold">{dict.components.detail.history}</h2>
        {!isArchived && <div className="hidden sm:block">{logMaintenanceButton}</div>}
      </div>

      {!interventions || interventions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Inbox className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{dict.components.detail.noInterventionsYet}</p>
        </div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute top-2 bottom-2 left-[5.5px] border-l border-dashed border-foreground/30" />
          {interventions.map((iv) => (
            <div key={iv.id} className="relative mb-4 last:mb-0">
              <span
                className={cn(
                  "absolute top-1/2 -left-6 size-[11px] -translate-y-1/2 rounded-full border-2",
                  INTERVENTION_TYPE_DOT_STYLES[iv.type as "service" | "repair" | "replacement"]
                )}
              />
              <Link
                href={`/bikes/${bike.id}/components/${component.id}/interventions/${iv.id}/edit`}
                className={cn("flex flex-wrap items-center gap-4 rounded-lg bg-card p-5 sm:flex-nowrap", CLICKABLE_CARD_HOVER)}
              >
                <div className="w-28 shrink-0">
                  <TypeBadge type={iv.type as "service" | "repair" | "replacement"} dict={dict} />
                  <p className="mt-3 text-sm text-muted-foreground">{formatDate(iv.date)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{iv.description || dict.components.detail.noDescription}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {iv.kms != null && <span>{formatDistance(iv.kms, distanceUnit, locale)}</span>}
                    {iv.hours_used != null && <span>{formatHours(iv.hours_used, locale)}</span>}
                  </div>
                  {iv.notes && (
                    <p className="mt-3 rounded-[7px] bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{iv.notes}</p>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
