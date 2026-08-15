import {
  calculateAdjustedEbitda,
  calculateCapacityEnvelope,
  calculateDscr,
  calculateLeverage,
} from "@offroad/financial-core";
import {rankMandates, type Mandate} from "@offroad/matching-core";
import {supermarketFixture} from "@offroad/testing-fixtures";
import {ArrowLeft, ArrowRight, CheckCircle2, EyeOff, FileCheck2, Route, ShieldCheck} from "lucide-react";
import Link from "next/link";
import {getFormatter, getTranslations} from "next-intl/server";

import {BrandMark} from "@/components/brand-mark";
import type {AppLocale} from "@/i18n/routing";

type Props = {params: Promise<{locale: string}>};

const mandates: Mandate[] = [
  {id: "aurora", fundName: "Aurora Credit", currencies: ["BRL"], geographies: ["BR"], sectors: ["food_retail"], ticketMin: "30", ticketMax: "100", termMonthsMin: 24, termMonthsMax: 60, structures: ["senior_secured"], collateralTypes: ["receivables"], confidence: 0.95, freshnessDays: 12},
  {id: "vale", fundName: "Vale Verde Special Situations", currencies: ["BRL"], geographies: ["BR"], sectors: ["all"], ticketMin: "50", ticketMax: "180", termMonthsMin: 36, termMonthsMax: 72, structures: ["senior_secured", "unitranche"], collateralTypes: ["real_estate"], confidence: 0.88, freshnessDays: 43},
  {id: "canyon", fundName: "Canyon Opportunities", currencies: ["USD"], geographies: ["BR"], sectors: ["all"], ticketMin: "30", ticketMax: "150", termMonthsMin: 12, termMonthsMax: 72, structures: ["senior_secured"], collateralTypes: ["real_estate"], confidence: 0.9, freshnessDays: 20},
];

export default async function DemoPage({params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Demo"});
  const format = await getFormatter({locale});
  const fixture = supermarketFixture;
  const ebitda = calculateAdjustedEbitda(fixture.metrics.reportedEbitda, [...fixture.metrics.approvedAdjustments]);
  const leverage = calculateLeverage(fixture.metrics.netDebt, ebitda.value);
  const dscr = calculateDscr(fixture.metrics.cfads, fixture.metrics.downsideDebtService);
  const capacity = calculateCapacityEnvelope({
    requested: fixture.opportunity.requestedAmount,
    cashFlowCapacity: fixture.opportunity.capacity.cashFlow,
    collateralCapacity: fixture.opportunity.capacity.collateral,
    marketCapacity: fixture.opportunity.capacity.market,
  });
  const matches = rankMandates({
    id: "7990d3a9-115e-4ad0-b6a7-ae5ab56afc1a",
    sector: fixture.company.sector,
    geography: fixture.company.geography,
    currency: fixture.company.reportingCurrency,
    amountMin: "54",
    amountMax: "62",
    termMonthsMin: 36,
    termMonthsMax: 48,
    structureTypes: ["senior_secured"],
    collateralTypes: ["receivables", "real_estate"],
  }, mandates);
  const money = (value: string) => format.number(Number(value) * 1_000_000, {style: "currency", currency: "BRL", maximumFractionDigits: 0});

  return (
    <main className="demo-page">
      <header className="demo-header">
        <BrandMark locale={locale as AppLocale} />
        <nav><Link href={`/${locale}`}><ArrowLeft aria-hidden="true" size={14} />{t("back")}</Link><Link className="button button--small" href={`/${locale}/login`}>{t("openApp")}<ArrowRight aria-hidden="true" size={14} /></Link></nav>
      </header>

      <section className="demo-hero section-shell">
        <div><p className="section-kicker">{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("body")}</p></div>
        <aside><span>CASE / SYNTHETIC / 001</span><strong>{fixture.company.name}</strong><p>{fixture.opportunity.purpose}</p><small>{t("synthetic")}</small></aside>
      </section>

      <section className="demo-workbench section-shell">
        <div className="demo-workbench__rail"><Route aria-hidden="true" size={18} /><span>Snapshot</span><FileCheck2 aria-hidden="true" size={18} /><span>Evidence</span><ShieldCheck aria-hidden="true" size={18} /><span>Structure</span></div>
        <div className="demo-workbench__canvas">
          <div className="demo-metric-grid">
            <article><span>{t("revenue")}</span><strong>{money(fixture.metrics.revenueLtm)}</strong><small>reported · LTM</small></article>
            <article><span>{t("ebitda")}</span><strong>{money(ebitda.value)}</strong><small>calculated · v1.0</small></article>
            <article><span>{t("leverage")}</span><strong>{Number(leverage.value).toFixed(2)}x</strong><small>net debt / EBITDA</small></article>
            <article><span>{t("dscr")}</span><strong>{Number(dscr.value).toFixed(2)}x</strong><small>downside case</small></article>
          </div>

          <div className="capacity-panel">
            <header><div><p className="section-kicker">Capacity bridge</p><h2>{t("recommendation")}: {money(capacity.recommended)}</h2></div><span>{t("binding")}: {capacity.bindingConstraint}</span></header>
            <div className="capacity-bars">
              {[
                [t("requested"), capacity.requested, 100],
                [t("cashFlow"), capacity.capacities.cash_flow, 85],
                [t("collateral"), capacity.capacities.collateral, 67.5],
                [t("market"), capacity.capacities.market, 77.5],
              ].map(([label, value, width]) => <div key={String(label)}><span>{label}</span><div><i style={{width: `${width}%`}} /></div><strong>{money(String(value))}</strong></div>)}
            </div>
          </div>

          <div className="demo-split">
            <section className="evidence-panel"><header><h2>{t("evidence")}</h2><span>3 / 3</span></header>{fixture.sources.map((source) => <article key={source.id}><CheckCircle2 aria-hidden="true" size={17} /><div><strong>{source.label}</strong><span>{source.status === "verified" ? t("verified") : t("reconciled")}</span></div><small>source://{source.id}</small></article>)}</section>
            <section className="scenario-panel"><header><h2>{t("scenarios")}</h2><span>v3</span></header>{[
              [t("conservative"), "R$ 48 mi", "1.92x"],
              [t("recommended"), "R$ 54 mi", "1.74x"],
              [t("stretch"), "R$ 62 mi", "1.48x"],
            ].map(([name, amount, caseDscr], index) => <article data-selected={index === 1 || undefined} key={name}><div><strong>{name}</strong><span>{amount}</span></div><small>DSCR {caseDscr}</small></article>)}</section>
          </div>

          <section className="matches-panel">
            <header><div><p className="section-kicker">Capital intelligence</p><h2>{t("matches")}</h2></div><span><EyeOff aria-hidden="true" size={15} />{t("permissioned")}</span></header>
            <div>{matches.map((match, index) => <article key={match.mandateId}><span>0{index + 1}</span><div><strong>{match.fundName}</strong><p>{match.fitReasons.join(" · ") || match.mismatchReasons.join(" · ")}</p></div><div><small>{match.hardFilterStatus === "pass" ? t("fit") : t("mismatch")}</small><strong>{Math.round(match.score * 100)}%</strong></div></article>)}</div>
          </section>
        </div>
      </section>
    </main>
  );
}
