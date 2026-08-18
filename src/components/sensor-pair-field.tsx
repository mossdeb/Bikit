"use client";

import { useState } from "react";
import { Bluetooth } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CSC_SERVICE, readCscWheelCount } from "@/lib/csc";
import { WHEEL_RIM_ISO_MM, wheelCircumferenceMm, type WheelChoice } from "@/lib/sensor-sync";

/**
 * Pairs a bike with a BLE speed sensor inside the create/edit forms.
 *
 * Lab test, one account — strings are Portuguese by the probe's precedent
 * (labs are not translated until they graduate).
 *
 * Pairing reads the sensor's current cumulative count and posts it as the
 * baseline, so the first real sync only adds what was ridden since this
 * moment. That makes pairing require the sensor awake and nearby — which it
 * is, since the picker cannot find a sleeping sensor anyway.
 *
 * The baseline input only exists after a fresh pairing: editing a bike
 * without re-pairing must not touch the stored baseline, or the next sync
 * would re-add everything since the original pairing.
 *
 * MTB tire widths are quoted in inches and road widths in mm because that is
 * how the sidewalls are printed; both become mm before the π formula. The
 * computed circumference lands in an editable field — the formula is a ~1%
 * approximation, and the field is the last word.
 */

const MTB_WHEELS: WheelChoice[] = ['29"', '27.5"', '26"'];
const MTB_TIRES_IN = [2.0, 2.1, 2.2, 2.25, 2.3, 2.35, 2.4, 2.5, 2.6, 2.8];
const ROAD_TIRES_MM = [23, 25, 28, 30, 32, 35, 38, 40, 45, 47, 50];

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SensorPairField({
  defaultName,
  defaultWheelMm,
  defaultBaseline,
}: {
  defaultName: string | null;
  defaultWheelMm: number | null;
  defaultBaseline: number | null;
}) {
  const [name, setName] = useState<string | null>(defaultName);
  /** Only set by a fresh pairing in this session — see the header comment. */
  const [pairedCount, setPairedCount] = useState<number | null>(null);
  const [wheel, setWheel] = useState<WheelChoice>('29"');
  const [tire, setTire] = useState("2.4");
  const [wheelMm, setWheelMm] = useState(
    defaultWheelMm != null ? String(defaultWheelMm) : String(wheelCircumferenceMm(WHEEL_RIM_ISO_MM['29"'], 2.4 * 25.4))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMtb = MTB_WHEELS.includes(wheel);
  const tireOptions = isMtb ? MTB_TIRES_IN.map(String) : ROAD_TIRES_MM.map(String);

  function recompute(nextWheel: WheelChoice, nextTire: string) {
    const width = Number(nextTire);
    if (!Number.isFinite(width)) return;
    const heightMm = MTB_WHEELS.includes(nextWheel) ? width * 25.4 : width;
    setWheelMm(String(wheelCircumferenceMm(WHEEL_RIM_ISO_MM[nextWheel], heightMm)));
  }

  function onWheelChange(next: WheelChoice) {
    // Switching between MTB and road swaps the tire unit, so the previous
    // width would be nonsense — reset to each family's common size.
    const nextTire = MTB_WHEELS.includes(next) ? "2.4" : "28";
    setWheel(next);
    setTire(nextTire);
    recompute(next, nextTire);
  }

  async function pair() {
    setBusy(true);
    setError(null);
    try {
      const reading = await readCscWheelCount([{ services: [CSC_SERVICE] }]);
      setName(reading.deviceName);
      setPairedCount(reading.wheelRevs);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-sm bg-muted px-3.5 py-3">
      {name ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-semibold">Sensor {name}</span>{" "}
            <span className="text-muted-foreground">
              {pairedCount != null
                ? `· contador ${pairedCount}`
                : defaultBaseline != null
                  ? `· último contador ${defaultBaseline}`
                  : null}
            </span>
          </p>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-full" disabled={busy} onClick={pair}>
            Trocar sensor
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" variant="inverted" size="sm" className="h-9 gap-1.5 rounded-full" disabled={busy} onClick={pair}>
            <Bluetooth className="size-3.5" />
            {busy ? "A ler o sensor…" : "Associar sensor"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Monta o sensor no cubo da roda (modo velocidade) e gira a roda antes de associar.
          </p>
        </div>
      )}

      {error && <p className="rounded-sm bg-destructive/10 p-2 text-xs break-words">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sensor_wheel">Roda</Label>
          <NativeSelect
            id="sensor_wheel"
            value={wheel}
            onChange={(e) => onWheelChange(e.target.value as WheelChoice)}
            className="bg-background"
          >
            {(Object.keys(WHEEL_RIM_ISO_MM) as WheelChoice[]).map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sensor_tire">Pneu {isMtb ? "(pol.)" : "(mm)"}</Label>
          <NativeSelect
            id="sensor_tire"
            value={tire}
            onChange={(e) => {
              setTire(e.target.value);
              recompute(wheel, e.target.value);
            }}
            className="bg-background"
          >
            {tireOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sensor_wheel_mm">Perímetro (mm)</Label>
          <Input
            id="sensor_wheel_mm"
            name="sensor_wheel_mm"
            type="number"
            min={800}
            max={3000}
            value={wheelMm}
            onChange={(e) => setWheelMm(e.target.value)}
            className="bg-background"
          />
        </div>
      </div>

      <input type="hidden" name="sensor_name" value={name ?? ""} />
      {pairedCount != null && <input type="hidden" name="sensor_baseline_count" value={pairedCount} />}
    </div>
  );
}
