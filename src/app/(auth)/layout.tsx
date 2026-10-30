import { PublicAnalytics } from "@/components/public-analytics";
import { SiteFooter } from "@/components/site-footer";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center auth-dots p-6">
      <div className="w-full max-w-sm">{children}</div>
      <SiteFooter />
      <PublicAnalytics />
    </div>
  );
}
