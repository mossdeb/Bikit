import type { Locale } from "@/lib/i18n";
import { common } from "./common";
import { nav } from "./nav";
import { sessions } from "./sessions";
import { analysis } from "./analysis";
import { compare } from "./compare";
import { snapshots } from "./snapshots";
import { importing } from "./importing";
import { report } from "./report";

/**
 * Bikit Pro's dictionary (2026-09-24), apart from the app's: the Pro
 * area was written in Portuguese literals, and the app's dictionary is
 * handed to client components slice by slice from server pages. Pro is
 * almost all client code with plurals computed at runtime, so its
 * dictionary is read on the client through `useProDict()`
 * (components/pro-locale.tsx) and, in the lib code that builds sentences
 * in the browser, through `getProDictionary(locale)`.
 *
 * One file per namespace, each exporting `{ en, pt }` with `pt` typed by
 * `en`, so a key missing from one language fails the type-check. The
 * namespaces are composed here; the type of the whole is the English one.
 *
 * Function entries (plurals, templates) are fine here — nothing crosses
 * the server/client boundary, the dictionary is imported where it is
 * read.
 *
 * Technical terms stay as they are in both languages (Harshness, Rider,
 * Trail, Bike setup, Snapshot, Stroke): they are the lab's vocabulary,
 * not prose.
 */
const pro = {
  en: {
    common: common.en,
    nav: nav.en,
    sessions: sessions.en,
    analysis: analysis.en,
    compare: compare.en,
    snapshots: snapshots.en,
    importing: importing.en,
    report: report.en,
  },
  pt: {
    common: common.pt,
    nav: nav.pt,
    sessions: sessions.pt,
    analysis: analysis.pt,
    compare: compare.pt,
    snapshots: snapshots.pt,
    importing: importing.pt,
    report: report.pt,
  },
};

export type ProDictionary = typeof pro.en;

// `pt` must carry every key `en` does, and nothing else.
const _ptCheck: ProDictionary = pro.pt;
void _ptCheck;

export function getProDictionary(locale: Locale): ProDictionary {
  return locale === "pt" ? pro.pt : pro.en;
}

/** The BCP 47 tag for number and date formatting in each language. */
export const PRO_NUMBER_LOCALE: Record<Locale, string> = {
  en: "en-US",
  pt: "pt-PT",
};

/** A number as the reader's language writes it: "1 234,5" in Portuguese,
 * "1,234.5" in English. `digits` fixes the decimals (both bounds), so
 * "16.34" and "16,34" keep their two places. */
export function proNumber(n: number, locale: Locale, digits?: number): string {
  return n.toLocaleString(PRO_NUMBER_LOCALE[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "30 %" in Portuguese (a space before the sign), "30%" in English. */
export function proPercent(n: number, locale: Locale, digits = 0): string {
  return locale === "pt"
    ? `${proNumber(n, locale, digits)} %`
    : `${proNumber(n, locale, digits)}%`;
}
