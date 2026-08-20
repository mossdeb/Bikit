import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { formatDate } from "@/lib/format";
import { ImuSessionAnalysis } from "@/components/imu-session-analysis";

/**
 * Lab: one IMU session's analysis. Same gate as the list — notFound for
 * anyone but the owner, and again for a session id that is not theirs (the
 * query is scoped to user_id, so someone else's id reads as nonexistent).
 * The page serves only the row; the raw file is downloaded by the client
 * component straight from Storage, where RLS guards it a second time.
 */
export default async function ImuSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email)) notFound();

  const { data: session } = await supabase
    .from("imu_sessions")
    .select("id, name, bike_id, created_at, storage_path")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();

  const { data: bike } = session.bike_id
    ? await supabase.from("bikes").select("name").eq("id", session.bike_id).single()
    : { data: null };

  return (
    <div className="pt-4 pb-10 sm:pt-8">
      {/* The back chevron lives in the app header (HeaderBackButton has this
          route), matching the rest of the app — not inside the page. */}

      {/* One card with rules between its parts, the Ride Load report's exact
          shape: the card itself carries no padding, each section brings its
          own px — that is what lets divide-y run edge to edge. */}
      <div className="divide-y divide-border rounded-lg bg-card">
        <div className="px-5 py-5 sm:px-6">
          <h1 className="font-display text-2xl font-bold">{session.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(session.created_at)}
            {bike?.name ? ` · ${bike.name}` : ""}
          </p>
        </div>

        <ImuSessionAnalysis storagePath={session.storage_path} />
      </div>
    </div>
  );
}
