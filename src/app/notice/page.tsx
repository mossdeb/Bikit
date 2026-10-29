import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConfidentialityNotice } from "@/components/confidentiality-notice";
import { SiteFooter } from "@/components/site-footer";
import { NOTICE_COOKIE, noticeNext } from "@/lib/notice";

export const metadata: Metadata = { title: "Confidentiality notice" };

/**
 * The confidentiality notice's own page (src/lib/notice.ts): the proxy sends
 * every page here after a sign-in until it is confirmed. Once it is — or
 * with no sign-in waiting on it — straight on to `next`.
 */
export default async function NoticePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = noticeNext((await searchParams).next);
  if (!(await cookies()).has(NOTICE_COOKIE)) redirect(next);

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 py-8 sm:justify-center sm:p-6">
      <ConfidentialityNotice next={next} />
      <SiteFooter />
    </div>
  );
}
