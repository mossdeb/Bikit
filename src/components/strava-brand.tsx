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
