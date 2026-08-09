"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
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
      <Collapsible show={!open}>
        {/* With a mark to show, the trigger takes a line of its own so the
            figures' row is free to end with it. Without one — a bike that is
            not linked to Strava — that line would be the trigger alone above
            an empty right half, so it goes back onto the row itself. */}
        {mark && <div className="flex justify-end">{trigger}</div>}
        <div className={cn("flex flex-wrap items-center justify-between gap-4", mark && "mt-5")}>
          {compact}
          {mark ?? trigger}
        </div>
      </Collapsible>

      <Collapsible show={open}>
        {expanded}
        {mark && <div className="mt-6 flex justify-end">{mark}</div>}
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
