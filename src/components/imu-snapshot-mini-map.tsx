"use client";

import { ImuRoutePlate } from "@/components/imu-route-plate";

/**
 * A Snapshot's stretch of trail as a small picture (by request,
 * 2026-09-10): the reference session's track faint as context and the
 * ground between the gates bright, framed on the stretch. A satellite map
 * until 2026-10-27; since then the plain plate the sessions list uses (by
 * request — see imu-route-plate.tsx), with its north but not its start and
 * finish marks: the stretch is a section, not a ride.
 */
export function ImuSnapshotMiniMap({
  track,
  section,
  className,
}: {
  /** The whole track, [lat, lon]. */
  track: [number, number][];
  /** The ground between the gates, entry first. */
  section: [number, number][];
  className?: string;
}) {
  // A section of a ride: no start dot, no finish disc.
  return (
    <ImuRoutePlate
      section={section}
      track={track}
      ends={false}
      className={className}
    />
  );
}
