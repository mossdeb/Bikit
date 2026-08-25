import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateIntervention, deleteIntervention } from "@/lib/actions/interventions";
import { FormError } from "@/components/form-error";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InterventionDateField } from "@/components/intervention-date-field";
import { ResetIntervalToggle } from "@/components/reset-interval-toggle";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { kmToUnit } from "@/lib/format";
import { INTERVENTION_TYPE_ICON } from "@/lib/intervention-type";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

export default async function EditInterventionPage({
  params,
  searchParams,
}: {
  params: Promise<{ bikeId: string; componentId: string; interventionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { bikeId, componentId, interventionId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  // Independent of each other (all keyed off the URL's ids) — one round trip.
  const [{ data: userData }, { data: bike }, { data: component }, { data: intervention }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("bikes").select("id, name").eq("id", bikeId).single(),
    supabase.from("components").select("id, name").eq("id", componentId).eq("bike_id", bikeId).single(),
    supabase.from("interventions").select("*").eq("id", interventionId).eq("component_id", componentId).single(),
  ]);

  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));
  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";

  if (!bike) notFound();
  if (!component) notFound();
  if (!intervention) notFound();

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
        <span className="text-foreground">{dict.interventions.form.editBreadcrumb}</span>
      </div>

      <FormError message={error} />

      <form
        action={updateIntervention.bind(null, bike.id, component.id, intervention.id)}
        className={`flex flex-1 flex-col rounded-lg bg-card p-6 sm:block ${DARK_CARD_HAIRLINE}`}
      >
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold">{dict.interventions.form.editTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.interventions.form.editSubtitle(component.name)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{dict.interventions.form.type}</Label>
            <div className="flex gap-2">
              {(["service", "repair", "replacement"] as const).map((type) => {
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
                      defaultChecked={intervention.type === type}
                      className="sr-only"
                    />
                    <Icon className="size-4" />
                    {dict.interventionType[type]}
                  </label>
                );
              })}
            </div>
          </div>

          <InterventionDateField
            label={dict.interventions.form.date}
            todayLabel={dict.interventions.form.dateToday}
            yesterdayLabel={dict.interventions.form.dateYesterday}
            customLabel={dict.interventions.form.dateCustom}
            defaultValue={intervention.date}
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
                defaultValue={intervention.hours_used ?? ""}
                readOnly
                className="cursor-not-allowed bg-muted/50 text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kms">{dict.interventions.form.distance(distanceUnit)}</Label>
              <Input
                id="kms"
                name="kms"
                type="number"
                step="0.1"
                defaultValue={intervention.kms != null ? Math.round(kmToUnit(intervention.kms, distanceUnit) * 10) / 10 : ""}
                readOnly
                className="cursor-not-allowed bg-muted/50 text-muted-foreground"
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">{dict.interventions.form.description}</Label>
            <Input
              id="description"
              name="description"
              defaultValue={intervention.description ?? ""}
              required
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{dict.interventions.form.notes}</Label>
            <Textarea id="notes" name="notes" defaultValue={intervention.notes ?? ""} />
          </div>

          <ResetIntervalToggle
            title={dict.interventions.form.maintenanceTitle}
            label={dict.interventions.form.resetInterval}
            defaultChecked={intervention.resets_interval}
          />
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6 sm:mt-6 sm:pt-0">
          <SubmitButton className="w-full">{dict.interventions.form.saveEdit}</SubmitButton>
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

      <div className="mt-6 rounded-lg border border-destructive/30 bg-card p-6">
        <p className="text-sm font-semibold">{dict.interventions.form.deleteTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {dict.interventions.form.deleteDesc(dict.interventionType[intervention.type as "service" | "repair" | "replacement"])}
        </p>
        <div className="mt-4">
          <DeleteConfirmButton
            action={deleteIntervention.bind(null, bike.id, component.id, intervention.id)}
            title={dict.interventions.form.deleteConfirmTitle}
            description={dict.interventions.form.deleteConfirmDesc(
              dict.interventionType[intervention.type as "service" | "repair" | "replacement"],
              component.name
            )}
            triggerLabel={dict.interventions.form.deleteButton}
            cancelLabel={dict.interventions.form.cancel}
          />
        </div>
      </div>
    </div>
  );
}
