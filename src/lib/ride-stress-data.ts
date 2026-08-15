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
    .select("strava_activity_id, activity_name, activity_date, utc_offset, distance_km, moving_time_hours, elapsed_time_hours, elevation_gain_m, elev_high_m, elev_low_m")
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
    // Null unless Strava gave both ends of the ride; rideVerticalM falls back
    // to the climb when it did not.
    elevationRangeM:
      row.elev_high_m != null && row.elev_low_m != null ? row.elev_high_m - row.elev_low_m : null,
  }));

  return scoreRides(activities, bikeType);
}

/**
 * The same reading for a whole list of bikes, in one round trip.
 *
 * The bike list and the dashboard show a card per bike, and calling
 * `loadScoredRides` in a loop would have been one query per card — the shape
 * this page already refuses for health, which reads every interval row once
 * and groups them in memory. `.in(...)` on `bike_id` is served by the
 * `(bike_id, activity_date desc)` index the 00033 migration added.
 *
 * Scoring stays per bike because it has to: the chain is an ordered walk and
 * the weights come from the bike's own type, so two bikes' rides can never be
 * scored as one sequence.
 */
export async function loadScoredRidesForBikes(
  supabase: SupabaseClient<Database>,
  bikes: { id: string; type: string | null }[]
): Promise<Map<string, ScoredRide[]>> {
  const byBike = new Map<string, ScoredRide[]>();
  if (bikes.length === 0) return byBike;

  const { data } = await supabase
    .from("strava_activities")
    .select("bike_id, strava_activity_id, activity_name, activity_date, utc_offset, distance_km, moving_time_hours, elapsed_time_hours, elevation_gain_m, elev_high_m, elev_low_m")
    .in("bike_id", bikes.map((bike) => bike.id))
    .not("activity_date", "is", null)
    .order("activity_date", { ascending: true });

  // Grouped before scoring, so each bike's rides reach `scoreRides` in the
  // ascending order the single-bike reader gives it. One shared `order` is
  // what makes that true for all of them at once.
  const rowsByBike = new Map<string, RideStressActivity[]>();
  for (const row of data ?? []) {
    if (!row.bike_id) continue;
    const list = rowsByBike.get(row.bike_id) ?? [];
    list.push({
      id: row.strava_activity_id,
      name: row.activity_name,
      date: row.activity_date as string,
      utcOffsetSeconds: row.utc_offset,
      distanceKm: row.distance_km,
      movingHours: row.moving_time_hours,
      elapsedHours: row.elapsed_time_hours,
      elevationM: row.elevation_gain_m,
      elevationRangeM:
        row.elev_high_m != null && row.elev_low_m != null ? row.elev_high_m - row.elev_low_m : null,
    });
    rowsByBike.set(row.bike_id, list);
  }

  for (const bike of bikes) {
    byBike.set(bike.id, scoreRides(rowsByBike.get(bike.id) ?? [], bike.type));
  }
  return byBike;
}
