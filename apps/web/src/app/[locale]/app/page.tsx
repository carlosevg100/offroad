import {ArrowRight, Building2, CheckCircle2, CircleAlert, DatabaseZap, FileCheck2, Landmark, Plus, Target} from "lucide-react";
import Link from "next/link";
import {getFormatter, getTranslations} from "next-intl/server";

import {requireWorkspace} from "@/lib/auth/workspace";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{welcome?: string}>};

export default async function ApplicationHome({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "App"});
  const format = await getFormatter({locale});
  const {supabase, organization} = await requireWorkspace(locale);

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
                return <div className="provider-row" key={fund.id} role="listitem"><div><span>{fund.status}</span><strong>{fund.name}</strong><small>{fund.strategy}</small></div><div><span>{t("mandate")}</span><strong>{mandate ? `${t("version")} ${mandate.version_number}` : t("notRegistered")}</strong></div><div><span>{t("status")}</span><strong>{mandate?.status ?? "—"}</strong></div><CheckCircle2 aria-hidden="true" size={16} /></div>;
              })}
            </div>
          )}
        </section>
        <section className="provider-contact-strip"><div><span>{t("routingContacts")}</span><strong>{contacts?.length ?? 0}</strong></div><p>{t("routingContactsBody")}</p></section>
      </main>
    );
  }

  const [{data: opportunities}, {count: companiesCount}, {count: documentCount}, {count: pendingAuthority}] = await Promise.all([
    supabase.from("opportunities").select("id, title, stage, requested_amount, currency, readiness_status, updated_at").eq("organization_id", organization.id).order("updated_at", {ascending: false}).limit(20),
    supabase.from("companies").select("id", {count: "exact", head: true}).eq("organization_id", organization.id),
    supabase.from("source_documents").select("id", {count: "exact", head: true}).eq("organization_id", organization.id),
    supabase.from("authority_evidence").select("id", {count: "exact", head: true}).eq("organization_id", organization.id).eq("status", "pending"),
  ]);
  const active = opportunities?.filter((item) => item.stage !== "closed") ?? [];
  const ready = active.filter((item) => item.readiness_status === "ready").length;
  const isOriginator = organization.organization_type === "originator";

  return (
    <main className="app-canvas">
      <header className="app-page-header">
        <div><p className="section-kicker">{isOriginator ? t("originatorEyebrow") : t("companyEyebrow")}</p><h1>{isOriginator ? t("originatorWelcome") : t("companyWelcome")}</h1><p>{isOriginator ? t("originatorWelcomeBody") : t("companyWelcomeBody")}</p></div>
        <Link className="button" href={`/${locale}/app/new`}><Plus aria-hidden="true" size={16} />{isOriginator ? t("newOpportunity") : t("newCapitalNeed")}</Link>
      </header>
      {state.welcome === "1" ? <p className="form-notice form-notice--success app-welcome-notice" role="status">{t("welcomeComplete")}</p> : null}
      <section aria-label={t("pipeline")} className="app-stat-grid">
        <article><DatabaseZap aria-hidden="true" size={18} /><span>{t("activeOpportunities")}</span><strong>{active.length}</strong></article>
        <article><Building2 aria-hidden="true" size={18} /><span>{isOriginator ? t("advisedCompanies") : t("registeredCompany")}</span><strong>{companiesCount ?? 0}</strong></article>
        <article><FileCheck2 aria-hidden="true" size={18} /><span>{t("documents")}</span><strong>{documentCount ?? 0}</strong></article>
        <article>{isOriginator ? <CircleAlert aria-hidden="true" size={18} /> : <ArrowRight aria-hidden="true" size={18} />}<span>{isOriginator ? t("pendingAuthorities") : t("marketReady")}</span><strong>{isOriginator ? pendingAuthority ?? 0 : ready}</strong></article>
      </section>
      <section className="pipeline-section">
        <div className="pipeline-section__header"><h2>{t("pipeline")}</h2><span>{organization.name}</span></div>
        {active.length === 0 ? (
          <div className="empty-state"><span className="empty-state__number">01</span><div><h3>{t("emptyTitle")}</h3><p>{t("emptyBody")}</p></div><Link className="text-link" href={`/${locale}/app/new`}>{t("create")} <ArrowRight aria-hidden="true" size={14} /></Link></div>
        ) : (
          <div className="opportunity-table" role="list">
            {active.map((opportunity) => (
              <Link href={`/${locale}/app/opportunities/${opportunity.id}`} key={opportunity.id} role="listitem"><div><span>{opportunity.stage}</span><strong>{opportunity.title}</strong></div><div><span>{t("amount")}</span><strong>{format.number(opportunity.requested_amount, {style: "currency", currency: opportunity.currency, maximumFractionDigits: 0})}</strong></div><div><span>{t("updated")}</span><strong>{format.relativeTime(new Date(opportunity.updated_at))}</strong></div><ArrowRight aria-hidden="true" size={16} /></Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
