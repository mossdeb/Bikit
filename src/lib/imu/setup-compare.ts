import type { Locale } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
import { setupKey, type ImuSetupValues } from "./setup";
import { trackIndexCoverage, type SnapshotTrackIndex } from "./snapshot";

/**
 * Which earlier session the report compares this one's setup against
 * (phase 3 of the setups, 2026-09-11): the most recent run of the same
 * bike, by the same rider, on a DIFFERENT setup and the SAME trail — the
 * comparison the Bike section's caveat has been asking for. Anything
 * less would put the trail's difference down to the knobs.
 *
 * Same trail is the earlier track covering this one's outline
 * (trackIndexCoverage) to at least SETUP_COMPARE_COVERAGE: a lap of a
 * longer ride still counts, a neighbouring trail does not.
 *
 * When there is nothing to compare against, the reason — in words, in
 * the reader's language, for the card to print where the comparison
 * would go.
 */

export const SETUP_COMPARE_COVERAGE = 0.7;

export interface SetupCompareSession {
  id: string;
  name: string;
  riderName: string | null;
  setup: ImuSetupValues | null;
  trackIndex: SnapshotTrackIndex | null;
}

export function pickSetupComparison<T extends SetupCompareSession>(
  current: SetupCompareSession,
  /** The bike's earlier sessions, newest first. */
  earlier: T[],
  locale: Locale,
): { pick: T | null; reason: string | null } {
  const t = getProDictionary(locale).compare.pick;
  if (!current.setup) return { pick: null, reason: t.noSetup };
  const key = setupKey(current.setup);
  const others = earlier.filter(
    (s) =>
      s.setup &&
      setupKey(s.setup) !== key &&
      (s.riderName ?? null) === (current.riderName ?? null),
  );
  if (others.length === 0) return { pick: null, reason: t.noOther };
  if (!current.trackIndex) return { pick: null, reason: t.noGps };
  for (const s of others)
    if (
      s.trackIndex &&
      trackIndexCoverage(current.trackIndex, s.trackIndex) >=
        SETUP_COMPARE_COVERAGE
    )
      return { pick: s, reason: null };
  return { pick: null, reason: t.otherTrail(others[0].name) };
}
