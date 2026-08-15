import { cn } from "@/lib/utils";
import { INTERVENTION_TYPE_ICON, type InterventionType } from "@/lib/intervention-type";
import { getDictionary } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export const INTERVENTION_TYPE_STYLES: Record<InterventionType, string> = {
  service: "bg-primary text-primary-foreground",
  repair: "bg-indigo text-indigo-foreground",
  replacement: "bg-emphasis text-emphasis-foreground",
};

/** Halo + core for the history timeline dots, the shape the Bike Log's
 * `TimelineDot` already uses: a soft outer circle with a solid one inside it.
 * The halo is a second circle rather than a ring utility so it stays a glow at
 * any zoom — see the note on `TimelineDot`.
 *
 * Two classes and not one because the colour has to reach both circles, and it
 * carries meaning here that it does not in the Bike Log: that thread is always
 * mint, while this one says replacement from service from repair by colour
 * alone. Copying `TimelineDot` outright would have thrown that away. */
export const INTERVENTION_TYPE_DOT_STYLES: Record<InterventionType, { halo: string; core: string }> = {
  service: { halo: "bg-primary/25", core: "bg-primary" },
  repair: { halo: "bg-indigo/25", core: "bg-indigo" },
  replacement: { halo: "bg-emphasis/25", core: "bg-emphasis" },
};

export function TypeBadge({ type, dict = getDictionary("en") }: { type: InterventionType; dict?: Dictionary }) {
  const Icon = INTERVENTION_TYPE_ICON[type];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-xs font-bold",
        INTERVENTION_TYPE_STYLES[type]
      )}
    >
      <Icon className="size-3" />
      {dict.interventionType[type]}
    </span>
  );
}
