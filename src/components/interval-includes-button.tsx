"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * What a merged reminder covers. Curation collapses services that share a
 * cadence into one reminder — a FOX fork does lowers, damper and air spring
 * together at 125 h — because that is one workshop visit, and three reminders
 * going green one at a time described a job nobody does in three parts. The
 * detail had to go somewhere, and the name was the wrong somewhere: it is
 * also the translation key.
 *
 * A popover and not a tooltip: this is read on a phone, and hover is not a
 * thing a finger does.
 *
 * Deliberately dumb — `items` arrives already translated from the server, so
 * neither dictionary crosses into the client bundle.
 */
export function IntervalIncludesButton({
  title,
  items,
  label,
  size = "default",
  className,
}: {
  /** Popover heading, e.g. "Inclui" — also the accessible name of the list. */
  title: string;
  /** Translated service names. Rendering is skipped entirely when empty. */
  items: string[];
  /** Accessible name of the trigger, since the icon carries no text. */
  label: string;
  /** "compact" is the inline one that follows a line of text (the Smart Setup
   * preview); "default" is the standalone control on the component page. */
  size?: "default" | "compact";
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "flex shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          // Same white disc as the wrench that opens the row, so the two read
          // as one family rather than as a control bolted onto a card.
          size === "default" ? "size-8 bg-card" : "size-5 align-middle",
          className
        )}
      >
        <Info className={size === "default" ? "size-4" : "size-3.5"} />
      </PopoverTrigger>
      <PopoverContent align="end" className="p-4">
        <p className="text-sm font-semibold">{title}</p>
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-sm">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
