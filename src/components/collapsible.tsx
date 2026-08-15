import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Content that opens and closes to a height nobody measured.
 *
 * A `grid-template-rows` transition from `0fr` to `1fr` is the only way to
 * animate to an intrinsic height. The hidden half takes `inert` because a
 * zero-height clip still leaves its links and buttons tabbable otherwise.
 */
export function Collapsible({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  /** For when the collapsing thing is a flex item that must not claim the
   * whole line — a lone button beside the figures, say. */
  className?: string;
}) {
  return (
    <div
      inert={!show}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
