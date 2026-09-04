"use server";

import {redirect} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {parseProfessionalContextForm} from "@/lib/professional-context";
import {reportServerFailure} from "@/lib/observability/report";

export async function updateProfessionalContextAction(formData: FormData) {
  const locale: AppLocale = String(formData.get("locale")) === "en-US" ? "en-US" : "pt-BR";
  const parsed = parseProfessionalContextForm(formData);
  if (!parsed.success) redirect(`/${locale}/app/context?error=validation`);

  const {supabase, organization} = await requireWorkspace(locale);
  const {error} = await supabase.rpc("save_professional_capability_context_v2", {
    p_organization_id: organization.id,
    p_use_forms: parsed.data.useForms,
    p_professional_roles: parsed.data.professionalRoles,
    p_practice_areas: parsed.data.practiceAreas,
    p_primary_objectives: parsed.data.primaryObjectives,
    p_institution_name: parsed.data.institutionName,
    p_skip: false,
  });
  if (error) {
    reportServerFailure({step: "workspace.update_professional_context", error});
    redirect(`/${locale}/app/context?error=save`);
  }
  redirect(`/${locale}/app/context?saved=1`);
}
