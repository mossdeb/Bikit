"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import { LogoMark } from "@/components/logo";
import type { BikeType } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The running order, in one table.
 *
 * The delays go onto the elements as inline `animation-delay` and into the
 * rolling letters as a millisecond offset, so CSS and JavaScript read their
 * timing from the same numbers instead of two lists that drift apart.
 */
const AT = {
  bike: 100,
  heading: 480,
  brand: 700,
  model: 1300,
  year: 1440,
} as const;

/** Matches the delayed `bike-celebration-leave` in globals.css: 2850 + 360,
 * plus a frame of slack so the node is removed after the fade rather than
 * during it. */
const TOTAL_MS = 3240;
/** Matches `.bike-celebration-now`. */
const SKIP_MS = 300;

/** Each letter starts this many places back in the alphabet and walks forward
 * into its answer. A fixed distance rather than a random one: every letter
 * then travels the same road and the word resolves as one movement. */
const ROLL_DISTANCE = 12;
const ROLL_MS = 460;
const ROLL_STAGGER_MS = 38;

/**
 * The drawings carry `stroke-width="4"` as an attribute, sized for the 40px
 * they normally appear at. At 180px wide that is 7.1px of ink, because a stroke
 * scales with its box. Thinning it means dividing by that same scale:
 * 4 ÷ (180 ÷ 101) = 2.244 user units, which paints 4px. CSS is what can say it
 * — a presentation attribute loses to any rule, and these components take a
 * className and nothing else.
 *
 * `block` rather than the svg's inline default, so the drawing's box is the
 * drawing: inline leaves half a line's descender under it, which would eat into
 * the 40px meant to sit between it and the words.
 */
const GLYPH_CLASS = "block h-auto w-[180px] text-foreground [&_path]:[stroke-width:2.244]";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";

function alphabetOf(char: string): string | null {
  if (UPPER.includes(char)) return UPPER;
  if (LOWER.includes(char)) return LOWER;
  return null;
}

/** Decelerating, so the letters arrive rather than stop dead. */
function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

/**
 * The full-screen moment after a bike is created.
 *
 * Both ways of creating a bike — the manual form and Smart Setup — end in a
 * redirect to this bike's page, so this is the one place that has to know how
 * to celebrate, and it reads the bike it is celebrating off the row that was
 * just written rather than off anything the form remembered.
 *
 * The brand rolls in through the alphabet, which is the effect the reference
 * pen gets from an `@property` integer printed with `counter()`. That exact
 * mechanism is the one this project already had to withdraw from the Ride Load
 * figure: where `@property` is missing a custom property is not interpolable at
 * all, and the animation holds its first frame and snaps at the end. It also
 * tops out around three letters, the word being encoded as a base-26 integer.
 * The look survives; the letters are written frame by frame instead.
 *
 * The final text is what renders on the server and on the first client render,
 * so there is no hydration mismatch and no reading that is ever wrong — the
 * roll is set up afterwards by writing to the nodes, holding no React state.
 */
export function BikeCreatedCelebration({
  show,
  heading,
  brand,
  model,
  year,
  type,
  after,
}: {
  show: boolean;
  /** "New bike" — the label above the drawing. */
  heading: string;
  /** The line that rolls. Falls back to the bike's name when the row has no
   * brand, because an empty hero is worse than an unrolled one. */
  brand: string;
  /** Model and version together, the way the bike is spoken about. */
  model: string | null;
  year: number | null;
  type: string | null;
  /** Rendered once the screen has cleared. The install invite fires on this
   * same page the moment a bike exists, and two things asking for the screen
   * at once is the collision the order of invites exists to prevent. */
  after?: ReactNode;
}) {
  const [playing, setPlaying] = useState(show);
  const [skipping, setSkipping] = useState(false);
  const brandNode = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setPlaying(false), skipping ? SKIP_MS : TOTAL_MS);
    return () => window.clearTimeout(id);
  }, [playing, skipping]);

  // Drop `?created=1` the moment it has been read. `replaceState` and not
  // `router.replace`: the flag is spent, and re-rendering the whole page to
  // spell that out would throw away the screen this component is animating.
  // Next's router follows native history calls, so `useSearchParams` elsewhere
  // stays honest.
  useEffect(() => {
    if (!show) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("created")) return;
    url.searchParams.delete("created");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [show]);

  useEffect(() => {
    const el = brandNode.current;
    if (!el || !playing || skipping) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const letters = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-letter]"));
    if (letters.length === 0) return;

    const start = performance.now();
    let frame = 0;
    let cancelled = false;

    const targets = letters.map((span) => span.textContent ?? "");

    const run = () => {
      if (cancelled) return;

      // Measured after the webfont has settled, not before: a width taken in
      // the fallback face locks every letter into the wrong slot. Each letter
      // then rolls inside a box the size of its final self, so a word made of
      // narrow letters on the way to wide ones does not shove itself sideways.
      for (const span of letters) {
        const { width } = span.getBoundingClientRect();
        span.style.display = "inline-block";
        span.style.width = `${width}px`;
        span.style.textAlign = "center";
      }

      const step = (now: number) => {
        const elapsed = now - start;
        let running = false;

        letters.forEach((span, i) => {
          const target = targets[i];
          const alphabet = alphabetOf(target);
          if (!alphabet) return;

          const p = (elapsed - AT.brand - i * ROLL_STAGGER_MS) / ROLL_MS;
          if (p >= 1) {
            span.textContent = target;
            return;
          }
          running = true;
          const behind = Math.round((1 - easeOut(Math.max(0, p))) * ROLL_DISTANCE);
          const at = alphabet.indexOf(target);
          span.textContent = alphabet[(at - behind + alphabet.length * 2) % alphabet.length];
        });

        if (running) frame = requestAnimationFrame(step);
      };

      frame = requestAnimationFrame(step);
    };

    // Waiting on the webfont costs nothing here — the roll does not begin
    // until 700ms in — and measuring before it lands pins every letter to a
    // fallback face's width.
    if ("fonts" in document) void document.fonts.ready.then(run);
    else run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      // Whatever interrupted this, the word left behind has to be the bike's
      // own, never a frame from halfway through the alphabet.
      letters.forEach((span, i) => {
        span.textContent = targets[i];
      });
    };
  }, [playing, skipping]);

  if (!playing) return <>{after}</>;

  // Every BikeType has a drawing; only a null or hand-edited type falls
  // through to the generic one.
  const Glyph = BIKE_TYPE_ICON[type as BikeType] ?? BIKE_TYPE_ICON.Other;

  return (
    <div
      // Above the dialogs at z-50: while this is up it owns the screen, and
      // nothing that is merely portalled later should land on top of it.
      className={cn(
        // bg-card and not bg-background: the app's ground is #efefef and this
        // screen is a surface standing in front of it, the same white a card
        // is. In dark mode it follows the card too.
        "fixed inset-0 z-[60] flex flex-col items-center bg-card px-6 pt-14 pb-16 text-center",
        skipping ? "bike-celebration-now" : "bike-celebration-auto"
      )}
      // A tap anywhere ends it. Someone adding their third bike has seen this
      // before and should not have to wait it out.
      onClick={() => setSkipping(true)}
    >
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="font-display text-lg font-bold">Bikit</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <p
          className="bike-celebration-rise text-base font-bold"
          style={{ animationDelay: `${AT.heading}ms` }}
        >
          {heading}
        </p>

        {/* The animation rides a wrapper, not the drawing: the icon map's
            components take a className and nothing else, and widening that
            signature for one caller is not worth it. */}
        {/* The animation rides a wrapper, not the drawing: the icon map's
            components take a className and nothing else, and widening that
            signature for one caller is not worth it. */}
        <span className="bike-celebration-settle my-10 block" style={{ animationDelay: `${AT.bike}ms` }}>
          {Glyph && <Glyph className={GLYPH_CLASS} />}
        </span>

        {/* whitespace-pre so the space between two words keeps its own box:
            each letter is measured and pinned to its final width, and a space
            that collapses would take the gap with it. */}
        <p
          ref={brandNode}
          className="bike-celebration-rise font-display text-[44px] leading-none font-bold whitespace-pre"
          style={{ animationDelay: `${AT.brand}ms` }}
        >
          {Array.from(brand).map((char, i) => (
            <span key={i} data-letter="">
              {char}
            </span>
          ))}
        </p>
      </div>

      <div className="space-y-1">
        {model && (
          <p
            className="bike-celebration-rise text-xl font-bold"
            style={{ animationDelay: `${AT.model}ms` }}
          >
            {model}
          </p>
        )}
        {year != null && (
          <p
            className="bike-celebration-rise text-base"
            style={{ animationDelay: `${AT.year}ms` }}
          >
            ({year})
          </p>
        )}
      </div>
    </div>
  );
}
