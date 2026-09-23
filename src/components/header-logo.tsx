"use client";

import { BikitLockup } from "@/components/logo";

/**
 * The mobile header's logo: the artwork lockup, at the header's height.
 * (Bikit Pro's shell draws the PRO lockup itself — see its layout.)
 */
export function HeaderLogo() {
  return <BikitLockup className="h-8 w-auto sm:hidden" />;
}
