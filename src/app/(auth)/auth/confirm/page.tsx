import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { confirmEmail } from "@/lib/actions/auth";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <div className={`rounded-lg bg-card p-8 text-center shadow-sm ${DARK_CARD_HAIRLINE}`}>
        <LogoMark className="mx-auto mb-4" />
        <h1 className="text-xl font-display font-bold tracking-tight">Link invalid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This link is missing some information. Please request a new one.
        </p>
      </div>
    );
  }

  const isRecovery = type === "recovery";

  return (
    <div className={`rounded-lg bg-card p-8 text-center shadow-sm ${DARK_CARD_HAIRLINE}`}>
      <LogoMark className="mx-auto mb-4" />
      <h1 className="text-xl font-display font-bold tracking-tight">
        {isRecovery ? "Reset your password" : "Confirm your email"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isRecovery
          ? "Click below to continue resetting your password."
          : "Click below to confirm your email address."}
      </p>

      {/*
        This step exists so verifyOtp only runs on a real user click, not on
        page load — email security scanners (e.g. Outlook Safe Links) fetch
        links automatically and would otherwise burn the one-time token
        before the user gets to it.
      */}
      <form action={confirmEmail} className="mt-6">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        {next && <input type="hidden" name="next" value={next} />}
        <Button type="submit" className="w-full" size="lg">
          {isRecovery ? "Continue" : "Confirm email"}
        </Button>
      </form>
    </div>
  );
}
