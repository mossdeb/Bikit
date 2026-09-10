"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Ellipsis, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import {
  deleteImuSnapshot,
  renameImuSnapshot,
} from "@/lib/actions/imu-snapshots";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import { loadImuSession } from "@/lib/imu/use-imu-session";
import {
  findSnapshotPasses,
  prepareSnapshotSession,
  SNAPSHOT_GATE_OFFSET_M,
  SNAPSHOT_KIND_LABEL,
  snapshotPassMetrics,
  snapshotPassPath,
  type SnapshotDefinition,
  type SnapshotKind,
  type SnapshotPass,
  type SnapshotPassMetrics,
  type SnapshotSession,
} from "@/lib/imu/snapshot";
import { ImuSnapshotMiniMap } from "@/components/imu-snapshot-mini-map";

/**
 * A Snapshot's page: the reference pass pinned at the top, and under it
 * every pass through the same gates — in this session and in every other
 * that comes near them — each with its figures and the difference to the
 * reference. The files are read here, in the browser, one session at a
 * time as they arrive; nothing measured is stored, so a better algorithm
 * or a new session shows up on the next visit.
 *
 * A difference is coloured only where "better" has one direction — less
 * time, more speed kept. A harder landing or a stronger brake is neither.
 * And a difference in time under the gates' own precision (~0.2 s per
 * pass, measured 2026-09-10) is printed as a tie, not as a win.
 */

export interface ImuSnapshotCandidate {
  id: string;
  name: string;
  riderName: string | null;
  bikeId: string | null;
  bikeName: string | null;
  groupLabel: string | null;
  createdAt: string;
  storagePath: string;
  mountOrientation: ImuMountOrientation | null;
}

export interface ImuSnapshotRow {
  id: string;
  name: string;
  definition: SnapshotDefinition;
  referenceSessionId: string | null;
  referenceEntryMs: number;
  referenceExitMs: number;
  createdAt: string;
}

/** One session's passes, once its file has been read. */
type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "done";
      /** Kept for the map: the reference's track and the ground between
       * its gates are drawn from it. */
      prepared: SnapshotSession;
      passes: { pass: SnapshotPass; metrics: SnapshotPassMetrics }[];
    };

export interface SnapshotPassRow {
  session: ImuSnapshotCandidate;
  /** Which pass of the session's, 1-based, and how many it made. */
  index: number;
  count: number;
  pass: SnapshotPass;
  metrics: SnapshotPassMetrics;
  isReference: boolean;
}

/** A pass found again in the reference session within this of the entry
 * time the row recorded is the reference — the same file read the same way
 * lands on the same crossing, and a second is well clear of the next lap. */
export const REFERENCE_MATCH_MS = 1000;

/** Under this, a difference in time between two passes is the gates'
 * own scatter, not the rider's (2026-09-10: ~110 ms median per gate). */
export const SNAPSHOT_TIE_MS = 200;
const TIE_KMH = 1;
const TIE_RETENTION = 0.02;

const nf = (value: number, digits: number) =>
  value.toLocaleString("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const signed = (value: number, digits: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${nf(Math.abs(value), digits)}`;

type Tone = "better" | "worse" | "neutral" | "tie";

export interface Column {
  key: string;
  label: string;
  unit?: string;
  /** Needs a speed, and so is only compared between passes whose speed
   * was read the same way. */
  speed?: boolean;
  value: (m: SnapshotPassMetrics) => number | null;
  digits: number;
  /** Which way is better, when there is one. */
  better?: "lower" | "higher";
  tie: number;
}

const TIME: Column = {
  key: "time",
  label: "Tempo",
  unit: "s",
  value: (m) => m.durationMs / 1000,
  digits: 1,
  better: "lower",
  tie: SNAPSHOT_TIE_MS / 1000,
};
const ENTRY: Column = {
  key: "entry",
  label: "Entrada",
  unit: "km/h",
  speed: true,
  value: (m) => m.entryKmh,
  digits: 0,
  tie: TIE_KMH,
};
const MIN: Column = {
  key: "min",
  label: "Mínima",
  unit: "km/h",
  speed: true,
  value: (m) => m.minKmh,
  digits: 0,
  better: "higher",
  tie: TIE_KMH,
};
const EXIT: Column = {
  key: "exit",
  label: "Saída",
  unit: "km/h",
  speed: true,
  value: (m) => m.exitKmh,
  digits: 0,
  tie: TIE_KMH,
};
const RETENTION: Column = {
  key: "retention",
  label: "Retenção",
  unit: "%",
  speed: true,
  value: (m) => (m.retention == null ? null : 100 * m.retention),
  digits: 0,
  better: "higher",
  tie: 100 * TIE_RETENTION,
};
const RETENTION_CORRECTED: Column = {
  key: "retentionCorrected",
  label: "Ret. corrigida",
  unit: "%",
  speed: true,
  value: (m) =>
    m.retentionCorrected == null ? null : 100 * m.retentionCorrected,
  digits: 0,
  better: "higher",
  tie: 100 * TIE_RETENTION,
};
const DECEL: Column = {
  key: "decel",
  label: "Desacel. máx",
  unit: "m/s²",
  speed: true,
  value: (m) => m.maxDecelMps2,
  digits: 1,
  tie: 0.3,
};
const IMPACTS: Column = {
  key: "impacts",
  label: "Impactos",
  value: (m) => m.impacts,
  digits: 0,
  tie: 0,
};
const PEAK_G: Column = {
  key: "peakG",
  label: "G máx",
  unit: "G",
  value: (m) => m.peakG,
  digits: 1,
  tie: 0.3,
};
const AIRTIME: Column = {
  key: "airtime",
  label: "No ar",
  unit: "s",
  value: (m) => m.airtimeMs / 1000,
  digits: 2,
  tie: 0.05,
};

export const SNAPSHOT_COLUMNS: Record<SnapshotKind, Column[]> = {
  curve: [
    TIME,
    ENTRY,
    MIN,
    EXIT,
    RETENTION,
    RETENTION_CORRECTED,
    DECEL,
    IMPACTS,
  ],
  jump: [TIME, ENTRY, MIN, EXIT, AIRTIME, PEAK_G, IMPACTS],
  rough_section: [TIME, ENTRY, MIN, EXIT, PEAK_G, IMPACTS],
  braking: [TIME, ENTRY, MIN, EXIT, DECEL, IMPACTS],
};

function toneOf(column: Column, diff: number): Tone {
  if (Math.abs(diff) <= column.tie) return "tie";
  if (!column.better) return "neutral";
  const good = column.better === "lower" ? diff < 0 : diff > 0;
  return good ? "better" : "worse";
}

export function ImuSnapshotView({
  snapshot,
  candidates,
  fromSessionId,
}: {
  snapshot: ImuSnapshotRow;
  candidates: ImuSnapshotCandidate[];
  /** The session whose report this page was reached from — where back
   * goes, and where a deleted Snapshot leaves the reader. */
  fromSessionId: string;
}) {
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(
    () => new Map(candidates.map((c) => [c.id, { status: "loading" }])),
  );
  const [bikeFilter, setBikeFilter] = useState("");
  const [riderFilter, setRiderFilter] = useState("");
  const [sort, setSort] = useState<"date" | "time">("date");

  // Every candidate's file, in parallel, each landing as it arrives.
  useEffect(() => {
    let cancelled = false;
    for (const c of candidates) {
      (async () => {
        const result = await loadImuSession(c.storagePath, c.mountOrientation);
        if (cancelled) return;
        let next: Loaded;
        if (result.data === null)
          next = { status: "error", message: result.error };
        else {
          const prepared = prepareSnapshotSession(result.data);
          next = {
            status: "done",
            prepared,
            passes: findSnapshotPasses(prepared, snapshot.definition).map(
              (pass) => ({
                pass,
                metrics: snapshotPassMetrics(prepared, pass),
              }),
            ),
          };
        }
        setLoaded((prev) => new Map(prev).set(c.id, next));
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [candidates, snapshot.definition]);

  const pending = [...loaded.values()].filter(
    (l) => l.status === "loading",
  ).length;
  const failed = candidates.filter((c) => loaded.get(c.id)?.status === "error");

  const rows = useMemo(() => {
    const all: SnapshotPassRow[] = [];
    for (const session of candidates) {
      const state = loaded.get(session.id);
      if (!state || state.status !== "done") continue;
      state.passes.forEach(({ pass, metrics }, i) => {
        // The reference is the pass the Snapshot was made from: the one
        // in its session that crossed the entry gate when the row says.
        const isReference =
          session.id === snapshot.referenceSessionId &&
          Math.abs(pass.entryMs - snapshot.referenceEntryMs) <=
            REFERENCE_MATCH_MS;
        all.push({
          session,
          index: i + 1,
          count: state.passes.length,
          pass,
          metrics,
          isReference,
        });
      });
    }
    return all;
  }, [candidates, loaded, snapshot]);

  // With the reference session gone (deleted), the oldest pass stands in.
  const reference =
    rows.find((r) => r.isReference) ??
    [...rows].sort(
      (a, b) =>
        a.session.createdAt.localeCompare(b.session.createdAt) ||
        a.index - b.index,
    )[0] ??
    null;
  const referenceLost = reference != null && !reference.isReference;

  const bikes = uniqueBy(
    candidates.filter((c) => c.bikeId && c.bikeName),
    (c) => c.bikeId!,
  );
  const riders = [
    ...new Set(candidates.map((c) => c.riderName).filter(Boolean)),
  ] as string[];

  const others = rows
    .filter((r) => r !== reference)
    .filter((r) => !bikeFilter || r.session.bikeId === bikeFilter)
    .filter((r) => !riderFilter || r.session.riderName === riderFilter)
    .sort((a, b) =>
      sort === "time"
        ? a.metrics.durationMs - b.metrics.durationMs
        : b.session.createdAt.localeCompare(a.session.createdAt) ||
          a.index - b.index,
    );

  const columns = SNAPSHOT_COLUMNS[snapshot.definition.kind];
  const referenceSession = candidates.find(
    (c) => c.id === snapshot.referenceSessionId,
  );

  // The picture of where the Snapshot is: the reference pass's ground and
  // its session's whole track, from the file already read for the rows.
  const mapData = useMemo(() => {
    if (!reference) return null;
    const state = loaded.get(reference.session.id);
    if (!state || state.status !== "done" || !state.prepared.track) return null;
    const t = state.prepared.track;
    const track: [number, number][] = t.latDeg.map((lat, k) => [
      lat,
      t.lonDeg[k],
    ]);
    return { track, section: snapshotPassPath(state.prepared, reference.pass) };
  }, [reference, loaded]);

  return (
    <div className="space-y-[18px]">
      <div className={cn("relative rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
          <SnapshotSettings
            id={snapshot.id}
            name={snapshot.name}
            afterDeleteHref={`/labs/imu/${fromSessionId}/relatorio`}
          />
        </div>
        {/* The identity on the left and the map on the right from `sm`,
            the map under the words on a phone. The three dots keep the
            corner: the map stops short of it (`sm:mr-12`). */}
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-stretch sm:justify-between sm:px-6 sm:py-6">
          <div className="min-w-0 pr-10 sm:pr-0">
            <Camera className="size-7 text-foreground" strokeWidth={1.5} />
            <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Snapshot · {SNAPSHOT_KIND_LABEL[snapshot.definition.kind]}
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold">
              {snapshot.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {referenceSession ? (
                <>
                  Referência:{" "}
                  <Link
                    href={`/labs/imu/${referenceSession.id}`}
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    {referenceSession.name}
                  </Link>{" "}
                  aos {formatSessionTime(snapshot.referenceEntryMs)} ·{" "}
                </>
              ) : (
                "A sessão de referência foi apagada · "
              )}
              criado a {formatDate(snapshot.createdAt)} · portas a{" "}
              {SNAPSHOT_GATE_OFFSET_M} m do evento
            </p>
          </div>
          {/* A fixed picture of the stretch (by request, 2026-09-10) — a
              dark tile like the session's map, so the two read as one
              surface. Held at its size while the file loads, so the card
              does not jump when the picture arrives. */}
          <div className="h-[150px] w-full shrink-0 overflow-hidden rounded-[12px] bg-sidebar sm:mr-12 sm:w-[220px]">
            {mapData && (
              <ImuSnapshotMiniMap
                track={mapData.track}
                section={mapData.section}
                className="h-full w-full"
              />
            )}
          </div>
        </div>
      </div>

      {(bikes.length > 1 || riders.length > 1 || rows.length > 2) && (
        <div className="flex flex-wrap gap-2">
          {bikes.length > 1 && (
            <NativeSelect
              wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
              className="h-11 bg-card text-sm"
              aria-label="Bicicleta"
              value={bikeFilter}
              onChange={(e) => setBikeFilter(e.target.value)}
            >
              <option value="">Todas as bicicletas</option>
              {bikes.map((b) => (
                <option key={b.bikeId!} value={b.bikeId!}>
                  {b.bikeName}
                </option>
              ))}
            </NativeSelect>
          )}
          {riders.length > 1 && (
            <NativeSelect
              wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
              className="h-11 bg-card text-sm"
              aria-label="Rider"
              value={riderFilter}
              onChange={(e) => setRiderFilter(e.target.value)}
            >
              <option value="">Todos os riders</option>
              {riders.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          )}
          <NativeSelect
            wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
            className="h-11 bg-card text-sm"
            aria-label="Ordem"
            value={sort}
            onChange={(e) => setSort(e.target.value as "date" | "time")}
          >
            <option value="date">Mais recentes primeiro</option>
            <option value="time">Mais rápidas primeiro</option>
          </NativeSelect>
        </div>
      )}

      {pending > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          A ler {candidates.length - pending + 1} de {candidates.length}{" "}
          {candidates.length === 1 ? "sessão" : "sessões"}…
        </p>
      )}
      {failed.map((c) => (
        <p key={c.id} role="alert" className="text-sm text-destructive">
          {c.name}: {(loaded.get(c.id) as { message: string }).message}
        </p>
      ))}
      {referenceLost && (
        <p className="text-sm text-muted-foreground">
          A passagem de referência já não existe; a mais antiga fica no seu
          lugar.
        </p>
      )}

      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        {reference && (
          <SnapshotPassLine
            row={reference}
            reference={null}
            columns={columns}
            pinned
          />
        )}
        {others.map((row) => (
          <SnapshotPassLine
            key={`${row.session.id}:${row.index}`}
            row={row}
            reference={reference}
            columns={columns}
          />
        ))}
        {pending === 0 && rows.length === 0 && (
          <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">
            Nenhuma sessão passa por estas portas.
          </p>
        )}
        {pending === 0 && rows.length > 0 && others.length === 0 && (
          <p className="border-t border-border px-5 py-5 text-sm text-muted-foreground sm:px-6">
            {rows.length === 1
              ? "Só a passagem de referência, por enquanto. As sessões que importares por aqui entram sozinhas."
              : "Nenhuma outra passagem com estes filtros."}
          </p>
        )}
      </div>
    </div>
  );
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function SnapshotPassLine({
  row,
  reference,
  columns,
  pinned = false,
}: {
  row: SnapshotPassRow;
  /** What the figures are compared with; null on the reference itself. */
  reference: SnapshotPassRow | null;
  columns: Column[];
  pinned?: boolean;
}) {
  const { session, metrics } = row;
  const sameSpeed =
    reference != null && reference.metrics.speedSource === metrics.speedSource;
  return (
    <div
      className={cn(
        "px-5 py-4 sm:px-6 sm:py-5",
        !pinned && "border-t border-border",
        pinned && "bg-muted/40",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          href={`/labs/imu/${session.id}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {session.name}
        </Link>
        {pinned && (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
            Referência
          </span>
        )}
        {metrics.stopped && (
          <span className="rounded-full bg-[#FFEEBE] px-2 py-0.5 text-xs font-medium text-[#5b4a00] dark:bg-[#FFEEBE]/15 dark:text-[#F7E4AA]">
            parou
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {row.count > 1 && `passagem ${row.index} de ${row.count} · `}
          aos {formatSessionTime(row.pass.entryMs)}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {formatDate(session.createdAt)}
        {session.riderName && ` · ${session.riderName}`}
        {session.bikeName && ` · ${session.bikeName}`}
        {session.groupLabel && ` · ${session.groupLabel}`}
      </p>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-4 gap-y-3">
        {columns.map((column) => {
          const value = column.value(metrics);
          const refValue = reference ? column.value(reference.metrics) : null;
          const comparable =
            reference != null &&
            value != null &&
            refValue != null &&
            (!column.speed || sameSpeed);
          const diff = comparable ? value! - refValue! : null;
          const tone = diff != null ? toneOf(column, diff) : null;
          return (
            <div key={column.key} className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                {column.label}
              </p>
              <p className="leading-tight font-semibold tabular-nums">
                {value == null ? "—" : nf(value, column.digits)}
                {value != null && column.unit && (
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    {column.unit}
                  </span>
                )}
              </p>
              {diff != null && tone && (
                <p
                  className={cn(
                    "text-xs tabular-nums",
                    tone === "better" &&
                      "text-emerald-600 dark:text-emerald-400",
                    tone === "worse" && "text-[#FF5A39]",
                    (tone === "neutral" || tone === "tie") &&
                      "text-muted-foreground",
                  )}
                >
                  {tone === "tie" ? "≈" : signed(diff, column.digits)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {reference != null && !sameSpeed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Velocidade lida de outra forma (
          {metrics.speedSource === "gps"
            ? "GPS em linha reta"
            : "fundida com o acelerómetro"}
          ) — as velocidades não se comparam com a referência.
        </p>
      )}
    </div>
  );
}

/** Rename and delete, behind the three dots in the header's corner. */
function SnapshotSettings({
  id,
  name,
  afterDeleteHref,
}: {
  id: string;
  name: string;
  /** Where a deleted Snapshot leaves the reader: the report it came from. */
  afterDeleteHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy || !draft.trim() || draft.trim() === name) return;
    setBusy(true);
    setError(null);
    const result = await renameImuSnapshot({ snapshotId: id, name: draft });
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(name);
          setBusy(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        aria-label="Definições do Snapshot"
        className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Ellipsis className="size-5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Definições do Snapshot</DialogTitle>
          <DialogDescription className="mt-1">
            O nome. As portas e a passagem de referência ficam como foram
            criadas.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="snapshot-rename">Nome</Label>
            <Input
              id="snapshot-rename"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            variant="inverted"
            disabled={busy || !draft.trim() || draft.trim() === name}
          >
            {busy ? "A guardar…" : "Guardar"}
          </Button>
        </form>
        <div className="border-t border-border pt-4">
          <ConfirmActionButton
            action={async () => {
              const result = await deleteImuSnapshot(id);
              if (result.status === "error") {
                setError(result.message);
                return;
              }
              router.push(afterDeleteHref);
            }}
            title="Apagar este Snapshot?"
            description="As portas deixam de existir. As sessões e as suas gravações ficam como estão."
            confirmLabel="Apagar"
            cancelLabel="Cancelar"
            triggerContent={
              <>
                <Trash2 className="size-4" />
                Apagar Snapshot
              </>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
