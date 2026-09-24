"use client";

import { useState, useSyncExternalStore, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { BikitLockup, LogoMark } from "@/components/logo";
import { ImuChartGlyph } from "@/components/imu-pro-logo";
import { MenuBikesIcon, MenuSettingsIcon } from "@/components/menu-icons";
import { useProDict } from "@/components/pro-locale";
import type { ProDictionary } from "@/lib/i18n/pro";
import { cn } from "@/lib/utils";

/**
 * Bikit Pro's own navigation (2026-09-23): the same account, a different
 * area. Where the app's rail lists the places of a bike's upkeep, this
 * one lists the places of the sensor — the sessions, which are the home,
 * the bikes as the sensor rode them (their setups), the account's
 * settings. The sensor probe (/pro/sensor) is off the rail for now (by
 * request, 2026-09-24). The door here is in the app's account menu; there
 * is no door back — neither the rail nor the account menu under Pro
 * lists Bikit (by request, 2026-09-23 and 2026-09-24).
 *
 * The words come from Pro's dictionary (`nav`, since 2026-09-24): each
 * entry names its key, and the label is looked up at render in the
 * reader's language. Same shape, same rail colours and the same collapse
 * switch as AppSidebar, and the same localStorage key, so a rail left
 * open on one side is open on the other.
 */

const STORAGE_KEY = "bikelog_sidebar_expanded";
const emptySubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface ProNavItem {
  href: string;
  /** The entry's word, as a key of the `nav` namespace. */
  label: "sessions" | "bikes" | "settings";
  Icon: ComponentType<{ className?: string }>;
  /** Which paths light it: the home also owns the sessions under it. */
  isActive: (pathname: string) => boolean;
  /** The phone bar's glyph size, where the marks are drawn to different
   * boxes (the app's bar sizes each one by hand too). */
  iconClassName: string;
}

export const PRO_NAV_ITEMS: ProNavItem[] = [
  {
    href: "/pro",
    label: "sessions",
    Icon: ImuChartGlyph,
    isActive: (p) => p === "/pro" || p.startsWith("/pro/sessoes"),
    iconClassName: "size-7",
  },
  {
    href: "/pro/bicicletas",
    label: "bikes",
    Icon: MenuBikesIcon,
    isActive: (p) => p.startsWith("/pro/bicicletas"),
    iconClassName: "size-[36.4px]",
  },
  {
    href: "/pro/definicoes",
    label: "settings",
    Icon: MenuSettingsIcon,
    isActive: (p) => p.startsWith("/pro/definicoes"),
    iconClassName: "size-7",
  },
];

/** The entry's word in the reader's language. */
function labelOf(item: ProNavItem, t: ProDictionary): string {
  return t.nav[item.label];
}

export function ProSidebar() {
  const pathname = usePathname();
  const t = useProDict();
  const mounted = useMounted();
  const [override, setOverride] = useState<boolean | null>(null);
  const expanded =
    mounted && (override ?? localStorage.getItem(STORAGE_KEY) === "1");

  function toggle() {
    const next = !expanded;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    setOverride(next);
  }

  const entry = (item: ProNavItem) => {
    const active = item.isActive(pathname);
    const label = labelOf(item, t);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={label}
        className={cn(
          "flex h-11 items-center gap-3 rounded-[12px] text-sm font-semibold transition-colors",
          expanded ? "justify-start px-3.5" : "w-11 justify-center",
          active
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
        )}
      >
        <item.Icon className="size-5 shrink-0" />
        {expanded && <span>{label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto bg-sidebar py-6 text-sidebar-foreground transition-[width] duration-150 sm:flex",
        expanded
          ? "w-[232px] items-stretch px-4"
          : "w-[84px] items-center px-0",
      )}
    >
      <div className="mb-8 flex items-center px-1">
        {expanded ? (
          <BikitLockup onDark pro className="h-10 w-auto" />
        ) : (
          <LogoMark />
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {PRO_NAV_ITEMS.map(entry)}
      </nav>

      <button
        type="button"
        onClick={toggle}
        title={expanded ? t.nav.collapseMenu : t.nav.expandMenu}
        className={cn(
          "mt-1.5 flex h-11 shrink-0 items-center gap-3 rounded-2xl text-sm font-semibold text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground",
          expanded ? "justify-start px-3.5" : "w-11 justify-center",
        )}
      >
        {expanded ? (
          <PanelLeftClose className="size-5 shrink-0" />
        ) : (
          <PanelLeft className="size-5 shrink-0" />
        )}
        {expanded && <span>{t.nav.collapse}</span>}
      </button>
    </aside>
  );
}

export function ProMobileNav() {
  const pathname = usePathname();
  const t = useProDict();

  // The session analysis is read by scrubbing a chart with a thumb, with
  // the readout underneath it: a floating bar across the bottom sits
  // exactly where the details land. Reached by link and left by the
  // header's back chevron, so nobody is stranded without the nav.
  if (/^\/pro\/sessoes\/[^/]+$/.test(pathname)) return null;

  return (
    <nav
      className="fixed inset-x-4 z-40 flex items-center justify-between rounded-[22px] bg-sidebar px-5 text-sidebar-foreground shadow-lg sm:hidden"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      aria-label={t.nav.primary}
    >
      {PRO_NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-label={labelOf(item, t)}
          className={cn(
            "flex items-center justify-center py-3.5",
            item.isActive(pathname)
              ? "text-sidebar-primary"
              : "text-sidebar-foreground/60",
          )}
        >
          <item.Icon className={item.iconClassName} />
        </Link>
      ))}
    </nav>
  );
}
