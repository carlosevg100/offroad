"use server";

import {randomUUID} from "node:crypto";

import {companyDebtViewBriefSchema} from "@offroad/domain-contracts";
import {redirect} from "next/navigation";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {compiledCapitalProjectPlan} from "@/lib/capital-project/plan";
import {normalizeCompanyWebsite} from "@/lib/intake/company-profile";
import type {Json} from "@/types/database";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData): AppLocale {
  const raw = value(formData, "locale");
  return routing.locales.includes(raw as AppLocale) ? raw as AppLocale : routing.defaultLocale;
}

const setupSchema = z.object({
  requestId: z.uuid(),
  projectName: z.string().trim().min(2).max(80),
  companyName: z.string().trim().min(2).max(160),
  companyWebsite: z.union([z.literal(""), z.url().max(500)]),
  brief: companyDebtViewBriefSchema,
});

function setupUrl(locale: string, error?: string): string {
  return `/${locale}/app/new/company-debt${error ? `?error=${error}` : ""}`;
}

export async function startPublicCompanyDebtView(formData: FormData) {
  const locale = localeFrom(formData);
  const focus = value(formData, "focus");
  const knownContext = value(formData, "known_context");
  const parsed = setupSchema.safeParse({
    requestId: value(formData, "request_id") || randomUUID(),
    projectName: value(formData, "project_name"),
    companyName: value(formData, "company_name"),
    companyWebsite: normalizeCompanyWebsite(value(formData, "company_website")),
    brief: {
      ...(focus ? {focus} : {}),
      ...(knownContext ? {knownContext} : {}),
    },
  });
  if (!parsed.success) redirect(setupUrl(locale, "validation"));

  const {supabase, organization} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);

  const {data, error} = await supabase.rpc("start_public_company_debt_view_v1", {
    p_request_id: parsed.data.requestId,
    p_locale: locale,
    p_project_name: parsed.data.projectName,
    p_company_name: parsed.data.companyName,
    p_company_website: parsed.data.companyWebsite || "",
    p_brief: parsed.data.brief as unknown as Json,
    p_plan: compiledCapitalProjectPlan("company_debt_view"),
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    const code = error?.message.includes("project_name_already_in_use") ? "duplicate" : "save";
    redirect(setupUrl(locale, code));
  }
  const projectId = "capital_project_id" in data && typeof data.capital_project_id === "string"
    ? data.capital_project_id
    : "";
  if (!projectId) redirect(setupUrl(locale, "save"));
  redirect(`/${locale}/app/projects/${projectId}`);
}
