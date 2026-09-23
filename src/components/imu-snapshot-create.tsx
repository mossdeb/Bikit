"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { ImuSnapshotGlyph } from "@/components/imu-snapshot-glyph";
import {
  ImuSnapshotView,
  type ImuSnapshotCandidate,
  type ImuSnapshotRow,
  type ImuSnapshotSessionLoader,
} from "@/components/imu-snapshot-view";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createImuSnapshot,
  listImuSnapshotCandidates,
} from "@/lib/actions/imu-snapshots";
import type { ImuEvent } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import {
  createSnapshot,
  findSnapshotTwins,
  SNAPSHOT_GATE_OFFSET_M,
  SNAPSHOT_KIND_LABEL,
  snapshotKindOf,
  type SnapshotDefinition,
  type SnapshotSession,
} from "@/lib/imu/snapshot";

/** A Snapshot the account already has, as much of it as the dialog needs
 * to say "this one already stands here, made from that session". */
export interface ImuSnapshotTwin {
  id: string;
  name: string;
  definition: SnapshotDefinition;
  referenceSessionName: string | null;
}

/**
 * "Comparar" on an event's card (2026-09-20; it was "Snapshot", and saved
 * before it showed anything): opens the comparison of this stretch of
 * trail over the analysis — every pass through it, in this session and in
 * the others — and only at its foot offers to KEEP it, as a Snapshot. The
 * order the gesture asks for: see first, save if it was worth seeing.
 *
 * The gates are worked out here, from the session already in hand, and
 * nothing is written until "Snapshot" is pressed: the comparison is the
 * Snapshot page's own view in its draft mode, fed by the same choice of
 * sessions (listImuSnapshotCandidates). The files it reads are kept by the
 * caller's loader for the next corner — the candidates barely change from
 * one corner of a trail to the next, and a megabyte each is the whole cost
 * of opening this.
 *
 * A Snapshot already standing on the same gates (findSnapshotTwins) turns
 * the foot into "open it", with "guardar outro" a click away — two
 * Snapshots of one corner with different references are a legitimate
 * thing to want. Saving stays here: the reader came to look at a corner
 * and keeps their place in the analysis; the saved page is a link away.
 *
 * Errors are written into the dialog — the garage rule.
 */
export function ImuSnapshotCreate({
  prepared,
  event,
  sessionId,
  existing,
  loadSession,
}: {
  prepared: SnapshotSession;
  event: ImuEvent;
  sessionId: string;
  /** The account's Snapshots, definitions and names. */
  existing: readonly ImuSnapshotTwin[];
  /** Reads a candidate's recording — the caller's, which remembers. */
  loadSession: ImuSnapshotSessionLoader;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The reader saw the twin and asked for another anyway. */
  const [another, setAnother] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImuSnapshotCandidate[] | null>(
    null,
  );

  const kind = snapshotKindOf(event);
  // Made once per event, not per keystroke: the gates walk the track.
  const made = useMemo(
    () => (open ? createSnapshot(prepared, event) : null),
    [open, prepared, event],
  );
  const twins = useMemo(
    () => (made ? findSnapshotTwins(made.definition, existing) : []),
    [made, existing],
  );
  const suggested =
    kind && made
      ? `${SNAPSHOT_KIND_LABEL[kind]} · ${formatSessionTime(made.reference.entryMs)}`
      : "";
  // The row the view reads, for gates that have no row: stable while the
  // gates are, because the view re-reads every file when it changes.
  const draftRow = useMemo<ImuSnapshotRow | null>(
    () =>
      made
        ? {
            id: "",
            name: suggested,
            definition: made.definition,
            referenceSessionId: sessionId,
            referenceEntryMs: made.reference.entryMs,
            referenceExitMs: made.reference.exitMs,
            createdAt: "",
          }
        : null,
    [made, suggested, sessionId],
  );

  // Who to compare with, asked once the gates exist.
  useEffect(() => {
    if (!made) return;
    let cancelled = false;
    (async () => {
      const result = await listImuSnapshotCandidates({
        definition: made.definition,
        sessionId,
      });
      if (cancelled) return;
      if (result.status === "error") setError(result.message);
      else setCandidates(result.candidates);
    })();
    return () => {
      cancelled = true;
    };
  }, [made, sessionId]);

  async function save() {
    if (busy || !made) return;
    setBusy(true);
    setError(null);
    const result = await createImuSnapshot({
      name: name || suggested,
      definition: made.definition,
      referenceSessionId: sessionId,
      referenceEntryMs: made.reference.entryMs,
      referenceExitMs: made.reference.exitMs,
    });
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setSavedId(result.id);
    // The analysis's list of the account's Snapshots, so the next
    // "Comparar" on this corner finds this one.
    router.refresh();
  }

  if (!kind) return null;
  const twin = twins[0] ?? null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName("");
          setBusy(false);
          setError(null);
          setAnother(false);
          setSavedId(null);
          setCandidates(null);
        }
      }}
    >
      <DialogTrigger
        title="Comparar todas as passagens por este troço"
        // The report door's pill, on the event's card: outlined, the mark
        // and the word (the supplied layout, 2026-09-10) — a control, not a
        // figure, so it wears the page's outline and not a tile's rules.
        className={cn(
          "inline-flex shrink-0 items-center gap-2.5 rounded-[14px] border border-border bg-card px-5 py-3 font-semibold text-foreground",
          CLICKABLE_CARD_HOVER,
        )}
      >
        <ArrowLeftRight className="size-5" strokeWidth={1.75} aria-hidden />
        Comparar
      </DialogTrigger>
      <DialogContent
        // Nearly the whole window (by request, 2026-09-20): the comparison
        // is a page's worth — the passes want ~1030 px to stand in two
        // columns. On the lab's ground, not a popover's white: the view is
        // made of cards. One scroller, the save at its end.
        // The whole screen on a phone (by request, 2026-09-20): a margin
        // round a sheet this full only costs it 32 px of passes each way.
        className="h-dvh max-h-none w-screen max-w-none grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-none bg-background p-0 ring-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none sm:rounded-lg sm:ring-1"
      >
        <div className="min-h-0 overflow-y-auto overscroll-contain px-[15px] pt-12 pb-6 sm:px-6">
          <DialogTitle className="sr-only">
            Comparar as passagens por este troço
          </DialogTitle>
          <DialogDescription className="sr-only">
            Todas as passagens pelas duas portas deste troço, nesta sessão e nas
            outras, lado a lado.
          </DialogDescription>
          {!made ? (
            <p className="mx-auto max-w-md pt-10 text-center text-sm text-destructive">
              Não dá para comparar este evento: precisa de trilho GPS uns{" "}
              {SNAPSHOT_GATE_OFFSET_M} m para cada lado, e a gravação não os tem
              aqui.
            </p>
          ) : draftRow && candidates ? (
            <ImuSnapshotView
              draft
              snapshot={draftRow}
              candidates={candidates}
              fromSessionId={sessionId}
              loadSession={loadSession}
            />
          ) : (
            !error && (
              <p
                className="pt-10 text-center text-sm text-muted-foreground"
                aria-live="polite"
              >
                A procurar as sessões que passam por aqui…
              </p>
            )
          )}
          {/* The foot, at the END of the scroll and not pinned under it (by
              request, 2026-09-20): keep it — or open the one already kept.
              The last card of the comparison, read after the passes. */}
          {made && (
            <div
              className={cn(
                "mt-[18px] rounded-lg bg-card px-5 py-5 sm:px-6",
                DARK_CARD_HAIRLINE,
              )}
            >
              {error && (
                <p role="alert" className="mb-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              {savedId ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm">
                    Guardado como Snapshot. As sessões que importares depois
                    entram sozinhas.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      router.push(`/pro/sessoes/${sessionId}/snapshots/${savedId}`)
                    }
                  >
                    Abrir o Snapshot
                  </Button>
                </div>
              ) : twin && !another ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    Este troço já está guardado:{" "}
                    <span className="font-medium">{twin.name}</span>
                    {twin.referenceSessionName && (
                      <span className="text-muted-foreground">
                        {" "}
                        · feito de {twin.referenceSessionName}
                      </span>
                    )}
                    {twins.length > 1 && (
                      <span className="text-muted-foreground">
                        {" "}
                        · e mais {twins.length - 1}
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAnother(true)}
                    >
                      Guardar outro
                    </Button>
                    <Button
                      type="button"
                      variant="inverted"
                      onClick={() =>
                        router.push(
                          `/pro/sessoes/${sessionId}/snapshots/${twin.id}`,
                        )
                      }
                    >
                      Abrir
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  className="flex flex-wrap items-end gap-3 sm:justify-center"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <div className="min-w-[200px] flex-1 space-y-1 sm:w-[300px] sm:min-w-0 sm:flex-none">
                    <Label htmlFor="snapshot-name" className="text-xs">
                      Guardar este troço como Snapshot
                    </Label>
                    <Input
                      id="snapshot-name"
                      value={name}
                      placeholder={suggested}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="inverted" disabled={busy}>
                    <ImuSnapshotGlyph className="size-4" sizePx={16} />
                    {busy ? "A guardar…" : "Snapshot"}
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
