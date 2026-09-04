/**
 * The last mile of an import, shared by the file dialog and the BLE panel:
 * the bytes are already parsed and validated, and what is left is to put the
 * untouched file in Storage and register the summary row.
 *
 * Upload first, row second — a failed upload leaves no row, and the inverse
 * (an orphan file, no row) is harmless. Extension and content type follow
 * what the PARSER found, not the file's name or where it came from: a .BKT
 * is a binary whether it was picked from disk or received over the air.
 */

import { createClient } from "@/lib/supabase/client";
import { createImuSession } from "@/lib/actions/imu";
import { BKT_CONTENT_TYPE, BKT_FORMAT } from "@/lib/imu/bkt";
import type { ImuSessionData } from "@/lib/imu/format";
import type { ImuSessionSummary } from "@/lib/imu/derive";

export type ImportOutcome = { ok: true } | { ok: false; error: string };

export async function uploadAndRegisterImuSession(input: {
  userId: string;
  bytes: Blob;
  session: ImuSessionData;
  summary: ImuSessionSummary;
  name: string;
  riderName: string;
  bikeId: string | null;
}): Promise<ImportOutcome> {
  const { session, summary } = input;
  const isBkt = session.format === BKT_FORMAT;
  const storagePath = `${input.userId}/${crypto.randomUUID()}.${isBkt ? "bkt" : "json"}`;
  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from("imu-sessions")
    .upload(storagePath, input.bytes, {
      contentType: isBkt ? BKT_CONTENT_TYPE : "application/json",
      upsert: false,
    });
  if (uploadError)
    return { ok: false, error: `O upload falhou: ${uploadError.message}` };

  const result = await createImuSession({
    name: input.name,
    riderName: input.riderName,
    bikeId: input.bikeId,
    storagePath,
    format: session.format,
    durationMs: summary.durationMs,
    sampleRateHz: summary.sampleRateHz,
    sampleCount: summary.sampleCount,
    maxG: summary.maxG,
    eventCount: summary.eventCount,
    curveCount: summary.curveCount,
    jumpCount: summary.jumpCount,
    impactCount: summary.impactCount,
    airtimeMs: summary.airtimeMs,
  });
  if (result.status === "error") return { ok: false, error: result.message };
  return { ok: true };
}
