"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export interface BikeOption {
  id: string;
  name: string;
}

/**
 * The three questions asked of every session before it is saved — what it is
 * called, who rode it, which bike carried the sensor — shared by the two ways
 * a session gets in (a file from disk, a transfer from the device), so the
 * two paths cannot drift into asking differently.
 *
 * The rider is prefilled with the account's name and clearable: left empty,
 * the server writes that same name back, so a blank field never costs a
 * session its rider.
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
    </>
  );
}
