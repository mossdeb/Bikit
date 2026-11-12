import { SessionPage } from "./session-page";

/** One IMU session's analysis — see SessionPage. */
export default async function ImuSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionPage sessionId={sessionId} />;
}
