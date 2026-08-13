"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible } from "@/components/collapsible";

/** A titled block inside an answer, for the few questions that are a
 * procedure rather than a sentence. `steps` renders ordered, `bullets`
 * unordered; a section may carry either, both, or neither. */
export type FaqSection = {
  heading: string;
  intro?: string;
  steps?: string[];
  bullets?: string[];
};

export type FaqItem = { question: string; answer: string; sections?: FaqSection[] };

/**
 * The FAQ, in the app's own surface.
 *
 * The questions come from the landing dictionary — same text, read from the
 * same place, exactly as the legal documents already do. What differs is the
 * surface: fixed hex and Exo 2 out there, tokens and Anek Latin in here.
 *
 * One open at a time, like the landing section. The answer rides the shared
 * `Collapsible` rather than being mounted and unmounted, so it opens to its own
 * height instead of appearing all at once.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question} className="overflow-hidden rounded-[15px] border border-border">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-sm font-bold text-foreground sm:text-base">{item.question}</span>
              {/* transition-[rotate], not transition-transform: Tailwind v4
                  sets the individual `rotate` property, which a transform
                  transition does not watch — the chevron would snap. */}
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-[rotate] duration-300 ease-out motion-reduce:transition-none ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <Collapsible show={isOpen}>
              <div className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">
                <p>{item.answer}</p>
                {item.sections?.map((section, sectionIndex) => (
                  // Keyed by index and not by heading: "Requirements" appears
                  // once per platform, and three identical keys is a silent
                  // remount every time the answer opens.
                  <div key={sectionIndex} className="mt-4">
                    <p className="font-semibold text-foreground">{section.heading}</p>
                    {section.intro && <p className="mt-1">{section.intro}</p>}
                    {section.steps && (
                      <ol className="mt-1.5 list-decimal space-y-1 pl-5">
                        {section.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    )}
                    {section.bullets && (
                      <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        {section.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
