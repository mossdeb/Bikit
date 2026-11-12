import { redirect } from "next/navigation";

/** The layout once tried here is the session page's own now (2026-11-12):
 * old links land there. */
export default async function ImuSessionUi2Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  redirect(`/pro/sessoes/${sessionId}`);
}
