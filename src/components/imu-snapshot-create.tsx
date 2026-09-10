"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ImuSnapshotGlyph } from "@/components/imu-snapshot-glyph";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createImuSnapshot } from "@/lib/actions/imu-snapshots";
import type { ImuEvent } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import {
  createSnapshot,
  SNAPSHOT_GATE_OFFSET_M,
  SNAPSHOT_KIND_LABEL,
  snapshotKindOf,
  type SnapshotSession,
} from "@/lib/imu/snapshot";

/**
 * "Snapshot" on an event's card: keeps this stretch of trail as a
 * reference and opens the page where every pass through it is compared.
 * The gates are worked out here, from the session already in hand, and
 * the reference pass is found the same way any other will be — so what
 * the page shows for this session is what it will show for the next.
 *
 * Errors are written into the dialog — the garage rule.
 */
export function ImuSnapshotCreate({
  prepared,
  event,
  sessionId,
}: {
  prepared: SnapshotSession;
  event: ImuEvent;
  sessionId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = snapshotKindOf(event);
  // Made once per event, not per keystroke: the gates walk the track.
  const made = useMemo(
    () => (open ? createSnapshot(prepared, event) : null),
    [open, prepared, event],
  );
  const suggested =
    kind && made
      ? `${SNAPSHOT_KIND_LABEL[kind]} · ${formatSessionTime(made.reference.entryMs)}`
      : "";

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
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    router.push(`/labs/imu/${sessionId}/snapshots/${result.id}`);
  }

  if (!kind) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName("");
          setBusy(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        title="Guardar este troço como Snapshot e comparar todas as passagens"
        // The report door's pill, on the event's card: outlined, the mark
        // and the word (the supplied layout, 2026-09-10) — a control, not a
        // figure, so it wears the page's outline and not a tile's rules.
        className={cn(
          "inline-flex shrink-0 items-center gap-2.5 rounded-[14px] border border-border bg-card px-5 py-3 font-semibold text-foreground",
          CLICKABLE_CARD_HOVER,
        )}
      >
        <ImuSnapshotGlyph className="size-5" sizePx={20} />
        Snapshot
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Snapshot</DialogTitle>
          <DialogDescription className="mt-1">
            Este troço fica guardado como referência: duas portas no trilho,{" "}
            {SNAPSHOT_GATE_OFFSET_M} m antes e depois do evento. Todas as
            passagens por elas, nesta sessão e nas outras, aparecem lado a lado
            — e as sessões que importares depois entram sozinhas.
          </DialogDescription>
        </DialogHeader>

        {!made && (
          <p className="text-sm text-destructive">
            Não dá para fazer um Snapshot deste evento: precisa de trilho GPS
            uns {SNAPSHOT_GATE_OFFSET_M} m para cada lado, e a gravação não os
            tem aqui.
          </p>
        )}

        {made && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="snapshot-name">Nome</Label>
              <Input
                id="snapshot-name"
                value={name}
                placeholder={suggested}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                Passagem de referência:{" "}
                {formatSessionTime(made.reference.entryMs)} →{" "}
                {formatSessionTime(made.reference.exitMs)} (
                {((made.reference.exitMs - made.reference.entryMs) / 1000)
                  .toFixed(1)
                  .replace(".", ",")}{" "}
                s)
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              variant="inverted"
              disabled={busy}
            >
              {busy ? "A guardar…" : "Criar Snapshot"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
