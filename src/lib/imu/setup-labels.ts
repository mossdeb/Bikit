/**
 * What the bike calls the parts a setup is about — its fork and shock by
 * brand and model, its tyres front and rear — from the components the
 * rider registered on it. The setup form heads its blocks with them, and
 * a page that shows a setup says "Fox 38" instead of "Garfo". Null where
 * the bike has none registered. Shared by the analysis page and the
 * report (2026-09-14), which both open the setup form.
 */
export interface SetupComponentRow {
  category: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
}

/** The component categories a setup reads its labels from. */
export const SETUP_COMPONENT_CATEGORIES = [
  "Front Suspension (Fork)",
  "Rear Suspension",
  "Tire",
];

export function setupLabelsOf(rows: SetupComponentRow[] | null | undefined): {
  fork: string | null;
  shock: string | null;
  tireFront: string | null;
  tireRear: string | null;
} {
  const list = rows ?? [];
  const labelOf = (c: SetupComponentRow | undefined) => {
    if (!c) return null;
    const brandModel = [c.brand, c.model].filter(Boolean).join(" ").trim();
    return brandModel || c.name || null;
  };
  // The tyres, front and rear: told apart by a "(front)"/"(rear)" or
  // "frente"/"trás" in the name when the bike has two, the first one for
  // both when it has one and says nothing.
  const tires = list.filter((c) => c.category === "Tire");
  const isFront = (c: SetupComponentRow) =>
    /front|frente|dianteir/i.test(c.name ?? "");
  const isRear = (c: SetupComponentRow) =>
    /rear|tr[aá]s|traseir/i.test(c.name ?? "");
  return {
    fork: labelOf(list.find((c) => c.category === "Front Suspension (Fork)")),
    shock: labelOf(list.find((c) => c.category === "Rear Suspension")),
    tireFront: labelOf(tires.find(isFront) ?? tires[0]),
    tireRear: labelOf(tires.find(isRear) ?? tires[1] ?? tires[0]),
  };
}
