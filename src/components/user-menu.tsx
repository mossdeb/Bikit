"use client";

import Link from "next/link";
import { Settings, LogOut } from "lucide-react";
import { MenuDashboardIcon } from "@/components/menu-icons";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ImuChartGlyph } from "@/components/imu-pro-logo";
import { logout } from "@/lib/actions/auth";
import { getInitials } from "@/lib/initials";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export function UserMenu({
  name,
  email,
  common,
  showPro = false,
  showBikit = false,
  settingsHref = "/settings",
}: {
  name?: string | null;
  email: string;
  common: Dictionary["common"];
  /** The door to Bikit Pro, for the accounts that have it (2026-09-23):
   * the two areas keep their own navigation, so the way across lives
   * here, with the account, and not on the app's rail. Untranslated, like
   * the area it opens. */
  showPro?: boolean;
  /** The door back to Bikit, from the Pro shell — the same place, the
   * other way. */
  showBikit?: boolean;
  /** Where "Definições" goes: the app's page, or its copy under Bikit
   * Pro's shell when the menu stands there. */
  settingsHref?: string;
}) {
  const initials = getInitials(name, email);

  return (
    <Popover>
      <PopoverTrigger
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo font-display text-xs font-bold text-indigo-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label="Account"
      >
        {initials}
      </PopoverTrigger>
      <PopoverContent className="p-2">
        <div className="mb-1.5 flex items-center gap-3 border-b border-border px-2 pt-1 pb-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo font-display text-xs font-bold text-indigo-foreground">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name || email}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <Link
          href={settingsHref}
          className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-sm hover:bg-muted"
        >
          <Settings className="size-4 text-muted-foreground" />
          {common.settings}
        </Link>
        {showPro && (
          <Link
            href="/pro"
            className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-sm hover:bg-muted"
          >
            <ImuChartGlyph className="size-4 text-muted-foreground" />
            Bikit Pro
          </Link>
        )}
        {showBikit && (
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-sm hover:bg-muted"
          >
            <MenuDashboardIcon className="size-4 text-muted-foreground" />
            Bikit
          </Link>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            {common.logOut}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
