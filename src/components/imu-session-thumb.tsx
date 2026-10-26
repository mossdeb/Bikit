"use client";

import { useEffect, useRef, useState } from "react";
import { ImuSnapshotMiniMap } from "@/components/imu-snapshot-mini-map";
import { cn } from "@/lib/utils";

/**
 * A session's route as a thumbnail in the sessions list (by request,
 * 2026-10-26, like the Snapshots' list): the Snapshot mini map with the
 * whole outline at full strength. Mounted only once the card comes near
 * the screen — a list of dozens would otherwise open dozens of maps and
 * their imagery at once — and kept once it has been.
 */
export function ImuSessionThumb({
  outline,
  className,
}: {
  /** The route, [lat, lon], already thinned for a picture this size. */
  outline: [number, number][];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  return (
    <div
      ref={ref}
      className={cn("overflow-hidden rounded-[12px] bg-sidebar", className)}
    >
      {near && (
        <ImuSnapshotMiniMap
          track={outline}
          section={outline}
          sectionWeight={2}
          className="h-full w-full"
        />
      )}
    </div>
  );
}
