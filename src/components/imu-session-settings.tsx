"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import {
  ImuSessionDetailsFields,
  type BikeOption,
} from "@/components/imu-session-details-fields";
import { deleteImuSession, updateImuSession } from "@/lib/actions/imu";

/**
 * The session's settings, behind the three dots in the identity card's
 * corner: the name, the rider and the bike — the same three fields the
 * import dialog asks for, because they are the same three facts, and a
 * fact typed wrong at import should be fixable without importing again.
 * Deleting lives here too, at the foot and behind its own confirmation:
 * it is a setting of this session, and the list's trash can is a long
 * way from the page you are looking at.
 *
 * Errors are written into the dialog, never toasted — the garage rule.
 */
export function ImuSessionSettings({
  sessionId,
  name,
  riderName,
  bikeId,
  bikes,
  riderDefault,
}: {
  sessionId: string;
  name: string;
  riderName: string | null;
  bikeId: string | null;
  bikes: BikeOption[];
  /** The account's own name — what a blank rider becomes on save. */
  riderDefault: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftRider, setDraftRider] = useState(riderName ?? "");
  const [draftBike, setDraftBike] = useState(bikeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDraftName(name);
    setDraftRider(riderName ?? "");
    setDraftBike(bikeId ?? "");
    setBusy(false);
    setError(null);
  }

  const dirty =
    draftName.trim() !== name ||
    (draftRider.trim() || null) !== (riderName ?? null) ||
    (draftBike || null) !== (bikeId ?? null);

  async function save() {
    if (busy || !draftName.trim()) return;
    setBusy(true);
    setError(null);
    const result = await updateImuSession({
      sessionId,
      name: draftName,
      riderName: draftRider,
      bikeId: draftBike || null,
    });
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        aria-label="Definições da sessão"
        className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Ellipsis className="size-5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Definições da sessão</DialogTitle>
          <DialogDescription className="mt-1">
            O nome, quem pedalou e que bicicleta levou o sensor. A gravação em
            si não muda.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <ImuSessionDetailsFields
            idPrefix="settings"
            name={draftName}
            onNameChange={setDraftName}
            rider={draftRider}
            onRiderChange={setDraftRider}
            riderDefault={riderDefault}
            bikeId={draftBike}
            onBikeIdChange={setDraftBike}
            bikes={bikes}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            variant="inverted"
            disabled={busy || !dirty || !draftName.trim()}
          >
            {busy ? "A guardar…" : "Guardar"}
          </Button>
        </form>

        {/* The danger zone, under a rule, with its own confirmation. On
            success the page under this dialog no longer exists, so the
            list is where to land. */}
        <div className="border-t border-border pt-4">
          <ConfirmActionButton
            title="Apagar sessão?"
            description={`"${name}" e o ficheiro original deixam de existir. Não há forma de os repor.`}
            confirmLabel="Apagar"
            cancelLabel="Cancelar"
            triggerAriaLabel={`Apagar a sessão ${name}`}
            triggerClassName="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            triggerContent={
              <>
                <Trash2 className="size-4" />
                Apagar sessão
              </>
            }
            action={async () => {
              const result = await deleteImuSession(sessionId);
              if (result.status === "error") {
                setError(result.message);
                return;
              }
              router.push("/labs/imu");
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
