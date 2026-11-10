import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { anekLatin } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bikit",
  description: "Track maintenance, services, and repairs for your bikes.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bikit",
  },
};

export const viewport: Viewport = {
  themeColor: "#101014",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${anekLatin.variable}`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
