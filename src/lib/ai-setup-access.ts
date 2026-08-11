// Relative import: exercised by vitest, which has no @/ alias (no config).
import { PLAN_FEATURES, type Plan } from "./plans";

/**
 * The closed beta ended on 2026-08-11: the email allowlist that sat on top
 * of the plan feature is gone, and access is now what the plan says it is —
 * which today is every plan, Free included.
 *
 * The gate stays even though it currently answers true for everyone. It is
 * the honest expression of "this is a plan capability", and PLAN_FEATURES is
 * the one place to change if Smart Setup ever becomes paid-only.
 *
 * What holds the cost back is no longer who is let in, it is what they can
 * spend once inside: AI_BIKE_SEARCHES_PER_MONTH (Free 1, Personal 5, Pro
 * 10) with an attempts ceiling at 2x, and the Free component cap in the
 * preview. Those were written for this moment and are already live.
 */
export function hasAiSetupAccess(plan: Plan): boolean {
  return PLAN_FEATURES[plan].aiSetup;
}

/**
 * Accounts exempt from the daily search quota (2026-08-10: the owner, who
 * seeds the shared catalog and pays the OpenAI bill anyway). Separate from
 * the beta list on purpose: widening the beta must not silently hand out
 * unlimited searches.
 */
export const AI_UNLIMITED_SEARCH_EMAILS = ["miguelgomesdzn@gmail.com"];

export function hasUnlimitedAiSearches(email: string | null | undefined): boolean {
  if (!email) return false;
  return AI_UNLIMITED_SEARCH_EMAILS.includes(email.trim().toLowerCase());
}
