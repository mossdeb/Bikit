"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProDict } from "@/components/pro-locale";
import type { ImuMountOrientation, ImuSessionData } from "@/lib/imu/format";
import type { ImuSessionTrim } from "@/lib/imu/trim";
import { formatSessionTime } from "@/lib/imu/derive";
import { createLineAt } from "@/lib/imu/snapshot";
import { useImuSession } from "@/lib/imu/use-imu-session";
import { LINE_HEADING_SPAN_M } from "@/lib/imu/timed-track";
import type { ImuTimedTrack } from "@/lib/imu/track-candidates";
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
export function ImuTrackEditor({
  sessionId,
  storagePath,
  mountOrientation,
  trim,
  tracks,
  trackId,
}: {
  sessionId: string;
  storagePath: string;
  mountOrientation: ImuMountOrientation | null;
  trim: ImuSessionTrim | null;
  tracks: ImuTimedTrack[];
  /** The track to edit; null draws a new one. */
  trackId: string | null;
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
}: {
  sessionId: string;
  whole: ImuSessionData;
  prepared: Prepared;
  passed: Passed;
  trim: ImuSessionTrim | null;
  tracks: ImuTimedTrack[];
  editing: Passed[number] | null;
}) {
  const t = useProDict().tracks;
  const common = useProDict().common;
  const router = useRouter();
  const sessionHref = `/pro/sessoes/${sessionId}`;
  const draft = useTrackDraft({
    sessionId,
    whole,
    prepared,
    trim,
    visibleMs: trim ? [trim.startMs, trim.endMs] : [0, whole.durationMs],
    editing,
    tracks,
    onSaved: () => router.push(sessionHref),
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

  // The lines where they would be drawn now, for the map: the start (or a
  // circuit's one line) and the finish.
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
    }
    return out;
  }, [prepared, circuit, startMs, finishMs]);

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
            disabled={busy || !timesValid || sameTrack != null}
            onClick={() => void draft.submit()}
          >
            {busy ? common.saving : editing ? t.save : t.create}
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
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {t.editor.hint}
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
