import {Activity, ArrowLeft, Bot, CheckCircle2, CircleDashed, Database, FileText, Gauge, Layers3, Network} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getFormatter, getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {requireWorkspace} from "@/lib/auth/workspace";

type Props = {params: Promise<{locale: string; opportunityId: string}>};

export const metadata: Metadata = {title: "Opportunity", robots: {index: false, follow: false}};

export default async function OpportunityPage({params}: Props) {
  const {locale, opportunityId} = await params;
  const t = await getTranslations({locale, namespace: "App"});
  const format = await getFormatter({locale});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: opportunity} = await supabase
    .from("opportunities")
    .select("id, title, stage, purpose, requested_amount, currency, readiness_status, updated_at")
    .eq("organization_id", organization.id)
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opportunity) notFound();

  const [{count: documentCount}, {count: factCount}, {count: scenarioCount}, {count: outputCount}] = await Promise.all([
    supabase.from("source_documents").select("id", {count: "exact", head: true}).eq("organization_id", organization.id).eq("opportunity_id", opportunityId),
    supabase.from("evidence_facts").select("id", {count: "exact", head: true}).eq("organization_id", organization.id).eq("opportunity_id", opportunityId),
    supabase.from("structure_scenarios").select("id", {count: "exact", head: true}).eq("organization_id", organization.id).eq("opportunity_id", opportunityId),
    supabase.from("output_artifacts").select("id", {count: "exact", head: true}).eq("organization_id", organization.id).eq("opportunity_id", opportunityId),
  ]);

  const rails = [
    [Database, t("snapshot")], [FileText, t("documents")], [Gauge, t("capacity")],
    [Layers3, t("structure")], [FileText, t("outputs")], [Network, t("matching")],
  ] as const;

  return (
    <main className="credit-room">
      <header className="credit-room__header">
        <Link href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={15} /></Link>
        <div><span>{t("creditRoom")} · {opportunity.stage}</span><h1>{opportunity.title}</h1></div>
        <div><span>{t("amount")}</span><strong>{format.number(opportunity.requested_amount, {style: "currency", currency: opportunity.currency, maximumFractionDigits: 0})}</strong></div>
      </header>
      <div className="credit-room__body">
        <nav aria-label={t("creditRoom")} className="opportunity-rail">
          {rails.map(([Icon, label], index) => <button aria-current={index === 0 ? "page" : undefined} key={label} type="button"><Icon aria-hidden="true" size={17} /><span>{label}</span></button>)}
        </nav>
        <section className="workbench-canvas">
          <div className="agent-activity"><Bot aria-hidden="true" size={17} /><span>{t("activity")}</span><strong>{t("syntheticNotice")}</strong><CircleDashed aria-hidden="true" size={16} /></div>
          <div className="workbench-hero">
            <div><p className="section-kicker">{opportunity.readiness_status}</p><h2>{opportunity.purpose}</h2></div>
            <CheckCircle2 aria-hidden="true" size={30} />
          </div>
          <div className="workbench-metrics">
            <article><span>{t("documents")}</span><strong>{documentCount ?? 0}</strong><small>private bucket</small></article>
            <article><span>Evidence facts</span><strong>{factCount ?? 0}</strong><small>source anchored</small></article>
            <article><span>{t("structure")}</span><strong>{scenarioCount ?? 0}</strong><small>versioned</small></article>
            <article><span>{t("outputs")}</span><strong>{outputCount ?? 0}</strong><small>evidence compiled</small></article>
          </div>
          <div className="workbench-placeholder"><Activity aria-hidden="true" size={20} /><p>{t("syntheticNotice")}</p></div>
        </section>
        <aside className="inspector-panel">
          {[t("known"), t("missing"), t("recommended"), t("approval")].map((label, index) => (
            <section key={label}><span>0{index + 1}</span><h3>{label}</h3><p>{index === 0 ? opportunity.purpose : t("syntheticNotice")}</p></section>
          ))}
        </aside>
      </div>
    </main>
  );
}
