import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBikeIndexManufacturers } from "@/lib/bikeindex";
import { createClient } from "@/lib/supabase/server";
import { createComponent } from "@/lib/actions/components";
import { COMPONENT_CATEGORIES, COMPONENT_NAME_SUGGESTIONS } from "@/lib/constants";
import { BrandField } from "@/components/brand-field";
import { IntervalFieldGroup } from "@/components/interval-field";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ComponentOptionalFields } from "@/components/component-optional-fields";
import { ComponentInstallFields } from "@/components/component-install-fields";
import { componentOptionalFieldLabels } from "@/lib/component-optional-field-labels";
import { NewComponentWizard } from "@/components/new-component-wizard";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { categoryLabel } from "@/lib/component-category";
import { kmToUnit } from "@/lib/format";

export default async function NewComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ bikeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { bikeId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  // Independent of each other (bike is keyed off the URL's id, manufacturers
  // is an external API call) — fired together instead of one after another.
  const [{ data: userData }, { data: bike }, manufacturers] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("bikes").select("id, name, type, total_km, total_hours, purchase_date").eq("id", bikeId).single(),
    getBikeIndexManufacturers(),
  ]);

  const distanceUnit = ((userData?.claims?.user_metadata?.distance_unit as string) ?? "km") as "km" | "mi";
  const dict = getDictionary(localeFromMetadata(userData?.claims?.user_metadata));

  if (!bike) notFound();

  const step1 = (
    <Fragment key="step-1">
      <div className="space-y-1.5">
        <Label htmlFor="category">{dict.components.form.category}</Label>
        <NativeSelect
          id="category"
          name="category"
          required
          defaultValue={COMPONENT_CATEGORIES[0]}
        >
          {COMPONENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(dict, c)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <BrandField manufacturers={manufacturers} dict={dict} required />

      <div className="space-y-1.5">
        <Label htmlFor="model">{dict.components.form.model}</Label>
        <Input id="model" name="model" required placeholder={dict.components.form.modelPlaceholder} />
      </div>

      {/* Up from the optional details, because this is where it earns its
          keep: the curated library is keyed per model year, and the year is
          what makes the lookup pick the right generation. Still optional —
          without it the nearest listed year is used. */}
      <div className="space-y-1.5">
        <Label htmlFor="year">{dict.components.form.year}</Label>
        <Input id="year" name="year" type="number" min={1990} max={new Date().getFullYear() + 1} />
      </div>
    </Fragment>
  );

  const step2 = (
    <Fragment key="step-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">{dict.components.form.name}</Label>
        <Input
          id="name"
          name="name"
          list="component-suggestions"
          autoComplete="off"
          placeholder={dict.components.form.namePlaceholder}
        />
        <datalist id="component-suggestions">
          {COMPONENT_NAME_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <ComponentInstallFields
        dateLabel={dict.components.form.installDate}
        todayLabel={dict.components.form.installDateToday}
        bikeLabel={dict.components.form.installDateBike}
        customLabel={dict.components.form.installDateCustom}
        notSetLabel={dict.components.form.installDateNotSet}
        withBikeLabel={dict.components.form.installDateWithBike}
        kmLabel={dict.components.form.totalDistance(distanceUnit)}
        hoursLabel={dict.components.form.totalHours}
        usageHint={dict.components.form.totalUsageHint}
        bikePurchaseDate={bike.purchase_date}
        bikeTotalKm={bike.total_km != null ? kmToUnit(bike.total_km, distanceUnit) : null}
        bikeTotalHours={bike.total_hours}
      />

      <ComponentOptionalFields labels={componentOptionalFieldLabels(dict)} omit={["year"]} />
    </Fragment>
  );

  const step3 = (
    <IntervalFieldGroup
      key="step-3"
      startWithReminder
      hint={dict.components.form.intervalHint}
      nameLabel={dict.components.form.intervalNameLabel}
      namePlaceholder={dict.components.form.intervalNamePlaceholder}
      kmLabel={dict.components.form.intervalTypeKm(distanceUnit)}
      hoursLabel={dict.components.form.intervalTypeHours}
      monthsLabel={dict.components.form.intervalTypeMonths}
      reminderToggleLabel={dict.components.form.reminderToggleLabel}
      addAnotherLabel={dict.components.form.addAnotherReminder}
      suggestionNote={dict.components.form.intervalSuggestionNote}
      intervalNames={dict.components.intervalNames}
    />
  );

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
        <span className="text-foreground">{dict.bikes.detail.addComponent}</span>
      </div>

      <FormError message={error} />

      <NewComponentWizard
        action={createComponent.bind(null, bike.id)}
        title={dict.components.form.addTitle}
        desktopSubtitle={dict.components.form.addSubtitle(bike.name)}
        stepSubtitles={[
          dict.components.form.wizardStep1Subtitle,
          dict.components.form.wizardStep2Subtitle,
          dict.components.form.wizardStep3Subtitle,
        ]}
        stepLabels={[
          dict.components.form.wizardStep1Label,
          dict.components.form.wizardStep2Label,
          dict.components.form.wizardStep3Label,
        ]}
        cancelHref={`/bikes/${bike.id}`}
        nextLabel={dict.bikes.form.wizardNext}
        backLabel={dict.bikes.form.wizardBack}
        cancelLabel={dict.components.form.cancel}
        saveLabel={dict.components.form.saveNew}
        steps={[step1, step2, step3]}
        bikeType={bike.type ?? "Other"}
      />
    </div>
  );
}
