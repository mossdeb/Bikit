"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { sensorSyncOutcome } from "@/lib/sensor-sync";

export type SensorSyncActionResult =
  | { status: "synced"; km: number; revs: number }
  | { status: "reset" }
  | { status: "wrong-sensor"; expected: string }
  | { status: "error"; message: string };

/**
 * Applies one sensor reading to a bike: delta over the stored baseline,
 * converted through the wheel circumference, ADDED to the totals — the
 * Strava sync's shape, never updateBike's, whose rebase of every mounted
 * component's baseline would silently erase accumulated wear.
 *
 * The reading arrives from the client because Bluetooth lives there; the
 * server cannot verify it against the hardware. What it can verify, it
 * does: the caller owns the bike, the lab gate, the name matching the
 * paired sensor (the wrong-device lesson of 2026-08-18), and a plausibility
 * ceiling so a corrupt count cannot write a continent onto the odometer.
 */
export async function syncBikeSensor(
  bikeId: string,
  reading: { name: string; wheelRevs: number }
): Promise<SensorSyncActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email)) return { status: "error", message: "Sem acesso." };

  const wheelRevs = Math.round(reading.wheelRevs);
  if (!Number.isFinite(wheelRevs) || wheelRevs < 0 || wheelRevs > 4294967295) {
    return { status: "error", message: "Leitura inválida." };
  }

  // Owner checked explicitly before any write — production has real accounts
  // beyond this one, and RLS is the net, not the habit.
  const { data: bike } = await supabase
    .from("bikes")
    .select("id, user_id, sensor_name, sensor_baseline_count, sensor_wheel_mm, total_km")
    .eq("id", bikeId)
    .eq("user_id", userId)
    .single();
  if (!bike?.sensor_name || bike.sensor_baseline_count == null || !bike.sensor_wheel_mm) {
    return { status: "error", message: "Esta bicicleta não tem sensor associado." };
  }
  if (bike.sensor_name !== reading.name) {
    return { status: "wrong-sensor", expected: bike.sensor_name };
  }

  const outcome = sensorSyncOutcome(bike.sensor_baseline_count, wheelRevs, bike.sensor_wheel_mm);
  if (outcome.kind === "advance" && outcome.km > 1000) {
    return { status: "error", message: "Delta implausível (mais de 1000 km) — nada foi escrito." };
  }

  const { error } = await supabase
    .from("bikes")
    .update({
      total_km: (bike.total_km ?? 0) + (outcome.kind === "advance" ? outcome.km : 0),
      sensor_baseline_count: wheelRevs,
      sensor_synced_at: new Date().toISOString(),
    })
    .eq("id", bike.id)
    .eq("user_id", userId);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  return outcome.kind === "reset" ? { status: "reset" } : { status: "synced", km: outcome.km, revs: outcome.revs };
}
