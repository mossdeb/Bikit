"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProDict } from "@/components/pro-locale";

/**
 * The app's not-found screen, redrawn on this side of the account with
 * Pro's own words (2026-09-24): the same look, in the account's language,
 * and the way back points at the sessions rather than the dashboard. A
 * client module so it can ask `useProDict()`: a page under Pro that calls
 * `notFound()` renders this inside the Pro layout, where the provider is.
 * (The layout's own `notFound()` for an account without lab access falls
 * to the root's screen, not this one.)
 */
export default function ProNotFound() {
  const t = useProDict();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <CircleAlert className="size-6 text-muted-foreground" />
      </div>
      <h1 className="font-display text-xl font-bold">{t.nav.notFound.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t.nav.notFound.body}
      </p>
      <Button
        render={<Link href="/pro" />}
        nativeButton={false}
        className="mt-6"
      >
        {t.nav.notFound.back}
      </Button>
    </div>
  );
}
