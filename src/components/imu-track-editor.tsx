"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProDict, useProLocale } from "@/components/pro-locale";
import type { ImuMountOrientation, ImuSessionData } from "@/lib/imu/format";
import type { ImuSessionTrim } from "@/lib/imu/trim";
import { formatSessionTime } from "@/lib/imu/derive";
import {
  createLineAt,
  distanceAt,
  lineCrossings,
  prepareSnapshotSession,
  timeAtDistance,
  type SnapshotGate,
  type SnapshotSession,
} from "@/lib/imu/snapshot";
import {
  loadWholeImuSession,
  useImuSession,
} from "@/lib/imu/use-imu-session";
import {
  createTimedTrack,
  findTimedRuns,
  LINE_HEADING_SPAN_M,
  type TimedRun,
} from "@/lib/imu/timed-track";
import {
  PERFECT_RUN_SECTORS,
  sectorBoundaries,
} from "@/lib/imu/perfect-run";
import type {
  ImuTimedTrack,
  ImuTrackCandidate,
} from "@/lib/imu/track-candidates";
import { setImuTrackSplits } from "@/lib/actions/imu-tracks";
import { ImuSessionMap, type ImuMapLine } from "@/components/imu-session-map";
import { ImuTrackBar } from "@/components/imu-track-bar";
import {
  Chip,
  FinishFlag,
  TrackEditActions,
  useTimedRuns,
  useTrackDraft,
  type Passed,
  type Prepared,
} from "@/components/imu-session-track";

/**
 * The track editor (by request, 2026-11-09): the start and finish drawn on
 * a page of their own — the map large, and under it a bar with the
 * recording's altitude and speed, where the lines are needles to drag. The
 * form beside them is the popup's, through the same useTrackDraft, so a
 * track drawn here is drawn and saved by the popup's rules. For now only
 * on the owner's account (hasPerfectRun), the sector lines' next home.
 */
/** Sector lines a track may have, as sectors: from two to twelve. */
const MIN_SECTORS = 2;
const MAX_SECTORS = 12;
/** A sector line keeps this far from its neighbours and the start and
 * finish, m — the bar's own gap. */
const SECTOR_GAP_M = 30;

/** `count` sectors of equal length between two distances: the lines. */
function evenSectors(fromM: number, toM: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 1; k < count; k++) out.push(fromM + ((toM - fromM) * k) / count);
  return out;
}

type TrackRuns = { prepared: SnapshotSession; runs: TimedRun[] }[];

/** The account's other recordings on a track, read once, with their runs
 * on it — what the sector lines are counted against. Every rider's: the
 * lines are the track's, and each rider's Perfect Run is cut by them.
 * Null while they download. */
function useTrackRuns({
  track,
  sessionId,
  candidates,
}: {
  track: ImuTimedTrack | null;
  sessionId: string;
  candidates: ImuTrackCandidate[];
}): TrackRuns | null {
  const locale = useProLocale();
  const [state, setState] = useState<{ id: string; runs: TrackRuns } | null>(
    null,
  );
  const trackId = track?.id ?? null;
  useEffect(() => {
    if (!track) return;
    let live = true;
    const others = candidates.filter(
      (c) => c.id !== sessionId && track.candidateIds.includes(c.id),
    );
    void (async () => {
      const loaded = await Promise.all(
        others.map(async (c) => {
          const r = await loadWholeImuSession(
            c.storagePath,
            c.mountOrientation,
            locale,
          );
          if (!r.data) return null;
          const prepared = prepareSnapshotSession(r.data);
          const runs = findTimedRuns(prepared, track.definition);
          return runs.length > 0 ? { prepared, runs } : null;
        }),
      );
      if (live)
        setState({
          id: track.id,
          runs: loaded.filter((x): x is TrackRuns[number] => x != null),
        });
    })();
    return () => {
      live = false;
    };
    // Read through the track's id: a refresh hands a new object for the
    // same track, and every file must not be read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, sessionId, candidates, locale]);
  if (!track) return [];
  return state?.id === track.id ? state.runs : null;
}

/** How many of the runs cross a line once inside their run. */
function crossingCount(
  gate: SnapshotGate,
  reads: { prepared: SnapshotSession; run: TimedRun }[],
): number {
  let n = 0;
  for (const { prepared, run } of reads) {
    const crossed = lineCrossings(prepared, gate).filter(
      (t) => t > run.entryMs && t < run.exitMs,
    );
    if (crossed.length === 1) n++;
  }
  return n;
}

export function ImuTrackEditor({
  sessionId,
  storagePath,
  mountOrientation,
  trim,
  tracks,
  trackId,
  candidates,
}: {
  sessionId: string;
  storagePath: string;
  mountOrientation: ImuMountOrientation | null;
  trim: ImuSessionTrim | null;
  tracks: ImuTimedTrack[];
  /** The track to edit; null draws a new one. */
  trackId: string | null;
  candidates: ImuTrackCandidate[];
}) {
  const t = useProDict().tracks;
  const { whole, error } = useImuSession(storagePath, mountOrientation);
  const timed = useTimedRuns(whole, tracks);

  if (error) return <p className="pt-8 text-sm text-destructive">{error}</p>;
  if (!whole || !timed)
    return (
      <p className="pt-8 text-sm text-muted-foreground">{t.editor.loading}</p>
    );
  const editing = trackId
    ? (timed.passed.find((m) => m.track.id === trackId) ?? null)
    : null;
  return (
    <Editor
      key={editing?.track.id ?? "new"}
      sessionId={sessionId}
      whole={whole}
      prepared={timed.prepared}
      passed={timed.passed}
      trim={trim}
      tracks={tracks}
      editing={editing}
      candidates={candidates}
    />
  );
}

function Editor({
  sessionId,
  whole,
  prepared,
  passed,
  trim,
  tracks,
  editing,
  candidates,
}: {
  sessionId: string;
  whole: ImuSessionData;
  prepared: Prepared;
  passed: Passed;
  trim: ImuSessionTrim | null;
  tracks: ImuTimedTrack[];
  editing: Passed[number] | null;
  candidates: ImuTrackCandidate[];
}) {
  const t = useProDict().tracks;
  const common = useProDict().common;
  const router = useRouter();
  const sessionHref = `/pro/sessoes/${sessionId}`;
  const route = prepared.track;
  const [splitsError, setSplitsError] = useState<string | null>(null);
  const [savingSplits, setSavingSplits] = useState(false);
  // The sector lines to keep, set below once they are known and read when
  // the track has saved.
  const gatesRef = useRef<SnapshotGate[]>([]);
  const draft = useTrackDraft({
    sessionId,
    whole,
    prepared,
    trim,
    visibleMs: trim ? [trim.startMs, trim.endMs] : [0, whole.durationMs],
    editing,
    tracks,
    onSaved: (id) => {
      const splits = gatesRef.current;
      // A circuit, or no line could be drawn: no sectors to keep.
      if (splits.length === 0) {
        router.push(sessionHref);
        return;
      }
      setSavingSplits(true);
      void setImuTrackSplits({ trackId: id, splits }).then((result) => {
        setSavingSplits(false);
        if (result.status === "error") {
          setSplitsError(t.editor.sectorsNotSaved(result.message));
          return;
        }
        router.push(sessionHref);
      });
    },
  });
  const {
    fullMs,
    circuit,
    startMs,
    finishMs,
    busy,
    error,
    sameTrack,
    timesValid,
  } = draft;
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [cursorMs, setCursorMs] = useState<number | null>(null);

  // The sector lines (by request, 2026-11-09), as distances along this
  // recording: the track's own where this run crosses them, or else six
  // equal sectors between the start and the finish.
  const startM =
    route && startMs != null ? distanceAt(route, startMs) : null;
  const finishM =
    route && !circuit && finishMs != null && finishMs > (startMs ?? 0)
      ? distanceAt(route, finishMs)
      : null;
  const storedSplits = editing?.track.definition.splits ?? null;
  const [sectorM, setSectorMState] = useState<number[]>(() => {
    if (!route || startM == null || finishM == null) return [];
    const run = editing?.runs[0];
    if (storedSplits && storedSplits.length > 0 && run) {
      const bounds = sectorBoundaries(prepared, storedSplits, run);
      if (bounds) return bounds.slice(1, -1).map((ms) => distanceAt(route, ms));
    }
    return evenSectors(startM, finishM, PERFECT_RUN_SECTORS);
  });
  // Until a line is moved or the count changed, the track's own lines are
  // kept as they were stored — redrawn from this run they would land a
  // metre or two off, and move every sector's time for nothing.
  const [touched, setTouched] = useState(false);
  const setSectorM = (next: number[]) => {
    setTouched(true);
    setSectorMState(next);
  };
  // The lines between the start and the finish as they stand now: one
  // that a moved start or finish has passed is left out.
  const inside = useMemo(
    () =>
      startM != null && finishM != null
        ? sectorM.filter(
            (m) => m >= startM + SECTOR_GAP_M && m <= finishM - SECTOR_GAP_M,
          )
        : [],
    [sectorM, startM, finishM],
  );
  const sectorsOn = !circuit && route != null && startM != null && finishM != null;
  const setCount = (count: number) => {
    if (startM == null || finishM == null) return;
    const n = Math.min(MAX_SECTORS, Math.max(MIN_SECTORS, count));
    setSectorM(evenSectors(startM, finishM, n));
  };

  // Each line as it would be drawn.
  const sectorGates = useMemo(
    () =>
      route
        ? inside.map((m) =>
            createLineAt(
              prepared,
              timeAtDistance(route, m),
              LINE_HEADING_SPAN_M,
            ),
          )
        : [],
    [prepared, route, inside],
  );
  const keepStored =
    !touched &&
    storedSplits != null &&
    storedSplits.length > 0 &&
    inside.length === sectorM.length;
  useEffect(() => {
    gatesRef.current = !sectorsOn
      ? []
      : keepStored
        ? storedSplits!
        : sectorGates.filter((g): g is SnapshotGate => g != null);
  }, [sectorGates, sectorsOn, keepStored, storedSplits]);

  // How many of the track's runs cross each line: this run as drawn now,
  // and the account's others on it as it is saved. Counted on the
  // deferred lines, so a drag stays smooth while the count catches up.
  const riderRuns = useTrackRuns({
    track: editing?.track ?? null,
    sessionId,
    candidates,
  });
  const selfRun = useMemo(() => {
    if (startMs == null || finishMs == null || circuit) return null;
    return createTimedTrack(prepared, startMs, finishMs)?.reference ?? null;
  }, [prepared, startMs, finishMs, circuit]);
  const deferredGates = useDeferredValue(sectorGates);
  const labels = useMemo(() => {
    if (!sectorsOn || riderRuns == null) return deferredGates.map(() => null);
    const reads = [
      ...(selfRun ? [{ prepared, run: selfRun }] : []),
      ...riderRuns.flatMap((r) =>
        r.runs.map((run) => ({ prepared: r.prepared, run })),
      ),
    ];
    if (reads.length === 0) return deferredGates.map(() => null);
    return deferredGates.map((gate) => {
      if (!gate) return { text: t.editor.crossing(0, reads.length), warn: true };
      const n = crossingCount(gate, reads);
      return { text: t.editor.crossing(n, reads.length), warn: n < reads.length };
    });
  }, [deferredGates, riderRuns, selfRun, prepared, sectorsOn, t.editor]);

  // The lines where they would be drawn now, for the map: the start (or a
  // circuit's one line), the sector lines and the finish.
  const lines = useMemo(() => {
    const out: ImuMapLine[] = [];
    const add = (ms: number | null, kind: ImuMapLine["kind"]) => {
      if (ms == null) return;
      const gate = createLineAt(prepared, ms, LINE_HEADING_SPAN_M);
      if (gate) out.push({ ...gate, kind });
    };
    if (circuit) add(startMs, "finish");
    else {
      add(startMs, "start");
      add(finishMs, "finish");
      for (const gate of sectorGates)
        if (gate) out.push({ ...gate, kind: "sector" });
    }
    return out;
  }, [prepared, circuit, startMs, finishMs, sectorGates]);

  const windowMs: [number, number] =
    !circuit && startMs != null && finishMs != null && finishMs > startMs
      ? [startMs, finishMs]
      : [0, fullMs];
  const others = passed.filter((m) => m !== editing);
  const gps = whole.gps;

  return (
    <div className="space-y-4 pt-4 pb-10 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-semibold">
          <FinishFlag className="size-6" />
          {editing ? t.editor.editTitle : t.editor.newTitle}
        </h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-full px-5"
            disabled={busy}
            render={<Link href={sessionHref} />}
            nativeButton={false}
          >
            {t.cancel}
          </Button>
          <Button
            variant="inverted"
            className="rounded-full px-8"
            disabled={busy || savingSplits || !timesValid || sameTrack != null}
            onClick={() => void draft.submit()}
          >
            {busy || savingSplits ? common.saving : editing ? t.save : t.create}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {gps ? (
            <ImuSessionMap
              gps={gps}
              events={[]}
              windowMs={windowMs}
              speedOn={false}
              cursorMs={hoverMs ?? cursorMs}
              onSeek={setCursorMs}
              lines={lines}
              className="h-[min(58vh,640px)] rounded-lg"
            />
          ) : (
            <p className="rounded-lg bg-card p-5 text-sm text-muted-foreground">
              {t.noGps}
            </p>
          )}
          {gps && prepared.track && (
            <div className="rounded-lg bg-card px-5 pt-5 pb-4 sm:px-6">
              <ImuTrackBar
                track={prepared.track}
                gps={gps}
                startMs={startMs}
                finishMs={finishMs}
                circuit={circuit}
                onStart={(ms) => draft.setStartText(formatSessionTime(ms, true))}
                onFinish={(ms) =>
                  draft.setFinishText(formatSessionTime(ms, true))
                }
                cursorMs={cursorMs}
                onHover={setHoverMs}
                sectors={
                  sectorsOn
                    ? {
                        positionsM: inside,
                        labels,
                        onChange: (i, m) =>
                          setSectorM(inside.map((x, k) => (k === i ? m : x))),
                      }
                    : null
                }
              />
              {sectorsOn && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <span className="text-sm font-semibold">
                    {t.editor.sectors}
                  </span>
                  <div className="flex items-center rounded-full border border-border">
                    <button
                      type="button"
                      aria-label={t.editor.fewerSectors}
                      disabled={inside.length + 1 <= MIN_SECTORS}
                      onClick={() => setCount(inside.length)}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">
                      {inside.length + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={t.editor.moreSectors}
                      disabled={inside.length + 1 >= MAX_SECTORS}
                      onClick={() => setCount(inside.length + 2)}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <Chip onClick={() => setCount(inside.length + 1)}>
                    {t.editor.evenOut}
                  </Chip>
                  {riderRuns == null && (
                    <span className="text-xs text-muted-foreground">
                      {t.editor.counting}
                    </span>
                  )}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {t.editor.hint}
                {sectorsOn && ` ${t.editor.sectorsHint}`}
              </p>
            </div>
          )}
        </div>

        <form
          className="space-y-4 self-start rounded-lg bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void draft.submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="track-name">{t.name}</Label>
            <Input
              id="track-name"
              value={draft.name}
              placeholder={t.namePlaceholder}
              onChange={(e) => draft.setName(e.target.value)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={circuit}
              onChange={(e) => draft.setCircuit(e.target.checked)}
              className="size-4 accent-foreground"
            />
            {t.circuit}
          </label>
          <div className={cn("grid gap-3", !circuit && "grid-cols-2")}>
            <div className="space-y-1.5">
              <Label htmlFor="track-start">
                {circuit ? t.finishLine : t.start}
              </Label>
              <Input
                id="track-start"
                inputMode="numeric"
                placeholder="mm:ss"
                value={draft.startText}
                onChange={(e) => draft.setStartText(e.target.value)}
                aria-invalid={startMs == null || undefined}
                className="font-mono tabular-nums"
              />
            </div>
            {!circuit && (
              <div className="space-y-1.5">
                <Label htmlFor="track-finish">{t.finish}</Label>
                <Input
                  id="track-finish"
                  inputMode="numeric"
                  placeholder="mm:ss"
                  value={draft.finishText}
                  onChange={(e) => draft.setFinishText(e.target.value)}
                  aria-invalid={finishMs == null || undefined}
                  className="font-mono tabular-nums"
                />
              </div>
            )}
          </div>
          {!circuit && (
            <div className="flex flex-wrap gap-2">
              {trim && (
                <Chip
                  onClick={() => draft.setWindow([trim.startMs, trim.endMs])}
                >
                  {t.trimWindow}
                </Chip>
              )}
              <Chip onClick={() => draft.setWindow([0, fullMs])}>
                {t.wholeRecording}
              </Chip>
            </div>
          )}
          {!timesValid && (
            <p className="text-sm text-muted-foreground">{t.hintFormat}</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {splitsError && (
            <p className="text-sm text-destructive">{splitsError}</p>
          )}
          {sameTrack && (
            <div className="space-y-3 rounded-[16px] border border-border bg-muted p-4">
              <p className="text-sm">
                {t.sameTrack(
                  sameTrack.track.name,
                  Math.round(sameTrack.startM),
                  Math.round(sameTrack.finishM),
                )}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="inverted"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => router.push(sessionHref)}
                >
                  {t.useSameTrack(sameTrack.track.name)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => void draft.submit(true)}
                >
                  {busy ? common.saving : t.createAnyway}
                </Button>
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">{t.otherTracks}</p>
              <div className="flex flex-wrap gap-2">
                {others.map((m) => (
                  <Link
                    key={m.track.id}
                    href={`/pro/sessoes/${sessionId}/pista?pista=${m.track.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <FinishFlag className="size-3.5" />
                    {m.track.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {editing && (
            <TrackEditActions
              trackId={editing.track.id}
              onNew={() => router.push(`/pro/sessoes/${sessionId}/pista`)}
              onDeleted={() => router.push(sessionHref)}
            />
          )}
        </form>
      </div>
    </div>
  );
}
