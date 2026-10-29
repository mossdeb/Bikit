"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { proNumber } from "@/lib/i18n/pro";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { formatRunTime } from "@/lib/imu/timed-track";
import { smoothPolyline } from "@/lib/imu/track-spline";
import { topoContours } from "@/lib/topo-contours";
import type {
  SnapshotKind,
  SnapshotPassFlight,
  SnapshotPassTrace,
} from "@/lib/imu/snapshot";
import { ImuSnapshotJumpProfile } from "@/components/imu-snapshot-jump-profile";
import {
  gapToReferenceAt,
  laneTrace,
  traceSampleAt,
  traceValueAt,
} from "@/lib/imu/snapshot-simulation";

/**
 * The comparison's simulation (by request, 2026-10-28, from sketches):
 * under the passes, every one of them replayed through the stretch from
 * the entry gate on one clock — a dot each on the trail, a slider and a
 * play button to move the clock, and under the map how far each is ahead
 * of or behind the reference as they go (src/lib/imu/snapshot-simulation).
 * The list on the left follows one pass: its gap, speed and G at the
 * cursor.
 *
 * Drawn from the files the comparison has already read; nothing is
 * fetched. The plate is plain SVG like the route plates, light in a light
 * page, fitted to the passes.
 */

export interface SimulationPass {
  key: string;
  name: string;
  /** Who rode it, null when the session does not say. */
  rider: string | null;
  /** …and on which bike, null when the session does not say. */
  bike: string | null;
  isReference: boolean;
  trace: SnapshotPassTrace;
  /** Its first flight, for a jump's side view. */
  flight?: SnapshotPassFlight | null;
}

/** The passes' colours (by request, 2026-10-28, the lab's palette for
 * lines and charts), ordered so neighbours differ most: the orange and the
 * yellow, a pair hard to tell apart, are never side by side, and the two
 * violets are apart. The reference is the brand's mint. Past five the
 * passes are not replayed: the filters narrow them. */
const SERIES = [
  "text-[#5911F5]",
  "text-[#E02D5A]",
  "text-[#F5AC58]",
  "text-[#4902BD]",
  "text-[#F0DC6C]",
];
export const SIMULATION_MAX_OTHERS = SERIES.length;
const REFERENCE_INK = "text-primary";

/** A gap under this is the gates' own scatter (SNAPSHOT_TIE_MS). */
const TIE_MS = 200;
const MAP_PAD = 40;
/** Half a gate's mark across the trail, px — a tick, not its real width. */
const GATE_TICK_PX = 12;
/** Pills under the map at most, the followed pass's among them; the rest
 * wait behind a "…". */
const READOUT_PILLS = 3;
/** A jump's clock starts this long before the first take-off — about what
 * the drawn run-in takes to ride — and ends this long after the last
 * landing, ms. */
const JUMP_LEAD_MS = 300;
const JUMP_TAIL_MS = 500;
/** The passes' lines fade in over this many pieces, from this opacity at
 * the entry to full at the dot. */
const FADE_PIECES = 24;
const FADE_FROM = 0.05;
/** The plate's grey made solid — bg-muted/60 over the card. */
const PLATE_GREY = "color-mix(in srgb, var(--muted) 60%, var(--card))";
/** The trail drawn about this wide, m — a singletrack's tread — within
 * bounds in px, so a long stretch keeps a line and a short one no road. */
const TRAIL_WIDTH_M = 2.5;
const TRAIL_MIN_PX = 12;
const TRAIL_MAX_PX = 40;
const R = 6_371_000;
const RAD = Math.PI / 180;

/** "00:07.131", the header's stopwatch. */
const stopwatch = (ms: number) => formatRunTime(ms).padStart(9, "0");

const signedSeconds = (ms: number, locale: Locale) =>
  `${ms > 0 ? "+" : ms < 0 ? "−" : ""}${proNumber(Math.abs(ms) / 1000, locale, 3)} s`;

function useBoxWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ImuSnapshotSimulation({
  passes: passesAsRecorded,
  surroundings,
  notShown,
  kind,
}: {
  /** The reference first, then the others in the list's order. */
  passes: SimulationPass[];
  /** The reference session's trail around the stretch, [lat, lon]. */
  surroundings: [number, number][];
  /** Passes on show but left out of the replay. */
  notShown: number;
  /** The Snapshot's kind: a jump is drawn from the side, not on a map. */
  kind: SnapshotKind;
}) {
  const t = useProDict();
  const locale = useProLocale();
  const words = t.snapshots.simulation;
  const reference =
    passesAsRecorded.find((p) => p.isReference) ?? passesAsRecorded[0];
  // Each pass in the reference's lane: along the stretch by its own share
  // of the ground, to the side by its line less its GPS's steady offset,
  // within the trail (laneTrace). Once per set of passes, not per frame.
  const passes = useMemo(
    () =>
      passesAsRecorded.map((p) =>
        p === reference
          ? p
          : {
              ...p,
              trace: laneTrace(p.trace, reference.trace, TRAIL_WIDTH_M / 2),
            },
      ),
    [passesAsRecorded, reference],
  );
  const others = passes.filter((p) => p !== reference);
  const inkOf = (p: SimulationPass) =>
    p === reference ? REFERENCE_INK : SERIES[others.indexOf(p)];

  const totalMs = Math.max(...passes.map((p) => p.trace.durationMs));
  // A jump's clock trimmed to the flights (by request, 2026-10-29): the
  // gates stand 20 m either side of the event, so the first two seconds
  // were the run-in, the dots waiting at the plate's edge. From a moment
  // before the first take-off to a moment after the last landing.
  const flown =
    kind === "jump" ? passes.flatMap((p) => (p.flight ? [p.flight] : [])) : [];
  const clipFrom = flown.length
    ? Math.max(0, Math.min(...flown.map((f) => f.takeoffMs)) - JUMP_LEAD_MS)
    : 0;
  const clipTo = flown.length
    ? Math.min(
        totalMs,
        Math.max(...flown.map((f) => f.takeoffMs + f.airtimeMs)) + JUMP_TAIL_MS,
      )
    : totalMs;
  const [cursorMs, setCursorMs] = useState(clipFrom);
  const [playing, setPlaying] = useState(false);
  const [followKey, setFollowKey] = useState<string | null>(null);
  // The passes taken off the map and the chart by their box in the list
  // (by request, 2026-10-28). The list keeps them all.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const toggleShown = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const followed =
    passes.find((p) => p.key === followKey) ?? others[0] ?? reference;

  // Real time, from where the cursor stands — from the start again when
  // it stands at the end.
  const cursorRef = useRef(cursorMs);
  useEffect(() => {
    cursorRef.current = cursorMs;
  }, [cursorMs]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(clipTo, cursorRef.current + (now - last));
      last = now;
      cursorRef.current = next;
      setCursorMs(next);
      if (next >= clipTo) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, clipTo]);

  const gapOf = (p: SimulationPass) =>
    p === reference ? 0 : gapToReferenceAt(p.trace, reference.trace, cursorMs);
  // The readout's passes: the followed one, then the others — only those
  // on the map; a pass taken off by its box loses its pill too.
  const readoutPasses = [
    followed,
    ...passes.filter((p) => p !== followed),
  ].filter((p) => !hidden.has(p.key));
  const readoutPill = (p: SimulationPass) => {
    const gap = gapOf(p);
    const speed = speedAt(p.trace, cursorMs);
    return (
      <div
        key={p.key}
        aria-label={`${words.atCursor}: ${p.name}`}
        className="flex h-9 items-center divide-x divide-border rounded-[12px] bg-card pr-1 pl-3 text-sm whitespace-nowrap tabular-nums"
      >
        <span className="flex items-center gap-2 pr-3">
          <span
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 rounded-full bg-current",
              inkOf(p),
            )}
          />
          <span className="font-semibold">
            {p === reference
              ? words.reference
              : gap == null
                ? "—"
                : signedSeconds(gap, locale)}
          </span>
        </span>
        <span className="px-3">
          <span className="font-semibold">
            {speed == null ? "—" : proNumber(speed, locale, 1)}
          </span>{" "}
          <span className="text-muted-foreground">{words.speed}</span>
        </span>
        <span className="px-3">
          <span className="font-semibold">
            {proNumber(
              traceValueAt(p.trace, p.trace.gForce, cursorMs),
              locale,
              1,
            )}
          </span>{" "}
          <span className="text-muted-foreground">G</span>
        </span>
      </div>
    );
  };

  const readout = (
    // The passes at the cursor, in white pills in the plate's
    // corner (by request, 2026-10-28/29): the followed one first,
    // then the others on the map up to
    // READOUT_PILLS in all; the rest behind a "…" that opens beside
    // it on hover, on its own row of the wrap.
    <div className="flex flex-wrap items-end gap-2">
      {readoutPasses.slice(0, READOUT_PILLS).map((p) => readoutPill(p))}
      {readoutPasses.length > READOUT_PILLS && (
        <div
          tabIndex={0}
          aria-label={words.morePasses(readoutPasses.length - READOUT_PILLS)}
          className="group relative rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="flex h-9 items-center rounded-[12px] bg-card px-3 text-sm font-semibold">
            …
          </div>
          <div className="invisible absolute bottom-0 left-full flex flex-col gap-2 pl-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
            {readoutPasses.slice(READOUT_PILLS).map((p) => readoutPill(p))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section
      aria-labelledby="snapshot-simulation-title"
      className={cn(
        "grid gap-8 rounded-lg bg-card px-5 py-6 sm:p-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]",
        DARK_CARD_HAIRLINE,
      )}
    >
      <div className="min-w-0">
        <h2
          id="snapshot-simulation-title"
          className="font-display text-2xl leading-7 font-bold tracking-[-0.4px]"
        >
          {words.title}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">{words.intro}</p>

        <ul className="mt-7 space-y-1">
          {passes.map((p) => {
            const diff = p.trace.durationMs - reference.trace.durationMs;
            const tone =
              p === reference
                ? null
                : Math.abs(diff) <= TIE_MS
                  ? "tie"
                  : diff < 0
                    ? "better"
                    : "worse";
            return (
              <li
                key={p.key}
                className={cn(
                  "flex items-start gap-1 rounded-[12px] transition-colors hover:bg-muted/60",
                  p === followed && "bg-muted",
                )}
              >
                {/* The pass's colour as its box: filled while it is on
                    the map, an outline when taken off. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!hidden.has(p.key)}
                  aria-label={words.showOnMap(p.name)}
                  onClick={() => toggleShown(p.key)}
                  className={cn(
                    "mt-3 ml-3 flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] border-current",
                    inkOf(p),
                    !hidden.has(p.key) && "bg-current",
                  )}
                >
                  {!hidden.has(p.key) && (
                    <Check
                      className="size-3 text-card"
                      strokeWidth={3}
                      aria-hidden
                    />
                  )}
                </button>
                <button
                  type="button"
                  aria-pressed={p === followed}
                  aria-label={words.select(p.name)}
                  onClick={() => setFollowKey(p.key)}
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-3 py-3 pr-3 pl-2 text-left",
                    hidden.has(p.key) && "opacity-50",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.name}</span>
                    {(p.rider || p.bike) && (
                      // As the passes' own lines say it: "Rider · Bike".
                      <span className="block truncate text-sm text-muted-foreground">
                        {[p.rider, p.bike].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xl font-semibold tabular-nums">
                      {stopwatch(p.trace.durationMs)}
                    </span>
                  </span>
                  {tone == null ? (
                    <span className="mt-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {words.reference}
                    </span>
                  ) : (
                    <span className="mt-1 flex flex-col items-end gap-0.5">
                      <GapPill
                        tone={tone}
                        title={tone === "tie" ? words.tie : undefined}
                      >
                        {tone === "tie" ? "≈" : signedSeconds(diff, locale)}
                      </GapPill>
                      <span className="text-[11px] text-muted-foreground">
                        {words.vsReference}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {notShown > 0 && (
          <p className="mt-3 px-3 text-xs text-muted-foreground">
            {words.notShown(notShown)}
          </p>
        )}
      </div>

      <div className="min-w-0">
        {kind === "jump" ? (
          <ImuSnapshotJumpProfile
            passes={passes.filter((p) => !hidden.has(p.key))}
            framed={passes}
            reference={reference}
            followed={followed}
            inkOf={inkOf}
            cursorMs={cursorMs}
            readout={readout}
            words={words.jump}
            locale={locale}
          />
        ) : (
          <SimulationMap
            passes={passes.filter((p) => !hidden.has(p.key))}
            framed={passes}
            reference={reference}
            followed={followed}
            inkOf={inkOf}
            surroundings={surroundings}
            cursorMs={cursorMs}
            readout={readout}
          />
        )}
        {kind === "jump" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {words.jump.estimate}
          </p>
        )}

        {/* The clock. */}
        <div className="mt-4 flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => {
              if (!playing && cursorMs >= clipTo) {
                cursorRef.current = clipFrom;
                setCursorMs(clipFrom);
              }
              setPlaying(!playing);
            }}
            aria-label={playing ? words.pause : words.play}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
          >
            {playing ? (
              <Pause className="size-4 fill-current" aria-hidden />
            ) : (
              <Play
                className="size-4 translate-x-px fill-current"
                aria-hidden
              />
            )}
          </button>
          <span className="w-[86px] shrink-0 text-sm tabular-nums">
            {stopwatch(cursorMs)}
          </span>
          <input
            type="range"
            min={clipFrom}
            max={clipTo}
            step={10}
            value={cursorMs}
            aria-label={words.timeline}
            onChange={(e) => {
              setPlaying(false);
              setCursorMs(Number(e.target.value));
            }}
            // Drawn by hand, without the browser's outlined track (by
            // request, 2026-10-28): a plain bar, ink up to the cursor, and no
            // knob — the thumb is still there to drag, unseen.
            className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent"
            style={{
              background: `linear-gradient(to right, var(--foreground) ${(100 * (cursorMs - clipFrom)) / Math.max(1, clipTo - clipFrom)}%, color-mix(in srgb, var(--foreground) 12%, transparent) 0)`,
            }}
          />
          <span className="hidden w-[86px] shrink-0 text-right text-sm text-muted-foreground tabular-nums sm:block">
            {stopwatch(clipTo)}
          </span>
        </div>

        <DeltaChart
          passes={others.filter((p) => !hidden.has(p.key))}
          reference={reference}
          inkOf={inkOf}
          totalMs={totalMs}
          cursorMs={cursorMs}
          onCursor={(ms) => {
            setPlaying(false);
            setCursorMs(Math.min(clipTo, Math.max(clipFrom, ms)));
          }}
          axisLabel={words.deltaAxis}
          description={words.deltaChart}
          locale={locale}
        />
      </div>
    </section>
  );
}

function speedAt(trace: SnapshotPassTrace, ms: number): number | null {
  const { k, f } = traceSampleAt(trace, ms);
  const a = trace.speedKmh[k];
  const b = trace.speedKmh[Math.min(k + 1, trace.speedKmh.length - 1)];
  if (a == null || b == null) return null;
  return a + f * (b - a);
}

function GapPill({
  tone,
  title,
  children,
}: {
  tone: "better" | "worse" | "tie";
  title?: string;
  children: React.ReactNode;
}) {
  // The passes' own pills (SnapshotPassLine's), so a gap reads the same
  // in the list above and here.
  return (
    <span
      title={title}
      className={cn(
        "rounded-full border border-foreground px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums",
        tone === "better" &&
          "bg-foreground text-primary dark:border-[#34373d] dark:bg-[#34373d]",
        tone === "worse" &&
          "bg-foreground text-[#FF5A39] dark:border-[#34373d] dark:bg-[#34373d]",
        tone === "tie" && "bg-transparent text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function SimulationMap({
  passes,
  framed,
  reference,
  followed,
  inkOf,
  surroundings,
  cursorMs,
  readout,
}: {
  passes: SimulationPass[];
  /** All the passes, shown or not, which the map is fitted to. */
  framed: SimulationPass[];
  reference: SimulationPass;
  followed: SimulationPass;
  inkOf: (p: SimulationPass) => string;
  surroundings: [number, number][];
  cursorMs: number;
  readout: React.ReactNode;
}) {
  const [ref, W] = useBoxWidth<HTMLDivElement>();
  // The pass under the mouse and where the mouse is, for its pill.
  const [hover, setHover] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);
  const readHover = (key: string, e: ReactPointerEvent<SVGPathElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setHover({ key, x: e.clientX - box.left, y: e.clientY - box.top });
  };
  const hovered = hover && passes.find((p) => p.key === hover.key);
  const H = W < 500 ? 320 : 460;

  // Metres east and north of the reference's entry, fitted with one scale
  // on both axes, north up, on the passes — the trail around runs out of
  // the frame.
  const lat0 = reference.trace.latDeg[0];
  const lon0 = reference.trace.lonDeg[0];
  const cos = Math.cos(lat0 * RAD);
  const toXY = (lat: number, lon: number): [number, number] => [
    (lon - lon0) * RAD * R * cos,
    (lat - lat0) * RAD * R,
  ];
  // Framed on every pass, shown or not: the trail stays put while passes
  // go on and off, and with all of them off it is still drawn.
  const all = framed.flatMap((p) =>
    p.trace.latDeg.map((lat, k) => toXY(lat, p.trace.lonDeg[k])),
  );
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale =
    W > 0
      ? Math.min(
          (W - 2 * MAP_PAD) / Math.max(1, maxX - minX),
          (H - 2 * MAP_PAD) / Math.max(1, maxY - minY),
        )
      : 1;
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;
  const place = (lat: number, lon: number): [number, number] => {
    const [x, y] = toXY(lat, lon);
    return [offX + (x - minX) * scale, H - (offY + (y - minY) * scale)];
  };
  const line = (pts: [number, number][]) =>
    pts.length
      ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`
      : "";
  const tracePoints = (trace: SnapshotPassTrace, upToMs = Infinity) => {
    const { k, f } = traceSampleAt(trace, upToMs);
    const pts: [number, number][] = [];
    for (let i = 0; i <= k; i++)
      pts.push(place(trace.latDeg[i], trace.lonDeg[i]));
    if (f > 0) pts.push(dotOf(trace, upToMs));
    return pts;
  };
  const traceLine = (trace: SnapshotPassTrace, upToMs = Infinity) =>
    line(tracePoints(trace, upToMs));
  // A pass's line fading in from where it entered to its dot (by request,
  // 2026-10-28): cut into pieces that share their ends, each a shade
  // stronger than the last. Flat ends, so the pieces meet without the
  // overlap a round cap would darken.
  const fadingLine = (trace: SnapshotPassTrace, upToMs: number) => {
    const pts = tracePoints(trace, upToMs);
    const n = Math.min(FADE_PIECES, pts.length - 1);
    return Array.from({ length: Math.max(0, n) }, (_, j) => {
      const from = Math.floor((j * (pts.length - 1)) / n);
      const to = Math.floor(((j + 1) * (pts.length - 1)) / n);
      return {
        d: line(pts.slice(from, to + 1)),
        opacity: FADE_FROM + ((1 - FADE_FROM) * (j + 1)) / n,
      };
    });
  };
  const dotOf = (trace: SnapshotPassTrace, ms: number): [number, number] =>
    place(
      traceValueAt(trace, trace.latDeg, ms),
      traceValueAt(trace, trace.lonDeg, ms),
    );
  // A gate's mark where the stretch drawn ends, square across its last
  // stretch of line (by request, 2026-10-28) — not at the gate's own
  // centre and heading, which a curve and the GPS left off the drawn line,
  // so the trail's flat end and the mark are one edge.
  const stretch = (() => {
    const t = reference.trace;
    return t.latDeg.map((lat, k) => place(lat, t.lonDeg[k]));
  })();
  const gateTick = (end: "entry" | "exit") => {
    const n = stretch.length;
    const at = end === "entry" ? stretch[0] : stretch[n - 1];
    // The nearest point a pixel or more away, along the line.
    let other = at;
    for (let k = 1; k < n; k++) {
      const p = end === "entry" ? stretch[k] : stretch[n - 1 - k];
      if (Math.hypot(p[0] - at[0], p[1] - at[1]) >= 1) {
        other = p;
        break;
      }
    }
    const len = Math.hypot(other[0] - at[0], other[1] - at[1]) || 1;
    const half = Math.max(GATE_TICK_PX, trailPx / 2 + 6);
    // Across the line: its direction turned a quarter.
    const dx = (-(other[1] - at[1]) / len) * half;
    const dy = ((other[0] - at[0]) / len) * half;
    return {
      x1: at[0] - dx,
      y1: at[1] - dy,
      x2: at[0] + dx,
      y2: at[1] + dy,
    };
  };

  // The trail as wide as a trail (by request, 2026-10-28): the passes'
  // lines read as places within it, not as roads of their own.
  const trailPx = Math.min(
    TRAIL_MAX_PX,
    Math.max(TRAIL_MIN_PX, TRAIL_WIDTH_M * scale),
  );
  const trailPath = line(
    smoothPolyline(surroundings).map(([lat, lon]) => place(lat, lon)),
  );
  const stretchPath = traceLine(reference.trace);
  // Cut once per size, not per frame of the replay.
  const contours = useMemo(() => topoContours(W, H), [W, H]);
  // The followed pass on top, when it is on the map at all.
  const order = [
    ...passes.filter((p) => p !== followed),
    ...passes.filter((p) => p === followed),
  ];

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-[16px] bg-muted/60"
      style={{ height: H }}
    >
      {W > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          aria-hidden
        >
          {/* The plate: a topographic map's contour lines (by request,
              2026-10-28), made up — see topo-contours.ts. */}
          <g
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            className="text-foreground/[0.08]"
          >
            <path d={contours.lines} strokeWidth={1} />
            <path d={contours.index} strokeWidth={1.6} />
          </g>
          {/* The trail, in three layers (by request, 2026-10-28): a thin
              outline a shade darker than it, then the plate's own grey,
              solid, so the plate's lines stop at its edge instead of
              showing through, then the grey of the trail — fainter
              outside the stretch, so the ground compared stands out. In
              the dark the stretch is darker than the plate, not lighter (by
              request, 2026-10-28); the trail either side stays as it was. */}
          {[trailPath, stretchPath].map((d, i) => (
            <path
              key={`edge-${i}`}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={trailPx + 2}
              strokeLinecap="butt"
              strokeLinejoin="round"
              className="text-foreground/[0.13]"
            />
          ))}
          {[trailPath, stretchPath].map((d, i) => (
            <path
              key={`ground-${i}`}
              d={d}
              fill="none"
              style={{ stroke: PLATE_GREY }}
              strokeWidth={trailPx}
              strokeLinecap="butt"
              strokeLinejoin="round"
            />
          ))}
          <path
            d={trailPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={trailPx}
            strokeLinecap="butt"
            strokeLinejoin="round"
            className="text-foreground/[0.04]"
          />
          <path
            d={stretchPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={trailPx}
            strokeLinecap="butt"
            strokeLinejoin="round"
            className="text-foreground/[0.07] dark:text-black/35"
          />
          {(["entry", "exit"] as const).map((end) => (
            <line
              key={end}
              {...gateTick(end)}
              stroke="currentColor"
              strokeWidth={2}
              // Dashed dark grey (by request, 2026-10-28): a line on the
              // ground, not one more pass.
              strokeDasharray="4 3"
              className="text-foreground/55"
            />
          ))}
          {/* Each pass: the ground it has covered, then its dot. */}
          {order.map((p) => (
            <g key={p.key} className={inkOf(p)}>
              {fadingLine(p.trace, cursorMs).map((piece, j) => (
                <path
                  key={j}
                  d={piece.d}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={piece.opacity}
                  strokeWidth={p === followed ? 3.5 : 2.5}
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                />
              ))}
              {(() => {
                const [x, y] = dotOf(p.trace, cursorMs);
                return (
                  <circle
                    cx={x}
                    cy={y}
                    // Small and without a ring (by request, 2026-10-28).
                    r={p === followed ? 4.5 : 3.5}
                    fill="currentColor"
                  />
                );
              })()}
              {/* Wider than the line and unseen, so the mouse finds it. */}
              <path
                d={traceLine(p.trace, cursorMs)}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
                className="cursor-default"
                onPointerMove={(e) => readHover(p.key, e)}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
      )}
      <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">
        {readout}
      </div>
      {/* A soft outline round the plate (by request, 2026-10-28) — over
          the drawing, which would cover a ring of the box itself. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[16px] ring-1 ring-foreground/10 ring-inset"
      />
      {/* North, top right: on the plate's own grey, outlined (by request,
          2026-10-28). */}
      <span
        aria-hidden
        className="absolute top-3 right-3 flex size-10 flex-col items-center justify-center rounded-full border border-foreground/15 bg-[color-mix(in_srgb,var(--muted)_60%,var(--card))] text-[9px] leading-none font-bold"
      >
        <svg viewBox="0 0 10 10" className="size-3" fill="currentColor">
          <path d="M5 0 L9 9 L5 7 L1 9 Z" />
        </svg>
        N
      </span>
      {/* The run and its rider over the line the mouse is on (by request,
          2026-10-28). */}
      {hover && hovered && (
        <div
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm whitespace-nowrap shadow-sm"
          style={{
            left: Math.min(W - 80, Math.max(80, hover.x)),
            top: hover.y - 10,
          }}
        >
          <span
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 rounded-full bg-current",
              inkOf(hovered),
            )}
          />
          <span className="font-medium">{hovered.name}</span>
          {hovered.rider && (
            <span className="text-muted-foreground">{hovered.rider}</span>
          )}
        </div>
      )}
    </div>
  );
}

function DeltaChart({
  passes,
  reference,
  inkOf,
  totalMs,
  cursorMs,
  onCursor,
  axisLabel,
  description,
  locale,
}: {
  passes: SimulationPass[];
  reference: SimulationPass;
  inkOf: (p: SimulationPass) => string;
  totalMs: number;
  cursorMs: number;
  onCursor: (ms: number) => void;
  axisLabel: string;
  description: string;
  locale: Locale;
}) {
  const [ref, W] = useBoxWidth<HTMLDivElement>();
  const H = 110;
  const PAD_Y = 10;
  const step = reference.trace.stepMs;
  const steps = Math.floor(reference.trace.durationMs / step);
  const series = passes.map((p) => {
    const gaps: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const ms = k * step;
      const gap = gapToReferenceAt(p.trace, reference.trace, ms);
      if (gap != null) gaps.push([ms, gap]);
    }
    // After the reference's exit the gap stands at the final difference.
    gaps.push([totalMs, p.trace.durationMs - reference.trace.durationMs]);
    return { pass: p, gaps };
  });
  const most = Math.max(
    200,
    ...series.flatMap((s) => s.gaps.map(([, g]) => Math.abs(g))),
  );
  // A round bound above the largest gap, in seconds.
  const bound =
    [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60].find((s) => s * 1000 >= most) ??
    Math.ceil(most / 1000);
  const x = (ms: number) => (W * ms) / Math.max(1, totalMs);
  const y = (gapMs: number) =>
    H / 2 - ((H / 2 - PAD_Y) * gapMs) / (bound * 1000);

  function read(event: ReactPointerEvent<SVGSVGElement>) {
    if (
      event.pointerType === "mouse" &&
      event.buttons === 0 &&
      event.type !== "pointerdown"
    )
      return;
    const box = event.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    onCursor(Math.round(f * totalMs));
  }

  return (
    <div className="mt-5 flex items-center gap-2">
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {axisLabel}
      </span>
      <div
        className="flex w-9 shrink-0 flex-col justify-between self-stretch text-right text-[11px] text-muted-foreground tabular-nums"
        style={{ paddingBlock: PAD_Y - 7 }}
      >
        <span>+{proNumber(bound, locale, bound < 1 ? 2 : 0)}</span>
        <span>0</span>
        <span>−{proNumber(bound, locale, bound < 1 ? 2 : 0)}</span>
      </div>
      <div ref={ref} className="min-w-0 flex-1">
        {W > 0 && (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block cursor-ew-resize touch-none"
            role="img"
            aria-label={description}
            onPointerDown={read}
            onPointerMove={read}
          >
            {[PAD_Y, H / 2, H - PAD_Y].map((gy) => (
              <line
                key={gy}
                x1={0}
                x2={W}
                y1={gy}
                y2={gy}
                stroke="currentColor"
                strokeWidth={1}
                className={
                  gy === H / 2 ? "text-foreground/25" : "text-foreground/[0.08]"
                }
              />
            ))}
            {/* The reference is the zero line itself. */}
            <line
              x1={0}
              x2={x(reference.trace.durationMs)}
              y1={H / 2}
              y2={H / 2}
              stroke="currentColor"
              strokeWidth={2}
              className={inkOf(reference)}
            />
            {series.map(({ pass, gaps }) => (
              <path
                key={pass.key}
                d={`M${gaps.map(([ms, g]) => `${x(ms).toFixed(1)},${y(g).toFixed(1)}`).join(" L")}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
                className={inkOf(pass)}
              />
            ))}
            <line
              x1={x(cursorMs)}
              x2={x(cursorMs)}
              y1={0}
              y2={H}
              stroke="currentColor"
              strokeDasharray="3 3"
              className="text-foreground/60"
            />
            {series.map(({ pass }) => {
              const gap = gapToReferenceAt(
                pass.trace,
                reference.trace,
                cursorMs,
              );
              if (gap == null) return null;
              return (
                <circle
                  key={pass.key}
                  cx={x(cursorMs)}
                  cy={y(gap)}
                  r={3.5}
                  fill="currentColor"
                  className={inkOf(pass)}
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
