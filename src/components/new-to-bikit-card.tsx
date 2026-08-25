import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BikeTypeIconCarousel } from "@/components/bike-type-icon-carousel";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

export function NewToBikitCard({
  heading,
  cta,
  compact,
  className,
}: {
  heading: string;
  cta: string;
  /** Sizes the card to match the height of a populated bike card (used on
   * the bikes list, which has no carousel of other cards to stretch against). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg bg-card px-6 text-center",
        DARK_CARD_HAIRLINE,
        compact ? "h-[217px]" : "py-14",
        className
      )}
    >
      <BikeTypeIconCarousel className={compact ? "h-[72px] w-[84px]" : "h-24 w-28"} />
      <p className="text-[16px] font-semibold">{heading}</p>
      <Button
        render={<Link href="/bikes/new" />}
        nativeButton={false}
        variant="inverted"
        size="lg"
        className="h-[52px] w-[90%]"
      >
        {cta}
      </Button>
    </div>
  );
}
