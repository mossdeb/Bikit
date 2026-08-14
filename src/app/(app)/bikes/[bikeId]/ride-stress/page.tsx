import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { formatDistance, formatHours } from "@/lib/format";
import { hasRideStressAccess } from "@/lib/ride-stress-access";
import { loadScoredRides } from "@/lib/ride-stress-data";
import {
  derivedRideMetrics,
  lifetimeRideStress,
  rideIntensity,
  rideIntensityDaily,
  type ScoredRide,
} from "@/lib/ride-stress";
import {
  RideIntensityBar,
  RideIntensityChip,
  type RideIntensityTrendDirection,
} from "@/components/ride-intensity-visuals";
import { RideIntensityTrend } from "@/components/ride-intensity-trend";
import { RideDetailsButton } from "@/components/ride-details-button";
import { PoweredByStrava } from "@/components/strava-brand";

const WINDOW_DAYS = 30;

/** Rising or falling against a week ago. Under a point either way is not a
 * trend, it is the decay doing its job, and an arrow that always points
 * somewhere stops meaning anything. */
function trendOf(series: { value: number }[]): RideIntensityTrendDirection {
  if (series.length < 8) return "flat";
  const delta = series[series.length - 1].value - series[series.length - 8].value;
  if (delta > 1) return "up";
  if (delta < -1) return "down";
  return "flat";
}

/** Section heading. One size for all of them, because the page is one card
 * with rules between its parts rather than a stack of cards — without a
 * surface change to separate them, the heading is what says a new section
 * started. The trend section carries its own copy of this, inside the client
 * component, since its number changes as the chart is scrubbed. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-[17px] leading-tight font-bold">{children}</h2>;
}

export default async function RideStressPage({ params }: { params: Promise<{ bikeId: string }> }) {
  const { bikeId } = await params;
  const supabase = await createClient();

  const [{ data: userData }, { data: bike }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("bikes").select("id, name, type, total_km, total_hours, strava_gear_id").eq("id", bikeId).single(),
  ]);

  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const dict = getDictionary(locale);
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";

  // notFound rather than a redirect or an "unavailable" page: to an account
  // outside the beta this route does not exist, and saying "you may not see
  // this" tells them there is something to see.
  if (!bike) notFound();
  if (!hasRideStressAccess(userData?.claims?.email as string | undefined)) notFound();

  const rides = await loadScoredRides(supabase, bikeId, bike.type);
  const now = new Date();
  const intensity = rideIntensity(rides, now);
  const lifetime = lifetimeRideStress(rides);

  // The rider's own clock, taken from their most recent ride — the only
  // evidence the app has of what timezone they ride in.
  const utcOffsetSeconds = rides.length ? rides[rides.length - 1].utcOffsetSeconds : null;
  const series = rideIntensityDaily(rides, now, WINDOW_DAYS, { utcOffsetSeconds });
  const trend = trendOf(series);

  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  // Newest first: the list is read as a log, and the ride you remember is the
  // one you just did.
  const recent = rides.filter((r) => new Date(r.date) >= windowStart).reverse();
  const maxStress = Math.max(...recent.map((r) => r.stress), 1);

  const number = (value: number, digits = 0) =>
    value.toLocaleString(locale === "pt" ? "pt-PT" : "en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const dayLabel = (localDate: string) => {
    const [, month, day] = localDate.split("-");
    return locale === "pt" ? `${day}.${month}` : `${month}.${day}`;
  };

  const detailItems = (ride: ScoredRide) => {
    const m = derivedRideMetrics(ride);
    const items = [
      { label: dict.rideStress.metric.stress, value: number(ride.stress) },
      { label: dict.rideStress.metric.distance, value: formatDistance(ride.distanceKm, distanceUnit, locale) },
      { label: dict.rideStress.metric.movingTime, value: formatHours(ride.movingHours, locale) },
    ];
    if (ride.elapsedHours != null) {
      items.push({ label: dict.rideStress.metric.elapsedTime, value: formatHours(ride.elapsedHours, locale) });
    }
    if (ride.elevationM != null) {
      items.push({ label: dict.rideStress.metric.elevation, value: `${number(ride.elevationM)} m` });
    }
    if (m.movingSpeedKmh != null) {
      items.push({ label: dict.rideStress.metric.movingSpeed, value: `${number(m.movingSpeedKmh, 1)} km/h` });
    }
    if (m.overallSpeedKmh != null) {
      items.push({ label: dict.rideStress.metric.overallSpeed, value: `${number(m.overallSpeedKmh, 1)} km/h` });
    }
    if (m.elevationPerKm != null) {
      items.push({ label: dict.rideStress.metric.elevationPerKm, value: `${number(m.elevationPerKm)} m` });
    }
    if (m.elevationPerHour != null) {
      items.push({ label: dict.rideStress.metric.elevationPerHour, value: `${number(m.elevationPerHour)} m` });
    }
    if (m.movingRatio != null) {
      items.push({ label: dict.rideStress.metric.movingRatio, value: `${number(m.movingRatio * 100)}%` });
    }
    return items;
  };

  return (
    <div className="sm:pt-8">
      <div className="hidden text-sm text-muted-foreground sm:mb-2 sm:block">
        <Link href="/bikes" className="hover:text-foreground">
          {dict.bikes.breadcrumb}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/bikes/${bike.id}`} className="hover:text-foreground">
          {bike.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{dict.rideStress.title}</span>
      </div>

      {/* One card, ruled into sections, rather than five cards with gutters
          between them. The figures on this page are readings of a single
          thing — the same rides counted four ways — and separate cards read
          as four unrelated widgets that happen to share a screen. */}
      <div className="divide-y divide-border rounded-lg bg-card">
        <section className="px-5 pt-6 pb-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="font-display text-[22px] leading-none font-bold sm:text-xl">{dict.rideStress.title}</h1>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{bike.name}</span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {dict.rideStress.beta}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{dict.rideStress.subtitle}</p>
        </section>

        {intensity ? (
          <>
            <section className="px-5 py-6 sm:px-6">
              <SectionTitle>{dict.rideStress.intensity}</SectionTitle>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {dict.rideStress.scoreLead(dict.rideStress.band[intensity.band])}
              </p>

              <p className="mt-5">
                <RideIntensityChip
                  band={intensity.band}
                  label={dict.rideStress.bandShort[intensity.band]}
                  trend={trend}
                />
              </p>

              {/* Value beside the bar, not above it: the bar is the sentence
                  and the number is where it ends. */}
              <div className="mt-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <RideIntensityBar value={intensity.value} band={intensity.band} />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-lg leading-none font-bold">
                  {Math.round(intensity.value)}
                </span>
              </div>
              <div className="mt-1.5 flex justify-between pr-11 text-xs text-muted-foreground">
                <span>{dict.rideStress.scaleLow}</span>
                <span>{dict.rideStress.scaleHigh}</span>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{dict.rideStress.basedOn}</p>
            </section>

            <section className="px-5 py-6 sm:px-6">
              <RideIntensityTrend
                points={series.map((point) => ({ label: dayLabel(point.date), value: point.value }))}
                title={dict.rideStress.trendTitle}
                axisTitle={dict.rideStress.intensity}
                axisDay={dict.rideStress.axisDay}
                scrubLabel={dict.rideStress.scrubLabel}
              />
            </section>

            <section className="px-5 py-6 sm:px-6">
              <SectionTitle>{dict.rideStress.last30Title}</SectionTitle>
              <p className="mt-1.5 text-sm text-muted-foreground">{dict.rideStress.last30Lead}</p>

              {recent.length === 0 ? (
                <p className="mt-5 text-sm text-muted-foreground">{dict.rideStress.noRidesIn30}</p>
              ) : (
                <div className="mt-5">
                  {/* 58px = the 46px label column plus the 12px gap, so the
                      zero sits over the left edge of every track. It is the
                      only axis mark the list needs: the tracks already line
                      up, and a rule drawn down them was a second edge saying
                      the same thing. */}
                  <p className="pl-[58px] text-[10px] text-muted-foreground">0</p>
                  <ul className="space-y-2.5 pt-1">
                    {recent.map((ride, index) => (
                      <li key={ride.id} className="flex items-center gap-3">
                        <span className="w-[46px] shrink-0 truncate text-xs text-muted-foreground">
                          {dict.rideStress.ride(index + 1)}
                        </span>
                        <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-muted">
                          <span
                            className="block h-full rounded-[3px] bg-foreground"
                            style={{ width: `${Math.max(1.5, (ride.stress / maxStress) * 100)}%` }}
                          />
                        </span>
                        <span className="w-7 shrink-0 text-right font-mono text-sm font-semibold">
                          {number(ride.stress)}
                        </span>
                        <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                          {dayLabel(ride.localDate)}
                        </span>
                        <RideDetailsButton
                          // The ride's own name lives in here rather than in
                          // the row: the row's left column is an axis label
                          // four characters wide, and "Volta de bicicleta de
                          // montanha elétrica matinal" is not that.
                          title={ride.name ?? dict.rideStress.ride(index + 1)}
                          label={dict.rideStress.rideDetails}
                          items={detailItems(ride)}
                          // Both can be true at once, and both are things the
                          // reader would otherwise have to guess at from a
                          // number that did not move.
                          note={
                            [
                              ride.estimated ? dict.rideStress.estimatedNote : null,
                              ride.countsTowardIntensity ? null : dict.rideStress.belowFloorNote,
                            ]
                              .filter(Boolean)
                              .join(" ") || null
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="px-5 py-6 sm:px-6">
            <p className="text-sm text-muted-foreground">{dict.rideStress.noRides}</p>
          </section>
        )}

        <section className="px-5 py-6 sm:px-6">
          <SectionTitle>{dict.rideStress.lifetimeTitle}</SectionTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">{dict.rideStress.lifetimeLead}</p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-5">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{dict.bikes.detail.totalDistance}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold">
                {bike.total_km != null ? formatDistance(bike.total_km, distanceUnit, locale) : "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{dict.bikes.detail.totalHours}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold">
                {bike.total_hours != null ? formatHours(bike.total_hours, locale) : "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{dict.rideStress.lifetime}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold">{number(lifetime)}</p>
            </div>
          </div>
          {/* The two totals above can carry kilometres typed by hand; this one
              is only ever the rides Bikit has, so it says how many it counted
              rather than leaving the three to be read as one history. */}
          <p className="mt-4 text-xs text-muted-foreground">{dict.rideStress.ridesCounted(rides.length)}</p>
        </section>
      </div>

      {bike.strava_gear_id && (
        <div className="mt-4 flex justify-end">
          <PoweredByStrava />
        </div>
      )}
    </div>
  );
}
