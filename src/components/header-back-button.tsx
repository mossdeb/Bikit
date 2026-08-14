"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/** Matches a bike's detail page or one of its components' detail pages
 * (not /bikes, /bikes/new, or nested edit/new/interventions routes) —
 * anywhere the header shows a back chevron. */
const DETAIL_PAGE_RE = /^\/bikes\/(?!new$)([^/]+)(\/components\/(?!new$)[^/]+)?$/;

/** Bike detail only — the sole page whose header merges into its own
 * card (white bg, no top corners). The component detail page reverted
 * to a normal card, so its header stays plain. */
const BIKE_DETAIL_RE = /^\/bikes\/(?!new$)[^/]+$/;

export function useIsBikeDetailPage() {
  const pathname = usePathname();
  return BIKE_DETAIL_RE.test(pathname);
}

/** Routes that show a back chevron on mobile only — desktop already shows a
 * full breadcrumb inside the page for these. Mostly the create/edit forms,
 * plus the legal documents reached from Settings. */
const MOBILE_BACK_ROUTES: { re: RegExp; backHref: (m: RegExpMatchArray) => string }[] = [
  { re: /^\/legal\/(privacy|terms)$/, backHref: () => "/settings" },
  { re: /^\/help\/(support|docs)$/, backHref: () => "/settings" },
  { re: /^\/bikes\/new$/, backHref: () => "/bikes" },
  { re: /^\/bikes\/([^/]+)\/edit$/, backHref: (m) => `/bikes/${m[1]}` },
  { re: /^\/bikes\/([^/]+)\/ride-stress$/, backHref: (m) => `/bikes/${m[1]}` },
  { re: /^\/bikes\/([^/]+)\/components\/new$/, backHref: (m) => `/bikes/${m[1]}` },
  {
    re: /^\/bikes\/([^/]+)\/components\/([^/]+)\/edit$/,
    backHref: (m) => `/bikes/${m[1]}/components/${m[2]}`,
  },
  {
    re: /^\/bikes\/([^/]+)\/components\/([^/]+)\/interventions\/new$/,
    backHref: (m) => `/bikes/${m[1]}/components/${m[2]}`,
  },
  {
    re: /^\/bikes\/([^/]+)\/components\/([^/]+)\/interventions\/([^/]+)\/edit$/,
    backHref: (m) => `/bikes/${m[1]}/components/${m[2]}`,
  },
];

/** Shows a back chevron in the app header — on both mobile and desktop for a
 * bike's or component's detail page (going back to the bike), or on mobile
 * only for the create/edit form pages. */
export function HeaderBackButton({ className }: { className?: string }) {
  const pathname = usePathname();

  const detailMatch = pathname.match(DETAIL_PAGE_RE);
  if (detailMatch) {
    const [, bikeId, componentSegment] = detailMatch;
    const backHref = componentSegment ? `/bikes/${bikeId}` : "/bikes";
    return (
      <Link
        href={backHref}
        aria-label="Back"
        className={cn(
          "absolute top-1/2 left-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-input text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground sm:left-6",
          className
        )}
      >
        <ChevronLeft className="size-4" />
      </Link>
    );
  }

  for (const route of MOBILE_BACK_ROUTES) {
    const match = pathname.match(route.re);
    if (!match) continue;
    return (
      <Link
        href={route.backHref(match)}
        aria-label="Back"
        className={cn(
          "absolute top-1/2 left-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-input text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground sm:hidden",
          className
        )}
      >
        <ChevronLeft className="size-4" />
      </Link>
    );
  }

  return null;
}

/** Icon-only edit button shown in the shared header, on mobile only — bike
 * detail pages only. The component detail page carries its own, beside the
 * component's name. Desktop keeps each page's inline edit button instead. */
export function HeaderEditButton({ className }: { className?: string }) {
  const pathname = usePathname();

  if (!BIKE_DETAIL_RE.test(pathname)) return null;

  return (
    <Link
      href={`${pathname}/edit`}
      aria-label="Edit"
      className={cn(
        "absolute top-1/2 right-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-input text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground sm:hidden",
        className
      )}
    >
      <Pencil className="size-4" />
    </Link>
  );
}
