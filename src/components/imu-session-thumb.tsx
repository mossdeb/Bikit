import { ImuRoutePlate } from "@/components/imu-route-plate";

/**
 * A session's route as a thumbnail in the sessions list (2026-10-26, like
 * the Snapshots' list), on the plain plate since 2026-10-27 — see
 * imu-route-plate.tsx. The whole route is the stretch.
 */
export function ImuSessionThumb({
  outline,
  className,
}: {
  /** The route, [lat, lon], already thinned for a picture this size. */
  outline: [number, number][];
  className?: string;
}) {
  return <ImuRoutePlate section={outline} className={className} />;
}
