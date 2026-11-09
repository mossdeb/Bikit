"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProDict } from "@/components/pro-locale";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import {
  prepareSnapshotSession,
  type SnapshotGate,
  type SnapshotSession,
} from "@/lib/imu/snapshot";
import { loadWholeImuSession } from "@/lib/imu/use-imu-session";
import {
  findTimedRuns,
  formatRunTime,
  isLapTrack,
  RUN_TIE_MS,
  type TimedRun,
} from "@/lib/imu/timed-track";
import {
  createSplits,
  perfectRun,
  readSectorRun,
  sectorBoundaries,
  type PerfectRun,
  type SectorRun,
} from "@/lib/imu/perfect-run";
import type {
  ImuTimedTrack,
  ImuTrackCandidate,
} from "@/lib/imu/track-candidates";
import { setImuTrackSplits } from "@/lib/actions/imu-tracks";
import { ImuRoutePlate } from "@/components/imu-route-plate";

/**
 * Perfect Run in the Pro (2026-11-09, phase 2): the owner's account only
 * (hasPerfectRun). The page reads it once, for the first track this run
 * passes — the one the ranking names — from this rider's runs on the same
 * kind of vehicle, and hands it to the ranking's line and to the track
 * dialog's tab. The other runs' files are read here, in the browser, as the
 * track dialog reads them; only those of the same rider and vehicle are
 * downloaded at all.
 *
 * A track never split is split on the first reading — on the fastest run,
 * with the lines placed where the most of the others cross them
 * (createSplits) — and the lines are kept on the track, so the sectors stay
 * the same from one opening to the next.
 */

type RunLabel = { sessionId: string; name: string; createdAt: string | null };

export type PerfectRunState =
  | { status: "loading"; trackId: string }
  | {
      status: "unavailable";
      trackId: string;
      reason: "circuit" | "needsTwo" | "noSectors";
    }
  | {
      status: "ready";
      trackId: string;
      result: PerfectRun;
      labels: Record<string, RunLabel>;
      /** Runs of the pool that miss a sector line. */
      missed: number;
      /** The best actual run's ground, sector by sector, [lat, lon] — the
       * map's lines. */
      paths: [number, number][][];
      riderName: string | null;
      motorbike: boolean;
    };

function riderKey(name: string | null): string {
  return (name ?? "").trim().toLocaleLowerCase();
}

type Read = {
  id: string;
  label: RunLabel;
  prepared: SnapshotSession;
  run: TimedRun;
};

export function usePerfectRun({
  enabled,
  sessionId,
  riderName,
  motorbike,
  prepared,
  track,
  runs,
  candidates,
  locale,
}: {
  enabled: boolean;
  sessionId: string;
  riderName: string | null;
  motorbike: boolean;
  /** This recording, whole, prepared for the gates. */
  prepared: SnapshotSession | null;
  /** The first track it passes, and its runs on it. */
  track: ImuTimedTrack | null;
  runs: TimedRun[];
  candidates: ImuTrackCandidate[];
  locale: Locale;
}): PerfectRunState | null {
  const [state, setState] = useState<PerfectRunState | null>(null);
  const trackId = track?.id ?? null;
  const definition = track?.definition ?? null;

  useEffect(() => {
    if (!enabled || !track || !definition || !prepared) return;
    let live = true;
    const done = (next: PerfectRunState) => {
      if (live) setState(next);
    };
    if (isLapTrack(definition)) {
      done({ status: "unavailable", trackId: track.id, reason: "circuit" });
      return;
    }
    const self = candidates.find((c) => c.id === sessionId);
    const selfLabel: RunLabel = {
      sessionId,
      name: self?.name ?? "",
      createdAt: self?.createdAt ?? null,
    };
    const key = riderKey(riderName);
    const others = candidates.filter(
      (c) =>
        c.id !== sessionId &&
        track.candidateIds.includes(c.id) &&
        riderKey(c.riderName) === key &&
        c.motorbike === motorbike,
    );

    void (async () => {
      const reads: Read[] = runs.map((run, k) => ({
        id: `${sessionId}:${k}`,
        label: selfLabel,
        prepared,
        run,
      }));
      const loaded = await Promise.all(
        others.map(async (c) => {
          const r = await loadWholeImuSession(
            c.storagePath,
            c.mountOrientation,
            locale,
          );
          return r.data ? { c, p: prepareSnapshotSession(r.data) } : null;
        }),
      );
      for (const item of loaded) {
        if (!item) continue;
        findTimedRuns(item.p, definition).forEach((run, k) =>
          reads.push({
            id: `${item.c.id}:${k}`,
            label: {
              sessionId: item.c.id,
              name: item.c.name,
              createdAt: item.c.createdAt,
            },
            prepared: item.p,
            run,
          }),
        );
      }
      if (reads.length < 2) {
        done({ status: "unavailable", trackId: track.id, reason: "needsTwo" });
        return;
      }

      let splits: SnapshotGate[] | null = definition.splits ?? null;
      if (!splits || splits.length === 0) {
        const fastest = reads.reduce((a, b) =>
          b.run.durationMs < a.run.durationMs ? b : a,
        );
        splits = createSplits(
          fastest.prepared,
          definition,
          fastest.run,
          undefined,
          reads
            .filter((r) => r !== fastest)
            .map((r) => ({ prepared: r.prepared, run: r.run })),
        );
        if (splits) {
          const saved = await setImuTrackSplits({ trackId: track.id, splits });
          if (saved.status === "error")
            console.warn("Perfect Run sectors not kept:", saved.message);
        }
      }
      if (!splits) {
        done({ status: "unavailable", trackId: track.id, reason: "noSectors" });
        return;
      }

      const split = { ...definition, splits };
      const sectorRuns: SectorRun[] = [];
      const labels: Record<string, RunLabel> = {};
      for (const r of reads) {
        const read = readSectorRun(r.prepared, split, r.run, {
          id: r.id,
          sessionId: r.label.sessionId,
          riderName,
          motorbike,
        });
        if (!read) continue;
        sectorRuns.push(read);
        labels[r.id] = r.label;
      }
      const result = perfectRun(sectorRuns);
      if (!result) {
        done({ status: "unavailable", trackId: track.id, reason: "needsTwo" });
        return;
      }
      const bestRead = reads.find((r) => r.id === result.bestActual.id);
      done({
        status: "ready",
        trackId: track.id,
        result,
        labels,
        missed: reads.length - sectorRuns.length,
        paths: bestRead ? sectorPaths(bestRead, splits) : [],
        riderName,
        motorbike,
      });
    })();
    return () => {
      live = false;
    };
    // `track` is read through its id and definition; a new object for the
    // same track (a page refresh) must not read every file again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    trackId,
    definition,
    prepared,
    runs,
    candidates,
    sessionId,
    riderName,
    motorbike,
    locale,
  ]);

  if (!enabled || !trackId || !prepared) return null;
  if (!state || state.trackId !== trackId)
    return { status: "loading", trackId };
  return state;
}

/** A run's fixes cut at its sector lines, [lat, lon]. Each piece starts
 * with the last fix before its line, so the pieces meet on the map. */
function sectorPaths(read: Read, splits: SnapshotGate[]): [number, number][][] {
  const track = read.prepared.track;
  const bounds = sectorBoundaries(read.prepared, splits, read.run);
  if (!track || !bounds) return [];
  const out: [number, number][][] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const piece: [number, number][] = [];
    for (let k = 0; k < track.tMs.length; k++) {
      const t = track.tMs[k];
      const next = track.tMs[k + 1] ?? Infinity;
      if (next < bounds[i] || t > bounds[i + 1]) continue;
      piece.push([track.latDeg[k], track.lonDeg[k]]);
    }
    out.push(piece);
  }
  return out;
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(2);
}

/** The runs' marks (by request, 2026-11-09: sectors from the same run
 * share its colour), in the order the sectors first name them. Identity
 * only: each sector's run is also written beside its dot. */
const RUN_COLORS = [
  "#6A9BE6",
  "#A38FDB",
  "#5DBE9C",
  "#E2AE55",
  "#E5866B",
  "#D886B4",
];

/** Under the ranking: the Perfect Run's time and what it would gain. */
export function PerfectRunLine({
  state,
  onOpen,
}: {
  state: PerfectRunState;
  onOpen: () => void;
}) {
  const t = useProDict().tracks.perfect;
  if (state.status !== "ready") return null;
  const { result } = state;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted lg:justify-end"
    >
      {/* The gain on a line of its own, under the time (by request,
          2026-11-09), aligned as the header aligns the ranking. */}
      <span className="flex flex-col items-start lg:items-end">
        <span className="font-semibold tabular-nums">
          {t.line(formatRunTime(result.perfectMs))}
        </span>
        {result.gainMs > RUN_TIE_MS && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t.gainShort(seconds(result.gainMs))}
          </span>
        )}
      </span>
    </button>
  );
}

/** The track dialog's Perfect Run tab — the mockup of 2026-11-09. */
export function PerfectRunView({
  state,
  sessionId,
  locale,
}: {
  state: PerfectRunState;
  sessionId: string;
  locale: Locale;
}) {
  const t = useProDict().tracks.perfect;
  if (state.status === "loading")
    return <p className="text-sm text-muted-foreground">{t.loading}</p>;
  if (state.status === "unavailable")
    return (
      <p className="text-sm text-muted-foreground">
        {state.reason === "circuit"
          ? t.circuit
          : state.reason === "noSectors"
            ? t.noSectors
            : t.needsTwo}
      </p>
    );

  const { result, labels } = state;
  const best = result.bestActual;
  const bestLabel = labels[best.id];
  const total = result.sectors.reduce((s, x) => s + x.bestMs, 0);
  const gains = result.gainMs > RUN_TIE_MS;
  const runOrder = [...new Set(result.sectors.map((s) => s.bestRunId))];
  const colorOf = (id: string) =>
    RUN_COLORS[runOrder.indexOf(id) % RUN_COLORS.length];
  const most = result.sectors.reduce<{ i: number; ms: number } | null>(
    (top, s, i) =>
      s.potentialMs != null &&
      s.potentialMs > RUN_TIE_MS &&
      (!top || s.potentialMs > top.ms)
        ? { i, ms: s.potentialMs }
        : top,
    null,
  );
  const runName = (id: string) => {
    const label = labels[id];
    if (!label) return "";
    const date = label.createdAt ? formatDate(label.createdAt, locale) : null;
    return [label.name, date].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t.bestActual}
          </p>
          <p className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {formatRunTime(best.durationMs)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {bestLabel?.name}
          </p>
        </div>
        <div className="rounded-md bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t.perfectRun}
          </p>
          <p className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {formatRunTime(result.perfectMs)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t.runs(result.runCount)}
          </p>
        </div>
      </div>

      <div className="text-center">
        {gains ? (
          <p className="flex items-center justify-center gap-1.5 font-display text-2xl font-bold tabular-nums text-[#1f8a4c] dark:text-[#43F3AF]">
            <ArrowDown className="size-5" strokeWidth={2.5} />
            {t.gain(seconds(result.gainMs))}
          </p>
        ) : (
          <p className="text-sm">{t.noGain}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {t.uncertainty(seconds(result.uncertaintyMs))}
        </p>
      </div>

      {state.paths.length > 1 && (
        <div>
          <ImuRoutePlate
            section={state.paths.flat()}
            segments={state.paths.map((points, i) => ({
              points,
              color: colorOf(result.sectors[i]?.bestRunId ?? ""),
              opacity: 1,
            }))}
            className="h-44 w-full"
          />
          {most && (
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {t.mostToGain(most.i + 1, seconds(most.ms))}
            </p>
          )}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-semibold">{t.sectorsTitle}</p>
        <div className="mb-3 flex h-2.5 gap-0.5">
          {result.sectors.map((s, i) => {
            // On hover, the run the sector came from (by request,
            // 2026-11-09) — the bar's own words, so it reads without the
            // list below.
            const tip = `${t.sector(i + 1)} · ${labels[s.bestRunId]?.name ?? ""} · ${seconds(s.bestMs)} s`;
            return (
              <span
                key={i}
                tabIndex={0}
                aria-label={tip}
                className="group relative h-full outline-none first:rounded-l-full last:rounded-r-full focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  width: `${(s.bestMs / total) * 100}%`,
                  backgroundColor: colorOf(s.bestRunId),
                }}
              >
                {/* A wider target than the 10 px bar. */}
                <span aria-hidden className="absolute -inset-y-2 inset-x-0" />
                <span
                  role="tooltip"
                  className={cn(
                    "pointer-events-none invisible absolute bottom-full z-10 mb-2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100",
                    // The end sectors' tips keep inside the dialog.
                    i === 0
                      ? "left-0"
                      : i === result.sectors.length - 1
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2",
                  )}
                >
                  <span className="font-semibold">{t.sector(i + 1)}</span>
                  {" · "}
                  {labels[s.bestRunId]?.name}
                  {" · "}
                  <span className="tabular-nums">{seconds(s.bestMs)} s</span>
                </span>
              </span>
            );
          })}
        </div>
        <ol className="divide-y divide-border">
          {result.sectors.map((s, i) => {
            const label = labels[s.bestRunId];
            const fromBest = s.bestRunId === best.id;
            const name = runName(s.bestRunId);
            const lose =
              s.potentialMs != null && s.potentialMs > RUN_TIE_MS
                ? t.potential(seconds(s.potentialMs))
                : null;
            const body = (
              <>
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorOf(s.bestRunId) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{t.sector(i + 1)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {fromBest ? `${name} · ${t.bestRunHere}` : name}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums">
                    {seconds(s.bestMs)} s
                  </span>
                  {lose && (
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {lose}
                    </span>
                  )}
                </span>
              </>
            );
            return (
              <li key={i}>
                {label && label.sessionId !== sessionId ? (
                  <Link
                    href={`/pro/sessoes/${label.sessionId}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {result.excluded.length > 0 && <p>{t.excluded(result.excluded.length)}</p>}
        {state.missed > 0 && <p>{t.missed(state.missed)}</p>}
      </div>
    </div>
  );
}
