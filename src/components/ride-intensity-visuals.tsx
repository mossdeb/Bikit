import type { RideIntensityBand, RideIntensityTrendDirection } from "@/lib/ride-stress";
import { cn } from "@/lib/utils";

/** One class per band, written out rather than built by template string —
 * Tailwind reads source text, so `bg-intensity-${band}` produces no CSS. */
export const INTENSITY_BAR_CLASS: Record<RideIntensityBand, string> = {
  light: "bg-intensity-light",
  moderate: "bg-intensity-moderate",
  high: "bg-intensity-high",
  extreme: "bg-intensity-extreme",
};

/** The band as a filled chip: its colour behind its own dark tint. Used where
 * the chip sits on the card itself rather than in a row of readings — the
 * explainer's worked example — and never as bare type on a light surface. */
export const INTENSITY_FILL_CLASS: Record<RideIntensityBand, string> = {
  light: "bg-intensity-light text-intensity-light-foreground",
  moderate: "bg-intensity-moderate text-intensity-moderate-foreground",
  high: "bg-intensity-high text-intensity-high-foreground",
  extreme: "bg-intensity-extreme text-intensity-extreme-foreground",
};

/** The band as type. Only ever used on the dark chip below — two of the four
 * band colours vanish as text on a white card. */
export const INTENSITY_TEXT_CLASS: Record<RideIntensityBand, string> = {
  light: "text-intensity-light",
  moderate: "text-intensity-moderate",
  high: "text-intensity-high",
  extreme: "text-intensity-extreme",
};

/**
 * The band, as it is shown everywhere: a dot, the name, one chip.
 *
 * Dark ground with the band as type, rather than the band as ground. Filled,
 * the chip was a second bar sitting above the real one in the same colour at
 * the same weight, and the eye read the pair as one measurement drawn twice.
 *
 * `--emphasis` and not `--sidebar`: the fixed near-black is a shade off the
 * dark theme's card (#1c1c1c against #1d1f23), so the pill stopped being a
 * shape there and became loose coloured text. --emphasis is the token that
 * exists for exactly this — near-black in light, lighter than a card in dark
 * — so the chip reads as a chip in both. All four band colours are light
 * enough to carry either ground.
 */
export function RideIntensityChip({
  band,
  label,
  trend,
  className,
}: {
  band: RideIntensityBand;
  label: string;
  /** Drawn inside the chip, after the label. The direction belongs to the
   * reading, so it travels with it instead of floating alongside. */
  trend?: RideIntensityTrendDirection;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // Explicit 8px and not rounded-md: this project's radius scale is
        // replaced, and md is 15px there — on a chip this tall that is still
        // a pill.
        "inline-flex items-center gap-1.5 rounded-[8px] bg-emphasis px-2.5 py-1 text-sm font-semibold",
        INTENSITY_TEXT_CLASS[band],
        className
      )}
    >
      {label}
      {trend && <TrendArrow trend={trend} className="h-3.5" />}
    </span>
  );
}

/**
 * The 0..100 bar.
 *
 * Unlike the service bars elsewhere in the app this one is NOT inverted: those
 * show health remaining and start full, this shows how hard the bike is being
 * ridden and starts empty. They look alike and mean opposite things, which is
 * exactly why this one is never painted in the health colors.
 */
export function RideIntensityBar({ value, band }: { value: number; band: RideIntensityBand }) {
  return (
    // 20px, not the 4px the service bars use. Those are one row of a list and
    // have to stay quiet; this is the headline figure of its own section, and
    // at 8px the two palest bands were a tint nobody would notice.
    <div className="h-5 w-full overflow-hidden rounded-[6px] bg-muted">
      <div
        className={cn("h-full rounded-[6px] animate-ride-load-fill", INTENSITY_BAR_CLASS[band])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/**
 * Which way the intensity has moved this week.
 *
 * Bikit's own arrows (assets/icons/geral), inlined rather than loaded as
 * files, for the same reason the install icons are: as <img> they would be
 * black drawings on a dark card. Inlined they take currentColor.
 *
 * Drawn from the geometry of those files, not their names — seta_cima.svg
 * draws a head that converges at the bottom and seta_baixo.svg one that
 * converges at the top, so the two are named the wrong way round on disk.
 *
 * No colour of its own: it inherits, which inside the chip means the band.
 * Rising is not bad and falling is not good — they are the same fact pointing
 * two ways — so the two directions are never painted differently.
 */
export function TrendArrow({ trend, className }: { trend: RideIntensityTrendDirection; className?: string }) {
  return (
    <svg
      viewBox="0 0 36 41"
      fill="none"
      stroke="currentColor"
      // 5 and not the source's 4. The stroke scales with the box, so the
      // smallest instance — the 12px one in the bike card's totals — was
      // drawing at 1.17 real pixels and reading as a hairline beside the
      // 2px lucide chevron next to it.
      strokeWidth={5}
      strokeLinecap="round"
      strokeMiterlimit={10}
      aria-hidden
      className={cn("h-4 w-auto shrink-0", className)}
    >
      {trend === "flat" ? (
        <path d="M2 20.5H33.4" />
      ) : trend === "up" ? (
        <>
          <path d="M17.39 38.36V3.34" />
          <path d="M17.29 2 2 17.29" />
          <path d="M33.4 17.29 18.1 2" />
        </>
      ) : (
        <>
          <path d="M18 2v35.02" />
          <path d="M18.1 38.36 33.4 23.07" />
          <path d="M2 23.07l15.29 15.29" />
        </>
      )}
    </svg>
  );
}

/** Geometry of the trend plot, shared by the curve and the scrubber that has
 * to map a finger position back onto it. */
export const CURVE_BOX = { width: 300, height: 96, pad: 4 } as const;

/** Always drawn against 0..100. A self-scaling y-axis would make a quiet month
 * and a brutal one produce the same picture, which is the one thing a trend
 * chart must not do. */
export function curveCoords(values: number[]): [number, number][] {
  const { width, height, pad } = CURVE_BOX;
  return values.map((value, i) => [
    pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1),
    height - pad - (Math.max(0, Math.min(100, value)) / 100) * (height - pad * 2),
  ]);
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson), as cubic béziers.
 *
 * Smoothed at all because the daily series is a sampled curve and straight
 * segments make the decay look like a staircase. Monotone and not the obvious
 * Catmull-Rom because Catmull-Rom overshoots at a sharp step: a month of zeros
 * followed by the first ride put control points at y = 101.8 in a box 96 tall,
 * which the SVG clipped — the flat stretch appeared to be cut off at the
 * bottom. Clipping was the symptom; the cause was worse, because the curve was
 * dipping below zero, drawing an intensity the bike never had. This method
 * cannot leave the interval between two samples, so it cannot invent one.
 *
 * No chart library: there is none in the project, every bar and gauge here is
 * hand-drawn, and one dependency for one sparkline would be the largest thing
 * in the bundle for the smallest thing on the page.
 */
export function curvePath(coords: [number, number][]): string {
  const n = coords.length;
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    secants.push((coords[i + 1][1] - coords[i][1]) / (coords[i + 1][0] - coords[i][0]));
  }

  // Tangent at each sample: the average of the two secants it sits between,
  // with the ends taking the only secant they have.
  const tangents: number[] = [secants[0]];
  for (let i = 1; i < n - 1; i++) tangents.push((secants[i - 1] + secants[i]) / 2);
  tangents.push(secants[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (secants[i] === 0) {
      // A flat segment stays flat: this is what keeps a month of zeros from
      // bulging between two identical samples.
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / secants[i];
    const b = tangents[i + 1] / secants[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangents[i] = t * a * secants[i];
      tangents[i + 1] = t * b * secants[i];
    }
  }

  let path = `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const third = (x2 - x1) / 3;
    const c1y = y1 + tangents[i] * third;
    const c2y = y2 - tangents[i + 1] * third;
    path += ` C ${(x1 + third).toFixed(2)} ${c1y.toFixed(2)}, ${(x2 - third).toFixed(2)} ${c2y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return path;
}
