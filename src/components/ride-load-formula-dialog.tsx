"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { BikeIcon } from "@/components/bike-icon";
import { DistanceGlyph, ElevationGlyph, HoursGlyph } from "@/components/ride-load-icons";
import { BACKDROP_CLASS, POPUP_CLASS } from "@/components/ride-load-intro-dialog";
import { cn } from "@/lib/utils";

/**
 * Why the same ride scores differently on two bikes.
 *
 * The report says a ride is worth 73 and the explainer says distance, time and
 * elevation decide it — but not that the three are weighed differently for
 * every kind of bike, which is the whole reason a 20 km road ride and a 20 km
 * enduro ride are three times apart. This card is that table, shown rather
 * than described.
 *
 * Every modality is listed, not just this bike's: the numbers only mean
 * something next to each other. Downhill giving distance 10% is a statement
 * about downhill only when the row above gives it 55%.
 *
 * Strings arrive translated and the figures arrive formatted, like the intro
 * card next door — no dictionary and no engine constant crosses into the
 * client bundle.
 */
export interface RideLoadFactorRow {
  key: "distance" | "time" | "elevation";
  /** 0..100, the weight itself. The bar is drawn to this against a full
   * width of 100, so the longest bar on the card is Downhill's 60% for time.
   * Not rescaled to fill: the bars are compared across rows, and a scale that
   * changes per row would make every modality look equally lopsided. */
  weightPercent: number;
  weightLabel: string;
}

export interface RideLoadModalityRow {
  /** A BIKE_TYPES entry: picks the drawing and names the modality. */
  bikeType: string;
  label: string;
  /** The modality this bike is scored by. Marked, and sorted to the top. */
  current: boolean;
  factors: RideLoadFactorRow[];
}

export interface RideLoadFormulaLabels {
  title: string;
  tagline: string;
  factorNames: { distance: string; time: string; elevation: string };
  referenceNote: string;
  thisBike: string;
  gotIt: string;
  rows: RideLoadModalityRow[];
}

const FACTOR_GLYPH = {
  distance: DistanceGlyph,
  time: HoursGlyph,
  // The wedge is a solid triangle where the other two are line drawings, so it
  // reads heavier at the same box size and is set smaller to match them.
  elevation: ElevationGlyph,
} as const;

const GLYPH_CLASS = {
  distance: "size-[15px]",
  time: "size-[15px]",
  elevation: "size-[11px]",
} as const;

function FactorGlyph({ factor }: { factor: RideLoadFactorRow["key"] }) {
  const Glyph = FACTOR_GLYPH[factor];
  return (
    <span className="flex w-4 shrink-0 justify-center text-muted-foreground">
      <Glyph className={GLYPH_CLASS[factor]} />
    </span>
  );
}

function ModalityRow({ row, thisBike }: { row: RideLoadModalityRow; thisBike: string }) {
  return (
    <li
      className={cn(
        "flex items-stretch overflow-hidden rounded-[14px] border",
        // The current bike's row is marked by its outline rather than a fill:
        // a filled row would compete with the muted panel that every row
        // already carries on its right half.
        row.current ? "border-foreground/30" : "border-border"
      )}
    >
      <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 px-2 py-2.5">
        <BikeIcon type={row.bikeType} plain className="h-auto w-10" />
        <span className="text-center text-xs leading-tight font-bold">{row.label}</span>
        {row.current && (
          <span className="text-center text-[10px] leading-tight text-muted-foreground">{thisBike}</span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2 bg-muted px-2.5 py-3">
        {row.factors.map((factor) => (
          <div key={factor.key} className="flex items-center gap-1.5">
            <FactorGlyph factor={factor.key} />
            {/* Not the health bars and not the Ride Load bar: this one is a
                weight, drawn in the foreground colour, because painting it in
                a band colour would say a weight belongs to a band. */}
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/12">
              <span
                className="block h-full rounded-full bg-foreground"
                style={{ width: `${factor.weightPercent}%` }}
              />
            </span>
            <span className="w-7 shrink-0 text-right tabular-nums text-[11px] leading-none font-semibold">
              {factor.weightLabel}
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}

function FormulaCard({ labels, onDismiss }: { labels: RideLoadFormulaLabels; onDismiss: () => void }) {
  return (
    <>
      <DialogPrimitive.Title className="text-center font-display text-[28px] leading-tight font-bold">
        {labels.title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-1 text-center text-base">{labels.tagline}</DialogPrimitive.Description>

      {/* The glyphs are named once here rather than nine times in the rows,
          where there is no width for a word and a bare wedge is a riddle. */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(["distance", "time", "elevation"] as const).map((factor) => (
          <span key={factor} className="flex items-center gap-1.5">
            <FactorGlyph factor={factor} />
            {labels.factorNames[factor]}
          </span>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {labels.rows.map((row) => (
          <ModalityRow key={row.bikeType} row={row} thisBike={labels.thisBike} />
        ))}
      </ul>

      <p className="mt-4 text-xs leading-snug text-muted-foreground">{labels.referenceNote}</p>

      <Button type="button" variant="inverted" size="lg" className="mt-6 w-full" onClick={onDismiss}>
        {labels.gotIt}
      </Button>
    </>
  );
}

/** Opened from the foot of the report, beside "how it works". Records nothing,
 * for the same reason that one does not. */
export function RideLoadFormulaButton({
  labels,
  buttonLabel,
  className,
}: {
  labels: RideLoadFormulaLabels;
  buttonLabel: string;
  /** See the sibling button: the pair is sized by the row that holds them. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={
          <Button type="button" variant="outline" size="sm" className={cn("bg-transparent", className)}>
            {buttonLabel}
          </Button>
        }
      />
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP_CLASS} />
        <DialogPrimitive.Popup className={POPUP_CLASS}>
          <FormulaCard labels={labels} onDismiss={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
