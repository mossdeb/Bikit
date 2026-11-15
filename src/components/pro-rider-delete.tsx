"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import { useProDict } from "@/components/pro-locale";
import { clearImuRiderName } from "@/lib/actions/imu";

/**
 * "Delete" on a rider's card in the Paddock (by request, 2026-11-15). A
 * rider is the name written on the sessions, so the name goes and the
 * sessions stay — which the confirmation says in so many words.
 */
export function ProRiderDelete({
  name,
  sessions,
}: {
  name: string;
  sessions: number;
}) {
  const t = useProDict();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ConfirmActionButton
        title={t.report.bikes.riderDelete.title(name)}
        description={t.report.bikes.riderDelete.description(name, sessions)}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        triggerAriaLabel={t.report.bikes.riderDelete.aria(name)}
        triggerClassName="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        triggerContent={<Trash2 className="size-4" />}
        action={async () => {
          const result = await clearImuRiderName(name);
          if (result.status === "error") setError(result.message);
          else router.refresh();
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}
