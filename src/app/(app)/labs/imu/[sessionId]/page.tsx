import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { formatDate } from "@/lib/format";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import type { BikeType } from "@/lib/constants";
import { ImuChartGlyph } from "@/components/imu-pro-logo";
import { ImuSessionAnalysis } from "@/components/imu-session-analysis";

/**
 * Lab: one IMU session's analysis. Same gate as the list — notFound for
 * anyone but the owner, and again for a session id that is not theirs (the
 * query is scoped to user_id, so someone else's id reads as nonexistent).
 * The page serves only the row; the raw file is downloaded by the client
 * component straight from Storage, where RLS guards it a second time.
 */
export default async function ImuSessionPage({
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
    .select("id, name, bike_id, created_at, duration_ms, storage_path")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();

  const { data: bike } = session.bike_id
    ? await supabase
        .from("bikes")
        .select("name, type")
        .eq("id", session.bike_id)
        .single()
    : { data: null };
  const BikeGlyph = bike?.type
    ? BIKE_TYPE_ICON[bike.type as BikeType]
    : undefined;

  return (
    // 15px of side margin on a phone instead of the app's 20: the plot inside
    // this card is the one thing the page exists to show, and every pixel of
    // margin is a pixel it does not get. Done by cancelling the shell's own
    // px-5 and declaring the smaller one — a deliberate exception to the
    // 20px rule, like the Ride Load report's 18px, and only in the lab.
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
      {/* The back chevron lives in the app header (HeaderBackButton has this
          route), matching the rest of the app — not inside the page. */}

      {/* One card, no padding of its own — each section brings its own px, so
          the rules that do exist run edge to edge. There is no rule between
          the header and the résumé: since the résumé became a box of its own,
          a line above it drew a second frame around the first. */}
      <div className="rounded-lg bg-card">
        <div className="px-5 py-5 sm:px-6">
          {/* stroke-width pinned in CSS, the bike-created screen's trick. The
              art is drawn for a 30-unit box, so its own 1.146 units would
              paint 1.34px at 35px; 1.286 units paint the 1.5px asked for
              (1.5 ÷ (35/30)). */}
          <ImuChartGlyph className="h-auto w-[35px] text-foreground [&_path]:[stroke-width:1.286]" />
          {/* The mark and the name are one unit — the glyph is the session's
              badge, not a decoration floating above it — so they close ranks
              and the two lines of provenance underneath step back. */}
          <h1 className="mt-2 font-display text-2xl font-bold">
            {session.name}
          </h1>
          {bike?.name && (
            <p className="mt-8 flex items-center gap-2 text-sm font-medium">
              {BikeGlyph && (
                <BikeGlyph
                  className="h-5 w-7 shrink-0 text-foreground"
                  aria-hidden
                />
              )}
              {bike.name}
            </p>
          )}
          {/* Date only: the duration is a figure in the stats row right
              below, and printing it twice made the header read as a summary
              of a summary. */}
          <p className="mt-1.5 text-sm text-muted-foreground">
            {formatDate(session.created_at)}
          </p>
        </div>

        <ImuSessionAnalysis storagePath={session.storage_path} />
      </div>
    </div>
  );
}
