"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProDict, useProLocale } from "@/components/pro-locale";
import type { ImuSessionData } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import { formatDate } from "@/lib/format";
import { prepareSnapshotSession } from "@/lib/imu/snapshot";
import { parseSessionTime, type ImuSessionTrim } from "@/lib/imu/trim";
import { loadWholeImuSession } from "@/lib/imu/use-imu-session";
import { saveImuSessionTrim } from "@/components/imu-session-trim";
import {
  createTimedTrack,
  findTimedRuns,
  formatRunGap,
  formatRunTime,
  runTrimOf,
  type TimedRun,
} from "@/lib/imu/timed-track";
import type {
  ImuTimedTrack,
  ImuTrackCandidate,
} from "@/lib/imu/track-candidates";
import {
  createImuTrack,
  deleteImuTrack,
  updateImuTrack,
} from "@/lib/actions/imu-tracks";

/**
 * Start and finish (by request, 2026-10-24): the button beside the
 * scissors and its dialog. The button carries this run's time on the
 * first track it passes; the dialog lists every run on that track, timed
 * between the same two lines, and draws, redraws, renames or deletes the
 * lines. Everything is read on the WHOLE recording, never the trimmed one
 * — the lines are the stopwatch, the trim only tidies the page.
 */
/** The run's trim from the account's tracks, newest first (runTrimOf). */
function trackTrimOf(
  prepared: Prepared,
  tracks: ImuTimedTrack[],
): ImuSessionTrim | null {
  return runTrimOf(
    prepared,
    tracks.map((track) => track.definition),
  );
}

/** Within a millisecond of each other: the trim is stored rounded. */
function sameTrim(a: ImuSessionTrim | null, b: ImuSessionTrim): boolean {
  return (
    a != null &&
    Math.abs(a.startMs - b.startMs) <= 1 &&
    Math.abs(a.endMs - b.endMs) <= 1
  );
}

export function ImuSessionTrackButton({
  sessionId,
  whole,
  trim,
  trimByTrack,
  visibleMs,
  tracks,
  candidates,
}: {
  sessionId: string;
  /** The recording before the trim, aligned. */
  whole: ImuSessionData;
  trim: ImuSessionTrim | null;
  /** The trim came from a track's lines, not the scissors. */
  trimByTrack: boolean;
  /** The plot's window on the WHOLE recording's clock. */
  visibleMs: [number, number];
  tracks: ImuTimedTrack[];
  candidates: ImuTrackCandidate[];
}) {
  const t = useProDict().tracks;
  const [open, setOpen] = useState(false);
  const prepared = useMemo(() => prepareSnapshotSession(whole), [whole]);
  /** The tracks this run passes, newest track first, each with its runs. */
  const passed = useMemo(
    () =>
      tracks
        .map((track) => ({ track, runs: findTimedRuns(prepared, track.definition) }))
        .filter((m) => m.runs.length > 0),
    [tracks, prepared],
  );
  const first = passed[0];
  const time = first ? formatRunTime(first.runs[0].durationMs) : null;

  // This run trimmed to the lines, once, when its trim is anything else —
  // a track drawn, redrawn or deleted since, or a trim set by hand before.
  // And back to the whole recording when it passes no track any more but
  // its trim came from one (by request, 2026-10-24); a trim set by hand,
  // on a run no track passes, stays.
  const router = useRouter();
  const synced = useRef<string | null>(null);
  const target = useMemo(() => trackTrimOf(prepared, tracks), [prepared, tracks]);
  useEffect(() => {
    let next: ImuSessionTrim | null;
    if (target) {
      if (sameTrim(trim, target) && trimByTrack) return;
      next = target;
    } else {
      if (!trim || !trimByTrack) return;
      next = null;
    }
    const key = next ? `${next.startMs}-${next.endMs}` : "whole";
    if (synced.current === key) return;
    synced.current = key;
    void saveImuSessionTrim(sessionId, whole, next, next != null).then(
      (result) => {
        if (result.status === "ok") router.refresh();
        else console.warn("Trim to the start and finish lines:", result.message);
      },
    );
  }, [target, trim, trimByTrack, sessionId, whole, router]);
  const label = time ? t.buttonWithTime(time) : t.button;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={cn(
          "relative ml-3 flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-card transition-colors hover:bg-muted",
          time ? "px-3" : "w-8",
        )}
      >
        <FinishFlag className="size-3.5" />
        {time && (
          <span className="text-xs font-semibold tabular-nums">{time}</span>
        )}
        {/* The lines are in force on this run (by request, 2026-10-24): a
          mint disc with a tick on the pill's corner, the brand's green. */}
        {time && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#43F3AF] text-[#101014] ring-2 ring-background"
          >
            <Check className="size-2.5" strokeWidth={3.5} />
          </span>
        )}
      </button>
      {open && (
        <ImuTrackDialog
          open={open}
          onOpenChange={setOpen}
          sessionId={sessionId}
          whole={whole}
          prepared={prepared}
          trim={trim}
          visibleMs={visibleMs}
          passed={passed}
          tracks={tracks}
          candidates={candidates}
        />
      )}
    </>
  );
}

type Prepared = ReturnType<typeof prepareSnapshotSession>;
type Passed = { track: ImuTimedTrack; runs: TimedRun[] }[];

function ImuTrackDialog({
  open,
  onOpenChange,
  sessionId,
  whole,
  prepared,
  trim,
  visibleMs,
  passed,
  tracks,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  whole: ImuSessionData;
  prepared: Prepared;
  trim: ImuSessionTrim | null;
  visibleMs: [number, number];
  passed: Passed;
  tracks: ImuTimedTrack[];
  candidates: ImuTrackCandidate[];
}) {
  const t = useProDict().tracks;
  const [trackId, setTrackId] = useState<string | null>(
    passed[0]?.track.id ?? null,
  );
  const current = passed.find((m) => m.track.id === trackId) ?? null;
  // Without a track this run passes, the dialog opens on the form that
  // draws one.
  const [mode, setMode] = useState<"view" | "create" | "edit">(
    current ? "view" : "create",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FinishFlag className="size-5" />
            {mode === "view" && current ? current.track.name : t.title}
          </DialogTitle>
        </DialogHeader>

        {mode === "view" && current ? (
          <TrackView
            key={current.track.id}
            sessionId={sessionId}
            current={current}
            others={passed.filter((m) => m !== current)}
            tracks={tracks}
            candidates={candidates}
            onPick={setTrackId}
            onEdit={() => setMode("edit")}
            onNew={() => setMode("create")}
            onDeleted={() => onOpenChange(false)}
          />
        ) : (
          <TrackForm
            sessionId={sessionId}
            whole={whole}
            prepared={prepared}
            trim={trim}
            visibleMs={visibleMs}
            editing={mode === "edit" ? current : null}
            onCancel={current ? () => setMode("view") : undefined}
            onSaved={(id) => {
              setTrackId(id);
              setMode("view");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type RunRow =
  | {
      status: "ok";
      sessionId: string;
      name: string;
      riderName: string | null;
      createdAt: string | null;
      run: TimedRun;
    }
  | { status: "loading" | "error"; sessionId: string; name: string };

/** One session's runs down a track — each its own row. */
function rowsOf(
  candidate: { id: string; name: string; riderName: string | null; createdAt: string | null },
  runs: TimedRun[],
): RunRow[] {
  return runs.map((run) => ({
    status: "ok",
    sessionId: candidate.id,
    name: candidate.name,
    riderName: candidate.riderName,
    createdAt: candidate.createdAt,
    run,
  }));
}

function TrackView({
  sessionId,
  current,
  others,
  tracks,
  candidates,
  onPick,
  onEdit,
  onNew,
  onDeleted,
}: {
  sessionId: string;
  current: Passed[number];
  others: Passed;
  /** Every track of the account, newest first — which one trims a run. */
  tracks: ImuTimedTrack[];
  candidates: ImuTrackCandidate[];
  onPick: (trackId: string) => void;
  onEdit: () => void;
  onNew: () => void;
  onDeleted: () => void;
}) {
  const t = useProDict().tracks;
  const common = useProDict().common;
  const locale = useProLocale();
  const router = useRouter();
  const { track } = current;
  const self = candidates.find((c) => c.id === sessionId);
  const selfRows = rowsOf(
    {
      id: sessionId,
      name: self?.name ?? "",
      riderName: self?.riderName ?? null,
      createdAt: self?.createdAt ?? null,
    },
    current.runs,
  );
  const toRead = useMemo(
    () =>
      candidates.filter(
        (c) => c.id !== sessionId && track.candidateIds.includes(c.id),
      ),
    [candidates, sessionId, track.candidateIds],
  );
  const [rows, setRows] = useState<Map<string, RunRow[]>>(
    () =>
      new Map(
        toRead.map((c) => [
          c.id,
          [{ status: "loading", sessionId: c.id, name: c.name }],
        ]),
      ),
  );
  // The files already read while the dialog is open, by session — a
  // redraw or a switch of track reads them again from here, not the net.
  const cache = useRef(new Map<string, Promise<Prepared | null>>());
  const synced = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    for (const c of toRead) {
      let loading = cache.current.get(c.id);
      if (!loading) {
        loading = loadWholeImuSession(c.storagePath, c.mountOrientation, locale).then(
          (r) => (r.data ? prepareSnapshotSession(r.data) : null),
        );
        cache.current.set(c.id, loading);
      }
      void loading.then((p) => {
        // The other runs are trimmed to the lines as they are read, like
        // this one on its own page — once each, while the dialog is open.
        const target = p && trackTrimOf(p, tracks);
        if (
          p &&
          target &&
          !(sameTrim(c.trim, target) && c.trimByTrack) &&
          !synced.current.has(c.id)
        ) {
          synced.current.add(c.id);
          void saveImuSessionTrim(c.id, p.session, target, true);
        }
        if (!live) return;
        setRows((prev) =>
          new Map(prev).set(
            c.id,
            p
              ? rowsOf(c, findTimedRuns(p, track.definition))
              : [{ status: "error", sessionId: c.id, name: c.name }],
          ),
        );
      });
    }
    return () => {
      live = false;
    };
  }, [toRead, track.definition, tracks, locale]);

  const all = [...selfRows, ...[...rows.values()].flat()];
  const timed = all
    .filter((r): r is Extract<RunRow, { status: "ok" }> => r.status === "ok")
    .sort((a, b) => a.run.durationMs - b.run.durationMs);
  const pending = all.filter((r) => r.status !== "ok");
  const bestMs = timed[0]?.run.durationMs ?? null;
  const mine = current.runs[0];
  const myGap =
    bestMs != null ? formatRunGap(mine.durationMs, bestMs) : null;

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await deleteImuTrack(track.id);
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onDeleted();
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 rounded-md bg-muted px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t.thisRun}</p>
          <p className="font-display text-3xl font-bold tabular-nums">
            {formatRunTime(mine.durationMs)}
          </p>
        </div>
        {bestMs != null &&
          (myGap ? (
            <span className="rounded-full border border-foreground px-2.5 py-0.5 text-xs font-semibold tabular-nums">
              {myGap}
            </span>
          ) : (
            <span className="rounded-full bg-foreground px-2.5 py-0.5 text-xs font-semibold text-background">
              {t.best}
            </span>
          ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">{t.runsTitle}</p>
        <ol className="divide-y divide-border rounded-md border border-border">
          {timed.map((r, i) => {
            const gap = formatRunGap(r.run.durationMs, bestMs!);
            const isSelf = r.sessionId === sessionId;
            const body = (
              <>
                <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", isSelf && "font-semibold")}>
                    {r.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[r.riderName, r.createdAt && formatDate(r.createdAt, locale)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatRunTime(r.run.durationMs)}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {gap ?? (i === 0 ? t.best : t.tied)}
                </span>
              </>
            );
            const key = `${r.sessionId}-${r.run.entryMs}`;
            return (
              <li key={key}>
                {isSelf ? (
                  <div className="flex items-center gap-3 bg-muted/60 px-3 py-2">{body}</div>
                ) : (
                  <Link
                    href={`/pro/sessoes/${r.sessionId}`}
                    className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
          {pending.map((r) => (
            <li
              key={`${r.sessionId}-${r.status}`}
              className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground"
            >
              <span className="w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="text-xs">
                {r.status === "loading" ? t.loadingRuns : t.runFailed}
              </span>
            </li>
          ))}
        </ol>
        {timed.length <= 1 && pending.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{t.noOtherRuns}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t.tie}</p>
      </div>

      {others.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t.otherTracks}</p>
          <div className="flex flex-wrap gap-2">
            {others.map((m) => (
              <Chip key={m.track.id} onClick={() => onPick(m.track.id)}>
                <FinishFlag className="size-3.5" />
                {m.track.name} · {formatRunTime(m.runs[0].durationMs)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {confirming ? (
        <div className="space-y-3 rounded-md border border-destructive/40 p-3">
          <p className="text-sm">{t.deleteConfirm}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              className="rounded-full"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? common.saving : t.delete}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Chip onClick={onEdit}>
            <Pencil className="size-3.5" />
            {t.redefine}
          </Chip>
          <Chip onClick={onNew}>
            <Plus className="size-3.5" />
            {t.newTrack}
          </Chip>
          <Chip onClick={() => setConfirming(true)} className="text-destructive">
            <Trash2 className="size-3.5" />
            {t.delete}
          </Chip>
        </div>
      )}
    </div>
  );
}

function TrackForm({
  sessionId,
  whole,
  prepared,
  trim,
  visibleMs,
  editing,
  onCancel,
  onSaved,
}: {
  sessionId: string;
  whole: ImuSessionData;
  prepared: Prepared;
  trim: ImuSessionTrim | null;
  visibleMs: [number, number];
  /** The track being renamed or redrawn, with this run's pass of it;
   * null to draw a new one. */
  editing: Passed[number] | null;
  onCancel?: () => void;
  onSaved: (trackId: string) => void;
}) {
  const t = useProDict().tracks;
  const common = useProDict().common;
  const router = useRouter();
  const fullMs = whole.durationMs;
  // A redraw opens on where this run crosses the lines now; a new track
  // on the trim, where a rider has already marked the run, or else on the
  // window the plot shows.
  const initial: [number, number] = editing
    ? [editing.runs[0].entryMs, editing.runs[0].exitMs]
    : trim
      ? [trim.startMs, trim.endMs]
      : [visibleMs[0], Math.min(visibleMs[1], fullMs)];
  const [name, setName] = useState(editing?.track.name ?? "");
  const [startText, setStartText] = useState(formatSessionTime(initial[0], true));
  const [finishText, setFinishText] = useState(formatSessionTime(initial[1], true));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMs = parseSessionTime(startText);
  const finishMs = parseSessionTime(finishText);
  const timesValid =
    startMs != null && finishMs != null && startMs >= 0 && finishMs > startMs;
  // Times left where this run crosses the lines: only the name changes.
  const linesUnchanged =
    editing != null &&
    startText === formatSessionTime(initial[0], true) &&
    finishText === formatSessionTime(initial[1], true);

  function setWindow([a, b]: [number, number]) {
    setStartText(formatSessionTime(a, true));
    setFinishText(formatSessionTime(Math.min(b, fullMs), true));
    setError(null);
  }

  async function submit() {
    if (busy || !timesValid) return;
    if (!name.trim()) {
      setError(t.errors.nameRequired);
      return;
    }
    let redraw = null;
    if (!linesUnchanged) {
      if (!whole.gps) {
        setError(t.noGps);
        return;
      }
      const made = createTimedTrack(prepared, startMs!, Math.min(finishMs!, fullMs));
      if (!made) {
        setError(t.noLines);
        return;
      }
      redraw = { definition: made.definition, referenceSessionId: sessionId };
    }
    setBusy(true);
    setError(null);
    const result = editing
      ? await updateImuTrack({
          trackId: editing.track.id,
          name,
          ...(redraw && { redraw }),
        })
      : await createImuTrack({ name, ...redraw! });
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    router.refresh();
    onSaved(result.id);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="track-name">{t.name}</Label>
        <Input
          id="track-name"
          value={name}
          placeholder={t.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="track-start">{t.start}</Label>
          <Input
            id="track-start"
            inputMode="numeric"
            placeholder="mm:ss"
            value={startText}
            onChange={(e) => {
              setStartText(e.target.value);
              setError(null);
            }}
            aria-invalid={startMs == null || undefined}
            className="font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="track-finish">{t.finish}</Label>
          <Input
            id="track-finish"
            inputMode="numeric"
            placeholder="mm:ss"
            value={finishText}
            onChange={(e) => {
              setFinishText(e.target.value);
              setError(null);
            }}
            aria-invalid={finishMs == null || undefined}
            className="font-mono tabular-nums"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {trim && (
          <Chip onClick={() => setWindow([trim.startMs, trim.endMs])}>
            {t.trimWindow}
          </Chip>
        )}
        <Chip onClick={() => setWindow(visibleMs)}>{t.visibleWindow}</Chip>
        <Chip onClick={() => setWindow([0, fullMs])}>{t.wholeRecording}</Chip>
      </div>
      {/* Only when the times do not read — the long hint went by request,
          2026-10-24. */}
      {!timesValid && (
        <p className="text-sm text-muted-foreground">{t.hintFormat}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="submit"
          variant="inverted"
          className="rounded-full sm:flex-1"
          disabled={busy || !timesValid}
        >
          {busy ? common.saving : editing ? t.save : t.create}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy}
            onClick={onCancel}
          >
            {t.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}

function Chip({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The start and finish mark: a checkered flag (supplied art,
 * icons/bandeira.svg, 2026-10-24) in place of Lucide's plain one, drawn in
 * the ink around it.
 */
function FinishFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 38 40" fill="currentColor" className={className} aria-hidden="true">
      <path d="M0.00900656 21.3756C0.00900656 15.8337 0.0170637 10.2919 1.63562e-05 4.75006C-0.00244218 3.95094 0.272139 3.38778 0.905719 2.91496C5.00031 -0.140654 9.48637 -0.73551 14.2248 0.856294C16.8762 1.74699 19.4358 2.9231 22.0375 3.96866C23.8171 4.68389 25.6156 5.32272 27.5348 5.53818C30.3285 5.85183 32.8124 5.04005 35.0653 3.39858C35.6995 2.9365 36.3286 2.56433 37.1094 2.96725C37.9076 3.37914 37.9979 4.12514 37.9967 4.94506C37.9855 12.7272 37.9832 20.5094 38 28.2916C38.0018 29.13 37.7149 29.7151 37.0509 30.209C33.0661 33.1724 28.6973 33.8173 24.0602 32.3211C21.6189 31.5334 19.2562 30.4857 16.8739 29.5148C14.9299 28.7227 12.9924 27.9276 10.9049 27.6108C8.18971 27.1987 5.70347 27.8216 3.42874 29.3567C3.28332 29.4548 3.18862 29.7387 3.18751 29.9368C3.17202 32.7161 3.17988 35.4954 3.17512 38.2748C3.17361 39.1518 2.67797 39.7967 1.90211 39.9654C0.953559 40.1717 0.0444365 39.4305 0.0138721 38.4053C-0.00569316 37.749 0.00906798 37.0916 0.00905411 36.4346C0.00895109 31.415 0.00900656 26.3953 0.00900656 21.3756ZM13.4584 14.0125C13.3945 13.997 13.33 13.9836 13.2668 13.9656C9.91343 13.0148 6.66042 13.141 3.54453 14.8779C3.24977 15.0422 3.16922 15.2199 3.17032 15.5426C3.18136 18.776 3.17703 22.0094 3.17703 25.2429C3.17703 25.3892 3.17703 25.5356 3.17703 25.7634C6.50711 24.0414 9.9206 23.9041 13.4458 24.8485C13.4458 21.201 13.4458 17.6 13.4465 13.9999C13.7284 14.0924 14.0169 14.1681 14.2912 14.28C16.6735 15.2514 19.0497 16.2387 21.4356 17.201C22.4372 17.6049 23.4576 17.9601 24.5358 18.3622C24.5358 14.9884 24.5386 11.7401 24.5241 8.49182C24.5236 8.37993 24.3709 8.21264 24.2531 8.16572C21.8799 7.22036 19.5016 6.2886 17.124 5.35471C15.931 4.88612 14.7376 4.41873 13.4584 3.91706L13.4584 14.0125ZM24.5568 29.1243C28.0371 30.3007 31.3379 30.1174 34.4563 28.0888C34.7231 27.9152 34.8319 27.7419 34.8305 27.4098C34.8164 24.1924 34.8223 20.9749 34.8209 17.7574C34.8209 17.6166 34.8046 17.4757 34.7917 17.2682C31.5098 19.2131 28.0992 19.3816 24.5568 18.3282V29.1243Z" />
    </svg>
  );
}
