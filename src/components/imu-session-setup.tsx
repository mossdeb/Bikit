"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import {
  BIKE_ICON_FALLBACK,
  BIKE_TYPE_ICON,
} from "@/components/bike-type-icon";
import type { BikeType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proNumber, proPercent } from "@/lib/i18n/pro";
import { useLoadedSession } from "@/components/imu-session-data";
import {
  rearMinusFrontDropMm,
  RIDER_ATTITUDE_TIE_DEG,
  riderAttitude,
  riderSagDropsMm,
  sameRiderSag,
  storedRiderSag,
  type RiderSagHistoryEntry,
} from "@/lib/imu/rider-sag";
import { formatDate } from "@/lib/format";
import {
  createImuBikeSetup,
  deleteImuBikeSetup,
  saveImuSessionSetup,
  updateImuBikeSetup,
} from "@/lib/actions/imu-setups";
import {
  circuitMode,
  DAMPER_FIELDS,
  damperSpring,
  setupSummary,
  setupKey,
  setupValuesEqual,
  type ImuCircuit,
  type ImuDamperSetup,
  type ImuSetupValues,
  type ImuTireSetup,
  sagPercent,
} from "@/lib/imu/setup";

/** What the bike calls its dampers, for the blocks' headings; null falls
 * back to "Garfo" and "Amortecedor" ("Fork" and "Shock" in English). Null
 * for both on a hardtail is still
 * two blocks — the form does not know what the bike lacks, only what it
 * has, and an unfilled block costs nothing. */
export interface ImuSetupLabels {
  fork: string | null;
  shock: string | null;
  tireFront: string | null;
  tireRear: string | null;
}

type Draft = Record<string, string>;

/** One of the bike's setups, offered in the session's dialog to fill the
 * form from (2026-10-27). */
export interface ImuSetupPreset {
  /** Its setupKey. */
  key: string;
  /** "Setup A · Base - Fonte". */
  label: string;
  values: ImuSetupValues;
}

const damperKey = (block: "fork" | "shock", field: keyof ImuDamperSetup) =>
  `${block}.${field}`;
const tireKey = (field: keyof ImuTireSetup) => `tires.${field}`;
const RIDER_WEIGHT_KEY = "rider.weightKg";
/** The rider-sag history card, hidden for now (by request, 2026-10-27).
 * The readings are still stored (rider_sag) and the history still read;
 * back with true. */
const SHOW_SAG_HISTORY = false;

const WHEELBASE_KEY = "frame.wheelbaseMm";
const HEAD_ANGLE_KEY = "frame.headAngleDeg";

/** The draft holds the numbers as strings and, under the same keys as the
 * values, the choices: "air"/"coil" and "simple"/"dual". */
function toDraft(values: ImuSetupValues): Draft {
  const draft: Draft = {};
  for (const block of ["fork", "shock"] as const) {
    const damper = values[block];
    for (const field of DAMPER_FIELDS) {
      const v = damper?.[field];
      draft[damperKey(block, field)] = v != null ? String(v) : "";
    }
    draft[damperKey(block, "spring")] = damperSpring(damper);
    draft[damperKey(block, "compressionMode")] = circuitMode(
      damper,
      "compression",
    );
    draft[damperKey(block, "reboundMode")] = circuitMode(damper, "rebound");
  }
  draft[tireKey("frontPsi")] =
    values.tires?.frontPsi != null ? String(values.tires.frontPsi) : "";
  draft[tireKey("rearPsi")] =
    values.tires?.rearPsi != null ? String(values.tires.rearPsi) : "";
  draft[RIDER_WEIGHT_KEY] =
    values.rider?.weightKg != null ? String(values.rider.weightKg) : "";
  draft[WHEELBASE_KEY] =
    values.frame?.wheelbaseMm != null ? String(values.frame.wheelbaseMm) : "";
  draft[HEAD_ANGLE_KEY] =
    values.frame?.headAngleDeg != null ? String(values.frame.headAngleDeg) : "";
  return draft;
}

/** The sag as a share of the travel, from the two strings as typed — the
 * same arithmetic the summary prints (sagPercent). Null until both
 * numbers are in. */
function draftSagPercent(draft: Draft, block: "fork" | "shock") {
  const num = (key: string) => {
    const n = Number(draft[key]?.trim().replace(",", "."));
    return draft[key]?.trim() && Number.isFinite(n) ? n : undefined;
  };
  return sagPercent({
    travelMm: num(damperKey(block, "travelMm")),
    sagMm: num(damperKey(block, "sagMm")),
  });
}

/** The bar's scale, %: 0 to 50 marked, and a hatched stretch past it. */
const SAG_BAR_MAX = 55;
const SAG_BAR_TICKS = [0, 10, 20, 30, 40, 50];
/** Where a sag reads as the trade sets it, %: the fork's 15–30 and the
 * shock's 25–35. Inside, the bar is green; outside, amber; from
 * SAG_BAR_DANGER up, red (by request, 2026-10-27) — half the travel gone
 * before the first bump. A guide, not a rule — the manufacturer's chart
 * is. */
const SAG_BAR_DANGER = 50;
const SAG_RANGE: Record<"fork" | "shock", [number, number]> = {
  fork: [15, 30],
  shock: [25, 35],
};

/**
 * The sag's share of the travel as a bar (the supplied layout, 2026-10-27):
 * the figure large over it, a scale from 0 to 50 % under it, green inside
 * the usual range and amber outside it. An empty track until both numbers
 * are in.
 */
function SagBar({ draft, block }: { draft: Draft; block: "fork" | "shock" }) {
  const t = useProDict().report.setup.form;
  const locale = useProLocale();
  const pct = draftSagPercent(draft, block);
  const [lo, hi] = SAG_RANGE[block];
  const inRange = pct != null && pct >= lo && pct <= hi;
  const danger = pct != null && pct >= SAG_BAR_DANGER;
  const at = (v: number) =>
    `${(Math.min(v, SAG_BAR_MAX) / SAG_BAR_MAX) * 100}%`;
  return (
    <div className="mt-3 rounded-[10px] bg-muted/60 px-4 pt-3 pb-2">
      <p className="text-center tabular-nums">
        <span className="text-2xl font-semibold">
          {pct != null ? proPercent(pct, locale) : "–"}
        </span>{" "}
        <span className="text-xs text-muted-foreground">{t.sagOfTravel}</span>
      </p>
      <div className="relative mt-2 h-1.5 rounded-full bg-foreground/10">
        <div
          aria-hidden
          className="imu-event-band absolute inset-y-0 right-0 rounded-r-full"
          style={{ left: at(50) }}
        />
        {pct != null && (
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              danger
                ? "bg-[#FF5A39]"
                : inRange
                  ? "bg-[#3DDC97]"
                  : "bg-[#F5B82E]",
            )}
            style={{ width: at(pct) }}
          />
        )}
        <div
          aria-hidden
          className="absolute -top-1 h-3.5 w-px bg-foreground/60"
          style={{ left: at(50) }}
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-muted-foreground tabular-nums">
        {SAG_BAR_TICKS.map((v) => (
          <span
            key={v}
            className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0"
            style={{ left: at(v) }}
          >
            {proPercent(v, locale)}
          </span>
        ))}
        <span className="absolute right-0">…</span>
      </div>
    </div>
  );
}

/** Back from the strings the inputs hold — a comma is a decimal point
 * here, and a blank is "not filled in", never zero. */
function fromDraft(draft: Draft): ImuSetupValues {
  const num = (key: string): number | undefined => {
    const raw = draft[key]?.trim().replace(",", ".");
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const damper = (block: "fork" | "shock"): ImuDamperSetup => {
    const d: ImuDamperSetup = {
      spring: draft[damperKey(block, "spring")] === "coil" ? "coil" : "air",
      compressionMode:
        draft[damperKey(block, "compressionMode")] === "simple"
          ? "simple"
          : "dual",
      reboundMode:
        draft[damperKey(block, "reboundMode")] === "simple" ? "simple" : "dual",
    };
    for (const field of DAMPER_FIELDS) {
      const v = num(damperKey(block, field));
      if (v != null) d[field] = v;
    }
    return d;
  };
  return {
    fork: damper("fork"),
    shock: damper("shock"),
    tires: {
      frontPsi: num(tireKey("frontPsi")),
      rearPsi: num(tireKey("rearPsi")),
    },
    rider: { weightKg: num(RIDER_WEIGHT_KEY) },
    frame: {
      wheelbaseMm: num(WHEELBASE_KEY),
      headAngleDeg: num(HEAD_ANGLE_KEY),
    },
  };
}

/**
 * "Afinação" on the session's header: the fork, the shock and the tyres
 * as they were set for this run (the supplied layout, 2026-09-11). Opens
 * prefilled with the session's setup — inherited from the bike's last one
 * at import — and saving with nothing changed changes nothing: the action
 * keeps the row. A change makes a new setup for the bike, which the next
 * import inherits.
 *
 * Errors are written into the dialog — the garage rule.
 */
export function ImuSessionSetup({
  sessionId,
  values,
  note,
  labels,
  bikeType,
  triggerLabel,
  triggerClassName,
  triggerIcon,
  triggerContent,
  readOnly = false,
  title,
  sagHistory = [],
  bikeId,
  bikeSetup,
  name = null,
  presets = [],
}: {
  /** The bike's setups, for the dropdown that fills the form from one
   * (session page only). */
  presets?: ImuSetupPreset[];
  /** The setup's own name (migration 00053), editable on a bike's setups
   * and a new one; blank keeps the letter. */
  name?: string | null;
  /** One of a bike's setups, editable from its Pro page (2026-10-27):
   * Guardar corrects it for every session that rode on it, Apagar removes
   * it. `rowIds` are its rows (BikeSetup.rowIds); `sessionCount` is
   * worded, for the warning. */
  bikeSetup?: { bikeId: string; rowIds: string[]; sessionCount: string };
  /** Saving to the bike instead of a session (2026-10-27, "Novo setup" on
   * the bike's Pro page): a new setup row for it, which the next import
   * inherits. `sessionId` is unused then. */
  bikeId?: string;
  /** The bike's rider-sag readings (riderSagHistory), newest first — the
   * setup's history, under the tyres. Only the session page has them. */
  sagHistory?: RiderSagHistoryEntry<ImuSetupValues>[];
  /** The session the setup is saved to. Unused when `readOnly`. */
  sessionId: string;
  /** The session's current setup, or empty. */
  values: ImuSetupValues;
  note: string | null;
  labels: ImuSetupLabels;
  /** The bike's type, for the mark between the two dampers (the supplied
   * layout); null draws a generic bike. */
  bikeType: BikeType | null;
  /** The trigger's word, icon and dress, when not the analysis page's
   * "Afinação" pill. */
  triggerLabel?: string;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  /** The trigger's whole content, when it is not a pill with a word — a
   * bike's setup card (2026-09-24), say. Replaces the icon and the label. */
  triggerContent?: ReactNode;
  /** Looking, not editing (2026-09-24, a bike's setups): the same form
   * with every field held, no note to write and no Guardar. */
  readOnly?: boolean;
  /** The dialog's title; the dictionary's "Afinação nesta volta" when
   * not given. */
  title?: string;
}) {
  const dict = useProDict();
  const t = dict.report.setup.form;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(values));
  const [draftNote, setDraftNote] = useState(note ?? "");
  // A setup's own name, on a bike's setups and a new one (2026-10-27).
  const named = bikeSetup != null || bikeId != null;
  const [draftName, setDraftName] = useState(name ?? "");
  // Offered on a session's own setup only: a bike's setup is itself one.
  const showPresets = presets.length > 0 && !readOnly && !named;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * What the last save wrote, until the page brings it back (2026-10-27):
   * the refresh after a save takes seconds on this page, and the dialog
   * reopened before it arrived filled itself with the setup from before —
   * a saved 10 read back as the old 30. Kept against the props it was
   * saved over, so the props win as soon as they change.
   */
  const [saved, setSaved] = useState<{
    values: ImuSetupValues;
    note: string;
    name: string;
    over: ImuSetupValues;
  } | null>(null);
  const current =
    saved && saved.over === values
      ? { values: saved.values, note: saved.note, name: saved.name }
      : { values, note: note ?? "", name: name ?? "" };

  const dirty =
    !setupValuesEqual(fromDraft(draft), current.values) ||
    draftNote.trim() !== current.note ||
    (named && draftName.trim() !== current.name);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = bikeSetup
      ? await updateImuBikeSetup({
          bikeId: bikeSetup.bikeId,
          rowIds: bikeSetup.rowIds,
          values: fromDraft(draft),
          note: draftNote,
          name: draftName,
        })
      : bikeId
        ? await createImuBikeSetup({
            bikeId,
            values: fromDraft(draft),
            note: draftNote,
            name: draftName,
          })
        : await saveImuSessionSetup({
            sessionId,
            values: fromDraft(draft),
            note: draftNote,
          });
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setSaved({
      values: fromDraft(draft),
      note: draftNote.trim(),
      name: draftName.trim(),
      over: values,
    });
    setOpen(false);
    router.refresh();
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  async function remove() {
    if (busy || !bikeSetup) return;
    setBusy(true);
    setError(null);
    const result = await deleteImuBikeSetup({
      bikeId: bikeSetup.bikeId,
      rowIds: bikeSetup.rowIds,
    });
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  const choose = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const BikeMark = (bikeType && BIKE_TYPE_ICON[bikeType]) || BIKE_ICON_FALLBACK;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(toDraft(current.values));
          setDraftNote(current.note);
          setDraftName(current.name);
          setBusy(false);
          setError(null);
          setConfirmingDelete(false);
        }
      }}
    >
      <DialogTrigger
        title={t.triggerTitle}
        // The report door's pill, beside it: outlined, the mark and the
        // word — a control, not a figure. A caller can dress it otherwise
        // (the report's Bike card, 2026-09-14).
        // The cards' hover first, so a caller's own hover wins the merge: a
        // dark button ("Novo setup", 2026-10-27) took the cards' light
        // ground on hover and its white label vanished.
        className={cn(
          CLICKABLE_CARD_HOVER,
          triggerClassName ??
            "inline-flex shrink-0 items-center gap-2.5 self-start rounded-[14px] border border-border bg-card px-5 py-3 font-semibold text-foreground",
        )}
      >
        {triggerContent ?? (
          <>
            {triggerIcon ?? (
              <SlidersHorizontal
                className="size-[18px]"
                strokeWidth={2.1}
                aria-hidden
              />
            )}
            {triggerLabel ?? "Bike setup"}
          </>
        )}
      </DialogTrigger>
      <DialogContent
        // The backdrop leaves with the popup, at its 250 ms.
        overlayClassName="data-closed:duration-250"
        // The large popups' entrance and margins (by request, 2026-09-27,
        // the documentation's): it rises 48 px into place over 400 ms, no
        // zoom, and sinks back in 250 ms; it keeps 16 px from the window's
        // edges from `sm` and 32 from `lg`, under its own 896 px cap.
        className="duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] data-open:slide-in-from-bottom-[48px] data-open:zoom-in-100! data-closed:duration-250 data-closed:slide-out-to-bottom-[48px] data-closed:zoom-out-100! sm:w-[calc(100%-2rem)] sm:max-w-7xl lg:max-h-[calc(100dvh-4rem)] lg:w-[calc(100%-4rem)]"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">{title ?? t.title}</DialogTitle>
          {/* No description under the title (by request, 2026-10-27): the
              units are on the fields, and the form says the rest. */}
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) void save();
          }}
        >
          {/* Pick one of the bike's setups and the form takes its values
              (by request, 2026-10-27); what is shown is whichever setup
              the form's values are, so a value changed by hand shows the
              blank choice. */}
          {showPresets && (
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="setup-preset">{t.preset}</Label>
              <NativeSelect
                id="setup-preset"
                value={
                  presets.find((p) => p.key === setupKey(fromDraft(draft)))
                    ?.key ?? ""
                }
                onChange={(e) => {
                  const preset = presets.find((p) => p.key === e.target.value);
                  if (preset) setDraft(toDraft(preset.values));
                }}
              >
                <option value="">{t.presetNone}</option>
                {presets.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {named && (
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="setup-name">{t.setupName}</Label>
              <Input
                id="setup-name"
                value={draftName}
                maxLength={60}
                placeholder={title ?? t.setupNamePlaceholder}
                onChange={(e) => setDraftName(e.target.value)}
                readOnly={readOnly}
              />
            </div>
          )}
          {/* The supplied layout (2026-09-11, second pass): the suspension
              on one hatched plate — the fork's card, the bike's mark on the
              hatching, the shock's card — and the tyres on a plate of their
              own under it, so the two systems read as two things. The mark
              is a desktop affair; stacked on a phone the two cards follow
              each other and it would be a picture between forms. */}
          <div className="imu-event-band rounded-[18px] border border-border p-3 sm:p-4">
            {/* Three equal columns (the supplied layout, 2026-10-27): the
                fork, the bike's geometry with its rider-sag reading, the
                shock. Between `sm` and `lg` the two dampers share a row and
                the geometry takes the one under them. */}
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              <DamperBlock
                block="fork"
                heading={labels.fork || dict.report.setup.fork}
                draft={draft}
                set={set}
                choose={choose}
                readOnly={readOnly}
              />
              {/* The bike's own card: the frame's wheelbase and head angle,
                  its mark, and the rider-sag reading they turn into mm (by
                  request, 2026-10-27). */}
              <div className="order-last flex flex-col gap-4 rounded-[14px] border border-border bg-card p-4 sm:col-span-2 sm:p-5 lg:order-none lg:col-span-1">
                <p className="text-lg font-semibold">{t.geometry}</p>
                <div className="grid grid-cols-2 gap-3 rounded-[12px] border border-border p-3">
                  <NumberField
                    id="setup-frame-wheelbase"
                    label={t.wheelbase}
                    unit="mm"
                    value={draft[WHEELBASE_KEY]}
                    onChange={set(WHEELBASE_KEY)}
                    small
                    readOnly={readOnly}
                  />
                  <NumberField
                    id="setup-frame-head-angle"
                    label={t.headAngle}
                    unit="°"
                    value={draft[HEAD_ANGLE_KEY]}
                    onChange={set(HEAD_ANGLE_KEY)}
                    small
                    readOnly={readOnly}
                  />
                </div>
                {/* Mirrored: the art faces right, and here the fork's card is
                    on the left — the bike should face its own fork (by
                    request, 2026-09-11). */}
                {/* A 3 px line on screen whatever the size it is drawn at
                    (by request, 2026-09-11: 2 px read too thin beside the
                    cards): the art's own stroke is 4 in a 101-wide box,
                    which painted ~5 px at 128 px. Fixed in screen pixels,
                    the event cards' way. */}
                <div className="flex flex-1 items-center justify-center py-4">
                  <BikeMark
                    aria-hidden
                    className="h-auto w-32 -scale-x-100 text-foreground lg:w-40 [&_*]:[stroke-width:3px] [&_*]:[vector-effect:non-scaling-stroke]"
                  />
                </div>
                <RiderSagReading draft={draft} />
              </div>
              <DamperBlock
                block="shock"
                heading={labels.shock || dict.report.setup.shock}
                draft={draft}
                set={set}
                choose={choose}
                readOnly={readOnly}
              />
            </div>
          </div>

          {/* The tyres and the rider side by side on the second plate (the
              supplied layout, 2026-09-11): two thirds and one third, stacked
              on a phone. */}
          <div className="imu-event-band rounded-[18px] border border-border p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr] sm:gap-4">
              <div className="rounded-[14px] border border-border bg-card p-4 sm:p-5">
                <p className="text-lg font-semibold">{t.tyres}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4">
                  <NumberField
                    id="setup-tires-front"
                    label={
                      labels.tireFront
                        ? t.front(labels.tireFront)
                        : t.frontPressure
                    }
                    unit="psi"
                    value={draft[tireKey("frontPsi")]}
                    onChange={set(tireKey("frontPsi"))}
                    readOnly={readOnly}
                  />
                  <NumberField
                    id="setup-tires-rear"
                    label={
                      labels.tireRear ? t.rear(labels.tireRear) : t.rearPressure
                    }
                    unit="psi"
                    value={draft[tireKey("rearPsi")]}
                    onChange={set(tireKey("rearPsi"))}
                    readOnly={readOnly}
                  />
                </div>
              </div>
              <div className="rounded-[14px] border border-border bg-card p-4 sm:p-5">
                <p className="text-lg font-semibold">Rider</p>
                <div className="mt-3">
                  <NumberField
                    id="setup-rider-weight"
                    label={t.riderWeight}
                    unit="kg"
                    value={draft[RIDER_WEIGHT_KEY]}
                    onChange={set(RIDER_WEIGHT_KEY)}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            </div>
          </div>

          {SHOW_SAG_HISTORY && (
            <RiderSagHistory
              history={sagHistory}
              draft={draft}
              labels={labels}
            />
          )}

          {/* Read-only, the note shows only when there is one to read. */}
          {(!readOnly || draftNote.trim()) && (
            <div className="space-y-1.5">
              <Label htmlFor="setup-note">{t.notes}</Label>
              <Textarea
                id="setup-note"
                value={draftNote}
                placeholder={t.notesPlaceholder}
                className="min-h-24"
                onChange={(e) => setDraftNote(e.target.value)}
                readOnly={readOnly}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* A new setup starts from the bike's current one, so Guardar
              stays off until a value moves — said, rather than left as a
              dead button (2026-10-27). */}
          {bikeId && !bikeSetup && !dirty && (
            <p className="text-center text-sm text-muted-foreground">
              {t.newSetupHint}
            </p>
          )}

          {/* A bike's setup is deleted in two clicks: the first arms the
              button and says what stays (2026-10-27). */}
          {bikeSetup && confirmingDelete && (
            <p className="text-center text-sm text-destructive">
              {t.deleteWarning(bikeSetup.sessionCount)}
            </p>
          )}

          {/* A pill in the middle, not a bar across — the supplied layout.
              On a bike's setup, Apagar beside it. */}
          {!readOnly && (
            <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
              {bikeSetup && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full rounded-full sm:w-auto sm:min-w-[160px] sm:px-8"
                  disabled={busy}
                  onClick={() => {
                    if (confirmingDelete) void remove();
                    else setConfirmingDelete(true);
                  }}
                >
                  {busy && confirmingDelete
                    ? t.deleting
                    : confirmingDelete
                      ? t.deleteConfirm
                      : t.delete}
                </Button>
              )}
              <Button
                type="submit"
                className="w-full rounded-full sm:w-auto sm:min-w-[320px] sm:px-12"
                variant="inverted"
                disabled={busy || !dirty}
              >
                {busy && !confirmingDelete
                  ? dict.common.saving
                  : dict.common.save}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the rider-sag calibration step says (firmware V18, SAG1): how far
 * the frame pitched when the rider got on and, with the wheelbase as typed,
 * how many mm more one end sank than the other; with the fork's sag and the
 * head angle too, how far each end sank (by request, 2026-10-27). Only
 * where a recording is loaded — the session page; the report and a bike's
 * setups have none — and read from it, so it follows the file and not the
 * setup. The numbers are the draft's, as typed.
 */
function RiderSagReading({ draft }: { draft: Draft }) {
  const t = useProDict().report.setup.form.riderSag;
  const locale = useProLocale();
  const session = useLoadedSession();
  if (!session) return null;
  const attitude = riderAttitude(session.riderSag, session.orientation);
  if (!attitude)
    return <p className="text-xs text-muted-foreground">{t.none}</p>;

  const positive = (key: string) => {
    const n = Number(draft[key]?.trim().replace(",", "."));
    return draft[key]?.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };
  const wheelbaseMm = positive(WHEELBASE_KEY);
  const headAngleDeg = positive(HEAD_ANGLE_KEY);
  const forkSagMm = positive(damperKey("fork", "sagMm"));
  const mm = (n: number) => `${proNumber(Math.abs(n), locale, 0)} mm`;

  const pitch = attitude.pitchDeg;
  const level = Math.abs(pitch) < RIDER_ATTITUDE_TIE_DEG;
  // Signed, as the pitch is: nose up positive.
  const signedDeg = `${pitch > 0 ? "+" : pitch < 0 ? "−" : ""}${proNumber(Math.abs(pitch), locale, 1)}°`;
  const diff =
    wheelbaseMm != null && !level
      ? rearMinusFrontDropMm(pitch, wheelbaseMm)
      : null;
  const drops =
    wheelbaseMm != null && headAngleDeg != null && forkSagMm != null
      ? riderSagDropsMm({
          pitchDeg: pitch,
          wheelbaseMm,
          headAngleDeg,
          forkSagMm,
        })
      : null;
  // The supplied layout (2026-10-27): the angle large on the left and what
  // it means in mm on the right, on a quiet panel; under it each end's drop
  // in a tile of its own.
  return (
    <div
      className="space-y-3 rounded-[12px] border border-border p-3 sm:p-4"
      title={t.explain}
    >
      <p className="text-lg font-semibold">{t.title}</p>
      {/* The supplied layout (2026-10-27, second pass): the angle large on
          a tall quiet panel with its meaning in mm beside it, then the
          estimated vertical displacement of each end under its heading. */}
      <div className="flex min-h-32 items-center justify-between gap-4 rounded-[10px] bg-muted/60 px-5 py-8">
        <p className="text-3xl font-semibold tabular-nums">{signedDeg}</p>
        <p className="text-base leading-tight tabular-nums">
          {wheelbaseMm == null ? (
            <span className="text-sm text-muted-foreground">
              {t.needsWheelbase}
            </span>
          ) : diff == null ? (
            t.same
          ) : (
            <>
              {mm(diff)}
              <br />
              {diff > 0 ? t.deeperRear : t.deeperFront}
            </>
          )}
        </p>
      </div>
      <p className="pt-1 font-semibold">{t.displacement}</p>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            [t.front, drops?.frontMm, t.frontCaption],
            [t.rear, drops?.rearMm, t.rearCaption],
          ] as const
        ).map(([name, value, caption]) => (
          <div key={name} className="rounded-[10px] bg-muted/60 px-5 py-4">
            <p className="text-sm">{name}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {value != null ? mm(value) : "–"}
            </p>
            <p className="text-sm">{caption}</p>
          </div>
        ))}
      </div>
      {!drops && (
        <p className="text-xs text-muted-foreground">{t.needsForkSag}</p>
      )}
    </div>
  );
}

/**
 * The bike's rider-sag readings, one per logger calibration (by request,
 * 2026-10-27: keep the SAG1's history to compare the bike's setups), newest
 * first, each with the setup of the first run that carried it. The loaded
 * recording's own reading is marked — and added, when its row has not kept
 * it yet. Nothing here is measured again: the rows hold the readings.
 */
function RiderSagHistory({
  history,
  draft,
  labels,
}: {
  history: RiderSagHistoryEntry<ImuSetupValues>[];
  draft: Draft;
  labels: ImuSetupLabels;
}) {
  const dict = useProDict();
  const t = dict.report.setup.form.riderSag;
  const locale = useProLocale();
  const session = useLoadedSession();
  const current = session
    ? storedRiderSag(session.riderSag, session.orientation)
    : null;
  const entries = [...history];
  if (current && !entries.some((e) => sameRiderSag(e.reading, current)))
    entries.unshift({
      reading: current,
      firstAt: new Date().toISOString(),
      sessionIds: [],
      sessionNames: [],
      setup: null,
    });
  if (entries.length === 0) return null;

  const wheelbase = Number(draft[WHEELBASE_KEY]?.trim().replace(",", "."));
  const hasWheelbase =
    !!draft[WHEELBASE_KEY]?.trim() &&
    Number.isFinite(wheelbase) &&
    wheelbase > 0;
  const deg = (n: number) => `${proNumber(Math.abs(n), locale, 1)}°`;
  return (
    <div className="imu-event-band rounded-[18px] border border-border p-3 sm:p-4">
      <div className="rounded-[14px] border border-border bg-card p-4 sm:p-5">
        <p className="text-lg font-semibold">{t.historyTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t.historyHint}</p>
        <ul className="mt-3 divide-y divide-border">
          {entries.map((entry) => {
            const r = entry.reading;
            const isCurrent = current != null && sameRiderSag(r, current);
            const level = Math.abs(r.pitchDeg) < RIDER_ATTITUDE_TIE_DEG;
            const diff = hasWheelbase
              ? rearMinusFrontDropMm(r.pitchDeg, wheelbase)
              : null;
            const setup = entry.setup
              ? setupSummary(entry.setup, labels, locale)
              : null;
            return (
              <li
                key={`${r.calibrationCount}:${r.gravityG.join(",")}`}
                className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t.calibration(r.calibrationCount)}
                    {entry.sessionIds.length > 0 && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {formatDate(entry.firstAt, locale)}
                        {" · "}
                        {t.sessions(entry.sessionIds.length)}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="ml-2 inline-block rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-background">
                        {t.thisRecording}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {setup ?? t.noSetup}
                  </p>
                </div>
                <div className="text-sm tabular-nums sm:text-right">
                  <span className="font-semibold">
                    {level
                      ? t.level
                      : r.pitchDeg > 0
                        ? t.noseUp(deg(r.pitchDeg))
                        : t.noseDown(deg(r.pitchDeg))}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {t.roll(`${r.rollDeg < 0 ? "−" : ""}${deg(r.rollDeg)}`)}
                    {diff != null && !level && (
                      <>
                        {" · "}
                        {`${diff > 0 ? "+" : "−"}${proNumber(Math.abs(diff), locale, 0)} mm`}
                      </>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

type Setter = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
type Chooser = (key: string, value: string) => void;

/**
 * One damper: its heading with the air/coil switch (the supplied layout,
 * 2026-09-11), the pressure or the spring rate under it, then the two
 * circuits. Switching keeps the number of the other choice in the draft,
 * so a wrong flick costs nothing; only the choice taken is saved.
 */
function DamperBlock({
  block,
  heading,
  draft,
  set,
  choose,
  readOnly = false,
}: {
  block: "fork" | "shock";
  heading: string;
  draft: Draft;
  set: Setter;
  choose: Chooser;
  readOnly?: boolean;
}) {
  const t = useProDict().report.setup.form;
  const springKey = damperKey(block, "spring");
  const air = draft[springKey] !== "coil";
  return (
    <div className="space-y-3 rounded-[14px] border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold">{heading}</p>
        <ModeSwitch
          label={air ? t.air : t.coil}
          checked={air}
          onToggle={() => choose(springKey, air ? "coil" : "air")}
          disabled={readOnly}
        />
      </div>
      {/* The spring's box, level with the circuits' (the supplied layout,
          2026-09-24): the travel and the sag on one line, halves, and the
          spring under them, full width. The sag is what the spring was set
          FOR, measured on the bike with the rider on it in mm off the
          O-ring, and the travel is what it is read against — the share
          prints under the sag as soon as both are in. For the shock the
          travel is its own stroke, the shaft the ring rides. The fields
          are `small`, the circuits' size, so the three boxes read as one
          family. */}
      <div className="rounded-[12px] border border-border p-3">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id={`setup-${block}-travel`}
            label={block === "fork" ? t.travel : "Stroke"}
            unit="mm"
            value={draft[damperKey(block, "travelMm")]}
            onChange={set(damperKey(block, "travelMm"))}
            small
            readOnly={readOnly}
          />
          <NumberField
            id={`setup-${block}-sag`}
            label="SAG"
            unit="mm"
            value={draft[damperKey(block, "sagMm")]}
            onChange={set(damperKey(block, "sagMm"))}
            small
            readOnly={readOnly}
          />
        </div>
        <SagBar draft={draft} block={block} />
        <div className="mt-3">
          {air ? (
            <NumberField
              id={`setup-${block}-pressure`}
              label={t.pressure}
              unit="psi"
              value={draft[damperKey(block, "pressurePsi")]}
              onChange={set(damperKey(block, "pressurePsi"))}
              small
              readOnly={readOnly}
            />
          ) : (
            <NumberField
              id={`setup-${block}-spring`}
              label={t.spring}
              unit="lbs"
              value={draft[damperKey(block, "springRateLbs")]}
              onChange={set(damperKey(block, "springRateLbs"))}
              small
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
      <Circuit
        block={block}
        circuit="compression"
        name={t.compression}
        draft={draft}
        set={set}
        choose={choose}
        readOnly={readOnly}
      />
      <Circuit
        block={block}
        circuit="rebound"
        name="Rebound"
        draft={draft}
        set={set}
        choose={choose}
        readOnly={readOnly}
      />
    </div>
  );
}

/**
 * One damping circuit in a ruled box: its name, the one-dial/two-dial
 * switch, and the clicks — a single field, or low- and high-speed side
 * by side. Low speed first (by request, 2026-09-11): the knob a rider
 * turns most, and the one every damper has.
 */
function Circuit({
  block,
  circuit,
  name,
  draft,
  set,
  choose,
  readOnly = false,
}: {
  block: "fork" | "shock";
  circuit: ImuCircuit;
  name: string;
  draft: Draft;
  set: Setter;
  choose: Chooser;
  readOnly?: boolean;
}) {
  const t = useProDict().report.setup.form;
  const modeKey = damperKey(block, `${circuit}Mode`);
  const dual = draft[modeKey] !== "simple";
  const lowField: keyof ImuDamperSetup = `${circuit}Low`;
  const highField: keyof ImuDamperSetup = `${circuit}High`;
  return (
    <div className="rounded-[12px] border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{name}</p>
        <ModeSwitch
          label={dual ? t.dual : t.single}
          checked={dual}
          onToggle={() => choose(modeKey, dual ? "simple" : "dual")}
          disabled={readOnly}
        />
      </div>
      {dual ? (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <NumberField
            id={`setup-${block}-${lowField}`}
            label={t.lowSpeed}
            unit={t.clicksUnit}
            value={draft[damperKey(block, lowField)]}
            onChange={set(damperKey(block, lowField))}
            small
            readOnly={readOnly}
          />
          <NumberField
            id={`setup-${block}-${highField}`}
            label={t.highSpeed}
            unit={t.clicksUnit}
            value={draft[damperKey(block, highField)]}
            onChange={set(damperKey(block, highField))}
            small
            readOnly={readOnly}
          />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <NumberField
            id={`setup-${block}-${circuit}`}
            label={t.clicks}
            unit={t.clicksUnit}
            value={draft[damperKey(block, circuit)]}
            onChange={set(damperKey(block, circuit))}
            small
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}

/** A small labelled switch — the lab's track-and-thumb (the analysis
 * page's "Valores"), the word beside it naming the state it is in. */
function ModeSwitch({
  label,
  checked,
  onToggle,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex h-6 shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground",
        disabled ? "cursor-default" : "cursor-pointer",
      )}
    >
      {label}
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-foreground" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform",
            checked && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}

function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  small = false,
  className,
  hint,
  readOnly = false,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  small?: boolean;
  className?: string;
  /** A reading under the field — the sag's share of the travel. */
  hint?: string | null;
  readOnly?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className={cn(small && "text-xs")}>
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={value ?? ""}
          onChange={onChange}
          placeholder="–"
          readOnly={readOnly}
          className="pr-14 tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      {hint && (
        <p className="text-xs text-muted-foreground tabular-nums">{hint}</p>
      )}
    </div>
  );
}
