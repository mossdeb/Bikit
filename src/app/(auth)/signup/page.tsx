import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { GoogleIcon } from "@/components/google-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup, signInWithGoogle } from "@/lib/actions/auth";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  if (success) {
    return (
      <div className={`rounded-lg bg-card p-8 text-center shadow-sm ${DARK_CARD_HAIRLINE}`}>
        <LogoMark className="mx-auto mb-4" />
        <h1 className="text-xl font-display font-bold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent you a confirmation link. Click it to activate your account and sign in.
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
        <h1 className="text-xl font-display font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start logging your bikes&apos; maintenance in minutes.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" className="w-full" size="lg">
          <GoogleIcon className="size-4" />
          Continue with Google
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <form action={signup} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" type="text" placeholder="Rider Name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
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
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
