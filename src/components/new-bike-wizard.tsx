"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";

/** Splits the "add bike" form into a 3-step wizard on mobile only — desktop
 * keeps showing every field at once (all three step groups stay mounted so
 * their inputs still submit together; only their visibility toggles). The
 * step groups are pre-rendered server-side and passed in as plain React
 * nodes so this client component never needs the (non-serializable) i18n
 * dictionary itself. */
export function NewBikeWizard({
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
  step1Footer,
  step1NextLabel,
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
  /** Sits at the bottom of step 1 on mobile, pushed down against the Next
   * button — CSS cannot reparent an element, so the caller renders its
   * desktop copy inside the step-1 group and hands the mobile one here. */
  step1Footer?: ReactNode;
  /** Replaces `nextLabel` on step 1 only. The bike form passes it when the
   * Smart Setup card is on screen, so the button can name the road it
   * takes; without that card there is nothing to be manual about. */
  step1NextLabel?: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const formRef = useRef<HTMLFormElement>(null);

  function goNext() {
    if (step === 1 && formRef.current) {
      // The bike's identity, which is also exactly what the Smart Setup
      // route needs — the type moved to step 2 with the rest of the usage.
      const step1Fields = ["brand", "model", "year"];
      for (const name of step1Fields) {
        const field = formRef.current.elements.namedItem(name) as
          | HTMLInputElement
          | HTMLSelectElement
          | null;
        if (field && !field.reportValidity()) return;
      }
    }
    setStep((s) => ((s + 1) as 1 | 2 | 3));
  }

  return (
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

      {/* Takes the slack so the card lands against the buttons instead of
          floating under the fields. Whichever of the two carries mt-auto
          must be the only one — two auto margins split the free space. */}
      {step1Footer && step === 1 && <div className="mt-auto pt-6 sm:hidden">{step1Footer}</div>}

      <div
        className={cn(
          "flex flex-col gap-3 pt-6 sm:hidden",
          !(step1Footer && step === 1) && "mt-auto"
        )}
      >
        {step < 3 ? (
          <Button
            key="next"
            type="button"
            variant="inverted"
            className="w-full"
            onClick={goNext}
          >
            {step === 1 && step1NextLabel ? step1NextLabel : nextLabel}
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
  );
}
