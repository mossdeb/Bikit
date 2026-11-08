import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { LoggerArea } from "@/components/logger-area";

/**
 * The Logger area (2026-11-08): the header with the connected logger and,
 * for now, its Settings tab. `?simulate=1` talks to a logger in software
 * instead of Bluetooth — the settings commands are not in any firmware yet.
 *
 * Gated as every page under /pro is, and here as well, because a link can
 * reach it without the layout's check.
 */
export default async function LoggerPage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!hasLabAccess(data?.claims?.email as string | undefined)) notFound();
  const { simulate } = await searchParams;
  return <LoggerArea simulate={simulate === "1"} />;
}
