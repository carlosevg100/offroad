"use server";

import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {z} from "zod";

import {createClient} from "@/lib/supabase/server";

const recoveryCookie = "offroad_recovery_email";

function localeValue(formData: FormData) {
  return String(formData.get("locale")) === "en-US" ? "en-US" : "pt-BR";
}

export async function requestPasswordCode(formData: FormData) {
  const locale = localeValue(formData);
  const parsed = z.email().max(254).safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) redirect(`/${locale}/forgot-password?error=validation`);

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/forgot-password?error=provider`);
  const {error} = await supabase.auth.resetPasswordForEmail(parsed.data);
  if (error) redirect(`/${locale}/forgot-password?error=request`);

  (await cookies()).set(recoveryCookie, parsed.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/${locale}`,
    maxAge: 15 * 60,
    priority: "high",
  });
  redirect(`/${locale}/forgot-password/verify`);
}

export async function verifyPasswordCode(formData: FormData) {
  const locale = localeValue(formData);
  const token = String(formData.get("token") ?? "").replace(/\D/g, "");
  const email = (await cookies()).get(recoveryCookie)?.value;
  if (!email || !/^\d{6}$/.test(token)) redirect(`/${locale}/forgot-password/verify?error=code`);

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/forgot-password/verify?error=provider`);
  const {error} = await supabase.auth.verifyOtp({email, token, type: "recovery"});
  if (error) redirect(`/${locale}/forgot-password/verify?error=code`);
  redirect(`/${locale}/forgot-password/update`);
}

export async function updatePassword(formData: FormData) {
  const locale = localeValue(formData);
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");
  if (password !== confirmation || password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    redirect(`/${locale}/forgot-password/update?error=password`);
  }

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/forgot-password/update?error=provider`);
  const {data: claims} = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/${locale}/forgot-password?error=session`);
  const {error} = await supabase.auth.updateUser({password});
  if (error) redirect(`/${locale}/forgot-password/update?error=password`);

  (await cookies()).delete(recoveryCookie);
  redirect(`/${locale}/login?reset=1`);
}
