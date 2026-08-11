"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlarmIcon, DistanceIcon, HoursIcon, MonthsIcon } from "@/components/interval-icons";
import { useIntervalSuggestion } from "@/components/interval-suggestion";
import type { IntervalSuggestion } from "@/lib/actions/component-intervals";
import type { IntervalType } from "@/lib/validations/component.schema";

const PLACEHOLDER: Record<IntervalType, string> = { km: "800", hours: "50", months: "6" };
const TYPE_ICON: Record<IntervalType, typeof DistanceIcon> = {
  km: DistanceIcon,
  hours: HoursIcon,
  months: MonthsIcon,
};

export interface IntervalSlotDefault {
  name: string;
  type: IntervalType;
  value: number | null;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="absolute inset-0 rounded-full border border-input bg-background transition-colors peer-checked:border-transparent peer-checked:bg-foreground" />
      <span className="absolute left-0.5 size-[18px] rounded-full bg-white shadow transition-transform peer-checked:translate-x-[18px] peer-checked:bg-background" />
    </label>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {label}
      </span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function IntervalSlotFields({
  slot,
  defaultValue,
  nameLabel,
  namePlaceholder,
  kmLabel,
  hoursLabel,
  monthsLabel,
  hint,
}: {
  slot: number;
  defaultValue?: IntervalSlotDefault;
  nameLabel: string;
  namePlaceholder: string;
  kmLabel: string;
  hoursLabel: string;
  monthsLabel: string;
  hint: string;
}) {
  const [type, setType] = useState<IntervalType>(defaultValue?.type ?? "months");
  const TypeIcon = TYPE_ICON[type];

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* Not a NativeSelect: this one shares a bordered box with the type
            icon. The chevron is drawn here for the same reason — 20px from the
            edge, which the browser's own arrow can't be moved to. */}
        <div className="relative flex h-[48px] flex-1 items-center gap-1.5 rounded-sm border border-input bg-transparent px-2.5 dark:bg-input/30">
          <TypeIcon className="size-4 shrink-0 text-foreground" />
          <select
            name={`interval_type_${slot}`}
            value={type}
            onChange={(e) => setType(e.target.value as IntervalType)}
            className="h-full w-full appearance-none bg-transparent pr-8 text-base outline-none"
          >
            <option value="km">{kmLabel}</option>
            <option value="hours">{hoursLabel}</option>
            <option value="months">{monthsLabel}</option>
          </select>
          {/* 19px, not 20: here the border is on the positioning box itself,
              so the offset starts inside it — this lands the chevron the same
              20px from the field's outer edge as everywhere else. */}
          <ChevronDown className="pointer-events-none absolute top-1/2 right-[19px] size-4 -translate-y-1/2 text-foreground" />
        </div>
        <Input
          name={`interval_value_${slot}`}
          type="number"
          required
          step={type === "months" ? "1" : "0.1"}
          placeholder={PLACEHOLDER[type]}
          defaultValue={defaultValue?.value ?? ""}
          className="flex-1"
        />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="space-y-1.5">
        <Label htmlFor={`interval_name_${slot}`}>{nameLabel}</Label>
        <Input
          id={`interval_name_${slot}`}
          name={`interval_name_${slot}`}
          required
          placeholder={namePlaceholder}
          defaultValue={defaultValue?.name ?? ""}
        />
      </div>
    </div>
  );
}

/**
 * A component has up to 3 independent, named maintenance intervals when
 * created by hand (e.g. "Fork lower leg service" every 200km) — but Smart
 * Setup may have stored up to 5, and an edit form that hid the extra two
 * would read as a bug. So the slot count is max(3, what already exists),
 * capped at 5: manual creation keeps its 3, editing shows everything.
 * Each revealed slot submits as interval_name_{slot}/interval_type_{slot}/
 * interval_value_{slot} — a slot left untouched (fields never revealed) is
 * simply absent from the submission and skipped server-side.
 */
export function IntervalFieldGroup({
  defaults = [],
  startWithReminder = false,
  hint,
  nameLabel,
  namePlaceholder,
  kmLabel,
  hoursLabel,
  monthsLabel,
  reminderToggleLabel,
  addAnotherLabel,
  suggestionNote,
  intervalNames,
}: {
  defaults?: IntervalSlotDefault[];
  startWithReminder?: boolean;
  hint: string;
  nameLabel: string;
  namePlaceholder: string;
  kmLabel: string;
  hoursLabel: string;
  monthsLabel: string;
  reminderToggleLabel: string;
  addAnotherLabel: string;
  /** Shown when the slots were filled from the shared catalog rather than
   * by the reader — fields that fill themselves without saying why read as
   * a glitch. */
  suggestionNote?: string;
  /** Canonical English → the reader's language, so a suggested name arrives
   * in Portuguese instead of as the storage key. What goes back to the
   * database is turned around again by canonicalIntervalName on save. */
  intervalNames?: Record<string, string>;
}) {
  // The wizard only offers a suggestion when every slot is still empty, so
  // accepting it can never overwrite something typed.
  const suggestion = useIntervalSuggestion();
  const [applied, setApplied] = useState<IntervalSuggestion | null>(null);

  const slots: IntervalSlotDefault[] = applied
    ? applied.intervals.map((iv) => ({
        name: intervalNames?.[iv.name] ?? iv.name,
        type: iv.type,
        value: iv.interval,
      }))
    : defaults;
  const slotCount = Math.min(5, Math.max(3, slots.length));

  // Only the create form pre-arms the first reminder, to nudge one into being
  // set up. Everywhere else the toggles mirror what's stored, which is what
  // makes "off" reachable at all: a component saved without reminders used to
  // reopen with the first one back on, so switching it off never stuck.
  const [enabled, setEnabled] = useState<boolean[]>(() =>
    Array.from({ length: slotCount }, (_, i) => (i === 0 ? startWithReminder || defaults.length >= 1 : defaults.length >= i + 1))
  );

  // Adjusting state during render, not in an effect: the suggestion lands
  // after mount and the toggles have to follow it, and this is the one
  // pattern React sanctions for "derived state that must react to a prop".
  // An effect here would also trip the project's set-state-in-effect rule.
  if (suggestion && suggestion !== applied) {
    setApplied(suggestion);
    setEnabled(Array.from({ length: slotCount }, (_, i) => i < suggestion.intervals.length));
  }

  // Turning a slot off also turns off everything after it — the numbered
  // form fields must stay contiguous for the server's 1..N parse.
  function toggleSlot(index: number, value: boolean) {
    setEnabled((prev) => prev.map((on, i) => (i < index ? on : i === index ? value : value && on)));
  }

  const slotFieldsProps = { nameLabel, namePlaceholder, kmLabel, hoursLabel, monthsLabel, hint };

  // The inputs are uncontrolled, so a suggestion arriving later only lands
  // if they remount — hence the key changing with it.
  const slotKey = applied ? "suggested" : "stored";

  return (
    <div className="space-y-1.5 sm:col-span-2">
      {applied && suggestionNote && (
        <p className="rounded-sm bg-muted px-3.5 py-3 text-sm text-muted-foreground">{suggestionNote}</p>
      )}
      <div>
        <div className="space-y-3 py-5 first:pt-0">
          <ToggleRow
            icon={<AlarmIcon className="size-4" />}
            label={reminderToggleLabel}
            checked={enabled[0]}
            onChange={(v) => toggleSlot(0, v)}
          />
          {enabled[0] && (
            <IntervalSlotFields key={slotKey} slot={1} defaultValue={slots[0]} {...slotFieldsProps} />
          )}
        </div>

        {enabled[0] &&
          Array.from({ length: slotCount - 1 }, (_, i) => i + 1).map((index) => (
            <div
              key={index}
              className="space-y-3 border-t border-border py-5 last:pb-0"
            >
              <ToggleRow
                label={addAnotherLabel}
                checked={enabled[index]}
                onChange={(v) => toggleSlot(index, v)}
              />
              {enabled[index] && (
                <IntervalSlotFields
                  key={slotKey}
                  slot={index + 1}
                  defaultValue={slots[index]}
                  {...slotFieldsProps}
                />
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
