"use client";

import { cn } from "@/lib/utils";
import { ImuRiderGlyph } from "@/components/imu-pro-logo";

/**
 * The instant dashboard: the ride read as instruments instead of curves.
 *
 * Three gauges, all fed from the instant under the chart's cursor:
 *
 * - **The ride ring** — how far along the ride the cursor sits (distance
 *   with GPS, elapsed time without), the mint arc growing clockwise from
 *   the bottom-left the way the supplied art draws it. Inside, the figure
 *   and the current G force.
 * - **Acelerar e travar** — the band under the ring: longitudinal
 *   acceleration as a needle-and-fill gauge, blue to the right when
 *   accelerating, to the left when braking, scaled to the session's own
 *   peak like every gauge in the lab.
 * - **Movimento lateral / Empinar e mergulhar** — the two attitude tiles:
 *   the bike seen from behind and from the side, a mint horizon line
 *   rotated by the estimated lean and pitch, the ticked arc art behind.
 *   Both angles are complementary-filter ESTIMATES; the tiles print the
 *   figure alone and leave the caveat to the pill and the event cards.
 *
 * The art comes from the supplied SVG set, recolored to currentColor so it
 * survives both themes; the mint and the blue are fixed, the lab's way.
 */

const MINT = "#43F3AF";
const BLUE = "#43BBF3";
/** The braking half of the accelerate/brake band. The two sides of that
 * band are opposite signs of one channel, and one ink for both left the
 * direction to be read from which way the fill leans — a shape, at a
 * glance. Orange gives the side its own answer. */
const ORANGE = "#FF5A39";

/** The corner radius of every arc end in the ride gauge, px. A stroke cap
 * only knows flat (0) or a full half-circle (half the width, 7.5 here);
 * the segments are drawn as filled paths precisely so this can sit
 * anywhere in between. */
const CAP_RADIUS = 4;

/**
 * An annular ring segment as a FILLED path with rounded corners of a
 * chosen radius — compass degrees, 0 at the top, clockwise. This exists
 * because stroke-linecap cannot do a corner radius between flat and a
 * half-circle: each corner here is its own arc, tangent to the rim and to
 * the segment's radial cut, with the rim arcs inset by exactly the angle
 * that tangency demands. On a span too narrow for the asked radius, the
 * radius gives way (down to what fits) rather than the geometry breaking.
 *
 * The two ends carry their own radius, and either may be 0 for a square
 * cut: the band's fills meet the zero tick square and only round on the
 * end that travels.
 */
function ringSegmentPath(
  cx: number,
  cy: number,
  r: number,
  width: number,
  fromDeg: number,
  toDeg: number,
  cornerFromR = CAP_RADIUS,
  cornerToR = cornerFromR,
): string {
  const span = toDeg - fromDeg;
  if (span <= 0.1) return "";
  const pt = (rad: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(cx + rad * Math.sin(a)).toFixed(2)} ${(cy - rad * Math.cos(a)).toFixed(2)}`;
  };
  const outer = r + width / 2;
  const inner = r - width / 2;
  // The outer rim is the binding constraint on how big a corner the span
  // can carry, and the two ends share it in proportion to what they ask —
  // so a square end hands its whole half to the round one instead of
  // capping it at a share it no longer needs.
  const asked = Math.max(0, cornerFromR) + Math.max(0, cornerToR);
  const fit = (share: number) => {
    const s = Math.sin((share * Math.PI) / 180);
    return (s * outer) / (1 + s);
  };
  const clamp = (want: number) =>
    want <= 0 || asked <= 0
      ? 0
      : Math.min(want, width / 2, fit((span * want) / asked));
  const cF = clamp(cornerFromR) > 0.05 ? clamp(cornerFromR) : 0;
  const cT = clamp(cornerToR) > 0.05 ? clamp(cornerToR) : 0;
  // Each corner's inset, in degrees on its rim, and where it meets the
  // radial cut. A square end insets nothing and lands on the rim itself.
  const phi = (c: number, rad: number, sign: number) =>
    c > 0 ? (Math.asin(c / (rad + sign * c)) * 180) / Math.PI : 0;
  const edge = (c: number, rad: number, sign: number) =>
    c > 0 ? Math.sqrt((rad + sign * c) ** 2 - c * c) : rad;
  const phiOF = phi(cF, outer, -1);
  const phiOT = phi(cT, outer, -1);
  const phiIF = phi(cF, inner, +1);
  const phiIT = phi(cT, inner, +1);
  const largeO = span - phiOF - phiOT > 180 ? 1 : 0;
  const largeI = span - phiIF - phiIT > 180 ? 1 : 0;
  const arc = (c: number, target: string) =>
    c > 0 ? [`A ${c} ${c} 0 0 1 ${target}`] : [];
  return [
    `M ${pt(outer, fromDeg + phiOF)}`,
    `A ${outer} ${outer} 0 ${largeO} 1 ${pt(outer, toDeg - phiOT)}`,
    ...arc(cT, pt(edge(cT, outer, -1), toDeg)),
    `L ${pt(edge(cT, inner, +1), toDeg)}`,
    ...arc(cT, pt(inner, toDeg - phiIT)),
    `A ${inner} ${inner} 0 ${largeI} 0 ${pt(inner, fromDeg + phiIF)}`,
    ...arc(cF, pt(edge(cF, inner, +1), fromDeg)),
    `L ${pt(edge(cF, outer, -1), fromDeg)}`,
    ...arc(cF, pt(outer, fromDeg + phiOF)),
    "Z",
  ].join(" ");
}

/** Angles read to one decimal while small, whole degrees once they are
 * not — "0.2°" and "12°", never "12.0°". */
function formatAngle(deg: number): string {
  return Math.abs(deg) >= 10 ? deg.toFixed(0) : deg.toFixed(1);
}

/**
 * The gauge is ONE circle worn by two instruments: the speed ring takes
 * the top 244° and the accelerate/brake band the bottom 100°, both at the
 * same radius and thickness so together they read as a single perfect
 * ring, with an 8° breath between their ends — the supplied art's
 * geometry. The ends carry CAP_RADIUS corners, between flat and the
 * half-circle a stroke cap would force.
 */
const RING = { cx: 80, cy: 80, r: 58, from: 238, sweep: 244 };
const BAND = { half: 50 };
/** The arcs' thickness — one number for ring and band both, since they
 * wear the same circle. */
const RING_W = 18;

function RideGauge({
  progress,
  headline,
  headlineUnit,
  gForce,
  ax,
  axPeak,
}: {
  progress: number;
  headline: string;
  /** The headline's unit, set small and regular beside the figure — the
   * app's figure-and-unit idiom. */
  headlineUnit?: string;
  gForce: number;
  ax: number;
  axPeak: number;
}) {
  const p = Math.min(1, Math.max(0, progress));
  // Signed fill against the session's own peak — the gauge idiom. Clamped:
  // the peak is by definition the largest magnitude, but a float can kiss
  // past 1 and a band past its own track would be a bug, not a fact.
  const axFrac =
    axPeak > 0 ? Math.min(1, Math.max(-1, ax / axPeak)) : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg
          viewBox="0 0 160 160"
          className="h-auto w-44 text-foreground"
          aria-hidden
        >
          {/* Ring track and progress. */}
          <path
            d={ringSegmentPath(RING.cx, RING.cy, RING.r, RING_W, RING.from, RING.from + RING.sweep)}
            fill="currentColor"
            fillOpacity={0.07}
          />
          {p > 0.005 && (
            <path
              d={ringSegmentPath(RING.cx, RING.cy, RING.r, RING_W, RING.from, RING.from + RING.sweep * p)}
              fill={MINT}
            />
          )}

          {/* The accelerate/brake band completing the circle's bottom:
              zero standing at the bottom centre, fill growing right for
              acceleration and left for braking. */}
          <path
            d={ringSegmentPath(RING.cx, RING.cy, RING.r, RING_W, 180 - BAND.half, 180 + BAND.half)}
            fill="currentColor"
            fillOpacity={0.07}
          />
          {Math.abs(axFrac) > 0.01 && (
            // Acceleration fills the bottom-right (compass angles below
            // 180) in blue, braking the bottom-left in orange — the segment
            // helper wants from < to, so the sides pick their own argument
            // order.
            <path
              d={ringSegmentPath(
                RING.cx,
                RING.cy,
                RING.r,
                RING_W,
                axFrac > 0 ? 180 - axFrac * BAND.half : 180,
                axFrac > 0 ? 180 : 180 - axFrac * BAND.half,
                // Round on the travelling end, square where the fill meets
                // the zero tick: a rounded corner there reads as a gap
                // between the bar and the origin it grows out of.
                axFrac > 0 ? CAP_RADIUS : 0,
                axFrac > 0 ? 0 : CAP_RADIUS,
              )}
              fill={axFrac > 0 ? BLUE : ORANGE}
            />
          )}
          {/* The zero tick, standing taller than the band — the origin has
              to stay visible under the fill, the metric gauges' rule. */}
          <line
            x1={RING.cx}
            y1={RING.cy + RING.r - 11}
            x2={RING.cx}
            y2={RING.cy + RING.r + 11}
            stroke="currentColor"
            strokeWidth={1.5}
          />
        </svg>

        {/* The figures at the ring's heart — the circle's true centre now
            that the band shares its radius. Held as a FRACTION of the
            gauge and not in pixels: the drawing is square and sized by one
            class, so 60px of a 160px gauge stops being the heart the
            moment that class changes. */}
        <div className="absolute inset-x-0 top-[37.5%] flex flex-col items-center">
          <p className="text-lg leading-tight font-semibold tabular-nums">
            {headline}
            {headlineUnit && (
              // Small and regular, but the same ink as the figure: size and
              // weight already say it is the unit, so grey was a third
              // signal saying it again.
              <span className="ml-1 text-xs font-normal">{headlineUnit}</span>
            )}
          </p>
          <p className="mt-0.5 border-t border-border pt-0.5 text-xs leading-tight text-muted-foreground tabular-nums">
            {gForce.toFixed(2)} G
          </p>
        </div>
      </div>

      <p className="-mt-1 text-base leading-tight font-semibold tabular-nums">
        {ax.toFixed(2)} <span className="text-sm text-muted-foreground">G</span>
      </p>
      {/* The same hairline the ring's own G already wears: figure above,
          what it is below, a rule between them. All four figures on the
          panel carry it now, so they read as one idiom instead of the ring
          having a private one. */}
      <p className="mt-0.5 border-t border-border pt-0.5 text-xs leading-tight text-muted-foreground">
        Acelerar e travar
      </p>
    </div>
  );
}

/** The ticked twin-bracket dial behind each attitude tile — the supplied
 * base art, recolored to currentColor so both themes keep it visible. */
function AttitudeDialArt() {
  const ticks = [
    "M17.588 27.5078H13.1738",
    "M66.4649 27.5078H62.0508",
    "M22.9992 12.9677L19.6523 10.1001",
    "M60.0578 44.7206L56.7109 41.853",
    "M23.0563 42.1138L19.7207 44.9943",
    "M59.9919 10.2175L56.6562 13.0981",
    "M20.2796 38.1128L16.3965 40.2043",
    "M63.2776 14.9536L59.3945 17.0451",
    "M20.3531 16.7703L16.4844 14.6526",
    "M63.191 40.2192L59.3223 38.1016",
    "M18.2861 21.9795L14.0098 20.8892",
    "M65.6377 34.0525L61.3613 32.9622",
    "M18.3483 33.2695L14.084 34.4059",
    "M65.567 20.687L61.3027 21.8233",
  ];
  return (
    <g>
      <path
        d="M12.864 54.5364L17.9862 49.433C18.5811 48.8404 18.6093 47.8874 18.0451 47.2657C13.2998 42.0367 10.4098 35.1045 10.4098 27.4998C10.4098 19.895 13.2998 12.9628 18.0449 7.73378C18.6091 7.11206 18.5808 6.15917 17.986 5.5665L12.864 0.463137C12.2231 -0.175339 11.1779 -0.14949 10.5641 0.514811C4.00522 7.61344 0 17.0907 0 27.4998C0 37.9088 4.00523 47.3861 10.5641 54.4847C11.1779 55.149 12.2231 55.1749 12.864 54.5364Z"
        fill="currentColor"
        fillOpacity={0.06}
      />
      <path
        d="M62.0137 5.56647C61.4189 6.15916 61.3906 7.11206 61.9548 7.73378C66.7001 12.9628 69.5898 19.895 69.5898 27.4998C69.5898 35.1045 66.6998 42.0368 61.9547 47.2658C61.3906 47.8875 61.4186 48.8401 62.0134 49.4328C63.7114 51.1248 65.4613 52.8681 67.1366 54.5373C67.7774 55.1758 68.8218 55.149 69.4356 54.4847C75.9944 47.3861 79.9997 37.909 79.9997 27.4998C79.9997 17.0905 75.9944 7.61343 69.4356 0.514811C68.8218 -0.14949 67.7765 -0.175339 67.1357 0.463136L62.0137 5.56647Z"
        fill="currentColor"
        fillOpacity={0.06}
      />
      {ticks.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={0.5}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

/** How much bigger than the supplied art each attitude mark is drawn,
 * scaled about the horizon's centre so it stays on the line at any angle. */
const BIKE_SCALE = 1.18;

/**
 * The stroke every attitude mark is drawn with, in the art's own units.
 *
 * A stroke-width means nothing without the boxes above it: what gets
 * painted is `width × (screen size ÷ viewBox) × any scale in between`.
 * This art lives in a 96-wide viewBox rendered at 112px (`w-28`) and is
 * then scaled again by `BIKE_SCALE`, so the number written in the file is
 * the page's 1.5px divided back out through both — 1.09 here, which is
 * why the two marks cannot simply share the value they came with.
 */
const MARK_STROKE = 1.5 / ((112 / 96) * BIKE_SCALE);

/** The bike seen from behind — the lateral tile's mark, supplied art. */
function RearBikeArt() {
  return (
    <g
      stroke="currentColor"
      strokeWidth={MARK_STROKE}
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M7.87891 0V20.6035" />
      <path d="M0 1.22656L15.7568 1.22656" />
      {/* The one member the supplied art draws at double weight — the seat
          tube reading as the bike's body. It keeps the ratio rather than the
          number, so the mark's own emphasis survives the reweighting. */}
      <path
        d="M7.87891 21.3555V9.40308"
        strokeWidth={MARK_STROKE * 2}
        strokeLinecap="round"
      />
      <path d="M5.38086 15.7353V5.41863L7.87816 4.29785L10.2739 5.41863V15.7353" />
    </g>
  );
}

/** The bike seen from the side — the pitch tile's mark, supplied art. */
function SideBikeArt() {
  return (
    <g
      stroke="currentColor"
      strokeWidth={MARK_STROKE}
      strokeLinecap="square"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M0.464844 12.128C0.464844 14.6337 2.49604 16.6649 5.00165 16.6649C7.50725 16.6649 9.53843 14.6337 9.53843 12.128C9.53843 9.62231 7.50725 7.59106 5.00165 7.59106C2.49604 7.59106 0.464844 9.62231 0.464844 12.128Z" />
      <path d="M23.447 16.6649C25.9526 16.6649 27.9837 14.6337 27.9837 12.128C27.9837 9.62231 25.9526 7.59106 23.447 7.59106C20.9414 7.59106 18.9102 9.62231 18.9102 12.128C18.9102 14.6337 20.9414 16.6649 23.447 16.6649Z" />
      <path d="M23.447 12.2192L18.9102 1.30763L21.1786 0.583008" />
      <path d="M13.2638 12.0579L9.69922 3.64868" />
      <path d="M13.166 12.2359L19.6122 3.33862L13.166 7.07669L13.3009 9.19829" />
      <path d="M13.2638 12.1281H5.00195L11.4301 8.03223" />
      <path d="M8.00977 3.63013L12.2547 3.63013" />
    </g>
  );
}

/**
 * One attitude tile: the dial art fixed, and the bike WITH its horizon line
 * rotated together by the estimated angle — the supplied example art does
 * exactly this, the bike leaning as one piece with its horizon while the
 * dial stays put behind them.
 *
 * The horizon is TWO segments with the bike centred in the gap between
 * them, the way the supplied mockup draws it: the line reads as passing
 * behind the bike instead of as ground it stands on.
 */

/** Each mark's own geometry, in the art's units: how far it reaches either
 * side of the horizon's centre, and where it hangs so its middle sits on
 * the line (48, 27.5) instead of resting above it. */
const BIKE_ART = {
  rear: { halfWidth: 7.88, offset: "40.1 16.82" },
  side: { halfWidth: 13.76, offset: "33.8 18.88" },
} as const;

/** The breath between the mark's widest point and where the horizon picks
 * up again. The gap is derived from each art and not shared: the bike seen
 * from the side is nearly twice as wide as the one seen from behind, and a
 * single number would either crowd one or leave the other in a void. */
const HORIZON_PAD = 2.6;

const horizonGap = (bike: keyof typeof BIKE_ART) =>
  BIKE_ART[bike].halfWidth * BIKE_SCALE + HORIZON_PAD;

function AttitudeTile({
  title,
  angleDeg,
  subValue,
  bike,
  className,
}: {
  title: string;
  angleDeg: number;
  subValue: number;
  bike: "rear" | "side";
  className?: string;
}) {
  return (
    // The bikes say what each tile measures, so the written title came
    // out — it survives as the tile's accessible name and its hover title.
    <div
      aria-label={title}
      title={title}
      // Centred in whatever height the band ends up with: the band stretches
      // to the card's floor, and left to itself the dial would sit against
      // the rule above with all the slack pooled underneath it.
      className={cn(
        // Symmetric padding, or centring is thrown off by the difference:
        // free space splits evenly, so uneven padding lands the dial off
        // the middle by exactly the gap between the two.
        "flex flex-col items-center justify-center px-2 py-4",
        className,
      )}
    >
      <svg
        viewBox="0 0 96 55"
        className="h-auto w-28 overflow-visible text-foreground"
        aria-hidden
      >
        <g transform="translate(8 0)">
          <AttitudeDialArt />
        </g>
        <g transform={`rotate(${(-angleDeg).toFixed(1)} 48 27.5)`}>
          <line
            x1={-4}
            y1={27.5}
            x2={48 - horizonGap(bike)}
            y2={27.5}
            stroke={MINT}
            strokeWidth={1.25}
          />
          <line
            x1={48 + horizonGap(bike)}
            y1={27.5}
            x2={100}
            y2={27.5}
            stroke={MINT}
            strokeWidth={1.25}
          />
          <g
            transform={`translate(48 27.5) scale(${BIKE_SCALE}) translate(-48 -27.5) translate(${BIKE_ART[bike].offset})`}
          >
            {bike === "rear" ? <RearBikeArt /> : <SideBikeArt />}
          </g>
        </g>
      </svg>
      {/* No "(est.)" here, by decision: the dial is read at a glance while
          scrubbing, and the caveat still stands where it can be read
          properly — the "Lean (est.)" pill and the event cards' figures. */}
      {/* Pulled up into the dial's own box: the art fills the viewBox at the
          sides but nothing hangs below its middle, so the figure centred
          under the bike was reading a good 25px adrift of it. The dial's
          arcs reach the bottom corners only, and this number is short and
          centred, so it rises into that empty band without meeting them. */}
      <p className="-mt-2 text-base leading-tight font-semibold tabular-nums">
        {formatAngle(angleDeg)}
        <span className="text-sm">°</span>
      </p>
      <p className="mt-0.5 border-t border-border pt-0.5 text-xs leading-tight text-muted-foreground tabular-nums">
        {subValue.toFixed(2)} G
      </p>
    </div>
  );
}

export function ImuSessionDashboard({
  riderName,
  progress,
  headline,
  headlineUnit,
  gForce,
  ax,
  axPeak,
  ay,
  leanDeg,
  pitchDeg,
  className,
}: {
  /** Whose ride these instruments are showing — the panel's title. Null on
   * sessions imported before the rider was asked for, and then the old
   * "Dashboard" stands: a name is only worth printing when it is recorded,
   * never guessed from whoever happens to be looking. */
  riderName: string | null;
  /** How far the needle sits along the ring, 0..1 — speed against the
   * fixed dial with GPS, elapsed time without. */
  progress: number;
  /** The figure at the ring's heart: the speed, or the clock. */
  headline: string;
  /** Its unit, printed small and regular beside it. */
  headlineUnit?: string;
  gForce: number;
  ax: number;
  /** The session's own |ax| peak — the band's full end. */
  axPeak: number;
  ay: number;
  leanDeg: number;
  pitchDeg: number;
  className?: string;
}) {
  return (
    // A column so the last band can absorb whatever height the card is
    // given. Beside the chart the card is stretched to the chart's height,
    // and the attitude band ends where its own content ends — leaving the
    // rule between the two dials stopping short of the card's floor. `h-full`
    // is inert below `lg`, where nothing stretches the card and a percentage
    // height against an auto-height parent resolves back to auto.
    <div className={cn("flex h-full flex-col", className)}>
      {/* The rider's name where the panel's own name used to be: these are
          somebody's instruments, and "Dashboard" only said what the box is
          — which the box already shows. The mark and the word label the
          name; the name itself is the one part that can run long, so it is
          the one that truncates (`min-w-0`, or a flex item refuses to). */}
      <div className="flex items-center gap-2 px-5 pb-4 sm:px-[15px] sm:pt-[15px]">
        {/* 1.875 in the file paints 1.5px on the page: the art is drawn in a
            25-wide viewBox and shown at 20px, so the number is the page's
            weight divided back through that ratio. */}
        <ImuRiderGlyph className="h-auto w-5 shrink-0 text-foreground [&_path]:[stroke-width:1.875]" />
        {/* The word above the name, not beside it: it is a label for what
            follows, and side by side the two read as one phrase. Both lines
            are `leading-tight` and carry no margin between them — at this
            size the gap that shows is half-leading, the bike header's rule
            again. `min-w-0` because a flex item refuses to truncate without
            it, and the name is the part that can run long. */}
        <div className="min-w-0">
          <p className="text-xs leading-tight text-muted-foreground uppercase">
            Rider
          </p>
          {riderName && (
            // Pulled up 4px: the two boxes already touch, so what is left
            // between them is half-leading — the name's own 16px type
            // carries ~4px of air above its caps inside a 20px line box.
            // Only a negative margin reaches that; there is no gap to zero.
            <p className="-mt-1 truncate text-base leading-tight">
              {riderName}
            </p>
          )}
        </div>
      </div>
      {/* The panel's three subjects are told apart by rules that run the
          card's full width, not by boxes floating inside it — the lab's
          edge-to-edge divider idiom, the same one the analysis card and the
          Ride Load report already use. Boxes inside a box drew a second
          frame a few pixels in from the first and spent the gauges' width
          on it; a rule says "different subject" without costing anything.
          Each section carries its own padding for that reason: the card's
          own padding would hold the rules off its edges. */}
      {/* Below `lg` this panel is as wide as the page, and the instruments
          sit side by side: the ring on the left, the two attitude dials
          stacked in a column of their own to its right. In the 300px column
          at `lg` there is no width for that, so the same three sections
          stack instead. It is one flex direction that tells the two apart —
          the rules follow, turning with the axis they divide. */}
      <div className="flex flex-1 border-t border-border lg:flex-col">
        <div className="flex flex-1 items-center justify-center px-3 py-5 sm:px-[15px] lg:flex-none lg:pt-5 lg:pb-4">
          <RideGauge
            progress={progress}
            headline={headline}
            headlineUnit={headlineUnit}
            gForce={gForce}
            ax={ax}
            axPeak={axPeak}
          />
        </div>
        {/* The dials' own band: a column beside the ring, a row beneath it.
            `flex-1` on each tile splits that band evenly whichever way it
            runs, and the rule between them turns with it. */}
        <div className="flex flex-col border-l border-border lg:flex-1 lg:flex-row lg:border-t lg:border-l-0">
          <AttitudeTile
            title="Movimento lateral"
            angleDeg={leanDeg}
            subValue={ay}
            bike="rear"
            className="flex-1 border-b border-border lg:border-r lg:border-b-0"
          />
          <AttitudeTile
            title="Empinar e mergulhar"
            angleDeg={pitchDeg}
            subValue={ax}
            bike="side"
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
