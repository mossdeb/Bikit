"use client";

import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { isIosDevice, isPushSupported, isStandaloneDisplay, subscribeToPush } from "@/lib/push-subscribe";

/**
 * Asks for notifications once, on the first launch of the installed app.
 *
 * That moment and not the install itself, because on iOS the install is
 * invisible to us — Safari has no `appinstalled` event and no install API, so
 * the earliest the app can know is when it is opened from the Home Screen.
 * Which is the better moment anyway: on iOS the PushManager does not exist
 * until then, so before this point there is nothing to grant.
 *
 * Only where the answer is still open: asked already and granted, asked
 * already and refused, or a browser that cannot carry push at all, and this
 * renders nothing. A prompt that reopens a permission the browser will not
 * re-prompt for is a dead end with a button on it.
 */

function subscribeDisplayMode(callback: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    mql.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

const emptySubscribe = () => () => {};

export interface NotificationsPromptLabels {
  title: string;
  subtitle: string;
  note: string;
  enable: string;
  notNow: string;
}

export function NotificationsPromptDialog({
  labels,
  vapidPublicKey,
  installPromptAnswered,
  action,
}: {
  labels: NotificationsPromptLabels;
  vapidPublicKey: string;
  /** Whether the install card has already had its answer. Only consulted in
   * a tab, where the two would otherwise stack into one interruption. */
  installPromptAnswered: boolean;
  action: () => Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const standalone = useSyncExternalStore(subscribeDisplayMode, isStandaloneDisplay, () => false);
  const ios = useSyncExternalStore(emptySubscribe, isIosDevice, () => false);
  const supported = useSyncExternalStore(emptySubscribe, isPushSupported, () => false);
  const permission = useSyncExternalStore(
    emptySubscribe,
    () => ("Notification" in window ? Notification.permission : "denied"),
    () => "denied" as NotificationPermission
  );

  const close = useCallback(() => {
    // Recorded in the background either way: the question was put, and the
    // answer — including "not now" — is the reader's to give once.
    setDismissed(true);
    startTransition(async () => {
      await action();
    });
  }, [action]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      // Nothing is awaited before this call: Safari only honours
      // requestPermission() inside the gesture that reached it.
      await subscribeToPush(vapidPublicKey);
    } finally {
      setBusy(false);
      close();
    }
  }, [vapidPublicKey, close]);

  // Installed: ask, and nothing else is competing for the screen — the
  // install card hides itself here. In a tab: only off iOS, where a plain tab
  // can hold a subscription, and only once the install card has had its
  // answer, so the two never stack.
  const askable = standalone || (!ios && installPromptAnswered);
  const open = !dismissed && askable && supported && permission === "default" && vapidPublicKey.length > 0;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Only a close the reader caused counts — `open` is derived, and
        // recording a programmatic close would spend the one asking this
        // prompt gets on someone who was never shown it.
        if (!next && askable && supported && permission === "default") close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-40px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <DialogPrimitive.Title className="text-center font-display text-[28px] leading-tight font-bold">
            {labels.title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mx-auto mt-3 max-w-[320px] text-center text-base">
            {labels.subtitle}
          </DialogPrimitive.Description>

          <div className="mt-7 flex justify-center">
            <BellWithAppArt className="h-[89px] w-auto" />
          </div>

          <p className="mt-7 text-center text-xs text-muted-foreground">{labels.note}</p>

          <Button type="button" variant="inverted" size="lg" className="mt-5 w-full" disabled={busy} onClick={enable}>
            {labels.enable}
          </Button>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="mt-4 w-full cursor-pointer text-center text-base font-semibold text-foreground disabled:opacity-50"
          >
            {labels.notNow}
          </button>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A bell in front of the app's own tile. Fixed colours swapped for tokens,
 * the same treatment the install art got — shipped as a file it would have
 * been a black bell on a dark card. */
function BellWithAppArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 101 89" fill="none" className={className} aria-hidden="true">
      <rect x="31.3719" y="20.1795" width="68.6435" height="68.6435" rx="15.7308" className="fill-muted" />
      <path
        d="M73.3516 46.8431V38.2808L67.3958 34.8423C66.3426 34.2342 65.0449 34.2342 63.9917 34.8423L49.5198 43.1975C48.4666 43.8057 47.8178 44.9295 47.8178 46.1457V62.1588H58.0359V46.8431H73.3516Z"
        className="fill-card"
      />
      <path
        d="M75.331 48.0153V63.331H60.0154V71.8932L65.9711 75.3318C67.0244 75.9399 68.322 75.9399 69.3752 75.3318L83.8469 66.9765C84.9001 66.3684 85.549 65.2446 85.549 64.0284V48.0153H75.331Z"
        className="fill-card"
      />
      <path
        d="M21.2768 50.7603C21.7179 51.5242 22.3524 52.1586 23.1163 52.5997C23.8803 53.0408 24.747 53.273 25.6291 53.273C26.5113 53.273 27.3779 53.0408 28.1419 52.5997C28.9059 52.1586 29.5404 51.5242 29.9815 50.7603"
        className="stroke-foreground"
        strokeWidth="6.03067"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.67189 36.5022C3.34362 36.862 3.12698 37.3094 3.04833 37.7901C2.96968 38.2708 3.03241 38.7639 3.22889 39.2096C3.42536 39.6553 3.74712 40.0342 4.15501 40.3004C4.56291 40.5665 5.03936 40.7084 5.52641 40.7088H45.7328C46.2198 40.709 46.6963 40.5676 47.1045 40.302C47.5126 40.0363 47.8348 39.6578 48.0318 39.2124C48.2288 38.767 48.2921 38.274 48.2141 37.7933C48.1361 37.3126 47.9201 36.8649 47.5923 36.5047C44.2502 33.0595 40.707 29.3982 40.707 18.0927C40.707 14.0939 39.1185 10.2589 36.2909 7.43138C33.4634 4.60383 29.6284 3.01532 25.6296 3.01532C21.6308 3.01532 17.7958 4.60383 14.9683 7.43138C12.1407 10.2589 10.5522 14.0939 10.5522 18.0927C10.5522 29.3982 7.00651 33.0595 3.67189 36.5022Z"
        className="fill-foreground stroke-foreground"
        strokeWidth="6.03067"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
