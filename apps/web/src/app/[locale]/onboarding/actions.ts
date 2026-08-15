"use server";

import {redirect} from "next/navigation";

import {routing, type AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function completeOnboarding(formData: FormData) {
  const rawLocale = value(formData, "locale");
  const locale = routing.locales.includes(rawLocale as AppLocale) ? rawLocale as AppLocale : routing.defaultLocale;
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/onboarding?error=1`);

  const {data: claimsData, error: claimsError} = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) redirect(`/${locale}/login`);

  const {error} = await supabase.rpc("complete_onboarding", {
    p_journey: value(formData, "journey"),
    p_name: value(formData, "organization_name"),
    p_legal_name: value(formData, "legal_name"),
    p_country_code: value(formData, "country_code") || "BR",
    p_website: value(formData, "website"),
  });

  if (error) redirect(`/${locale}/onboarding?error=1`);
  redirect(`/${locale}/app`);
}
