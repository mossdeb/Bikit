"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import type { ImuSessionData } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import { loadImuSession } from "@/lib/imu/use-imu-session";
import {
  findSnapshotPasses,
  prepareSnapshotSession,
  SNAPSHOT_KIND_LABEL,
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

/**
 * The Snapshots this recording passes through, under the report's three
 * cards (by request, 2026-09-10): each as a card in the shape of the
 * Snapshot page's header — name, reference, the picture of the stretch —
 * with this session's passes as one line of times against the reference.
 * The figures stay on the Snapshot's page (simplified by request, the same
 * day: the full lines here were more than the report needed). The page
 * hands over the Snapshots
 * whose gates this track comes near; the file, already read for the
 * report, decides which it actually passes. A reference that lives in
 * another session is read once, however many Snapshots point at it.
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
        // The reference pass and the session it is read from: one of this
        // session's own passes, or the reference session's once that file
        // has been read. Only its time is needed here — the figures are
        // the Snapshot page's business (simplified by request, 2026-09-10).
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
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Camera className="size-5 text-foreground" strokeWidth={1.75} />
        <h2 className="font-display text-lg font-semibold">Snapshots</h2>
        <span className="text-sm text-muted-foreground">
          {shown.length === 1
            ? "1 troço de referência nesta gravação"
            : `${shown.length} troços de referência nesta gravação`}
        </span>
      </div>
      {cards.map((card) => (
        <SnapshotCard key={card.snapshot.id} session={session} {...card} />
      ))}
    </section>
  );
}

/** One Snapshot's card: the Snapshot page's own header as a card —
 * identity on the left, the picture of the stretch on the right, this
 * session's passes as one line. The detail lives a click away. */
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

  return (
    <Link
      // Under the reference's session, so back from the Snapshot
      // lands on the report it belongs to; this session's own when
      // the reference is gone.
      href={`/labs/imu/${snapshot.referenceSessionId ?? session.id}/snapshots/${snapshot.id}`}
      className={cn(
        // The Snapshot page's own header, as a card: identity on the
        // left, the picture of the stretch on the right, and this
        // session's passes as one line — the detail lives a click
        // away.
        "flex flex-col gap-4 rounded-lg bg-card px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        DARK_CARD_HAIRLINE,
        CLICKABLE_CARD_HOVER,
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {SNAPSHOT_KIND_LABEL[snapshot.definition.kind]}
        </p>
        <p className="mt-0.5 font-display text-xl font-semibold">
          {snapshot.name}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {referenceSession ? (
            <>
              Referência:{" "}
              <span className="text-foreground">{referenceSession.name}</span>{" "}
              aos {formatSessionTime(snapshot.referenceEntryMs)}
              {refDurationMs != null &&
                ` · ${(refDurationMs / 1000).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`}
            </>
          ) : referenceState === "loading" ? (
            "A ler a sessão de referência…"
          ) : (
            "A passagem de referência já não existe"
          )}
        </p>
        {/* This session's passes, each as its time against the
                  reference's — within the gates' precision is a tie. */}
        <p className="mt-1 text-sm">
          {isOwnReference && passes.length === 1
            ? "Esta gravação é a referência."
            : passes.map(({ pass, metrics }, i) => (
                <span key={i} className="mr-3 inline-block tabular-nums">
                  {passes.length > 1 && (
                    <span className="text-muted-foreground">{i + 1}.ª </span>
                  )}
                  <span className="font-semibold">
                    {(metrics.durationMs / 1000).toLocaleString("pt-PT", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{" "}
                    s
                  </span>
                  {metrics.stopped && (
                    <span className="text-muted-foreground"> · parou</span>
                  )}
                  {refDurationMs != null &&
                    !(
                      isOwnReference &&
                      Math.abs(pass.entryMs - snapshot.referenceEntryMs) <=
                        REFERENCE_MATCH_MS
                    ) && (
                      <TimeDelta diffMs={metrics.durationMs - refDurationMs} />
                    )}
                </span>
              ))}
        </p>
      </div>
      <div className="h-[150px] w-full shrink-0 overflow-hidden rounded-[12px] bg-sidebar sm:w-[220px]">
        {mapData && (
          <ImuSnapshotMiniMap
            track={mapData.track}
            section={mapData.section}
            className="h-full w-full"
          />
        )}
      </div>
    </Link>
  );
}

/** The time against the reference, in the Snapshot page's tones: green
 * when faster, red when slower, a tie inside the gates' own scatter. */
function TimeDelta({ diffMs }: { diffMs: number }) {
  if (Math.abs(diffMs) <= SNAPSHOT_TIE_MS)
    return <span className="text-muted-foreground"> · ≈</span>;
  const s = Math.abs(diffMs / 1000).toLocaleString("pt-PT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return (
    <span
      className={cn(
        diffMs < 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-[#FF5A39]",
      )}
    >
      {" · "}
      {diffMs < 0 ? "−" : "+"}
      {s} s
    </span>
  );
}
