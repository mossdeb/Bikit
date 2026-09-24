"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scissors, Undo2, Wand2 } from "lucide-react";
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
import { useProDict } from "@/components/pro-locale";
import type { ImuSessionData } from "@/lib/imu/format";
import { formatSessionTime, sessionSummary } from "@/lib/imu/derive";
import { buildTrackIndex } from "@/lib/imu/snapshot";
import {
  parseSessionTime,
  suggestTrim,
  trimSession,
  TRIM_MIN_MS,
  type ImuSessionTrim,
} from "@/lib/imu/trim";
import { setImuSessionTrim } from "@/lib/actions/imu";

/**
 * The dialog that sets a session's trim (src/lib/imu/trim.ts): where the
 * run starts and ends on the whole recording's timeline, typed as the
 * axis shows them (mm:ss, with millis if wanted). Opens on the window the
 * plot is showing — zooming onto the run and pressing the scissors is the
 * whole gesture — and can also take a guess from the GPS ("Suggest"), the
 * longest stretch above walking pace. Both are starting points; the
 * numbers are the rider's to edit.
 *
 * The times are on the WHOLE recording's clock, which is not the clock the
 * page shows once a trim is set (that one restarts at the trim). The
 * dialog says so, and prints the current trim in those terms, so a rider
 * widening a trim sees where it sits in the file and not where the page's
 * 00:00 has moved to.
 *
 * Saving hands the server the cropped session's summary — duration,
 * counts, the track's index — computed here from the parsed file, the way
 * the import does; the server only checks and writes. Errors are written
 * into the dialog, never toasted.
 */
export function ImuSessionTrimDialog({
  open,
  onOpenChange,
  sessionId,
  whole,
  trim,
  visibleMs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  /** The recording before the trim, aligned and with its events. */
  whole: ImuSessionData;
  /** The trim in force, null for none. */
  trim: ImuSessionTrim | null;
  /** The plot's window, on the WHOLE recording's clock — what the fields
   * open with. */
  visibleMs: [number, number];
}) {
  const router = useRouter();
  const t = useProDict();
  const fullMs = whole.durationMs;
  const [startText, setStartText] = useState(() =>
    formatSessionTime(visibleMs[0], true),
  );
  const [endText, setEndText] = useState(() =>
    formatSessionTime(Math.min(visibleMs[1], fullMs), true),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startMs = parseSessionTime(startText);
  const endMs = parseSessionTime(endText);
  const window: ImuSessionTrim | null =
    startMs != null &&
    endMs != null &&
    startMs >= 0 &&
    endMs > startMs &&
    endMs <= fullMs + 999
      ? { startMs, endMs: Math.min(endMs, fullMs) }
      : null;
  const tooShort =
    window != null && window.endMs - window.startMs < TRIM_MIN_MS;
  const isWhole =
    window != null && window.startMs === 0 && window.endMs >= fullMs;
  const unchanged =
    window != null &&
    trim != null &&
    window.startMs === trim.startMs &&
    window.endMs === trim.endMs;
  const valid = window != null && !tooShort && !unchanged;

  function set(next: ImuSessionTrim, why: string | null) {
    setStartText(formatSessionTime(next.startMs, true));
    setEndText(formatSessionTime(next.endMs, true));
    setNotice(why);
    setError(null);
  }

  function suggest() {
    const guess = suggestTrim(whole);
    if (!guess) {
      setNotice(whole.gps ? t.sessions.trim.noStretch : t.sessions.trim.noGps);
      return;
    }
    set(guess, t.sessions.trim.suggested);
  }

  async function save(next: ImuSessionTrim | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    // The figures the row keeps, read off the cropped session — or the
    // whole one when the trim is lifted.
    const cropped = trimSession(whole, next);
    const summary = sessionSummary(cropped);
    const result = await setImuSessionTrim({
      sessionId,
      trim: next,
      durationMs: summary.durationMs,
      sampleCount: summary.sampleCount,
      maxG: summary.maxG,
      eventCount: summary.eventCount,
      curveCount: summary.curveCount,
      jumpCount: summary.jumpCount,
      impactCount: summary.impactCount,
      airtimeMs: summary.airtimeMs,
      trackIndex: buildTrackIndex(cropped.gps),
    });
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  const keptMs = window ? window.endMs - window.startMs : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="size-5" />
            {t.sessions.trim.title}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {t.sessions.trim.description(formatSessionTime(fullMs))}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && window) void save(isWhole ? null : window);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trim-start">{t.sessions.trim.start}</Label>
              <Input
                id="trim-start"
                inputMode="numeric"
                placeholder="mm:ss"
                value={startText}
                onChange={(e) => {
                  setStartText(e.target.value);
                  setNotice(null);
                }}
                aria-invalid={startMs == null || undefined}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trim-end">{t.sessions.trim.end}</Label>
              <Input
                id="trim-end"
                inputMode="numeric"
                placeholder="mm:ss"
                value={endText}
                onChange={(e) => {
                  setEndText(e.target.value);
                  setNotice(null);
                }}
                aria-invalid={endMs == null || undefined}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <TrimChip
              onClick={() =>
                set(
                  {
                    startMs: visibleMs[0],
                    endMs: Math.min(visibleMs[1], fullMs),
                  },
                  null,
                )
              }
            >
              {t.sessions.trim.visibleWindow}
            </TrimChip>
            <TrimChip onClick={suggest}>
              <Wand2 className="size-3.5" />
              {t.sessions.trim.suggest}
            </TrimChip>
            <TrimChip onClick={() => set({ startMs: 0, endMs: fullMs }, null)}>
              {t.sessions.trim.wholeRecording}
            </TrimChip>
          </div>

          <p className="text-sm text-muted-foreground">
            {window == null
              ? t.sessions.trim.hintFormat
              : tooShort
                ? t.sessions.trim.tooShort(formatSessionTime(TRIM_MIN_MS))
                : isWhole
                  ? t.sessions.trim.isWhole
                  : t.sessions.trim.kept(
                      formatSessionTime(keptMs!),
                      formatSessionTime(fullMs),
                    )}
            {trim && (
              <>
                {" "}
                {t.sessions.trim.current(
                  formatSessionTime(trim.startMs),
                  formatSessionTime(trim.endMs),
                )}
              </>
            )}
          </p>
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="submit"
              variant="inverted"
              className="rounded-full sm:flex-1"
              disabled={busy || !valid}
            >
              {busy ? t.common.saving : t.sessions.trim.submit}
            </Button>
            {trim && (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={busy}
                onClick={() => void save(null)}
              >
                <Undo2 className="size-4" />
                {t.sessions.trim.restore}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TrimChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
