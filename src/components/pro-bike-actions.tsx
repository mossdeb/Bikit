"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useProDict } from "@/components/pro-locale";
import { BIKE_TYPES } from "@/lib/constants";
import {
  createProBike,
  deleteProBike,
  updateProBike,
} from "@/lib/actions/bikes";

/**
 * Bikit Pro's own way to add a bike (by request, 2026-10-27): the bikes
 * list's top-right button opens a short form — name, type, brand, model,
 * year — and lands on the new bike's Pro page. The app's wizard, with its
 * Strava and maintenance steps, stays the app's.
 */
export function ProAddBikeButton() {
  const t = useProDict().report.bikes;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: HTMLFormElement) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await createProBike(bikeFieldsOf(form));
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    router.push(`/pro/bicicletas/${result.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setBusy(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: "inverted", size: "sm" }),
          "shrink-0 px-5",
        )}
      >
        <Plus data-icon="inline-start" aria-hidden />
        {t.add}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t.addTitle}</DialogTitle>
          <DialogDescription className="mt-1">
            {t.addDescription}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          <ProBikeFields idPrefix="pro-bike" />
          {error && (
            <p className="text-sm text-destructive sm:col-span-2">{error}</p>
          )}
          <div className="flex gap-3 pt-1 sm:col-span-2">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full px-6"
              onClick={() => setOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              variant="inverted"
              className="flex-1 rounded-full"
              disabled={busy}
            >
              {busy ? t.creating : t.create}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The add and edit forms' fields: name, type, year, brand and model. */
function ProBikeFields({
  idPrefix,
  values,
}: {
  idPrefix: string;
  values?: {
    name: string | null;
    type: string | null;
    brand: string | null;
    model: string | null;
    year: number | null;
  };
}) {
  const t = useProDict().report.bikes;
  const year = new Date().getFullYear();
  // A type from before the list, kept rather than silently swapped.
  const types =
    values?.type && !(BIKE_TYPES as readonly string[]).includes(values.type)
      ? [values.type, ...BIKE_TYPES]
      : BIKE_TYPES;
  return (
    <>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{t.name}</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder={t.namePlaceholder}
          defaultValue={values?.name ?? ""}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-type`}>{t.type}</Label>
        <NativeSelect
          id={`${idPrefix}-type`}
          name="type"
          defaultValue={values ? (values.type ?? "") : "Enduro"}
        >
          {values && !values.type && <option value="">–</option>}
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-year`}>{t.year}</Label>
        <Input
          id={`${idPrefix}-year`}
          name="year"
          type="number"
          min={1900}
          max={year + 1}
          defaultValue={values ? (values.year ?? "") : year}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-brand`}>{t.brand}</Label>
        <Input
          id={`${idPrefix}-brand`}
          name="brand"
          defaultValue={values?.brand ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-model`}>{t.model}</Label>
        <Input
          id={`${idPrefix}-model`}
          name="model"
          defaultValue={values?.model ?? ""}
        />
      </div>
    </>
  );
}

/** A form's five fields, as the actions take them. */
function bikeFieldsOf(form: HTMLFormElement) {
  const data = new FormData(form);
  const field = (key: string) => String(data.get(key) ?? "");
  return {
    name: field("name"),
    type: field("type"),
    brand: field("brand"),
    model: field("model"),
    year: field("year"),
  };
}

/**
 * The bike's ⋯ menu on its Pro page (by request, 2026-10-28: it replaced
 * the Delete button): Edit opens the add form's fields filled in, Delete
 * the dialog that says what goes with the bike and what stays — the
 * sessions and setups stay, unlinked — and lands back on the bikes list.
 * The dialogs live outside the popover, so closing the menu does not take
 * them with it.
 */
export function ProBikeMenu({
  bike,
  sessionCount,
}: {
  bike: {
    id: string;
    name: string;
    type: string | null;
    brand: string | null;
    model: string | null;
    year: number | null;
  };
  /** "3 sessões", already worded. */
  sessionCount: string;
}) {
  const t = useProDict().report.bikes;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog(which: "edit" | "delete") {
    setMenuOpen(false);
    setBusy(false);
    setError(null);
    setDialog(which);
  }

  async function save(form: HTMLFormElement) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await updateProBike(bike.id, bikeFieldsOf(form));
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    setDialog(null);
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteProBike(bike.id);
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    router.push("/pro/bicicletas");
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted";

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          aria-label={t.actions}
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "size-11 shrink-0 rounded-full",
          )}
        >
          <Ellipsis className="size-5" aria-hidden />
        </PopoverTrigger>
        {/* No focus back to the ⋯ as the menu closes: it would land
            after the dialog the item opened, and the dialog closes when
            focus leaves it. */}
        <PopoverContent align="end" finalFocus={false} className="w-44 p-1.5">
          <button
            type="button"
            className={item}
            onClick={() => openDialog("edit")}
          >
            <Pencil className="size-4" aria-hidden />
            {t.edit}
          </button>
          <button
            type="button"
            className={cn(item, "text-destructive hover:bg-destructive/10")}
            onClick={() => openDialog("delete")}
          >
            <Trash2 className="size-4" aria-hidden />
            {t.delete}
          </button>
        </PopoverContent>
      </Popover>

      <Dialog
        open={dialog === "edit"}
        onOpenChange={(next) => !next && setDialog(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">{t.editTitle}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save(event.currentTarget);
            }}
          >
            <ProBikeFields idPrefix="pro-bike-edit" values={bike} />
            {error && (
              <p className="text-sm text-destructive sm:col-span-2">{error}</p>
            )}
            <div className="flex gap-3 pt-1 sm:col-span-2">
              <Button
                type="button"
                variant="secondary"
                className="rounded-full px-6"
                onClick={() => setDialog(null)}
              >
                {t.cancel}
              </Button>
              <Button
                type="submit"
                variant="inverted"
                className="flex-1 rounded-full"
                disabled={busy}
              >
                {busy ? t.saving : t.save}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onOpenChange={(next) => !next && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {t.deleteTitle(bike.name)}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {t.deleteBody(sessionCount)}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full px-6"
              onClick={() => setDialog(null)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1 rounded-full"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? t.deleting : t.deleteConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
