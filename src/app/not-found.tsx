import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <LogoMark className="mb-4" />
      <h1 className="text-xl font-display font-bold">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        That page doesn&apos;t exist. Check the link, or head back to Bikit.
      </p>
      <Button render={<Link href="/" />} nativeButton={false} className="mt-6">
        Back to Bikit
      </Button>
    </div>
  );
}
