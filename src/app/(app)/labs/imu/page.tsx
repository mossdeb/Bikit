import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { formatDate } from "@/lib/format";
import { formatSessionTime } from "@/lib/imu/derive";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import { cn } from "@/lib/utils";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import type { BikeType } from "@/lib/constants";
import { ImuSessionImport } from "@/components/imu-session-import";
import { ImuSessionDeleteButton } from "@/components/imu-session-delete-button";
import { ImuLabTexture } from "@/components/imu-lab-texture";

/**
 * Lab: IMU session analysis. Not linked from anywhere; `notFound` for anyone
 * but the owner, the same call the sensor lab makes — to an account that may
 * not see this, the route does not exist. Untranslated on purpose: a
 * dictionary key is a promise that this is a feature, and this is a probe
 * for developing the motion algorithms.
 */
export default async function ImuLabPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email)) notFound();
  // The name the app knows this account by, offered as the rider in the
  // import dialog. The server action falls back to the same value, so the
  // two agree whether or not anyone types in the field.
  const metadata = userData?.claims?.user_metadata as
    | { full_name?: string }
    | undefined;
  const riderDefault = metadata?.full_name?.trim() || email || "";

  const [{ data: sessions }, { data: bikes }] = await Promise.all([
    supabase
      .from("imu_sessions")
      .select(
        // No counts: the card stopped printing them, and a column selected
        // for nobody is a query that grows without a reader.
        "id, name, rider_name, bike_id, created_at, duration_ms, sample_rate_hz, sample_count",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("bikes")
      .select("id, name, type")
      .eq("user_id", userId)
      .order("name"),
  ]);

  const bikeById = new Map((bikes ?? []).map((bike) => [bike.id, bike]));

  return (
    // 15px of side margin on a phone, the same exception the session page
    // makes: the two are one screen to whoever is using the lab, and a list
    // that stepped in 5px from the page it opens would read as a seam.
    <div className="-mx-5 px-[15px] pt-4 sm:mx-0 sm:px-0 sm:pt-8">
      {/* The lab's dot grid on the page background, for as long as this
          page is mounted. Renders nothing of its own. */}
      <ImuLabTexture />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Sessões IMU</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe e analise sessões gravadas pelo sensor IMU.
          </p>
        </div>
        <ImuSessionImport
          userId={userId}
          bikes={(bikes ?? []).map(({ id, name }) => ({ id, name }))}
          riderDefault={riderDefault}
        />
      </div>

      <div className="mt-6 space-y-4 pb-10">
        {(sessions ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Ainda não há sessões. Importe um ficheiro JSON do sensor para
            começar.
          </p>
        )}

        {(sessions ?? []).map((session) => {
          const bike = session.bike_id
            ? bikeById.get(session.bike_id)
            : undefined;
          const BikeGlyph = bike?.type
            ? BIKE_TYPE_ICON[bike.type as BikeType]
            : undefined;
          return (
            <div
              key={session.id}
              className={cn(
                "relative rounded-lg bg-card p-5",
                CLICKABLE_CARD_HOVER,
              )}
            >
              <Link
                href={`/labs/imu/${session.id}`}
                className="absolute inset-0 rounded-lg outline-none"
                aria-label={session.name}
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {BikeGlyph && (
                  <BikeGlyph
                    className="h-5 w-7 shrink-0 text-foreground"
                    aria-hidden
                  />
                )}
                <span>{bike?.name ?? "Sem bicicleta"}</span>
                {/* Who rode it, beside what carried the sensor: two facts of
                    the same kind, and the list is where sessions are told
                    apart from each other. */}
                {session.rider_name && (
                  <span className="truncate">· {session.rider_name}</span>
                )}
              </div>
              <p className="mt-1 font-display text-xl leading-tight font-bold">
                {session.name}
              </p>
              <div className="mt-2 flex items-end justify-between gap-3 text-sm text-muted-foreground">
                <p>
                  {formatDate(session.created_at)} ·{" "}
                  {Math.round(session.sample_rate_hz)} Hz ·{" "}
                  <span className="tabular-nums">
                    {session.sample_count.toLocaleString("pt-PT")}
                  </span>{" "}
                  amostras
                </p>
                <p className="shrink-0 tabular-nums">
                  {formatSessionTime(session.duration_ms)}
                </p>
              </div>
              {/* Above the covering link, so the trash can is clickable. */}
              <div className="absolute top-3 right-3 z-10">
                <ImuSessionDeleteButton
                  sessionId={session.id}
                  name={session.name}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
