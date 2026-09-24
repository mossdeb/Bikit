import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { hasLabAccess } from "@/lib/lab-access";
import { ProSidebar, ProMobileNav } from "@/components/pro-nav";
import { BikitLockup } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { HeaderBackButton } from "@/components/header-back-button";
import { AppHeader } from "@/components/app-header";
import { AppMain } from "@/components/app-main";
import { ImuLabTexture } from "@/components/imu-lab-texture";
import { ToastProvider, Toaster } from "@/components/ui/toast";

/**
 * Bikit Pro's shell (2026-09-23): the same account as the app, a
 * different area with its own rail, phone bar, lockup and ground. Decided
 * against a second login: the sessions point at the account's bikes, the
 * setups at their dampers and the rider at the account, and a separate
 * identity would cut every one of those threads. What is separate is the
 * product — its door, its navigation, its home — not who is at the door.
 *
 * Gated as every page under it is (hasLabAccess → notFound): to an
 * account that may not see this, the area does not exist. The pages keep
 * their own check as well, because a server action or a link can reach
 * them without passing through here.
 *
 * The lab's dot texture is mounted once here rather than page by page —
 * its class is toggled on mount, and two mounts would take it off when
 * one page left.
 */
export default async function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  if (!user) redirect("/login");
  if (!hasLabAccess(user.email as string | undefined)) notFound();

  const dict = getDictionary(localeFromMetadata(user.user_metadata));

  return (
    <ToastProvider>
      <ImuLabTexture />
      {/* `data-app-shell`: the element that paints the background, which
          the texture's rule in globals.css reaches. */}
      <div data-app-shell className="flex min-h-dvh bg-background">
        <ProSidebar />
        <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col">
          <AppHeader>
            <HeaderBackButton />
            <BikitLockup pro className="h-8 w-auto sm:hidden" />
            <div className="hidden items-center gap-3 sm:flex">
              <ThemeToggle />
              <NotificationBell notifications={dict.notifications} />
              <UserMenu
                name={user.user_metadata?.full_name}
                email={user.email as string}
                common={dict.common}
                settingsHref="/pro/definicoes"
              />
            </div>
          </AppHeader>
          <AppMain>{children}</AppMain>
        </div>
        <ProMobileNav />
      </div>
      <Toaster />
    </ToastProvider>
  );
}
