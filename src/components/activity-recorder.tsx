"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordActivity } from "@/lib/actions/activity";

/**
 * Counts each page a signed-in account opens (src/lib/actions/activity.ts,
 * 2026-11-09). Mounted in the signed-in layouts only — the app's and Pro's
 * — and on the pathname, so a navigation inside the app counts as well as
 * a full load. Stores nothing in the browser. Renders nothing.
 */
export function ActivityRecorder() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) void recordActivity(pathname);
  }, [pathname]);
  return null;
}
