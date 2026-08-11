"use client";

import { useState } from "react";
import { warrantyYears } from "@/lib/warranty";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

type FieldKey =
  | "serial_number"
  | "year"
  | "purchase_date"
  | "warranty"
  | "frame_size"
  | "color"
  | "wheel_size"
  | "notes";

export interface BikeOptionalFieldDefaults {
  serial_number?: string | null;
  year?: number | null;
  purchase_date?: string | null;
  warranty?: string | null;
  frame_size?: string | null;
  color?: string | null;
  wheel_size?: string | null;
  notes?: string | null;
}

// Plain strings only — this component is a client component, and the full
// Dictionary object can't cross the server/client boundary (it also holds
// function-valued entries for unrelated sections, which React can't
// serialize as props).
export interface BikeOptionalFieldLabels {
  serialNumber: string;
  year: string;
  purchaseDate: string;
  warranty: string;
  warrantyPlaceholder: string;
  frameSize: string;
  frameSizePlaceholder: string;
  color: string;
  colorPlaceholder: string;
  wheelSize: string;
  wheelSizePlaceholder: string;
  notes: string;
  notesPlaceholder: string;
  optional: string;
  addDetailsLabel: string;
  addDetailsTitle: string;
  addDetailsSubtitle: string;
  addDetailsSave: string;
}

// Order the fields appear in the checkbox picker — matches the approved mockup.
const CHECKBOX_ORDER: FieldKey[] = [
  "serial_number",
  "year",
  "purchase_date",
  "warranty",
  "frame_size",
  "color",
  "wheel_size",
  "notes",
];

// Order the fields appear once activated in the form. Serial Number and
// Notes span the full width; the rest pair up two-per-row via grid
// auto-flow, so whichever subset is active reflows correctly on its own.
const FIELD_ORDER: FieldKey[] = [
  "serial_number",
  "purchase_date",
  "warranty",
  "year",
  "frame_size",
  "color",
  "wheel_size",
  "notes",
];

const FULL_WIDTH_FIELDS = new Set<FieldKey>(["serial_number", "notes"]);

export function BikeOptionalFields({
  labels,
  defaults = {},
  omit,
}: {
  labels: BikeOptionalFieldLabels;
  defaults?: BikeOptionalFieldDefaults;
  /** Fields the surrounding form already asks for. The create form promotes
   * the year to its first step, and the same `name="year"` twice in one
   * form would submit two values. */
  omit?: FieldKey[];
}) {
  const hidden = new Set(omit ?? []);
  const fieldConfig: Record<
    FieldKey,
    { label: string; placeholder?: string; type?: string; min?: number; step?: number }
  > = {
    serial_number: { label: labels.serialNumber, placeholder: labels.optional },
    year: { label: labels.year, type: "number" },
    purchase_date: { label: labels.purchaseDate, type: "date" },
    warranty: { label: labels.warranty, placeholder: labels.warrantyPlaceholder, type: "number", min: 0, step: 0.5 },
    frame_size: { label: labels.frameSize, placeholder: labels.frameSizePlaceholder },
    color: { label: labels.color, placeholder: labels.colorPlaceholder },
    wheel_size: { label: labels.wheelSize, placeholder: labels.wheelSizePlaceholder },
    notes: { label: labels.notes, placeholder: labels.notesPlaceholder },
  };

  const initialActive = new Set(
    CHECKBOX_ORDER.filter((key) => {
      if (hidden.has(key)) return false;
      const value = defaults[key];
      return value != null && value !== "";
    })
  );

  const [activeFields, setActiveFields] = useState(initialActive);
  const [pendingFields, setPendingFields] = useState(initialActive);
  const [open, setOpen] = useState(false);

  return (
    <>
      {FIELD_ORDER.filter((key) => activeFields.has(key) && !hidden.has(key)).map((key) => {
        const { label, placeholder, type, min, step } = fieldConfig[key];
        const fullWidth = FULL_WIDTH_FIELDS.has(key);
        // Warranty is stored as text (the column predates the numeric field),
        // so a legacy "2 anos" has to come back as a number for the input.
        const defaultValue = key === "warranty" ? warrantyYears(defaults.warranty) ?? "" : defaults[key] ?? "";
        return (
          <div key={key} className={fullWidth ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
            <Label htmlFor={key}>{label}</Label>
            {key === "notes" ? (
              <Textarea id={key} name={key} placeholder={placeholder} defaultValue={defaults.notes ?? ""} />
            ) : (
              <Input
                id={key}
                name={key}
                type={type ?? "text"}
                min={min}
                step={step}
                placeholder={placeholder}
                defaultValue={defaultValue}
              />
            )}
          </div>
        );
      })}

      <div className="sm:col-span-2">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (next) setPendingFields(new Set(activeFields));
            setOpen(next);
          }}
        >
          <DialogTrigger
            type="button"
            className="flex h-[52px] w-full items-center justify-between rounded-[12px] border border-dashed border-input px-5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40"
          >
            {labels.addDetailsLabel}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-input">
              <Plus className="size-4" />
            </span>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{labels.addDetailsTitle}</DialogTitle>
              <DialogDescription>{labels.addDetailsSubtitle}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2.5">
              {CHECKBOX_ORDER.filter((key) => !hidden.has(key)).map((key) => {
                const checked = pendingFields.has(key);
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-sm bg-muted px-3.5 py-3 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        setPendingFields((prev) => {
                          const updated = new Set(prev);
                          if (next) updated.add(key);
                          else updated.delete(key);
                          return updated;
                        });
                      }}
                    />
                    {fieldConfig[key].label}
                  </label>
                );
              })}
            </div>

            <DialogClose
              render={
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setActiveFields(new Set(pendingFields))}
                >
                  {labels.addDetailsSave}
                </Button>
              }
            />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
