import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { formatDistance } from "@/lib/format";
import { sendPushToUser } from "@/lib/push";
import { sendHardRideEmail } from "@/lib/email";
import {
  activityRideStress,
  isHardRide,
  modalityFor,
  type RideStressActivity,
} from "@/lib/ride-stress";

/**
 * The hard-ride alert: one ride, scored on its own, announced once per channel.
 *
 * This is the first notification in the app that is not about maintenance.
 * Nothing here touches a service interval, a component or a health band — a
 * hard ride is not a fault and must never read as one, which is why it has its
 * own copy, its own footer and its own switches rather than borrowing the
 * maintenance ones.
 *
 * It fires on the ride and not on the index. The 0–100 index decays on its own,
 * so a band that moves is not evidence that anything happened; a ride that
 * scores in the top band is. That also makes the alert impossible to trigger by
 * sitting still, which is the property the maintenance alerts get for free and
 * this one had to be designed for.
 *
 * The claim is a conditional update on the ride's own row rather than a ledger
 * entry: `set ... where ... is null returning *` is atomic by itself, so of two
 * callers racing on the same ride exactly one gets a row back and sends. The
 * interval ledger needed an RPC because many rides touch one interval; a ride
 * is announced once and never again.
 */

/** A ride, with the bits both channels need to talk about it. */
export interface HardRideCandidate {
  stravaActivityId: number;
  bikeId: string;
  bikeName: string;
  bikeType: string | null;
  activity: RideStressActivity;
}

export type HardRideChannel = "push" | "email";

const CLAIM_COLUMN: Record<HardRideChannel, "hard_ride_push_at" | "hard_ride_email_at"> = {
  push: "hard_ride_push_at",
  email: "hard_ride_email_at",
};

/**
 * Takes the ride for one channel, or reports that somebody else already had it.
 *
 * Claim before sending, like the maintenance path: read-then-write would let
 * the webhook and the cron both decide nothing had gone out yet and send twice.
 */
async function claimRide(
  admin: SupabaseClient<Database>,
  stravaActivityId: number,
  channel: HardRideChannel
): Promise<boolean> {
  const column = CLAIM_COLUMN[channel];
  const stamp = new Date().toISOString();
  // Written out per channel rather than with a computed key: a computed key
  // widens the literal to a string index signature, which the generated table
  // types reject outright. Two branches are cheaper than casting the types
  // away on a write.
  const patch = channel === "push" ? { hard_ride_push_at: stamp } : { hard_ride_email_at: stamp };
  const { data } = await admin
    .from("strava_activities")
    .update(patch)
    .eq("strava_activity_id", stravaActivityId)
    .is(column, null)
    .select("strava_activity_id");
  return (data?.length ?? 0) > 0;
}

/** Hands the ride back when the send failed, so the next pass can try again
 * rather than leaving the ride looking announced. Same reasoning as
 * `release_interval_notification` on the maintenance side. */
async function releaseRide(
  admin: SupabaseClient<Database>,
  stravaActivityId: number,
  channel: HardRideChannel
): Promise<void> {
  const patch = channel === "push" ? { hard_ride_push_at: null } : { hard_ride_email_at: null };
  await admin.from("strava_activities").update(patch).eq("strava_activity_id", stravaActivityId);
}

/** True when this ride is worth announcing at all — the pure test, so callers
 * can skip the work of looking up a user for a ride that will say nothing. */
export function qualifies(candidate: HardRideCandidate): boolean {
  return isHardRide(candidate.activity, modalityFor(candidate.bikeType));
}

/**
 * The push half, called from the Strava webhook seconds after a ride lands.
 *
 * Never throws at the caller: it runs inside the webhook's `after()`, and a
 * failure here should cost a notification, not a 200 to Strava.
 */
export async function notifyHardRidePush(
  admin: SupabaseClient<Database>,
  userId: string,
  candidate: HardRideCandidate
): Promise<void> {
  try {
    if (!qualifies(candidate)) return;

    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const meta = userData.user?.user_metadata ?? {};
    // Opt-out, like the maintenance pushes: a push about the ride you just
    // finished is timely and about something you did. The email counterpart is
    // opt-in, because an email is a record rather than a moment.
    if (((meta.push_hard_ride as boolean) ?? true) === false) return;

    const locale = localeFromMetadata(meta);
    const dict = getDictionary(locale);
    const distanceUnit = ((meta.distance_unit as string) ?? "km") as "km" | "mi";
    const { stress } = activityRideStress(candidate.activity, modalityFor(candidate.bikeType));
    const score = Math.round(stress);

    if (!(await claimRide(admin, candidate.stravaActivityId, "push"))) return;

    let delivered = false;
    try {
      delivered = await sendPushToUser(admin, userId, {
        title: dict.email.hardRide.heading,
        body: dict.email.hardRide.body(
          candidate.bikeName,
          score,
          formatDistance(candidate.activity.distanceKm, distanceUnit, locale)
        ),
        url: `/bikes/${candidate.bikeId}/ride-load`,
        // Tagged by ride, not by bike: two hard rides in a day are two pieces
        // of news, and the second replacing the first would hide one.
        tag: `hard-ride:${candidate.stravaActivityId}`,
      });
    } catch (e) {
      console.error("[notify-hard-ride] push send threw", e);
    }

    if (!delivered) await releaseRide(admin, candidate.stravaActivityId, "push");
  } catch (e) {
    console.error("[notify-hard-ride] failed", e);
  }
}

/**
 * The email half, called from the daily cron for rides that landed since the
 * last pass.
 *
 * Returns the number of emails actually sent, so the cron can report it the
 * way it reports the maintenance ones.
 */
export async function notifyHardRideEmail(
  admin: SupabaseClient<Database>,
  userId: string,
  email: string,
  meta: Record<string, unknown>,
  candidates: HardRideCandidate[]
): Promise<number> {
  // Opt-in, and off by default. The push already carries this news; an email
  // is the reader asking for a copy, and this project does not add inbox
  // traffic that nobody asked for.
  if (((meta.notify_hard_ride as boolean) ?? false) === false) return 0;

  const locale = localeFromMetadata(meta);
  const distanceUnit = ((meta.distance_unit as string) ?? "km") as "km" | "mi";
  let sent = 0;

  for (const candidate of candidates) {
    if (!qualifies(candidate)) continue;
    const { stress } = activityRideStress(candidate.activity, modalityFor(candidate.bikeType));

    if (!(await claimRide(admin, candidate.stravaActivityId, "email"))) continue;

    let delivered = false;
    try {
      delivered = await sendHardRideEmail({
        to: email,
        locale,
        bikeName: candidate.bikeName,
        score: Math.round(stress),
        distance: formatDistance(candidate.activity.distanceKm, distanceUnit, locale),
        rideLoadUrl: `/bikes/${candidate.bikeId}/ride-load`,
      });
    } catch (e) {
      console.error("[notify-hard-ride] email send threw", e);
    }

    if (delivered) {
      sent += 1;
      await admin.from("notification_log").insert({
        user_id: userId,
        type: "hard_ride",
        channel: "email",
      });
    } else {
      await releaseRide(admin, candidate.stravaActivityId, "email");
    }
  }

  return sent;
}
