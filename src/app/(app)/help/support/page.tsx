import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { SUPPORT_EMAIL, CONTACT_EMAIL } from "@/lib/contact";

/**
 * Where to write, and which address to pick.
 *
 * Built like the legal documents inside the app rather than as a form: there
 * is no ticket system behind this, and a form that only composes an email
 * would hide the address someone may want to write to from their own client.
 */
async function resolve() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const dict = getDictionary(localeFromMetadata(data?.claims?.user_metadata));
  return { dict, page: dict.settings.supportPage };
}

export async function generateMetadata(): Promise<Metadata> {
  const { page } = await resolve();
  return { title: page.metaTitle, description: page.metaDescription };
}

function MailBlock({ heading, body, email }: { heading: string; body: string; email: string }) {
  return (
    <div className="rounded-[20px] border border-border p-6">
      <h2 className="font-display text-[18px] leading-[26px] font-bold text-foreground">{heading}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <a
        href={`mailto:${email}`}
        className="mt-4 inline-block font-display text-base font-bold break-all text-foreground underline underline-offset-4"
      >
        {email}
      </a>
    </div>
  );
}

export default async function SupportPage() {
  const { dict, page } = await resolve();

  // Rendered twice rather than moved: on mobile the title belongs to the card,
  // on desktop it titles the page above it, and CSS can't reparent an element.
  // Only one of the two is ever visible — the same arrangement as /legal/*.
  const heading = (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold">{page.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{page.subtitle}</p>
    </div>
  );

  return (
    <div className="pt-4 sm:pt-8">
      <div className="hidden text-sm text-muted-foreground sm:mb-2 sm:block">
        <Link href="/settings" className="hover:text-foreground">
          {dict.settings.title}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{page.title}</span>
      </div>

      <div className="hidden sm:block">{heading}</div>

      <article className="rounded-lg bg-card px-5 py-6 sm:px-6">
        <div className="sm:hidden">{heading}</div>
        <div className="space-y-4">
          <MailBlock heading={page.helpHeading} body={page.helpBody} email={SUPPORT_EMAIL} />
          <MailBlock heading={page.ideasHeading} body={page.ideasBody} email={CONTACT_EMAIL} />
        </div>
      </article>
    </div>
  );
}
