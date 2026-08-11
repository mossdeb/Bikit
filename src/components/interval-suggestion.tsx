"use client";

import { createContext, useContext } from "react";
import type { IntervalSuggestion } from "@/lib/actions/component-intervals";

/**
 * Carries the catalog lookup from the wizard, which knows when to ask, to
 * IntervalFieldGroup, which knows how to show it. Context and not a prop
 * because the three step groups are rendered by the SERVER page and handed
 * to the client wizard as nodes — the wizard cannot reach inside them to
 * pass anything down, but a client provider wrapping server children still
 * reaches any client component in the tree.
 */
export const IntervalSuggestionContext = createContext<IntervalSuggestion | null>(null);

export function useIntervalSuggestion() {
  return useContext(IntervalSuggestionContext);
}
