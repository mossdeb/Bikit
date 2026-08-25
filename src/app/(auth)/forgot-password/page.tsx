import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/actions/auth";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;

  if (success) {
    return (
      <div className={`rounded-lg bg-card p-8 text-center shadow-sm ${DARK_CARD_HAIRLINE}`}>
        <LogoMark className="mx-auto mb-4" />
        <h1 className="text-xl font-display font-bold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If an account exists for that address, we&apos;ve sent a link to reset your password.
        </p>
        <Button
          render={<Link href="/login" />}
          nativeButton={false}
          className="mt-6 w-full"
          size="lg"
          variant="outline"
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className={`rounded-lg bg-card p-8 shadow-sm ${DARK_CARD_HAIRLINE}`}>
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark className="mb-4" />
        <h1 className="text-xl font-display font-bold tracking-tight">Forgot your password?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
      </div>

      <form action={requestPasswordReset} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" required />
        </div>
        <Button type="submit" className="w-full" size="lg">
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
