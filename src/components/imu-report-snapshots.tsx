"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ImuSnapshotGlyph } from "@/components/imu-snapshot-glyph";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import type { ImuSessionData } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import { loadImuSession } from "@/lib/imu/use-imu-session";
import {
  findSnapshotPasses,
  prepareSnapshotSession,
  snapshotPassMetrics,
  snapshotPassPath,
  type SnapshotPass,
  type SnapshotPassMetrics,
  type SnapshotSession,
} from "@/lib/imu/snapshot";
import {
  REFERENCE_MATCH_MS,
  SNAPSHOT_TIE_MS,
  type ImuSnapshotCandidate,
  type ImuSnapshotRow,
} from "@/components/imu-snapshot-view";
import { ImuSnapshotMiniMap } from "@/components/imu-snapshot-mini-map";
import { SnapshotKindMark } from "@/components/imu-event-icons";

const seconds = (ms: number) =>
  (ms / 1000).toLocaleString("pt-PT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/**
 * The Snapshots this recording passes through, under the report's three
 * cards, in the supplied layout (2026-09-14): a heading with how many,
 * and a switch to fold them away; then a card each — the kind's mark, the
 * name, the reference's day and the instants of its gates, a pill for
 * where this recording stands against it (the reference itself, or its
 * time against the reference's), and on the right how many sessions the
 * Snapshot sets side by side and the picture of the stretch. The figures
 * stay on the Snapshot's page, a click away.
 *
 * The page hands over the Snapshots whose gates this track comes near;
 * the file, already read for the report, decides which it actually
 * passes. A reference that lives in another session is read once,
 * however many Snapshots point at it.
 */
export function ImuReportSnapshots({
  data,
  session,
  snapshots,
  referenceSessions,
}: {
  data: ImuSessionData;
  /** This recording, as a Snapshot row names it. */
  session: ImuSnapshotCandidate;
  snapshots: ImuSnapshotRow[];
  /** The other sessions the Snapshots' references live in, by id. */
  referenceSessions: Record<string, ImuSnapshotCandidate>;
}) {
  const prepared = useMemo(() => prepareSnapshotSession(data), [data]);
  const [open, setOpen] = useState(true);

  // This session's passes through each Snapshot, from the file in hand.
  const own = useMemo(() => {
    const out = new Map<
      string,
      { pass: SnapshotPass; metrics: SnapshotPassMetrics }[]
    >();
    for (const s of snapshots)
      out.set(
        s.id,
        findSnapshotPasses(prepared, s.definition).map((pass) => ({
          pass,
          metrics: snapshotPassMetrics(prepared, pass),
        })),
      );
    return out;
  }, [prepared, snapshots]);

  const shown = useMemo(
    () => snapshots.filter((s) => (own.get(s.id)?.length ?? 0) > 0),
    [snapshots, own],
  );

  // The reference sessions still to read: those of the Snapshots shown
  // whose reference is not this recording.
  const neededIds = useMemo(
    () => [
      ...new Set(
        shown
          .map((s) => s.referenceSessionId)
          .filter(
            (id): id is string =>
              id != null && id !== session.id && id in referenceSessions,
          ),
      ),
    ],
    [shown, session.id, referenceSessions],
  );
  const [refs, setRefs] = useState<Map<string, SnapshotSession | "error">>(
    () => new Map(),
  );
  // Reads already started, so a re-render mid-download does not start a
  // second one for the same file.
  const started = useRef(new Set<string>());
  useEffect(() => {
    let cancelled = false;
    // What THIS run starts is released on cleanup: a cancelled read never
    // lands, so the next run (strict mode's second, or a real change) has
    // to be free to start it again. The set is copied into the closure
    // for the cleanup, as the lint rule asks — it is the same Set object.
    const startedSet = started.current;
    const mine: string[] = [];
    for (const id of neededIds) {
      if (startedSet.has(id)) continue;
      startedSet.add(id);
      mine.push(id);
      const candidate = referenceSessions[id];
      (async () => {
        const result = await loadImuSession(
          candidate.storagePath,
          candidate.mountOrientation,
          candidate.trim,
        );
        if (cancelled) return;
        setRefs((prev) =>
          new Map(prev).set(
            id,
            result.data === null
              ? "error"
              : prepareSnapshotSession(result.data),
          ),
        );
      })();
    }
    return () => {
      cancelled = true;
      for (const id of mine) startedSet.delete(id);
    };
  }, [neededIds, referenceSessions]);

  // Each card's inputs, worked out once per change of what is loaded —
  // the reference pass in particular has to keep its identity between
  // renders, or the map under it redraws on every one.
  const cards = useMemo(
    () =>
      shown.map((snapshot) => {
        const passes = own.get(snapshot.id) ?? [];
        const isOwnReference = snapshot.referenceSessionId === session.id;
        let refPrepared: SnapshotSession | null = null;
        let refPass: SnapshotPass | null = null;
        let referenceState: "ok" | "loading" | "error" | "lost" = "ok";
        const matchRef = (list: SnapshotPass[]) =>
          list.find(
            (pass) =>
              Math.abs(pass.entryMs - snapshot.referenceEntryMs) <=
              REFERENCE_MATCH_MS,
          ) ?? null;
        if (isOwnReference) {
          refPrepared = prepared;
          refPass = matchRef(passes.map((p) => p.pass));
          if (!refPass) referenceState = "lost";
        } else if (
          snapshot.referenceSessionId &&
          snapshot.referenceSessionId in referenceSessions
        ) {
          const state = refs.get(snapshot.referenceSessionId);
          if (!state) referenceState = "loading";
          else if (state === "error") referenceState = "error";
          else {
            refPrepared = state;
            refPass = matchRef(findSnapshotPasses(state, snapshot.definition));
            if (!refPass) referenceState = "lost";
          }
        } else referenceState = "lost";
        const referenceSession = isOwnReference
          ? session
          : snapshot.referenceSessionId
            ? (referenceSessions[snapshot.referenceSessionId] ?? null)
            : null;
        return {
          snapshot,
          passes,
          isOwnReference,
          referenceSession,
          referenceState,
          refPrepared,
          refPass,
          refDurationMs: refPass ? refPass.exitMs - refPass.entryMs : null,
        };
      }),
    [shown, own, prepared, refs, session, referenceSessions],
  );

  if (shown.length === 0) return null;

  return (
    <section className="space-y-[18px] pt-4">
      <div className="flex items-center gap-3 px-1">
        <ImuSnapshotGlyph className="size-7 text-foreground" sizePx={28} />
        <p className="text-sm">
          <span className="font-semibold">Snapshots</span>{" "}
          <span className="text-muted-foreground">
            {shown.length === 1
              ? "1 troço de referência nesta gravação"
              : `${shown.length} troços de referência nesta gravação`}
          </span>
        </p>
        {/* The list folds away: a recording can pass a dozen Snapshots,
            and the three cards above are what the report is about. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Esconder os Snapshots" : "Mostrar os Snapshots"}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground"
        >
          ({shown.length})
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
      </div>
      {open &&
        cards.map((card) => (
          <SnapshotCard key={card.snapshot.id} session={session} {...card} />
        ))}
    </section>
  );
}

/** One Snapshot's card — see ImuReportSnapshots. */
function SnapshotCard({
  snapshot,
  session,
  passes,
  isOwnReference,
  referenceSession,
  referenceState,
  refPrepared,
  refPass,
  refDurationMs,
}: {
  snapshot: ImuSnapshotRow;
  session: ImuSnapshotCandidate;
  passes: { pass: SnapshotPass; metrics: SnapshotPassMetrics }[];
  isOwnReference: boolean;
  referenceSession: ImuSnapshotCandidate | null;
  referenceState: "ok" | "loading" | "error" | "lost";
  refPrepared: SnapshotSession | null;
  refPass: SnapshotPass | null;
  refDurationMs: number | null;
}) {
  // Built once per reference, not per render: the map redraws (and
  // refetches its tiles) whenever these arrays change identity.
  const mapData = useMemo(() => {
    if (!refPrepared || !refPass || !refPrepared.track) return null;
    const t = refPrepared.track;
    return {
      track: t.latDeg.map((lat, k): [number, number] => [lat, t.lonDeg[k]]),
      section: snapshotPassPath(refPrepared, refPass),
    };
  }, [refPrepared, refPass]);
  const isReferencePass = (pass: SnapshotPass) =>
    isOwnReference &&
    Math.abs(pass.entryMs - snapshot.referenceEntryMs) <= REFERENCE_MATCH_MS;

  return (
    <Link
      // Under the reference's session, so back from the Snapshot lands on
      // the report it belongs to; this session's own when the reference
      // is gone.
      href={`/labs/imu/${snapshot.referenceSessionId ?? session.id}/snapshots/${snapshot.id}`}
      className={cn(
        "flex flex-col gap-4 rounded-lg bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:px-[22px]",
        DARK_CARD_HAIRLINE,
        CLICKABLE_CARD_HOVER,
      )}
    >
      <div className="min-w-0">
        <SnapshotKindMark kind={snapshot.definition.kind} />
        <p className="mt-4 font-display text-xl font-semibold">
          {snapshot.name}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {referenceSession
            ? `${formatDate(referenceSession.createdAt)} · entre ${formatSessionTime(snapshot.referenceEntryMs)} e ${formatSessionTime(snapshot.referenceExitMs)}`
            : referenceState === "loading"
              ? "A ler a sessão de referência…"
              : "A passagem de referência já não existe"}
        </p>
        {/* Where this recording stands against the reference: the
            reference itself, or each pass's time against it in the
            page's colours — green faster, red slower, a clear pill for a
            tie inside the gates' own scatter. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {passes.map(({ pass, metrics }, i) => (
            <PassPill
              key={i}
              order={passes.length > 1 ? i + 1 : null}
              isReference={isReferencePass(pass)}
              durationMs={metrics.durationMs}
              refDurationMs={refDurationMs}
              stopped={metrics.stopped}
            />
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-stretch gap-4">
        <div className="flex w-[100px] flex-col items-center justify-center rounded-[14px] border border-border px-2 py-3 text-center">
          <p className="text-xs leading-tight">Sessões em comparação</p>
          <p className="mt-2 text-base leading-tight font-semibold tabular-nums">
            {snapshot.sessionCount ?? "—"}
          </p>
        </div>
        <div className="h-[106px] w-[156px] overflow-hidden rounded-[12px] bg-sidebar">
          {mapData && (
            <ImuSnapshotMiniMap
              track={mapData.track}
              section={mapData.section}
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </Link>
  );
}

/** One pass of this recording as a pill: "Referência" when it is the
 * reference pass, otherwise its time against the reference's — until the
 * reference is read, its own time in a clear pill. */
function PassPill({
  order,
  isReference,
  durationMs,
  refDurationMs,
  stopped,
}: {
  order: number | null;
  isReference: boolean;
  durationMs: number;
  refDurationMs: number | null;
  stopped: boolean;
}) {
  const prefix = order != null ? `${order}.ª · ` : "";
  const base =
    "rounded-full border px-2 py-0.5 font-medium whitespace-nowrap tabular-nums";
  let pill;
  if (isReference)
    pill = (
      <span
        className={cn(base, "border-foreground bg-foreground text-background")}
      >
        {prefix}Referência
      </span>
    );
  else if (refDurationMs == null)
    pill = (
      <span
        className={cn(base, "border-foreground bg-transparent text-foreground")}
      >
        {prefix}
        {seconds(durationMs)} s
      </span>
    );
  else {
    const diff = durationMs - refDurationMs;
    const tie = Math.abs(diff) <= SNAPSHOT_TIE_MS;
    pill = (
      <span
        title={`${seconds(durationMs)} s nesta volta, ${seconds(refDurationMs)} s na referência`}
        className={cn(
          base,
          tie
            ? "border-foreground bg-transparent text-foreground"
            : diff < 0
              ? "border-foreground bg-foreground text-primary"
              : "border-foreground bg-foreground text-[#FF5A39]",
        )}
      >
        {prefix}
        {tie
          ? "≈ referência"
          : `${diff < 0 ? "−" : "+"}${seconds(Math.abs(diff))} s`}
      </span>
    );
  }
  return (
    <>
      {pill}
      {stopped && (
        <span
          className={cn(
            base,
            "border-transparent bg-[#FFEEBE] text-[#5b4a00] dark:bg-[#FFEEBE]/15 dark:text-[#F7E4AA]",
          )}
        >
          parou
        </span>
      )}
    </>
  );
}
