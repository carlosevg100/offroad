import {ArrowRight, CheckCircle2, CircleAlert, DatabaseZap, Plus} from "lucide-react";
import Link from "next/link";
import {getFormatter, getTranslations} from "next-intl/server";

import {requireWorkspace} from "@/lib/auth/workspace";

type Props = {params: Promise<{locale: string}>};

export default async function ApplicationHome({params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "App"});
  const format = await getFormatter({locale});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: opportunities} = await supabase
    .from("opportunities")
    .select("id, title, stage, requested_amount, currency, readiness_status, updated_at")
    .eq("organization_id", organization.id)
    .order("updated_at", {ascending: false})
    .limit(20);

  const active = opportunities?.filter((item) => item.stage !== "closed") ?? [];
  const ready = active.filter((item) => item.readiness_status === "ready").length;

  return (
    <main className="app-canvas">
      <header className="app-page-header">
        <div>
          <p className="section-kicker">{t("eyebrow")}</p>
          <h1>{t("welcome")}</h1>
          <p>{t("welcomeBody")}</p>
        </div>
        <Link className="button" href={`/${locale}/app/new`}><Plus aria-hidden="true" size={16} />{t("newOpportunity")}</Link>
      </header>

      <section aria-label={t("pipeline")} className="app-stat-grid">
        <article><DatabaseZap aria-hidden="true" size={18} /><span>{t("activeOpportunities")}</span><strong>{active.length}</strong></article>
        <article><CheckCircle2 aria-hidden="true" size={18} /><span>{t("evidenceCoverage")}</span><strong>—</strong></article>
        <article><ArrowRight aria-hidden="true" size={18} /><span>{t("marketReady")}</span><strong>{ready}</strong></article>
        <article><CircleAlert aria-hidden="true" size={18} /><span>{t("openExceptions")}</span><strong>0</strong></article>
      </section>

      <section className="pipeline-section">
        <div className="pipeline-section__header"><h2>{t("pipeline")}</h2><span>{organization.name}</span></div>
        {active.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__number">01</span>
            <div><h3>{t("emptyTitle")}</h3><p>{t("emptyBody")}</p></div>
            <Link className="text-link" href={`/${locale}/app/new`}>{t("create")} <ArrowRight aria-hidden="true" size={14} /></Link>
          </div>
        ) : (
          <div className="opportunity-table" role="list">
            {active.map((opportunity) => (
              <Link href={`/${locale}/app/opportunities/${opportunity.id}`} key={opportunity.id} role="listitem">
                <div><span>{opportunity.stage}</span><strong>{opportunity.title}</strong></div>
                <div><span>{t("amount")}</span><strong>{format.number(opportunity.requested_amount, {style: "currency", currency: opportunity.currency, maximumFractionDigits: 0})}</strong></div>
                <div><span>{t("updated")}</span><strong>{format.relativeTime(new Date(opportunity.updated_at))}</strong></div>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
