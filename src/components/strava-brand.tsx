import { cn } from "@/lib/utils";

/*
 * Strava's own brand assets, served from public/strava/ exactly as they come
 * out of the official packs. They are not ours to redraw: the guidelines ask
 * for their button and their logo, unaltered, and an app that hand-rolls a
 * lookalike is the thing an athlete-quota review is most likely to bounce.
 *
 * Plain <img> rather than next/image, matching the landing: the optimizer
 * refuses SVG unless dangerouslyAllowSVG is turned on, and turning that on
 * for two static files of our own is a worse trade than an eslint warning.
 */

/**
 * The official "Connect with Strava" button, 237x48 at its natural size.
 *
 * Renders a submit button so it works both inside its own <form action> and,
 * via formAction, inside a surrounding form that belongs to something else —
 * the bike forms need the second, because HTML has no nested forms.
 */
export function ConnectWithStravaButton({
  label,
  formAction,
  className,
}: {
  label: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={cn(
        // The 6px radius is the one drawn into the asset itself, repeated here
        // so the focus ring follows the button's real shape.
        "inline-flex shrink-0 cursor-pointer rounded-[6px] transition-opacity hover:opacity-90",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/strava/btn_connect_with_strava_orange.svg" alt={label} width={237} height={48} />
    </button>
  );
}

const POWERED_BY = { width: 365, height: 37 } as const;

/**
 * The official "Powered by Strava" logo, required wherever data that came from
 * Strava is on screen.
 *
 * Two files rather than one recoloured with CSS: the marks are supplied per
 * colour, and a filter over theirs would be altering it.
 *
 * `variant` defaults to following the theme, which is what the app wants. The
 * landing needs to be told: its surfaces are fixed hex values that do not
 * follow the theme, but the `dark` class still lands on the same <html> — so
 * a themed mark there can put the white logo on a white footer, which is the
 * one failure this component can produce that nobody would see in review.
 */
export function PoweredByStrava({
  variant = "auto",
  className,
}: {
  variant?: "auto" | "black" | "white";
  className?: string;
}) {
  // 14px, and deliberately at the floor. There is no minimum in the
  // guidelines — the size rules run the other way, asking that the mark not be
  // more prominent than our own and that the Strava name not be set larger
  // than the text around it, so smaller is the safer direction on both counts.
  //
  // What stops it going further is legibility: "POWERED BY" is the small half
  // of this lockup, and compared at 20/18/16/14/12 it gives out below 14. A
  // mark too small to read is present without attributing anything, which is
  // the opposite of why it is here. Do not take this down further.
  const wrapper = cn("inline-block h-[14px]", className);

  if (variant !== "auto") {
    return (
      <span className={wrapper}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          {...POWERED_BY}
          src={`/strava/powered_by_strava_horiz_${variant}.svg`}
          alt="Powered by Strava"
          className="h-full w-auto"
        />
      </span>
    );
  }

  return (
    <span className={wrapper}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...POWERED_BY}
        src="/strava/powered_by_strava_horiz_black.svg"
        alt="Powered by Strava"
        className="h-full w-auto dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...POWERED_BY}
        src="/strava/powered_by_strava_horiz_white.svg"
        alt=""
        aria-hidden="true"
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}
