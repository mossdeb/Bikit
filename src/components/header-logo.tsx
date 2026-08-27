"use client";

import { usePathname } from "next/navigation";
import { BikitLockup } from "@/components/logo";

/**
 * The mobile header's logo. On the IMU lab routes it is the BIKIT PRO
 * lockup instead of the regular one — replacing it, not stacking a second
 * logo under the header.
 *
 * One component for the two now: the regular lockup used to be a tile beside
 * the word set in Anek Latin, which put a different "Bikit" here than the one
 * the lab wore two pixels away. Both are the artwork, at the same height.
 */
export function HeaderLogo() {
  const pathname = usePathname();
  return (
    <BikitLockup
      pro={pathname.startsWith("/labs/imu")}
      className="h-8 w-auto sm:hidden"
    />
  );
}
