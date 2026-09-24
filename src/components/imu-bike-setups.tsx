"use client";

import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { formatDate } from "@/lib/format";
import { useProDict, useProLocale } from "@/components/pro-locale";
import {
  ImuSessionSetup,
  type ImuSetupLabels,
} from "@/components/imu-session-setup";
import type { BikeType } from "@/lib/constants";
import type { BikeSetup } from "@/lib/imu/bike-setups";
import { setupSummary } from "@/lib/imu/setup";

/**
 * A bike's setups as cards (2026-09-24): the letter, the summary line,
 * how many sessions rode on it and when it was last used, the note. Each
 * card is the trigger of the setup form in its read-only dress — the same
 * form a session opens, with every field held — so a setup reads the
 * same wherever it is met.
 */
export function ImuBikeSetups({
  setups,
  labels,
  bikeType,
}: {
  setups: BikeSetup[];
  labels: ImuSetupLabels;
  bikeType: BikeType | null;
}) {
  const t = useProDict();
  const locale = useProLocale();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {setups.map((setup) => {
        const n = setup.sessions.length;
        return (
          <ImuSessionSetup
            key={setup.key}
            sessionId=""
            values={setup.values}
            note={setup.note}
            labels={labels}
            bikeType={bikeType}
            readOnly
            title={`Setup ${setup.letter}`}
            triggerClassName={cn(
              "flex h-full w-full flex-col rounded-lg bg-card p-5 text-left",
              DARK_CARD_HAIRLINE,
              CLICKABLE_CARD_HOVER,
            )}
            triggerContent={
              <>
                <span className="inline-flex w-fit rounded-full bg-foreground px-2.5 py-1 font-display text-xs font-bold tracking-wide text-background uppercase">
                  Setup {setup.letter}
                </span>
                <span className="mt-3 block text-sm leading-relaxed">
                  {setupSummary(setup.values, labels, locale) ??
                    t.report.bikes.noValues}
                </span>
                {setup.note && (
                  <span className="mt-2 block text-xs text-muted-foreground">
                    “{setup.note}”
                  </span>
                )}
                <span className="mt-auto block pt-4 text-sm font-semibold tabular-nums">
                  {t.common.session(n)}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {t.common.lastOn(formatDate(setup.lastUsedAt, locale))}
                  </span>
                </span>
              </>
            }
          />
        );
      })}
    </div>
  );
}
