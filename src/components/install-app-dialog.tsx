"use client";

import { useCallback, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { EllipsisVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AddSquareGlyph,
  InstallAppGlyph,
  LaptopWithAppArt,
  PhoneWithAppArt,
  ShareGlyph,
} from "@/components/install-icons";

/**
 * How to install Bikit, in the reader's own platform's words.
 *
 * Instructions and not a button: iOS has no install API at all, Safari on the
 * Mac has none either, and on Android `beforeinstallprompt` only fires once
 * the browser has decided the page is installable — not something to gate a
 * one-shot prompt on.
 *
 * Platform and display-mode are things only the browser knows, so the server
 * renders nothing and the client reports the truth on mount — the same
 * useSyncExternalStore approach InstallAppButton and PushNotificationsForm
 * already use, rather than an effect that would set state during render.
 */

type Platform = "ios" | "android" | "mac";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function subscribeStandalone(callback: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    mql.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

const emptySubscribe = () => () => {};

/** iPadOS reports itself as a Mac and only the touch points separate the two,
 * so the touch check has to come before the Mac answer — a real Mac has none.
 * Windows and Linux fall through to null on purpose: there is no drawing for
 * them, and a prompt with the wrong menu in it is worse than no prompt. */
function detectPlatform(): Platform | null {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh/i.test(ua)) return navigator.maxTouchPoints > 1 ? "ios" : "mac";
  return null;
}

export interface InstallAppLabels {
  title: string;
  subtitle: string;
  gotIt: string;
  /** Steps carry at most one "{icon}" placeholder, marking where that
   * platform's glyph belongs inside the sentence. */
  ios: string[];
  android: string[];
  mac: string[];
}

const GLYPH_CLASS = "size-4";

const GLYPHS: Record<Platform, ReactNode[]> = {
  ios: [<ShareGlyph key="share" className={GLYPH_CLASS} />, <AddSquareGlyph key="add" className={GLYPH_CLASS} />],
  android: [
    <EllipsisVertical key="menu" className={GLYPH_CLASS} />,
    <InstallAppGlyph key="install" className={GLYPH_CLASS} />,
  ],
  // The Mac opens on "Open Safari", which carries no glyph — the share and
  // the plus land one step later than they do on a phone.
  mac: [null, <ShareGlyph key="share" className={GLYPH_CLASS} />, <AddSquareGlyph key="add" className={GLYPH_CLASS} />],
};

function InstallCard({
  platform,
  labels,
  onDismiss,
}: {
  platform: Platform;
  labels: InstallAppLabels;
  onDismiss: () => void;
}) {
  const steps = labels[platform];

  return (
    <>
      <DialogPrimitive.Title className="text-center font-display text-[28px] leading-tight font-bold">
        {labels.title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mx-auto mt-1 max-w-[300px] text-center text-base font-semibold">
        {labels.subtitle}
      </DialogPrimitive.Description>

      <div className="mt-6 flex justify-center">
        {platform === "mac" ? (
          <LaptopWithAppArt className="h-[67px] w-auto" />
        ) : (
          <PhoneWithAppArt className="h-[75px] w-auto" />
        )}
      </div>

      <ol className="mt-7 space-y-3.5">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3.5">
            {/* bg-emphasis and not bg-sidebar: the two share one near-black in
                light mode, but in dark the sidebar's #1c1c1c sits a point away
                from the card and the badge vanished into it. */}
            <span className="flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-emphasis text-xs font-bold text-health-positive">
              {index + 1}
            </span>
            <p className="text-base leading-snug">
              <StepText text={step} icon={GLYPHS[platform][index]} />
            </p>
          </li>
        ))}
      </ol>

      <Button type="button" variant="inverted" size="lg" className="mt-7 w-full" onClick={onDismiss}>
        {labels.gotIt}
      </Button>
    </>
  );
}

const POPUP_CLASS =
  "fixed top-1/2 left-1/2 z-50 w-[calc(100%-40px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

const BACKDROP_CLASS =
  "fixed inset-0 isolate z-50 bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

/**
 * The one-shot prompt, shown after the owner's first bike exists — the moment
 * the app has something in it worth coming back to, and the earliest point
 * where an install is worth more than it costs to ask for.
 */
export function InstallAppDialog({ labels, action }: { labels: InstallAppLabels; action: () => Promise<void> }) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  const installed = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const platform = useSyncExternalStore(emptySubscribe, detectPlatform, () => null);

  const dismiss = useCallback(() => {
    // Closed on the spot and recorded in the background: the flag only has to
    // survive the next visit, and awaiting it would hold the dialog open over
    // a round trip for no one's benefit.
    setDismissed(true);
    startTransition(async () => {
      await action();
    });
  }, [action]);

  const open = !dismissed && !installed && platform != null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Only a close the reader caused counts. `open` is derived, so it
        // also falls when the app reports itself installed or the platform
        // resolves to one with no instructions — and recording those as a
        // dismissal burns the one showing this prompt ever gets, for someone
        // who was never shown anything.
        if (!next && !installed && platform != null) dismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP_CLASS} />
        <DialogPrimitive.Popup className={POPUP_CLASS}>
          {platform && <InstallCard platform={platform} labels={labels} onDismiss={dismiss} />}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The same card, on demand, from Settings. Nothing is recorded here: asking
 * to see the instructions is not the same as having been interrupted by them,
 * and a reader who opens this twice should get it twice.
 *
 * Renders nothing where there are no instructions to give — already installed,
 * or a platform with no drawing — rather than a button that opens an empty box.
 */
export function InstallAppHowToButton({ labels, buttonLabel }: { labels: InstallAppLabels; buttonLabel: string }) {
  const [open, setOpen] = useState(false);

  const installed = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const platform = useSyncExternalStore(emptySubscribe, detectPlatform, () => null);

  if (installed || !platform) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={
          <Button type="button" variant="outline" size="sm">
            {buttonLabel}
          </Button>
        }
      />
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP_CLASS} />
        <DialogPrimitive.Popup className={POPUP_CLASS}>
          <InstallCard platform={platform} labels={labels} onDismiss={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Splits a step on its "{icon}" placeholder so the glyph sits inline, in the
 * middle of the sentence, where the translation puts it — an icon pinned to
 * one end would be describing a different button in the other language. */
function StepText({ text, icon }: { text: string; icon: ReactNode }) {
  const [before, after] = text.split("{icon}");
  if (after == null || !icon) return <>{text.replace("{icon}", "")}</>;

  // The sentence supplies the spaces, so the chip must not add its own where
  // the text has none — a right margin in front of the full stop left the
  // period floating a word away from the sentence it ends.
  const tail = after.replace(/^\s+/, "");
  const clingsToTail = /^[.,;:!?)]/.test(tail);

  return (
    <>
      {before.replace(/\s+$/, "")}
      <span
        className={cn(
          "inline-flex translate-y-[3px] items-center justify-center rounded-[7px] bg-muted px-1.5 py-1",
          before.trim() && "ml-1.5",
          !clingsToTail && "mr-1.5"
        )}
      >
        {icon}
      </span>
      {tail}
    </>
  );
}
