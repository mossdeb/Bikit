import { SessionPage } from "../session-page";

/**
 * The session page's test copy (by request, 2026-11-12): the same cards, and
 * a switch that lets them be dragged into another order, kept in this
 * browser. The owner's account only; the page itself is untouched.
 */
export default async function ImuSessionUi2Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionPage sessionId={sessionId} layoutEditable />;
}
