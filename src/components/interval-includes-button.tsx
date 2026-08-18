"use client";

import type { ReactNode } from "react";
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
  note,
  label,
  size = "default",
  className,
  children,
}: {
  /** Popover heading, e.g. "Inclui" — also the accessible name of the list. */
  title: string;
  /** Translated service names. Rendering is skipped entirely when empty. */
  items: string[];
  /** Prose about the work, split off the interval's own name by
   * `splitIntervalNote`. Opens the popover on its own when there is no list —
   * it is the same question ("what does this cover?") answered in sentences
   * instead of names. Untranslated, because it arrives as catalog prose
   * rather than as a canonical key. */
  note?: string | null;
  /** Accessible name of the trigger, since the icon carries no text. */
  label: string;
  /** "compact" is the inline one that follows a line of text (the Smart Setup
   * preview); "default" is the standalone control on the component page. */
  size?: "default" | "compact";
  className?: string;
  /** Text to pull inside the trigger, so the line it annotates opens the
   * popover too. Comes back on its own when there is no list to show. */
  children?: ReactNode;
}) {
  // Nothing to open — but the caller's text still has to reach the page, so
  // it comes back bare rather than taking the whole line down with it.
  if (items.length === 0 && !note) return <>{children}</>;

  const compact = size === "compact";

  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "flex cursor-pointer items-center text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          // No disc behind it: sitting next to the text it annotates rather
          // than at the end of the row, a filled circle read as a second
          // control competing with the health badge.
          children
            ? // With the text inside, the whole line is the target instead of
              // a 16px icon. The padding is cancelled by the negative margin,
              // so the row keeps the height the text alone gave it.
              "-my-1 min-w-0 gap-1.5 rounded-[7px] py-1"
            : cn("shrink-0 justify-center rounded-full", compact ? "size-5 align-middle" : "size-8"),
          className
        )}
      >
        {children}
        <Info className={cn("shrink-0", compact ? "size-3.5" : "size-4")} />
      </PopoverTrigger>
      <PopoverContent align="end" className="p-4">
        {/* The note leads and carries no heading of its own: it is a sentence
            about the work, and a label above one sentence is furniture. The
            list keeps its heading, which is what tells the two apart when
            both are here. */}
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        {items.length > 0 && (
          <>
            <p className={cn("text-sm font-semibold", note && "mt-3")}>{title}</p>
            <ul className="mt-2 space-y-1.5">
              {items.map((item) => (
                <li key={item} className="flex gap-2 text-sm">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
