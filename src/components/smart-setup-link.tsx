"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SmartBikeIcon } from "@/components/smart-bike-icon";

/** The two routes out of the bike form's first step. The fields are the same
 * ones Smart Setup asks for, so this carries what the reader already typed
 * instead of dropping them into an empty form — which is the whole reason
 * the entry moved from above the card to inside it, below the fields.
 *
 * A button and not a <Link>: the values only exist in the DOM at click time.
 */
export function SmartSetupLink({
  title,
  description,
  beta,
}: {
  title: string;
  description: string;
  beta: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={(event) => {
        const form = event.currentTarget.closest("form");
        if (!form) return;
        const params = new URLSearchParams();
        for (const name of ["brand", "model", "version", "year"] as const) {
          const field = form.elements.namedItem(name) as HTMLInputElement | null;
          if (!field) continue;
          // Same gate the Next button uses — Smart Setup needs brand, model
          // and year too, and failing on the other page would look like the
          // other page's fault.
          if (!field.reportValidity()) return;
          const value = field.value.trim();
          if (value) params.set(name, value);
        }
        // Everything needed is in hand, so the search starts on arrival
        // rather than asking for the same four values a second time.
        params.set("go", "1");
        router.push(`/bikes/new/ai?${params.toString()}`);
      }}
      className="flex w-full cursor-pointer items-center gap-4 rounded-md bg-muted p-4 text-left transition-opacity hover:opacity-90 sm:col-span-2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <SmartBikeIcon className="h-6 w-auto shrink-0 text-foreground" />
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {beta}
          </span>
        </span>
        <span className="mt-1.5 block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <ArrowRight className="size-5" />
      </span>
    </button>
  );
}
