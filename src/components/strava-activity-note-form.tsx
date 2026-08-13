"use client";

import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { ToggleRow } from "@/components/settings-toggle-row";
import { updateStravaActivityNote } from "@/lib/actions/strava";

/**
 * The one switch that lets Bikit write back to Strava. Off by default, and
 * the only place in the app that asks for a scope beyond reading.
 *
 * Switching it on when Strava has not granted activity:write sends the rider
 * to the consent screen, so the row can come back still off while the
 * preference is already true — that mismatch is what `needsAuth` renders,
 * rather than a switch that claims to be on while every write 401s.
 */
export function StravaActivityNoteForm({
  enabled,
  hasWriteScope,
  dict,
}: {
  enabled: boolean;
  hasWriteScope: boolean;
  dict: Dictionary["settings"]["strava"];
}) {
  const needsAuth = enabled && !hasWriteScope;

  return (
    <form action={updateStravaActivityNote}>
      <ToggleRow
        label={dict.activityNote}
        sub={needsAuth ? dict.activityNoteNeedsAuth : dict.activityNoteSub}
        name="strava_activity_note"
        defaultChecked={enabled && hasWriteScope}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
