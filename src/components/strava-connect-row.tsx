import { ConnectWithStravaButton } from "@/components/strava-brand";
import { connectStrava } from "@/lib/actions/strava";

/** Same muted row used in Settings' Strava section — reused wherever a bike
 * form needs to prompt for a Strava connection instead of just pointing the
 * user elsewhere to go make it. Uses `formAction` rather than its own
 * <form> because this renders inside the surrounding bike form, and HTML
 * doesn't allow nested forms. */
export function StravaConnectRow({ label, connectLabel }: { label: string; connectLabel: string }) {
  return (
    // Stacked below sm and inline above it. Strava's button is a fixed 237px
    // and is not ours to shrink, which is 237 of the 259px this row has to
    // give at 375px — enough for its own line, nothing like enough to sit
    // beside a label.
    <div className="flex flex-col gap-3 rounded-sm bg-muted px-3.5 py-3 sm:flex-row sm:items-center">
      {/* No glyph beside the label. It was a Strava mark we had drawn
          ourselves, sitting directly above Strava's own button, and the label
          next to it already said the same word. */}
      <span className="text-sm font-semibold">{label}</span>
      <ConnectWithStravaButton label={connectLabel} formAction={connectStrava} className="sm:ml-auto" />
    </div>
  );
}
