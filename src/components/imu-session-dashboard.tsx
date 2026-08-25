"use client";

import { cn } from "@/lib/utils";

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
 *   Both angles are complementary-filter ESTIMATES and read as such.
 *
 * The art comes from the supplied SVG set, recolored to currentColor so it
 * survives both themes; the mint and the blue are fixed, the lab's way.
 */

const MINT = "#43F3AF";
const BLUE = "#379CB8";

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
 */
function ringSegmentPath(
  cx: number,
  cy: number,
  r: number,
  width: number,
  fromDeg: number,
  toDeg: number,
  cornerR = CAP_RADIUS,
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
  // can carry: both end insets have to fit inside it.
  const halfSpanSin = Math.sin(((span / 2) * Math.PI) / 180);
  const c = Math.min(
    cornerR,
    width / 2,
    (halfSpanSin * outer) / (1 + halfSpanSin),
  );
  if (c <= 0.05) {
    // Flat ends — a plain annular sector.
    const large = span > 180 ? 1 : 0;
    return [
      `M ${pt(outer, fromDeg)}`,
      `A ${outer} ${outer} 0 ${large} 1 ${pt(outer, toDeg)}`,
      `L ${pt(inner, toDeg)}`,
      `A ${inner} ${inner} 0 ${large} 0 ${pt(inner, fromDeg)}`,
      "Z",
    ].join(" ");
  }
  const phiO = (Math.asin(c / (outer - c)) * 180) / Math.PI;
  const phiI = (Math.asin(c / (inner + c)) * 180) / Math.PI;
  const largeO = span - 2 * phiO > 180 ? 1 : 0;
  const largeI = span - 2 * phiI > 180 ? 1 : 0;
  // Where each corner meets the radial cut, measured along it.
  const edgeO = Math.sqrt((outer - c) ** 2 - c * c);
  const edgeI = Math.sqrt((inner + c) ** 2 - c * c);
  return [
    `M ${pt(outer, fromDeg + phiO)}`,
    `A ${outer} ${outer} 0 ${largeO} 1 ${pt(outer, toDeg - phiO)}`,
    `A ${c} ${c} 0 0 1 ${pt(edgeO, toDeg)}`,
    `L ${pt(edgeI, toDeg)}`,
    `A ${c} ${c} 0 0 1 ${pt(inner, toDeg - phiI)}`,
    `A ${inner} ${inner} 0 ${largeI} 0 ${pt(inner, fromDeg + phiI)}`,
    `A ${c} ${c} 0 0 1 ${pt(edgeI, fromDeg)}`,
    `L ${pt(edgeO, fromDeg)}`,
    `A ${c} ${c} 0 0 1 ${pt(outer, fromDeg + phiO)}`,
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
          className="h-auto w-40 text-foreground"
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
            // 180), braking the bottom-left — the segment helper wants
            // from < to, so the sides pick their own argument order.
            <path
              d={ringSegmentPath(
                RING.cx,
                RING.cy,
                RING.r,
                RING_W,
                axFrac > 0 ? 180 - axFrac * BAND.half : 180,
                axFrac > 0 ? 180 : 180 - axFrac * BAND.half,
              )}
              fill={BLUE}
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
            that the band shares its radius. */}
        <div className="absolute inset-x-0 top-[60px] flex flex-col items-center">
          <p className="text-lg leading-tight font-semibold tabular-nums">
            {headline}
            {headlineUnit && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {headlineUnit}
              </span>
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
      <p className="text-xs leading-tight text-muted-foreground">
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

/** The bike seen from behind — the lateral tile's mark, supplied art. */
function RearBikeArt() {
  return (
    <g
      stroke="currentColor"
      strokeWidth={1.13}
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M7.87891 0V20.6035" />
      <path d="M0 1.22656L15.7568 1.22656" />
      <path d="M7.87891 21.3555V9.40308" strokeWidth={2.27} strokeLinecap="round" />
      <path d="M5.38086 15.7353V5.41863L7.87816 4.29785L10.2739 5.41863V15.7353" />
    </g>
  );
}

/** The bike seen from the side — the pitch tile's mark, supplied art. */
function SideBikeArt() {
  return (
    <g
      stroke="currentColor"
      strokeWidth={0.93}
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
 * One attitude tile: the dial art fixed, and the bike WITH its ground line
 * rotated together by the estimated angle — the supplied example art does
 * exactly this, the bike leaning as one piece with its horizon while the
 * dial stays put behind them.
 */
function AttitudeTile({
  title,
  angleDeg,
  subValue,
  bike,
}: {
  title: string;
  angleDeg: number;
  subValue: number;
  bike: "rear" | "side";
}) {
  return (
    // The bikes say what each tile measures, so the written title came
    // out — it survives as the tile's accessible name and its hover title.
    <div
      aria-label={title}
      title={title}
      className="flex flex-col items-center rounded-[14px] border border-border px-2 py-4"
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
            x2={100}
            y2={27.5}
            stroke={MINT}
            strokeWidth={1.25}
          />
          {bike === "rear" ? (
            <g transform="translate(40.1 7)">
              <RearBikeArt />
            </g>
          ) : (
            <g transform="translate(33.8 11)">
              <SideBikeArt />
            </g>
          )}
        </g>
      </svg>
      <p className="mt-2 text-base leading-tight font-semibold tabular-nums">
        {formatAngle(angleDeg)}
        <span className="text-sm text-muted-foreground">°</span>
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          (est.)
        </span>
      </p>
      <p className="text-xs leading-tight text-muted-foreground tabular-nums">
        {subValue.toFixed(2)} G
      </p>
    </div>
  );
}

export function ImuSessionDashboard({
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
    <div className={cn(className)}>
      <p className="text-base">Dashboard</p>
      <div className="mt-4 rounded-[14px] border border-border px-3 pt-5 pb-4">
        <RideGauge
          progress={progress}
          headline={headline}
          headlineUnit={headlineUnit}
          gForce={gForce}
          ax={ax}
          axPeak={axPeak}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <AttitudeTile
          title="Movimento lateral"
          angleDeg={leanDeg}
          subValue={ay}
          bike="rear"
        />
        <AttitudeTile
          title="Empinar e mergulhar"
          angleDeg={pitchDeg}
          subValue={ax}
          bike="side"
        />
      </div>
    </div>
  );
}
