"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  parseImuBytes,
  type ImuMountOrientation,
  type ImuSessionData,
} from "./format";
import { alignSession } from "./derive";
import { withBikeFrameEvents } from "./events";

/**
 * A session's file, downloaded from Storage, parsed, and read in the bike's
 * frame with the frame-dependent events added — the one way every page
 * that shows a recording gets it, so the analysis, the report and a
 * Snapshot's passes agree to the sample.
 *
 * A file that carries the logger's full orientation (V13.5's two-step
 * calibration) — or a session lent one from another recording with the
 * sensor in the same place — is read in the bike's frame outright: up,
 * front and left are all known, and nothing is estimated from the ride.
 * The file's own record wins over the copy. Otherwise the calibration puts
 * gravity on +Z and the ride's GPS votes for forward, applied only when
 * confident — see alignSession. Then the events that need the bike's frame,
 * curves and braking, are added to the norm-based ones the parser found.
 */
export async function loadImuSession(
  storagePath: string,
  mountOrientation: ImuMountOrientation | null,
): Promise<
  { data: ImuSessionData; error: null } | { data: null; error: string }
> {
  const supabase = createClient();
  const { data: blob, error } = await supabase.storage
    .from("imu-sessions")
    .download(storagePath);
  if (error || !blob) {
    return {
      data: null,
      error: `Não foi possível descarregar o ficheiro: ${error?.message ?? "sem resposta"}.`,
    };
  }
  // Bytes, not text — the stored object may be the logger's .BKT binary
  // as well as JSON; the dispatcher tells them apart by the magic.
  const result = parseImuBytes(await blob.arrayBuffer());
  if (!result.ok) return { data: null, error: result.error };
  return {
    data: withBikeFrameEvents(alignSession(result.session, mountOrientation)),
    error: null,
  };
}

/** loadImuSession as a hook, for a page that shows one session. A null
 * path is "no session": nothing is fetched and both come back null. */
export function useImuSession(
  storagePath: string | null,
  mountOrientation: ImuMountOrientation | null,
): { data: ImuSessionData | null; error: string | null } {
  const [data, setData] = useState<ImuSessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (storagePath == null) return;
    let cancelled = false;
    (async () => {
      const result = await loadImuSession(storagePath, mountOrientation);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setData(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath, mountOrientation]);

  return { data, error };
}
