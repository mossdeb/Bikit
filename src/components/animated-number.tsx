"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { splitFigureUnit } from "@/lib/format";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A blank, then the ten digits three times over.
 *
 * The blank comes first so a number that gained a digit (99 → 100) can roll
 * its new leading column up from nothing instead of up from a zero it never
 * showed.
 *
 * The three cycles are what let every column turn a full revolution before it
 * lands. With a single cycle a column travelled the shortest way to its
 * answer, so 7 → 8 was one notch and the eye missed it entirely — the roll
 * only read as a roll when the number happened to change a lot. The column
 * rests in the LAST cycle and starts in one of the earlier ones, which leaves
 * room below it for a full turn plus the difference, every time.
 */
const SLOTS = [" ", ...DIGITS, ...DIGITS, ...DIGITS];

/** Where a digit comes to rest: the last of the three cycles. */
const restOf = (ch: string) => (ch === " " ? 0 : ch.charCodeAt(0) - 48 + 1 + DIGITS.length * 2);

/**
 * Where a column starts so that it turns at least once and lands on `to`.
 *
 * Travel is a full cycle plus however far the digit moved forward, counted the
 * long way round — a digit that did not change still turns the full ten. That
 * is the point: the request was that the numbers spin, not that the ones with
 * news spin.
 */
function startOf(from: string, to: string): number {
  if (from === " ") return 0;
  const a = from.charCodeAt(0) - 48;
  const b = to.charCodeAt(0) - 48;
  return restOf(to) - DIGITS.length - ((b - a + DIGITS.length) % DIGITS.length);
}

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

/** The trailing non-digit run — "3372 km" gives " km", "53" gives "". */
function unitToken(text: string): string {
  const tokens = tokenize(text);
  const last = tokens[tokens.length - 1];
  return last && !last.digits ? last.text : "";
}

/**
 * True when two values can be animated one into the other.
 *
 * The test is the unit and nothing else. It used to be that the whole token
 * shape had to match, which quietly refused the most interesting change a
 * bike can have: crossing a thousand. A number grows a grouping separator as
 * it grows — "999 km" becomes "1,000 km" and "100 km" becomes "1 234 567 km" —
 * and that turns two tokens into four or six, so the roll was skipped exactly
 * when the number had moved the most.
 *
 * Grouping is punctuation the formatter chose; the digits are the reading.
 * What must not animate is a change of unit, because kilometres becoming
 * miles is a display preference and not something anybody rode — and that is
 * the one thing this still refuses.
 */
function comparable(a: string, b: string): boolean {
  return unitToken(a) === unitToken(b) && /\d/.test(a) && /\d/.test(b);
}

/** Every digit in the string, grouping stripped out. What the columns show,
 * in the order they show it. */
const digitsOf = (text: string) => text.replace(/\D/g, "");

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

    // Aligned as one sequence of digits, right to left, rather than run by
    // run: the runs are an artefact of where the formatter put its separators,
    // and they do not line up across a thousands boundary — "999" is one run
    // and "1,000" is two. Read as a single sequence, the units column stays
    // the units column no matter how the grouping moved, and a number that
    // grew a digit starts that new column from the blank.
    const toDigits = digitsOf(value);
    const fromDigits = digitsOf(previous).slice(-toDigits.length).padStart(toDigits.length, " ");
    if (fromDigits.length !== columns.length) return;

    columns.forEach((column, i) => {
      const strip = column.firstElementChild as HTMLElement | null;
      if (!strip) return;
      strip.style.transition = "none";
      strip.style.transform = offsetFor(startOf(fromDigits[i], toDigits[i]));
    });

    // One forced reflow for the whole row, so the browser paints the old
    // number before the transition it is about to animate away from.
    void el.offsetHeight;

    columns.forEach((column, i) => {
      const strip = column.firstElementChild as HTMLElement | null;
      if (!strip) return;
      // Written out, never cleared. React put the resting transform in the
      // style attribute, so blanking it does not fall back to the rendered
      // position — it falls back to no transform at all, which is slot zero,
      // which is empty. That is how the whole number vanished the first time.
      // The transition can be cleared, because that one comes from a class.
      strip.style.transition = "";
      // After clearing, never before: `transition` is the shorthand and it
      // carries the delay with it, so a delay set earlier in this effect was
      // being wiped one line later. Staggered left to right, so the row
      // settles as a wave instead of stopping dead all at once — and the step
      // grows with the duration, or the cascade disappears inside a longer
      // turn and the columns look simultaneous again.
      strip.style.transitionDelay = `${i * 110}ms`;
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
              data-slot={restOf(digit)}
              className="inline-block h-[1lh] overflow-hidden align-top"
            >
              <span
                // Long enough for a full turn to read as a turn: at 700ms ten
                // digits went by as a blur with no sense of travel.
                //
                // Eased in AND out, which is what makes the slower duration
                // work. The previous curve was an ease-out only — measured, it
                // covered 49% of the distance in the first 10% of the time and
                // its fastest frame was the very first one. A column went from
                // dead still to top speed with no ramp, and with the columns
                // staggered that burst happened once per column: it read as
                // the row suddenly accelerating. Stretching that curve made it
                // worse, not better, because it lengthens the opening blur and
                // the closing crawl and leaves nothing in the middle.
                className="flex flex-col transition-transform duration-[1800ms] ease-[cubic-bezier(0.65,0,0.35,1)]"
                style={{ transform: offsetFor(restOf(digit)) }}
              >
                {SLOTS.map((slot, k) => (
                  <span key={k} className="h-[1lh]">
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
