import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { homePathFor, BETA_PATH } from "@/lib/areas";
import { createClient } from "@/lib/supabase/server";
import { localeFromMetadata } from "@/lib/i18n";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

const COPY = {
  en: {
    status: "Pending validation",
    title: "Coming soon",
    body: "Bikit Pro is in beta and only open to selected users for now. Your account is waiting to be validated — we'll let you know when it's in.",
    signedInAs: "Signed in as",
    signOut: "Sign out",
  },
  pt: {
    status: "Pendente de validação",
    title: "Em breve",
    body: "O Bikit Pro está em versão beta, disponível apenas para utilizadores selecionados. A tua conta está pendente de validação — avisamos-te quando estiver ativa.",
    signedInAs: "Sessão iniciada como",
    signOut: "Terminar sessão",
  },
};

/**
 * Where a signed-in account the Pro is not open to waits (2026-10-23),
 * while the maintenance app is hidden and the Pro is a closed beta.
 */
export default async function BetaPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  if (!user) redirect("/login");
  const email = user.email as string | undefined;
  // The proxy already sends anyone else home; checked again here.
  const home = homePathFor(email);
  if (home !== BETA_PATH) redirect(home);

  const t = COPY[localeFromMetadata(user.user_metadata)];

  return (
    <div className={`rounded-lg bg-card p-8 text-center shadow-sm ${DARK_CARD_HAIRLINE}`}>
      <div className="flex flex-col items-center">
        <LogoMark className="mb-4" />
        <span className="mb-3 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
          {t.status}
        </span>
        <h1 className="text-xl font-display font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
      </div>

      {email && (
        <p className="mt-6 text-xs text-muted-foreground">
          {t.signedInAs} <span className="font-semibold text-foreground">{email}</span>
        </p>
      )}

      <form action={logout} className="mt-4">
        <Button type="submit" variant="outline" className="w-full" size="lg">
          {t.signOut}
        </Button>
      </form>
    </div>
  );
}
