import { format, parseISO } from "date-fns";
import type { Locale } from "@/lib/i18n";

const NUMBER_LOCALE: Record<Locale, string> = { en: "en-US", pt: "pt-PT" };

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), "d MMM yyyy");
}

/** Defaults to English for the handful of call sites with no locale in hand;
 * everywhere the reader's language is known it should be passed, since the
 * two swap the meaning of a dot: "3,288" is three thousand in English and
 * three-and-a-bit in Portuguese. */
function formatNumber(n: number, locale: Locale = "en"): string {
  return n.toLocaleString(NUMBER_LOCALE[locale]);
}

/**
 * Hours arrive from Strava as raw fractions of an hour and are never wanted
 * at that precision — 327.4137 printed in full became "327.414 h", which
 * reads as three hundred thousand hours to anyone whose language groups
 * thousands with a dot. One decimal below ten, where it's the difference
 * between a short ride and none, whole hours above.
 */
export function formatHours(hours: number, locale: Locale = "en"): string {
  const rounded = Math.abs(hours) < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return `${formatNumber(rounded, locale)} h`;
}

const KM_TO_MI = 0.621371;

/** Distances are always stored in km; this is display-only conversion. */
export function formatDistance(km: number, unit: "km" | "mi", locale: Locale = "en"): string {
  return `${formatNumber(Math.round(kmToUnit(km, unit)), locale)} ${unit}`;
}

/**
 * Splits a formatted total into its figure and its unit — "3372 km" into
 * "3372" and "km".
 *
 * The split is on the LAST space and not the first, because the figure can
 * carry a space as its own thousands separator in some locales while every
 * unit that reaches here is a single trailing token. This is the rule the bike
 * header's `StatValue` was already applying by hand; it lives here now because
 * `AnimatedNumber` stores the figure alone, and the three screens that show a
 * bike's distance have to store the very same string or each one replays the
 * same ride.
 */
export function splitFigureUnit(text: string): { figure: string; unit: string | null } {
  const at = text.lastIndexOf(" ");
  if (at < 0) return { figure: text, unit: null };
  return { figure: text.slice(0, at), unit: text.slice(at + 1) };
}

/** Converts a stored km value to the given display unit (unformatted, for form inputs). */
export function kmToUnit(km: number, unit: "km" | "mi"): number {
  return unit === "mi" ? km * KM_TO_MI : km;
}

/** Converts a value entered in the given unit back to km for storage. */
export function unitToKm(value: number, unit: "km" | "mi"): number {
  return unit === "mi" ? value / KM_TO_MI : value;
}
