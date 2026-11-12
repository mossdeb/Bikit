import { SessionPage } from "./session-page";

/** One IMU session's analysis — see SessionPage. The cards can be arranged
 * in rows of the rider's own (2026-11-12). */
export default async function ImuSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionPage sessionId={sessionId} layoutEditable />;
}
