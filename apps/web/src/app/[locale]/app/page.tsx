import {Building2, CheckCircle2, CircleAlert, Landmark, Target} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {AdvisorStart, type AdvisorStartCopy} from "@/components/advisor/advisor-start";
import {requireWorkspace} from "@/lib/auth/workspace";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{welcome?: string; group?: string}>};

export default async function ApplicationHome({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "App"});
  const {supabase, organization, userId} = await requireWorkspace(locale);
  const {data: selectedGroup} = state.group
    ? await supabase.from("workspace_project_groups")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("id", state.group)
        .is("archived_at", null)
        .maybeSingle()
    : {data: null};

  if (organization.organization_type === "capital_provider") {
    const [{data: funds}, {data: mandates}, {data: contacts}, {data: requests}] = await Promise.all([
      supabase.from("funds").select("id, name, strategy, status, updated_at").eq("organization_id", organization.id).order("updated_at", {ascending: false}),
      supabase.from("mandate_versions").select("id, fund_id, version_number, status, valid_from, valid_until, constraints").eq("organization_id", organization.id).order("created_at", {ascending: false}),
      supabase.from("provider_contacts").select("id, full_name, email, status").eq("organization_id", organization.id).eq("status", "active"),
      supabase.from("access_requests").select("id, status").eq("organization_id", organization.id),
    ]);
    const activeMandates = mandates?.filter((item) => item.status === "active") ?? [];
    const openRequests = requests?.filter((item) => item.status === "pending") ?? [];

    return (
      <main className="app-canvas">
        <header className="app-page-header">
          <div><p className="section-kicker">{t("providerEyebrow")}</p><h1>{t("providerWelcome")}</h1><p>{t("providerWelcomeBody")}</p></div>
          <Link className="button" href="#funds"><Target aria-hidden="true" size={16} />{t("viewMandates")}</Link>
        </header>
        {state.welcome === "1" ? <p className="form-notice form-notice--success app-welcome-notice" role="status">{t("welcomeComplete")}</p> : null}
        <section aria-label={t("providerPortfolio")} className="app-stat-grid">
          <article><Landmark aria-hidden="true" size={18} /><span>{t("registeredFunds")}</span><strong>{funds?.length ?? 0}</strong></article>
          <article><Target aria-hidden="true" size={18} /><span>{t("activeMandates")}</span><strong>{activeMandates.length}</strong></article>
          <article><Building2 aria-hidden="true" size={18} /><span>{t("qualifiedFlow")}</span><strong>0</strong></article>
          <article><CircleAlert aria-hidden="true" size={18} /><span>{t("accessRequests")}</span><strong>{openRequests.length}</strong></article>
        </section>
        <section className="pipeline-section" id="funds">
          <div className="pipeline-section__header"><h2>{t("fundsAndMandates")}</h2><span>{organization.name}</span></div>
          {(funds?.length ?? 0) === 0 ? <div className="empty-state"><span className="empty-state__number">01</span><div><h3>{t("emptyFundTitle")}</h3><p>{t("emptyFundBody")}</p></div></div> : (
            <div className="opportunity-table" role="list">
              {funds?.map((fund) => {
                const mandate = mandates?.find((item) => item.fund_id === fund.id);
                return <div className="provider-row" key={fund.id} role="listitem"><div><span>{fund.status}</span><strong>{fund.name}</strong><small>{fund.strategy}</small></div><div><span>{t("mandate")}</span><strong>{mandate ? `${t("version")} ${mandate.version_number}` : t("notRegistered")}</strong></div><div><span>{t("status")}</span><strong>{mandate?.status ?? t("notRegistered")}</strong></div><CheckCircle2 aria-hidden="true" size={16} /></div>;
              })}
            </div>
          )}
        </section>
        <section className="provider-contact-strip"><div><span>{t("routingContacts")}</span><strong>{contacts?.length ?? 0}</strong></div><p>{t("routingContactsBody")}</p></section>
      </main>
    );
  }

  const copy: AdvisorStartCopy = {
    kicker: t("advisor.kicker"),
    title: t("advisor.title"),
    body: t("advisor.body"),
    prompt: t("advisor.prompt"),
    starterLabel: t("advisor.starterLabel"),
    starters: {
      company_debt_view: {label: t("advisor.starters.companyDebt.label"), placeholder: t("advisor.starters.companyDebt.placeholder")},
      origination_thesis: {label: t("advisor.starters.origination.label"), placeholder: t("advisor.starters.origination.placeholder")},
      capital_planning: {label: t("advisor.starters.capitalPlanning.label"), placeholder: t("advisor.starters.capitalPlanning.placeholder")},
      structure_from_documents: {label: t("advisor.starters.documents.label"), placeholder: t("advisor.starters.documents.placeholder")},
      review_existing_operation: {label: t("advisor.starters.review.label"), placeholder: t("advisor.starters.review.placeholder")},
    },
    attach: t("advisor.attach"),
    remove: t("advisor.remove"),
    send: t("advisor.send"),
    privacy: t("advisor.privacy"),
    status: {creating: t("advisor.status.creating"), uploading: t("advisor.status.uploading"), starting: t("advisor.status.starting")},
    errors: {
      invalid: t("advisor.errors.invalid"), denied: t("advisor.errors.denied"), duplicate: t("advisor.errors.duplicate"), not_found: t("advisor.errors.notFound"), save: t("advisor.errors.save"), processing: t("advisor.errors.processing"), upload: t("advisor.errors.upload"),
    },
    groupContext: t("advisor.groupContext"),
  };

  return <AdvisorStart copy={copy} groupId={selectedGroup?.id} groupName={selectedGroup?.name} locale={locale === "en-US" ? "en-US" : "pt-BR"} organizationId={organization.id} userId={userId} />;
}
