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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProDict, useProLocale } from "@/components/pro-locale";
import type { ProDictionary } from "@/lib/i18n/pro";
import { proPercent } from "@/lib/i18n/pro";
import type { Locale } from "@/lib/i18n";
import { saveImuSessionSetup } from "@/lib/actions/imu-setups";
import {
  circuitMode,
  DAMPER_FIELDS,
  damperSpring,
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

const damperKey = (block: "fork" | "shock", field: keyof ImuDamperSetup) =>
  `${block}.${field}`;
const tireKey = (field: keyof ImuTireSetup) => `tires.${field}`;
const RIDER_WEIGHT_KEY = "rider.weightKg";

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
  return draft;
}

/** "30 % do curso" ("30% of the travel") under the sag field, from the
 * two strings as typed — the same arithmetic the summary prints
 * (sagPercent). Null until both numbers are in. */
function sagShare(
  draft: Draft,
  block: "fork" | "shock",
  t: ProDictionary["report"]["setup"]["form"],
  locale: Locale,
): string | null {
  const num = (key: string) => {
    const n = Number(draft[key]?.trim().replace(",", "."));
    return draft[key]?.trim() && Number.isFinite(n) ? n : undefined;
  };
  const share = sagPercent({
    travelMm: num(damperKey(block, "travelMm")),
    sagMm: num(damperKey(block, "sagMm")),
  });
  return share != null ? t.sagShare(proPercent(share, locale)) : null;
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
}: {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !setupValuesEqual(fromDraft(draft), values) ||
    draftNote.trim() !== (note ?? "");

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await saveImuSessionSetup({
      sessionId,
      values: fromDraft(draft),
      note: draftNote,
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
          setDraft(toDraft(values));
          setDraftNote(note ?? "");
          setBusy(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        title={t.triggerTitle}
        // The report door's pill, beside it: outlined, the mark and the
        // word — a control, not a figure. A caller can dress it otherwise
        // (the report's Bike card, 2026-09-14).
        className={cn(
          triggerClassName ??
            "inline-flex shrink-0 items-center gap-2.5 self-start rounded-[14px] border border-border bg-card px-5 py-3 font-semibold text-foreground",
          CLICKABLE_CARD_HOVER,
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
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">{title ?? t.title}</DialogTitle>
          <DialogDescription className="mt-1">
            {readOnly ? t.descriptionReadOnly : t.description}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) void save();
          }}
        >
          {/* The supplied layout (2026-09-11, second pass): the suspension
              on one hatched plate — the fork's card, the bike's mark on the
              hatching, the shock's card — and the tyres on a plate of their
              own under it, so the two systems read as two things. The mark
              is a desktop affair; stacked on a phone the two cards follow
              each other and it would be a picture between forms. */}
          <div className="imu-event-band rounded-[18px] border border-border p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
              <DamperBlock
                block="fork"
                heading={labels.fork || dict.report.setup.fork}
                draft={draft}
                set={set}
                choose={choose}
                readOnly={readOnly}
              />
              <div
                aria-hidden
                className="hidden w-32 items-center justify-center sm:flex lg:w-40"
              >
                {/* Mirrored: the art faces right, and here the fork's card is
                    on the left — the bike should face its own fork (by
                    request, 2026-09-11). */}
                {/* A 3 px line on screen whatever the size it is drawn at
                    (by request, 2026-09-11: 2 px read too thin beside the
                    cards): the art's own stroke is 4 in a 101-wide box,
                    which painted ~5 px at 128 px. Fixed in screen pixels,
                    the event cards' way. */}
                <BikeMark className="h-auto w-24 -scale-x-100 text-foreground lg:w-32 [&_*]:[stroke-width:3px] [&_*]:[vector-effect:non-scaling-stroke]" />
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

          {/* A pill in the middle, not a bar across — the supplied layout. */}
          {!readOnly && (
            <Button
              type="submit"
              className="mx-auto flex w-full rounded-full sm:w-auto sm:min-w-[320px] sm:px-12"
              variant="inverted"
              disabled={busy || !dirty}
            >
              {busy ? dict.common.saving : dict.common.save}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
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
  const locale = useProLocale();
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
            hint={sagShare(draft, block, t, locale)}
            small
            readOnly={readOnly}
          />
        </div>
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
