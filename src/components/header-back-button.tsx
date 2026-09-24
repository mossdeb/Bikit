"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent } from "react";
import { ChevronLeft, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/** Matches a bike's detail page or one of its components' detail pages
 * (not /bikes, /bikes/new, or nested edit/new/interventions routes) —
 * anywhere the header shows a back chevron. */
const DETAIL_PAGE_RE =
  /^\/bikes\/(?!new$)([^/]+)(\/components\/(?!new$)[^/]+)?$/;

/** Bike detail only — the sole page whose header merges into its own
 * card (white bg, no top corners). The component detail page reverted
 * to a normal card, so its header stays plain. */
const BIKE_DETAIL_RE = /^\/bikes\/(?!new$)[^/]+$/;

export function useIsBikeDetailPage() {
  const pathname = usePathname();
  return BIKE_DETAIL_RE.test(pathname);
}

/** Routes that show a back chevron on mobile — desktop already shows a full
 * breadcrumb inside the page for most of these. Mostly the create/edit forms,
 * plus the legal documents reached from Settings. */
const MOBILE_BACK_ROUTES: {
  re: RegExp;
  backHref: (m: RegExpMatchArray) => string;
  /** Keep the chevron on desktop too. For the routes without it that is not
   * an omission — their page carries a breadcrumb of its own — but the IMU
   * session has neither, so on a wide screen it left no way back but the
   * browser's. */
  alsoDesktop?: boolean;
  /** Back is where the reader came from, when that is known (by request,
   * 2026-09-24): the setups comparison opens from the session page and
   * from the report, and a fixed target sent one of them to the wrong
   * place. `backHref` stays as the fallback — a page reached by its
   * address has nothing to return to. */
  fromHistory?: boolean;
}[] = [
  { re: /^\/legal\/(privacy|terms)$/, backHref: () => "/settings" },
  { re: /^\/help\/(support|docs)$/, backHref: () => "/settings" },
  { re: /^\/bikes\/new$/, backHref: () => "/bikes" },
  { re: /^\/bikes\/([^/]+)\/edit$/, backHref: (m) => `/bikes/${m[1]}` },
  { re: /^\/bikes\/([^/]+)\/ride-load$/, backHref: (m) => `/bikes/${m[1]}` },
  {
    re: /^\/pro\/sessoes\/[^/]+$/,
    backHref: () => "/pro",
    alsoDesktop: true,
    fromHistory: true,
  },
  {
    re: /^\/pro\/sessoes\/([^/]+)\/relatorio$/,
    backHref: (m) => `/pro/sessoes/${m[1]}`,
    alsoDesktop: true,
    fromHistory: true,
  },
  // A Snapshot lives under the session it was made from, and back is that
  // session's report — where the Snapshot is listed (by request).
  {
    re: /^\/pro\/sessoes\/([^/]+)\/snapshots\/[^/]+$/,
    backHref: (m) => `/pro/sessoes/${m[1]}/relatorio`,
    alsoDesktop: true,
    fromHistory: true,
  },
  // A bike under Pro: back to Pro's list of bikes.
  {
    re: /^\/pro\/bicicletas\/[^/]+$/,
    backHref: () => "/pro/bicicletas",
    alsoDesktop: true,
    fromHistory: true,
  },
  // The setups comparison is reached from the report's Bike card and from
  // the session's header.
  {
    re: /^\/pro\/sessoes\/([^/]+)\/afinacoes$/,
    backHref: (m) => `/pro/sessoes/${m[1]}/relatorio`,
    alsoDesktop: true,
    fromHistory: true,
  },
  {
    re: /^\/bikes\/([^/]+)\/components\/new$/,
    backHref: (m) => `/bikes/${m[1]}`,
  },
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

/**
 * The button's look, shared by both branches so the two never drift.
 *
 * A filled disc and no outline: the header sits on the app's grey ground, so
 * the card white is enough to lift the control off it, and the chevron can
 * then be foreground rather than muted — an outline around it was a second
 * line saying what the disc already says. `bg-card` and not white, so the
 * dark theme gets its own surface. Hover moves the fill, since there is no
 * border left to move.
 */
const BACK_BUTTON =
  "absolute top-1/2 left-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card text-foreground transition-colors hover:bg-muted";

/**
 * The pages this tab has walked through in the app, oldest first, so a
 * back chevron can return to the one before rather than to a fixed
 * target. Kept in sessionStorage: it is this tab's history, and a reload
 * keeps the browser's history too. Pushed on every client-side change of
 * pathname; popped when the change lands on the entry before, which is
 * a step back, so the trail does not grow with every return.
 */
const TRAIL_KEY = "bikit:trail";

function readTrail(): string[] {
  try {
    const raw = sessionStorage.getItem(TRAIL_KEY);
    const trail = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(trail)
      ? trail.filter((p) => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function writeTrail(trail: string[]) {
  try {
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail.slice(-40)));
  } catch {
    // Private windows and blocked storage: back falls back to the fixed
    // target, which is what it was before.
  }
}

function useTrail(pathname: string) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const last = previous.current;
    previous.current = pathname;
    if (!last || last === pathname) return;
    const trail = readTrail();
    if (trail[trail.length - 1] === pathname) trail.pop();
    else trail.push(last);
    writeTrail(trail);
  }, [pathname]);
}

/** Shows a back chevron in the app header — on both mobile and desktop for a
 * bike's or component's detail page (going back to the bike), or on mobile
 * only for the create/edit form pages. */
export function HeaderBackButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useTrail(pathname);

  // Back to the page before, when this tab walked here from one and the
  // browser still has it; else the route's fixed target, which the link
  // carries anyway. A plain click only: a modifier or middle click opens
  // the fixed target in a new tab, as a link should.
  const backThroughHistory = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const trail = readTrail();
    const before = trail[trail.length - 1];
    if (!before || before === pathname || window.history.length < 2) return;
    event.preventDefault();
    router.back();
  };

  const detailMatch = pathname.match(DETAIL_PAGE_RE);
  if (detailMatch) {
    const [, bikeId, componentSegment] = detailMatch;
    const backHref = componentSegment ? `/bikes/${bikeId}` : "/bikes";
    return (
      <Link
        href={backHref}
        aria-label="Back"
        className={cn(BACK_BUTTON, "sm:left-6", className)}
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
        onClick={route.fromHistory ? backThroughHistory : undefined}
        className={cn(
          BACK_BUTTON,
          route.alsoDesktop ? "sm:left-6" : "sm:hidden",
          className,
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
        className,
      )}
    >
      <Pencil className="size-4" />
    </Link>
  );
}
