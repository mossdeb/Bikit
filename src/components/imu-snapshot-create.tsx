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
 * "Snapshot" on an event's card: keeps this stretch of trail as a
 * reference and opens the page where every pass through it is compared.
 * The gates are worked out here, from the session already in hand, and
 * the reference pass is found the same way any other will be — so what
 * the page shows for this session is what it will show for the next.
 *
 * Before it makes one it looks for a Snapshot already standing on the
 * same gates (findSnapshotTwins) and, finding one, offers to open it
 * instead — with "criar outro" a click away, because two Snapshots of one
 * corner with different references are a legitimate thing to want (by
 * request, 2026-09-11; until then the button made a twin every time).
 *
 * Errors are written into the dialog — the garage rule.
 */
export function ImuSnapshotCreate({
  prepared,
  event,
  sessionId,
  existing,
}: {
  prepared: SnapshotSession;
  event: ImuEvent;
  sessionId: string;
  /** The account's Snapshots, definitions and names. */
  existing: readonly ImuSnapshotTwin[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The reader saw the twin and asked for another anyway. */
  const [another, setAnother] = useState(false);

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
          setAnother(false);
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

        {made && twins.length > 0 && !another && (
          // A Snapshot already stands on these gates. Opening it is the
          // likely wish; making another is the deliberate one, so it is
          // the quieter button, and the form only appears once it is
          // pressed.
          <div className="space-y-4">
            <p className="text-sm">
              Já existe{" "}
              {twins.length === 1 ? "um Snapshot" : `${twins.length} Snapshots`}{" "}
              neste troço:
            </p>
            <ul className="divide-y divide-border rounded-[12px] border border-border">
              {twins.map((twin) => (
                <li key={twin.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm",
                      CLICKABLE_CARD_HOVER,
                    )}
                    onClick={() =>
                      router.push(`/labs/imu/${sessionId}/snapshots/${twin.id}`)
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {twin.name}
                      </span>
                      {twin.referenceSessionName && (
                        <span className="block truncate text-xs text-muted-foreground">
                          feito de {twin.referenceSessionName}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Abrir
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setAnother(true)}
            >
              Criar outro na mesma
            </Button>
          </div>
        )}

        {made && (twins.length === 0 || another) && (
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
