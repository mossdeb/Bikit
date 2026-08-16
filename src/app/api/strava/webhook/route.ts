import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchStravaActivity,
  getValidStravaAccessToken,
  rideStressActivityOf,
  syncActivityToBike,
} from "@/lib/strava";
import { sendStravaSyncPush } from "@/lib/push";
import { notifyUsageServicesForBike } from "@/lib/maintenance/notify-usage";
import { notifyHardRidePush } from "@/lib/maintenance/notify-hard-ride";

export const dynamic = "force-dynamic";

// One-time handshake Strava performs when the push subscription is created —
// echoes hub.challenge back only if hub.verify_token matches our secret.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN && challenge) {
    return Response.json({ "hub.challenge": challenge });
  }
  return Response.json({ error: "Invalid verify token" }, { status: 403 });
}

// A new activity was created on Strava. We only care about rides logged
// against a gear that's mapped to one of our bikes.
export async function POST(request: Request) {
  const event = await request.json();

  if (event.object_type !== "activity" || event.aspect_type !== "create") {
    return Response.json({ ok: true });
  }

  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("strava_connections")
    .select("user_id")
    .eq("athlete_id", event.owner_id)
    .maybeSingle();
  if (!connection) return Response.json({ ok: true });

  const accessToken = await getValidStravaAccessToken(admin, connection.user_id);
  if (!accessToken) {
    console.error("[strava webhook] no valid access token for user", connection.user_id);
    return Response.json({ ok: true });
  }

  const activity = await fetchStravaActivity(accessToken, event.object_id);
  if (!activity) {
    console.error("[strava webhook] failed to fetch activity", event.object_id);
    return Response.json({ ok: true });
  }

  const result = await syncActivityToBike(admin, connection.user_id, activity);
  if (result.status === "error") {
    console.error("[strava webhook] failed to sync activity", activity.id);
  }
  if (result.status === "synced") {
    const { bikeId, bikeName, bikeType, distanceKm, movingHours } = result;
    const userId = connection.user_id;
    // Everything that notifies runs after the response. Strava expects a
    // prompt 200 and retries when it doesn't get one — a retry would re-run
    // the fetch and the sync, so waiting here on push delivery to Apple or
    // Google is a way to be handed the same ride twice. The activity itself
    // is already written by this point, which is the part worth blocking for.
    after(async () => {
      await sendStravaSyncPush(admin, userId, [
        { id: bikeId, name: bikeName, km: distanceKm, hours: movingHours },
      ]);
      // The ride just moved this bike's totals, so any km or hours reminder
      // it pushed into a worse band is news now rather than at 08:00 UTC.
      // The activity id travels with it because this is the one moment the
      // alert can be written into the ride that caused it.
      await notifyUsageServicesForBike(admin, userId, bikeId, activity.id);
      // Last, and on purpose: a maintenance alert is the one that asks for
      // something to be done, and it should not queue behind a remark about
      // how hard the ride was. This one is not maintenance at all — it never
      // touches an interval, and it fires on the ride rather than on the
      // index, which decays and would otherwise announce a fall nobody caused.
      await notifyHardRidePush(admin, userId, {
        stravaActivityId: activity.id,
        bikeId,
        bikeName,
        bikeType,
        activity: rideStressActivityOf(activity),
      });
    });
  }

  return Response.json({ ok: true });
}
