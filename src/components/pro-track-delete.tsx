"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import { useProDict } from "@/components/pro-locale";
import { deleteImuTrack } from "@/lib/actions/imu-tracks";

/**
 * "Delete" on a track's card in the Paddock (by request, 2026-11-15). The
 * track goes; its runs stay, lose it (migration 00059: on delete set null)
 * and take the most similar track left the next time they are read.
 */
export function ProTrackDelete({
  trackId,
  name,
  runs,
}: {
  trackId: string;
  name: string;
  runs: number;
}) {
  const t = useProDict();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ConfirmActionButton
        title={t.report.bikes.trackDelete.title(name)}
        description={t.report.bikes.trackDelete.description(runs)}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        triggerAriaLabel={t.report.bikes.trackDelete.aria(name)}
        triggerClassName="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        triggerContent={<Trash2 className="size-4" />}
        action={async () => {
          const result = await deleteImuTrack(trackId);
          if (result.status === "error") setError(result.message);
          else router.refresh();
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}
