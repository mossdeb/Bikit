import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { AiSetupLabels } from "@/components/ai-setup-flow";

/** The plain-string subset the (client-side) AiSetupFlow needs — the full
 * Dictionary can't cross the server/client boundary since it also holds
 * function-valued entries. Same arrangement as bikeOptionalFieldLabels.
 * Count-dependent strings travel as {one, many} "{n}" templates. */
export function aiSetupLabels(dict: Dictionary, distanceUnit: "km" | "mi"): AiSetupLabels {
  const t = dict.bikes.aiSetup;
  return {
    title: t.title,
    subtitle: t.subtitle,
    model: dict.bikes.form.model,
    modelPlaceholder: dict.bikes.form.modelPlaceholder,
    version: t.version,
    versionPlaceholder: t.versionPlaceholder,
    year: t.year,
    searchButton: t.searchButton,
    searching: t.searching,
    searchingHint: t.searchingHint,
    notFoundTitle: t.notFoundTitle,
    notFoundBody: t.notFoundBody,
    createManually: t.createManually,
    quotaTitle: t.quotaTitle,
    quotaBody: t.quotaBody,
    errorBody: t.errorBody,
    foundTitle: t.foundTitle,
    componentsFound: t.componentsFound,
    intervalsConfigured: t.intervalsConfigured,
    source: t.source,
    remainingToday: t.remainingToday,
    every: t.every,
    componentsTitle: t.componentsTitle,
    editHint: t.editHint,
    edit: dict.common.edit,
    include: t.include,
    noIntervals: t.noIntervals,
    maxIntervalsHint: t.maxIntervalsHint,
    category: dict.components.form.category,
    brand: dict.brandField.brand,
    factoryQuestion: t.factoryQuestion,
    factoryHint: t.factoryHint,
    factoryYes: t.factoryYes,
    factoryNo: t.factoryNo,
    totalDistance: t.totalDistance(distanceUnit),
    totalHours: t.totalHours,
    createBike: t.createBike,
    creating: t.creating,
    createError: t.createError,
    next: t.next,
    componentOn: t.componentOn,
    componentOff: t.componentOff,
    stravaStepTitle: t.stravaStepTitle,
    stravaBenefits: t.stravaBenefits,
    stravaSkipHint: t.stravaSkipHint,
    stravaGearLabel: dict.bikes.form.stravaTitle,
    stravaNone: dict.bikes.form.stravaNone,
    stravaConnectLabel: dict.settings.strava.connect,
    cancel: dict.common.cancel,
    back: dict.bikes.form.wizardBack,
    categoryLabels: dict.components.categories,
    intervalNames: dict.components.intervalNames,
  };
}
