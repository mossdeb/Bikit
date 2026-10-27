"use client";

import { createContext, useContext } from "react";
import type { ImuSessionData } from "@/lib/imu/format";

/** The loaded recording, for what the page's header shows of it: the
 * header is the server page's, handed in as a prop, but it renders inside
 * the analysis component's tree, so a context reaches it once the file is
 * read. Its own module so the header's pieces (the setup dialog, the file
 * badges) can read it without importing the analysis. */
export const SessionDataContext = createContext<ImuSessionData | null>(null);

/** The recording once it is read; null before that, and on pages with no
 * recording loaded (the report, a bike's setups). */
export function useLoadedSession(): ImuSessionData | null {
  return useContext(SessionDataContext);
}
