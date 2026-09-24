"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { NEW_GROUP, groupLabel, type ImuGroupOption } from "@/lib/imu/groups";
import { NEW_BIKE } from "@/lib/imu/bike-ref";
import { useProDict, useProLocale } from "@/components/pro-locale";

export interface BikeOption {
  id: string;
  name: string;
}

/** The rider select's "name one below" value — a string no rider is
 * called, the group select's own trick. */
const NEW_RIDER = "__new_rider__";

/** The riders the account knows: the account's own name first, then the
 * ones its sessions were ridden by, most recent first, each once. */
export function riderOptions(
  riderDefault: string,
  riders: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [riderDefault, ...riders]) {
    const name = r.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * The questions asked of every session — what it is called, who rode it,
 * which bike carried the sensor, which group of the day it belongs to —
 * shared by the two ways a session gets in (a file from disk, a transfer
 * from the device) and by the settings dialog that fixes them afterwards,
 * so the three cannot drift into asking differently.
 *
 * The rider is prefilled with the account's name; left empty, the server
 * writes that same name back, so a blank field never costs a session its
 * rider. With `riders` given — the names the account's sessions were
 * ridden by — the field is a list of them with "New rider…" at the end,
 * which opens a name field, the group select's own shape (by request,
 * 2026-09-24); without, a plain text field.
 *
 * The group fields render only when `groups` is given. The labels come
 * from the Pro dictionary (`importing.fields`), read off the provider the
 * Pro layout mounts — the three callers pass no strings.
 */
export function ImuSessionDetailsFields({
  idPrefix,
  name,
  onNameChange,
  rider,
  onRiderChange,
  riderDefault,
  bikeId,
  onBikeIdChange,
  bikes,
  groups,
  groupId = "",
  onGroupIdChange,
  newGroupName = "",
  onNewGroupNameChange,
  riders,
  newBikeName = "",
  onNewBikeNameChange,
}: {
  idPrefix: string;
  name: string;
  onNameChange: (value: string) => void;
  rider: string;
  onRiderChange: (value: string) => void;
  riderDefault: string;
  /** The names the account's sessions were ridden by, most recent first.
   * Present where the rider can be picked from a list. */
  riders?: readonly string[];
  /** A bike id, "" for none, or NEW_BIKE for "name one below". */
  bikeId: string;
  onBikeIdChange: (value: string) => void;
  bikes: BikeOption[];
  newBikeName?: string;
  onNewBikeNameChange?: (value: string) => void;
  /** Newest first. Present only where a group can be chosen. */
  groups?: ImuGroupOption[];
  /** A group id, "" for none, or NEW_GROUP for "name one below". */
  groupId?: string;
  onGroupIdChange?: (value: string) => void;
  newGroupName?: string;
  onNewGroupNameChange?: (value: string) => void;
}) {
  const t = useProDict().importing.fields;
  const locale = useProLocale();
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>{t.name}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-rider`}>{t.rider}</Label>
        {riders ? (
          <RiderPicker
            id={`${idPrefix}-rider`}
            rider={rider}
            onRiderChange={onRiderChange}
            options={riderOptions(riderDefault, riders)}
          />
        ) : (
          <Input
            id={`${idPrefix}-rider`}
            value={rider}
            onChange={(event) => onRiderChange(event.target.value)}
            placeholder={riderDefault}
          />
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-bike`}>{t.bike}</Label>
        <NativeSelect
          id={`${idPrefix}-bike`}
          value={bikeId}
          onChange={(event) => onBikeIdChange(event.target.value)}
        >
          <option value="">{t.noBike}</option>
          {bikes.map((bike) => (
            <option key={bike.id} value={bike.id}>
              {bike.name}
            </option>
          ))}
          {/* A bike not registered yet, by name — created on save, the
              group's way (by request, 2026-09-24). */}
          <option value={NEW_BIKE}>{t.newBike}</option>
        </NativeSelect>
        {bikeId === NEW_BIKE && (
          <Input
            id={`${idPrefix}-bike-name`}
            aria-label={t.newBikeName}
            value={newBikeName}
            onChange={(event) => onNewBikeNameChange?.(event.target.value)}
            placeholder="YT Decoy"
            autoFocus
          />
        )}
      </div>
      {groups && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-group`}>{t.group}</Label>
          {/* The day's outing this session belongs to. Existing groups
              first, newest at the top — the one from today is preselected
              by the caller — and "new" at the end, which opens a name
              field. The day of a new group is the browser's today. */}
          <NativeSelect
            id={`${idPrefix}-group`}
            value={groupId}
            onChange={(event) => onGroupIdChange?.(event.target.value)}
          >
            <option value="">{t.noGroup}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {groupLabel(group, locale)}
              </option>
            ))}
            <option value={NEW_GROUP}>{t.newGroup}</option>
          </NativeSelect>
          {groupId === NEW_GROUP && (
            <Input
              id={`${idPrefix}-group-name`}
              aria-label={t.newGroupName}
              value={newGroupName}
              onChange={(event) => onNewGroupNameChange?.(event.target.value)}
              placeholder="Fonte Ferrea"
              autoFocus
            />
          )}
        </div>
      )}
    </>
  );
}

/**
 * The list of known riders with "New rider…" at its end. The value the
 * parent holds is the rider's NAME either way: a pick sets it to the
 * name picked, "new" clears it and opens the field, and what is typed
 * there is the name. `naming` remembers that "new" was chosen, since an
 * empty name alone would read as the account's own (the first option).
 */
function RiderPicker({
  id,
  rider,
  onRiderChange,
  options,
}: {
  id: string;
  rider: string;
  onRiderChange: (value: string) => void;
  options: string[];
}) {
  const t = useProDict().importing.fields;
  const [naming, setNaming] = useState(false);
  const known = options.includes(rider.trim());
  // A name the list does not have — a session's rider from before the
  // list existed — is shown in the field, as if "new" had been chosen.
  const typing = naming || (rider.trim() !== "" && !known);
  const value = typing ? NEW_RIDER : rider.trim() || options[0];
  return (
    <>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => {
          if (event.target.value === NEW_RIDER) {
            setNaming(true);
            onRiderChange("");
          } else {
            setNaming(false);
            onRiderChange(event.target.value);
          }
        }}
      >
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={NEW_RIDER}>{t.newRider}</option>
      </NativeSelect>
      {typing && (
        <Input
          id={`${id}-name`}
          aria-label={t.newRiderName}
          value={rider}
          onChange={(event) => onRiderChange(event.target.value)}
          placeholder={t.riderNamePlaceholder}
          autoFocus
        />
      )}
    </>
  );
}
