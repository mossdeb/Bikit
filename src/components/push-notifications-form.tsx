"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BellOff } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "@/components/settings-toggle-row";
import { deletePushSubscription, updatePushPreferences } from "@/lib/actions/push";
import { isPushSupported, subscribeToPush } from "@/lib/push-subscribe";

type Support = "checking" | "ok" | "unsupported" | "ios-not-installed" | "not-configured";

const emptySubscribe = () => () => {};

/** Which browser's settings the owner has to go and change. Only reached
 * once permission is "denied", where no API can reopen the prompt and a
 * generic "check your settings" is close to useless. Order matters: every
 * iOS browser is Safari underneath, and Chrome/Edge both claim Safari in
 * their UA string. */
function browserSettingsPath(): keyof Dictionary["settings"]["pushNotifications"]["blockedPath"] {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/edg\//i.test(ua) || /chrome|crios/i.test(ua)) return "chrome";
  if (/safari/i.test(ua)) return "safari";
  return "other";
}

export function PushNotificationsForm({
  prefs,
  vapidPublicKey,
  dict,
}: {
  prefs: { dueSoon: boolean; overdue: boolean; stravaSync: boolean; hardRide: boolean };
  vapidPublicKey: string;
  dict: Dictionary["settings"]["pushNotifications"];
}) {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Support and permission are things only the browser knows, so the server
  // renders "checking" and the client reports the truth on mount — same
  // hydration-safe approach as InstallAppButton. Reading them through
  // useSyncExternalStore (rather than an effect) also means the permission
  // re-reads itself after the browser prompt resolves, with no state of its
  // own to keep in sync.
  const support = useSyncExternalStore(
    emptySubscribe,
    useCallback((): Support => {
      // A missing key is our own deploy being misconfigured, not anything the
      // browser can't do — folding it into "unsupported" told an iPhone owner
      // with a perfectly capable installed PWA that Safari was at fault.
      if (!vapidPublicKey) return "not-configured";
      if (isPushSupported()) return "ok";
      // Safari only exposes PushManager once the app has been added to the
      // Home Screen, so an iPhone lands here for a reason worth explaining
      // rather than a flat "not supported".
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      return ios && !standalone ? "ios-not-installed" : "unsupported";
    }, [vapidPublicKey]),
    () => "checking" as Support
  );

  const permission = useSyncExternalStore(
    emptySubscribe,
    () => ("Notification" in window ? Notification.permission : "default"),
    () => "default" as NotificationPermission
  );
  const blocked = permission === "denied";

  useEffect(() => {
    if (support !== "not-configured") return;
    console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — push notifications are unavailable.");
  }, [support]);

  useEffect(() => {
    if (support !== "ok") return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(!!subscription))
      .catch(() => {});
  }, [support]);

  const toggleDevice = useCallback(
    async (enable: boolean) => {
      setBusy(true);
      try {
        if (!enable) {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await subscription.unsubscribe();
            await deletePushSubscription(subscription.endpoint);
          }
          setSubscribed(false);
          return;
        }

        // Shared with the prompt that follows an install — one copy, because
        // the ordering inside it is load-bearing and a second one would drift.
        setSubscribed(await subscribeToPush(vapidPublicKey));
      } catch (e) {
        console.error("[push] failed to change subscription", e);
      } finally {
        setBusy(false);
      }
    },
    [vapidPublicKey]
  );

  // Reserves one row's worth of height so the card doesn't jump as the
  // browser check settles.
  if (support === "checking") return <div className="h-[52px]" aria-hidden />;

  if (support !== "ok") {
    return (
      <p className="text-sm text-muted-foreground">
        {support === "ios-not-installed"
          ? dict.iosHint
          : support === "not-configured"
            ? dict.unavailable
            : dict.unsupported}
      </p>
    );
  }

  return (
    // The device switch lives inside the same form as the preferences even
    // though it isn't one of them — a nameless checkbox is never submitted,
    // and keeping every row a sibling is what makes ToggleRow's "no divider
    // on the first row" land on the first row of the section.
    <form
      key={`${prefs.dueSoon}-${prefs.overdue}-${prefs.stravaSync}-${prefs.hardRide}`}
      action={updatePushPreferences}
    >
      {subscribed ? (
        <ToggleRow
          label={dict.enable}
          sub={dict.enableSub}
          checked
          disabled={busy}
          onToggle={() => toggleDevice(false)}
        />
      ) : (
        <div className="mb-4 rounded-[16px] border border-border p-4">
          <div className="flex items-start gap-2.5">
            <BellOff className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm font-semibold">{blocked ? dict.blockedTitle : dict.offTitle}</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{blocked ? dict.blockedBody : dict.offBody}</p>
          {blocked ? (
            // No button here on purpose: once permission is denied, no API
            // can reopen the prompt or jump to the browser's settings, so a
            // button would be a dead end. The path is the actionable part.
            <p className="mt-4 text-sm text-foreground">{dict.blockedPath[browserSettingsPath()]}</p>
          ) : (
            <Button
              type="button"
              variant="inverted"
              size="sm"
              className="mt-4"
              disabled={busy}
              onClick={() => toggleDevice(true)}
            >
              {dict.offAction}
            </Button>
          )}
        </div>
      )}

      {/* The per-event choices are account-wide, but nothing they control can
          reach a device that hasn't opted in — so they follow this device's
          state rather than sitting there looking live. */}
      <ToggleRow
        label={dict.dueSoon}
        sub={dict.dueSoonSub}
        name="push_due_soon"
        defaultChecked={prefs.dueSoon}
        disabled={!subscribed}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <ToggleRow
        label={dict.overdue}
        sub={dict.overdueSub}
        name="push_overdue"
        defaultChecked={prefs.overdue}
        disabled={!subscribed}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
      {/* Not maintenance: this one remarks on the ride that just landed. It
          sits beside the Strava sync toggle because both are things a ride
          causes, rather than things a component asks for. */}
      <ToggleRow
        label={dict.hardRide}
        sub={dict.hardRideSub}
        name="push_hard_ride"
        defaultChecked={prefs.hardRide}
        disabled={!subscribed}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <ToggleRow
        label={dict.stravaSync}
        sub={dict.stravaSyncSub}
        name="push_strava_sync"
        defaultChecked={prefs.stravaSync}
        disabled={!subscribed}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
