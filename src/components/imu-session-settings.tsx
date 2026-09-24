"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Ellipsis, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import {
  groupFormValid,
  groupRefFromForm,
  type ImuGroupOption,
} from "@/lib/imu/groups";
import { bikeFormValid, bikeRefFromForm } from "@/lib/imu/bike-ref";

/**
 * The session's settings, behind the three dots in the identity card's
 * corner: the name, the rider, the bike and the group — the same fields
 * the import dialog asks for, because they are the same facts, and a fact
 * typed wrong at import should be fixable without importing again.
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
  groupId,
  groups,
  riderDefault,
  riders,
  storagePath,
}: {
  sessionId: string;
  name: string;
  riderName: string | null;
  bikeId: string | null;
  bikes: BikeOption[];
  groupId: string | null;
  /** Where the recording sits in the imu-sessions bucket, for the download. */
  storagePath: string;
  /** The account's groups, newest first. */
  groups: ImuGroupOption[];
  /** The account's own name — what a blank rider becomes on save. */
  riderDefault: string;
  /** The riders the account's sessions know, most recent first. */
  riders: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftRider, setDraftRider] = useState(riderName ?? "");
  const [draftBike, setDraftBike] = useState(bikeId ?? "");
  const [newBikeName, setNewBikeName] = useState("");
  const [draftGroup, setDraftGroup] = useState(groupId ?? "");
  const [newGroupName, setNewGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDraftName(name);
    setDraftRider(riderName ?? "");
    setDraftBike(bikeId ?? "");
    setNewBikeName("");
    setDraftGroup(groupId ?? "");
    setNewGroupName("");
    setBusy(false);
    setError(null);
  }

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // ".bkt" or ".json": what the parser found on import, kept in the path.
  const fileExtension = storagePath.split(".").pop()?.toLowerCase() ?? "bkt";

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    const supabase = createClient();
    const { data, error: downloadFailure } = await supabase.storage
      .from("imu-sessions")
      .download(storagePath);
    setDownloading(false);
    if (downloadFailure || !data) {
      setDownloadError(
        `Não foi possível obter o ficheiro: ${downloadFailure?.message ?? "sem resposta do Storage"}.`,
      );
      return;
    }
    // The session's name as the file name, minus what a file system rejects.
    const safeName = name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "sessao";
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}.${fileExtension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoked after the click has been handed to the browser.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const dirty =
    draftName.trim() !== name ||
    (draftRider.trim() || null) !== (riderName ?? null) ||
    (draftBike || null) !== (bikeId ?? null) ||
    (draftGroup || null) !== (groupId ?? null);
  const valid =
    draftName.trim().length > 0 &&
    groupFormValid(draftGroup, newGroupName) &&
    bikeFormValid(draftBike, newBikeName);

  async function save() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    const result = await updateImuSession({
      sessionId,
      name: draftName,
      riderName: draftRider,
      bike: bikeRefFromForm(draftBike, newBikeName),
      group: groupRefFromForm(draftGroup, newGroupName),
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
            O nome, quem pedalou, que bicicleta levou o sensor e a que grupo
            pertence. A gravação em si não muda, e pode ser descarregada tal
            como foi guardada.
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
            riders={riders}
            bikeId={draftBike}
            onBikeIdChange={setDraftBike}
            bikes={bikes}
            newBikeName={newBikeName}
            onNewBikeNameChange={setNewBikeName}
            groups={groups}
            groupId={draftGroup}
            onGroupIdChange={setDraftGroup}
            newGroupName={newGroupName}
            onNewGroupNameChange={setNewGroupName}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            variant="inverted"
            disabled={busy || !dirty || !valid}
          >
            {busy ? "A guardar…" : "Guardar"}
          </Button>
        </form>

        {/* The recording itself, as it was stored — the .BKT the logger
            wrote, or the exporter's JSON — straight from Storage, where RLS
            already limits it to the owner. Fetched into a blob and handed to
            the browser as a download named after the session; a signed URL
            would also work, but would put the file's address in the page. */}
        <div className="border-t border-border pt-4">
          <button
            type="button"
            disabled={downloading}
            onClick={download}
            className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Download className="size-4" />
            {downloading
              ? "A preparar…"
              : `Descarregar ficheiro (${fileExtension.toUpperCase()})`}
          </button>
          {downloadError && (
            <p className="mt-2 text-center text-sm text-destructive">
              {downloadError}
            </p>
          )}
        </div>

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
              router.push("/pro");
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
