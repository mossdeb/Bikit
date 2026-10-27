"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A route drawn on a plain plate (by request, 2026-10-27, from a
 * reference): a flat dark ground with faint contour-like lines, the
 * stretch in mint — a dot where it starts, the session map's checkered
 * disc where it ends — and north in the top-right corner. No imagery: the
 * pictures are plain SVG from the points, so a list of them fetches no
 * tiles and opens no maps.
 *
 * Fitted to the box it is given, measured, so the same plate serves the
 * sessions list's 156×106 thumbnails, the Snapshots' 220×150 and their
 * full-width picture on a phone. With a `track` too, the whole ride is
 * drawn faint behind the stretch, as the Snapshots' map always showed it;
 * the frame fits the stretch and the track runs out of it.
 */

type LatLon = [number, number];

const PLATE = "#101412";
const MINT = "#43F3AF";
const RADIUS = 12;
/** The route's line, px (3 since 2026-10-27, by request: 2 read thin). */
const ROUTE_WIDTH = 3;
/** The north badge, drawn at 19px across and scaled (1.5×, by request,
 * 2026-10-27). */
const NORTH_SCALE = 1.5;
const PAD = 14;
const R = 6_371_000;
const RAD = Math.PI / 180;

export function ImuRoutePlate({
  section,
  track,
  ends = true,
  className,
}: {
  /** The stretch drawn bright and framed, first point first. */
  section: LatLon[];
  /** The whole ride, faint, behind it — omitted when the stretch is the
   * whole ride. */
  track?: LatLon[];
  /** The start dot and the finish disc — for a whole ride; a Snapshot's
   * stretch is a section of one, and has neither (by request,
   * 2026-10-27). */
  ends?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 156, h: 106 });
  const clip = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        setSize((s) =>
          s.w === Math.round(r.width) && s.h === Math.round(r.height)
            ? s
            : { w: Math.round(r.width), h: Math.round(r.height) },
        );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { w: W, h: H } = size;
  if (section.length < 2) return <div ref={ref} className={className} />;

  // Metres east and north of the stretch's first point; the stretch is
  // fitted into the plate with one scale on both axes, north up.
  const lat0 = section[0][0];
  const lon0 = section[0][1];
  const cos = Math.cos(lat0 * RAD);
  const toXY = ([lat, lon]: LatLon) => [
    (lon - lon0) * RAD * R * cos,
    (lat - lat0) * RAD * R,
  ];
  const sxy = section.map(toXY);
  const xs = sxy.map((p) => p[0]);
  const ys = sxy.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (W - 2 * PAD) / Math.max(1, maxX - minX),
    (H - 2 * PAD) / Math.max(1, maxY - minY),
  );
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;
  const place = ([x, y]: number[]) =>
    [offX + (x - minX) * scale, H - (offY + (y - minY) * scale)] as const;
  const path = (pts: (readonly [number, number])[]) =>
    `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  const bright = sxy.map(place);
  const faint = track && track.length > 1 ? track.map(toXY).map(place) : null;
  // The marks' places to a tenth of a pixel, as the lines are written: the
  // server and the browser disagree in the last digits of a cosine, and
  // unrounded the page failed to hydrate (2026-10-27).
  const tenth = (v: number) => Math.round(v * 10) / 10;
  const [sx, sy] = bright[0].map(tenth);
  const [ex, ey] = bright[bright.length - 1].map(tenth);

  // The plate's lines: gentle waves across it, the same on every plate so
  // the routes are what differ.
  const contours = Array.from({ length: Math.ceil(H / 18) }, (_, k) => {
    const y0 = 10 + k * 18;
    const amp = 4 + (k % 3) * 2;
    const phase = k * 1.3;
    const pts: string[] = [];
    for (let x = -4; x <= W + 4; x += 6)
      pts.push(`${x},${(y0 + amp * Math.sin(x / 26 + phase)).toFixed(1)}`);
    return `M${pts.join(" L")}`;
  });

  return (
    <div ref={ref} className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clip}>
            <rect width={W} height={H} rx={RADIUS} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect width={W} height={H} fill={PLATE} />
          <g fill="none" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1}>
            {contours.map((c) => (
              <path key={c} d={c} />
            ))}
          </g>
          {faint && (
            <path
              d={path(faint)}
              fill="none"
              stroke={MINT}
              strokeOpacity={0.3}
              strokeWidth={ROUTE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <path
            d={path(bright)}
            fill="none"
            stroke={MINT}
            strokeWidth={ROUTE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* The session map's own marks: a mint dot where the stretch
              begins, the checkered disc where it ends. */}
          {ends && (
            <>
              <circle cx={sx} cy={sy} r={3.5} fill={MINT} />
              <FinishDisc cx={ex} cy={ey} r={5} />
            </>
          )}
          {/* North, top-right: the arrow and the N in white in a disc of
              the plate's colour, outlined dark grey. */}
          <g transform={`translate(${W - 21} 21) scale(${NORTH_SCALE})`}>
            <circle
              r={9.5}
              fill={PLATE}
              stroke="#3a3f3d"
              strokeWidth={1}
            />
            <path
              d="M0 -0.5 V-7 M-2.5 -4.5 L0 -7 L2.5 -4.5"
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text
              y={6.5}
              textAnchor="middle"
              fontSize={6}
              fontWeight={700}
              fill="#ffffff"
            >
              N
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}

/** The finish mark of the session map (finishIconSvg there): a 4×4
 * checkerboard clipped to a disc, in a white ring. */
function FinishDisc({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const clip = useId();
  const cell = (2 * r) / 4;
  const cells = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      if ((i + j) % 2 === 0)
        cells.push(
          <rect
            key={`${i}-${j}`}
            x={cx - r + i * cell}
            y={cy - r + j * cell}
            width={cell}
            height={cell}
            fill="#1c1c1c"
          />,
        );
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} fill="#ffffff" />
        {cells}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff" strokeWidth={1} />
    </g>
  );
}
