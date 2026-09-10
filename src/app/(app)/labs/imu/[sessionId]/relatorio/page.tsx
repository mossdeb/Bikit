import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { formatDate } from "@/lib/format";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import { ImuLabTexture } from "@/components/imu-lab-texture";
import { ImuSessionReport } from "@/components/imu-session-report";
import type { ImuMountOrientation } from "@/lib/imu/format";

/**
 * Lab: one IMU session's report — the recording read as rider, bike and
 * trail. Same gate and the same row as the analysis page; the file itself
 * is downloaded by the client component from Storage, where RLS guards it
 * a second time. The back chevron in the app header returns to the
 * analysis (HeaderBackButton has this route).
 */
export default async function ImuSessionReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email)) notFound();

  const { data: session } = await supabase
    .from("imu_sessions")
    .select(
      "id, name, rider_name, mount_orientation, created_at, sample_rate_hz, sample_count, storage_path",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();

  return (
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
      <ImuLabTexture />
      <ImuSessionReport
        storagePath={session.storage_path}
        mountOrientation={
          session.mount_orientation as unknown as ImuMountOrientation | null
        }
        header={
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <ImuDocGlyph className="h-auto w-[28px] text-foreground [&_path]:[stroke-width:1.5]" />
            <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Relatório
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold">
              {session.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {session.rider_name ? `${session.rider_name} · ` : ""}
              {formatDate(session.created_at)} ·{" "}
              {Math.round(session.sample_rate_hz)} Hz ·{" "}
              {session.sample_count.toLocaleString("pt-PT")} amostras
            </p>
          </div>
        }
      />
    </div>
  );
}
