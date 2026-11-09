"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissPrivacyNotice } from "@/lib/actions/privacy-notice";

/**
 * The privacy policy's update, told once (src/lib/privacy-notice.ts): a
 * card in the corner of the signed-in app, over the page but not in its
 * way, until "Got it". Above the phone's bottom bar on a phone.
 */
export function PrivacyNoticeBanner({
  text,
}: {
  text: { title: string; body: string; read: string; ok: string };
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 rounded-lg bg-card p-5 shadow-lg ring-1 ring-foreground/10 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-md"
    >
      <p className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-4 shrink-0" />
        {text.title}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{text.body}</p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          className="rounded-full"
          render={<Link href="/privacy" target="_blank" />}
          nativeButton={false}
        >
          {text.read}
        </Button>
        <Button
          variant="inverted"
          className="rounded-full px-6"
          onClick={() => {
            setOpen(false);
            void dismissPrivacyNotice();
          }}
        >
          {text.ok}
        </Button>
      </div>
    </div>
  );
}
