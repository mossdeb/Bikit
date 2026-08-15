"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { splitFigureUnit } from "@/lib/format";

/** Blank first, so a number that gained a digit (99 → 100) can roll its new
 * leading column up from nothing instead of up from a zero it never showed. */
const SLOTS = [" ", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const slotOf = (ch: string) => (ch === " " ? 0 : ch.charCodeAt(0) - 47);

/** Percentages of the strip's own height, so the column never needs to know
 * what a line box measures in pixels. */
const offsetFor = (slot: number) => `translateY(${(-slot * 100) / SLOTS.length}%)`;

const STORE_PREFIX = "bikit:seen:";

/** Digit runs and everything between them, in order — "3372 km" becomes
 * ["3372", " km"]. Splitting rather than stripping keeps the unit, the
 * thousands separator and the decimal comma exactly where the formatter put
 * them; this component never decides how a number is written. */
function tokenize(text: string): { digits: boolean; text: string }[] {
  return text.split(/(\d+)/).filter(Boolean).map((part) => ({ digits: /^\d+$/.test(part), text: part }));
}

/** True when two values can be animated one into the other: same tokens in the
 * same order, with only the digit runs differing. "3372 km" → "3400 km" can;
 * "3372 km" → "2110 mi" cannot, and neither can anything whose shape moved. */
function comparable(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length !== tb.length) return false;
  return ta.every((tok, i) => tok.digits === tb[i].digits && (tok.digits || tok.text === tb[i].text));
}

/**
 * A number that rolls from the value this device last saw to the value the
 * server just sent — the odometer read, one column per digit.
 *
 * Three things it deliberately does not do:
 *
 * It does not animate on a first visit. With no stored baseline there is no
 * "before", and rolling up from zero would dramatise a number that did not
 * change. Same when the value is identical: silence is the signal.
 *
 * It holds no React state, and the markup it renders is the final value on the
 * server and on the first client render alike. The roll is set up in a layout
 * effect by writing transforms straight to the columns, so there is no
 * hydration mismatch to reconcile and no frame where the old number is on
 * screen as if it were current.
 *
 * The baseline is per bike and per field, not per screen. The same bike's
 * distance appears on the dashboard, in the bike list and on the bike's own
 * header; keyed per screen, one ride would have played the same animation
 * three times over. The question is "did this change since I last saw it",
 * and seeing it anywhere is seeing it.
 */
export function AnimatedNumber({
  value,
  storageKey,
  className,
  unitClassName,
}: {
  /** Already formatted, unit included — "3372 km", "9,6 h", "53".
   *
   * The whole string is what gets stored, not just the digits, and that is
   * what makes switching from kilometres to miles roll nothing: the unit token
   * differs, the shapes stop matching, and a display preference is not a
   * change to report. */
  value: string;
  /** Stable per bike and per field, e.g. `${bike.id}:km`. */
  storageKey: string;
  className?: string;
  /** Set where the unit is typed differently from the figure, as in the bike
   * header's totals box. The space before it goes with it — the class brings
   * its own margin. Left unset, the string renders exactly as formatted. */
  unitClassName?: string;
}) {
  const root = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const key = STORE_PREFIX + storageKey;

    let previous: string | null = null;
    try {
      previous = window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode, or storage full. Nothing to animate from and nothing to
      // record — the number is still on screen, which is the part that matters.
      return;
    }

    if (previous === null || previous === value || !comparable(previous, value)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const columns = el.querySelectorAll<HTMLElement>("[data-digit]");
    const before = tokenize(previous)
      .filter((t) => t.digits)
      .map((t) => t.text);
    const after = tokenize(value)
      .filter((t) => t.digits)
      .map((t) => t.text);

    // Right-aligned against the incoming width, so the units column stays the
    // units column when a number grows a digit.
    const from: string[] = [];
    after.forEach((run, i) => {
      const old = before[i] ?? "";
      from.push(old.slice(-run.length).padStart(run.length, " "));
    });
    const fromDigits = from.join("");
    if (fromDigits.length !== columns.length) return;

    columns.forEach((column, i) => {
      const strip = column.firstElementChild as HTMLElement | null;
      if (!strip) return;
      strip.style.transition = "none";
      strip.style.transform = offsetFor(slotOf(fromDigits[i]));
    });

    // One forced reflow for the whole row, so the browser paints the old
    // number before the transition it is about to animate away from.
    void el.offsetHeight;

    columns.forEach((column) => {
      const strip = column.firstElementChild as HTMLElement | null;
      if (!strip) return;
      // Written out, never cleared. React put the resting transform in the
      // style attribute, so blanking it does not fall back to the rendered
      // position — it falls back to no transform at all, which is slot zero,
      // which is empty. That is how the whole number vanished the first time.
      // The transition can be cleared, because that one comes from a class.
      strip.style.transition = "";
      strip.style.transform = offsetFor(Number(column.dataset.slot));
    });
  }, [value, storageKey]);

  // The unit is peeled off only to be typed differently; it is never animated,
  // because "km" does not become "mi" because somebody rode.
  const split = unitClassName ? splitFigureUnit(value) : null;
  const figure = split ? split.figure : value;

  return (
    <span ref={root} className={cn("inline-flex items-baseline whitespace-pre", className)}>
      {tokenize(figure).map((token, i) =>
        token.digits ? (
          token.text.split("").map((digit, j) => (
            <span
              // `1lh` and not `1em`: the column has to be exactly one line box
              // tall or it stops sharing a baseline with the text beside it,
              // and `em` is the font size, which is a different number.
              key={`${i}-${j}`}
              data-digit
              data-slot={slotOf(digit)}
              className="inline-block h-[1lh] overflow-hidden align-top"
            >
              <span
                className="flex flex-col transition-transform duration-700 ease-out"
                style={{ transform: offsetFor(slotOf(digit)) }}
              >
                {SLOTS.map((slot) => (
                  <span key={slot} className="h-[1lh]">
                    {slot}
                  </span>
                ))}
              </span>
            </span>
          ))
        ) : (
          <span key={i}>{token.text}</span>
        )
      )}
      {split?.unit ? <span className={unitClassName}>{split.unit}</span> : null}
    </span>
  );
}
