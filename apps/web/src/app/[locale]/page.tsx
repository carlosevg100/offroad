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
import {HeroBackgroundVideo} from "@/components/hero-background-video";
import {HeroValueRotator} from "@/components/hero-value-rotator";
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
  const loginHref = `/${locale}/login#access-form`;
  const createAccountHref = `/${locale}/signup`;

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
          <HeroBackgroundVideo />
          <div className="section-shell premium-hero__inner">
            <div className="premium-hero__copy">
              <div className="premium-hero__primary">
                <p className="premium-eyebrow">{t("eyebrow")}</p>
                <h1>
                  <span className="premium-hero__title-line">{t("heroTitleLine1")}</span>
                  {" "}
                  <span className="premium-hero__title-line">{t("heroTitleLine2")}</span>
                </h1>
                <HeroValueRotator
                  brandLead={t("heroBrandLead")}
                  brandSignoff={t("heroBrandSignoff")}
                  lead={t("heroValueLead")}
                  tail={t("heroValueTail")}
                  items={[
                    {label: t("heroValueSimple"), message: t("heroValueSimpleMessage")},
                    {label: t("heroValueOrganized"), message: t("heroValueOrganizedMessage")},
                    {label: t("heroValueStructured"), message: t("heroValueStructuredMessage")},
                    {label: t("heroValueEfficient"), message: t("heroValueEfficientMessage")},
                    {label: t("heroValueTargeted"), message: t("heroValueTargetedMessage")},
                  ]}
                />
              </div>
              <div className="premium-hero__support">
                <p className="premium-hero__lead">{t("heroBody")}</p>
                <p className="premium-hero__signature">{t("heroSignature")}</p>
                <div className="premium-hero__actions">
                  <Link className="button button--light" href={demoHref}>
                    {t("heroPrimary")} <ArrowUpRight aria-hidden="true" size={16} />
                  </Link>
                  <a className="premium-text-link" href={`mailto:${brand.email}`}>
                    {t("heroSecondary")} <ArrowRight aria-hidden="true" size={15} />
                  </a>
                </div>
                <div className="premium-hero__account">
                  <span>{t("heroAccountLabel")}</span>
                  <Link href={createAccountHref}>{t("heroCreateAccount")}</Link>
                  <i aria-hidden="true" />
                  <Link href={loginHref}>{t("heroLogin")}</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="audience-rail" aria-label={t("audienceKicker")}>
          <div className="section-shell">
            <a href="#empresas"><Building2 aria-hidden="true" size={16} /><span>{t("companyAudienceLabel")}</span><strong>{t("companyAudienceBenefit")}</strong></a>
            <a href="#originadores"><UserRoundCheck aria-hidden="true" size={16} /><span>{t("originatorAudienceLabel")}</span><strong>{t("originatorAudienceBenefit")}</strong></a>
            <a href="#capital"><Landmark aria-hidden="true" size={16} /><span>{t("capitalAudienceLabel")}</span><strong>{t("capitalAudienceBenefit")}</strong></a>
          </div>
        </section>

        <section className="premium-audiences section-shell" id="para-quem">
          <header className="premium-section-heading">
            <p className="premium-kicker">{t("audienceKicker")}</p>
            <h2>{t("audienceTitle")}</h2>
          </header>
          <div className="premium-audiences__grid">
            <article id="empresas">
              <header><span>01</span><Building2 aria-hidden="true" size={18} /></header>
              <p>{t("companyAudienceLabel")}</p>
              <h3>{t("companyAudienceTitle")}</h3>
              <div><Check aria-hidden="true" size={14} />{t("companyAudienceBody")}</div>
            </article>
            <article id="originadores">
              <header><span>02</span><UserRoundCheck aria-hidden="true" size={18} /></header>
              <p>{t("originatorAudienceLabel")}</p>
              <h3>{t("originatorAudienceTitle")}</h3>
              <div><Check aria-hidden="true" size={14} />{t("originatorAudienceBody")}</div>
            </article>
            <article id="capital">
              <header><span>03</span><Landmark aria-hidden="true" size={18} /></header>
              <p>{t("capitalAudienceLabel")}</p>
              <h3>{t("capitalAudienceTitle")}</h3>
              <div><Check aria-hidden="true" size={14} />{t("capitalAudienceBody")}</div>
            </article>
          </div>
        </section>

        <section className="premium-film-section" id="como-funciona">
          <div className="section-shell">
            <ProductFilm labels={filmLabels} locale={locale === "pt-BR" ? "pt-BR" : "en-US"} />
          </div>
        </section>

        <section className="premium-modules section-shell">
          <header className="premium-section-heading">
            <p className="premium-kicker">{t("productKicker")}</p>
            <h2>{t("productTitle")}</h2>
          </header>
          <div className="premium-modules__grid">
            <article className="premium-module">
              <header><span>01 / {t("moduleIntakeLabel")}</span><FileCheck2 aria-hidden="true" size={18} /></header>
              <h3>{t("productIntakeTitle")}</h3>
              <p>{t("productIntakeBody")}</p>
              <div className="module-documents" aria-hidden="true">
                {[t("moduleFinancials"), t("moduleProposal"), t("moduleDebt")].map((document, index) => (
                  <div key={document}><span>0{index + 1}</span><strong>{document}</strong><Check aria-hidden="true" size={13} /></div>
                ))}
              </div>
            </article>

            <article className="premium-module">
              <header><span>02 / {t("moduleAnalysisLabel")}</span><DatabaseZap aria-hidden="true" size={18} /></header>
              <h3>{t("productAnalysisTitle")}</h3>
              <p>{t("productAnalysisBody")}</p>
              <div className="module-analysis" aria-hidden="true">
                <div><span>{t("moduleMargin")}</span><strong>16,9%</strong></div>
                <div><span>DSCR / downside</span><strong>1.74x</strong></div>
                <div><span>{t("moduleCoverage")}</span><strong>94%</strong></div>
              </div>
            </article>

            <article className="premium-module premium-module--dark">
              <header><span>03 / {t("moduleControlLabel")}</span><ShieldCheck aria-hidden="true" size={18} /></header>
              <h3>{t("productAgentTitle")}</h3>
              <p>{t("productAgentBody")}</p>
              <div className="module-control" aria-hidden="true">
                <div><i /><span>{t("moduleEvidenceReview")}</span><strong>{t("moduleApproved")}</strong></div>
                <div><i /><span>{t("moduleStructurePolicy")}</span><strong>{t("modulePassed")}</strong></div>
                <div><i data-muted /><span>{t("moduleMarketDisclosure")}</span><strong>{t("modulePending")}</strong></div>
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
