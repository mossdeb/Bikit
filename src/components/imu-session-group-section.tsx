"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible } from "@/components/collapsible";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import { deleteImuSessionGroup } from "@/lib/actions/imu";

/**
 * Whether a group is folded, remembered in this browser. Read through
 * `useSyncExternalStore` and not in an effect: the server renders every
 * group open, the first client render must agree with it, and the stored
 * answer takes over on the client without a second render's flash.
 * Absent, unreadable, or a private window → open.
 */
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}
function writeOpen(key: string, open: boolean) {
  try {
    if (open) localStorage.removeItem(key);
    else localStorage.setItem(key, "0");
  } catch {
    // Nothing to remember in; the section still toggles for this render.
  }
  for (const listener of listeners) listener();
}

/**
 * One group of the sessions list: a header that names the outing — "Grupo ·
 * Fonte Ferrea · 6.9.26" — with the cards folded under it. The fold is the
 * whole point: a list of forty recordings across eight outings is eight
 * lines, and the one you came for opens.
 *
 * An EMPTY group shows a trash can instead of a fold: groups are never swept
 * when their last session goes, so the rider closes the day by hand.
 */
export function ImuSessionGroupSection({
  storageKey,
  title,
  count,
  deletableGroup,
  children,
}: {
  /** Stable per group; the fold state is remembered under it. */
  storageKey: string;
  title: string;
  count: number;
  /** Set for a real, empty group: the trash can deletes it. */
  deletableGroup?: { id: string; name: string };
  children: ReactNode;
}) {
  const key = `bikit_imu_group_open:${storageKey}`;
  const open = useSyncExternalStore(
    subscribe,
    () => readOpen(key),
    () => true,
  );
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => writeOpen(key, !open)}
          aria-expanded={open}
          disabled={count === 0}
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 py-2 text-left disabled:cursor-default"
        >
          <span className="truncate font-display text-xl font-bold">
            {title}
          </span>
          {count > 0 && (
            <span className="flex shrink-0 items-center gap-3">
              {/* How many are folded under this line — the one fact a
                  closed group would otherwise hide. Muted, tabular, and
                  in the mockup's brackets. */}
              <span className="text-base font-normal text-muted-foreground tabular-nums">
                ({count})
              </span>
              <ChevronUp
                className={cn(
                  "size-5 text-foreground transition-transform duration-300 motion-reduce:transition-none",
                  !open && "rotate-180",
                )}
                aria-hidden
              />
            </span>
          )}
        </button>
        {deletableGroup && count === 0 && (
          <ConfirmActionButton
            title="Apagar grupo?"
            description={`"${deletableGroup.name}" não tem sessões. O grupo deixa de existir.`}
            confirmLabel="Apagar"
            cancelLabel="Cancelar"
            triggerAriaLabel={`Apagar o grupo ${deletableGroup.name}`}
            triggerClassName="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            triggerContent={<Trash2 className="size-4" />}
            action={async () => {
              const result = await deleteImuSessionGroup(deletableGroup.id);
              if (result.status === "error") setError(result.message);
              else router.refresh();
            }}
          />
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-6 text-center text-sm text-muted-foreground">
          Sem sessões neste grupo.
        </p>
      ) : (
        <Collapsible show={open}>
          <div className="space-y-4 pt-2 pb-2">{children}</div>
        </Collapsible>
      )}
    </section>
  );
}
