"use server";

import {redirect} from "next/navigation";

import {routing, type AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData): AppLocale {
  const value = formValue(formData, "locale");
  return routing.locales.includes(value as AppLocale) ? value as AppLocale : routing.defaultLocale;
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
