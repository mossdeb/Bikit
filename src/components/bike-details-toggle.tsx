"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/collapsible";

/** Mobile-only compact/expanded toggle for bike details. Desktop always
 * renders the full details grid inline in the header row instead.
 *
 * Both halves stay mounted so the card can animate between them: a
 * `grid-template-rows` transition from `0fr` to `1fr` is the only way to
 * animate to a height nobody measured, and the two halves cross over —
 * one collapsing as the other opens — so the card never jumps. The half
 * that's out gets `inert`, otherwise its buttons (the Strava reload lives
 * in the expanded grid) stay tabbable behind a zero-height clip. */
export function BikeDetailsToggle({
  compact,
  expanded,
  viewLabel,
  closeLabel,
  // Rendered in both halves on purpose. It is the "Powered by Strava" mark,
  // and it belongs beside the totals it credits — which are in the compact
  // row when closed and in the full grid when open. Passing it in once and
  // placing it twice keeps the page from having to know which half is showing.
  mark,
}: {
  compact: ReactNode;
  expanded: ReactNode;
  viewLabel: string;
  closeLabel: string;
  mark?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="bg-transparent">
      {viewLabel}
      <ChevronDown className="size-3.5" />
    </Button>
  );

  return (
    <div className="sm:hidden">
      {/* Outside both halves: the totals are the bike's readings and they are
          true in either state, so they stay put while the rest opens under
          them. Inside the collapsing half they vanished the moment the
          details appeared, and the card lost its numbers to show its
          paperwork. Rendering them in both halves instead would show two
          boxes to anyone watching the cross-fade. */}
      {mark ? (
        compact
      ) : (
        // With no mark there is nothing to hold the left of the row below, and
        // a lone button there spent 44px of a phone screen to say nothing — on
        // the bikes with the fewest figures to show. It sits beside them
        // instead, and wraps under only if they grow enough to need the room.
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-5">
          {compact}
          <Collapsible show={!open} className="w-auto shrink-0">
            {trigger}
          </Collapsible>
        </div>
      )}

      {mark && (
        <Collapsible show={!open}>
          <div className="mt-6 flex items-center justify-between gap-4">
            {mark}
            {trigger}
          </div>
        </Collapsible>
      )}

      <Collapsible show={open}>
        <div className="mt-8">{expanded}</div>
        {/* Left, like the collapsed half puts it. The mark sat on the right
            here and jumped across the card every time the details opened. */}
        {mark && <div className="mt-6 flex">{mark}</div>}
        <div className="mt-8 flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} className="bg-transparent">
            <X className="size-3.5" />
            {closeLabel}
          </Button>
        </div>
      </Collapsible>
    </div>
  );
}
