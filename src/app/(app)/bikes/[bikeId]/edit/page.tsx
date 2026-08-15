import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { getBikeIndexManufacturers } from "@/lib/bikeindex";
import { createClient } from "@/lib/supabase/server";
import { updateBike, deleteBike } from "@/lib/actions/bikes";
import { getValidStravaAccessToken, fetchStravaBikes } from "@/lib/strava";
import { BIKE_TYPES } from "@/lib/constants";
import { BrandField } from "@/components/brand-field";
import { StravaConnectRow } from "@/components/strava-connect-row";
import { StravaGearHelp } from "@/components/strava-gear-help";
import { FormError } from "@/components/form-error";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { BikeOptionalFields } from "@/components/bike-optional-fields";
import { bikeOptionalFieldLabels } from "@/lib/bike-optional-field-labels";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";

export default async function EditBikePage({
  params,
  searchParams,
}: {
  params: Promise<{ bikeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { bikeId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));
  const displayError = error === "strava-gear-conflict" ? dict.bikes.form.stravaGearConflict : error;

  const userId = userData?.claims?.sub as string | undefined;

  // Independent of each other — bike/manufacturers/componentCount only need
  // the URL's bikeId, and the Strava lookup chain only needs userId, so all
  // four fire together instead of the Strava round trips queuing up after
  // the rest.
  const [{ data: bike }, manufacturers, { count: componentCount }, { stravaAccessToken, stravaBikes, gearOwnerByGearId }] =
    await Promise.all([
      supabase.from("bikes").select("*").eq("id", bikeId).single(),
      getBikeIndexManufacturers(),
      supabase.from("components").select("id", { count: "exact", head: true }).eq("bike_id", bikeId),
      (async () => {
        const stravaAccessToken = userId ? await getValidStravaAccessToken(supabase, userId) : null;
        const stravaBikes = stravaAccessToken ? await fetchStravaBikes(stravaAccessToken) : [];
        const gearOwnerByGearId = new Map<string, string>();
        if (stravaBikes.length > 0 && userId) {
          const { data: linkedBikes } = await supabase
            .from("bikes")
            .select("name, strava_gear_id")
            .eq("user_id", userId)
            .not("strava_gear_id", "is", null)
            .neq("id", bikeId);
          for (const b of linkedBikes ?? []) {
            if (b.strava_gear_id) gearOwnerByGearId.set(b.strava_gear_id, b.name);
          }
        }
        return { stravaAccessToken, stravaBikes, gearOwnerByGearId };
      })(),
    ]);

  if (!bike) notFound();
  const isStravaLinked = !!bike.strava_gear_id;

  return (
    <div className="flex flex-1 flex-col max-w-2xl pt-4 sm:block sm:pt-8">
      <div className="mb-2 hidden text-sm text-muted-foreground sm:block">
        <Link href="/bikes" className="hover:text-foreground">
          {dict.bikes.breadcrumb}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/bikes/${bike.id}`} className="hover:text-foreground">
          {bike.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{dict.bikes.form.editBreadcrumb}</span>
      </div>

      <FormError message={displayError} />

      <form
        action={updateBike.bind(null, bike.id)}
        className="flex flex-1 flex-col rounded-lg bg-card p-6 sm:block"
      >
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold">{dict.bikes.form.editTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dict.bikes.form.editSubtitle(bike.name)}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="type">{dict.bikes.form.type}</Label>
            <NativeSelect
              id="type"
              name="type"
              defaultValue={bike.type ?? "Enduro"}
            >
              {BIKE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </NativeSelect>
          </div>

          <BrandField manufacturers={manufacturers} defaultValue={bike.brand} dict={dict} />

          <div className="space-y-1.5">
            <Label htmlFor="model">{dict.bikes.form.model}</Label>
            <Input id="model" name="model" defaultValue={bike.model ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">{dict.bikes.form.name}</Label>
            <Input id="name" name="name" defaultValue={bike.name} />
          </div>

          <div className="grid grid-cols-2 gap-5 sm:contents">
            <div className="space-y-1.5">
              <Label htmlFor="total_km">{dict.bikes.form.totalDistance(distanceUnit)}</Label>
              <Input
                id="total_km"
                name="total_km"
                type="number"
                step="0.1"
                defaultValue={bike.total_km ?? ""}
                placeholder={dict.bikes.form.optional}
                readOnly={isStravaLinked}
                className={isStravaLinked ? "bg-muted text-muted-foreground" : undefined}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="total_hours">{dict.bikes.form.totalHours}</Label>
              <Input
                id="total_hours"
                name="total_hours"
                type="number"
                step="0.1"
                defaultValue={bike.total_hours ?? ""}
                placeholder={dict.bikes.form.optional}
                readOnly={isStravaLinked}
                className={isStravaLinked ? "bg-muted text-muted-foreground" : undefined}
              />
            </div>
          </div>
          {isStravaLinked && (
            <p className="text-xs text-muted-foreground sm:col-span-2">{dict.bikes.form.stravaHint}</p>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{dict.bikes.form.stravaTitle}</Label>
            {/* The select fills the box now that the glyph beside it is gone.
                Kept at w-56 and pushed right, it would have left the row half
                empty for no reason — the label above already names the field,
                which is what the icon was doing. */}
            {stravaAccessToken ? (
              <div className="flex items-center gap-3 rounded-sm bg-muted px-3.5 py-3">
                <NativeSelect
                  id="strava_gear_id"
                  name="strava_gear_id"
                  defaultValue={bike.strava_gear_id ?? ""}
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
              // The hint line carries the way out, rather than a control on the
              // select's row. Only while this bike has nothing linked: once it
              // does, the question the trigger asks has been answered and the
              // link would be clutter on a finished field. Reading it from the
              // row and not from the select's current value is what keeps the
              // select uncontrolled.
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-xs text-muted-foreground">{dict.bikes.form.stravaDescription}</p>
                {!isStravaLinked && (
                  <StravaGearHelp
                    trigger={dict.bikes.form.stravaGearHelp.trigger}
                    title={dict.bikes.form.stravaGearHelp.title}
                    lead={dict.bikes.form.stravaGearHelp.lead}
                    appStep={dict.bikes.form.stravaGearHelp.appStep}
                    webStep={dict.bikes.form.stravaGearHelp.webStep}
                    openLabel={dict.bikes.form.stravaGearHelp.open}
                    refreshLabel={dict.bikes.form.stravaGearHelp.refresh}
                  />
                )}
              </div>
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

          <BikeOptionalFields
            labels={bikeOptionalFieldLabels(dict)}
            defaults={{
              serial_number: bike.serial_number,
              year: bike.year,
              purchase_date: bike.purchase_date,
              warranty: bike.warranty,
              frame_size: bike.frame_size,
              color: bike.color,
              wheel_size: bike.wheel_size,
              notes: bike.notes,
            }}
          />
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6 sm:mt-6 sm:pt-0">
          <SubmitButton className="w-full">{dict.bikes.form.saveEdit}</SubmitButton>
          <Button
            render={<Link href={`/bikes/${bike.id}`} />}
            nativeButton={false}
            type="button"
            variant="outline"
            className="w-full"
          >
            {dict.bikes.form.cancel}
          </Button>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-destructive/30 bg-card p-6">
        <p className="text-sm font-semibold">{dict.bikes.form.deleteTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {dict.bikes.form.deleteDesc(bike.name, componentCount ?? 0)}
        </p>
        <div className="mt-4">
          <DeleteConfirmButton
            action={deleteBike.bind(null, bike.id)}
            title={dict.bikes.form.deleteConfirmTitle}
            description={dict.bikes.form.deleteConfirmDesc(bike.name, componentCount ?? 0)}
            triggerLabel={dict.bikes.form.deleteButton}
            cancelLabel={dict.bikes.form.cancel}
          />
        </div>
      </div>
    </div>
  );
}
