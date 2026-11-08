import { SettingsContent } from "@/app/(app)/settings/settings-content";

/**
 * The account's settings, under Bikit Pro's shell: the body of the page the
 * app shows at /settings, rendered here so the Pro side has its own door to
 * it. One page, two addresses — anything changed there is changed here —
 * except that Pro leaves the plan out for now and puts the preferences
 * second (by request, 2026-11-08).
 */
export default async function ProSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <SettingsContent error={error} pro />;
}
