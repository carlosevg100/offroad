"use server";

import {redirect} from "next/navigation";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function createOpportunity(formData: FormData) {
  const rawLocale = value(formData, "locale");
  const locale = routing.locales.includes(rawLocale as AppLocale) ? rawLocale as AppLocale : routing.defaultLocale;
  const {supabase, organization} = await requireWorkspace(locale);
  const amount = value(formData, "requested_amount").replace(",", ".");
  const term = Number(value(formData, "desired_term_months"));

  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(amount) || !Number.isInteger(term) || term < 1 || term > 360) {
    redirect(`/${locale}/app/new?error=1`);
  }

  const {data, error} = await supabase.rpc("create_opportunity_intake", {
    p_organization_id: organization.id,
    p_legal_name: value(formData, "legal_name"),
    p_sector: value(formData, "sector"),
    p_purpose: value(formData, "purpose"),
    // PostgREST accepts numeric strings and preserves decimal precision.
    p_requested_amount: amount as unknown as number,
    p_currency: value(formData, "currency"),
    p_desired_term_months: term,
    p_output_locale: locale,
  });

  if (error || !data) redirect(`/${locale}/app/new?error=1`);
  redirect(`/${locale}/app/opportunities/${data}`);
}
