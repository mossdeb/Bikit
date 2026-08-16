"use client";

import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { ToggleRow } from "@/components/settings-toggle-row";
import { updateNotificationPreferences } from "@/lib/actions/settings";

export function NotificationsForm({
  prefs,
  dict,
}: {
  prefs: { dueSoon: boolean; overdue: boolean; weeklySummary: boolean; hardRide: boolean };
  dict: Dictionary["settings"]["notifications"];
}) {
  return (
    <form
      key={`${prefs.dueSoon}-${prefs.overdue}-${prefs.weeklySummary}-${prefs.hardRide}`}
      action={updateNotificationPreferences}
    >
      <ToggleRow
        label={dict.dueSoon}
        sub={dict.dueSoonSub}
        name="notify_due_soon"
        defaultChecked={prefs.dueSoon}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <ToggleRow
        label={dict.overdue}
        sub={dict.overdueSub}
        name="notify_overdue"
        defaultChecked={prefs.overdue}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
      {/* Last in the list, and the only one here that is not maintenance: it
          reports on a ride rather than asking for anything to be done. */}
      <ToggleRow
        label={dict.hardRide}
        sub={dict.hardRideSub}
        name="notify_hard_ride"
        defaultChecked={prefs.hardRide}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <ToggleRow
        label={dict.weeklySummary}
        sub={dict.weeklySummarySub}
        name="notify_weekly_summary"
        defaultChecked={prefs.weeklySummary}
        onToggle={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
