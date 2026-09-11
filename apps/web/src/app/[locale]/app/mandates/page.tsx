import {ArrowLeft, Building2, CircleAlert, Landmark, Target} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {MandateRegistry, type PendingFund} from "@/components/mandates/mandate-registry";
import {requireWorkspace} from "@/lib/auth/workspace";
import {attentionCount, currentMandateCount, groupMandatesByFund, readProviderMandates} from "@/lib/mandates/provider-mandates";
import {hasWorkspaceCapability} from "@/lib/workspace/capabilities";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Funds and mandates", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{welcome?: string}>};

/**
 * The funds and mandates panel: where a financier registers what it wants and confirms that it
 * still wants it.
 *
 * The counters deliberately count mandates in force rather than records saved. A registry full of
 * drafts is a registry that reaches no company, and a panel reporting "12 mandates" over twelve
 * unconfirmed rows would be the exact confusion this record exists to remove.
 */
export default async function MandatesPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "App"});
  const registry = await getTranslations({locale, namespace: "MandateRegistry"});
  const {supabase, organization} = await requireWorkspace(locale);
  if (!hasWorkspaceCapability(organization.organization_type, "mandate_management")) notFound();

  const [{data: mandateRows}, {data: funds}, {data: contacts}, {data: requests}] = await Promise.all([
    supabase.rpc("list_provider_mandates_v1", {p_organization_id: organization.id}),
    supabase.from("funds").select("id, name, strategy").eq("organization_id", organization.id).eq("status", "active"),
    supabase.from("provider_contacts").select("id").eq("organization_id", organization.id).eq("status", "active"),
    supabase.from("access_requests").select("id, status").eq("organization_id", organization.id),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const mandateFunds = groupMandatesByFund(readProviderMandates(mandateRows), today);
  const registered = new Set(mandateFunds.map((fund) => fund.fundId));
  const pendingFunds: PendingFund[] = (funds ?? [])
    .filter((fund) => !registered.has(fund.id))
    .map((fund) => ({id: fund.id, name: fund.name, strategy: fund.strategy}));
  const openRequests = (requests ?? []).filter((item) => item.status === "pending");

  return (
    <main className="app-canvas" data-testid="mandates-panel">
      <Link className="text-link" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("mandatesBack")}</Link>
      <header className="app-page-header">
        <div><p className="section-kicker">{t("providerEyebrow")}</p><h1>{t("providerWelcome")}</h1><p>{t("providerWelcomeBody")}</p></div>
        <Link className="button" href="#funds"><Target aria-hidden="true" size={16} />{t("viewMandates")}</Link>
      </header>
      {state.welcome === "1" ? <p className="form-notice form-notice--success app-welcome-notice" role="status">{t("welcomeComplete")}</p> : null}
      <section aria-label={t("providerPortfolio")} className="app-stat-grid">
        <article><Landmark aria-hidden="true" size={18} /><span>{t("registeredFunds")}</span><strong>{mandateFunds.length + pendingFunds.length}</strong></article>
        <article><Target aria-hidden="true" size={18} /><span>{registry("stats.verified")}</span><strong>{currentMandateCount(mandateFunds)}</strong></article>
        <article><CircleAlert aria-hidden="true" size={18} /><span>{registry("stats.attention")}</span><strong>{attentionCount(mandateFunds) + pendingFunds.length}</strong></article>
        <article><Building2 aria-hidden="true" size={18} /><span>{t("accessRequests")}</span><strong>{openRequests.length}</strong></article>
      </section>
      <section className="pipeline-section" id="funds">
        <div className="pipeline-section__header"><h2>{t("fundsAndMandates")}</h2><span>{organization.name}</span></div>
        <MandateRegistry
          funds={mandateFunds}
          locale={locale === "en-US" ? "en-US" : "pt-BR"}
          pendingFunds={pendingFunds}
          today={today}
        />
      </section>
      <section className="provider-contact-strip"><div><span>{t("routingContacts")}</span><strong>{contacts?.length ?? 0}</strong></div><p>{t("routingContactsBody")}</p></section>
    </main>
  );
}
