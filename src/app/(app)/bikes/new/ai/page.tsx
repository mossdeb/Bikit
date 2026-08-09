import Link from "next/link";
import { Sparkles } from "lucide-react";

// Server actions inherit the invoking segment's maxDuration, and the first
// search of an unknown bike is one bike call plus a profile call per
// component — minutes, not seconds. 300s is the Fluid Compute ceiling on
// the Hobby plan; without this the platform default cuts the search off.
export const maxDuration = 300;
import { createClient } from "@/lib/supabase/server";
import { getUserSubscription } from "@/lib/subscription";
import { hasAiSetupAccess } from "@/lib/ai-setup-access";
import { getBikeIndexManufacturers } from "@/lib/bikeindex";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { AiSetupFlow } from "@/components/ai-setup-flow";
import { aiSetupLabels } from "@/lib/ai-setup-labels";
import { BrandField } from "@/components/brand-field";
import { buttonVariants } from "@/components/ui/button";

export default async function AiSetupPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const t = dict.bikes.aiSetup;

  // The server action re-checks access on every call; this gate only
  // decides which page the reader sees. While the closed beta lasts, every
  // outsider — paying or not — gets the beta notice: the Premium pitch
  // would promise something an upgrade can't currently deliver.
  const { plan } = userId ? await getUserSubscription(userId) : { plan: "free" as const };

  if (!hasAiSetupAccess(plan, userData?.claims?.email as string | undefined)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pt-8 text-center">
        <Sparkles className="mx-auto size-8" />
        <h1 className="text-xl font-bold">{t.betaTitle}</h1>
        <p className="text-muted-foreground">{t.betaBody}</p>
        <Link href="/bikes/new" className={buttonVariants()}>
          {t.createManually}
        </Link>
      </div>
    );
  }

  const manufacturers = await getBikeIndexManufacturers();

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4 sm:pt-8">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>
      <AiSetupFlow
        labels={aiSetupLabels(dict, distanceUnit)}
        brandSlot={<BrandField manufacturers={manufacturers} dict={dict} required />}
      />
    </div>
  );
}
