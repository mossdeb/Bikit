"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Ellipsis, Trash2 } from "lucide-react";
import { ImuSnapshotGlyph } from "@/components/imu-snapshot-glyph";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ImuSetupDetails } from "@/components/imu-setup-compare-view";
import { ConfirmActionButton } from "@/components/delete-confirm-button";
import {
  deleteImuSnapshot,
  renameImuSnapshot,
} from "@/lib/actions/imu-snapshots";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import { loadImuSession } from "@/lib/imu/use-imu-session";
import type { ImuSessionTrim } from "@/lib/imu/trim";
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
import {
  formatSetupChange,
  setupDiff,
  setupKey,
  setupSummary,
  type ImuSetupValues,
} from "@/lib/imu/setup";

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
  /** The bike's setup on this run (src/lib/imu/setup.ts), null when none
   * was recorded — so two passes of one corner can say what changed
   * between them (phase 2 of the setups, 2026-09-11). */
  setup: ImuSetupValues | null;
  setupNote: string | null;
  /** The session's trim (src/lib/imu/trim.ts), null for the whole
   * recording — every loader crops by it, so a pass is found on the same
   * timeline the analysis shows. */
  trim: ImuSessionTrim | null;
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
  const [setupFilter, setSetupFilter] = useState("");
  const [sort, setSort] = useState<"date" | "time" | "setup">("date");

  /** The column the mouse is over, for the hover isolation (by request,
   * 2026-09-14): that column across every pass gets a tinted band and
   * every other figure fades. Mouse only — a finger has no hover. Each
   * pass draws its stretch of the band inside its own figures column (see
   * SnapshotPassLine), the stretches meeting into one across the list; it
   * is only drawn when the column lines up across the passes and sits on
   * one line of cells. When it does not (the cells wrapped), the matching
   * cells are tinted one by one instead. Read by delegation on the list,
   * and cleared only when the mouse leaves it, so crossing from one cell
   * to the next never flickers. */
  const listRef = useRef<HTMLDivElement>(null);
  const focusKeyRef = useRef<string | null>(null);
  const [focus, setFocus] = useState<{
    key: string;
    aligned: boolean;
  } | null>(null);
  const [band, setBand] = useState<{ left: number; width: number } | null>(
    null,
  );
  function readFocus(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-stat-col]",
    );
    const key = cell?.dataset.statCol ?? null;
    if (key === focusKeyRef.current) return;
    focusKeyRef.current = key;
    const list = listRef.current;
    if (!key || !cell || !list) {
      setFocus(null);
      return;
    }
    const at = cell.getBoundingClientRect();
    const near = (a: number, b: number) => Math.abs(a - b) < 2;
    const oneLine = [...(cell.parentElement?.children ?? [])].every((c) =>
      near(c.getBoundingClientRect().top, at.top),
    );
    const lined = [...list.querySelectorAll<HTMLElement>("[data-stat-col]")]
      .filter((c) => c.dataset.statCol === key)
      .every((c) => {
        const r = c.getBoundingClientRect();
        return near(r.left, at.left) && near(r.width, at.width);
      });
    const aligned = oneLine && lined;
    // Against the figures column the band is drawn in, and a pixel wider:
    // the cell's box starts on its own left rule and ends where the next
    // cell's rule begins, so a pixel more puts the band's right edge on
    // that rule instead of beside it.
    const figures = cell.closest<HTMLElement>("[data-pass-figures]");
    if (aligned && figures)
      setBand({
        left: at.left - figures.getBoundingClientRect().left,
        width: at.width + 1,
      });
    setFocus({ key, aligned });
  }
  function clearFocus() {
    focusKeyRef.current = null;
    setFocus(null);
  }

  // Every candidate's file, in parallel, each landing as it arrives.
  useEffect(() => {
    let cancelled = false;
    for (const c of candidates) {
      (async () => {
        const result = await loadImuSession(
          c.storagePath,
          c.mountOrientation,
          c.trim,
        );
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

  // The distinct setups among the passes, lettered A, B, C… — the
  // reference's first, then by the session's date, so a letter does not
  // move when a newer session arrives. Two sessions on the same numbers
  // share a letter whatever row they point at. A pass without a setup has
  // no letter.
  const setupLetters = useMemo(() => {
    const letters = new Map<string, string>();
    const ordered = [...rows].sort(
      (a, b) =>
        Number(b.isReference) - Number(a.isReference) ||
        a.session.createdAt.localeCompare(b.session.createdAt),
    );
    for (const r of ordered) {
      if (!r.session.setup) continue;
      const key = setupKey(r.session.setup);
      if (!letters.has(key))
        letters.set(key, String.fromCharCode(65 + letters.size));
    }
    return letters;
  }, [rows]);
  const letterOf = (r: SnapshotPassRow) =>
    r.session.setup
      ? (setupLetters.get(setupKey(r.session.setup)) ?? null)
      : null;
  const setupGroups = [...setupLetters.entries()].map(([key, letter]) => ({
    key,
    letter,
    summary: setupSummary(
      rows.find((r) => r.session.setup && setupKey(r.session.setup) === key)!
        .session.setup!,
    ),
  }));
  const unsetCount = rows.filter((r) => !r.session.setup).length;

  const others = rows
    .filter((r) => r !== reference)
    .filter((r) => !bikeFilter || r.session.bikeId === bikeFilter)
    .filter((r) => !riderFilter || r.session.riderName === riderFilter)
    .filter(
      (r) =>
        !setupFilter ||
        (setupFilter === "none"
          ? !r.session.setup
          : (letterOf(r) ?? "") === setupFilter),
    )
    .sort((a, b) => {
      if (sort === "time") return a.metrics.durationMs - b.metrics.durationMs;
      const byDate =
        b.session.createdAt.localeCompare(a.session.createdAt) ||
        a.index - b.index;
      if (sort !== "setup") return byDate;
      // Grouped: the reference's setup first, then B, C…, the passes
      // without one at the end; newest first within a group.
      const la = letterOf(a) ?? "~";
      const lb = letterOf(b) ?? "~";
      return la.localeCompare(lb) || byDate;
    });

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
            <ImuSnapshotGlyph className="size-7 text-foreground" sizePx={28} />
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
          {setupGroups.length + (unsetCount > 0 ? 1 : 0) > 1 && (
            <NativeSelect
              wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
              className="h-11 bg-card text-sm"
              aria-label="Afinação"
              value={setupFilter}
              onChange={(e) => setSetupFilter(e.target.value)}
            >
              <option value="">Todas as afinações</option>
              {setupGroups.map((g) => (
                <option key={g.letter} value={g.letter}>
                  Afinação {g.letter}
                  {g.summary && ` · ${g.summary}`}
                </option>
              ))}
              {unsetCount > 0 && <option value="none">Sem afinação</option>}
            </NativeSelect>
          )}
          <NativeSelect
            wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
            className="h-11 bg-card text-sm"
            aria-label="Ordem"
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "date" | "time" | "setup")
            }
          >
            <option value="date">Mais recentes primeiro</option>
            <option value="time">Mais rápidas primeiro</option>
            {setupGroups.length > 0 && (
              <option value="setup">Agrupadas por afinação</option>
            )}
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

      <div
        ref={listRef}
        onPointerMove={readFocus}
        onPointerLeave={clearFocus}
        className={cn(
          "relative isolate overflow-hidden rounded-lg bg-card",
          DARK_CARD_HAIRLINE,
        )}
      >
        {reference && (
          <SnapshotPassLine
            row={reference}
            reference={null}
            columns={columns}
            setupLetter={letterOf(reference)}
            pinned
            focusKey={focus?.key ?? null}
            focusTinted={focus != null && !focus.aligned}
            focusBand={band}
            focusBandOn={focus?.aligned ?? false}
          />
        )}
        {others.map((row) => (
          <SnapshotPassLine
            key={`${row.session.id}:${row.index}`}
            row={row}
            reference={reference}
            columns={columns}
            setupLetter={letterOf(row)}
            focusKey={focus?.key ?? null}
            focusTinted={focus != null && !focus.aligned}
            focusBand={band}
            focusBandOn={focus?.aligned ?? false}
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

/** A Snapshot page has no bike at hand to name the dampers after; the
 * setup's popover says "Garfo" and "Amortecedor" and nothing more. */
const NO_DAMPER_NAMES = { fork: null, shock: null };

/** The speeds that read as one movement — in, the slowest, out — and so
 * share a cell, with arrows between them. The other figures stand alone. */
const SPEED_FLOW = new Set(["entry", "min", "exit"]);

function statCells(columns: Column[]): (Column | Column[])[] {
  const cells: (Column | Column[])[] = [];
  for (const column of columns) {
    const last = cells[cells.length - 1];
    if (SPEED_FLOW.has(column.key) && Array.isArray(last)) last.push(column);
    else cells.push(SPEED_FLOW.has(column.key) ? [column] : column);
  }
  return cells;
}

/**
 * One pass through the gates, as the supplied layout draws it
 * (2026-09-14): a section ruled off from the next on a phone (no rule on
 * a desktop, by request the same day), with no card of its own, in two
 * columns — on the left the name, when in the recording, the
 * pills (the reference's, a stop, the setup's letter with the whole setup
 * on a click, the knobs that moved against the reference) and when and by
 * whom it was ridden; on the right the figures, in a box of cells, each
 * with its difference to the reference in a black pill.
 *
 * Two container queries, each on the room it is about: the section's for
 * the columns (side by side from 1030px, stacked below), and the right
 * column's own for the box (one line of cells from 720px, wrapped below).
 * 720 is what a curve's six cells need at the figures' and pills' size
 * (~712px, measured 2026-09-14 with 12px pills); 1030 is that plus the
 * left column and the gap.
 * So the box never has to guess how wide the left column is.
 */
export function SnapshotPassLine({
  row,
  reference,
  columns,
  setupLetter = null,
  pinned = false,
  focusKey = null,
  focusTinted = false,
  focusBand = null,
  focusBandOn = false,
}: {
  row: SnapshotPassRow;
  /** What the figures are compared with; null on the reference itself. */
  reference: SnapshotPassRow | null;
  columns: Column[];
  /** The letter of this pass's setup among the Snapshot's (A, B, C…);
   * null when it has none, or when the caller does not letter them. */
  setupLetter?: string | null;
  pinned?: boolean;
  /** The column the mouse is over on the page, null for none — see the
   * hover isolation in ImuSnapshotView. */
  focusKey?: string | null;
  /** Tint the hovered column's cells here, because the page could not
   * draw one band across the passes (the columns do not line up). */
  focusTinted?: boolean;
  /** Where the hovered column's band sits in this pass's figures column,
   * px — the last place it stood, so it can fade out there. */
  focusBand?: { left: number; width: number } | null;
  /** Whether the band is showing. */
  focusBandOn?: boolean;
}) {
  const { session, metrics } = row;
  const sameSpeed =
    reference != null && reference.metrics.speedSource === metrics.speedSource;
  // Against a reference that has a setup, the knobs that moved, each in
  // its own chip. Same numbers as the reference is said in words, so a
  // silent row never means "unknown".
  const setupChanges =
    reference?.session.setup && session.setup
      ? setupDiff(reference.session.setup, session.setup)
      : [];
  const setupTitle = setupLetter ? `Afinação ${setupLetter}` : "Afinação";
  // A figure cell's part in the hover isolation: faded when another
  // column has the mouse, tinted when it has it and there is no band.
  const focusClass = (colKey: string) =>
    cn(
      "transition-[opacity,background-color] duration-150",
      focusKey != null && focusKey !== colKey && "opacity-50",
      focusTinted && focusKey === colKey && "bg-background/60",
    );
  return (
    <div
      className={cn(
        "@container flex min-h-[180px] flex-col px-5 py-5 sm:p-[22px]",
        !pinned && "border-t border-border lg:border-t-0",
      )}
    >
      <div className="flex flex-1 flex-col gap-4 @min-[1030px]:flex-row @min-[1030px]:items-stretch @min-[1030px]:gap-6">
        <div className="min-w-0 @min-[1030px]:w-[280px] @min-[1030px]:shrink-0">
          <Link
            href={`/labs/imu/${session.id}`}
            className="text-lg font-semibold underline-offset-2 hover:underline"
          >
            {session.name}
          </Link>
          {/* Where the pass sits in its recording: the two gates' instants
              on the session's clock (trimmed, when it is), so it can be found
              on the analysis plot — by request, 2026-09-14. */}
          <p
            className="text-sm text-muted-foreground tabular-nums"
            title="O dia da gravação e quando atravessou a porta de entrada e a de saída, no relógio da sessão"
          >
            {formatDate(session.createdAt)} ·{" "}
            {row.count > 1 && `passagem ${row.index} de ${row.count} · `}
            entre {formatSessionTime(row.pass.entryMs)} e{" "}
            {formatSessionTime(row.pass.exitMs)}
          </p>
          {/* Who rode it and on what, right under the day and the gates'
              times — the group was dropped (by request, 2026-09-14). */}
          {[session.riderName, session.bikeName].some(Boolean) && (
            <p className="text-sm text-muted-foreground">
              {[session.riderName, session.bikeName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {pinned && (
              <span className="rounded-full border border-foreground bg-foreground px-2 py-0.5 font-medium text-background">
                Referência
              </span>
            )}
            {metrics.stopped && (
              <span className="rounded-full border border-transparent bg-[#FFEEBE] px-2 py-0.5 font-medium text-[#5b4a00] dark:bg-[#FFEEBE]/15 dark:text-[#F7E4AA]">
                parou
              </span>
            )}
            {session.setup ? (
              // The whole setup on a click — the list the compare page's
              // popover shows — so the numbers stay one tap away instead of
              // taking a line of their own. A popover and not a tooltip:
              // this is read on a phone too.
              <Popover>
                <PopoverTrigger
                  aria-label={`${setupTitle} completa`}
                  className="cursor-pointer rounded-full border border-foreground bg-foreground px-2 py-0.5 font-medium text-background outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {setupTitle}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-4">
                  <ImuSetupDetails
                    title={setupTitle}
                    setup={session.setup}
                    note={session.setupNote}
                    labels={NO_DAMPER_NAMES}
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-muted-foreground">
                Sem afinação registada
              </span>
            )}
            {setupChanges.map((change) => (
              <span
                key={change.label}
                className="rounded-full border border-foreground bg-card px-2 py-0.5 font-medium text-foreground tabular-nums"
              >
                {formatSetupChange(change)}
              </span>
            ))}
            {reference?.session.setup &&
              session.setup &&
              setupChanges.length === 0 && (
                <span className="text-muted-foreground">
                  igual à referência
                </span>
              )}
          </div>
        </div>

        <div
          data-pass-figures
          className="@container relative flex min-w-0 flex-1 flex-col"
        >
          {/* This pass's stretch of the hovered column's band: the column's
              width plus its right rule, the pass's full height (out through
              the section's padding, so the stretches of neighbouring passes
              meet). Drawn here and not once over the list, because each pass
              and each figures column is a container, and a container paints
              as one piece — only inside it can the band go over the boxes'
              lines (it is opaque, and covers them) and under the figures
              (lifted above it with z-10). A light rule on each side, the
              boxes' own, so its edges read as drawn. Kept mounted and faded,
              so it leaves where it stood instead of jumping. */}
          <div
            aria-hidden
            className={cn(
              "imu-focus-band pointer-events-none absolute -inset-y-5 border-x border-border transition-[left,width,opacity] duration-150 sm:-inset-y-[22px]",
              focusBandOn ? "opacity-100" : "opacity-0",
            )}
            style={focusBand ?? undefined}
          />
          {/* The figures, in a box of cells ruled apart. With 720px of this
              column's room or more they all stand on one line and share it,
              the speeds' cell half again as wide as the others. Narrower,
              the cells keep a width and wrap onto more rows, growing to fill
              each. The rules are each cell's own top and left edge, the
              first row's and column's tucked under the box's clipped rim, so
              a wrapped row is ruled like the first. Beside the left column
              the box stretches to the pass's full height, pills or none
              (by request, 2026-09-14), the figures centred in it. */}
          <div className="flex w-fit max-w-full flex-1 flex-col overflow-hidden rounded-[14px] border border-border @min-[720px]:w-full">
            <div className="-mt-px -ml-px flex flex-1 flex-wrap @min-[720px]:flex-nowrap">
              {statCells(columns).map((cell) =>
                Array.isArray(cell) ? (
                  <div
                    key={cell.map((c) => c.key).join("-")}
                    data-stat-col={cell.map((c) => c.key).join("-")}
                    className={cn(
                      "flex w-[300px] grow items-center justify-center border-t border-l border-border px-3 py-3.5 @min-[720px]:w-auto @min-[720px]:flex-[1.5] @min-[720px]:px-6",
                      focusClass(cell.map((c) => c.key).join("-")),
                    )}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      {cell.map((column, i) => (
                        <Fragment key={column.key}>
                          {i > 0 && <FlowArrow />}
                          <PassStat
                            column={column}
                            row={row}
                            reference={reference}
                            sameSpeed={sameSpeed}
                          />
                        </Fragment>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    key={cell.key}
                    data-stat-col={cell.key}
                    className={cn(
                      "flex w-[140px] grow items-center justify-center border-t border-l border-border px-4 py-3.5 @min-[720px]:w-auto @min-[720px]:flex-1 @min-[720px]:px-3",
                      focusClass(cell.key),
                    )}
                  >
                    <PassStat
                      column={cell}
                      row={row}
                      reference={reference}
                      sameSpeed={sameSpeed}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
          {reference != null && !sameSpeed && (
            <p className="relative z-10 mt-2 text-xs text-muted-foreground">
              Velocidade lida de outra forma (
              {metrics.speedSource === "gps"
                ? "GPS em linha reta"
                : "fundida com o acelerómetro"}
              ) — as velocidades não se comparam com a referência.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One figure of a pass: its label, the value with its unit, and — against
 * the reference — the difference in a pill whose colours carry the
 * verdict: a black pill with the brand green where better, a black pill
 * with the lab's red where worse, and a clear pill with a black outline
 * where the metric has no better direction or the gap is inside the tie
 * ("≈") — by request, 2026-09-14. The black pills carry the same outline
 * in their own colour, so both kinds are the same size.
 */
function PassStat({
  column,
  row,
  reference,
  sameSpeed,
}: {
  column: Column;
  row: SnapshotPassRow;
  reference: SnapshotPassRow | null;
  sameSpeed: boolean;
}) {
  const value = column.value(row.metrics);
  const refValue = reference ? column.value(reference.metrics) : null;
  const comparable =
    reference != null &&
    value != null &&
    refValue != null &&
    (!column.speed || sameSpeed);
  const diff = comparable ? value! - refValue! : null;
  const tone = diff != null ? toneOf(column, diff) : null;
  return (
    <div className="relative z-10 flex min-w-0 flex-col items-center text-center">
      <p className="text-xs leading-tight whitespace-nowrap text-foreground">
        {column.label}
      </p>
      <p className="text-base leading-tight font-semibold whitespace-nowrap tabular-nums">
        {value == null ? "—" : nf(value, column.digits)}
        {value != null && column.unit && (
          <span className="ml-1 text-base font-normal text-muted-foreground">
            {column.unit}
          </span>
        )}
      </p>
      {diff != null && tone && (
        <span
          title={
            tone === "tie"
              ? "Dentro da precisão das portas — conta como empate"
              : undefined
          }
          className={cn(
            "mt-1.5 rounded-full border border-foreground px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums",
            tone === "better" && "bg-foreground text-primary",
            tone === "worse" && "bg-foreground text-[#FF5A39]",
            (tone === "neutral" || tone === "tie") &&
              "bg-transparent text-foreground",
          )}
        >
          {tone === "tie" ? "≈" : signed(diff, column.digits)}
        </span>
      )}
    </div>
  );
}

/** The arrow between two speeds of the flow: the label row left blank,
 * the arrow on the figures' own line. */
function FlowArrow() {
  return (
    <span aria-hidden className="relative z-10 flex flex-col items-center">
      <span className="invisible text-xs leading-tight">·</span>
      <span className="flex h-[1.25em] items-center text-base">
        <ArrowRight className="size-3.5 text-foreground" strokeWidth={2.5} />
      </span>
    </span>
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
