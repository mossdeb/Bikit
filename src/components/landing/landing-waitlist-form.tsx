"use client";

import { useState, useTransition, type FormEvent } from "react";
import { joinWaitlist } from "@/lib/actions/waitlist";
import type { LandingDictionary } from "@/components/landing/i18n/en";
import type { LandingLocale } from "@/components/landing/i18n";

export function LandingWaitlistForm({
  dict,
  locale,
}: {
  dict: LandingDictionary["home"]["hero"];
  locale: LandingLocale;
}) {
  const [status, setStatus] = useState<"idle" | "sent" | "invalid" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const { status: result } = await joinWaitlist({
        email: String(form.get("email") ?? ""),
        // Left empty by people; filled in by the bots that fill in everything.
        website: String(form.get("website") ?? ""),
        locale,
      });
      setStatus(result);
    });
  }

  if (status === "sent") {
    return (
      <p role="status" className="text-center text-base font-bold text-[#43F3AF]">
        {dict.success}
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-[523px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-[38px]">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={dict.emailPlaceholder}
          aria-label={dict.emailLabel}
          className="h-[52px] w-full min-w-0 rounded-[12px] border border-white bg-transparent px-6 text-[14.7px] font-bold text-white outline-none placeholder:text-white focus-visible:ring-2 focus-visible:ring-[#43F3AF] sm:flex-1"
        />
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px opacity-0"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex h-[52px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#43F3AF] px-[35px] text-[14.7px] font-bold whitespace-nowrap text-[#101014] transition-opacity hover:opacity-90 disabled:opacity-70"
        >
          {pending ? dict.sending : dict.submit}
          <svg viewBox="0 0 15 15" fill="none" className="size-[15px]" aria-hidden="true">
            <path
              d="M3 7.5h9M8.5 4l3.5 3.5L8.5 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {(status === "invalid" || status === "failed") && (
        <p role="alert" className="mt-3 text-center text-sm font-medium text-white">
          {status === "invalid" ? dict.invalid : dict.failed}
        </p>
      )}
    </form>
  );
}
