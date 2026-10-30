"use client";

import { setLandingLocale } from "@/lib/actions/landing";
import type { LandingLocale } from "@/components/landing/i18n";

/** Both languages side by side, the one in use marked (Landing V3). */
export function LandingLocaleSwitcher({
  locale,
  label,
  onDark = false,
}: {
  locale: LandingLocale;
  label: string;
  onDark?: boolean;
}) {
  return (
    <form
      action={setLandingLocale}
      role="group"
      aria-label={label}
      className="flex rounded-full border border-[#101014]/[0.12] p-px"
    >
      {(["en", "pt"] as const).map((option) => (
        <button
          key={option}
          type="submit"
          name="locale"
          value={option}
          aria-pressed={option === locale}
          className={`cursor-pointer rounded-full px-2 py-1 text-[11px] leading-[17px] font-medium uppercase ${
            option === locale
              ? "bg-[#101014] text-[#43F3AF]"
              : onDark
                ? "text-white"
                : "text-[#101014]"
          }`}
        >
          {option}
        </button>
      ))}
    </form>
  );
}
