import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
import { formatDate, formatDistance, formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { BikeIcon } from "@/components/bike-icon";
import { ProAddBikeButton } from "@/components/pro-bike-actions";
import { ProRiderDelete } from "@/components/pro-rider-delete";
import { ProTrackDelete } from "@/components/pro-track-delete";
import { groupBikeSetups, type BikeSetupRow } from "@/lib/imu/bike-setups";
import { isSetupValues } from "@/lib/imu/setup";

/**
 * Bikit Pro: the account's bikes (2026-09-24), the app's own list without
 * its verdicts — no health badge, no Ride Load: here a bike is the thing
 * the sensor rode on, and its page under Pro is its setups. Same cards,
 * same order (most recently ridden first), same totals. A bike can be
 * added here too, in a short form (2026-10-27, ProAddBikeButton).
 *
 * Three tabs since 2026-11-15, by importance (by request): the bikes, the
 * riders — the names written on the sessions, not records of their own —
 * and the timed tracks, each a card with its runs, opening its editor.
 * The tab rides the address (`?tab=riders`, `?tab=pistas`).
 */
type FleetTab = "bikes" | "riders" | "tracks";
const TAB_PARAM: Record<FleetTab, string | null> = {
  bikes: null,
  riders: "riders",
  tracks: "pistas",
};

export default async function ProBikesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab: FleetTab =
    tabParam === "riders"
      ? "riders"
      : tabParam === "pistas"
        ? "tracks"
        : "bikes";
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

  const [
    { data: bikes },
    { data: sessions },
    { data: setupRows },
    { data: trackRows },
  ] = await Promise.all([
    supabase
      .from("bikes")
      .select("id, name, type, brand, model, year, total_km, total_hours")
      .eq("user_id", userId)
      .order("usage_updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("imu_sessions")
      .select("id, name, bike_id, setup_id, created_at, rider_name, track_id")
      .eq("user_id", userId),
    supabase
      .from("imu_setups")
      .select("id, bike_id, values, note, name, created_at")
      .eq("user_id", userId),
    supabase
      .from("imu_tracks")
      .select("id, name, reference_session_id")
      .eq("user_id", userId),
  ]);

  // The riders: the names written on the sessions, each once, with how
  // many sessions, on how many bikes, and the last of them.
  const riderMap = new Map<
    string,
    { name: string; sessions: number; bikes: Set<string>; last: string }
  >();
  for (const s of sessions ?? []) {
    const name = s.rider_name?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const r = riderMap.get(key) ?? {
      name,
      sessions: 0,
      bikes: new Set<string>(),
      last: s.created_at,
    };
    r.sessions++;
    if (s.bike_id) r.bikes.add(s.bike_id);
    if (s.created_at > r.last) r.last = s.created_at;
    riderMap.set(key, r);
  }
  const riders = [...riderMap.values()].sort(
    (a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name),
  );
  // The tracks, with the runs kept on each (migration 00059).
  const runsOn = new Map<string, number>();
  for (const s of sessions ?? [])
    if (s.track_id) runsOn.set(s.track_id, (runsOn.get(s.track_id) ?? 0) + 1);
  const tracks = (trackRows ?? [])
    .map((t) => ({ ...t, runs: runsOn.get(t.id) ?? 0 }))
    .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
  const sessionCount = new Map<string, number>();
  for (const s of sessions ?? [])
    if (s.bike_id)
      sessionCount.set(s.bike_id, (sessionCount.get(s.bike_id) ?? 0) + 1);
  // Each bike's setups counted as its page lists them (groupBikeSetups):
  // the distinct ones its sessions rode on, and the upcoming one
  // (2026-10-27, beside the sessions).
  const setupCount = new Map<string, number>();
  for (const bike of bikes ?? []) {
    const rows: BikeSetupRow[] = (setupRows ?? [])
      .filter((r) => r.bike_id === bike.id && isSetupValues(r.values))
      .map((r) => ({
        id: r.id,
        values: r.values as never,
        note: r.note,
        name: r.name,
        createdAt: r.created_at,
      }));
    const bikeSessions = (sessions ?? [])
      .filter((x) => x.bike_id === bike.id)
      .map((x) => ({
        id: x.id,
        name: x.name,
        setupId: x.setup_id,
        createdAt: x.created_at,
      }));
    setupCount.set(bike.id, groupBikeSetups(rows, bikeSessions).length);
  }

  return (
    <div className="pt-4 sm:pt-8">
      {/* The tabs, by importance (2026-11-15). */}
      <nav className="mb-6 inline-flex rounded-full bg-muted p-1">
        {(Object.keys(TAB_PARAM) as FleetTab[]).map((key) => (
          <Link
            key={key}
            href={
              TAB_PARAM[key]
                ? `/pro/bicicletas?tab=${TAB_PARAM[key]}`
                : "/pro/bicicletas"
            }
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
              tab === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.report.bikes.tabs[key]}
          </Link>
        ))}
      </nav>
      {/* The title on the left, "Adicionar bicicleta" in the top-right
          corner (by request, 2026-10-27) — on the bikes' tab. */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">
            {t.report.bikes.tabs[tab]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "bikes"
              ? dict.bikes.fleetCount(bikes?.length ?? 0)
              : tab === "riders"
                ? t.report.bikes.riderCount(riders.length)
                : t.report.bikes.trackCount(tracks.length)}
          </p>
        </div>
        {tab === "bikes" && <ProAddBikeButton />}
      </div>

      {tab === "riders" ? (
        riders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.report.bikes.noRiders}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {riders.map((r) => (
              <div
                key={r.name}
                className={`flex h-full flex-col rounded-lg bg-card p-5 ${DARK_CARD_HAIRLINE}`}
              >
                {/* The name, and "Delete" in the corner (2026-11-15). */}
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 font-display text-[20px] font-bold">
                    {r.name}
                  </h2>
                  <div className="-mt-2 -mr-2">
                    <ProRiderDelete name={r.name} sessions={r.sessions} />
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t.report.bikes.lastRide(formatDate(r.last, locale))}
                </p>
                <p className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-4 text-sm font-semibold tabular-nums">
                  <span>{t.common.session(r.sessions)}</span>
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                  <span>{t.report.bikes.bikeCount(r.bikes.size)}</span>
                </p>
              </div>
            ))}
          </div>
        )
      ) : tab === "tracks" ? (
        tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.report.bikes.noTracks}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((track) => (
              // A card, not a link (2026-11-15): "Delete" in its corner,
              // and "View more" opens the editor, on the run its lines
              // were drawn from.
              <div
                key={track.id}
                className={`flex h-full flex-col rounded-lg bg-card p-5 ${DARK_CARD_HAIRLINE}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 font-display text-[20px] font-bold">
                    {track.name}
                  </h2>
                  <div className="-mt-2 -mr-2">
                    <ProTrackDelete
                      trackId={track.id}
                      name={track.name}
                      runs={track.runs}
                    />
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <p className="text-sm font-semibold tabular-nums">
                    {t.report.bikes.runCount(track.runs)}
                  </p>
                  {track.reference_session_id && (
                    <Link
                      href={`/pro/sessoes/${track.reference_session_id}/pista?pista=${track.id}`}
                      className="flex h-11 shrink-0 items-center justify-center rounded-full bg-muted px-4 text-sm font-semibold transition-colors hover:bg-muted/70"
                    >
                      {dict.bikes.viewBike}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : !bikes || bikes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.report.bikes.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bikes.map((bike) => {
            const count = sessionCount.get(bike.id) ?? 0;
            const hasUsage = bike.total_km != null || bike.total_hours != null;
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
                  {[bike.type, bike.brand, bike.model, bike.year]
                    .filter(Boolean)
                    .join(" · ") || dict.bikes.noDetailsYet}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold text-foreground tabular-nums">
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
                        app's totals: how many sessions rode on it, and on
                        how many setups. The dot only between two things —
                        a bike without totals began with a stray one. */}
                    {hasUsage && (
                      <span aria-hidden className="text-muted-foreground">
                        ·
                      </span>
                    )}
                    <span className="whitespace-nowrap">
                      {t.common.session(count)}
                    </span>
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                    <span className="whitespace-nowrap">
                      {t.common.setup(setupCount.get(bike.id) ?? 0)}
                    </span>
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
