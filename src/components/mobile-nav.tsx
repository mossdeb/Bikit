"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { isFullscreenFormRoute } from "@/lib/fullscreen-form-routes";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export function MobileNav({ nav }: { nav: Dictionary["nav"] }) {
  const pathname = usePathname();

  // The create forms take over the whole screen — no nav competing with
  // their bottom buttons.
  if (isFullscreenFormRoute(pathname)) return null;

  // The IMU session analysis is read by scrubbing a chart with a thumb, with
  // the readout underneath it: a floating bar across the bottom sits exactly
  // where the details land. The lab is owner-only and reached by link, so
  // nobody is stranded without the nav. (Desktop never had it — the bar is
  // sm:hidden — so this only takes effect on a phone.)
  if (/^\/labs\/imu\/[^/]+$/.test(pathname)) return null;

  return (
    <nav
      className="fixed inset-x-4 z-40 flex items-center justify-between rounded-[22px] bg-sidebar px-5 text-sidebar-foreground shadow-lg sm:hidden"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      {MOBILE_NAV_ITEMS.map(({ href, labelKey, icon: Icon, iconClassName }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={nav[labelKey]}
            className={cn(
              "flex items-center justify-center py-3.5",
              active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
            )}
          >
            <Icon className={iconClassName} />
          </Link>
        );
      })}
    </nav>
  );
}
