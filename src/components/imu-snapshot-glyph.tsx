import { cn } from "@/lib/utils";

/** The art's own box, from assets/icons/IMU/snapshot.svg. */
const VIEW = 117.147;
/** The lab's stroke, px, whatever the size the glyph is shown at. */
const STROKE_PX = 1.5;

/**
 * The Snapshot's mark — the session's trace in a frame, with a plus at the
 * corner (art supplied 2026-09-10; replaces the camera). Stroke in
 * `currentColor`, and its width computed from the size it is shown at:
 * what gets painted is `stroke × (size ÷ viewBox)`, so a single number in
 * the file would paint 0.4px at 14px and 0.7px at 28. The file's own
 * clip-path is dropped and overflow left visible, or a stroke this wide
 * would be shaved at the frame's edge — the lab's known trap.
 */
export function ImuSnapshotGlyph({
  className,
  sizePx = 20,
}: {
  className?: string;
  /** The size it is rendered at, px — the stroke is scaled to it. */
  sizePx?: number;
}) {
  const strokeWidth = (STROKE_PX * VIEW) / sizePx;
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.543 52.7117H24.8662L31.5383 41.1974L37.6766 60.506L47.6492 23.9259L60.7621 69.9832L68.1014 52.7117H78.8717" />
      <path d="M55.2522 92.4091H8.62468C4.68983 92.4091 1.5 89.2193 1.5 85.2844V8.62468C1.5 4.68983 4.68983 1.5 8.62468 1.5H85.2844C89.2193 1.5 92.4091 4.68983 92.4091 8.62468V56.0454" />
      <path d="M92.4082 115.647V69.1707" />
      <path d="M69.1699 92.4091H115.647" />
    </svg>
  );
}
