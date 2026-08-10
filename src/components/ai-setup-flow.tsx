"use client";

// The Smart Setup flow: search form → searching → preview → create.
// All state lives here; the two server actions (searchBikeSetup,
// createBikeFromAiSetup) do the work. Edits made in the preview affect only
// the bike being created — the shared catalogs keep what the AI found.
//
// Receives AiSetupLabels (plain strings) rather than the Dictionary, which
// cannot cross the server/client boundary, and the brand field as a slot
// rendered by the server page (BrandField is a server component).

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Pencil, Sparkles } from "lucide-react";
import {
  searchBikeSetup,
  createBikeFromAiSetup,
  type AiSetupSearchResult,
  type AiSetupComponent,
} from "@/lib/actions/ai-setup";
import type { MaintenanceInterval } from "@/lib/ai/intervals";
import { COMPONENT_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/** {one, many} pairs use "{n}" as the count placeholder. */
export interface AiSetupLabels {
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
  fromCatalog: string;
  source: string;
  remainingToday: { one: string; many: string };
  every: { km: string; hours: string; months: string; monthOne: string };
  componentsTitle: string;
  editHint: string;
  edit: string;
  include: string;
  noIntervals: string;
  maxIntervalsHint: string;
  category: string;
  brand: string;
  factoryQuestion: string;
  factoryHint: string;
  factoryYes: string;
  factoryNo: string;
  totalDistance: string;
  totalHours: string;
  createBike: string;
  creating: string;
  createError: string;
  back: string;
  categoryLabels: Record<string, string>;
  intervalNames: Record<string, string>;
}

function counted(template: { one: string; many: string }, n: number): string {
  return n === 1 ? template.one : template.many.replace("{n}", String(n));
}

type Phase =
  | { name: "form"; error: "not_found" | "quota" | "error" | null }
  | { name: "preview"; result: Extract<AiSetupSearchResult, { status: "found" }> };

export function AiSetupFlow({ labels, brandSlot }: { labels: AiSetupLabels; brandSlot: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ name: "form", error: null });
  const [searching, startSearch] = useTransition();

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

  if (phase.name === "preview") {
    return (
      <AiSetupPreview labels={labels} result={phase.result} onBack={() => setPhase({ name: "form", error: null })} />
    );
  }

  return (
    <form action={handleSearch} className="space-y-5">
      {phase.error === "not_found" && (
        <ErrorCard title={labels.notFoundTitle} body={labels.notFoundBody} manualLabel={labels.createManually} />
      )}
      {phase.error === "quota" && (
        <ErrorCard title={labels.quotaTitle} body={labels.quotaBody} manualLabel={labels.createManually} />
      )}
      {phase.error === "error" && (
        <ErrorCard title={labels.notFoundTitle} body={labels.errorBody} manualLabel={labels.createManually} />
      )}

      {brandSlot}

      <div className="space-y-1.5">
        <Label htmlFor="model">{labels.model} *</Label>
        <Input id="model" name="model" placeholder={labels.modelPlaceholder} required />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="version">{labels.version}</Label>
          <Input id="version" name="version" placeholder={labels.versionPlaceholder} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="year">{labels.year} *</Label>
          <Input
            id="year"
            name="year"
            type="number"
            min={2010}
            max={new Date().getFullYear() + 1}
            defaultValue={new Date().getFullYear()}
            required
          />
        </div>
      </div>

      <Button type="submit" disabled={searching} className="w-full">
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
    </form>
  );
}

function ErrorCard({ title, body, manualLabel }: { title: string; body: string; manualLabel: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-4">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link href="/bikes/new" className="inline-block text-sm font-semibold underline underline-offset-4">
        {manualLabel}
      </Link>
    </div>
  );
}

// ── Preview ────────────────────────────────────────────────────────────────

interface EditableComponent extends AiSetupComponent {
  /** Which of `intervals` fill the 3 slots, by index into that list. */
  selectedIdx: number[];
  /** Unticked components stay on screen at 10% opacity instead of
   * disappearing — the decision stays visible and reversible. Only ticked
   * ones are created. */
  enabled: boolean;
}

function AiSetupPreview({
  labels,
  result,
  onBack,
}: {
  labels: AiSetupLabels;
  result: Extract<AiSetupSearchResult, { status: "found" }>;
  onBack: () => void;
}) {
  const [components, setComponents] = useState<EditableComponent[]>(() =>
    result.components.map((component) => ({
      ...component,
      selectedIdx: component.selected.map((s) => component.intervals.indexOf(s)).filter((i) => i >= 0),
      enabled: true,
    }))
  );
  const [factory, setFactory] = useState(true);
  const [totalKm, setTotalKm] = useState("0");
  const [totalHours, setTotalHours] = useState("0");
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
          : c.selectedIdx.length < 3
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

  const bikeTitle = [result.bike.brand, result.bike.model, result.bike.version].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-5">
        <p className="text-lg font-semibold">{labels.foundTitle}</p>
        <p className="text-xl font-bold">
          {bikeTitle} ({result.bike.year})
        </p>
        <p className="text-sm">✓ {counted(labels.componentsFound, enabledComponents.length)}</p>
        <p className="text-sm">✓ {counted(labels.intervalsConfigured, intervalCount)}</p>
        {result.origin === "catalog" && <p className="text-sm text-muted-foreground">{labels.fromCatalog}</p>}
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
        <p className="text-xs text-muted-foreground">{counted(labels.remainingToday, result.remaining)}</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="font-semibold">{labels.componentsTitle}</p>
          <p className="text-sm text-muted-foreground">{labels.editHint}</p>
        </div>

        {components.map((component, index) => (
          <div
            key={`${component.brand}-${component.model}-${index}`}
            className="flex items-start gap-3 rounded-lg border border-border p-4"
          >
            {/* The include checkbox stays at full opacity even when the card
                body fades — it is both the reason the card looks disabled
                and the only way back. */}
            <input
              type="checkbox"
              checked={component.enabled}
              onChange={() => {
                updateComponent(index, { enabled: !component.enabled });
                if (editing === index) setEditing(null);
              }}
              aria-label={`${labels.include} ${component.brand} ${component.model}`}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <div
              className={
                component.enabled
                  ? "min-w-0 flex-1 space-y-3"
                  : "pointer-events-none min-w-0 flex-1 space-y-3 opacity-10"
              }
            >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {labels.categoryLabels[component.category] ?? component.category}
                </p>
                <p className="font-semibold">
                  {component.brand} {[component.model, component.variant].filter(Boolean).join(" ")}
                  {component.year ? ` (${component.year})` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${labels.edit} ${component.brand} ${component.model}`}
                  onClick={() => setEditing(editing === index ? null : index)}
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
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
                  <Input value={component.brand} onChange={(e) => updateComponent(index, { brand: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{labels.model}</Label>
                  <Input value={component.model} onChange={(e) => updateComponent(index, { model: e.target.value })} />
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
              <p className="text-sm text-muted-foreground">{labels.noIntervals}</p>
            ) : (
              <div className="space-y-1.5">
                {component.intervals.map((interval, intervalIdx) => {
                  const checked = component.selectedIdx.includes(intervalIdx);
                  return (
                    <label key={`${interval.name}-${intervalIdx}`} className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInterval(index, intervalIdx)}
                        className="size-4 accent-primary"
                      />
                      <span className={checked ? "" : "text-muted-foreground"}>
                        {labels.intervalNames[interval.name] ?? interval.name} — {formatInterval(labels, interval)}
                      </span>
                    </label>
                  );
                })}
                {component.intervals.length > 3 && (
                  <p className="text-xs text-muted-foreground">{labels.maxIntervalsHint}</p>
                )}
              </div>
            )}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="font-semibold">{labels.factoryQuestion}</p>
        <p className="text-sm text-muted-foreground">{labels.factoryHint}</p>
        <div className="flex gap-2">
          <Button type="button" variant={factory ? "default" : "outline"} size="sm" onClick={() => setFactory(true)}>
            {labels.factoryYes}
          </Button>
          <Button type="button" variant={!factory ? "default" : "outline"} size="sm" onClick={() => setFactory(false)}>
            {labels.factoryNo}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ai-total-km">{labels.totalDistance}</Label>
            <Input
              id="ai-total-km"
              type="number"
              step="0.1"
              min="0"
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
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
            />
          </div>
        </div>
      </div>

      {createError && <p className="text-sm font-semibold text-destructive">{createError}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={creating}>
          {labels.back}
        </Button>
        <Button type="button" onClick={handleCreate} disabled={creating || enabledComponents.length === 0} className="flex-1">
          {creating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {labels.creating}
            </>
          ) : (
            labels.createBike
          )}
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
