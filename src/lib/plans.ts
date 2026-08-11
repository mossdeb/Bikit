export type Plan = "free" | "personal" | "pro";
export type PaidPlan = Extract<Plan, "personal" | "pro">;

export const PLAN_LIMITS: Record<Plan, { maxBikes: number | null; maxComponents: number | null }> = {
  free: { maxBikes: 1, maxComponents: 2 },
  personal: { maxBikes: 3, maxComponents: null },
  pro: { maxBikes: null, maxComponents: null },
};

/**
 * What a plan can do, as opposed to how much of it. Kept apart from
 * PLAN_LIMITS because a limit is a number the UI counts against and a feature
 * is a door that is either open or shut.
 */
export const PLAN_FEATURES: Record<Plan, { timeline: boolean; aiSetup: boolean }> = {
  // aiSetup on Free is real but tight: 1 search a month, and the component
  // picker respects the 2-component plan limit. Since the closed beta ended
  // (2026-08-11) this table is the whole answer — there is no allowlist over
  // it any more, so a false here is what takes the feature away.
  free: { timeline: false, aiSetup: true },
  personal: { timeline: true, aiSetup: true },
  pro: { timeline: true, aiSetup: true },
};

/** How often a paid plan bills. Both intervals are prices on the same Stripe
 * product, which is what keeps plan resolution working — see PLAN_PRODUCT_IDS. */
export type BillingInterval = "month" | "year";

export const BILLING_INTERVALS: BillingInterval[] = ["month", "year"];

// Stripe test-mode price IDs (Bikit Personal / Bikit Pro, sandbox account).
export const PLAN_PRICE_IDS: Record<PaidPlan, Record<BillingInterval, string>> = {
  personal: {
    month: process.env.STRIPE_PRICE_PERSONAL ?? "",
    year: process.env.STRIPE_PRICE_PERSONAL_YEARLY ?? "",
  },
  pro: {
    month: process.env.STRIPE_PRICE_PRO ?? "",
    year: process.env.STRIPE_PRICE_PRO_YEARLY ?? "",
  },
};

/** Empty IDs are dropped rather than mapped: an unset env var would otherwise
 * put a "" key in here, and any price whose ID failed to read would resolve to
 * whichever plan happened to own that blank. */
export const PRICE_TO_PLAN: Record<string, PaidPlan> = Object.fromEntries(
  (Object.entries(PLAN_PRICE_IDS) as [PaidPlan, Record<BillingInterval, string>][]).flatMap(([plan, prices]) =>
    Object.values(prices)
      .filter(Boolean)
      .map((priceId) => [priceId, plan]),
  ),
);

/**
 * Products, unlike prices, survive a price change: Stripe prices are immutable,
 * so raising a price means creating a new one and archiving the old, but both
 * keep pointing at the same product. That makes the product the stable identity
 * of a plan, and it is what saves a subscriber whose price ID has since been
 * rotated out of the env vars.
 *
 * Optional: with these unset the price map still resolves every current
 * subscriber, and an unrecognised price is treated as unknown rather than as
 * the free plan.
 */
export const PLAN_PRODUCT_IDS: Record<PaidPlan, string> = {
  personal: process.env.STRIPE_PRODUCT_PERSONAL ?? "",
  pro: process.env.STRIPE_PRODUCT_PRO ?? "",
};

/** Empty IDs are dropped, for the same reason they are in PRICE_TO_PLAN — and
 * here it is the normal case rather than a mistake, since both variables are
 * optional and going live with them unset is a supported state. */
export const PRODUCT_TO_PLAN: Record<string, PaidPlan> = Object.fromEntries(
  (Object.entries(PLAN_PRODUCT_IDS) as [PaidPlan, string][])
    .filter(([, productId]) => productId)
    .map(([plan, productId]) => [productId, plan]),
);
