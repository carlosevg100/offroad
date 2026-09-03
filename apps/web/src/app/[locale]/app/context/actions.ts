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
  const {error} = await supabase.rpc("save_professional_capability_context_v1", {
    p_organization_id: organization.id,
    p_affiliation_kind: parsed.data.affiliationKind,
    p_professional_role: parsed.data.professionalRole,
    p_team_name: parsed.data.teamName,
    p_primary_objectives: parsed.data.primaryObjectives,
    p_institution_name: parsed.data.institutionName,
    p_operating_models: parsed.data.operatingModels,
    p_product_families: parsed.data.productFamilies,
    p_capability_notes: parsed.data.capabilityNotes,
    p_skip: false,
  });
  if (error) {
    reportServerFailure({step: "workspace.update_professional_context", error});
    redirect(`/${locale}/app/context?error=save`);
  }
  redirect(`/${locale}/app/context?saved=1`);
}
