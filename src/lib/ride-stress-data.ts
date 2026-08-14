import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { scoreRides, type RideStressActivity, type ScoredRide } from "@/lib/ride-stress";

/**
 * The one place that turns strava_activities rows into scored rides.
 *
 * Both readers — the figure on the bike page and the report behind it — go
 * through here, so they cannot drift into showing two different numbers for
 * the same bike. Same reason profiles.ts and component-intervals.ts have to be
 * kept aligned by hand, except this time there is only one of them.
 *
 * Rows without a date are dropped rather than assumed: the intensity chain is
 * an ordered walk, and a ride with no place in the order has no place in it.
 * After the 2026-08-14 backfill there are none, and nothing writes one — the
 * guard is here because a row that predates 00033 would otherwise sort as the
 * Unix epoch and hold the whole chain back thirty years.
 */
export async function loadScoredRides(
  supabase: SupabaseClient<Database>,
  bikeId: string,
  bikeType: string | null
): Promise<ScoredRide[]> {
  const { data } = await supabase
    .from("strava_activities")
    .select("strava_activity_id, activity_name, activity_date, utc_offset, distance_km, moving_time_hours, elapsed_time_hours, elevation_gain_m")
    .eq("bike_id", bikeId)
    .not("activity_date", "is", null)
    .order("activity_date", { ascending: true });

  const activities: RideStressActivity[] = (data ?? []).map((row) => ({
    id: row.strava_activity_id,
    name: row.activity_name,
    date: row.activity_date as string,
    utcOffsetSeconds: row.utc_offset,
    distanceKm: row.distance_km,
    movingHours: row.moving_time_hours,
    elapsedHours: row.elapsed_time_hours,
    elevationM: row.elevation_gain_m,
  }));

  return scoreRides(activities, bikeType);
}
