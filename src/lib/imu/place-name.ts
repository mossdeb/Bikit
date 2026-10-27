import type { Locale } from "@/lib/i18n";
import type { GpsChannels } from "@/lib/imu/format";

/**
 * A ride's place name, reverse-geocoded from OpenStreetMap's Nominatim —
 * "Foupana, Olhão". Shared by the session map's label and the new-track
 * form's suggested name (2026-10-27), so the two ask once between them.
 *
 * The middle of the track and not its start: it names where the ride IS,
 * and a start can sit just outside the place it belongs to.
 */

/**
 * The key a ride's place name is cached under — the middle of the track,
 * rounded to ~100 m of ground. Nominatim's terms ask that results be cached
 * rather than re-requested, and two sessions on the same trail should cost
 * one lookup. The language is part of the key: the name is asked for in the
 * reader's language, and a Portuguese answer must not be served to an
 * English reader of the same ground.
 */
export function placeCacheKey(gps: GpsChannels, locale: Locale): string | null {
  const m = gps.tMs.length;
  if (m === 0) return null;
  const mid = Math.floor(m / 2);
  return `imu-place:${locale}:${gps.latDeg[mid].toFixed(3)},${gps.lonDeg[mid].toFixed(3)}`;
}

/** The cached name, if this ground was already asked about in this tab.
 * Null on the server, where there is no sessionStorage. An empty string —
 * "we asked, there is no name here" — reads as null too. */
export function readCachedPlace(
  gps: GpsChannels,
  locale: Locale,
): string | null {
  if (typeof window === "undefined") return null;
  const key = placeCacheKey(gps, locale);
  return key ? sessionStorage.getItem(key) || null : null;
}

/**
 * The name, from the cache or from Nominatim, cached for the tab's
 * lifetime. Null when there is none or the lookup failed (offline, blocked,
 * rate-limited): a name is decoration, and every caller has a fallback.
 */
export async function lookupPlaceName(
  gps: GpsChannels,
  locale: Locale,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = placeCacheKey(gps, locale);
  if (!key) return null;
  const cached = sessionStorage.getItem(key);
  if (cached != null) return cached || null;
  const mid = Math.floor(gps.tMs.length / 2);
  try {
    // Asked for in the reader's language: Nominatim carries the names
    // OpenStreetMap has in each, and falls back to the local one.
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${gps.latDeg[mid]}&lon=${gps.lonDeg[mid]}&format=jsonv2&zoom=16&accept-language=${locale}`,
      { signal },
    );
    if (!res.ok) return null;
    const address = (await res.json())?.address ?? {};
    // The finest named place, then the council it belongs to — the
    // shape a rider would say out loud. `city` is the concelho in
    // Portuguese addresses, which is why it leads the second half.
    const place =
      address.village ??
      address.hamlet ??
      address.suburb ??
      address.neighbourhood ??
      address.isolated_dwelling ??
      address.locality ??
      address.town;
    const area =
      address.city ?? address.municipality ?? address.town ?? address.county;
    const label = [place, area === place ? null : area]
      .filter(Boolean)
      .join(", ");
    // An empty string is cached too: "we asked, there is no name here"
    // is an answer, and re-asking would not change it.
    sessionStorage.setItem(key, label);
    return label || null;
  } catch {
    return null;
  }
}
