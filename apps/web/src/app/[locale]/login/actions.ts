"use server";

import {headers} from "next/headers";
import {redirect} from "next/navigation";

import {brand} from "@/config/brand";
import {routing, type AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData): AppLocale {
  const value = formValue(formData, "locale");
  return routing.locales.includes(value as AppLocale) ? value as AppLocale : routing.defaultLocale;
}

async function redirectOrigin() {
  const requestHeaders = await headers();
  return requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? brand.url;
}

export async function signInWithPassword(formData: FormData) {
  const locale = localeFrom(formData);
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);

  const {error} = await supabase.auth.signInWithPassword({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
  });

  if (error) redirect(`/${locale}/login?error=credentials`);
  redirect(`/${locale}/app`);
}

export async function createAccount(formData: FormData) {
  const locale = localeFrom(formData);
  const password = formValue(formData, "password");
  if (password.length < 10) redirect(`/${locale}/login?error=credentials`);

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);

  const origin = await redirectOrigin();
  const {data, error} = await supabase.auth.signUp({
    email: formValue(formData, "email"),
    password,
    options: {
      emailRedirectTo: `${origin}/${locale}/auth/confirm?next=/${locale}/onboarding`,
      data: {locale},
    },
  });

  if (error) redirect(`/${locale}/login?error=credentials`);
  if (data.session) redirect(`/${locale}/onboarding`);
  redirect(`/${locale}/login?sent=1`);
}

export async function sendMagicLink(formData: FormData) {
  const locale = localeFrom(formData);
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);

  const origin = await redirectOrigin();
  const {error} = await supabase.auth.signInWithOtp({
    email: formValue(formData, "email"),
    options: {
      emailRedirectTo: `${origin}/${locale}/auth/confirm?next=/${locale}/onboarding`,
      shouldCreateUser: true,
      data: {locale},
    },
  });

  if (error) redirect(`/${locale}/login?error=credentials`);
  redirect(`/${locale}/login?sent=1`);
}
