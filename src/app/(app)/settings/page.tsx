import Link from "next/link";
import { LogOut, ChevronRight } from "lucide-react";
import { OnboardingIcon, SecurityIcon, SupportIcon, DocsIcon, TermsIcon } from "@/components/settings-about-icons";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { GoogleIcon } from "@/components/google-icon";
import { ConnectWithStravaButton } from "@/components/strava-brand";
import { StravaAthleteId } from "@/components/strava-athlete-id";
import { StravaActivityNoteForm } from "@/components/strava-activity-note-form";
import { hasStravaWriteScope } from "@/lib/strava";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { ThemeSelect } from "@/components/theme-select";
import { PreferencesForm } from "@/components/preferences-form";
import { NotificationsForm } from "@/components/notifications-form";
import { PushNotificationsForm } from "@/components/push-notifications-form";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { BillingSection } from "@/components/billing-section";
import { InstallAppButton } from "@/components/install-app-button";
import { getInitials } from "@/lib/initials";
import { updateFullName, deleteAccount } from "@/lib/actions/settings";
import { logout } from "@/lib/actions/auth";
import { connectStrava, disconnectStrava } from "@/lib/actions/strava";
import { getUserSubscription } from "@/lib/subscription";

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-card p-6">
      <h3 className="font-display font-bold">{title}</h3>
      {description && <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

function AboutRow({
  icon,
  title,
  subtitle,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-sm text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </>
  );

  return href ? (
    <Link href={href} className="flex items-center gap-3 py-4">
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-3 py-4">{content}</div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const email = (user?.email as string) ?? "";
  const name = user?.user_metadata?.full_name as string | undefined;
  const distanceUnit = (user?.user_metadata?.distance_unit as string) ?? "km";
  const notificationPrefs = {
    dueSoon: (user?.user_metadata?.notify_due_soon as boolean) ?? true,
    overdue: (user?.user_metadata?.notify_overdue as boolean) ?? true,
    weeklySummary: (user?.user_metadata?.notify_weekly_summary as boolean) ?? false,
  };
  const pushPrefs = {
    dueSoon: (user?.user_metadata?.push_due_soon as boolean) ?? true,
    overdue: (user?.user_metadata?.push_overdue as boolean) ?? true,
    // Opt-in, unlike the two maintenance alerts: this one fires on every ride
    // that syncs rather than on a state the rider needs to act on.
    stravaSync: (user?.user_metadata?.push_strava_sync as boolean) ?? false,
  };
  // Opt-in and off by default, like the sync push — but this one leaves the
  // app and lands in the rider's public ride, so it never defaults to true.
  const activityNoteEnabled = (user?.user_metadata?.strava_activity_note as boolean) ?? false;
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  const isGoogleUser = providers.includes("google");

  const locale = localeFromMetadata(user?.user_metadata);
  const dict = getDictionary(locale);

  // Independent of each other (both only need user.sub) — one round trip.
  const [{ data: stravaConnection }, subscription] = await Promise.all([
    user?.sub
      ? supabase
          .from("strava_connections")
          .select("user_id, athlete_id, scopes")
          .eq("user_id", user.sub as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user?.sub
      ? getUserSubscription(user.sub as string)
      : Promise.resolve({
          plan: "free" as const,
          status: "active" as const,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          hasBillingAccount: false,
        }),
  ]);
  const isStravaConnected = !!stravaConnection;
  const stravaError =
    error === "strava-connection-failed"
      ? dict.settings.strava.connectionFailed
      : error === "strava-already-connected"
        ? dict.settings.strava.alreadyConnected
        : error;

  return (
    <div className="pt-4 sm:pt-8">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">{dict.settings.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{dict.settings.subtitle}</p>
      </div>

      <FormError message={stravaError} />

      <div className="flex max-w-[720px] flex-col gap-4">
        <SettingsSection title={dict.settings.profile.title} description={dict.settings.profile.description}>
          <div className="mb-5 flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-indigo font-display text-lg font-bold text-indigo-foreground">
              {getInitials(name, email)}
            </span>
            <div>
              <p className="text-sm font-bold">{name || email}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          <form key={name} action={updateFullName}>
            <div className="space-y-1.5">
              <Label htmlFor="full-name">{dict.settings.profile.fullName}</Label>
              <div className="flex gap-3">
                <Input id="full-name" name="full-name" defaultValue={name ?? ""} className="flex-1" />
                <Button type="submit" variant="inverted" className="shrink-0">
                  {dict.common.save}
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="settings-email">{dict.settings.profile.email}</Label>
              <Input id="settings-email" name="email" defaultValue={email} disabled />
            </div>
          </form>

          {/* Desktop reaches this via the header's user menu, which is hidden on mobile. */}
          <form action={logout} className="mt-5 sm:hidden">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-destructive"
            >
              <LogOut className="size-4" />
              {dict.common.logOut}
            </button>
          </form>
        </SettingsSection>

        <SettingsSection title={dict.settings.billing.title} description={dict.settings.billing.description}>
          <BillingSection subscription={subscription} dict={dict.settings.billing} cancelLabel={dict.common.cancel} />
        </SettingsSection>

        <SettingsSection
          title={dict.settings.notifications.title}
          description={dict.settings.notifications.description}
        >
          <NotificationsForm prefs={notificationPrefs} dict={dict.settings.notifications} />
        </SettingsSection>

        <SettingsSection
          title={dict.settings.pushNotifications.title}
          description={dict.settings.pushNotifications.description}
        >
          <PushNotificationsForm
            prefs={pushPrefs}
            vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
            dict={dict.settings.pushNotifications}
          />
        </SettingsSection>

        <SettingsSection
          title={dict.settings.preferences.title}
          description={dict.settings.preferences.description}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PreferencesForm
              distanceUnit={distanceUnit}
              language={locale}
              prefs={dict.settings.preferences}
            />
            <div className="space-y-1.5">
              <Label htmlFor="theme-preference">{dict.settings.preferences.theme}</Label>
              <ThemeSelect prefs={dict.settings.preferences} />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title={dict.settings.connectedAccounts.title}
          description={dict.settings.connectedAccounts.description}
        >
          <div className="flex items-center gap-3 rounded-sm bg-muted px-3.5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-inset ring-border">
              <GoogleIcon className="size-4" />
            </span>
            <span className="text-sm font-semibold">{dict.settings.connectedAccounts.google}</span>
            {isGoogleUser && (
              <span className="ml-auto shrink-0 rounded-[7px] bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                {dict.settings.connectedAccounts.connected}
              </span>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title={dict.settings.strava.title} description={dict.settings.strava.description}>
          <div className="flex flex-col gap-2 rounded-sm bg-muted px-3.5 py-3">
            {/* Connected, the row stays one line — the pill is small. Not
                connected, Strava's button is a fixed 237px that we may not
                shrink, so below sm it takes a line of its own. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* No glyph beside the name. It was a mark we drew ourselves,
                  sitting a couple of centimetres above Strava's own button —
                  and with the section title, this label and the button, it was
                  the fourth time the word appeared in one card. */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{dict.settings.strava.strava}</span>
                {isStravaConnected && (
                  <span className="ml-auto shrink-0 rounded-[7px] bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                    {dict.settings.strava.connected}
                  </span>
                )}
              </div>
              {!isStravaConnected && (
                <form action={connectStrava} className="sm:ml-auto">
                  <ConnectWithStravaButton label={dict.settings.strava.connect} />
                </form>
              )}
            </div>
            {isStravaConnected && (
              <div className="flex items-center justify-between gap-3">
                {stravaConnection?.athlete_id != null && (
                  <StravaAthleteId
                    athleteId={String(stravaConnection.athlete_id)}
                    idLabel={dict.settings.strava.athleteIdLabel}
                    showLabel={dict.settings.strava.showAthleteId}
                    hideLabel={dict.settings.strava.hideAthleteId}
                  />
                )}
                <form action={disconnectStrava} className="ml-auto">
                  <Button type="submit" variant="outline" size="sm">
                    {dict.settings.strava.disconnect}
                  </Button>
                </form>
              </div>
            )}
          </div>
          {/* Only with a connection: a switch that writes to Strava is
              meaningless without one, and it asks for a permission the
              connect button deliberately does not. */}
          {isStravaConnected && (
            <div className="mt-4">
              <StravaActivityNoteForm
                enabled={activityNoteEnabled}
                hasWriteScope={hasStravaWriteScope(stravaConnection?.scopes)}
                dict={dict.settings.strava}
              />
            </div>
          )}
        </SettingsSection>

        <SettingsSection title={dict.settings.installApp.title} description={dict.settings.installApp.description}>
          <InstallAppButton
            installButtonLabel={dict.settings.installApp.installButton}
            installedLabel={dict.settings.installApp.installed}
            iosInstructions={dict.settings.installApp.iosInstructions}
          />
        </SettingsSection>

        <SettingsSection title={dict.settings.about.title}>
          <div className="flex flex-col divide-y divide-border">
            <AboutRow
              icon={<OnboardingIcon className="h-6 w-auto" />}
              title={dict.settings.about.onboarding.title}
              subtitle={dict.settings.about.onboarding.subtitle}
              href="/dashboard?onboarding=1"
            />
            <AboutRow
              icon={<SecurityIcon className="h-6 w-auto" />}
              title={dict.settings.about.privacy.title}
              subtitle={dict.settings.about.privacy.subtitle}
              href="/legal/privacy"
            />
            <AboutRow
              icon={<TermsIcon className="h-6 w-auto" />}
              title={dict.settings.about.terms.title}
              subtitle={dict.settings.about.terms.subtitle}
              href="/legal/terms"
            />
            <AboutRow
              icon={<SupportIcon className="h-6 w-auto" />}
              title={dict.settings.about.support.title}
              subtitle={dict.settings.about.support.subtitle}
              href="/help/support"
            />
            <AboutRow
              icon={<DocsIcon className="h-6 w-auto" />}
              title={dict.settings.about.docs.title}
              subtitle={dict.settings.about.docs.subtitle}
              href="/help/docs"
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title={dict.settings.dangerZone.title}
          description={dict.settings.dangerZone.description}
        >
          <DeleteAccountButton
            action={deleteAccount}
            email={email}
            title={dict.settings.dangerZone.confirmTitle}
            description={dict.settings.dangerZone.confirmDescription}
            confirmHint={dict.settings.dangerZone.confirmHint(email)}
            confirmLabel={dict.settings.dangerZone.confirmButton}
            triggerLabel={dict.settings.dangerZone.deleteAccount}
            cancelLabel={dict.settings.dangerZone.cancel}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
