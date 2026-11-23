"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "Admin" view (by request, 2026-11-23): bits of the Pro's UI that help
 * the owner read and tune the analysis but mean nothing to a rider — the
 * event's confidence, first; more as they are named. Only an admin account
 * (isAdmin, server side) gets the switch, in the header, and only with it on
 * are those bits drawn. Off for everyone else, whatever this browser holds.
 *
 * Remembered in this browser (localStorage): a way of looking, not a
 * setting of the account. On by default, as the confidence was before.
 */
const STORAGE_KEY = "bikit.adminUi";
const CHANGE_EVENT = "bikit-admin-ui";

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function store(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the switch still works for the page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const AdminContext = createContext(false);

/** Says whether this account is an admin, for the hooks below. */
export function AdminUiProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <AdminContext.Provider value={isAdmin}>{children}</AdminContext.Provider>
  );
}

/** The stored switch; true on the server, so the first paint matches the
 * default. */
function useStoredOn(): boolean {
  return useSyncExternalStore(subscribe, readStored, () => true);
}

/** Draw the Admin bits? Only for an admin, and only with the switch on. */
export function useAdminUi(): boolean {
  const isAdmin = useContext(AdminContext);
  const on = useStoredOn();
  return isAdmin && on;
}

/** Its children only in the Admin view — for a server component, which
 * cannot call useAdminUi itself. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  return useAdminUi() ? <>{children}</> : null;
}

/** The header's switch — nothing at all for an account that is not admin. */
export function AdminUiToggle() {
  const isAdmin = useContext(AdminContext);
  const on = useStoredOn();
  if (!isAdmin) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title="Mostrar ou esconder a informação de desenvolvimento"
      onClick={() => store(!on)}
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card pr-1.5 pl-3 text-xs font-semibold"
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      {/* "Dev info" on the switch (by request, 2026-11-23); the code keeps
          calling it the Admin view. */}
      Dev info
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-foreground" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-background transition-transform",
            on && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}
