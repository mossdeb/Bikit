import { createAdminClient } from "@/lib/supabase/admin";
import { checkStravaSubscriptionHealth, getValidStravaAccessToken, STRAVA_ENABLED, syncActivityToBike, type StravaActivity } from "@/lib/strava";
import { sendStravaSyncPush, type SyncedBike } from "@/lib/push";

export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 3;

// Safety net for the Strava webhook: fetches each connected user's recent
// activities directly and backfills anything the webhook never delivered.
// Runs daily, so a silent webhook outage self-heals within a day instead of
// permanently losing rides.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!STRAVA_ENABLED) return Response.json({ skipped: "strava-disabled" });

  await checkStravaSubscriptionHealth();

  const admin = createAdminClient();
  const { data: connections, error } = await admin.from("strava_connections").select("user_id");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const after = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86_400;
  let synced = 0;

  for (const connection of connections ?? []) {
    const accessToken = await getValidStravaAccessToken(admin, connection.user_id);
    if (!accessToken) continue;

    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      console.error("[strava sync] failed to list activities for user", connection.user_id, res.status);
      continue;
    }

    const activities: StravaActivity[] = await res.json();
    // Three days of backfill can be several rides on the same bike; they're
    // rolled up per bike so the rider gets one notification saying how much
    // the bike moved, not one per ride.
    const byBike = new Map<string, SyncedBike>();
    for (const activity of activities) {
      const result = await syncActivityToBike(admin, connection.user_id, activity);
      if (result.status !== "synced") continue;
      synced += 1;
      const entry = byBike.get(result.bikeId) ?? { id: result.bikeId, name: result.bikeName, km: 0, hours: 0 };
      entry.km += result.distanceKm;
      entry.hours += result.movingHours;
      byBike.set(result.bikeId, entry);
    }

    await sendStravaSyncPush(admin, connection.user_id, [...byBike.values()]);
  }

  return Response.json({ synced });
}
