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
import { uploadAndRegisterImuSession } from "@/lib/imu/import-session";
import {
  ImuSessionDetailsFields,
  type BikeOption,
} from "@/components/imu-session-details-fields";
import { BikitDeviceImport } from "@/components/bikit-device-import";

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
export function ImuSessionImport({
  userId,
  bikes,
  riderDefault,
}: {
  userId: string;
  bikes: BikeOption[];
  /** The account's own name, offered as the rider before anyone types. */
  riderDefault: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"device" | "file">("device");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<{
    file: File;
    session: ImuSessionData;
    summary: ImuSessionSummary;
  } | null>(null);
  const [name, setName] = useState("");
  const [rider, setRider] = useState(riderDefault);
  const [bikeId, setBikeId] = useState("");

  function reset() {
    setParsed(null);
    setError(null);
    setBusy(false);
    setName("");
    setRider(riderDefault);
    setBikeId("");
    setTab("device");
  }

  function finish() {
    setOpen(false);
    reset();
    router.refresh();
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    setParsed(null);
    if (!file) return;
    // Bytes and not text: the logger's .BKT is binary, and the dispatcher
    // sniffs the first four of them to pick the parser.
    const result = parseImuBytes(await file.arrayBuffer());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setParsed({
      file,
      session: result.session,
      summary: sessionSummary(result.session),
    });
    setName(
      result.session.sessionId ?? file.name.replace(/\.(json|bkt)$/i, ""),
    );
  }

  async function handleImport() {
    if (!parsed || busy) return;
    setBusy(true);
    setError(null);
    // The raw file goes up as-is — the storage object IS the raw data, and
    // nothing recorded by the sensor is rewritten on the way in.
    const outcome = await uploadAndRegisterImuSession({
      userId,
      bytes: parsed.file,
      session: parsed.session,
      summary: parsed.summary,
      name,
      riderName: rider,
      bikeId: bikeId || null,
    });
    if (!outcome.ok) {
      setBusy(false);
      setError(outcome.error);
      return;
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
        Importar sessão
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar sessão IMU</DialogTitle>
          <DialogDescription className="mt-1">
            Do dispositivo, por Bluetooth, ou de um ficheiro .BKT ou JSON. É
            validada antes de sair daqui.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "device" | "file")}
          className="gap-4"
        >
          <TabsList variant="pill" className="w-full border border-border">
            <TabsTrigger value="device" className="flex-1 px-3 py-1.5">
              Dispositivo
            </TabsTrigger>
            <TabsTrigger value="file" className="flex-1 px-3 py-1.5">
              Ficheiro
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="device"
            keepMounted
            className="data-[hidden]:hidden"
          >
            <BikitDeviceImport
              userId={userId}
              riderDefault={riderDefault}
              bikes={bikes}
              onImported={finish}
            />
          </TabsContent>

          <TabsContent value="file">
            <div className="space-y-4">
              <input
                ref={fileRef}
                type="file"
                accept=".bkt,.BKT,.json,application/json,application/octet-stream"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-sm file:font-medium file:text-secondary-foreground"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />

              {parsed && (
                <>
                  <div className="rounded-[12px] border border-border px-3 py-2.5 text-sm">
                    <p className="font-medium">{parsed.session.format}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {formatSessionTime(parsed.summary.durationMs)} ·{" "}
                      {Math.round(parsed.summary.sampleRateHz)} Hz ·{" "}
                      <span className="tabular-nums">
                        {parsed.summary.sampleCount.toLocaleString("pt-PT")}
                      </span>{" "}
                      amostras · {parsed.summary.eventCount} eventos
                    </p>
                  </div>
                  <ImuSessionDetailsFields
                    idPrefix="imu"
                    name={name}
                    onNameChange={setName}
                    rider={rider}
                    onRiderChange={setRider}
                    riderDefault={riderDefault}
                    bikeId={bikeId}
                    onBikeIdChange={setBikeId}
                    bikes={bikes}
                  />
                </>
              )}

              {/* Written on screen, never a toast — the garage rule. */}
              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                className="w-full"
                variant="inverted"
                disabled={!parsed || !name.trim() || busy}
                onClick={handleImport}
              >
                {busy ? "A importar…" : "Importar"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
