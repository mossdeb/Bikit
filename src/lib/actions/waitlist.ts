"use server";

import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The landing's waitlist. A signed-out visitor's address, so it goes through
 * the privileged client: the table has no policies, and nobody can read it
 * or write to it from a browser (migration 00056). Joining twice is not an
 * error, and answers the same as joining once — the reply must not tell a
 * stranger whether an address is already on the list.
 */
export async function joinWaitlist({
  email,
  website,
  locale,
}: {
  email: string;
  website: string;
  locale: string;
}): Promise<{ status: "sent" | "invalid" | "failed" }> {
  // The hidden field: looks fine to the bot, and writes nothing.
  if (website) return { status: "sent" };
  const address = email.trim().toLowerCase();
  if (address.length > 254 || !EMAIL.test(address)) return { status: "invalid" };
  const { error } = await createAdminClient()
    .from("waitlist_signups")
    .upsert(
      { email: address, locale: locale === "pt" ? "pt" : "en" },
      { onConflict: "email", ignoreDuplicates: true },
    );
  return { status: error ? "failed" : "sent" };
}
