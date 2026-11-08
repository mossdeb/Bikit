import { SettingsContent } from "./settings-content";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <SettingsContent error={error} />;
}
