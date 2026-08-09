// Two ceilings, two purposes. The product quota counts SUCCESSFUL bike
// searches — a search that found nothing gave the user nothing, so it does
// not spend one of their day's searches. That mercy is also a hole (failed
// searches still cost an OpenAI call), so a second, higher ceiling counts
// every attempt regardless of outcome. Catalog hits reach neither: they
// never touch ai_request_log.
//
// Component profile lookups (kind = 'component') ride along with a bike
// search and are logged for the cost ledger, but are not counted here —
// quota-wise a bike search is one unit, however many components it drags in.

export const AI_BIKE_SEARCHES_PER_DAY = 3;
export const AI_BIKE_ATTEMPTS_PER_DAY = 10;

export interface AiSearchAllowance {
  allowed: boolean;
  /** Successful searches left today; what the UI shows. */
  remaining: number;
}

export function computeAllowance(outcomes: string[]): AiSearchAllowance {
  const found = outcomes.filter((o) => o === "found").length;
  const remaining = Math.max(0, AI_BIKE_SEARCHES_PER_DAY - found);
  const attemptsLeft = outcomes.length < AI_BIKE_ATTEMPTS_PER_DAY;
  return { allowed: remaining > 0 && attemptsLeft, remaining };
}

/** Day boundary is UTC midnight — same convention as the notification cron,
 * and honest enough for a limit whose point is stopping runaway cost, not
 * billing precision. */
export function startOfTodayUtcIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
