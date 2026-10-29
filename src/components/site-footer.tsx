import { cn } from "@/lib/utils";

/** The legal line under every page (by request, 2026-10-29). Not
 * translated: it names the patent application as filed. */
export const PATENT_LINE =
  "Patent Pending · Portugal · INPI Request No. 20262008502041";
export const LEGAL_LINE = `© 2026 BIKIT · ${PATENT_LINE}`;

/** The patent line as a quiet pill, in the Pro header beside the theme
 * toggle (by request, 2026-10-29). Wide screens only. */
export function PatentPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "hidden rounded-full border border-border px-3 py-1 text-xs whitespace-nowrap text-foreground lg:inline-block",
        className,
      )}
    >
      {PATENT_LINE}
    </span>
  );
}

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "pt-10 text-center text-xs text-muted-foreground",
        className,
      )}
    >
      {LEGAL_LINE}
    </footer>
  );
}
