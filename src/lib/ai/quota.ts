// Two ceilings, two purposes — both MONTHLY and PER PLAN since 2026-08-11
// (they were 3/day for everyone during the first beta days). The product
// quota counts SUCCESSFUL bike searches — a search that found nothing gave
// the user nothing, so it does not spend one of the month's searches. That
// mercy is also a hole (failed searches still cost an OpenAI call), so a
// second, higher ceiling counts every attempt regardless of outcome — 2×
// the plan's quota (free 2, personal 10, pro 20 a month). Catalog
// hits reach neither: they never touch ai_request_log, which is what makes
// "bikes already in the catalog are free" true on every plan, including
// Free's single search.
//
// Component profile lookups (kind = 'component') ride along with a bike
// search and are logged for the cost ledger, but are not counted here —
// quota-wise a bike search is one unit, however many components it drags in.

import type { Plan } from "../plans";

export const AI_BIKE_SEARCHES_PER_MONTH: Record<Plan, number> = {
  free: 1,
  personal: 5,
  pro: 10,
};

const ATTEMPTS_MULTIPLIER = 2;

export interface AiSearchAllowance {
  allowed: boolean;
  /** Successful searches left this month; what the UI shows. */
  remaining: number;
}

export function computeAllowance(outcomes: string[], plan: Plan): AiSearchAllowance {
  const quota = AI_BIKE_SEARCHES_PER_MONTH[plan];
  const found = outcomes.filter((o) => o === "found").length;
  const remaining = Math.max(0, quota - found);
  const attemptsLeft = outcomes.length < quota * ATTEMPTS_MULTIPLIER;
  return { allowed: remaining > 0 && attemptsLeft, remaining };
}

/** Month boundary is the 1st at UTC midnight — a calendar month, chosen over
 * a rolling window because "5 searches a month" is what the plan copy says
 * and "resets on the 1st" is an answer a user can act on. */
export function startOfMonthUtcIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
