"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import { useProDict } from "@/components/pro-locale";
import { deleteImuSession } from "@/lib/actions/imu";

/** The trash can on a session card. On failure the icon gives its corner to
 * the error text — written where the click happened, not toasted away. */
export function ImuSessionDeleteButton({
  sessionId,
  name,
}: {
  sessionId: string;
  name: string;
}) {
  const router = useRouter();
  const t = useProDict();
  const [error, setError] = useState<string | null>(null);

  if (error)
    return (
      <span className="max-w-40 text-right text-xs text-destructive">
        {error}
      </span>
    );

  return (
    <ConfirmActionButton
      title={t.sessions.deleteSession.title}
      description={t.sessions.deleteSession.description(name)}
      confirmLabel={t.common.delete}
      cancelLabel={t.common.cancel}
      triggerAriaLabel={t.sessions.deleteSession.aria(name)}
      triggerClassName="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      triggerContent={<Trash2 className="size-4" />}
      action={async () => {
        const result = await deleteImuSession(sessionId);
        if (result.status === "error") setError(result.message);
        else router.refresh();
      }}
    />
  );
}
