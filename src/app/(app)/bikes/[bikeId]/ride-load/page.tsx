import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { formatDistance, formatHours } from "@/lib/format";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_FEATURES } from "@/lib/plans";
import { loadScoredRides } from "@/lib/ride-stress-data";
import { BIKE_TYPES } from "@/lib/constants";
import {
  activityRideStress,
  derivedRideMetrics,
  modalityFor,
  lifetimeRideTotals,
  rideIntensity,
  rideIntensityBand,
  rideIntensityDaily,
  rideIntensityTrend,
  RIDE_STRESS_MODALITIES,
  type ScoredRide,
} from "@/lib/ride-stress";
import {
  INTENSITY_BAR_CLASS,
  INTENSITY_TEXT_CLASS,
  RideIntensityBar,
  TrendArrow,
} from "@/components/ride-intensity-visuals";
import { RideLoadGlyph } from "@/components/ride-load-icons";
import { RideLoadCountUp } from "@/components/ride-load-count-up";
import { cn } from "@/lib/utils";
import { RideIntensityTrend } from "@/components/ride-intensity-trend";
import { RideDetailsButton } from "@/components/ride-details-button";
import { PoweredByStrava } from "@/components/strava-brand";
import { RideLoadHowItWorksButton, RideLoadIntroDialog } from "@/components/ride-load-intro-dialog";
import { RideLoadFormulaButton } from "@/components/ride-load-formula-dialog";
import { dismissRideStressIntro } from "@/lib/actions/ride-stress";

const WINDOW_DAYS = 30;

/** Riding hours a bike needs before its load-per-hour is worth printing. */
const LOAD_RATE_MIN_HOURS = 1;

/**
 * The two rides the explainer compares. Same distance, three times apart in
 * Ride Load — which is the whole claim the card makes, so the card scores them
 * with the real function rather than quoting numbers written down here. Change
 * a modality's reference values and the example follows.
 *
 * The durations are part of the illustration and are shown: 20 km at 25 km/h
 * on the road, and the same 20 km taking an hour and a half on an enduro bike
 * with 900 m of climbing. Without them the score cannot be checked, and an
 * example nobody can check is a claim rather than a demonstration.
 */
const RIDE_LOAD_EXAMPLES = [
  { bikeType: "Road", distanceKm: 20, movingHours: 0.8, elevationM: 120 },
  { bikeType: "Enduro", distanceKm: 20, movingHours: 1.5, elevationM: 900 },
] as const;

/** Section heading. One size for all of them, because the page is one card
 * with rules between its parts rather than a stack of cards — without a
 * surface change to separate them, the heading is what says a new section
 * started. The trend section carries its own copy of this, inside the client
 * component, since its number changes as the chart is scrubbed. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xl leading-tight font-bold">{children}</h2>;
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
  // whose plan does not carry this, the route does not exist, and saying "you
  // may not see this" tells them there is something to see. The gate was an
  // email allowlist until the beta opened on 2026-08-15; it is PLAN_FEATURES
  // now, which today says yes on all three plans.
  if (!bike) notFound();
  const userId = userData?.claims?.sub as string | undefined;
  const plan = userId ? (await getUserSubscription(userId)).plan : "free";
  if (!PLAN_FEATURES[plan].rideLoad) notFound();

  // Shown once, on the first report anyone opens. The flag is per account and
  // not per bike: the explanation is about what Ride Load is, and that does
  // not change from one bike to the next.
  const showIntro = !(userData?.claims?.user_metadata as { ride_stress_intro_seen?: boolean } | undefined)
    ?.ride_stress_intro_seen;

  const rides = await loadScoredRides(supabase, bikeId, bike.type);
  const now = new Date();
  const intensity = rideIntensity(rides, now);
  const lifetimeTotals = lifetimeRideTotals(rides);

  // The rate the load was accumulated at, per hour of riding — not per
  // kilometre. Dividing by distance rewards standing still: a ride that barely
  // moves still earns time and elevation load, and a tiny denominator turns
  // that into a flattering figure. Measured on the owner's two bikes, the
  // parking-lot laps read 1.10x the enduro archetype per kilometre and 0.49x
  // per hour, and only the second one is true.
  //
  // Hidden under an hour of riding: three laps and 34 minutes produce a number
  // with all the confidence of a fact and none of the evidence.
  const lifetimeLoadPerHour =
    lifetimeTotals.movingHours >= LOAD_RATE_MIN_HOURS ? lifetimeTotals.stress / lifetimeTotals.movingHours : null;

  // The rider's own clock, taken from their most recent ride — the only
  // evidence the app has of what timezone they ride in.
  const utcOffsetSeconds = rides.length ? rides[rides.length - 1].utcOffsetSeconds : null;
  const series = rideIntensityDaily(rides, now, WINDOW_DAYS, { utcOffsetSeconds });
  const trend = rideIntensityTrend(rides, now);

  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  // Newest first: the list is read as a log, and the ride you remember is the
  // one you just did.
  const recent = rides.filter((r) => new Date(r.date) >= windowStart).reverse();

  const number = (value: number, digits = 0) =>
    value.toLocaleString(locale === "pt" ? "pt-PT" : "en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const dayLabel = (localDate: string) => {
    const [, month, day] = localDate.split("-");
    return locale === "pt" ? `${day}.${month}` : `${month}.${day}`;
  };

  const introLabels = {
    // The card teaches the metric, so it is headed by the metric — the page
    // above it is what carries the feature's name.
    title: dict.rideStress.rideLoad,
    tagline: dict.rideStress.intro.tagline,
    vs: dict.rideStress.intro.vs,
    compareLead: dict.rideStress.intro.compareLead,
    compareEmphasis: dict.rideStress.intro.compareEmphasis,
    recentTitle: dict.rideStress.intro.recentTitle,
    recentPoint: dict.rideStress.intro.recentPoint,
    lifetimeTitle: dict.rideStress.intro.lifetimeTitle,
    lifetimePoint: dict.rideStress.intro.lifetimePoint,
    gotIt: dict.rideStress.intro.gotIt,
    examples: RIDE_LOAD_EXAMPLES.map((example) => {
      const { stress } = activityRideStress(
        { ...example, id: 0, name: null, date: "", utcOffsetSeconds: null, elapsedHours: null, elevationRangeM: null },
        modalityFor(example.bikeType)
      );
      const band = rideIntensityBand(stress);
      return {
        bikeType: example.bikeType,
        bikeLabel: example.bikeType,
        distance: formatDistance(example.distanceKm, distanceUnit, locale),
        elevation: `${number(example.elevationM)} m`,
        score: number(stress),
        band,
        bandLabel: dict.rideStress.bandShort[band],
      };
    }),
  };

  // Every modality, and the bike's own first: the weights only say something
  // next to each other — Downhill giving distance 10% is a statement about
  // downhill only when a road row beside it gives distance 55%. The order is
  // otherwise BIKE_TYPES', so it matches the picker the bike's type came from.
  const formulaRows = [...BIKE_TYPES]
    .sort((a, b) => Number(b === bike.type) - Number(a === bike.type))
    .map((type) => {
      // Only the weights are shown. The reference values that go with them
      // (the ride that scores 100) live in the same table and are deliberately
      // left out: they answer "how much is a lot", which is a different
      // question from "what counts", and putting both on one line made four
      // numbers per row.
      const { weights } = RIDE_STRESS_MODALITIES[type];
      const percent = (weight: number) => Math.round(weight * 100);
      return {
        bikeType: type,
        label: type,
        current: type === bike.type,
        factors: [
          { key: "distance" as const, weightPercent: percent(weights.distance) },
          { key: "time" as const, weightPercent: percent(weights.time) },
          { key: "elevation" as const, weightPercent: percent(weights.elevation) },
        ].map((factor) => ({ ...factor, weightLabel: `${factor.weightPercent}%` })),
      };
    });

  const formulaLabels = {
    title: dict.rideStress.formula.title,
    tagline: dict.rideStress.formula.tagline,
    factorNames: dict.rideStress.formula.factorNames,
    referenceNote: dict.rideStress.formula.referenceNote,
    thisBike: dict.rideStress.formula.thisBike,
    gotIt: dict.rideStress.intro.gotIt,
    rows: formulaRows,
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
      {showIntro && <RideLoadIntroDialog labels={introLabels} action={dismissRideStressIntro} />}

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
        {/* No rule under the header: the title and its one-line explanation
            are the card announcing itself, not the first of the sections that
            follow, and a line there made them look like one more reading. The
            padding stays, so nothing moves. */}
        <section className="border-b-0 px-5 pt-6 pb-6 sm:px-6">
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
            {/* 18px at the sides against the 20 the other sections carry. The
                box has its own outline and 10px inside it, so it can sit
                slightly wider than a block of text without crowding the card.
                The 2px means this section's edge no longer lines up exactly
                with the headings above and below. */}
            <section className="px-[18px] py-6 sm:px-6">
              {/* No section heading here: the card's own header, two rules
                  above, already says Ride Load, and repeating it put the same
                  two words twice on one screen. What separates this reading
                  from the header is the outline below, not a title. */}
              {/* 10px at the sides and 16 top and bottom. The sides are tight
                  on purpose — the box already sits inside the section's 20px,
                  and stacking the two put 40px between the reading and the
                  edge of the card. Vertically there is nothing outside to
                  borrow from, so the same 10 left the band sitting on the
                  outline. The section keeps its own padding, so this block
                  still lines up with the headings above and below it. */}
              <div className="rounded-[12px] border border-border px-2.5 py-4">
                {/* The band as plain type in the foreground colour, with only
                    the arrow and the bar carrying the band's colour. On the
                    dark chip the name could be coloured; as bare type on a
                    white card two of the four bands vanish. */}
                {/* gap-1 and not 2: the glyph carries about a pixel of its own
                    margin inside the viewBox, so 8px of flex gap read as 9 and
                    the arrow floated away from the word it qualifies. */}
                <div className="flex items-start gap-1">
                  <h2 className="font-display text-[22px] leading-none font-bold">
                    {dict.rideStress.bandShort[intensity.band]}
                  </h2>
                  {/* 16px, which is about the cap height of the 22px heading
                      beside it. At 20 the arrow stood taller than the letters
                      and read as the louder of the two. */}
                  <TrendArrow trend={trend} className={cn("h-4", INTENSITY_TEXT_CLASS[intensity.band])} />
                </div>

                {/* Value beside the bar, not above it: the bar is the sentence
                    and the number is where it ends. */}
                <div className="mt-2.5 flex items-center">
                  <div className="min-w-0 flex-1">
                    <RideIntensityBar value={intensity.value} band={intensity.band} />
                  </div>
                  {/* Counts up in step with the bar — same duration and
                      curve, so the two arrive together. Driven frame by frame
                      rather than by an animated CSS counter: that only worked
                      where `@property` does, and everywhere else it sat on
                      zero and jumped at the end. */}
                  <RideLoadCountUp
                    value={Math.round(intensity.value)}
                    className="w-9 shrink-0 text-right font-display text-2xl leading-none font-bold"
                  />
                </div>
                {/* pr matches the number's column exactly, so "Extrema" ends
                    where the bar does. It was pr-12 while a 12px gap sat
                    between the two. */}
                <div className="mt-1.5 flex justify-between pr-9 text-xs text-muted-foreground">
                  <span>{dict.rideStress.scaleLow}</span>
                  <span>{dict.rideStress.scaleHigh}</span>
                </div>

                {/* Foreground and not muted: this is the sentence the reader
                    came for — what the score means for the bike. The glyph is
                    the same weight that marks Ride Load everywhere else. */}
                <div className="mt-5 flex items-start gap-2.5">
                  <RideLoadGlyph className="mt-0.5 size-[22px]" />
                  {/* 17.5px against the 20 that `text-sm` carries by default.
                      `leading-snug` would have been the obvious pick and is
                      what the explainer card uses, but on `text-sm` it is
                      19.25 — a change of 0.75px per line that nobody sees. */}
                  <p className="text-sm leading-tight text-foreground">
                    {dict.rideStress.scoreSentence[intensity.band].lead}{" "}
                    <strong className="font-semibold">
                      {dict.rideStress.scoreSentence[intensity.band].emphasis}
                    </strong>
                  </p>
                </div>
              </div>

              <p className="mt-3 text-center text-xs text-muted-foreground">{dict.rideStress.basedOn}</p>
            </section>

            {/* One point is not a trend, and the chart declines to draw it —
                so the section has to decline too, or a bike whose first ride
                was today gets an empty box between two rules. */}
            {series.length >= 2 && (
              <section className="px-5 py-6 sm:px-6">
                <RideIntensityTrend
                  points={series.map((point) => ({ label: dayLabel(point.date), value: point.value }))}
                  title={dict.rideStress.trendTitle}
                  axisTitle={dict.rideStress.rideLoad}
                  axisDay={dict.rideStress.axisDay}
                  scrubLabel={dict.rideStress.scrubLabel}
                />
              </section>
            )}

            <section className="px-5 py-6 sm:px-6">
              <SectionTitle>{dict.rideStress.last30Title}</SectionTitle>
              <p className="mt-1.5 text-sm text-muted-foreground">{dict.rideStress.last30Lead}</p>

              {recent.length === 0 ? (
                <p className="mt-5 text-sm text-muted-foreground">{dict.rideStress.noRidesIn30}</p>
              ) : (
                <div className="mt-5">
                  {/* The scale, written once over the tracks. Same column
                      widths as a row below, so the 0 and the 100 land on the
                      ends of every bar. */}
                  <div aria-hidden className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="w-[46px] shrink-0" />
                    <span className="flex min-w-0 flex-1 justify-between">
                      <span>0</span>
                      <span>100</span>
                    </span>
                    <span className="w-7 shrink-0" />
                    <span className="w-[92px] shrink-0" />
                    <span className="size-6 shrink-0" />
                  </div>
                  <ul className="space-y-2.5 pt-1">
                    {recent.map((ride, index) => (
                      <li key={ride.id} className="flex items-center gap-1">
                        {/* The day, not a running number. Both said "which
                            row is this" and only one of them says anything
                            about the ride. */}
                        <span className="w-[46px] shrink-0 truncate text-xs text-muted-foreground">
                          {dayLabel(ride.localDate)}
                        </span>
                        <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-muted">
                          {/* Against 100, not against the hardest ride of the
                              month. Scaled to the local maximum, the top ride
                              always filled the track whether it scored 76 or
                              30 — and the band beside it already reads off a
                              0..100 scale, so the two were disagreeing on the
                              same line. A ride can score past 100; it clamps,
                              because the alternative is a bar that leaves the
                              track. */}
                          <span
                            className="block h-full rounded-[3px] bg-foreground"
                            style={{ width: `${Math.max(1.5, Math.min(100, ride.stress))}%` }}
                          />
                        </span>
                        {/* Padded to two digits so the column is a column:
                            right-aligned mono already lines the numbers up,
                            but a lone "1" beside a "73" read as a different
                            kind of value rather than a smaller one. */}
                        <span className="w-7 shrink-0 text-right font-mono text-sm font-semibold">
                          {number(ride.stress).padStart(2, "0")}
                        </span>
                        {/* The ride's own band, read off its score with the
                            same thresholds the index uses — an 80 is a
                            high-stress ride whether it is one ride or a
                            month's average of them. Fixed width so the column
                            holds still down the list; "Moderada" is the
                            longest it gets. */}
                        <span className="w-[92px] shrink-0">
                          {/* A chip and not bracketed text: the brackets were
                              doing the work of a container, and a shape does
                              it without spending two characters of a narrow
                              column. Muted ground with the name in the
                              foreground — the dot carries the band, because
                              three of the four band colours are unreadable as
                              type on a light card. */}
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2 pl-1.5 text-xs">
                            <span
                              aria-hidden
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                INTENSITY_BAR_CLASS[rideIntensityBand(ride.stress)]
                              )}
                            />
                            <span className="truncate">{dict.rideStress.bandShort[rideIntensityBand(ride.stress)]}</span>
                          </span>
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
              <p className="text-xs text-muted-foreground">{dict.rideStress.lifetimeLoad}</p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-sm font-semibold">
                {number(lifetimeTotals.stress)}
                {/* Neutral chip, not a band one: this is a reading and not a
                    state, and the coloured pills three sections up are a
                    different scale entirely. */}
                {lifetimeLoadPerHour != null && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {number(lifetimeLoadPerHour)} {dict.rideStress.loadPerHour}
                  </span>
                )}
              </p>
            </div>
          </div>
          {/* The two totals above can carry kilometres typed by hand; this one
              is only ever the rides Bikit has, so it says how many it counted
              rather than leaving the three to be read as one history. */}
          <p className="mt-4 text-xs text-muted-foreground">{dict.rideStress.ridesCounted(rides.length)}</p>

          {/* The way back into the explainer, at the foot of the last section
              rather than the top of the page: someone who has read the whole
              report is exactly who wants it, and someone who has not is still
              reading. Inside the card because it belongs to the report, not
              to the page — outside it floated next to the Strava mark, which
              is a credit and not a control. */}
          {/* Half each, capped at 150px: the two are the same kind of thing and
              a row where one is wider than the other says one of them matters
              more. `shrink` is passed on purpose — the Button base sets
              `shrink-0`, and tailwind-merge does not treat that as conflicting
              with `flex-1`, so the pair would keep a floor width and overflow
              the card on a narrow phone. */}
          <div className="mt-6 flex gap-2">
            <RideLoadHowItWorksButton
              labels={introLabels}
              buttonLabel={dict.rideStress.howItWorks}
              className="max-w-[150px] flex-1 shrink px-2"
            />
            <RideLoadFormulaButton
              labels={formulaLabels}
              buttonLabel={dict.rideStress.formula.button}
              className="max-w-[150px] flex-1 shrink px-2"
            />
          </div>
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
