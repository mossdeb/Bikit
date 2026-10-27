"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseImuBytes, type ImuSessionData } from "@/lib/imu/format";
import {
  sessionSummary,
  formatSessionTime,
  type ImuSessionSummary,
} from "@/lib/imu/derive";
import {
  firstTrackPassed,
  loadImportTracks,
  uploadAndRegisterImuSession,
  type ImportTrack,
} from "@/lib/imu/import-session";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { alignSession } from "@/lib/imu/derive";
import { withBikeFrameEvents } from "@/lib/imu/events";
import {
  ImuSessionDetailsFields,
  type BikeOption,
} from "@/components/imu-session-details-fields";
import { BikitDeviceImport } from "@/components/bikit-device-import";
import {
  defaultGroupId,
  groupFormValid,
  groupRefFromForm,
  type ImuGroupOption,
} from "@/lib/imu/groups";
import { bikeFormValid, bikeRefFromForm } from "@/lib/imu/bike-ref";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proNumber } from "@/lib/i18n/pro";

/**
 * The one door for sessions, with two ways through it: the logger over
 * Bluetooth, or a file from disk (.BKT or JSON). Both live inside this
 * dialog, as tabs — connecting, listing, transferring, validating and saving
 * all happen here, and the page behind only refreshes when a session lands.
 *
 * The device tab keeps its panel mounted while the file tab is showing
 * (`keepMounted`): Base UI unmounts hidden panels by default, and unmounting
 * the device panel drops the BLE link — switching tabs to glance at the file
 * picker must not disconnect the logger.
 *
 * Validation happens before a single byte leaves the machine, and every
 * error is written into the dialog rather than toasted: the failed choice
 * stays visible next to what went wrong.
 */
/** A file picked for import, parsed and named. */
interface ImportItem {
  file: File;
  session: ImuSessionData;
  summary: ImuSessionSummary;
  name: string;
}

export function ImuSessionImport({
  userId,
  bikes,
  groups,
  riderDefault,
  riders,
}: {
  userId: string;
  bikes: BikeOption[];
  /** The account's groups, newest first; today's most recent is preselected. */
  groups: ImuGroupOption[];
  /** The account's own name, offered as the rider before anyone types. */
  riderDefault: string;
  /** The riders the account's sessions know, most recent first. */
  riders: string[];
}) {
  const router = useRouter();
  const t = useProDict();
  const locale = useProLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"device" | "file">("device");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The files picked, parsed and named (several at once since
   * 2026-10-27, by request): each its own name, the rest shared. */
  const [items, setItems] = useState<ImportItem[]>([]);
  const [tracks, setTracks] = useState<ImportTrack[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [rider, setRider] = useState(riderDefault);
  const [bikeId, setBikeId] = useState("");
  const [newBikeName, setNewBikeName] = useState("");
  const [groupId, setGroupId] = useState(() => defaultGroupId(groups));
  const [newGroupName, setNewGroupName] = useState("");

  function reset() {
    setItems([]);
    setTracks(null);
    setProgress(null);
    setError(null);
    setBusy(false);
    setRider(riderDefault);
    setBikeId("");
    setGroupId(defaultGroupId(groups));
    setNewGroupName("");
    setTab("device");
  }

  function finish() {
    setOpen(false);
    reset();
    router.refresh();
  }

  /**
   * Every file picked is parsed here, and a bad one is named in the error
   * without stopping the rest. Each is named from its file — "R0126" — and
   * when its run passes one of the account's timed tracks, after the track
   * too: "R0126 - mytica" (by request, 2026-10-27). The names stay
   * editable; the rider, the bike and the group are asked once and given
   * to all.
   */
  async function handleFiles(list: FileList | null) {
    setError(null);
    setItems([]);
    const files = list ? [...list] : [];
    if (files.length === 0) return;
    const known = tracks ?? (await loadImportTracks());
    setTracks(known);
    const next: ImportItem[] = [];
    const failures: string[] = [];
    for (const file of files) {
      // Bytes and not text: the logger's .BKT is binary, and the
      // dispatcher sniffs the first four of them to pick the parser.
      const result = parseImuBytes(await file.arrayBuffer(), locale);
      if (!result.ok) {
        failures.push(t.importing.dialog.fileFailed(file.name, result.error));
        continue;
      }
      const base =
        result.session.sessionId ?? file.name.replace(/\.(json|bkt)$/i, "");
      const track = firstTrackPassed(result.session, known);
      next.push({
        file,
        session: result.session,
        // The summary the row will carry, computed the way the page
        // computes it: in the bike's frame, with the curves and braking
        // that frame makes visible. The uploaded bytes stay the file as it
        // came.
        summary: sessionSummary(
          withBikeFrameEvents(alignSession(result.session)),
        ),
        name: track ? `${base} - ${track.name}` : base,
      });
    }
    setItems(next);
    if (failures.length > 0) setError(failures.join("\n"));
  }

  async function handleImport() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    // One at a time: a new bike or group named in the form is created by
    // the first and found by name for the rest, never made twice.
    for (let i = 0; i < items.length; i++) {
      setProgress(i + 1);
      const item = items[i];
      // The raw file goes up as-is — the storage object IS the raw data,
      // and nothing recorded by the sensor is rewritten on the way in.
      const outcome = await uploadAndRegisterImuSession({
        userId,
        bytes: item.file,
        session: item.session,
        summary: item.summary,
        name: item.name,
        riderName: rider,
        bike: bikeRefFromForm(bikeId, newBikeName),
        group: groupRefFromForm(groupId, newGroupName),
        locale,
        tracks: tracks ?? undefined,
      });
      if (!outcome.ok) {
        // What landed stays; the list keeps what did not, to try again.
        setItems(items.slice(i));
        setProgress(null);
        setBusy(false);
        setError(t.importing.dialog.fileFailed(item.file.name, outcome.error));
        if (i > 0) router.refresh();
        return;
      }
    }
    finish();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        className={buttonVariants({ variant: "inverted", size: "sm" })}
      >
        <Plus data-icon="inline-start" />
        {t.importing.dialog.trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.importing.dialog.title}</DialogTitle>
          <DialogDescription className="mt-1">
            {t.importing.dialog.description}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "device" | "file")}
          // `min-w-0` here and on the panels: the dialog is a grid, a grid
          // item's min-width defaults to its content, and the device tab's
          // log is a <pre> with long lines — without this the log widened
          // the whole dialog past its max-width.
          className="min-w-0 gap-4"
        >
          <TabsList variant="pill" className="w-full border border-border">
            <TabsTrigger value="device" className="flex-1 px-3 py-1.5">
              {t.importing.dialog.tabDevice}
            </TabsTrigger>
            <TabsTrigger value="file" className="flex-1 px-3 py-1.5">
              {t.importing.dialog.tabFile}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="device"
            keepMounted
            className="min-w-0 data-[hidden]:hidden"
          >
            <BikitDeviceImport
              userId={userId}
              riderDefault={riderDefault}
              riders={riders}
              bikes={bikes}
              groups={groups}
              onImported={finish}
            />
          </TabsContent>

          <TabsContent value="file">
            <div className="space-y-4">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".bkt,.BKT,.json,application/json,application/octet-stream"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-sm file:font-medium file:text-secondary-foreground"
                onChange={(event) => void handleFiles(event.target.files)}
              />

              {items.length > 0 && (
                <>
                  {items.map((item, i) => (
                    <div
                      key={`${item.file.name}-${i}`}
                      className="space-y-1.5 rounded-[12px] border border-border px-3 py-2.5"
                    >
                      <Label htmlFor={`imu-name-${i}`}>
                        {items.length > 1
                          ? t.importing.dialog.nameLabel(item.file.name)
                          : t.importing.fields.name}
                      </Label>
                      <Input
                        id={`imu-name-${i}`}
                        value={item.name}
                        onChange={(event) =>
                          setItems((prev) =>
                            prev.map((p, k) =>
                              k === i ? { ...p, name: event.target.value } : p,
                            ),
                          )
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        {item.session.format} ·{" "}
                        {formatSessionTime(item.summary.durationMs)} ·{" "}
                        {Math.round(item.summary.sampleRateHz)} Hz ·{" "}
                        <span className="tabular-nums">
                          {proNumber(item.summary.sampleCount, locale)}
                        </span>{" "}
                        {t.common.units.samples} ·{" "}
                        {t.importing.dialog.events(item.summary.eventCount)}
                        {/* The high-g sensor's shocks (firmware V15), when
                            the file has the sensor — nought included, which
                            says the sensor was there and nothing crossed it. */}
                        {item.session.highG &&
                          ` · ${t.importing.dialog.highGShocks(item.session.highG.length)}`}
                      </p>
                    </div>
                  ))}
                  {items.length > 1 && (
                    <p className="text-sm text-muted-foreground">
                      {t.importing.dialog.sharedHint}
                    </p>
                  )}
                  <ImuSessionDetailsFields
                    idPrefix="imu"
                    rider={rider}
                    onRiderChange={setRider}
                    riderDefault={riderDefault}
                    riders={riders}
                    bikeId={bikeId}
                    onBikeIdChange={setBikeId}
                    bikes={bikes}
                    newBikeName={newBikeName}
                    onNewBikeNameChange={setNewBikeName}
                    groups={groups}
                    groupId={groupId}
                    onGroupIdChange={setGroupId}
                    newGroupName={newGroupName}
                    onNewGroupNameChange={setNewGroupName}
                  />
                </>
              )}

              {/* Written on screen, never a toast — the garage rule. */}
              {error && (
                <p className="text-sm whitespace-pre-line text-destructive">
                  {error}
                </p>
              )}

              <Button
                className="w-full"
                variant="inverted"
                disabled={
                  items.length === 0 ||
                  items.some((item) => !item.name.trim()) ||
                  !groupFormValid(groupId, newGroupName) ||
                  !bikeFormValid(bikeId, newBikeName) ||
                  busy
                }
                onClick={handleImport}
              >
                {busy
                  ? items.length > 1 && progress != null
                    ? t.importing.dialog.importingProgress(progress, items.length)
                    : t.importing.importingButton
                  : t.importing.dialog.importMany(items.length)}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
