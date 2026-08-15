"use server";

import {redirect} from "next/navigation";

import {routing, type AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";

export async function signOut(formData: FormData) {
  const rawLocale = String(formData.get("locale") ?? "");
  const locale = routing.locales.includes(rawLocale as AppLocale) ? rawLocale as AppLocale : routing.defaultLocale;
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect(`/${locale}`);
}
