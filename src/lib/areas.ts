import { hasLabAccess } from "@/lib/lab-access";

/**
 * The maintenance app is hidden (by request, 2026-10-23): Bikit Pro is the
 * product for now. Every route of the old area answers with a redirect to
 * the account's home, and signing in lands there too. Nothing is deleted —
 * set this back to false and the old area, its links and `/dashboard` as
 * the home all return.
 */
export const MAINTENANCE_HIDDEN = true;

/** The maintenance area's routes — the `(app)` route group. */
const MAINTENANCE_PREFIXES = ["/dashboard", "/bikes", "/settings", "/help", "/legal"];

/** Where an account without access to the Pro waits while it is a closed
 * beta. */
export const BETA_PATH = "/beta";

export function isMaintenancePath(pathname: string): boolean {
  return MAINTENANCE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isProPath(pathname: string): boolean {
  return pathname === "/pro" || pathname.startsWith("/pro/");
}

/** Where a signed-in account lands: the Pro for the accounts it is open to,
 * the beta's waiting page for the rest — or the dashboard, as before, while
 * the maintenance app is shown. */
export function homePathFor(
  email: string | null | undefined,
  hidden: boolean = MAINTENANCE_HIDDEN,
): string {
  if (!hidden) return "/dashboard";
  return hasLabAccess(email) ? "/pro" : BETA_PATH;
}

/**
 * Where the proxy sends a signed-in request instead, or null to let it
 * through. The sign-in pages always send an account home; while the
 * maintenance app is hidden so do its routes, the Pro to an account it is
 * not open to yet, and the beta's waiting page to one it is.
 */
export function signedInRedirect(
  pathname: string,
  email: string | null | undefined,
  hidden: boolean = MAINTENANCE_HIDDEN,
): string | null {
  const home = homePathFor(email, hidden);
  const goHome =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    (hidden &&
      (isMaintenancePath(pathname) ||
        (isProPath(pathname) && home === BETA_PATH) ||
        (pathname === BETA_PATH && home !== BETA_PATH)));
  return goHome && pathname !== home ? home : null;
}
