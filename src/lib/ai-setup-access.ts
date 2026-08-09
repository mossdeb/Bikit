// Relative import: exercised by vitest, which has no @/ alias (no config).
import { PLAN_FEATURES, type Plan } from "./plans";

/**
 * Smart Setup is in CLOSED BETA: the plan feature says who could have it
 * (paid plans), this list says who does. A code constant rather than an env
 * var on purpose — the list isn't secret, an env var would fail silently
 * when unset, and either way changing testers means a deploy on this
 * single-branch push-to-deploy repo. Widening the beta is editing this
 * list; ending it is deleting the list and this check.
 */
export const AI_SETUP_BETA_EMAILS = ["miguelgomesdzn@gmail.com"];

export function hasAiSetupAccess(plan: Plan, email: string | null | undefined): boolean {
  if (!PLAN_FEATURES[plan].aiSetup) return false;
  if (!email) return false;
  return AI_SETUP_BETA_EMAILS.includes(email.trim().toLowerCase());
}
