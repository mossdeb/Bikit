"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { NEW_GROUP, groupLabel, type ImuGroupOption } from "@/lib/imu/groups";

export interface BikeOption {
  id: string;
  name: string;
}

/**
 * The questions asked of every session — what it is called, who rode it,
 * which bike carried the sensor, which group of the day it belongs to —
 * shared by the two ways a session gets in (a file from disk, a transfer
 * from the device) and by the settings dialog that fixes them afterwards,
 * so the three cannot drift into asking differently.
 *
 * The rider is prefilled with the account's name and clearable: left empty,
 * the server writes that same name back, so a blank field never costs a
 * session its rider.
 *
 * The group fields render only when `groups` is given.
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
}: {
  idPrefix: string;
  name: string;
  onNameChange: (value: string) => void;
  rider: string;
  onRiderChange: (value: string) => void;
  riderDefault: string;
  bikeId: string;
  onBikeIdChange: (value: string) => void;
  bikes: BikeOption[];
  /** Newest first. Present only where a group can be chosen. */
  groups?: ImuGroupOption[];
  /** A group id, "" for none, or NEW_GROUP for "name one below". */
  groupId?: string;
  onGroupIdChange?: (value: string) => void;
  newGroupName?: string;
  onNewGroupNameChange?: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-rider`}>Rider</Label>
        <Input
          id={`${idPrefix}-rider`}
          value={rider}
          onChange={(event) => onRiderChange(event.target.value)}
          placeholder={riderDefault}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-bike`}>Bicicleta (opcional)</Label>
        <NativeSelect
          id={`${idPrefix}-bike`}
          value={bikeId}
          onChange={(event) => onBikeIdChange(event.target.value)}
        >
          <option value="">Sem bicicleta</option>
          {bikes.map((bike) => (
            <option key={bike.id} value={bike.id}>
              {bike.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {groups && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-group`}>Grupo (opcional)</Label>
          {/* The day's outing this session belongs to. Existing groups
              first, newest at the top — the one from today is preselected
              by the caller — and "new" at the end, which opens a name
              field. The day of a new group is the browser's today. */}
          <NativeSelect
            id={`${idPrefix}-group`}
            value={groupId}
            onChange={(event) => onGroupIdChange?.(event.target.value)}
          >
            <option value="">Sem grupo</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {groupLabel(group)}
              </option>
            ))}
            <option value={NEW_GROUP}>Novo grupo…</option>
          </NativeSelect>
          {groupId === NEW_GROUP && (
            <Input
              id={`${idPrefix}-group-name`}
              aria-label="Nome do novo grupo"
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
