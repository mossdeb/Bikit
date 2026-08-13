import Link from "next/link";
import { notFound } from "next/navigation";
import { getBikeIndexManufacturers } from "@/lib/bikeindex";
import { createClient } from "@/lib/supabase/server";
import { updateComponent, deleteComponent } from "@/lib/actions/components";
import { COMPONENT_CATEGORIES, COMPONENT_NAME_SUGGESTIONS } from "@/lib/constants";
import { BrandField } from "@/components/brand-field";
import { IntervalFieldGroup, type IntervalSlotDefault } from "@/components/interval-field";
import { FormError } from "@/components/form-error";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ComponentOptionalFields } from "@/components/component-optional-fields";
import { componentOptionalFieldLabels } from "@/lib/component-optional-field-labels";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { categoryLabel } from "@/lib/component-category";
import { kmToUnit } from "@/lib/format";
import type { IntervalType } from "@/lib/validations/component.schema";

export default async function EditComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ bikeId: string; componentId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { bikeId, componentId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  // Independent of each other (bike/component/intervals are keyed off the
  // URL's ids, manufacturers is an external API call) — fired together.
  const [{ data: userData }, { data: bike }, { data: component }, { data: intervals }, manufacturers] =
    await Promise.all([
      supabase.auth.getClaims(),
      supabase.from("bikes").select("id, name, purchase_date").eq("id", bikeId).single(),
      supabase.from("components").select("*").eq("id", componentId).eq("bike_id", bikeId).single(),
      supabase
        .from("component_service_intervals")
        // `includes` is read for one reason: updateComponent replaces the whole
        // interval set from the form, so anything this query doesn't fetch is
        // erased the first time someone edits the part.
        .select("name, interval_type, interval_value, includes")
        .eq("component_id", componentId)
        .order("slot"),
      getBikeIndexManufacturers(),
    ]);

  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));

  if (!bike) notFound();
  if (!component) notFound();

  const intervalDefaults: IntervalSlotDefault[] = (intervals ?? []).map((interval) => ({
    name: interval.name,
    type: interval.interval_type as IntervalType,
    value:
      interval.interval_type === "km"
        ? Math.round(kmToUnit(interval.interval_value, distanceUnit) * 10) / 10
        : interval.interval_value,
    includes: interval.includes,
  }));

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
        <span className="text-foreground">{dict.components.form.editBreadcrumb}</span>
      </div>

      <FormError message={error} />

      <form
        action={updateComponent.bind(null, bike.id, component.id)}
        className="flex flex-1 flex-col rounded-lg bg-card p-6 sm:block"
      >
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold">{dict.components.form.editTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dict.components.form.editSubtitle(component.name)}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="category">{dict.components.form.category}</Label>
            <NativeSelect
              id="category"
              name="category"
              required
              defaultValue={component.category ?? COMPONENT_CATEGORIES[0]}
            >
              {COMPONENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(dict, c)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <BrandField manufacturers={manufacturers} defaultValue={component.brand} dict={dict} required />

          <div className="space-y-1.5">
            <Label htmlFor="model">{dict.components.form.model}</Label>
            <Input id="model" name="model" required defaultValue={component.model ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">{dict.components.form.name}</Label>
            <Input
              id="name"
              name="name"
              list="component-suggestions"
              autoComplete="off"
              defaultValue={component.name}
            />
            <datalist id="component-suggestions">
              {COMPONENT_NAME_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <IntervalFieldGroup
            defaults={intervalDefaults}
            hint={dict.components.form.intervalHint}
            nameLabel={dict.components.form.intervalNameLabel}
            namePlaceholder={dict.components.form.intervalNamePlaceholder}
            kmLabel={dict.components.form.intervalTypeKm(distanceUnit)}
            hoursLabel={dict.components.form.intervalTypeHours}
            monthsLabel={dict.components.form.intervalTypeMonths}
            reminderToggleLabel={dict.components.form.reminderToggleLabel}
            addAnotherLabel={dict.components.form.addAnotherReminder}
          />

          {/* The install date is set when the part is added and isn't offered
              here. It still has to be submitted: the action parses the whole
              form, and a missing field reads as an empty one — optionalText
              turns that into null, so leaving it out would quietly wipe the
              stored date on every save, taking the months-based reminders and
              the part's timeline entry with it. */}
          <input type="hidden" name="install_date" value={component.install_date ?? ""} />

          <ComponentOptionalFields
            labels={componentOptionalFieldLabels(dict)}
            defaults={{
              serial_number: component.serial_number,
              purchase_date: component.purchase_date,
              warranty: component.warranty,
              year: component.year,
              notes: component.notes,
            }}
          />
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6 sm:mt-6 sm:pt-0">
          <SubmitButton className="w-full">{dict.components.form.saveEdit}</SubmitButton>
          <Button
            render={<Link href={`/bikes/${bike.id}/components/${component.id}`} />}
            nativeButton={false}
            type="button"
            variant="outline"
            className="w-full"
          >
            {dict.components.form.cancel}
          </Button>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-destructive/30 bg-card p-6">
        <p className="text-sm font-semibold">{dict.components.form.deleteTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{dict.components.form.deleteDesc(component.name)}</p>
        {/* Archiving itself lives on the component's own page now, but it is
            still named here — this is where someone lands when they want a part
            gone, and an alternative offered at the moment of the decision is
            found every time. The line says where to go, since the button that
            used to sit above this card is no longer here. */}
        {!component.retired_at && (
          <p className="mt-2 text-sm text-muted-foreground">{dict.components.form.deleteOrArchive}</p>
        )}
        <div className="mt-4">
          <DeleteConfirmButton
            action={deleteComponent.bind(null, bike.id, component.id)}
            title={dict.components.form.deleteConfirmTitle}
            description={dict.components.form.deleteConfirmDesc(component.name)}
            triggerLabel={dict.components.form.deleteButton}
            cancelLabel={dict.components.form.cancel}
          />
        </div>
      </div>
    </div>
  );
}
