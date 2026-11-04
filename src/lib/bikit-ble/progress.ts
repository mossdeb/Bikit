import type { TransferProgress } from "./protocol";

/** Limit visual updates only. The protocol still handles every byte and ACK.
 * No timers: cancellation/unmount cannot leave a delayed update behind.
 * Initial and final progress are always delivered immediately. */
export function throttleBleProgress(
  report: (progress: TransferProgress) => void,
  now: () => number = () => performance.now(),
): (progress: TransferProgress) => void {
  let lastReportedAt: number | null = null;
  return (progress) => {
    const at = now();
    if (
      lastReportedAt !== null &&
      progress.uniqueBytes !== progress.totalBytes &&
      at - lastReportedAt < 100
    ) return;
    lastReportedAt = at;
    report(progress);
  };
}
