"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  parseImuBytes,
  type ImuMountOrientation,
  type ImuSessionData,
} from "./format";
import { alignSession } from "./derive";
import { withBikeFrameEvents } from "./events";
import { trimSession, type ImuSessionTrim } from "./trim";

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
 *
 * Last, the session's trim (src/lib/imu/trim.ts): the file is cropped to
 * the run and time re-zeroed at its start. After the alignment and the
 * detection, not before — the whole ride votes for forward, and a curve
 * cut by the trim is still a curve for the part that was kept.
 */
export async function loadImuSession(
  storagePath: string,
  mountOrientation: ImuMountOrientation | null,
  trim: ImuSessionTrim | null = null,
): Promise<
  { data: ImuSessionData; error: null } | { data: null; error: string }
> {
  const whole = await loadWholeImuSession(storagePath, mountOrientation);
  if (whole.data === null) return whole;
  return { data: trimSession(whole.data, trim), error: null };
}

/** loadImuSession before the trim: the whole recording, aligned and with
 * its events. What the trim dialog reads, to show what the trim leaves out. */
export async function loadWholeImuSession(
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
 * path is "no session": nothing is fetched and both come back null. The
 * whole recording is fetched once and kept; a change of trim only re-crops
 * it, so saving a trim never downloads the file again. `whole` is the
 * recording before the trim, for the dialog that sets it. */
export function useImuSession(
  storagePath: string | null,
  mountOrientation: ImuMountOrientation | null,
  trim: ImuSessionTrim | null = null,
): {
  data: ImuSessionData | null;
  whole: ImuSessionData | null;
  error: string | null;
} {
  const [whole, setWhole] = useState<ImuSessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (storagePath == null) return;
    let cancelled = false;
    (async () => {
      const result = await loadWholeImuSession(storagePath, mountOrientation);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setWhole(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath, mountOrientation]);

  // Keyed on the two numbers, not the object: the page hands a fresh
  // object on every render, and the crop must not run on every render.
  const startMs = trim?.startMs ?? null;
  const endMs = trim?.endMs ?? null;
  const data = useMemo(
    () =>
      whole && startMs != null && endMs != null
        ? trimSession(whole, { startMs, endMs })
        : whole,
    [whole, startMs, endMs],
  );

  return { data, whole, error };
}
