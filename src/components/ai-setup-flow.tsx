"use client";

// The Smart Setup flow: search form → preview (components) → Strava → create.
// All state lives here; the two server actions (searchBikeSetup,
// createBikeFromAiSetup) do the work. Edits made in the preview affect only
// the bike being created — the shared catalogs keep what the AI found.
//
// Receives AiSetupLabels (plain strings) rather than the Dictionary, which
// cannot cross the server/client boundary, and the brand field as a slot
// rendered by the server page (BrandField is a server component). The page
// header lives here too, because the Strava step swaps the subtitle.

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Loader2, Pencil, Sparkles } from "lucide-react";
import {
  searchBikeSetup,
  createBikeFromAiSetup,
  type AiSetupSearchResult,
  type AiSetupComponent,
} from "@/lib/actions/ai-setup";
import { connectStrava } from "@/lib/actions/strava";
import { AI_SETUP_MAX_INTERVALS, type MaintenanceInterval } from "@/lib/ai/intervals";
import { splitComponentNaming } from "@/lib/ai/component-name";
import { COMPONENT_CATEGORIES, type BikeType, type ComponentCategory } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import { COMPONENT_CATEGORY_ICON } from "@/components/component-category-icon";
import { ComponentIcon } from "@/components/component-icon";
import { ConnectWithStravaButton } from "@/components/strava-brand";
import { IntervalIncludesButton } from "@/components/interval-includes-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/** {one, many} pairs use "{n}" as the count placeholder. */
export interface AiSetupLabels {
  title: string;
  subtitle: string;
  model: string;
  modelPlaceholder: string;
  version: string;
  versionPlaceholder: string;
  year: string;
  searchButton: string;
  searching: string;
  searchingHint: string;
  notFoundTitle: string;
  notFoundBody: string;
  createManually: string;
  quotaTitle: string;
  quotaBody: string;
  errorBody: string;
  foundTitle: string;
  componentsFound: { one: string; many: string };
  intervalsConfigured: { one: string; many: string };
  source: string;
  remainingThisMonth: { one: string; many: string };
  every: { km: string; hours: string; months: string; monthOne: string };
  componentsTitle: string;
  editHint: string;
  edit: string;
  include: string;
  noIntervals: string;
  maxIntervalsHint: string;
  componentCapNote: { one: string; many: string };
  category: string;
  brand: string;
  usageQuestion: string;
  usageNew: string;
  usageUsed: string;
  factoryQuestion: string;
  factoryHint: string;
  factoryYes: string;
  factoryNo: string;
  totalDistance: string;
  totalHours: string;
  createBike: string;
  creating: string;
  createError: string;
  next: string;
  componentOn: string;
  componentOff: string;
  stravaStepTitle: string;
  stravaBenefits: string[];
  stravaSkipHint: string;
  stravaGearLabel: string;
  stravaNone: string;
  stravaConnectLabel: string;
  cancel: string;
  back: string;
  categoryLabels: Record<string, string>;
  intervalNames: Record<string, string>;
  includesTitle: string;
  includesLabel: string;
}

/** Strava state resolved by the server page: gear labels arrive ready
 * (including the "already linked to X" wording, which is a dictionary
 * function and cannot cross the boundary). */
export interface AiSetupStrava {
  connected: boolean;
  gearOptions: { value: string; label: string; disabled: boolean }[];
}

function counted(template: { one: string; many: string }, n: number): string {
  return n === 1 ? template.one : template.many.replace("{n}", String(n));
}

type Phase =
  // 'searching' only exists for the arrival that already carries the four
  // values: the bike form's first step asked for them, so showing the same
  // four fields again on the way through would be asking twice. The form
  // still exists — it is where a failed search lands, prefilled, and where
  // anyone arriving without values starts.
  | { name: "searching" }
  | { name: "form"; error: "not_found" | "quota" | "error" | null }
  | { name: "preview"; result: Extract<AiSetupSearchResult, { status: "found" }> };

export function AiSetupFlow({
  labels,
  brandSlot,
  strava,
  componentCap,
  initial,
}: {
  labels: AiSetupLabels;
  brandSlot: ReactNode;
  strava: AiSetupStrava;
  /** How many components the plan still allows (null = unlimited). The
   * preview starts everything off and caps the switches when finite. */
  componentCap: number | null;
  /** Handed over by the bike form's first step, which asks for the same
   * four fields. With `autoSearch` the reader already pressed a button
   * knowing what it does, so asking for the same values again would just
   * be a second tap. */
  initial?: { brand: string; model: string; version: string; year: string; autoSearch: boolean };
}) {
  const [phase, setPhase] = useState<Phase>(
    initial?.autoSearch ? { name: "searching" } : { name: "form", error: null }
  );
  const [searching, startSearch] = useTransition();

  // A paid call, so it fires once and only once: React runs effects twice in
  // development, and the ref is what keeps that from buying two searches.
  const autoSearched = useRef(false);
  useEffect(() => {
    if (!initial?.autoSearch || autoSearched.current) return;
    autoSearched.current = true;
    // Burn the trigger out of the history entry before searching. `go` means
    // "a button was just pressed"; left in the URL it becomes "search again",
    // and coming back here — browser back, a reload, a shared link — would
    // silently buy a second search. The values stay, so the form is still
    // filled in. replaceState and not router.replace: no re-render, no
    // navigation, nothing that could remount this and re-enter the effect.
    const url = new URL(window.location.href);
    url.searchParams.delete("go");
    window.history.replaceState(null, "", url.toString());

    const formData = new FormData();
    formData.set("brand", initial.brand);
    formData.set("model", initial.model);
    formData.set("version", initial.version);
    formData.set("year", initial.year);
    handleSearch(formData);
    // Runs on arrival only — the values come from the URL and never change
    // without a navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(formData: FormData) {
    startSearch(async () => {
      const result = await searchBikeSetup(formData);
      if (result.status === "found") {
        setPhase({ name: "preview", result });
      } else if (result.status === "quota_exhausted") {
        setPhase({ name: "form", error: "quota" });
      } else if (result.status === "not_found") {
        setPhase({ name: "form", error: "not_found" });
      } else {
        setPhase({ name: "form", error: "error" });
      }
    });
  }

  // The pass-through screen: no fields, because they were just filled in on
  // the previous one. A failure moves to 'form' and they are all still here.
  if (phase.name === "searching") {
    return (
      <div className="space-y-6 rounded-[20px] border border-border bg-card p-5 sm:p-6">
        <FlowHeader title={labels.title} subtitle={labels.subtitle} />
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="size-6 animate-spin" />
          <p className="font-semibold">{labels.searching}</p>
          <p className="text-sm text-muted-foreground">{labels.searchingHint}</p>
        </div>
        {/* Leaving does not stop the call already in flight — it just stops
            waiting for it. Worth having: the hint says this can take a
            minute. */}
        <Link href="/bikes/new" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          {labels.cancel}
        </Link>
      </div>
    );
  }

  if (phase.name === "preview") {
    return (
      <AiSetupPreview
        labels={labels}
        strava={strava}
        componentCap={componentCap}
        result={phase.result}
        onBack={() => setPhase({ name: "form", error: null })}
      />
    );
  }

  return (
    <div className="space-y-6 rounded-[20px] border border-border bg-card p-5 sm:p-6">
      <FlowHeader title={labels.title} subtitle={labels.subtitle} />
      <form action={handleSearch} className="space-y-5">
        {phase.error === "not_found" && (
          <ErrorCard title={labels.notFoundTitle} body={labels.notFoundBody} manualLabel={labels.createManually} />
        )}
        {phase.error === "quota" && (
          <ErrorCard
            title={labels.quotaTitle}
            body={labels.quotaBody}
            manualLabel={labels.createManually}
            tone="alert"
          />
        )}
        {phase.error === "error" && (
          <ErrorCard title={labels.notFoundTitle} body={labels.errorBody} manualLabel={labels.createManually} />
        )}

        {brandSlot}

        <div className="space-y-1.5">
          <Label htmlFor="model">{labels.model} *</Label>
          <Input
            id="model"
            name="model"
            placeholder={labels.modelPlaceholder}
            defaultValue={initial?.model}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="version">{labels.version}</Label>
            <Input
              id="version"
              name="version"
              placeholder={labels.versionPlaceholder}
              defaultValue={initial?.version}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="year">{labels.year} *</Label>
            <Input
              id="year"
              name="year"
              type="number"
              min={2010}
              max={new Date().getFullYear() + 1}
              defaultValue={initial?.year || new Date().getFullYear()}
              required
            />
          </div>
        </div>

        <Button type="submit" variant="inverted" disabled={searching} className="w-full">
          {searching ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {labels.searching}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {labels.searchButton}
            </>
          )}
        </Button>
        {searching && <p className="text-center text-sm text-muted-foreground">{labels.searchingHint}</p>}
        <Link href="/bikes/new" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          {labels.cancel}
        </Link>
      </form>
    </div>
  );
}

function FlowHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/**
 * `tone="alert"` is for the wall, not the miss. "We couldn't find your bike"
 * is an outcome — try another spelling and carry on — and shouting it would
 * be shouting at half the searches. The quota being spent is the one that
 * stops the reader entirely, and in grey it read as one more grey box.
 *
 * Where the red goes was decided by measurement, not taste. On the tinted
 * surface in light mode --health-critical gives the body 3.02:1 and even
 * --destructive only 3.70 — no red in this palette reaches 4.5 there. So
 * the alarm is carried by the frame and the heading (--destructive, 3.70
 * light / 5.63 dark, the same latitude the toast already takes for a short
 * bold line) and the body drops to normal foreground, which is legible.
 * Colour that costs the reader the sentence is not visibility.
 */
function ErrorCard({
  title,
  body,
  manualLabel,
  tone = "neutral",
}: {
  title: string;
  body: string;
  manualLabel: string;
  tone?: "neutral" | "alert";
}) {
  const alert = tone === "alert";
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-4",
        alert ? "border-health-critical bg-health-critical/10" : "border-border bg-muted/50"
      )}
    >
      <p className={cn("font-semibold", alert && "text-destructive")}>{title}</p>
      <p className={cn("text-sm", alert ? "text-foreground" : "text-muted-foreground")}>{body}</p>
      <Link href="/bikes/new" className="inline-block text-sm font-semibold underline underline-offset-4">
        {manualLabel}
      </Link>
    </div>
  );
}

/** Mockup-style black pill switch: on = foreground track, knob always a
 * bordered background disc so it survives both themes. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors",
        checked ? "bg-foreground" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 block size-5 rounded-full border border-border bg-background shadow-sm transition-transform",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}

/** The green rounded-square tick the mockups use for interval and origin
 * choices — a native checkbox can't round its corners. */
function CheckSquare({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors",
        selected ? "border-primary bg-primary" : "border-border bg-background"
      )}
    >
      {selected && <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />}
    </span>
  );
}

function BenefitCheck() {
  return <CheckCircle2 className="size-5 shrink-0 fill-foreground text-primary" />;
}

// ── Preview ────────────────────────────────────────────────────────────────

interface EditableComponent extends AiSetupComponent {
  /** Which of `intervals` fill the 3 slots, by index into that list. */
  selectedIdx: number[];
  /** Untoggled components stay on screen, faded, instead of disappearing —
   * the decision stays visible and reversible. Only active ones are
   * created. */
  enabled: boolean;
}

function AiSetupPreview({
  labels,
  strava,
  componentCap,
  result,
  onBack,
}: {
  labels: AiSetupLabels;
  strava: AiSetupStrava;
  componentCap: number | null;
  result: Extract<AiSetupSearchResult, { status: "found" }>;
  onBack: () => void;
}) {
  // The Strava screen is a step inside the preview, not a phase of the flow:
  // stepping back must land on the same edited component list, so the state
  // has to survive the transition.
  const [step, setStep] = useState<"components" | "strava">("components");
  const [components, setComponents] = useState<EditableComponent[]>(() =>
    result.components.map((component) => ({
      ...component,
      selectedIdx: component.selected.map((s) => component.intervals.indexOf(s)).filter((i) => i >= 0),
      // A capped plan starts with everything off: pre-picking N of 25 for
      // the user would be our guess, not their choice.
      enabled: componentCap === null,
    }))
  );
  const [factory, setFactory] = useState(true);
  /** New bike: totals stay locked at 0 and the origin question is moot —
   * with zero on the clock, factory and fresh parts are the same baseline. */
  const [isNew, setIsNew] = useState(true);
  const [totalKm, setTotalKm] = useState("0");
  const [totalHours, setTotalHours] = useState("0");
  const [gearId, setGearId] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [creating, startCreate] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);

  const enabledComponents = components.filter((c) => c.enabled);
  const intervalCount = enabledComponents.reduce((n, c) => n + c.selectedIdx.length, 0);

  function updateComponent(index: number, patch: Partial<EditableComponent>) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function toggleInterval(index: number, intervalIdx: number) {
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const selected = c.selectedIdx.includes(intervalIdx)
          ? c.selectedIdx.filter((s) => s !== intervalIdx)
          : c.selectedIdx.length < AI_SETUP_MAX_INTERVALS
            ? [...c.selectedIdx, intervalIdx]
            : c.selectedIdx;
        return { ...c, selectedIdx: selected };
      })
    );
  }

  function handleCreate() {
    setCreateError(null);
    startCreate(async () => {
      const payload = {
        bike: {
          brand: result.bike.brand,
          model: result.bike.model,
          version: result.bike.version,
          year: result.bike.year,
          type: result.bike.type,
          total_km: totalKm === "" ? null : Number(totalKm),
          total_hours: totalHours === "" ? null : Number(totalHours),
          strava_gear_id: gearId === "" ? null : gearId,
        },
        factory,
        components: enabledComponents.map((c) => ({
          category: c.category,
          brand: c.brand,
          model: c.model,
          variant: c.variant,
          year: c.year,
          intervals: c.selectedIdx.map((i) => c.intervals[i]),
        })),
      };
      const failure = await createBikeFromAiSetup(payload);
      // Success never returns (the action redirects); reaching here is failure.
      setCreateError(
        failure.status === "limit_reached" || failure.status === "error"
          ? (failure.message ?? labels.createError)
          : labels.createError
      );
    });
  }

  if (step === "strava") {
    return (
      <div className="space-y-6 rounded-[20px] border border-border bg-card p-5 sm:p-6">
        <FlowHeader title={labels.title} subtitle={labels.stravaStepTitle} />

        {strava.connected ? (
          <div className="space-y-1.5">
            <Label htmlFor="ai-strava-gear">{labels.stravaGearLabel}</Label>
            <div className="rounded-sm bg-muted px-3.5 py-3">
              <NativeSelect
                id="ai-strava-gear"
                value={gearId}
                onChange={(e) => setGearId(e.target.value)}
                wrapperClassName="w-full"
                className="bg-background"
              >
                <option value="">{labels.stravaNone}</option>
                {strava.gearOptions.map((gear) => (
                  <option key={gear.value} value={gear.value} disabled={gear.disabled}>
                    {gear.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <p className="pt-1 text-sm text-muted-foreground">{labels.stravaSkipHint}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Leaving for Strava's OAuth drops the in-memory preview; the
                skip hint is honest about the escape hatch — the bike can be
                linked any time after creation. */}
            <form action={connectStrava}>
              <ConnectWithStravaButton label={labels.stravaConnectLabel} />
            </form>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {labels.stravaBenefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-2 text-sm">
                  <BenefitCheck />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{labels.stravaSkipHint}</p>
          </div>
        )}

        {createError && <p className="text-sm font-semibold text-destructive">{createError}</p>}

        <div className="space-y-3">
          <Button type="button" onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {labels.creating}
              </>
            ) : (
              labels.createBike
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("components")}
            disabled={creating}
            className="w-full"
          >
            {labels.back}
          </Button>
        </div>
      </div>
    );
  }

  const bikeTitle = [result.bike.brand, result.bike.model, result.bike.version].filter(Boolean).join(" ");
  const TypeIcon = BIKE_TYPE_ICON[result.bike.type as BikeType];

  return (
    <div className="space-y-6">
      {/* Header, found block and the Componentes heading share one white
          card, split by full-width rules (divide-y, so the lines run edge to
          edge); the component cards stack below it on the page background. */}
      <div className="divide-y divide-border rounded-[20px] border border-border bg-card">
        <div className="p-5 sm:p-6">
          <FlowHeader title={labels.title} subtitle={labels.subtitle} />
        </div>

        <div className="space-y-2 p-5 sm:p-6">
          <div className="space-y-2 text-center">
            {TypeIcon && <TypeIcon className="mx-auto h-9 w-auto text-foreground" />}
            <p className="font-semibold">{labels.foundTitle}</p>
          </div>
          <p className="pt-2 text-xl font-bold">
            {bikeTitle} ({result.bike.year})
          </p>
          <div className="space-y-1.5 pt-1">
            <p className="flex items-center gap-2 text-sm">
              <BenefitCheck />
              {counted(labels.componentsFound, enabledComponents.length)}
            </p>
            <p className="flex items-center gap-2 text-sm">
              <BenefitCheck />
              {counted(labels.intervalsConfigured, intervalCount)}
            </p>
          </div>
          {result.sourceUrl && (
            <p className="text-sm text-muted-foreground">
              {labels.source}:{" "}
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {hostnameOf(result.sourceUrl)}
              </a>
            </p>
          )}
          {result.remaining !== null && (
            <p className="text-xs text-muted-foreground">{counted(labels.remainingThisMonth, result.remaining)}</p>
          )}
        </div>

        <div className="space-y-1 p-5 sm:p-6">
          <p className="font-semibold">{labels.componentsTitle}</p>
          <p className="text-sm text-muted-foreground">{labels.editHint}</p>
          {componentCap !== null && (
            <p className="pt-1 text-sm font-semibold">{counted(labels.componentCapNote, componentCap)}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {components.map((component, index) => {
          const naming = splitComponentNaming(component.brand, component.model, component.variant);
          return (
          <div
            key={`${component.brand}-${component.model}-${index}`}
            className="space-y-3 rounded-[20px] border border-border bg-card p-5"
          >
            {/* The switch row keeps full opacity even when the card body
                fades — it is both the reason the card looks disabled and the
                only way back. */}
            <div className="flex items-center gap-2.5">
              <Switch
                checked={component.enabled}
                onChange={() => {
                  // Enabling past the plan's component cap is a no-op; the
                  // cap note above the list is the explanation.
                  if (!component.enabled && componentCap !== null && enabledComponents.length >= componentCap) return;
                  updateComponent(index, { enabled: !component.enabled });
                  if (editing === index) setEditing(null);
                }}
                label={`${labels.include} ${component.brand} ${component.model}`}
              />
              <span className="text-sm text-muted-foreground">
                {component.enabled ? labels.componentOn : labels.componentOff}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="ml-auto rounded-full"
                aria-label={`${labels.edit} ${component.brand} ${component.model}`}
                disabled={!component.enabled}
                onClick={() => setEditing(editing === index ? null : index)}
              >
                <Pencil className="size-4" />
              </Button>
            </div>

            <div className={component.enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-40"}>
              <div>
                {/* Same pairing the bike page's component cards use, at the
                    size this smaller caps label can carry. The category is
                    the canonical English string, which is exactly what
                    COMPONENT_CATEGORY_ICON is keyed by. */}
                <div className="flex items-center gap-1.5">
                  <ComponentIcon
                    size="flat"
                    icon={COMPONENT_CATEGORY_ICON[component.category as ComponentCategory]}
                    className="size-[18px] text-muted-foreground"
                  />
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {labels.categoryLabels[component.category] ?? component.category}
                  </p>
                </div>
                {/* Exactly what will be created: splitComponentNaming decides
                    whether the variant is a qualifier (stays on the name line)
                    or spec prose (its own line, and the component's notes). */}
                <p className="font-semibold">
                  {naming.name}
                  {component.year ? ` (${component.year})` : ""}
                </p>
                {naming.notes ? <p className="text-sm text-muted-foreground">{naming.notes}</p> : null}
              </div>

              {editing === index && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{labels.category}</Label>
                    <NativeSelect
                      value={component.category}
                      onChange={(e) =>
                        updateComponent(index, { category: e.target.value as EditableComponent["category"] })
                      }
                    >
                      {COMPONENT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {labels.categoryLabels[category] ?? category}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{labels.brand}</Label>
                    <Input
                      value={component.brand}
                      onChange={(e) => updateComponent(index, { brand: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{labels.model}</Label>
                    <Input
                      value={component.model}
                      onChange={(e) => updateComponent(index, { model: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{labels.version}</Label>
                    <Input
                      value={component.variant}
                      onChange={(e) => updateComponent(index, { variant: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {component.intervals.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">{labels.noIntervals}</p>
              ) : (
                <div className="space-y-2">
                  {component.intervals.map((interval, intervalIdx) => {
                    const checked = component.selectedIdx.includes(intervalIdx);
                    return (
                      // A row and not one big button: the info popover is
                      // itself a button, and nesting one inside another is
                      // invalid — the click would have toggled the reminder
                      // on its way out. Two siblings, one job each.
                      <div key={`${interval.name}-${intervalIdx}`} className="flex items-center gap-2.5 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleInterval(index, intervalIdx)}
                          className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left"
                        >
                          <CheckSquare selected={checked} />
                          <span className={checked ? "" : "text-muted-foreground"}>
                            {labels.intervalNames[interval.name] ?? interval.name} — {formatInterval(labels, interval)}
                          </span>
                        </button>
                        <IntervalIncludesButton
                          size="compact"
                          title={labels.includesTitle}
                          label={labels.includesLabel}
                          items={(interval.includes ?? []).map((name) => labels.intervalNames[name] ?? name)}
                        />
                      </div>
                    );
                  })}
                  {component.intervals.length > AI_SETUP_MAX_INTERVALS && (
                    <p className="pt-1 text-center text-xs text-muted-foreground">{labels.maxIntervalsHint}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-[20px] border border-border bg-card p-5">
        <p className="font-semibold">{labels.usageQuestion}</p>
        {/* Side by side, and each button hugs its label — two words don't
            earn a line each, and a full-width target would split the row in
            half with the tick floating far from the word it ticks. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <button
            type="button"
            onClick={() => {
              // Back to "new" resets everything the used path unlocked, so
              // a stray value can't ride along disabled and invisible.
              setIsNew(true);
              setTotalKm("0");
              setTotalHours("0");
              setFactory(true);
            }}
            className="flex cursor-pointer items-center gap-2.5 text-left text-sm"
          >
            <CheckSquare selected={isNew} />
            {labels.usageNew}
          </button>
          <button
            type="button"
            onClick={() => setIsNew(false)}
            className="flex cursor-pointer items-center gap-2.5 text-left text-sm"
          >
            <CheckSquare selected={!isNew} />
            {labels.usageUsed}
          </button>
        </div>

        {/* Everything below only matters for a used bike; the choice above
            is the visible reason this half is off. */}
        <div className={isNew ? "pointer-events-none space-y-3 opacity-40" : "space-y-3"}>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="ai-total-km">{labels.totalDistance}</Label>
              <Input
                id="ai-total-km"
                type="number"
                step="0.1"
                min="0"
                disabled={isNew}
                value={totalKm}
                onChange={(e) => setTotalKm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-total-hours">{labels.totalHours}</Label>
              <Input
                id="ai-total-hours"
                type="number"
                step="0.1"
                min="0"
                disabled={isNew}
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1 pt-1">
            <p className="font-semibold">{labels.factoryQuestion}</p>
            <p className="text-sm text-muted-foreground">{labels.factoryHint}</p>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={isNew}
              onClick={() => setFactory(true)}
              className="flex w-full cursor-pointer items-center gap-2.5 text-left text-sm"
            >
              <CheckSquare selected={factory} />
              {labels.factoryYes}
            </button>
            <button
              type="button"
              disabled={isNew}
              onClick={() => setFactory(false)}
              className="flex w-full cursor-pointer items-center gap-2.5 text-left text-sm"
            >
              <CheckSquare selected={!factory} />
              {labels.factoryNo}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="inverted"
          onClick={() => setStep("strava")}
          disabled={enabledComponents.length === 0}
          className="w-full"
        >
          {labels.next}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} className="w-full">
          {labels.back}
        </Button>
      </div>
    </div>
  );
}

function formatInterval(labels: AiSetupLabels, interval: MaintenanceInterval): string {
  if (interval.type === "months" && interval.interval === 1) return labels.every.monthOne;
  return labels.every[interval.type].replace("{n}", String(interval.interval));
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
