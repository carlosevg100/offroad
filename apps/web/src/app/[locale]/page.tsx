import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  DatabaseZap,
  FileCheck2,
  Landmark,
  Network,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {BrandMark} from "@/components/brand-mark";
import {ProductFilm} from "@/components/product-film";
import {SiteHeader} from "@/components/site-header";
import {brand} from "@/config/brand";
import type {AppLocale} from "@/i18n/routing";

type Props = {
  params: Promise<{locale: string}>;
};

const journeyKeys = ["Structured", "Visible", "Matched", "Funded"] as const;

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Home"});
  const demoHref = `/${locale}/demo`;

  const filmLabels = {
    eyebrow: t("filmEyebrow"),
    opportunity: t("filmOpportunity"),
    pause: t("filmPause"),
    play: t("filmPlay"),
    scenes: journeyKeys.map((key) => ({
      body: t(`film${key}Body`),
      label: t(`film${key}Label`),
      title: t(`film${key}Title`),
    })) as [
      {body: string; label: string; title: string},
      {body: string; label: string; title: string},
      {body: string; label: string; title: string},
      {body: string; label: string; title: string},
    ],
    synthetic: t("filmSynthetic"),
    title: t("filmTitle"),
  };

  return (
    <>
      <SiteHeader locale={locale as AppLocale} />
      <main id="main-content" className="home-page">
        <section className="premium-hero">
          <div className="section-shell premium-hero__inner">
            <div className="premium-hero__copy">
              <p className="premium-eyebrow">{t("eyebrow")}</p>
              <h1>
                <span>{t("heroLine1")}</span>
                <span>{t("heroLine2")}</span>
                <span>{t("heroLine3")}</span>
                <span className="premium-hero__accent">{t("heroLine4")}</span>
              </h1>
              <p className="premium-hero__lead">{t("heroBody")}</p>
              <div className="premium-hero__actions">
                <Link className="button button--light" href={demoHref}>
                  {t("heroPrimary")} <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
                <a className="premium-text-link" href="#como-funciona">
                  {t("heroSecondary")} <ArrowRight aria-hidden="true" size={15} />
                </a>
              </div>
              <p className="premium-hero__note">{t("heroNote")}</p>
            </div>

            <CreditReadinessPanel label={t("productPreview")} />
          </div>
          <div className="premium-hero__rail" aria-hidden="true">
            <span>STRUCTURE</span><i /><span>EVIDENCE</span><i /><span>MATCH</span><i /><span>ACCESS</span>
          </div>
        </section>

        <section className="audience-rail" id="para-quem" aria-label={t("audienceKicker")}>
          <div className="section-shell">
            <span>{t("participantIntro")}</span>
            <div><Building2 aria-hidden="true" size={15} />{t("companyAudienceLabel")}</div>
            <div><UserRoundCheck aria-hidden="true" size={15} />{t("originatorAudienceLabel")}</div>
            <div><Landmark aria-hidden="true" size={15} />{t("capitalAudienceLabel")}</div>
          </div>
        </section>

        <section className="premium-statement section-shell">
          <p className="premium-kicker">{t("statementKicker")}</p>
          <div className="premium-statement__grid">
            <h2>{t("statementTitle")}</h2>
            <div>
              <p>{t("statementBody")}</p>
              <p>{t("statementAside")}</p>
            </div>
          </div>
        </section>

        <section className="premium-film-section" id="como-funciona">
          <div className="section-shell">
            <ProductFilm labels={filmLabels} />
          </div>
        </section>

        <section className="premium-modules section-shell">
          <header className="premium-section-heading">
            <p className="premium-kicker">{t("productKicker")}</p>
            <h2>{t("productTitle")}</h2>
          </header>
          <div className="premium-modules__grid">
            <article className="premium-module">
              <header><span>01 / INTAKE</span><FileCheck2 aria-hidden="true" size={18} /></header>
              <h3>{t("productIntakeTitle")}</h3>
              <p>{t("productIntakeBody")}</p>
              <div className="module-documents" aria-hidden="true">
                {["FY25 Financials.xlsx", "Deal proposal.pdf", "Debt schedule.xlsx"].map((document, index) => (
                  <div key={document}><span>0{index + 1}</span><strong>{document}</strong><Check size={13} /></div>
                ))}
              </div>
            </article>

            <article className="premium-module">
              <header><span>02 / ANALYSIS</span><DatabaseZap aria-hidden="true" size={18} /></header>
              <h3>{t("productAnalysisTitle")}</h3>
              <p>{t("productAnalysisBody")}</p>
              <div className="module-analysis" aria-hidden="true">
                <div><span>EBITDA margin</span><strong>16.9%</strong></div>
                <div><span>DSCR / downside</span><strong>1.74x</strong></div>
                <div><span>Evidence coverage</span><strong>94%</strong></div>
              </div>
            </article>

            <article className="premium-module premium-module--dark">
              <header><span>03 / CONTROL</span><ShieldCheck aria-hidden="true" size={18} /></header>
              <h3>{t("productAgentTitle")}</h3>
              <p>{t("productAgentBody")}</p>
              <div className="module-control" aria-hidden="true">
                <div><i /><span>Evidence review</span><strong>Approved</strong></div>
                <div><i /><span>Structure policy</span><strong>Passed</strong></div>
                <div><i data-muted /><span>Market disclosure</span><strong>Pending</strong></div>
              </div>
            </article>
          </div>
        </section>

        <section className="premium-journey">
          <div className="section-shell">
            <header className="premium-section-heading premium-section-heading--dark">
              <p className="premium-kicker">{t("journeyKicker")}</p>
              <h2>{t("journeyTitle")}</h2>
            </header>
            <div className="premium-journey__grid">
              {journeyKeys.map((key, index) => (
                <article key={key}>
                  <span>0{index + 1}</span>
                  <h3>{t(`journey${key}Title`)}</h3>
                  <p>{t(`journey${key}Body`)}</p>
                  <small>{t(`journey${key}Meta`)}</small>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="premium-trust section-shell" id="seguranca">
          <header className="premium-section-heading">
            <p className="premium-kicker">{t("trustKicker")}</p>
            <h2>{t("trustTitle")}</h2>
          </header>
          <div className="premium-trust__grid">
            <TrustItem icon={FileCheck2} title={t("trustEvidenceTitle")} body={t("trustEvidenceBody")} number="01" />
            <TrustItem icon={DatabaseZap} title={t("trustMathTitle")} body={t("trustMathBody")} number="02" />
            <TrustItem icon={ShieldCheck} title={t("trustControlTitle")} body={t("trustControlBody")} number="03" />
            <TrustItem icon={Network} title={t("trustDataTitle")} body={t("trustDataBody")} number="04" />
          </div>
        </section>

        <section className="premium-boundary section-shell">
          <div>
            <p className="premium-kicker">{t("boundaryLabel")}</p>
            <h2>{t("boundaryTitle")}</h2>
          </div>
          <div className="premium-boundary__matrix">
            <article><span>{t("boundaryProduct")}</span><p>{t("boundaryProductValue")}</p></article>
            <article><span>{t("boundaryParties")}</span><p>{t("boundaryPartiesValue")}</p></article>
          </div>
        </section>

        <section className="premium-cta" id="contato">
          <div className="section-shell">
            <p className="premium-kicker">{t("ctaKicker")}</p>
            <h2>{t("ctaTitle")}</h2>
            <p>{t("ctaBody")}</p>
            <div>
              <Link className="button button--light" href={demoHref}>{t("ctaPrimary")}<ArrowUpRight aria-hidden="true" size={16} /></Link>
              <a className="premium-text-link" href={`mailto:${brand.email}`}>{t("ctaSecondary")}<ArrowRight aria-hidden="true" size={16} /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="premium-footer">
        <div className="section-shell">
          <div><BrandMark inverted locale={locale as AppLocale} /><p>{t("footerCategory")}</p></div>
          <div><a href="#como-funciona">{t("footerHow")}</a><a href="#seguranca">{t("footerSecurity")}</a><a href={`mailto:${brand.email}`}>{t("footerContact")}</a></div>
          <p>{t("footerNotice")}</p>
          <p>© {new Date().getFullYear()} {brand.name}. {t("footerRights")}</p>
        </div>
      </footer>
    </>
  );
}

function CreditReadinessPanel({label}: {label: string}) {
  return (
    <aside className="credit-readiness" aria-label={label}>
      <header><span>OPPORTUNITY / 024</span><strong>PRIVATE CREDIT</strong></header>
      <div className="credit-readiness__company">
        <div><span>RH</span><div><strong>Rede Horizonte</strong><small>Food retail · Brazil</small></div></div>
        <span>IN REVIEW</span>
      </div>
      <div className="credit-readiness__core">
        <div className="credit-readiness__donut">
          <div><strong>84</strong><span>READINESS</span></div>
        </div>
        <div className="credit-readiness__legend">
          <div><i /><span>Financial evidence</span><strong>92%</strong></div>
          <div><i /><span>Structure fit</span><strong>86%</strong></div>
          <div><i /><span>Market fit</span><strong>74%</strong></div>
        </div>
      </div>
      <div className="credit-readiness__metrics">
        <div><span>REVENUE / LTM</span><strong>R$ 184.7m</strong></div>
        <div><span>DOWNSIDE DSCR</span><strong>1.74x</strong></div>
        <div><span>CAPACITY</span><strong>R$ 54–68m</strong></div>
      </div>
      <footer><span><i /> VERIFIED EVIDENCE</span><strong>SYNTHETIC DATA</strong></footer>
    </aside>
  );
}

type TrustItemProps = {
  body: string;
  icon: typeof ShieldCheck;
  number: string;
  title: string;
};

function TrustItem({body, icon: Icon, number, title}: TrustItemProps) {
  return (
    <article>
      <header><span>{number}</span><Icon aria-hidden="true" size={19} /></header>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
