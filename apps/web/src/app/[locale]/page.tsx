import {
  ArrowRight,
  ArrowUpRight,
  Bot,
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
  const accessHref = `/${locale}/login`;

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
        <section className="home-hero section-shell">
          <div className="home-hero__brand">
            <BrandMark locale={locale as AppLocale} size="hero" />
          </div>
          <div className="home-hero__grid">
            <div className="home-hero__copy">
              <p className="eyebrow">{t("eyebrow")}</p>
              <h1>
                <span>{t("heroEditorialLine1")}</span>
                <span>{t("heroEditorialLine2")}</span>
              </h1>
            </div>
            <div className="home-hero__aside">
              <p>{t("heroBody")}</p>
              <div className="home-hero__actions">
                <Link className="button" href={demoHref}>
                  {t("heroPrimary")} <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
                <Link className="button button--outline" href={accessHref}>
                  {t("heroAccess")} <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </div>
              <p className="home-hero__note">{t("heroNote")}</p>
            </div>
          </div>
        </section>

        <section className="participant-strip" id="para-quem" aria-label={t("audienceKicker")}>
          <div className="section-shell">
            <span>{t("participantIntro")}</span>
            <div><Building2 aria-hidden="true" size={16} />{t("companyAudienceLabel")}</div>
            <div><UserRoundCheck aria-hidden="true" size={16} />{t("originatorAudienceLabel")}</div>
            <div><Landmark aria-hidden="true" size={16} />{t("capitalAudienceLabel")}</div>
          </div>
        </section>

        <section className="home-statement section-shell">
          <p className="kicker">{t("statementKicker")}</p>
          <h2>{t("statementTitle")}</h2>
          <div>
            <p>{t("statementBody")}</p>
            <aside>{t("statementAside")}</aside>
          </div>
        </section>

        <section className="film-shell section-shell" id="como-funciona">
          <ProductFilm labels={filmLabels} />
        </section>

        <section className="product-story section-shell">
          <div className="product-story__heading">
            <p className="kicker">{t("productKicker")}</p>
            <h2>{t("productTitle")}</h2>
          </div>
          <div className="product-story__grid">
            <article className="product-card product-card--intake">
              <header><span>01</span><FileCheck2 aria-hidden="true" size={20} /></header>
              <h3>{t("productIntakeTitle")}</h3>
              <p>{t("productIntakeBody")}</p>
              <div className="product-card__opportunity">
                <div><span>R</span><div><strong>Rede Horizonte</strong><small>R$ 80m facility · Food retail</small></div></div>
                <div className="product-card__tabs"><strong>Documents</strong><span>Financials</span><span>Request</span><span>AI structure</span></div>
                {["FY25 Financials.xlsx", "Deal proposal.pdf", "Debt schedule.xlsx"].map((document) => (
                  <div className="product-card__document" key={document}><FileCheck2 aria-hidden="true" size={15} /><span>{document}</span><Check aria-hidden="true" size={13} /></div>
                ))}
              </div>
            </article>

            <article className="product-card product-card--analysis">
              <header><span>02</span><DatabaseZap aria-hidden="true" size={20} /></header>
              <h3>{t("productAnalysisTitle")}</h3>
              <p>{t("productAnalysisBody")}</p>
              <div className="analysis-sheet">
                <div><strong>{t("analysisStrengths")}</strong><span>4</span></div>
                <p><i />Recurring revenue with 23.9% adjusted EBITDA margin.</p>
                <p><i />Downside DSCR remains above policy threshold.</p>
                <div><strong>{t("analysisDiligence")}</strong><span>3</span></div>
                <p data-warning><i />Working-capital seasonality requires validation.</p>
              </div>
            </article>

            <article className="product-card product-card--agents">
              <header><span>03</span><Bot aria-hidden="true" size={20} /></header>
              <h3>{t("productAgentTitle")}</h3>
              <p>{t("productAgentBody")}</p>
              <div className="agent-layers" aria-hidden="true">
                <span>Evidence</span><span>Structuring</span><span>Matching</span><span>Execution</span>
              </div>
            </article>
          </div>
        </section>

        <section className="journey-clean section-shell">
          <div className="journey-clean__heading">
            <p className="kicker">{t("journeyKicker")}</p>
            <h2>{t("journeyTitle")}</h2>
          </div>
          <div className="journey-clean__grid">
            {journeyKeys.map((key, index) => (
              <article key={key}>
                <span>0{index + 1}</span>
                <h3>{t(`journey${key}Title`)}</h3>
                <p>{t(`journey${key}Body`)}</p>
                <small>{t(`journey${key}Meta`)}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="trust-clean" id="seguranca">
          <div className="section-shell">
            <div className="trust-clean__heading">
              <p className="kicker">{t("trustKicker")}</p>
              <h2>{t("trustTitle")}</h2>
            </div>
            <div className="trust-clean__grid">
              <TrustItem icon={FileCheck2} title={t("trustEvidenceTitle")} body={t("trustEvidenceBody")} number="01" />
              <TrustItem icon={DatabaseZap} title={t("trustMathTitle")} body={t("trustMathBody")} number="02" />
              <TrustItem icon={ShieldCheck} title={t("trustControlTitle")} body={t("trustControlBody")} number="03" />
              <TrustItem icon={Network} title={t("trustDataTitle")} body={t("trustDataBody")} number="04" />
            </div>
          </div>
        </section>

        <section className="boundary-clean section-shell">
          <div>
            <p className="kicker">{t("boundaryLabel")}</p>
            <h2>{t("boundaryTitle")}</h2>
          </div>
          <div className="boundary-clean__matrix">
            <article><span>{t("boundaryProduct")}</span><p>{t("boundaryProductValue")}</p></article>
            <article><span>{t("boundaryParties")}</span><p>{t("boundaryPartiesValue")}</p></article>
          </div>
        </section>

        <section className="home-cta" id="contato">
          <div className="section-shell">
            <BrandMark locale={locale as AppLocale} size="hero" />
            <p className="kicker">{t("ctaKicker")}</p>
            <h2>{t("ctaTitle")}</h2>
            <p>{t("ctaBody")}</p>
            <div>
              <Link className="button" href={demoHref}>{t("ctaPrimary")}<ArrowUpRight aria-hidden="true" size={16} /></Link>
              <a className="text-link" href={`mailto:${brand.email}`}>{t("ctaSecondary")}<ArrowRight aria-hidden="true" size={16} /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer site-footer--clean">
        <div className="section-shell">
          <div className="site-footer__brand">
            <BrandMark locale={locale as AppLocale} />
            <p>{t("footerCategory")}</p>
          </div>
          <div className="site-footer__links">
            <div><span>{t("footerProduct")}</span><a href="#como-funciona">{t("footerHow")}</a><a href="#seguranca">{t("footerSecurity")}</a></div>
            <div><span>{t("footerCompany")}</span><a href={`mailto:${brand.email}`}>{t("footerAbout")}</a><a href={`mailto:${brand.email}`}>{t("footerContact")}</a></div>
            <div><span>{t("footerLegal")}</span><span>{t("footerPrivacy")}</span><span>{t("footerTerms")}</span></div>
          </div>
          <div className="site-footer__bottom"><p>{t("footerNotice")}</p><p>© {new Date().getFullYear()} {brand.name}. {t("footerRights")}</p></div>
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
      <div><span>{number}</span><Icon aria-hidden="true" size={21} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
