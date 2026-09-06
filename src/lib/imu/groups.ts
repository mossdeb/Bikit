/**
 * Groups of sessions — one outing, one place, one day. What the list folds
 * sessions under and what the import dialog offers as "the group this one
 * goes in". Only a name and a day: the same name on another day is another
 * group.
 */

export interface ImuGroupOption {
  id: string;
  name: string;
  /** YYYY-MM-DD, the rider's local day when the group was created. */
  day: string;
}

/** The select's value for "type a new group's name below". */
export const NEW_GROUP = "__new__";

/** What the server is told about the group: an existing one, a new one
 * (with the browser's local day, because only the browser knows it), or
 * none. */
export type ImuSessionGroupRef =
  { id: string } | { name: string; day: string } | null;

/** Today as the browser sees it, YYYY-MM-DD. Not `toISOString`, which is
 * UTC and turns a 00:10 import in Lisbon summer into yesterday. */
export function localDay(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-09-06" → "6.9.26": the short form the group header uses, no
 * zero padding, because the header is a label and not a table column. */
export function formatGroupDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return `${d}.${m}.${String(y).slice(-2)}`;
}

export function groupLabel(group: ImuGroupOption): string {
  return `${group.name} · ${formatGroupDay(group.day)}`;
}

/**
 * The group the import dialog preselects: the most recent one created today,
 * so the second session of an outing lands beside the first without a
 * click. `groups` arrive newest first, so the first match is the answer.
 * Nothing today → none preselected.
 */
export function defaultGroupId(
  groups: ImuGroupOption[],
  today = localDay(),
): string {
  return groups.find((g) => g.day === today)?.id ?? "";
}

/** Turns the form's two fields into what the server action takes. */
export function groupRefFromForm(
  groupId: string,
  newGroupName: string,
): ImuSessionGroupRef {
  if (groupId === NEW_GROUP) {
    const name = newGroupName.trim();
    return name ? { name, day: localDay() } : null;
  }
  return groupId ? { id: groupId } : null;
}

/** Whether the group fields are in a state that can be saved. */
export function groupFormValid(groupId: string, newGroupName: string): boolean {
  return groupId !== NEW_GROUP || newGroupName.trim().length > 0;
}
