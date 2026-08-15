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

/** The scope that lets the app write back to an activity. Asked for on its
 * own, never at first connect: it reads on the consent screen as permission
 * to modify the athlete's activities, which is a lot to ask of someone who
 * only wants their kilometres imported. */
export const STRAVA_WRITE_SCOPE = "activity:write";

// activity:read_all so activities marked private still count (wear on a
// component doesn't care whether the ride was shared publicly);
// profile:read_all so GET /athlete actually includes the athlete's
// registered bikes — without it the `bikes` field comes back empty.
const STRAVA_READ_SCOPES = "activity:read_all,profile:read_all";

export function stravaAuthorizeUrl(redirectUri: string, options?: { write?: boolean }): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    // "force" when the ask is wider than last time: with "auto" Strava may
    // return an already-granted authorisation without ever showing the new
    // scope, and the app would be told it had a permission nobody granted.
    approval_prompt: options?.write ? "force" : "auto",
    scope: options?.write ? `${STRAVA_READ_SCOPES},${STRAVA_WRITE_SCOPE}` : STRAVA_READ_SCOPES,
  });
  return `${STRAVA_OAUTH}/authorize?${params.toString()}`;
}

/** Whether a stored connection may write. Null scopes means a connection made
 * before the column existed, which by definition never asked for write. */
export function hasStravaWriteScope(scopes: string | null | undefined): boolean {
  return (scopes ?? "").split(",").includes(STRAVA_WRITE_SCOPE);
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
  total_elevation_gain: number; // meters CLIMBED — a shuttled descent has none
  elev_high?: number; // meters; only on the detailed activity
  elev_low?: number;
  start_date: string; // ISO 8601, UTC (start_date_local is the wall clock)
  utc_offset?: number; // seconds east of UTC — how far the rider's clock was from start_date
  gear_id: string | null;
}

/** The stored shape of one activity, from either sync path. Everything past
 * the first four columns is what Ride Stress reads: the payload already
 * carries it, so capturing it costs nothing, and a column filled in later
 * would start empty for every ride already synced. */
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
    sport_type: activity.sport_type ?? activity.type ?? null,
    utc_offset: activity.utc_offset ?? null,
    elev_high_m: activity.elev_high ?? null,
    elev_low_m: activity.elev_low ?? null,
  };
}

export async function fetchStravaActivity(accessToken: string, activityId: number): Promise<StravaActivity | null> {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Adds `note` to the end of an activity's description ("Como correu?"),
 * keeping whatever the athlete wrote.
 *
 * Read-then-write, because the API has no append and the field is a single
 * free-text box that belongs to the rider — replacing it would delete their
 * words. That leaves a race with the athlete typing in the Strava app at the
 * same moment, which is likely: this runs seconds after the ride lands. The
 * window is one round trip and there is no conditional write to close it
 * with, so the read is made as late as possible and nothing else is touched.
 *
 * Requires activity:write. A connection without it gets 401/403, which is
 * reported rather than retried — the fix is the athlete re-authorising, not
 * another call.
 */
export async function appendActivityDescription(
  accessToken: string,
  activityId: number,
  note: string
): Promise<boolean> {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error("[strava] cannot read activity before writing note", activityId, res.status);
    return false;
  }
  const current = ((await res.json()) as { description?: string | null }).description ?? "";

  // A retried webhook would otherwise stack the same paragraph twice.
  if (current.includes(note)) return true;

  const description = current.trim() ? `${current.trimEnd()}\n\n${note}` : note;
  const update = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  if (!update.ok) {
    console.error("[strava] failed to write note to activity", activityId, update.status);
    return false;
  }
  return true;
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
