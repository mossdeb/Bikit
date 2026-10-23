import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <CircleAlert className="size-6 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-display font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This bike, component, or entry doesn&apos;t exist — it may have been deleted, or the link
        might be wrong.
      </p>
      <Button render={<Link href="/" />} nativeButton={false} className="mt-6">
        Back to dashboard
      </Button>
    </div>
  );
}
