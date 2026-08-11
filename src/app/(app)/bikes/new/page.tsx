import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { getBikeIndexManufacturers } from "@/lib/bikeindex";
import { createClient } from "@/lib/supabase/server";
import { createBike } from "@/lib/actions/bikes";
import { getValidStravaAccessToken, fetchStravaBikes } from "@/lib/strava";
import { BIKE_TYPES } from "@/lib/constants";
import { BrandField } from "@/components/brand-field";
import { StravaConnectRow } from "@/components/strava-connect-row";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { BikeOptionalFields } from "@/components/bike-optional-fields";
import { bikeOptionalFieldLabels } from "@/lib/bike-optional-field-labels";
import { NewBikeWizard } from "@/components/new-bike-wizard";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { getUserSubscription } from "@/lib/subscription";
import { hasAiSetupAccess } from "@/lib/ai-setup-access";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { SmartBikeIcon } from "@/components/smart-bike-icon";

export default async function NewBikePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));
  const userId = userData?.claims?.sub as string | undefined;

  // Manufacturers (external API) and the Strava lookup chain don't depend on
  // each other, so they fire together instead of the Strava round trips
  // queuing up after the manufacturers fetch.
  const [manufacturers, subscription, { stravaAccessToken, stravaBikes, gearOwnerByGearId }] = await Promise.all([
    getBikeIndexManufacturers(),
    userId ? getUserSubscription(userId) : Promise.resolve(null),
    (async () => {
      const stravaAccessToken = userId ? await getValidStravaAccessToken(supabase, userId) : null;
      const stravaBikes = stravaAccessToken ? await fetchStravaBikes(stravaAccessToken) : [];
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
      return { stravaAccessToken, stravaBikes, gearOwnerByGearId };
    })(),
  ]);

  const step1 = (
    <Fragment key="step-1">
      <div className="space-y-1.5">
        <Label htmlFor="type">{dict.bikes.form.type}</Label>
        <NativeSelect
          id="type"
          name="type"
          defaultValue="Enduro"
          required
        >
          {BIKE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </NativeSelect>
      </div>

      <BrandField manufacturers={manufacturers} dict={dict} required />

      <div className="space-y-1.5">
        <Label htmlFor="model">{dict.bikes.form.model}</Label>
        <Input id="model" name="model" placeholder={dict.bikes.form.modelPlaceholder} required />
      </div>
    </Fragment>
  );

  const step2 = (
    <Fragment key="step-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">{dict.bikes.form.name}</Label>
        <Input id="name" name="name" placeholder={dict.bikes.form.namePlaceholder} />
      </div>

      <div className="grid grid-cols-2 gap-5 sm:contents">
        <div className="space-y-1.5">
          <Label htmlFor="total_km">{dict.bikes.form.totalDistance(distanceUnit)}</Label>
          <Input
            id="total_km"
            name="total_km"
            type="number"
            step="0.1"
            defaultValue="0"
            placeholder={dict.bikes.form.optional}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="total_hours">{dict.bikes.form.totalHours}</Label>
          <Input
            id="total_hours"
            name="total_hours"
            type="number"
            step="0.1"
            defaultValue="0"
            placeholder={dict.bikes.form.optional}
          />
        </div>
      </div>

      <BikeOptionalFields labels={bikeOptionalFieldLabels(dict)} />
    </Fragment>
  );

  const step3 = (
    <div key="step-3" className="space-y-1.5 sm:col-span-2">
      <Label>{dict.bikes.form.stravaTitle}</Label>
      {/* Same row as the edit form, and it stays the same: the select fills the
          box now that the glyph beside it is gone. */}
      {stravaAccessToken ? (
        <div className="flex items-center gap-3 rounded-sm bg-muted px-3.5 py-3">
          <NativeSelect
            id="strava_gear_id"
            name="strava_gear_id"
            defaultValue=""
            wrapperClassName="w-full"
            className="bg-background"
          >
            <option value="">{dict.bikes.form.stravaNone}</option>
            {stravaBikes.map((gear) => {
              const linkedTo = gearOwnerByGearId.get(gear.id);
              return (
                <option key={gear.id} value={gear.id} disabled={!!linkedTo}>
                  {linkedTo ? dict.bikes.form.stravaAlreadyLinked(gear.name, linkedTo) : gear.name}
                </option>
              );
            })}
          </NativeSelect>
        </div>
      ) : (
        <StravaConnectRow label={dict.settings.strava.strava} connectLabel={dict.settings.strava.connect} />
      )}
      {stravaAccessToken ? (
        <p className="text-xs text-muted-foreground">{dict.bikes.form.stravaDescription}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
            {[
              dict.bikes.form.stravaBenefitMileage,
              dict.bikes.form.stravaBenefitHours,
              dict.bikes.form.stravaBenefitSync,
              dict.bikes.form.stravaBenefitHistory,
            ].map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
                {benefit}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">{dict.bikes.form.stravaSkipHint}</p>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col max-w-2xl pt-4 sm:block sm:pt-8">
      <FormError message={error} />

      {/* Entry to Smart Setup — closed beta, so the door only shows for
          allowlisted testers (hasAiSetupAccess). When the beta opens this
          goes back to always-visible with the Premium pill doing the
          upselling; the /bikes/new/ai page keeps that pitch ready. */}
      {subscription && hasAiSetupAccess(subscription.plan, userData?.claims?.email as string | undefined) && (
        <Link
          href="/bikes/new/ai"
          className={`mb-5 flex items-stretch gap-4 rounded-[20px] bg-card p-5 ${CLICKABLE_CARD_HOVER}`}
        >
          <SmartBikeIcon className="h-11 w-auto shrink-0 self-center text-foreground" />
          <span className="min-w-0 flex-1 space-y-0.5 self-center">
            <span className="block font-semibold">{dict.bikes.aiSetup.entryTitle}</span>
            <span className="block text-sm text-muted-foreground">{dict.bikes.aiSetup.entryDescription}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end justify-between gap-3">
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
              {dict.bikes.aiSetup.beta}
            </span>
            <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
              <ArrowRight className="size-5" />
            </span>
          </span>
        </Link>
      )}

      <NewBikeWizard
        action={createBike}
        title={dict.bikes.form.addTitle}
        desktopSubtitle={dict.bikes.form.addSubtitle}
        stepSubtitles={[
          dict.bikes.form.wizardStep1Subtitle,
          dict.bikes.form.wizardStep2Subtitle,
          dict.bikes.form.wizardStep3Subtitle,
        ]}
        stepLabels={[
          dict.bikes.form.wizardStep1Label,
          dict.bikes.form.wizardStep2Label,
          dict.bikes.form.wizardStep3Label,
        ]}
        cancelHref="/bikes"
        nextLabel={dict.bikes.form.wizardNext}
        backLabel={dict.bikes.form.wizardBack}
        cancelLabel={dict.bikes.form.cancel}
        saveLabel={dict.bikes.form.saveNew}
        steps={[step1, step2, step3]}
      />
    </div>
  );
}
