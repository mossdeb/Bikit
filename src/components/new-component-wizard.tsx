"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { IntervalSuggestionContext } from "@/components/interval-suggestion";
import { suggestComponentIntervals, type IntervalSuggestion } from "@/lib/actions/component-intervals";
import { cn } from "@/lib/utils";

/** Splits the "add component" form into a 3-step wizard on mobile only —
 * desktop keeps showing every field at once (all three step groups stay
 * mounted so their inputs still submit together; only their visibility
 * toggles). Mirrors NewBikeWizard's structure exactly, just validating
 * category/brand/model on step 1 instead of type/brand/model. */
export function NewComponentWizard({
  action,
  title,
  desktopSubtitle,
  stepSubtitles,
  stepLabels,
  cancelHref,
  nextLabel,
  backLabel,
  cancelLabel,
  saveLabel,
  steps,
  bikeType,
}: {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  desktopSubtitle: string;
  stepSubtitles: [string, string, string];
  stepLabels: [string, string, string];
  cancelHref: string;
  nextLabel: string;
  backLabel: string;
  cancelLabel: string;
  saveLabel: string;
  steps: [ReactNode, ReactNode, ReactNode];
  /** The bike's BIKE_TYPES entry — the code defaults scale their cadence to
   * how the bike is ridden, which only the bike knows. */
  bikeType: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [suggestion, setSuggestion] = useState<IntervalSuggestion | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /** Leaving step 1 is the moment: the four fields the lookup needs are
   * filled, and step 2 gives the round trip time to land before step 3 is
   * ever seen. Free — catalog and code defaults only, never the AI. */
  function fetchSuggestion(form: HTMLFormElement) {
    const value = (name: string) =>
      ((form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "").trim();

    // Never overwrite what the reader wrote. On desktop every step is on
    // screen at once, so the reminder slots may already be filled in by the
    // time step 1 is finished.
    const written = [...form.querySelectorAll<HTMLInputElement>('input[name^="interval_name_"], input[name^="interval_value_"]')];
    if (written.some((input) => input.value.trim() !== "")) return;

    const year = Number(value("year"));
    suggestComponentIntervals({
      category: value("category"),
      brand: value("brand"),
      model: value("model"),
      year: Number.isFinite(year) && year > 0 ? year : null,
      bikeType,
    })
      .then((result) => {
        if (result) setSuggestion(result);
      })
      // A lookup that fails leaves the form exactly as it was — this is a
      // convenience, never a precondition for creating a component.
      .catch(() => {});
  }

  function goNext() {
    if (step === 1 && formRef.current) {
      const step1Fields = ["category", "brand", "model"];
      for (const name of step1Fields) {
        const field = formRef.current.elements.namedItem(name) as
          | HTMLInputElement
          | HTMLSelectElement
          | null;
        if (field && !field.reportValidity()) return;
      }
      fetchSuggestion(formRef.current);
    }
    setStep((s) => ((s + 1) as 1 | 2 | 3));
  }

  return (
    <IntervalSuggestionContext value={suggestion}>
    <form
      ref={formRef}
      action={action}
      className="flex flex-1 flex-col rounded-lg bg-card p-6 sm:block"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:hidden">{stepSubtitles[step - 1]}</p>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{desktopSubtitle}</p>
      </div>

      <div className="mb-6 sm:hidden">
        <div className="flex items-center justify-center gap-2">
          {([1, 2, 3] as const).map((n) => (
            <Fragment key={n}>
              {n > 1 && <div className={cn("h-px w-8", n <= step ? "bg-foreground" : "bg-border")} />}
              <div
                className={cn(
                  "size-2.5 rounded-full",
                  n <= step ? "bg-foreground" : "border border-input"
                )}
              />
            </Fragment>
          ))}
        </div>
        <p className="mt-2 text-center text-sm font-bold">{stepLabels[step - 1]}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className={step === 1 ? "contents" : "hidden sm:contents"}>{steps[0]}</div>
        <div className={step === 2 ? "contents" : "hidden sm:contents"}>{steps[1]}</div>
        <div className={step === 3 ? "contents" : "hidden sm:contents"}>{steps[2]}</div>
      </div>

      <div className="mt-6 hidden flex-col gap-3 sm:flex">
        <SubmitButton className="w-full">
          {saveLabel}
        </SubmitButton>
        <Button
          render={<Link href={cancelHref} />}
          nativeButton={false}
          type="button"
          variant="outline"
          className="w-full"
        >
          {cancelLabel}
        </Button>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-6 sm:hidden">
        {step < 3 ? (
          <Button
            key="next"
            type="button"
            variant="inverted"
            className="w-full"
            onClick={goNext}
          >
            {nextLabel}
          </Button>
        ) : (
          <SubmitButton key="save" className="w-full">
            {saveLabel}
          </SubmitButton>
        )}
        {step === 1 ? (
          <Button
            render={<Link href={cancelHref} />}
            nativeButton={false}
            type="button"
            variant="outline"
            className="w-full"
          >
            {cancelLabel}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setStep((s) => ((s - 1) as 1 | 2 | 3))}
          >
            {backLabel}
          </Button>
        )}
      </div>
    </form>
    </IntervalSuggestionContext>
  );
}
