"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { BikitLockup, LogoMark } from "@/components/logo";
import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

const STORAGE_KEY = "bikelog_sidebar_expanded";
const emptySubscribe = () => () => {};

/** Same hydration-safety pattern as ThemeToggle: the server can't know
 * localStorage, so render the collapsed default until the client mounts. */
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function AppSidebar({ nav }: { nav: Dictionary["nav"] }) {
  const pathname = usePathname();
  const mounted = useMounted();
  const [override, setOverride] = useState<boolean | null>(null);

  const expanded = mounted && (override ?? localStorage.getItem(STORAGE_KEY) === "1");
  /** Same route test the mobile header's logo uses, so the two agree. */
  const isLab = pathname.startsWith("/labs/imu");

  function toggle() {
    const next = !expanded;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    setOverride(next);
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col bg-sidebar py-6 text-sidebar-foreground transition-[width] duration-150 sm:flex",
        expanded ? "w-[232px] items-stretch px-4" : "w-[84px] items-center px-0"
      )}
    >
      {/* The rail wears the lab's branding too, not just the phone's header:
          on desktop the sidebar IS the place the app names itself, and
          standing inside `/labs/imu` under a plain "Bikit" said the lab was
          somewhere else.
          Only while expanded — collapsed the rail is 84px and the lockup
          wants ~140 at this height, so there the mark stands alone, which
          is the same mark either way. */}
      <div className="mb-8 flex items-center px-1">
        {expanded ? (
          // `onDark` on both: the rail is `--sidebar` in either theme, so the
          // word cannot be left to follow the theme — it would be near-black
          // on near-black in the light one.
          <BikitLockup onDark pro={isLab} className="h-10 w-auto" />
        ) : (
          // Collapsed the rail is 84px and the lockup wants ~140 at this
          // height, so the mark stands alone — the same mark the lockup
          // carries, lifted out of the same drawing.
          <LogoMark />
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-11 items-center gap-3 rounded-[12px] text-sm font-semibold transition-colors",
                expanded ? "justify-start px-3.5" : "w-11 justify-center",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-5 shrink-0" />
              {expanded && <span>{nav[labelKey]}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={toggle}
        title={expanded ? nav.collapseMenu : nav.expandMenu}
        className={cn(
          "flex h-11 items-center gap-3 rounded-2xl text-sm font-semibold text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground",
          expanded ? "justify-start px-3.5" : "w-11 justify-center"
        )}
      >
        {expanded ? (
          <PanelLeftClose className="size-5 shrink-0" />
        ) : (
          <PanelLeft className="size-5 shrink-0" />
        )}
        {expanded && <span>{nav.collapse}</span>}
      </button>
    </aside>
  );
}
