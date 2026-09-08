"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { setGroupMountOrientation } from "@/lib/actions/imu";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { groupLabel, type ImuGroupOption } from "@/lib/imu/groups";

/**
 * Lends this session's mounting orientation — the logger's two-step
 * calibration — to every session of a group. The files recorded before the
 * calibration existed cannot know where forward was; the rider does, when
 * the sensor never moved. Offered only on a session whose file carries its
 * own orientation, so what is copied was measured, not inherited twice.
 *
 * The outcome is written into the dialog, count and all, never toasted.
 */
export function ImuOrientationShare({
  orientation,
  groups,
  sourceName,
  defaultGroupId,
}: {
  orientation: ImuMountOrientation;
  groups: ImuGroupOption[];
  /** This session's name, kept on the copies as provenance. */
  sourceName: string;
  /** This session's own group, preselected — the likeliest target. */
  defaultGroupId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  if (groups.length === 0) return null;
  const pct = Math.round(orientation.confidence * 100);

  async function apply() {
    if (busy || !groupId) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await setGroupMountOrientation({
      groupId,
      orientation,
      sourceName,
    });
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setDone(result.updated);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setDone(null);
          setGroupId(defaultGroupId ?? groups[0]?.id ?? "");
        }
      }}
    >
      <DialogTrigger className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Aplicar orientação a um grupo
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar a orientação a um grupo</DialogTitle>
          <DialogDescription className="mt-1">
            Copia a orientação do sensor desta sessão ({pct}% de confiança,{" "}
            {orientation.voteCount} votos) para todas as sessões do grupo. Só
            faz sentido se o sensor esteve na mesma posição na bicicleta. Um
            ficheiro que traga a sua própria orientação continua a usá-la.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="orientation-share-group">Grupo</Label>
            <NativeSelect
              id="orientation-share-group"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {groupLabel(g)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {done !== null && (
            <p className="text-sm text-muted-foreground">
              Orientação aplicada a {done} sess{done === 1 ? "ão" : "ões"}.
            </p>
          )}
          <Button
            className="w-full"
            variant="inverted"
            disabled={busy || !groupId}
            onClick={apply}
          >
            {busy ? "A aplicar…" : "Aplicar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
