"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, Sparkles } from "lucide-react";
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
  type PerfectRun,
  type SectorRun,
} from "@/lib/imu/perfect-run";
import type {
  ImuTimedTrack,
  ImuTrackCandidate,
} from "@/lib/imu/track-candidates";
import { setImuTrackSplits } from "@/lib/actions/imu-tracks";

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
      done({
        status: "ready",
        trackId: track.id,
        result,
        labels,
        missed: reads.length - sectorRuns.length,
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

function seconds(ms: number): string {
  return (ms / 1000).toFixed(2);
}

/** The sectors' marks: identity only, each sector named beside its dot. */
const SECTOR_COLORS = [
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
      className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted"
    >
      <Sparkles className="size-4" />
      <span>
        <span className="font-semibold tabular-nums">
          {t.line(formatRunTime(result.perfectMs))}
        </span>
        {result.gainMs > RUN_TIE_MS && (
          <span className="text-muted-foreground tabular-nums">
            {" · "}
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

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-semibold">{t.sectorsTitle}</p>
        <div className="mb-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {result.sectors.map((s, i) => (
            <span
              key={i}
              className="h-full"
              style={{
                width: `${(s.bestMs / total) * 100}%`,
                backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
              }}
            />
          ))}
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
                  style={{
                    backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
                  }}
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
        <p>{t.pool(state.riderName, state.motorbike)}</p>
        {result.excluded.length > 0 && <p>{t.excluded(result.excluded.length)}</p>}
        {state.missed > 0 && <p>{t.missed(state.missed)}</p>}
        <p>{t.theory}</p>
      </div>
    </div>
  );
}
