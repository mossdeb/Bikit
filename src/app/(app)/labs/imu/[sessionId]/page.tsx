import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { formatDate } from "@/lib/format";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import type { BikeType } from "@/lib/constants";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import { ImuSessionAnalysis } from "@/components/imu-session-analysis";
import { ImuLabTexture } from "@/components/imu-lab-texture";
import { ImuSessionSettings } from "@/components/imu-session-settings";
import type { ImuMountOrientation } from "@/lib/imu/format";

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
      "id, name, rider_name, bike_id, group_id, mount_orientation, created_at, duration_ms, sample_rate_hz, sample_count, storage_path",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();

  // Every bike and every group, not just the session's own: the settings
  // dialog lets the rider pick another of each. The session's bike is
  // looked up in the same list rather than fetched a second time.
  const [{ data: bikes }, { data: groups }] = await Promise.all([
    supabase
      .from("bikes")
      .select("id, name, type")
      .eq("user_id", userId)
      .order("name"),
    supabase
      .from("imu_session_groups")
      .select("id, name, day")
      .eq("user_id", userId)
      .order("day", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const bike = session.bike_id
    ? ((bikes ?? []).find((b) => b.id === session.bike_id) ?? null)
    : null;
  const BikeGlyph = bike?.type
    ? BIKE_TYPE_ICON[bike.type as BikeType]
    : undefined;
  // What a blank rider becomes on save — the same fallback the import and
  // the update action use, so the dialog's placeholder tells the truth.
  const metadata = userData?.claims?.user_metadata as
    { full_name?: string } | undefined;
  const riderDefault = metadata?.full_name?.trim() || email || "";

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
        // An orientation lent by another session, when this file has none
        // of its own; the shape is what setGroupMountOrientation stored.
        mountOrientation={
          session.mount_orientation as unknown as ImuMountOrientation | null
        }
        header={
          // Deep bottom padding on purpose: while the résumé sits underneath,
          // the air below the identity is what stops it reading as one more
          // line. From `2xl` the figures move to this block's right instead,
          // and the padding evens out. A `//` comment and not `{/* */}`: this
          // is the value of a prop, so the braces are already a JS expression
          // and a JSX comment here breaks the parse.
          <div className="relative px-5 pt-5 pb-12 sm:px-6 2xl:static 2xl:py-6 2xl:pr-0">
            {/* The session's settings — name, rider, bike, and deleting —
                behind three dots in the card's top-right corner. Below `2xl`
                this block IS the card's width, so it is what the corner is
                measured from; from `2xl` it becomes a column beside the
                tiles, goes `static`, and the corner is the card's own
                (`relative` in SessionCards) — tucked in tighter there, where
                the card is short and the tiles sit close to the top. */}
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 2xl:top-2 2xl:right-2">
              <ImuSessionSettings
                sessionId={session.id}
                name={session.name}
                riderName={session.rider_name}
                bikeId={session.bike_id}
                bikes={(bikes ?? []).map(({ id, name }) => ({ id, name }))}
                groupId={session.group_id}
                groups={groups ?? []}
                riderDefault={riderDefault}
              />
            </div>
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
