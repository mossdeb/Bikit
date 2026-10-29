"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { NOTICE_COOKIE, NOTICE_COOKIE_OPTIONS } from "@/lib/notice";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // The confidentiality notice, after every sign-in.
  (await cookies()).set(NOTICE_COOKIE, "1", NOTICE_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/signup?success=1");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(NOTICE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const origin = (await headers()).get("origin");

  // Errors aren't surfaced here on purpose — always showing the same
  // "check your email" state avoids revealing whether an address has an
  // account.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  redirect("/forgot-password?success=1");
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function confirmEmail(formData: FormData) {
  const supabase = await createClient();
  const token_hash = formData.get("token_hash") as string;
  const type = formData.get("type") as EmailOtpType;
  const next = (formData.get("next") as string) || "/";

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    redirect("/login?error=confirmation-failed");
  }

  (await cookies()).set(NOTICE_COOKIE, "1", NOTICE_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth-error");
  }

  redirect(data.url);
}
