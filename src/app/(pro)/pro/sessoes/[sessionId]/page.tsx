import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { hasLabAccess } from "@/lib/lab-access";
import { localeFromMetadata } from "@/lib/i18n";
import { getProDictionary, proNumber } from "@/lib/i18n/pro";
import { formatDate } from "@/lib/format";
import {
  BIKE_ICON_FALLBACK,
  BIKE_TYPE_ICON,
} from "@/components/bike-type-icon";
import type { BikeType } from "@/lib/constants";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import { ImuSessionAnalysis } from "@/components/imu-session-analysis";
import { ImuSessionSettings } from "@/components/imu-session-settings";
import type { ImuSnapshotTwin } from "@/components/imu-snapshot-create";
import {
  ImuSessionSetup,
  type ImuSetupLabels,
} from "@/components/imu-session-setup";
import { isSetupValues, type ImuSetupValues } from "@/lib/imu/setup";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { trimOf } from "@/lib/imu/trim";
import {
  SETUP_COMPONENT_CATEGORIES,
  setupLabelsOf,
} from "@/lib/imu/setup-labels";
import { isSnapshotDefinition } from "@/lib/imu/snapshot";

/**
 * Lab: one IMU session's analysis. Same gate as the list — notFound for
 * anyone but the owner, and again for a session id that is not theirs (the
 * query is scoped to user_id, so someone else's id reads as nonexistent).
 * The page serves only the row; the raw file is downloaded by the client
 * component straight from Storage, where RLS guards it a second time.
 */
/** The riders the sessions were ridden by, newest first, each once. */
function riderNames(sessions: { rider_name: string | null }[]): string[] {
  return [
    ...new Set(sessions.map((s) => s.rider_name?.trim() ?? "").filter(Boolean)),
  ];
}

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
      "id, name, rider_name, bike_id, group_id, mount_orientation, setup_id, created_at, duration_ms, sample_rate_hz, sample_count, storage_path, trim_start_ms, trim_end_ms",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();

  // Every bike and every group, not just the session's own: the settings
  // dialog lets the rider pick another of each. The session's bike is
  // looked up in the same list rather than fetched a second time.
  const [
    { data: bikes },
    { data: groups },
    { data: snapshotRows },
    { data: riderRows },
  ] = await Promise.all([
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
    // Every Snapshot of the account: the "Snapshot" dialog on an event's
    // card checks whether one already stands on the same gates before it
    // makes another (findSnapshotTwins). Definitions only; nothing is
    // measured here.
    supabase
      .from("imu_snapshots")
      .select("id, name, definition, reference_session_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    // The riders the account's sessions were ridden by, for the
    // settings dialog's list (newest first, each once — riderNames).
    supabase
      .from("imu_sessions")
      .select("rider_name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  // The reference sessions' names, for "one already exists … made from
  // Run 1" — one query for all of them.
  const snapshotDefs = (snapshotRows ?? []).filter((row) =>
    isSnapshotDefinition(row.definition),
  );
  const referenceIds = [
    ...new Set(
      snapshotDefs
        .map((row) => row.reference_session_id)
        .filter((id): id is string => id != null),
    ),
  ];
  const referenceNames = new Map<string, string>();
  if (referenceIds.length > 0) {
    const { data: rows } = await supabase
      .from("imu_sessions")
      .select("id, name")
      .eq("user_id", userId)
      .in("id", referenceIds);
    for (const row of rows ?? []) referenceNames.set(row.id, row.name);
  }
  const existingSnapshots: ImuSnapshotTwin[] = snapshotDefs.map((row) => ({
    id: row.id,
    name: row.name,
    // Narrowed by the filter above; the type does not carry it over.
    definition: row.definition as never,
    referenceSessionName: row.reference_session_id
      ? (referenceNames.get(row.reference_session_id) ?? null)
      : null,
  }));
  const bike = session.bike_id
    ? ((bikes ?? []).find((b) => b.id === session.bike_id) ?? null)
    : null;
  // The run's setup (see src/lib/imu/setup.ts) and what the bike calls its
  // dampers, for the form's headings: the fork and shock components it
  // has registered, by brand and model when they carry one.
  const [{ data: setupRow }, { data: dampers }] = await Promise.all([
    session.setup_id
      ? supabase
          .from("imu_setups")
          .select("values, note")
          .eq("id", session.setup_id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    session.bike_id
      ? supabase
          .from("components")
          .select("category, name, brand, model")
          .eq("bike_id", session.bike_id)
          .eq("user_id", userId)
          .is("retired_at", null)
          .in("category", SETUP_COMPONENT_CATEGORIES)
      : Promise.resolve({ data: null }),
  ]);
  const setupValues: ImuSetupValues =
    setupRow && isSetupValues(setupRow.values) ? setupRow.values : {};
  const setupNote = setupRow?.note ?? null;
  const setupLabels: ImuSetupLabels = setupLabelsOf(dampers);
  const BikeGlyph = bike
    ? (BIKE_TYPE_ICON[bike.type as BikeType] ?? BIKE_ICON_FALLBACK)
    : undefined;
  // What a blank rider becomes on save — the same fallback the import and
  // the update action use, so the dialog's placeholder tells the truth.
  const metadata = userData?.claims?.user_metadata as
    { full_name?: string } | undefined;
  const riderDefault = metadata?.full_name?.trim() || email || "";
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const t = getProDictionary(locale);

  return (
    // 15px of side margin on a phone instead of the app's 20: the plot inside
    // this card is the one thing the page exists to show, and every pixel of
    // margin is a pixel it does not get. Done by cancelling the shell's own
    // px-5 and declaring the smaller one — a deliberate exception to the
    // 20px rule, like the Ride Load report's 18px, and only in the lab.
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
      {/* The lab's dot grid on the page background, for as long as this
          page is mounted. Renders nothing of its own. */}
      {/* The back chevron lives in the app header (HeaderBackButton has this
          route), matching the rest of the app — not inside the page. */}

      {/* The identity block is rendered here, on the server, and handed to
          the client component as a node — it owns the cards, because the
          figures that share its card are computed from the file it parses.
          A server node passed as a prop keeps its own props but does receive
          context, the same arrangement the install invite uses. */}
      <ImuSessionAnalysis
        sessionId={session.id}
        storagePath={session.storage_path}
        riderName={session.rider_name}
        existingSnapshots={existingSnapshots}
        // An orientation lent by another session, when this file has none
        // of its own; the shape is what setGroupMountOrientation stored.
        mountOrientation={
          session.mount_orientation as unknown as ImuMountOrientation | null
        }
        trim={trimOf(session.trim_start_ms, session.trim_end_ms)}
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
                riders={riderNames(riderRows ?? [])}
                storagePath={session.storage_path}
              />
            </div>
            {/* The identity and, under it, the doors: the run's setup, the
                report and the comparison of setups. They stood beside the
                words from `sm` (2026-09-10, on the provenance line's foot);
                with three of them the row grew wider than the words, and
                the owner asked for them under the summary on desktop too
                (2026-09-24) — one column at every width, the pills in a
                wrapping row below the provenance. A `min-w-0` column so the
                provenance keeps wrapping. */}
            <div className="flex flex-col gap-5 pr-10 2xl:pr-0">
              <div className="min-w-0">
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
                    <span className="align-middle font-medium">
                      {bike.name}
                    </span>
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
                    {formatDate(session.created_at, locale)} ·{" "}
                    {Math.round(session.sample_rate_hz)} Hz ·{" "}
                    {proNumber(session.sample_count, locale)}{" "}
                    {t.common.units.samples}
                  </span>
                </p>
                {/* The run's setup used to stand here in one line — the
                    fork, the shock and the tyres as they were set. Hidden
                    by request (2026-09-24): three lines of knobs under the
                    name were more than a header should carry, and the
                    "Bike setup" door beside it opens the whole thing. */}
              </div>
              {/* Three doors, side by side: the run's setup, the comparison
                  of setups and the report (the comparison added by request
                  on 2026-09-24, and moved ahead of the report on
                  2026-09-25). Outlined pills — controls, not figures, so
                  they wear the page's outline and not a tile's rules. */}
              <div className="flex shrink-0 flex-wrap gap-3 self-start">
                <ImuSessionSetup
                  sessionId={session.id}
                  values={setupValues}
                  note={setupNote}
                  labels={setupLabels}
                  bikeType={(bike?.type as BikeType | undefined) ?? null}
                />
                <Link
                  href={`/pro/sessoes/${session.id}/afinacoes`}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2.5 rounded-[14px] border border-border bg-card px-5 py-3 font-semibold",
                    CLICKABLE_CARD_HOVER,
                  )}
                >
                  <ArrowLeftRight
                    className="size-[18px] text-foreground"
                    strokeWidth={2.1}
                    aria-hidden
                  />
                  {t.report.compareSetups}
                </Link>
                <Link
                  href={`/pro/sessoes/${session.id}/relatorio`}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2.5 rounded-[14px] border border-border bg-card px-5 py-3 font-semibold",
                    CLICKABLE_CARD_HOVER,
                  )}
                >
                  <ImuDocGlyph className="h-auto w-[18px] text-foreground [&_path]:[stroke-width:2.1]" />
                  {t.sessions.page.report}
                </Link>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
