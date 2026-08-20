"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import { deleteImuSession } from "@/lib/actions/imu";

/** The trash can on a session card. On failure the icon gives its corner to
 * the error text — written where the click happened, not toasted away. */
export function ImuSessionDeleteButton({ sessionId, name }: { sessionId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (error) return <span className="max-w-40 text-right text-xs text-destructive">{error}</span>;

  return (
    <ConfirmActionButton
      title="Apagar sessão?"
      description={`"${name}" e o ficheiro original deixam de existir. Não há forma de os repor.`}
      confirmLabel="Apagar"
      cancelLabel="Cancelar"
      triggerAriaLabel={`Apagar a sessão ${name}`}
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
