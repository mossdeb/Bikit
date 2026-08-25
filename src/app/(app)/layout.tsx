import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { HeaderLogo } from "@/components/header-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { HeaderBackButton, HeaderEditButton } from "@/components/header-back-button";
import { AppHeader } from "@/components/app-header";
import { AppMain } from "@/components/app-main";
import { ToastProvider, Toaster } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Defense in depth: proxy.ts already redirects unauthenticated requests,
  // but Server Components can't rely solely on that — verify again here.
  if (!user) {
    redirect("/login");
  }

  const dict = getDictionary(localeFromMetadata(user.user_metadata));

  return (
    <ToastProvider>
      {/* `data-app-shell` is a hook, not a style: it is the element that
          paints the page's background, and the IMU lab's dot texture needs
          to reach exactly it (see globals.css). No rule matches it
          anywhere else. */}
      <div data-app-shell className="flex min-h-dvh bg-background">
        <AppSidebar nav={dict.nav} />
        <div className="mx-auto flex min-w-0 w-full max-w-[1440px] flex-1 flex-col">
          <AppHeader>
            <HeaderBackButton />
            <HeaderEditButton />
            <HeaderLogo />
            <div className="hidden items-center gap-3 sm:flex">
              <ThemeToggle />
              <NotificationBell notifications={dict.notifications} />
              <UserMenu name={user.user_metadata?.full_name} email={user.email as string} common={dict.common} />
            </div>
          </AppHeader>
          <AppMain>{children}</AppMain>
        </div>
        <MobileNav nav={dict.nav} />
      </div>
      <Toaster />
    </ToastProvider>
  );
}
