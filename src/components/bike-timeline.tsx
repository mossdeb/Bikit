import Link from "next/link";
import { Fragment } from "react";
import { Ban, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { formatDate, formatDistance, formatHours, splitFigureUnit } from "@/lib/format";
import type { TimelineEvent } from "@/lib/timeline";
import { INTERVENTION_TYPE_ICON } from "@/lib/intervention-type";
import { INTERVENTION_TYPE_STYLES } from "@/components/type-badge";
import { BadgedCategoryIcon, Measure } from "@/components/component-event-visuals";
import { ManufacturedIcon, PurchasedIcon, WarrantyIcon } from "@/components/timeline-icons";
import { LogoIcon } from "@/components/logo";
import { BikeIcon } from "@/components/bike-icon";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n";

/** A mint node with a softer mint halo around it — the halo is a second circle
 * rather than a ring utility, so it stays a glow at any zoom. `primary` is the
 * same colour in both themes, which is what lets the whole thread be written
 * once. */
function TimelineDot({ large }: { large?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/25",
        large ? "p-[5px]" : "p-1"
      )}
    >
      <span className={cn("rounded-full bg-primary", large ? "size-3" : "size-2.5")} />
    </span>
  );
}

function MilestonePill({
  icon,
  label,
  date,
}: {
  icon: React.ReactNode;
  label: string;
  date: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-[12px] bg-card px-5 py-3">
      <span className="flex size-6 shrink-0 items-center justify-center text-foreground">{icon}</span>
      <p className="text-sm font-semibold">{label}</p>
      <span className="ml-1 text-xs text-muted-foreground">{date}</span>
    </div>
  );
}

/**
 * The card shape shared by everything that happened to a specific component —
 * an intervention or the moment it was fitted.
 *
 * The category icon says which part at a glance; the small badge over it says
 * what happened to it, in the same colour the type badge uses elsewhere. The
 * figures sit in their own column on the right rather than running into the
 * subtitle, which is what lets them line up down the timeline.
 */
function ComponentEventCard({
  href,
  category,
  componentName,
  badge,
  badgeStyle,
  date,
  title,
  measures,
}: {
  href: string;
  /** Raw stored value — what COMPONENT_CATEGORY_ICON is keyed off. Only the
   * icon carries it; spelling it out beside the date would say twice what the
   * glyph already says, and the part's own name is what tells them apart. */
  category: string | null;
  componentName: string | null;
  badge: React.ReactNode;
  badgeStyle: string;
  date: string;
  title: string;
  measures: string[];
}) {
  return (
    <Link
      href={href}
      className={cn("flex w-full items-center gap-4 rounded-lg bg-card p-5", DARK_CARD_HAIRLINE, CLICKABLE_CARD_HOVER)}
    >
      <BadgedCategoryIcon category={category} badge={badge} badgeStyle={badgeStyle} />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-tight text-muted-foreground">
          {[formatDate(date), componentName].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 truncate text-[16px] leading-tight font-semibold">{title}</p>
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
}

/**
 * A moment in a part's life — fitted, or taken off — told as a stacked card
 * rather than the row an intervention gets.
 *
 * The shape is the difference: these are milestones, not work done, and they
 * read as such alongside "Added to Bikit" and "Purchased" — a stronger signal
 * than tinting the same row would be, and it costs no contrast.
 *
 * One card for both ends of the life on purpose. They are the same kind of
 * event and belong in the same shape; only the badge and the word change.
 */
function ComponentMilestoneCard({
  href,
  category,
  componentName,
  date,
  label,
  measures,
  badge,
  badgeStyle,
  dimmed,
}: {
  href: string;
  category: string | null;
  componentName: string;
  date: string;
  label: string;
  measures: string[];
  dimmed?: boolean;
  badge: React.ReactNode;
  badgeStyle: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg bg-card px-8 py-6 text-center",
        DARK_CARD_HAIRLINE,
        CLICKABLE_CARD_HOVER
      )}
    >
      <BadgedCategoryIcon category={category} badge={badge} badgeStyle={badgeStyle} dimmed={dimmed} />
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-[13px] leading-tight text-muted-foreground">{formatDate(date)}</p>
        <p className="text-[16px] leading-tight font-semibold">
          {componentName} · {label}
        </p>
        {/* Same reading as `Measure` and as the bike header's totals — the
            figure carries the weight and the colour, the unit stays quiet.
            Inline rather than the `Measure` component because this card keeps
            its measures on one line, where that one stacks them; the split
            itself is the shared `splitFigureUnit`. The paragraph stays muted
            so the separators and units inherit it and only the figure is
            overridden. */}
        {measures.length > 0 && (
          <p className="text-[14px] leading-tight text-muted-foreground">
            {measures.map((m, i) => {
              const { figure, unit } = splitFigureUnit(m);
              return (
                <Fragment key={m}>
                  {i > 0 && " · "}
                  <span className="font-semibold text-foreground">{figure}</span>
                  {unit && ` ${unit}`}
                </Fragment>
              );
            })}
          </p>
        )}
      </div>
    </Link>
  );
}

/** Annotates each event with the year label to show above it, whenever its
 * year differs from the previous (more recent) event's year. */
function withYearLabels(events: TimelineEvent[]): (TimelineEvent & { yearLabel: string | null })[] {
  let lastYear = String(new Date().getFullYear());
  return events.map((event) => {
    const eventYear = event.sortDate.slice(0, 4);
    const yearLabel = eventYear !== lastYear ? eventYear : null;
    lastYear = eventYear;
    return { ...event, yearLabel };
  });
}

function YearLabel({ year }: { year: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <TimelineDot />
      <span className="flex h-8 items-center rounded-[12px] bg-card px-5 text-[16px] font-bold">{year}</span>
    </div>
  );
}

function MilestoneCard({
  icon,
  label,
  subtitle,
  date,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  date: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-[12px] bg-card px-8 py-6 text-center ${DARK_CARD_HAIRLINE}`}>
      <span className="flex shrink-0 items-center gap-2 text-foreground">{icon}</span>
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-base leading-tight font-semibold">{label}</p>
        {subtitle && <p className="text-sm leading-tight text-muted-foreground">{subtitle}</p>}
        <p className="text-sm leading-tight text-muted-foreground">{date}</p>
      </div>
    </div>
  );
}

export function BikeTimeline({
  events,
  dict,
  locale,
  distanceUnit,
  bikeId,
  bikeType,
  headLabel,
}: {
  events: TimelineEvent[];
  dict: Dictionary;
  locale: Locale;
  distanceUnit: "km" | "mi";
  bikeId: string;
  bikeType?: string | null;
  /** The pill at the top of the line. Defaults to "Today"; the plan-gated
   * preview says "Demo" instead, which is what marks it as not their data. */
  headLabel?: string;
}) {
  return (
    <div className="relative mx-auto max-w-xl">
      {/* Grey rather than mint: the thread has to read against the page, and
          the mint that suits a node is too pale for a hairline. A dark grey in
          light mode needs a light one in dark — a fixed #404040 there would sit
          on #17181b and disappear. */}
      <div className="absolute top-3 bottom-3 left-1/2 -translate-x-1/2 border-l border-dashed border-[#404040] dark:border-[#8A8D93]" />
      <div className="relative flex flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-3">
          <TimelineDot large />
          <span className="rounded-[12px] bg-card px-5 py-2 text-sm font-semibold">
            {headLabel ?? dict.bikes.detail.today}
          </span>
        </div>

        {withYearLabels(events).map((event) => {
          let content: React.ReactNode;

          if (event.kind === "intervention") {
            const Icon = INTERVENTION_TYPE_ICON[event.type];
            content = (
              <div className="flex w-full flex-col items-center gap-3">
                <TimelineDot />
                <ComponentEventCard
                  href={`/bikes/${bikeId}/components/${event.componentId}/interventions/${event.id}/edit`}
                  category={event.componentCategory}
                  componentName={event.componentName}
                  badge={<Icon className="size-3" />}
                  badgeStyle={INTERVENTION_TYPE_STYLES[event.type]}
                  date={event.date}
                  title={event.description || dict.components.detail.noDescription}
                  measures={[
                    event.kms != null ? formatDistance(event.kms, distanceUnit, locale) : null,
                    event.hoursUsed != null ? formatHours(event.hoursUsed, locale) : null,
                  ].filter((m): m is string => m != null)}
                />
              </div>
            );
          } else if (event.kind === "componentInstalled") {
            content = (
              <div className="flex flex-col items-center gap-3">
                <TimelineDot />
                <ComponentMilestoneCard
                  href={`/bikes/${bikeId}/components/${event.id}`}
                  category={event.category}
                  componentName={event.name}
                  date={event.installDate}
                  label={dict.bikes.detail.componentInstalled}
                  badge={<Check className="size-3" strokeWidth={3} />}
                  badgeStyle={INTERVENTION_TYPE_STYLES.service}
                  // Null on components created before the figure was recorded —
                  // the line is left out rather than claiming a zero.
                  measures={[
                    event.initialKm != null ? formatDistance(event.initialKm, distanceUnit, locale) : null,
                    event.initialHours != null ? formatHours(event.initialHours, locale) : null,
                  ].filter((m): m is string => m != null)}
                />
              </div>
            );
          } else if (event.kind === "componentArchived") {
            content = (
              <div className="flex flex-col items-center gap-3">
                <TimelineDot />
                <ComponentMilestoneCard
                  href={`/bikes/${bikeId}/components/${event.id}`}
                  category={event.category}
                  componentName={event.name}
                  date={event.retiredAt}
                  label={dict.bikes.detail.componentArchived}
                  // The badge takes the app's inverted surface rather than one of
                  // the intervention colours: coming off the bike isn't a kind of
                  // work, and none of those three greens and purples mean "done".
                  badge={<Ban className="size-3" strokeWidth={3} />}
                  badgeStyle="bg-foreground text-background"
                  dimmed
                  // What the part finished on, frozen when it came off.
                  measures={[
                    event.km != null ? formatDistance(event.km, distanceUnit, locale) : null,
                    event.hours != null ? formatHours(event.hours, locale) : null,
                  ].filter((m): m is string => m != null)}
                />
              </div>
            );
          } else if (event.kind === "warrantyExpired") {
            content = (
              <div className="flex flex-col items-center gap-3">
                <TimelineDot />
                <MilestonePill
                  icon={<WarrantyIcon className="size-3.5" />}
                  label={dict.bikes.detail.warrantyExpired}
                  date={formatDate(event.date)}
                />
              </div>
            );
          } else if (event.kind === "purchased") {
            content = (
              <div className="flex flex-col items-center gap-3">
                <TimelineDot />
                <MilestonePill
                  icon={<PurchasedIcon className="size-4" />}
                  label={dict.bikes.detail.purchased}
                  date={formatDate(event.date)}
                />
              </div>
            );
          } else if (event.kind === "added") {
            content = (
              <div className="flex flex-col items-center gap-3">
                <TimelineDot />
                <div className={`flex flex-col items-center gap-2 rounded-[12px] bg-card px-8 py-6 text-center ${DARK_CARD_HAIRLINE}`}>
                  <BikeIcon type={bikeType} size="lg" plain className="size-16" />
                  <div className="flex flex-col items-center gap-0.5">
                    <p className="text-base leading-tight font-semibold">{dict.bikes.detail.addedToBikit}</p>
                    <p className="text-sm leading-tight text-muted-foreground">{formatDate(event.date)}</p>
                  </div>
                  <LogoIcon className="mt-1 size-6 text-foreground" />
                </div>
              </div>
            );
          } else {
            content = (
              <div className="flex flex-col items-center gap-3">
                <TimelineDot />
                <MilestoneCard
                  icon={<ManufacturedIcon className="size-6" />}
                  label={dict.bikes.detail.manufactured}
                  subtitle={event.brand ?? undefined}
                  date={event.year}
                />
              </div>
            );
          }

          const key =
            event.kind === "intervention"
              ? event.id
              : event.kind === "componentInstalled"
                ? `install-${event.id}`
                : event.kind === "componentArchived"
                  ? `archive-${event.id}`
                  : event.kind;
          return (
            <Fragment key={key}>
              {event.yearLabel && <YearLabel year={event.yearLabel} />}
              {content}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
