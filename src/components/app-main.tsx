"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isFullscreenFormRoute } from "@/lib/fullscreen-form-routes";
import { SiteFooter } from "@/components/site-footer";

/** The app's <main>. On the fullscreen form routes it drops the bottom-nav
 * clearance (the nav is hidden there) and becomes a flex column, so the page
 * and its card can stretch to fill the viewport. */
export function AppMain({ children }: { children: React.ReactNode }) {
  const fullscreenForm = isFullscreenFormRoute(usePathname());

  return (
    <main
      className={cn(
        "flex-1 px-5 pb-24 sm:px-6 sm:pb-10",
        fullscreenForm && "flex flex-col pb-5 sm:block sm:pb-10",
      )}
    >
      {children}
      {/* The legal line under every page — not under the fullscreen forms,
          whose card fills the screen. */}
      {!fullscreenForm && <SiteFooter />}
    </main>
  );
}
