"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  createTimedTrack,
  findTimedRuns,
  formatRunGap,
  formatRunTime,
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
export function ImuSessionTrackButton({
  sessionId,
  whole,
  trim,
  visibleMs,
  tracks,
  candidates,
}: {
  sessionId: string;
  /** The recording before the trim, aligned. */
  whole: ImuSessionData;
  trim: ImuSessionTrim | null;
  /** The plot's window on the WHOLE recording's clock. */
  visibleMs: [number, number];
  tracks: ImuTimedTrack[];
  candidates: ImuTrackCandidate[];
}) {
  const t = useProDict().tracks;
  const locale = useProLocale();
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
  const time = first ? formatRunTime(first.runs[0].durationMs, locale) : null;
  const label = time ? t.buttonWithTime(time) : t.button;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={cn(
          "ml-2 flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-card transition-colors hover:bg-muted",
          time ? "px-3" : "w-8",
        )}
      >
        <Flag className="size-3.5" />
        {time && (
          <span className="text-xs font-semibold tabular-nums">{time}</span>
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
            <Flag className="size-5" />
            {mode === "view" && current ? current.track.name : t.title}
          </DialogTitle>
          <DialogDescription className="mt-1">{t.description}</DialogDescription>
        </DialogHeader>

        {mode === "view" && current ? (
          <TrackView
            key={current.track.id}
            sessionId={sessionId}
            current={current}
            others={passed.filter((m) => m !== current)}
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
  candidates,
  onPick,
  onEdit,
  onNew,
  onDeleted,
}: {
  sessionId: string;
  current: Passed[number];
  others: Passed;
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
  }, [toRead, track.definition, locale]);

  const all = [...selfRows, ...[...rows.values()].flat()];
  const timed = all
    .filter((r): r is Extract<RunRow, { status: "ok" }> => r.status === "ok")
    .sort((a, b) => a.run.durationMs - b.run.durationMs);
  const pending = all.filter((r) => r.status !== "ok");
  const bestMs = timed[0]?.run.durationMs ?? null;
  const mine = current.runs[0];
  const myGap =
    bestMs != null ? formatRunGap(mine.durationMs, bestMs, locale) : null;

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
            {formatRunTime(mine.durationMs, locale)}
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
            const gap = formatRunGap(r.run.durationMs, bestMs!, locale);
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
                  {formatRunTime(r.run.durationMs, locale)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
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
                <Flag className="size-3.5" />
                {m.track.name} · {formatRunTime(m.runs[0].durationMs, locale)}
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
      <p className="text-sm text-muted-foreground">
        {timesValid ? t.formHint(formatSessionTime(fullMs)) : t.hintFormat}
      </p>
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
