import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/actions/auth";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className={`rounded-lg bg-card p-8 shadow-sm ${DARK_CARD_HAIRLINE}`}>
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark className="mb-4" />
        <h1 className="text-xl font-display font-bold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a new password for your account.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <form action={resetPassword} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </div>
        <Button type="submit" className="w-full" size="lg">
          Update password
        </Button>
      </form>
    </div>
  );
}
