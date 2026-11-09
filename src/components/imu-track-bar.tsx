"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { GpsChannels } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import {
  distanceAt,
  timeAtDistance,
  type SnapshotTrack,
} from "@/lib/imu/snapshot";
import { useProDict } from "@/components/pro-locale";
import { FinishFlag } from "@/components/imu-session-track";

/**
 * The track editor's bar (by request, 2026-11-09): the whole recording
 * laid out by distance, with its altitude and its speed, and a needle for
 * the start and one for the finish to drag along it — the telemetry's
 * cursor, made a handle.
 *
 * By DISTANCE and not by time: two minutes stood at the top of a trail are
 * nothing on the ground, and on a time axis they would take a third of the
 * bar. Laid out by distance the bar is the trail stretched straight — a
 * metre on the bar is a metre on the map — and the needles still say the
 * instant they stand at, which is what a track's lines are drawn from.
 */

/** Points the profile is drawn with, across the bar. */
const PROFILE_POINTS = 480;
/** GPS altitude wanders by metres from fix to fix; averaged over this much
 * ground the profile shows the terrain, not the receiver. */
const ALTITUDE_SMOOTH_M = 40;
const SPEED_SMOOTH_M = 12;
/** The start and finish never come closer than this along the trail. */
const MIN_GAP_M = 30;

const SPEED_COLOR = "#65A30D";
const ALTITUDE_COLOR = "#92400E";

/** A GPS channel's value at an instant, linear between the fixes. */
function valueAt(
  tMs: ArrayLike<number>,
  values: ArrayLike<number>,
  atMs: number,
): number {
  const n = tMs.length;
  if (atMs <= tMs[0]) return values[0];
  if (atMs >= tMs[n - 1]) return values[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tMs[mid] <= atMs) lo = mid;
    else hi = mid;
  }
  const span = tMs[hi] - tMs[lo];
  const f = span > 0 ? (atMs - tMs[lo]) / span : 0;
  return values[lo] + f * (values[hi] - values[lo]);
}

/** A moving average over `radius` points each side. */
function smooth(values: number[], radius: number): number[] {
  if (radius < 1) return values;
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (
      let j = Math.max(0, i - radius);
      j <= Math.min(values.length - 1, i + radius);
      j++
    ) {
      if (Number.isFinite(values[j])) {
        sum += values[j];
        n++;
      }
    }
    out.push(n > 0 ? sum / n : NaN);
  }
  return out;
}

type Profile = {
  totalM: number;
  /** SVG path data on a 1000 × 100 box. */
  altitudeArea: string;
  speedLine: string;
  altitudeMin: number;
  altitudeMax: number;
};

function buildProfile(track: SnapshotTrack, gps: GpsChannels): Profile | null {
  const totalM = track.distM[track.distM.length - 1];
  if (!(totalM > 0)) return null;
  const step = totalM / (PROFILE_POINTS - 1);
  const alt: number[] = [];
  const speed: number[] = [];
  for (let i = 0; i < PROFILE_POINTS; i++) {
    const atMs = timeAtDistance(track, i * step);
    alt.push(valueAt(gps.tMs, gps.altitudeM, atMs));
    speed.push(valueAt(gps.tMs, gps.speedMps, atMs));
  }
  const altS = smooth(alt, Math.round(ALTITUDE_SMOOTH_M / step / 2));
  const speedS = smooth(speed, Math.round(SPEED_SMOOTH_M / step / 2));
  const finite = altS.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const altitudeMin = Math.min(...finite);
  const altitudeMax = Math.max(...finite);
  const altSpan = Math.max(altitudeMax - altitudeMin, 10);
  const speedMax = Math.max(...speedS.filter(Number.isFinite), 1);
  const x = (i: number) => ((i / (PROFILE_POINTS - 1)) * 1000).toFixed(1);
  // Altitude in the lower 85 % of the box, speed under the same roof: two
  // shapes, one axis each, never a second scale printed on the bar.
  const yAlt = (v: number) =>
    (100 - 6 - ((v - altitudeMin) / altSpan) * 80).toFixed(1);
  const ySpeed = (v: number) => (100 - 4 - (v / speedMax) * 84).toFixed(1);
  let area = `M0,100`;
  let line = "";
  for (let i = 0; i < PROFILE_POINTS; i++) {
    const a = Number.isFinite(altS[i]) ? altS[i] : altitudeMin;
    area += ` L${x(i)},${yAlt(a)}`;
    const s = Number.isFinite(speedS[i]) ? speedS[i] : 0;
    line += `${i === 0 ? "M" : " L"}${x(i)},${ySpeed(s)}`;
  }
  area += " L1000,100 Z";
  return {
    totalM,
    altitudeArea: area,
    speedLine: line,
    altitudeMin,
    altitudeMax,
  };
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

/** A needle: the start, the finish, or a sector line by its index. */
type Handle = "start" | "finish" | number;

/** The sector lines on the bar (the owner's account, 2026-11-09). */
export type TrackBarSectors = {
  /** Each line's distance along this recording, m, in order, all between
   * the start and the finish. */
  positionsM: number[];
  /** Under each line: how many runs cross it, and whether one is lost. */
  labels: ({ text: string; warn: boolean } | null)[];
  onChange: (index: number, m: number) => void;
};

export function ImuTrackBar({
  track,
  gps,
  startMs,
  finishMs,
  circuit,
  onStart,
  onFinish,
  cursorMs,
  onHover,
  sectors,
  className,
}: {
  sectors?: TrackBarSectors | null;
  track: SnapshotTrack;
  gps: GpsChannels;
  startMs: number | null;
  /** Ignored on a circuit, which has one line. */
  finishMs: number | null;
  circuit: boolean;
  onStart: (ms: number) => void;
  onFinish: (ms: number) => void;
  /** An instant to mark on the bar — a press on the map. */
  cursorMs: number | null;
  /** The instant under the pointer, for the map's needle. */
  onHover: (ms: number | null) => void;
  className?: string;
}) {
  const t = useProDict().tracks.editor;
  const profile = useMemo(() => buildProfile(track, gps), [track, gps]);
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; pointerId: number } | null>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const [hoverM, setHoverM] = useState<number | null>(null);

  if (!profile) return null;
  const { totalM } = profile;
  const pct = (m: number) => `${(Math.min(Math.max(m / totalM, 0), 1) * 100).toFixed(3)}%`;
  const startM = startMs != null ? distanceAt(track, startMs) : null;
  const finishM =
    !circuit && finishMs != null ? distanceAt(track, finishMs) : null;
  const cursorM = cursorMs != null ? distanceAt(track, cursorMs) : null;

  const distAtClient = (clientX: number): number | null => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return f * totalM;
  };

  /** Moves a needle to a distance, kept clear of the other one. */
  const moveTo = (handle: Handle, m: number) => {
    if (typeof handle === "number") {
      if (!sectors || startM == null || finishM == null) return;
      const at = sectors.positionsM;
      const lo = (handle > 0 ? at[handle - 1] : startM) + MIN_GAP_M;
      const hi =
        (handle < at.length - 1 ? at[handle + 1] : finishM) - MIN_GAP_M;
      if (hi < lo) return;
      sectors.onChange(handle, Math.min(hi, Math.max(lo, m)));
      return;
    }
    if (handle === "start") {
      const limit = finishM != null ? finishM - MIN_GAP_M : totalM;
      onStart(timeAtDistance(track, Math.max(0, Math.min(m, limit))));
    } else {
      const limit = startM != null ? startM + MIN_GAP_M : 0;
      onFinish(timeAtDistance(track, Math.min(totalM, Math.max(m, limit))));
    }
  };

  const beginDrag = (
    handle: Handle,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    dragRef.current = { handle, pointerId: event.pointerId };
    setDragging(handle);
    try {
      barRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // No capture: moves still arrive while over the bar.
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(null);
  };

  const needle = (handle: Handle, m: number, ms: number) => (
    <div
      key={handle}
      className="absolute inset-y-0 z-10"
      style={{ left: pct(m) }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 -ml-px w-0.5",
          handle === "start" ? "bg-[#1fb980]" : "bg-foreground",
        )}
      />
      <button
        type="button"
        aria-label={handle === "start" ? t.dragStart : t.dragFinish}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          beginDrag(handle, event);
        }}
        // Centred on the needle, and tucked against the side it is nearest
        // at the bar's ends — the telemetry cursor's pill trick.
        style={{
          transform:
            m / totalM < 0.06
              ? "translateX(-10px)"
              : m / totalM > 0.94
                ? "translateX(calc(-100% + 10px))"
                : "translateX(-50%)",
        }}
        className={cn(
          "absolute -top-3 flex cursor-ew-resize touch-none items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap tabular-nums shadow-sm",
          handle === "start"
            ? "bg-[#43F3AF] text-[#101014]"
            : "bg-foreground text-background",
          dragging === handle && "ring-2 ring-ring/50",
        )}
      >
        {handle === "finish" || circuit ? (
          <FinishFlag className="size-2.5" />
        ) : (
          <span className="size-2 rounded-full bg-[#101014]" />
        )}
        {formatSessionTime(ms, true)}
      </button>
    </div>
  );

  /** A sector line: thin, its number in a disc at the foot of the bar and,
   * under it, how many runs cross it. */
  const sectorNeedle = (i: number, m: number) => {
    const label = sectors?.labels[i] ?? null;
    return (
      <div
        key={`sector-${i}`}
        className="absolute inset-y-0 z-10"
        style={{ left: pct(m) }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 -ml-px w-0.5 bg-foreground/55"
        />
        <button
          type="button"
          aria-label={t.dragSector(i + 1)}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            beginDrag(i, event);
          }}
          className={cn(
            "absolute -bottom-3 flex size-6 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background tabular-nums shadow-sm",
            dragging === i && "ring-2 ring-ring/50",
          )}
        >
          {i + 1}
        </button>
        {label && (
          <span
            className={cn(
              "absolute top-full mt-4 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap tabular-nums",
              label.warn ? "text-orange-600" : "text-muted-foreground",
            )}
          >
            {label.text}
          </span>
        )}
      </div>
    );
  };

  const hoverMs = hoverM != null ? timeAtDistance(track, hoverM) : null;

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: ALTITUDE_COLOR }}
            />
            {t.altitude} {Math.round(profile.altitudeMin)}–
            {Math.round(profile.altitudeMax)} m
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: SPEED_COLOR }}
            />
            {t.speed}
          </span>
        </span>
        {hoverM != null && hoverMs != null && (
          <span className="tabular-nums">
            {formatDistance(hoverM)} · {formatSessionTime(hoverMs, true)}
          </span>
        )}
      </div>
      <div
        ref={barRef}
        className="relative mt-5 h-36 cursor-pointer touch-none rounded-md bg-muted/60"
        onPointerDown={(event) => {
          if (
            !event.isPrimary ||
            (event.pointerType === "mouse" && event.button !== 0)
          )
            return;
          const m = distAtClient(event.clientX);
          if (m == null) return;
          event.preventDefault();
          // A press on the bar brings the nearest needle there, and the
          // drag carries on from it.
          const candidates: [Handle, number][] = [];
          if (startM != null) candidates.push(["start", startM]);
          if (finishM != null) candidates.push(["finish", finishM]);
          sectors?.positionsM.forEach((at, i) => candidates.push([i, at]));
          if (candidates.length === 0) return;
          const handle = candidates.reduce((a, b) =>
            Math.abs(m - b[1]) < Math.abs(m - a[1]) ? b : a,
          )[0];
          moveTo(handle, m);
          beginDrag(handle, event);
        }}
        onPointerMove={(event) => {
          const m = distAtClient(event.clientX);
          if (m == null) return;
          const drag = dragRef.current;
          if (drag && drag.pointerId === event.pointerId) {
            if (event.pointerType === "mouse" && event.buttons === 0) {
              dragRef.current = null;
              setDragging(null);
            } else {
              moveTo(drag.handle, m);
            }
          }
          setHoverM(m);
          onHover(timeAtDistance(track, m));
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (dragRef.current) return;
          setHoverM(null);
          onHover(null);
        }}
      >
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-hidden rounded-md"
          aria-hidden
        >
          <path
            d={profile.altitudeArea}
            fill={ALTITUDE_COLOR}
            fillOpacity={0.18}
            stroke={ALTITUDE_COLOR}
            strokeOpacity={0.7}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={profile.speedLine}
            fill="none"
            stroke={SPEED_COLOR}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Every other sector a shade darker, so the pieces read apart. */}
        {sectors &&
          startM != null &&
          finishM != null &&
          [startM, ...sectors.positionsM, finishM].map((from, i, all) =>
            i % 2 === 1 && i < all.length - 1 ? (
              <span
                key={`band-${i}`}
                aria-hidden
                className="absolute inset-y-0 bg-foreground/[0.05]"
                style={{
                  left: pct(from),
                  width: `${(((all[i + 1] - from) / totalM) * 100).toFixed(3)}%`,
                }}
              />
            ) : null,
          )}
        {/* Outside the lines, dimmed: what the track leaves out. */}
        {!circuit && startM != null && finishM != null && (
          <>
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-l-md bg-background/65"
              style={{ width: pct(startM) }}
            />
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 rounded-r-md bg-background/65"
              style={{ left: pct(finishM) }}
            />
          </>
        )}
        {(hoverM ?? cursorM) != null && !dragging && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -ml-px w-px bg-foreground/40"
            style={{ left: pct((hoverM ?? cursorM)!) }}
          />
        )}
        {startM != null && startMs != null && needle("start", startM, startMs)}
        {finishM != null && finishMs != null && needle("finish", finishM, finishMs)}
        {sectors?.positionsM.map((at, i) => sectorNeedle(i, at))}
      </div>
      <div
        className={cn(
          "flex justify-between text-[11px] text-muted-foreground tabular-nums",
          sectors ? "mt-9" : "mt-1.5",
        )}
      >
        <span>0 m</span>
        <span>{formatDistance(totalM / 2)}</span>
        <span>{formatDistance(totalM)}</span>
      </div>
    </div>
  );
}
