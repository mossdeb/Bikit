import { Anek_Latin, Exo, Roboto } from "next/font/google";

export const landingHeadingFont = Exo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-landing-heading",
});

export const landingBodyFont = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-body",
});

/** The hero's lockup and title (Landing V3). */
export const landingDisplayFont = Anek_Latin({
  subsets: ["latin"],
  weight: ["300", "700"],
  variable: "--font-landing-display",
});
