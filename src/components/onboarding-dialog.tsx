"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";

const IMAGES = ["/images/onboarding-1.jpg", "/images/onboarding-2.jpg", "/images/onboarding-3.jpg", "/images/onboarding-4.jpg"];

type Step = {
  greeting?: string;
  title: string;
  subtitle: string;
};

/** First-run product tour, shown once (gated by `user_metadata.onboarding_completed`,
 * set by the `action` server action on any dismissal). Full-screen on mobile,
 * a centered card on desktop — mirrors the mockup exactly for each.
 * `steps` arrives pre-resolved (greeting already interpolated with the name)
 * since Server Component props can't carry the dictionary's format functions
 * across to this Client Component.
 *
 * The steps live in a horizontal snap-scroll track (same pattern as
 * BikeCarousel): a finger swipe moves between them natively and the buttons
 * scroll the track programmatically, with the current step read back from the
 * scroll position. Dots and buttons stay put while image + text slide. */
export function OnboardingDialog({
  open: initialOpen,
  steps,
  labels,
  action,
}: {
  open: boolean;
  steps: Step[];
  labels: { getStarted: string; next: string; skip: string; addFirstBike: string; addLater: string };
  action: () => Promise<void>;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState(1);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const trackRef = useRef<HTMLDivElement>(null);
  /** Height of the fixed dots/buttons layer, reserved at the bottom of every
   * slide so the sliding subtitle lands right above it — the two layers
   * overlap, so this keeps the spacing identical to a single flow. Measured
   * from a callback ref rather than an effect: the dialog's content is
   * portalled, so it only exists once Base UI mounts the popup. */
  const [controlsHeight, setControlsHeight] = useState(0);
  const controlsObserver = useRef<ResizeObserver | null>(null);

  const controlsRef = useCallback((node: HTMLDivElement | null) => {
    controlsObserver.current?.disconnect();
    controlsObserver.current = null;
    if (!node) return;
    setControlsHeight(node.offsetHeight);
    const observer = new ResizeObserver(() => setControlsHeight(node.offsetHeight));
    observer.observe(node);
    controlsObserver.current = observer;
  }, []);

  /** Which slide the track has settled on — drives the dots and the button
   * labels, whether the move came from a swipe or from a button. */
  function onTrackScroll(event: React.UIEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const slides = Array.from(track.children) as HTMLElement[];
    const center = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let closestDistance = Infinity;
    slides.forEach((slide, i) => {
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = i;
      }
    });
    setStep(closest + 1);
  }

  /** Scroll-behavior comes from the track's CSS, so this follows the user's
   * reduced-motion preference on its own. */
  function goToStep(n: number) {
    const track = trackRef.current;
    if (!track) return;
    setStep(n);
    track.scrollTo({ left: (n - 1) * track.clientWidth });
  }

  function dismiss() {
    setOpen(false);
    startTransition(async () => {
      await action();
    });
  }

  function goToFirstBike() {
    setOpen(false);
    startTransition(async () => {
      await action();
      router.push("/bikes/new");
    });
  }

  const isLast = step === steps.length;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-0 z-50 overflow-hidden bg-background outline-none duration-100",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[640px] sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:ring-1 sm:ring-foreground/10 sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95"
          )}
        >
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain motion-safe:scroll-smooth"
          >
            {steps.map((s, i) => (
              <div
                key={i}
                aria-hidden={i + 1 !== step}
                className="relative h-full w-full shrink-0 snap-center snap-always"
              >
                {/* Image is the full-bleed background of the slide — the
                    greeting/title and subtitle sit on top of it in a z-10
                    overlay, so the overlap is intentional rather than
                    accidental clipping. */}
                <Image
                  src={IMAGES[i]}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 420px, 100vw"
                  className="object-cover"
                  priority={i === 0}
                  loading={i === 0 ? undefined : "eager"}
                />
                {/* pt-5 on mobile puts the logo row at exactly the same y as
                    the app header's own logo (header is py-5 around a 32px
                    mark), so dismissing the tour doesn't make it jump. */}
                <div
                  className="relative z-10 flex h-full flex-col justify-between px-6 pt-5 sm:px-8 sm:pt-8"
                  style={{ paddingBottom: controlsHeight }}
                >
                  <div className="text-center">
                    {s.greeting ? (
                      <p className="font-display text-2xl font-bold">{s.greeting}</p>
                    ) : (
                      <div className="mb-16 flex items-center justify-center gap-2.5">
                        <LogoMark className="size-8" />
                        <span className="font-display text-lg font-bold">Bikit</span>
                      </div>
                    )}
                    <h2 className="font-display text-2xl font-bold">{s.title}</h2>
                  </div>

                  <p className="mb-8 text-center text-[22px] leading-[24px] text-foreground">{s.subtitle}</p>
                </div>
              </div>
            ))}
          </div>

          <div ref={controlsRef} className="absolute inset-x-0 bottom-0 z-20 px-6 pb-8 sm:px-8">
            <div className="flex items-center justify-center gap-2">
              {steps.map((_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i + 1 === step ? "w-6 bg-foreground" : "w-2 bg-border"
                  )}
                />
              ))}
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              {!isLast ? (
                <Button
                  key="next"
                  type="button"
                  variant="inverted"
                  className="w-full"
                  onClick={() => goToStep(step + 1)}
                >
                  {step === 1 ? labels.getStarted : labels.next}
                </Button>
              ) : (
                <Button
                  key="final"
                  type="button"
                  variant="inverted"
                  className="w-full"
                  onClick={goToFirstBike}
                >
                  {labels.addFirstBike}
                </Button>
              )}
              <button
                type="button"
                className="text-base text-foreground transition-opacity hover:opacity-70"
                onClick={dismiss}
              >
                {isLast ? labels.addLater : labels.skip}
              </button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
