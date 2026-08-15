import { Bike } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBikeAccent } from "@/lib/bike-accent";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import type { BikeType } from "@/lib/constants";

export function BikeIcon({
  type,
  size = "sm",
  plain = false,
  className,
}: {
  type?: string | null;
  size?: "sm" | "lg";
  plain?: boolean;
  className?: string;
}) {
  const Icon = BIKE_TYPE_ICON[type as BikeType] ?? Bike;

  if (plain) {
    // Width and height apart rather than one `size-*`: tailwind-merge does not
    // treat `size-*` as conflicting with a caller's `w-*`/`h-*`, so a caller
    // overriding only one axis was landing both classes and winning by
    // stylesheet order alone. Split, the merge resolves it. Same pixels.
    return (
      <Icon
        className={cn(
          size === "sm" ? "h-[57.2px] w-[57.2px]" : "h-14 w-14",
          "shrink-0 text-foreground",
          className
        )}
      />
    );
  }

  const accent = getBikeAccent(type);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        size === "sm" ? "size-10" : "size-14",
        accent.bg,
        accent.fg,
        className
      )}
    >
      <Icon className={size === "sm" ? "size-5" : "size-7"} />
    </span>
  );
}
