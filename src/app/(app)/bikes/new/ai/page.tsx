import Link from "next/link";
import { Sparkles } from "lucide-react";

// Server actions inherit the invoking segment's maxDuration, and the first
// search of an unknown bike is one bike call plus a profile call per
// component — minutes, not seconds. 300s is the Fluid Compute ceiling on
// the Hobby plan; without this the platform default cuts the search off.
export const maxDuration = 300;
import { createClient } from "@/lib/supabase/server";
import { getUserSubscription } from "@/lib/subscription";
import { PLAN_LIMITS } from "@/lib/plans";
import { hasAiSetupAccess } from "@/lib/ai-setup-access";
import { getBikeIndexManufacturers } from "@/lib/bikeindex";
import { getValidStravaAccessToken, fetchStravaBikes } from "@/lib/strava";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { AiSetupFlow, type AiSetupStrava } from "@/components/ai-setup-flow";
import { aiSetupLabels } from "@/lib/ai-setup-labels";
import { BrandField } from "@/components/brand-field";
import { buttonVariants } from "@/components/ui/button";

export default async function AiSetupPage({
  searchParams,
}: {
  // Handed over by the bike form's first step, which asks for exactly these
  // four fields. `go` means the reader already pressed a button knowing what
  // it does, so the search starts on arrival instead of asking again.
  searchParams: Promise<{ brand?: string; model?: string; version?: string; year?: string; go?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const t = dict.bikes.aiSetup;

  // The server action re-checks access on every call; this gate only
  // decides which page the reader sees. Since the beta opened it answers
  // true for every plan, so this branch is currently unreachable — it is
  // kept, with the Premium wording, because it is what should appear the
  // day PLAN_FEATURES stops giving Smart Setup to a plan.
  const { plan } = userId ? await getUserSubscription(userId) : { plan: "free" as const };

  if (!hasAiSetupAccess(plan)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pt-8 text-center">
        <Sparkles className="mx-auto size-8" />
        <h1 className="text-xl font-bold">{t.premiumTitle}</h1>
        <p className="text-muted-foreground">{t.premiumBody}</p>
        <Link href="/bikes/new" className={buttonVariants()}>
          {t.createManually}
        </Link>
      </div>
    );
  }

  // Same parallel arrangement as the classic bike form: the manufacturers
  // fetch and the internally-sequential Strava chain (token → gear → linked
  // names) don't depend on each other. Gear labels are resolved here because
  // stravaAlreadyLinked is a dictionary function, which cannot cross into
  // the client flow.
  const [manufacturers, strava, componentCap] = await Promise.all([
    getBikeIndexManufacturers(),
    (async (): Promise<AiSetupStrava> => {
      const accessToken = userId ? await getValidStravaAccessToken(supabase, userId) : null;
      if (!accessToken) return { connected: false, gearOptions: [] };
      const stravaBikes = await fetchStravaBikes(accessToken);
      const gearOwnerByGearId = new Map<string, string>();
      if (stravaBikes.length > 0 && userId) {
        const { data: linkedBikes } = await supabase
          .from("bikes")
          .select("name, strava_gear_id")
          .eq("user_id", userId)
          .not("strava_gear_id", "is", null);
        for (const b of linkedBikes ?? []) {
          if (b.strava_gear_id) gearOwnerByGearId.set(b.strava_gear_id, b.name);
        }
      }
      return {
        connected: true,
        gearOptions: stravaBikes.map((gear) => {
          const linkedTo = gearOwnerByGearId.get(gear.id);
          return {
            value: gear.id,
            label: linkedTo ? dict.bikes.form.stravaAlreadyLinked(gear.name, linkedTo) : gear.name,
            disabled: !!linkedTo,
          };
        }),
      };
    })(),
    (async (): Promise<number | null> => {
      // What the plan still allows, mirroring createComponent's fitted-only
      // count; the preview caps its picker with this, the create action
      // re-checks it server-side.
      const maxComponents = PLAN_LIMITS[plan].maxComponents;
      if (maxComponents === null || !userId) return null;
      const { count } = await supabase
        .from("components")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("retired_at", null);
      return Math.max(0, maxComponents - (count ?? 0));
    })(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4 sm:pt-8">
      <AiSetupFlow
        labels={aiSetupLabels(dict, distanceUnit)}
        brandSlot={
          <BrandField manufacturers={manufacturers} dict={dict} defaultValue={params.brand} required />
        }
        strava={strava}
        componentCap={componentCap}
        initial={{
          model: params.model ?? "",
          version: params.version ?? "",
          year: params.year ?? "",
          // Only auto-search with everything the search needs in hand; a
          // hand-edited URL missing a field falls back to the normal form.
          autoSearch: params.go === "1" && !!params.brand && !!params.model && !!params.year,
          brand: params.brand ?? "",
        }}
      />
    </div>
  );
}
