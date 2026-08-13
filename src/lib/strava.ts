import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_OAUTH = "https://www.strava.com/oauth";

// Every cycling variant Strava distinguishes — an activity counts if either
// its (newer) sport_type or (older) type field matches one of these.
const CYCLING_TYPES = new Set([
  "Ride",
  "VirtualRide",
  "GravelRide",
  "MountainBikeRide",
  "EBikeRide",
  "Handcycle",
  "Velomobile",
]);

export function stravaAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    // activity:read_all so activities marked private still count (wear on a
    // component doesn't care whether the ride was shared publicly);
    // profile:read_all so GET /athlete actually includes the athlete's
    // registered bikes — without it the `bikes` field comes back empty.
    scope: "activity:read_all,profile:read_all",
  });
  return `${STRAVA_OAUTH}/authorize?${params.toString()}`;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number };
}

async function requestStravaToken(body: Record<string, string>): Promise<StravaTokenResponse> {
  const res = await fetch(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Strava token request failed: ${res.status}`);
  return res.json();
}

export function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  return requestStravaToken({ code, grant_type: "authorization_code" });
}

export interface StravaConnectionTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

/** Returns a usable access token, refreshing (and persisting the refresh)
 * first if the stored one is at or near expiry. Null if never connected. */
export async function getValidStravaAccessToken(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { data: connection } = await supabase
    .from("strava_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!connection) return null;

  return accessTokenForConnection(supabase, userId, connection);
}

/** Same as getValidStravaAccessToken for a connection row the caller already
 * has in hand — lets a caller that needs other columns of the row read it
 * once instead of paying a second round trip for the tokens. */
export async function accessTokenForConnection(
  supabase: SupabaseClient<Database>,
  userId: string,
  connection: StravaConnectionTokens
): Promise<string> {
  const expiresAt = new Date(connection.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60 * 1000) {
    return connection.access_token;
  }

  const refreshed = await requestStravaToken({
    refresh_token: connection.refresh_token,
    grant_type: "refresh_token",
  });
  await supabase
    .from("strava_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    })
    .eq("user_id", userId);
  return refreshed.access_token;
}

export interface StravaGear {
  id: string;
  name: string;
}

/** The athlete's bikes as registered on Strava — used to populate the gear
 * picker on a Bikit bike's edit page. */
export async function fetchStravaBikes(accessToken: string): Promise<StravaGear[]> {
  const res = await fetch(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const athlete = (await res.json()) as { bikes?: { id: string; name: string }[] };
  return (athlete.bikes ?? []).map((b) => ({ id: b.id, name: b.name }));
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds — what wear is counted from
  elapsed_time: number; // seconds — includes stops, so never the wear figure
  total_elevation_gain: number; // meters
  start_date: string; // ISO 8601, UTC (start_date_local is the wall clock)
  gear_id: string | null;
}

/** The stored shape of one activity, from either sync path. Everything past
 * the first four columns is for a ride history that does not exist yet: the
 * payload already carries it, so capturing it costs nothing, and a column
 * filled in later would start empty for every ride already synced. */
function activityRow(activity: StravaActivity, bikeId: string) {
  return {
    strava_activity_id: activity.id,
    bike_id: bikeId,
    distance_km: activity.distance / 1000,
    moving_time_hours: activity.moving_time / 3600,
    activity_date: activity.start_date ?? null,
    activity_name: activity.name ?? null,
    elevation_gain_m: activity.total_elevation_gain ?? null,
    elapsed_time_hours: activity.elapsed_time == null ? null : activity.elapsed_time / 3600,
  };
}

export async function fetchStravaActivity(accessToken: string, activityId: number): Promise<StravaActivity | null> {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export function isCyclingActivity(activity: StravaActivity): boolean {
  return CYCLING_TYPES.has(activity.sport_type) || CYCLING_TYPES.has(activity.type);
}

/** A "synced" result carries the bike it landed on and how much it moved, so
 * the caller can notify without re-reading the bike. */
export type SyncActivityResult =
  | { status: "skipped" | "duplicate" | "error" }
  | { status: "synced"; bikeId: string; bikeName: string; distanceKm: number; movingHours: number };

/** Records one Strava activity against the Bikit bike its gear maps to.
 * Idempotent via the unique key on strava_activity_id — safe to call for an
 * activity that's already been synced (by the webhook or a prior cron pass).
 * Used by both the webhook (fast path) and the reconciliation cron
 * (fallback for anything the webhook missed). */
export async function syncActivityToBike(
  admin: SupabaseClient<Database>,
  userId: string,
  activity: StravaActivity
): Promise<SyncActivityResult> {
  if (!activity.gear_id || !isCyclingActivity(activity)) return { status: "skipped" };

  const { data: bike } = await admin
    .from("bikes")
    .select("id, name, total_km, total_hours")
    .eq("strava_gear_id", activity.gear_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!bike) return { status: "skipped" };

  const distanceKm = activity.distance / 1000;
  const movingHours = activity.moving_time / 3600;

  const { error: insertError } = await admin.from("strava_activities").insert(activityRow(activity, bike.id));
  if (insertError) {
    if (insertError.code === "23505") return { status: "duplicate" };
    console.error("[strava] failed to record activity", activity.id, insertError.message);
    return { status: "error" };
  }

  await admin
    .from("bikes")
    .update({
      total_km: (bike.total_km ?? 0) + distanceKm,
      total_hours: (bike.total_hours ?? 0) + movingHours,
    })
    .eq("id", bike.id);

  return { status: "synced", bikeId: bike.id, bikeName: bike.name, distanceKm, movingHours };
}

/** Batch equivalent of syncActivityToBike for a whole list of activities, used
 * by the manual "Reload" button. Per activity the single-activity path costs
 * three sequential round trips (find the bike, insert, bump the bike's
 * totals); over a 30-day window that's what made the button feel slow. This
 * spends four regardless of how many activities came back: one to load the
 * athlete's gear-linked bikes, one insert for all of them, and one update per
 * bike whose totals actually moved. Returns how many were newly recorded. */
export async function syncActivitiesToBikes(
  admin: SupabaseClient<Database>,
  userId: string,
  activities: StravaActivity[]
): Promise<number> {
  const { data: bikes } = await admin
    .from("bikes")
    .select("id, total_km, total_hours, strava_gear_id")
    .eq("user_id", userId)
    .not("strava_gear_id", "is", null);
  if (!bikes?.length) return 0;

  const bikeByGear = new Map(bikes.map((bike) => [bike.strava_gear_id, bike]));

  // Anything without a gear-linked bike is dropped here rather than costing a
  // query, which is most of a busy athlete's activities.
  const rows = new Map(
    activities.flatMap((activity) => {
      const bike = activity.gear_id ? bikeByGear.get(activity.gear_id) : undefined;
      if (!bike || !isCyclingActivity(activity)) return [];
      return [[activity.id, activityRow(activity, bike.id)] as const];
    })
  );
  if (rows.size === 0) return 0;

  // ON CONFLICT DO NOTHING ... RETURNING: what comes back is exactly what this
  // call inserted, so an activity the webhook already recorded is never added
  // to a bike's totals twice — same idempotency the single-activity path gets
  // from the primary key on strava_activity_id.
  const { data: inserted, error } = await admin
    .from("strava_activities")
    .upsert([...rows.values()], { onConflict: "strava_activity_id", ignoreDuplicates: true })
    .select("bike_id, distance_km, moving_time_hours");
  if (error) {
    console.error("[strava] failed to record activities", error.message);
    return 0;
  }
  if (!inserted?.length) return 0;

  const deltaByBike = new Map<string, { km: number; hours: number }>();
  for (const row of inserted) {
    const delta = deltaByBike.get(row.bike_id) ?? { km: 0, hours: 0 };
    delta.km += row.distance_km ?? 0;
    delta.hours += row.moving_time_hours ?? 0;
    deltaByBike.set(row.bike_id, delta);
  }

  await Promise.all(
    [...deltaByBike].map(([bikeId, delta]) => {
      const bike = bikes.find((b) => b.id === bikeId)!;
      return admin
        .from("bikes")
        .update({
          total_km: (bike.total_km ?? 0) + delta.km,
          total_hours: (bike.total_hours ?? 0) + delta.hours,
        })
        .eq("id", bikeId);
    })
  );

  return inserted.length;
}

const STRAVA_WEBHOOK_CALLBACK = "https://www.bikit.app/api/strava/webhook";

/** Confirms our push subscription still exists and points at the right
 * callback. Strava gives no delivery log, so this is the only way to catch
 * a subscription that silently stopped forwarding events — logs loudly on
 * mismatch so it shows up in Vercel's runtime logs. */
export async function checkStravaSubscriptionHealth(): Promise<void> {
  try {
    const res = await fetch(
      `${STRAVA_API}/push_subscriptions?client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}`
    );
    const subs: { callback_url: string }[] = res.ok ? await res.json() : [];
    const healthy = subs.some((s) => s.callback_url === STRAVA_WEBHOOK_CALLBACK);
    if (!healthy) {
      console.error("[strava] push subscription missing or misconfigured", JSON.stringify(subs));
    }
  } catch (e) {
    console.error("[strava] failed to check push subscription health", e);
  }
}
