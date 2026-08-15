"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/** Strava's own gear page. Their API has exactly one gear endpoint —
 * `GET /gears/{id}` — so a bike cannot be created for the athlete from here
 * at any scope. The trip to Strava is unavoidable; all this does is make it
 * one tap out and one tap back. */
const STRAVA_GEAR_URL = "https://www.strava.com/settings/gear";

/**
 * The way out of the dead end where someone's bike is not in the gear picker.
 *
 * Sits under the field rather than beside it: both bike forms carry a note
 * saying the Strava glyph was taken off that row so the select could fill the
 * box, and a control back on that line would undo it — on a 375px phone the
 * select is what pays.
 *
 * A named trigger and not an (i): the (i) in this app is the pattern for
 * optional detail next to something that already works. Someone who does not
 * know gear has to exist in Strava first also does not know there is a
 * question to ask, and a quiet glyph is invisible to exactly the person who
 * is stuck.
 *
 * Deliberately dumb, like `IntervalIncludesButton` — every string arrives
 * translated from the server, so no dictionary crosses into the client bundle.
 */
export function StravaGearHelp({
  trigger,
  title,
  lead,
  appStep,
  webStep,
  openLabel,
  refreshLabel,
}: {
  /** The trigger's text — the question the reader is already asking. */
  trigger: string;
  title: string;
  /** Why the bike is not in the list, said plainly. */
  lead: string;
  /** Where gear lives in the Strava phone app, which is where most people are. */
  appStep: string;
  /** The same job on the website, behind `openLabel`. */
  webStep: string;
  openLabel: string;
  refreshLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // `router.refresh()` and not a server action returning the list: it re-runs
  // the page's own fetch and merges the payload without remounting, so the
  // half-filled form keeps every value the person had already typed. Going to
  // Strava and coming back to a blank form is the part that made this feel
  // broken, and reloading the page would have reproduced it.
  const refresh = () => startTransition(() => router.refresh());

  return (
    <Popover>
      <PopoverTrigger className="cursor-pointer rounded-[7px] text-xs font-medium text-foreground underline underline-offset-2 outline-none transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className="p-4">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{lead}</p>

        <ol className="mt-3 space-y-2">
          <li className="flex gap-2 text-sm">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
            <span className="min-w-0">{appStep}</span>
          </li>
          <li className="flex gap-2 text-sm">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
            <span className="min-w-0">{webStep}</span>
          </li>
        </ol>

        {/* A new tab, not this one: the form behind this popover is very often
            half filled in, and sending the page to Strava would throw it away
            on the very screen that exists to stop that happening. */}
        <Button
          render={<a href={STRAVA_GEAR_URL} target="_blank" rel="noopener noreferrer" />}
          nativeButton={false}
          variant="outline"
          size="sm"
          className="mt-3 w-full bg-transparent"
        >
          {openLabel}
          <ExternalLink className="size-3.5" />
        </Button>

        <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={pending} className="mt-1.5 w-full">
          <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
          {refreshLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
