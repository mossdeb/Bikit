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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createClient } from "@/lib/supabase/client";
import { createImuSession } from "@/lib/actions/imu";
import { parseImuBytes, type ImuSessionData } from "@/lib/imu/format";
import { BKT_CONTENT_TYPE, BKT_FORMAT } from "@/lib/imu/bkt";
import {
  sessionSummary,
  formatSessionTime,
  type ImuSessionSummary,
} from "@/lib/imu/derive";

interface BikeOption {
  id: string;
  name: string;
}

/**
 * Import flow: pick a file (.BKT or JSON), validate and summarize it locally, then —
 * only on confirm — upload the untouched file straight to Storage and
 * register the summary row through the server action. Validation happens
 * before a single byte leaves the machine, and every error is written into
 * the dialog rather than toasted: the file input keeps the failed choice
 * visible next to what went wrong.
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
    // nothing recorded by the sensor is rewritten on the way in. The
    // extension and content type follow what the parser found, not the
    // file's own name: a .BKT renamed .json is still a binary.
    const isBkt = parsed.session.format === BKT_FORMAT;
    const storagePath = `${userId}/${crypto.randomUUID()}.${isBkt ? "bkt" : "json"}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("imu-sessions")
      .upload(storagePath, parsed.file, {
        contentType: isBkt ? BKT_CONTENT_TYPE : "application/json",
        upsert: false,
      });
    if (uploadError) {
      setBusy(false);
      setError(`O upload falhou: ${uploadError.message}`);
      return;
    }

    const { summary, session } = parsed;
    const result = await createImuSession({
      name,
      riderName: rider,
      bikeId: bikeId || null,
      storagePath,
      format: session.format,
      durationMs: summary.durationMs,
      sampleRateHz: summary.sampleRateHz,
      sampleCount: summary.sampleCount,
      maxG: summary.maxG,
      eventCount: summary.eventCount,
      curveCount: summary.curveCount,
      jumpCount: summary.jumpCount,
      impactCount: summary.impactCount,
      airtimeMs: summary.airtimeMs,
    });
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }

    setOpen(false);
    reset();
    router.refresh();
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
            O ficheiro .BKT gravado pelo sensor, ou o JSON exportado. É validado
            antes de sair daqui.
          </DialogDescription>
        </DialogHeader>

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

              <div className="space-y-1.5">
                <Label htmlFor="imu-name">Nome</Label>
                <Input
                  id="imu-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              {/* Under the name, because the two are the same question
                  asked twice — what this recording is, and whose ride it
                  was. Prefilled with the account's name and clearable: left
                  empty, the server writes that same name back, so a blank
                  field never costs a session its rider. */}
              <div className="space-y-1.5">
                <Label htmlFor="imu-rider">Rider</Label>
                <Input
                  id="imu-rider"
                  value={rider}
                  onChange={(event) => setRider(event.target.value)}
                  placeholder={riderDefault}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="imu-bike">Bicicleta (opcional)</Label>
                <NativeSelect
                  id="imu-bike"
                  value={bikeId}
                  onChange={(event) => setBikeId(event.target.value)}
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
      </DialogContent>
    </Dialog>
  );
}
