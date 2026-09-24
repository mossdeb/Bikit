/**
 * The bike a session is put on, as the form says it (2026-09-24): one of
 * the account's, a new one by name — the group select's own shape, so a
 * bike the rider has not registered yet can be named at import and
 * created on save — or none. Only a name here: the bike's type, brand and
 * year are the app's forms' business, on the bike's own page.
 */

/** The bike select's "name one below" value — a string no id is. */
export const NEW_BIKE = "__new_bike__";

export type ImuSessionBikeRef = { id: string } | { name: string } | null;

export function bikeRefFromForm(
  bikeId: string,
  newBikeName: string,
): ImuSessionBikeRef {
  if (bikeId === NEW_BIKE) {
    const name = newBikeName.trim();
    return name ? { name } : null;
  }
  return bikeId ? { id: bikeId } : null;
}

/** Whether the bike fields are in a state that can be saved. */
export function bikeFormValid(bikeId: string, newBikeName: string): boolean {
  return bikeId !== NEW_BIKE || newBikeName.trim().length > 0;
}
