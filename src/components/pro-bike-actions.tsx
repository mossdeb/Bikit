"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import { useProDict } from "@/components/pro-locale";
import { BIKE_TYPES } from "@/lib/constants";
import { createProBike, deleteProBike } from "@/lib/actions/bikes";

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
  const year = new Date().getFullYear();

  async function submit(form: HTMLFormElement) {
    if (busy) return;
    const data = new FormData(form);
    const field = (key: string) => String(data.get(key) ?? "");
    setBusy(true);
    setError(null);
    const result = await createProBike({
      name: field("name"),
      type: field("type"),
      brand: field("brand"),
      model: field("model"),
      year: field("year"),
    });
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pro-bike-name">{t.name}</Label>
            <Input
              id="pro-bike-name"
              name="name"
              placeholder={t.namePlaceholder}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pro-bike-type">{t.type}</Label>
            <NativeSelect id="pro-bike-type" name="type" defaultValue="Enduro">
              {BIKE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pro-bike-year">{t.year}</Label>
            <Input
              id="pro-bike-year"
              name="year"
              type="number"
              min={1900}
              max={year + 1}
              defaultValue={year}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pro-bike-brand">{t.brand}</Label>
            <Input id="pro-bike-brand" name="brand" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pro-bike-model">{t.model}</Label>
            <Input id="pro-bike-model" name="model" />
          </div>
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

/**
 * Deletes the bike from its Pro page (by request, 2026-10-27), after a
 * dialog that says what goes with it and what stays — the sessions and
 * setups stay, unlinked. Lands back on the bikes list.
 */
export function ProDeleteBikeButton({
  bikeId,
  bikeName,
  sessionCount,
}: {
  bikeId: string;
  bikeName: string;
  /** "3 sessões", already worded. */
  sessionCount: string;
}) {
  const t = useProDict().report.bikes;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteProBike(bikeId);
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    router.push("/pro/bicicletas");
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
          buttonVariants({ variant: "destructive", size: "sm" }),
          "shrink-0 px-4",
        )}
      >
        <Trash2 data-icon="inline-start" aria-hidden />
        {t.delete}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t.deleteTitle(bikeName)}
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
            onClick={() => setOpen(false)}
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
  );
}
