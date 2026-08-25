import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createIntervention } from "@/lib/actions/interventions";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InterventionDateField } from "@/components/intervention-date-field";
import { ResetIntervalToggle } from "@/components/reset-interval-toggle";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { calculateComponentUsage } from "@/lib/maintenance/calculation";
import { kmToUnit } from "@/lib/format";
import { INTERVENTION_TYPE_ICON } from "@/lib/intervention-type";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

export default async function NewInterventionPage({
  params,
  searchParams,
}: {
  params: Promise<{ bikeId: string; componentId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { bikeId, componentId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  // Independent of each other (both keyed off the URL's ids) — one round trip.
  const [{ data: userData }, { data: bike }, { data: component }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("bikes").select("id, name, total_km, total_hours").eq("id", bikeId).single(),
    supabase
      .from("components")
      .select("id, name, bike_km_at_install, bike_hours_at_install")
      .eq("id", componentId)
      .eq("bike_id", bikeId)
      .single(),
  ]);

  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";

  if (!bike) notFound();
  if (!component) notFound();

  const usage = calculateComponentUsage({
    bikeTotalKm: bike.total_km,
    bikeTotalHours: bike.total_hours,
    bikeKmAtInstall: component.bike_km_at_install,
    bikeHoursAtInstall: component.bike_hours_at_install,
  });
  const hoursUsedValue = usage.hours != null ? Math.round(usage.hours * 10) / 10 : "";
  const kmsValue = usage.km != null ? Math.round(kmToUnit(usage.km, distanceUnit) * 10) / 10 : "";

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
        <Link href={`/bikes/${bike.id}/components/${component.id}`} className="hover:text-foreground">
          {component.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{dict.components.detail.logIntervention}</span>
      </div>

      <FormError message={error} />

      <form
        action={createIntervention.bind(null, bike.id, component.id)}
        className={`flex flex-1 flex-col rounded-lg bg-card p-6 sm:block ${DARK_CARD_HAIRLINE}`}
      >
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold">{dict.interventions.form.addTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.interventions.form.addSubtitle(component.name)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{dict.interventions.form.type}</Label>
            <div className="flex gap-2">
              {(["service", "repair", "replacement"] as const).map((type, i) => {
                const Icon = INTERVENTION_TYPE_ICON[type];
                return (
                  <label
                    key={type}
                    className="flex h-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-sm border border-input text-sm font-semibold has-checked:border-transparent has-checked:bg-foreground has-checked:text-background"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={type}
                      defaultChecked={i === 0}
                      className="sr-only"
                    />
                    <Icon className="size-4" />
                    {dict.interventionType[type]}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">{dict.interventions.form.description}</Label>
            <Input
              id="description"
              name="description"
              placeholder={dict.interventions.form.descriptionPlaceholder}
              required
            />
          </div>

          <InterventionDateField
            label={dict.interventions.form.date}
            todayLabel={dict.interventions.form.dateToday}
            yesterdayLabel={dict.interventions.form.dateYesterday}
            customLabel={dict.interventions.form.dateCustom}
          />
          <div className="hidden sm:block" />

          <div className="grid grid-cols-2 gap-5 sm:contents">
            <div className="space-y-1.5">
              <Label htmlFor="hours_used">{dict.interventions.form.hoursOfUse}</Label>
              <Input
                id="hours_used"
                name="hours_used"
                type="number"
                step="0.1"
                defaultValue={hoursUsedValue}
                placeholder={dict.interventions.form.optional}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kms">{dict.interventions.form.distance(distanceUnit)}</Label>
              <Input
                id="kms"
                name="kms"
                type="number"
                step="0.1"
                defaultValue={kmsValue}
                placeholder={dict.interventions.form.optional}
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{dict.interventions.form.notes}</Label>
            <Textarea id="notes" name="notes" placeholder={dict.interventions.form.notesPlaceholder} />
          </div>

          <ResetIntervalToggle
            title={dict.interventions.form.maintenanceTitle}
            label={dict.interventions.form.resetInterval}
          />
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6 sm:mt-6 sm:pt-0">
          <SubmitButton className="w-full">{dict.interventions.form.saveNew}</SubmitButton>
          <Button
            render={<Link href={`/bikes/${bike.id}/components/${component.id}`} />}
            nativeButton={false}
            type="button"
            variant="outline"
            className="w-full"
          >
            {dict.interventions.form.cancel}
          </Button>
        </div>
      </form>
    </div>
  );
}
