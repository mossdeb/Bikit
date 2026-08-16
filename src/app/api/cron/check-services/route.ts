import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateComponentStatus,
  selectActiveInterval,
  type NamedIntervalStatusInput,
} from "@/lib/maintenance/calculation";
import { healthPercent, classifyHealth } from "@/lib/maintenance/health";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { formatDate, formatDistance, formatHours } from "@/lib/format";
import { sendDueSoonEmail, sendOverdueEmail, sendWeeklySummaryEmail, type WeeklySummaryItem } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import { notifyHardRideEmail } from "@/lib/maintenance/notify-hard-ride";

export const dynamic = "force-dynamic";

const WEEKLY_SUMMARY_MIN_GAP_DAYS = 6;

/** How far back the hard-ride email sweep looks. Two days and not one, so a
 * cron run that fails or is skipped does not silently drop yesterday's rides;
 * and not thirty, because the claim column stays null while the switch is off
 * and a wide window would turn "enable this" into a mailshot of old rides. */
const HARD_RIDE_EMAIL_LOOKBACK_DAYS = 2;

type NotifyLevel = "attention" | "critical";
/** Only a move to a *worse* band is news. */
const LEVEL_RANK: Record<NotifyLevel, number> = { attention: 1, critical: 2 };
const CHANNELS = ["email", "push"] as const;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const sent: string[] = [];
  const isWeeklySummaryDay = new Date().getUTCDay() === 1; // Monday

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data: userPage, error: usersError } = await admin.auth.admin.listUsers({ page, perPage });
    if (usersError) {
      return Response.json({ error: usersError.message }, { status: 500 });
    }

    for (const user of userPage.users) {
      const meta = user.user_metadata ?? {};
      const notifyDueSoon = (meta.notify_due_soon as boolean) ?? true;
      const notifyOverdue = (meta.notify_overdue as boolean) ?? true;
      const notifyWeeklySummary = (meta.notify_weekly_summary as boolean) ?? false;
      // Opt-in and off by default: the push already carries this news within
      // seconds of the ride, so the email is a copy somebody asked for.
      const notifyHardRide = (meta.notify_hard_ride as boolean) ?? false;
      const pushDueSoon = (meta.push_due_soon as boolean) ?? true;
      const pushOverdue = (meta.push_overdue as boolean) ?? true;
      // Email needs an address; push doesn't, so an account with every email
      // toggle off still has to be processed for its push notifications.
      const wantsEmail = !!user.email && (notifyDueSoon || notifyOverdue || notifyWeeklySummary);
      // The hard-ride email is its own reason to process an account: it is not
      // a maintenance alert, so somebody who turned every maintenance switch
      // off and this one on must not be skipped here.
      const wantsHardRideEmail = !!user.email && notifyHardRide;
      if (!wantsEmail && !wantsHardRideEmail && !pushDueSoon && !pushOverdue) continue;

      const locale = localeFromMetadata(meta);
      const dict = getDictionary(locale);
      const distanceUnit = ((meta.distance_unit as string) ?? "km") as "km" | "mi";

      // `type` for the Ride Load modality, which is what scores a hard ride.
      const { data: bikes } = await admin
        .from("bikes")
        .select("id, name, type, total_km, total_hours")
        .eq("user_id", user.id);
      const bikeById = new Map((bikes ?? []).map((b) => [b.id, b]));
      if (bikeById.size === 0) continue;

      // The hard-ride emails, before the maintenance pass and independent of
      // it. Only rides from the last couple of days: the claim column stays
      // null while the switch is off, so without a window turning the switch
      // on would email every hard ride the account ever had.
      if (wantsHardRideEmail && user.email) {
        const since = new Date(Date.now() - HARD_RIDE_EMAIL_LOOKBACK_DAYS * 86_400_000).toISOString();
        const { data: pendingRides } = await admin
          .from("strava_activities")
          .select(
            "strava_activity_id, bike_id, activity_name, activity_date, utc_offset, distance_km, moving_time_hours, elapsed_time_hours, elevation_gain_m, elev_high_m, elev_low_m"
          )
          .in("bike_id", [...bikeById.keys()])
          .is("hard_ride_email_at", null)
          .not("activity_date", "is", null)
          .gte("activity_date", since);

        const candidates = (pendingRides ?? []).flatMap((row) => {
          const bike = bikeById.get(row.bike_id);
          if (!bike) return [];
          return [
            {
              stravaActivityId: row.strava_activity_id,
              bikeId: row.bike_id,
              bikeName: bike.name,
              bikeType: bike.type,
              activity: {
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
              },
            },
          ];
        });

        const hardRideEmails = await notifyHardRideEmail(admin, user.id, user.email, meta, candidates);
        for (let i = 0; i < hardRideEmails; i += 1) sent.push(`hard_ride:${user.id}`);
      }

      const { data: components } = await admin
        .from("components")
        .select("id, name, bike_id, created_at")
        .eq("user_id", user.id)
        .is("retired_at", null);

      const { data: intervalRows } = await admin
        .from("component_interval_status")
        .select(
          "id, component_id, name, interval_type, interval_value, install_date, component_created_at, last_intervention_date, bike_km_at_install, bike_hours_at_install, last_service_km, last_service_hours"
        )
        .eq("user_id", user.id);

      // The band we last told this owner about, per interval and channel.
      // Absence means "nothing outstanding" — either never notified, or the
      // interval has since been serviced.
      const { data: notifiedRows } = await admin
        .from("component_interval_notifications")
        .select("service_interval_id, channel, level")
        .eq("user_id", user.id);
      const notified = new Map(
        (notifiedRows ?? []).map((row) => [`${row.service_interval_id}:${row.channel}`, row.level as NotifyLevel])
      );

      const intervalsByComponent = new Map<string, NamedIntervalStatusInput[]>();
      for (const row of intervalRows ?? []) {
        if (!row.component_id || !row.id || !row.name) continue;
        const list = intervalsByComponent.get(row.component_id) ?? [];
        list.push({
          id: row.id,
          name: row.name,
          intervalType: row.interval_type as "km" | "hours" | "months" | null,
          intervalValue: row.interval_value,
          installDate: row.install_date,
          componentCreatedAt: row.component_created_at,
          lastInterventionDate: row.last_intervention_date,
          currentKm: null,
          currentHours: null,
          bikeKmAtInstall: row.bike_km_at_install,
          bikeHoursAtInstall: row.bike_hours_at_install,
          bikeKmAtLastService: row.last_service_km,
          bikeHoursAtLastService: row.last_service_hours,
        });
        intervalsByComponent.set(row.component_id, list);
      }

      const dueSoonItems: WeeklySummaryItem[] = [];
      const overdueItems: WeeklySummaryItem[] = [];
      const recoveredIntervalIds: string[] = [];

      for (const component of components ?? []) {
        if (!component.id || !component.bike_id || !component.name) continue;
        const bike = bikeById.get(component.bike_id);
        if (!bike) continue;

        const intervals = (intervalsByComponent.get(component.id) ?? []).map((interval) => ({
          ...interval,
          currentKm: bike.total_km,
          currentHours: bike.total_hours,
        }));

        // Forget the stored band for any interval that's climbed back into a
        // healthy range, so it can announce itself again next time it wears
        // down. Every interval is checked, not just the active one: an
        // interval that was critical and then had its value raised stops
        // being active without any intervention, and its stale row would
        // otherwise silence it forever.
        for (const candidate of intervals) {
          const candidatePercent = healthPercent(calculateComponentStatus(candidate).fractionUsed);
          const candidateLevel = candidatePercent == null ? null : classifyHealth(candidatePercent);
          if (candidateLevel === "attention" || candidateLevel === "critical") continue;
          if (CHANNELS.some((channel) => notified.has(`${candidate.id}:${channel}`))) {
            recoveredIntervalIds.push(candidate.id);
          }
        }

        const activeResult = selectActiveInterval(intervals);
        if (!activeResult) continue;
        const { interval, status } = activeResult;
        const { nextDueDate, daysRemaining, amountRemaining, fractionUsed } = status;

        // Both notifications fire off exactly the health bands the UI paints
        // on the badge — Need Attention below 25%, Service Due below 5%. They
        // used to key off calculation.ts's own "due soon" window (the last 10%
        // of a km/hours interval, or 14 days), which sits almost entirely
        // inside the Service Due band: a component showing "Need Attention"
        // in the app could pass through the whole state without ever
        // qualifying. Consequence of firing on health rather than on time
        // remaining: a component can reach "overdue" here before it's
        // technically past due, so isPastDue picks the right wording.
        const percent = healthPercent(fractionUsed);
        const health = percent == null ? null : classifyHealth(percent);
        const level: NotifyLevel | null =
          health === "critical" ? "critical" : health === "attention" ? "attention" : null;
        if (!level) continue;
        const type = level === "critical" ? "overdue" : "due_soon";
        const isPastDue = (daysRemaining ?? amountRemaining ?? 0) <= 0;

        // km/hours criteria have no base date at all — fall back to when the
        // component was created, which is stable until an intervention (or
        // edited install date) starts a new episode of its own.
        const episodeDate = interval.lastInterventionDate ?? interval.installDate ?? component.created_at!;
        const componentUrl = `/bikes/${component.bike_id}/components/${component.id}`;
        const componentLabel = `${component.name} — ${interval.name}`;
        const amountDetail =
          amountRemaining != null
            ? interval.intervalType === "km"
              ? formatDistance(Math.abs(amountRemaining), distanceUnit, locale)
              : formatHours(Math.abs(amountRemaining), locale)
            : null;

        if (type === "due_soon") {
          dueSoonItems.push({
            componentName: componentLabel,
            bikeName: bike.name,
            detail: amountDetail ?? formatDate(nextDueDate!),
            url: componentUrl,
          });
        } else {
          overdueItems.push({
            componentName: componentLabel,
            bikeName: bike.name,
            detail: amountDetail ?? `${Math.abs(daysRemaining ?? 0)}d`,
            url: componentUrl,
          });
        }

        // Fires on the transition into a band, not on the component sitting
        // in one: the same band as last time (or a milder one) means the
        // owner has already been told, and only a move to something worse is
        // news. Email and push track their own band, since they're opted into
        // separately — neither having gone out stops the other.
        async function deliver(channel: "email" | "push", enabled: boolean, send: () => Promise<boolean>) {
          if (!enabled) return;

          // Cheap short-circuit on the map loaded at the top of this user's
          // pass, so an interval that's plainly settled costs no round trip.
          // The claim below is the authority, not this.
          const previous = notified.get(`${interval.id}:${channel}`);
          if (previous && LEVEL_RANK[previous] >= LEVEL_RANK[level!]) return;

          // Claim before sending. The Strava webhook evaluates the same
          // intervals now, and this pass reads its map once at the start —
          // a ride landing mid-pass would otherwise be invisible here and
          // the owner would get the same alert twice, once from each.
          const { data: claims } = await admin.rpc("claim_interval_notification", {
            p_service_interval_id: interval.id,
            p_channel: channel,
            p_user_id: user.id,
            p_level: level!,
          });
          const claim = claims?.[0];
          if (!claim?.claimed) return;

          // A throw past this point would leave the band claimed with nothing
          // delivered, which reads as "already told" and silences the
          // interval until it recovers — so failures have to come back as a
          // value and hand the band back.
          let delivered = false;
          try {
            delivered = await send();
          } catch (e) {
            console.error("[check-services] send threw", channel, interval.id, e);
          }

          if (!delivered) {
            await admin.rpc("release_interval_notification", {
              p_service_interval_id: interval.id,
              p_channel: channel,
              p_claimed_level: level!,
              p_previous_level: claim.previous_level,
              p_previous_notified_at: claim.previous_notified_at,
            });
            return;
          }

          // Kept purely as an audit trail now that it no longer gates
          // anything — episode_date included because it's what tells you
          // which service cycle a past send belonged to.
          await admin.from("notification_log").insert({
            user_id: user.id,
            component_id: component.id,
            service_interval_id: interval.id,
            type,
            episode_date: episodeDate,
            channel,
          });
          sent.push(`${channel}:${type}:${component.id}:${interval.id}`);
        }

        const emailDict = type === "due_soon" ? dict.email.dueSoon : dict.email.overdue;
        // The push body is deliberately the same sentence as the email's —
        // it already reads as one line, and a second copy of it would be one
        // more thing to keep in sync across two languages.
        const pushBody =
          type === "due_soon"
            ? amountDetail
              ? dict.email.dueSoon.bodyByAmount(componentLabel, bike.name, amountDetail)
              : dict.email.dueSoon.bodyByDate(componentLabel, bike.name, formatDate(nextDueDate!))
            : amountDetail
              ? dict.email.overdue.bodyByAmount(componentLabel, bike.name, amountDetail, isPastDue)
              : dict.email.overdue.bodyByDays(componentLabel, bike.name, Math.abs(daysRemaining ?? 0), isPastDue);

        await Promise.all([
          deliver("email", !!user.email && (type === "due_soon" ? notifyDueSoon : notifyOverdue), () =>
            type === "due_soon"
              ? sendDueSoonEmail({
                  to: user.email!,
                  locale,
                  componentName: componentLabel,
                  bikeName: bike.name,
                  detail: amountDetail
                    ? { kind: "amount", amount: amountDetail }
                    : { kind: "date", date: nextDueDate! },
                  componentUrl,
                })
              : sendOverdueEmail({
                  to: user.email!,
                  locale,
                  componentName: componentLabel,
                  bikeName: bike.name,
                  detail: amountDetail
                    ? { kind: "amount", amount: amountDetail }
                    : { kind: "days", days: Math.abs(daysRemaining ?? 0) },
                  isPastDue,
                  componentUrl,
                })
          ),
          deliver("push", type === "due_soon" ? pushDueSoon : pushOverdue, () =>
            sendPushToUser(admin, user.id, {
              title: emailDict.heading,
              body: pushBody,
              url: componentUrl,
              // One live notification per interval per state, so a device
              // that's been offline doesn't wake up to a stack of them.
              tag: `${type}:${interval.id}`,
            })
          ),
        ]);
      }

      if (recoveredIntervalIds.length) {
        await admin
          .from("component_interval_notifications")
          .delete()
          .in("service_interval_id", recoveredIntervalIds);
      }

      if (user.email && notifyWeeklySummary && isWeeklySummaryDay) {
        const { data: recentSummary } = await admin
          .from("notification_log")
          .select("sent_at")
          .eq("user_id", user.id)
          .eq("type", "weekly_summary")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const daysSinceLast = recentSummary
          ? (Date.now() - new Date(recentSummary.sent_at).getTime()) / 86_400_000
          : Infinity;

        if (daysSinceLast >= WEEKLY_SUMMARY_MIN_GAP_DAYS) {
          const wasSent = await sendWeeklySummaryEmail({
            to: user.email,
            locale,
            overdue: overdueItems,
            dueSoon: dueSoonItems,
          });
          if (wasSent) {
            await admin.from("notification_log").insert({ user_id: user.id, component_id: null, type: "weekly_summary" });
            sent.push(`weekly_summary:${user.id}`);
          }
        }
      }
    }

    if (userPage.users.length < perPage) break;
    page += 1;
  }

  return Response.json({ sent: sent.length, details: sent });
}
