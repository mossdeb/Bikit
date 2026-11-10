"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { setAccessEndsOn } from "@/lib/actions/admin";

/**
 * The administration page's "access ends" field (2026-11-10): a date
 * picker that saves as it changes, and a cross to clear it. From that day
 * the account lands on the beta's page, told its trial ended.
 */
export function AdminAccessEnds({
  userId,
  value,
  expired,
}: {
  userId: string;
  value: string | null;
  /** The date is today or past: the account is already closed. */
  expired: boolean;
}) {
  const [date, setDate] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: string) => {
    setDate(next);
    setError(null);
    startTransition(async () => {
      const result = await setAccessEndsOn(userId, next || null);
      if (result.status === "error") {
        setError(result.message);
        setDate(value ?? "");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={date}
          onChange={(e) => save(e.target.value)}
          disabled={pending}
          aria-label="Fim do acesso"
          className={cn(
            "h-8 rounded-[10px] border border-border bg-card px-2 text-xs tabular-nums disabled:opacity-60",
            expired && date && "border-destructive/50 text-destructive",
          )}
        />
        {date && (
          <button
            type="button"
            onClick={() => save("")}
            disabled={pending}
            aria-label="Sem fim de acesso"
            className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {expired && date && (
        <span className="text-[11px] text-destructive">Acesso terminado</span>
      )}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
