"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProDict } from "@/components/pro-locale";

/**
 * The app's error screen, redrawn on this side of the account with Pro's
 * own words (2026-09-24): the same look, but read from the Pro dictionary
 * in the account's language, where the app's version is English literals.
 * A client module, as Next wants an error boundary to be — which is also
 * what lets it ask `useProDict()`; the provider is the Pro layout's, and
 * an error boundary at this level renders inside it.
 */
export default function ProError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useProDict();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <CircleAlert className="size-6 text-destructive" />
      </div>
      <h1 className="font-display text-xl font-bold">{t.nav.error.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t.nav.error.body}</p>
      <Button type="button" onClick={reset} className="mt-6">
        {t.nav.error.retry}
      </Button>
    </div>
  );
}
