"use client";

import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { ImuProLogo } from "@/components/imu-pro-logo";

/**
 * The mobile header's logo. On the IMU lab routes it is the BIKIT PRO
 * lockup instead of the regular mark — replacing it, not stacking a second
 * logo under the header. Everywhere else, the pair the header always showed.
 */
export function HeaderLogo() {
  const pathname = usePathname();
  if (pathname.startsWith("/labs/imu")) {
    return <ImuProLogo className="h-8 sm:hidden" />;
  }
  return (
    <div className="flex items-center gap-2.5 sm:hidden">
      <LogoMark className="size-8 rounded-[8px]" />
      <span className="font-display text-lg font-bold">Bikit</span>
    </div>
  );
}
