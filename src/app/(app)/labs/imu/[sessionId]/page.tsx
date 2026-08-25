import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { formatDate } from "@/lib/format";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import type { BikeType } from "@/lib/constants";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import { ImuSessionAnalysis } from "@/components/imu-session-analysis";
import { ImuLabTexture } from "@/components/imu-lab-texture";

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
    .select(
      "id, name, rider_name, bike_id, created_at, duration_ms, sample_rate_hz, sample_count, storage_path",
    )
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
      {/* The lab's dot grid on the page background, for as long as this
          page is mounted. Renders nothing of its own. */}
      <ImuLabTexture />
      {/* The back chevron lives in the app header (HeaderBackButton has this
          route), matching the rest of the app — not inside the page. */}

      {/* The identity block is rendered here, on the server, and handed to
          the client component as a node — it owns the cards, because the
          figures that share its card are computed from the file it parses.
          A server node passed as a prop keeps its own props but does receive
          context, the same arrangement the install invite uses. */}
      <ImuSessionAnalysis
        storagePath={session.storage_path}
        riderName={session.rider_name}
        header={
          // Deep bottom padding on purpose: while the résumé sits underneath,
          // the air below the identity is what stops it reading as one more
          // line. From `2xl` the figures move to this block's right instead,
          // and the padding evens out. A `//` comment and not `{/* */}`: this
          // is the value of a prop, so the braces are already a JS expression
          // and a JSX comment here breaks the parse.
          <div className="px-5 pt-5 pb-12 sm:px-6 2xl:py-6 2xl:pr-0">
            {/* stroke-width pinned in CSS, the bike-created screen's trick.
                The art is shown 1:1 — 28 units wide in a 28px box — so the
                number here is the number of pixels painted. */}
            <ImuDocGlyph className="h-auto w-[28px] text-foreground [&_path]:[stroke-width:1.5]" />
            {/* The mark and the name are one unit — the glyph is the
                session's badge, not a decoration floating above it — so they
                close ranks and the two lines of provenance underneath step
                back. */}
            <h1 className="mt-2 font-display text-2xl font-semibold">
              {session.name}
            </h1>
            {/* Bike and date on one line: they are the same fact — where
                this recording came from — and stacked they read as two
                claims. The bike carries the weight, the date steps back.
                No duration here: it is a figure in the résumé right below,
                and printing it twice made the header a summary of a summary. */}
            {/* A paragraph and not a flex row: this is one sentence of
                provenance and it has to wrap like one. As flex items the name
                and the tail each claimed a line of their own, and at 375px
                that broke "YT Decoy" across two. The mark goes inline with
                the text, aligned to its middle. */}
            <p className="mt-1.5 text-sm">
              {BikeGlyph && (
                // A square box, not the app's h-5 w-7: the art is 101×104 and
                // `meet` fits it to the height, so a 28px box left ~4px of
                // empty margin on each side of a 19px drawing.
                <BikeGlyph
                  className="mr-2 inline-block h-5 w-5 align-middle text-foreground"
                  aria-hidden
                />
              )}
              {bike?.name && (
                <span className="align-middle font-medium">{bike.name}</span>
              )}
              {/* The rate and the count sit here rather than in the résumé
                  because they describe the file and not the ride — the same
                  trio the session list prints. */}
              <span className="align-middle text-muted-foreground">
                {bike?.name ? " · " : ""}
                {/* The rider leads the provenance tail: whose ride it was
                    belongs beside what carried the sensor, ahead of the
                    facts that describe the file rather than the ride. */}
                {session.rider_name ? `${session.rider_name} · ` : ""}
                {formatDate(session.created_at)} ·{" "}
                {Math.round(session.sample_rate_hz)} Hz ·{" "}
                {session.sample_count.toLocaleString("pt-PT")} amostras
              </span>
            </p>
          </div>
        }
      />
    </div>
  );
}
