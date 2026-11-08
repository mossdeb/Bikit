import { Anek_Latin, Exo } from "next/font/google";
import localFont from "next/font/local";

export const landingHeadingFont = Exo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-landing-heading",
});

/**
 * Roboto from the project's own file (2026-11-08), not next/font/google:
 * twice in one morning Vercel's build failed fetching it from Google
 * ("next/font/google queries have exactly one entry") while Exo and Anek
 * loaded. The file is Google's own latin subset, variable 400–700 (v51,
 * SIL Open Font License) — the same bytes the build used to download, so
 * the pages look the same and visitors still never reach Google.
 */
export const landingBodyFont = localFont({
  src: "./fonts/roboto-latin-variable.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-landing-body",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

/** The hero's lockup and title (Landing V3). */
export const landingDisplayFont = Anek_Latin({
  subsets: ["latin"],
  weight: ["300", "700"],
  variable: "--font-landing-display",
});
