"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The figures behind one ride's stress. Distance, time and elevation are what
 * the score is made of; speeds and ratios are what a rider recognises the ride
 * by and the score never touches. Both are here because the question the icon
 * answers is "which ride was this, and why did it score that".
 *
 * A popover, not a tooltip — this is a list read on a phone, and hover is not
 * a thing a finger does. Same reasoning as IntervalIncludesButton, and like
 * that one it is deliberately dumb: every value arrives already formatted and
 * translated, so no dictionary crosses into the client bundle.
 */
export function RideDetailsButton({
  title,
  label,
  items,
  note,
  className,
}: {
  title: string;
  /** Accessible name of the trigger, since the icon carries no text. */
  label: string;
  items: { label: string; value: string }[];
  /** Shown under the list when the ride was scored without elevation. */
  note?: string | null;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          className
        )}
      >
        <Info className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-4">
        <p className="text-sm font-semibold">{title}</p>
        <dl className="mt-2.5 space-y-1.5">
          {items.map((item) => (
            <div key={item.label} className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 text-sm text-muted-foreground">{item.label}</dt>
              <dd className="shrink-0 font-mono text-sm font-semibold">{item.value}</dd>
            </div>
          ))}
        </dl>
        {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
      </PopoverContent>
    </Popover>
  );
}
