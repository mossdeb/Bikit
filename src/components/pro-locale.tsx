"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { getProDictionary, type ProDictionary } from "@/lib/i18n/pro";

/**
 * The reader's language, for Bikit Pro's client components (2026-09-24).
 * Mounted once by the Pro layout with the locale read off the session's
 * user_metadata — the same setting the app's Definições page writes — so
 * a component anywhere under /pro asks `useProDict()` and gets the
 * dictionary in the right language, with no strings threaded through
 * props from the page. Outside the provider the hook falls back to
 * English, the app's own default for an unset language.
 */
const ProLocaleContext = createContext<Locale>("en");

export function ProLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <ProLocaleContext.Provider value={locale}>
      {children}
    </ProLocaleContext.Provider>
  );
}

export function useProLocale(): Locale {
  return useContext(ProLocaleContext);
}

export function useProDict(): ProDictionary {
  return getProDictionary(useContext(ProLocaleContext));
}
