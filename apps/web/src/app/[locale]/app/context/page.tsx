import {getTranslations} from "next-intl/server";

import {professionalContextCopy} from "@/components/professional-context-copy";
import {ProfessionalContextForm} from "@/components/professional-context-form";
import {requireWorkspace} from "@/lib/auth/workspace";

import {updateProfessionalContextAction} from "./actions";

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{saved?: string; error?: string}>;
};

export default async function ProfessionalContextPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "ProfessionalContext"});
  const {supabase, organization, userId} = await requireWorkspace(locale);
  const [{data: profile}, {data: institution}] = await Promise.all([
    supabase.from("professional_context_profiles")
      .select("use_forms, professional_roles, practice_areas, primary_objectives, institution_name")
      .eq("organization_id", organization.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("institution_capability_profiles")
      .select("institution_name")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  return (
    <main className="app-canvas app-canvas--professional-context">
      <header className="app-page-header app-page-header--compact">
        <div><h1>{t("settingsTitle")}</h1><p>{t("settingsBody")}</p></div>
      </header>
      {state.saved ? <p className="form-notice form-notice--success" role="status">{t("saved")}</p> : null}
      {state.error ? <p className="form-notice form-notice--error" role="alert">{t("error")}</p> : null}
      <ProfessionalContextForm
        action={updateProfessionalContextAction}
        copy={professionalContextCopy(t)}
        initial={{
          useForms: profile?.use_forms ?? [],
          professionalRoles: profile?.professional_roles ?? [],
          practiceAreas: profile?.practice_areas ?? [],
          primaryObjectives: profile?.primary_objectives ?? [],
          institutionName: profile?.institution_name ?? institution?.institution_name,
        }}
        locale={locale}
        mode="settings"
      />
    </main>
  );
}
