import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CircleDot,
  Compass,
  DatabaseZap,
  Fingerprint,
  Landmark,
  Network,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {AudienceCard} from "@/components/audience-card";
import {BrandMark} from "@/components/brand-mark";
import {OpportunityPreview} from "@/components/opportunity-preview";
import {SiteHeader} from "@/components/site-header";
import {brand} from "@/config/brand";
import type {AppLocale} from "@/i18n/routing";

type Props = {
  params: Promise<{locale: string}>;
};

const journeyKeys = ["Structured", "Visible", "Matched", "Funded"] as const;

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  const t = await getTranslations("Home");
  const demoHref = `/${locale}/demo`;
  const accessHref = `/${locale}/login`;

  return (
    <>
      <SiteHeader locale={locale as AppLocale} />
      <main id="main-content">
        <section className="hero section-shell">
          <div className="hero__ambient hero__ambient--one" aria-hidden="true" />
          <div className="hero__ambient hero__ambient--two" aria-hidden="true" />
          <div className="hero__copy">
            <p className="eyebrow">
              <CircleDot aria-hidden="true" size={12} />
              {t("eyebrow")}
            </p>
            <h1>
              <span>{t("heroLine1")}</span>
              <span>{t("heroLine2")}</span>
              <span>{t("heroLine3")}</span>
              <span className="hero__last-line">{t("heroLine4")}</span>
            </h1>
            <p className="hero__body">{t("heroBody")}</p>
            <p className="hero__support">{t("heroSupport")}</p>
            <div className="hero__actions">
              <Link className="button" href={demoHref}>
                <span>{t("heroPrimary")}</span>
                <ArrowUpRightIcon />
              </Link>
              <a className="text-link" href="#como-funciona">
                <span>{t("heroSecondary")}</span>
                <ArrowDownRight aria-hidden="true" size={17} />
              </a>
            </div>
            <p className="hero__note">{t("heroNote")}</p>
          </div>

          <div className="hero__visual">
            <OpportunityPreview />
            <div className="signal-legend" aria-hidden="true">
              <span><i data-signal="observed" />{t("signalObserved")}</span>
              <span><i data-signal="calculated" />{t("signalCalculated")}</span>
              <span><i data-signal="judgment" />{t("signalJudgment")}</span>
            </div>
          </div>
        </section>

        <section className="statement section-shell">
          <div className="section-index" aria-hidden="true">01 / 05</div>
          <div className="statement__title">
            <p className="kicker">{t("statementKicker")}</p>
            <h2>{t("statementTitle")}</h2>
          </div>
          <div className="statement__body">
            <p>{t("statementBody")}</p>
            <aside>{t("statementAside")}</aside>
          </div>
        </section>

        <section className="journey" id="como-funciona">
          <div className="section-shell">
            <div className="section-heading">
              <div>
                <p className="kicker">{t("journeyKicker")}</p>
                <h2>{t("journeyTitle")}</h2>
              </div>
              <Compass aria-hidden="true" size={36} strokeWidth={1.25} />
            </div>
            <div className="journey-grid">
              {journeyKeys.map((key, index) => (
                <article className="journey-step" key={key}>
                  <div className="journey-step__number">
                    {t(`journey${key}Number`)}
                  </div>
                  <div className="journey-step__marker" aria-hidden="true">
                    <i />
                  </div>
                  <h3>{t(`journey${key}Title`)}</h3>
                  <p>{t(`journey${key}Body`)}</p>
                  <span>{t(`journey${key}Meta`)}</span>
                  {index < journeyKeys.length - 1 && (
                    <ArrowRight className="journey-step__arrow" aria-hidden="true" size={18} />
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="audiences section-shell" id="para-quem">
          <div className="section-heading section-heading--dark">
            <div>
              <p className="kicker">{t("audienceKicker")}</p>
              <h2>{t("audienceTitle")}</h2>
            </div>
            <Network aria-hidden="true" size={36} strokeWidth={1.25} />
          </div>
          <div className="audience-grid">
            <AudienceCard
              action={t("companyAudienceAction")}
              body={t("companyAudienceBody")}
              href={accessHref}
              icon={Building2}
              label={t("companyAudienceLabel")}
              number="01"
              title={t("companyAudienceTitle")}
            />
            <AudienceCard
              action={t("originatorAudienceAction")}
              body={t("originatorAudienceBody")}
              href={accessHref}
              icon={UserRoundCheck}
              label={t("originatorAudienceLabel")}
              number="02"
              title={t("originatorAudienceTitle")}
            />
            <AudienceCard
              action={t("capitalAudienceAction")}
              body={t("capitalAudienceBody")}
              href={accessHref}
              icon={Landmark}
              label={t("capitalAudienceLabel")}
              number="03"
              title={t("capitalAudienceTitle")}
            />
          </div>
        </section>

        <section className="trust" id="seguranca">
          <div className="section-shell">
            <div className="trust__heading">
              <p className="kicker">{t("trustKicker")}</p>
              <h2>{t("trustTitle")}</h2>
            </div>
            <div className="trust-grid">
              <TrustItem icon={Fingerprint} title={t("trustEvidenceTitle")} body={t("trustEvidenceBody")} number="01" />
              <TrustItem icon={DatabaseZap} title={t("trustMathTitle")} body={t("trustMathBody")} number="02" />
              <TrustItem icon={ShieldCheck} title={t("trustControlTitle")} body={t("trustControlBody")} number="03" />
              <TrustItem icon={Network} title={t("trustDataTitle")} body={t("trustDataBody")} number="04" />
            </div>
          </div>
        </section>

        <section className="boundary section-shell">
          <div className="boundary__copy">
            <p className="kicker">{t("boundaryLabel")}</p>
            <h2>{t("boundaryTitle")}</h2>
            <p>{t("boundaryBody")}</p>
          </div>
          <div className="boundary__matrix">
            <div>
              <span>{t("boundaryProduct")}</span>
              <p>{t("boundaryProductValue")}</p>
            </div>
            <div>
              <span>{t("boundaryParties")}</span>
              <p>{t("boundaryPartiesValue")}</p>
            </div>
          </div>
        </section>

        <section className="final-cta" id="contato">
          <div className="final-cta__contours" aria-hidden="true" />
          <div className="section-shell final-cta__inner">
            <p className="kicker">{t("ctaKicker")}</p>
            <h2>{t("ctaTitle")}</h2>
            <p>{t("ctaBody")}</p>
            <div>
              <Link className="button button--paper" href={accessHref}>
                <span>{t("ctaPrimary")}</span>
                <ArrowUpRightIcon />
              </Link>
              <a className="text-link text-link--paper" href={`mailto:${brand.email}`}>
                <span>{t("ctaSecondary")}</span>
                <ArrowRight aria-hidden="true" size={17} />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="section-shell">
          <div className="site-footer__brand">
            <BrandMark inverted locale={locale as AppLocale} />
            <p>{t("footerCategory")}</p>
          </div>
          <div className="site-footer__links">
            <div>
              <span>{t("footerProduct")}</span>
              <a href="#como-funciona">{t("footerHow")}</a>
              <a href="#seguranca">{t("footerSecurity")}</a>
            </div>
            <div>
              <span>{t("footerCompany")}</span>
              <a href={`mailto:${brand.email}`}>{t("footerAbout")}</a>
              <a href={`mailto:${brand.email}`}>{t("footerContact")}</a>
            </div>
            <div>
              <span>{t("footerLegal")}</span>
              <span>{t("footerPrivacy")}</span>
              <span>{t("footerTerms")}</span>
            </div>
          </div>
          <div className="site-footer__bottom">
            <p>{t("footerNotice")}</p>
            <p>© {new Date().getFullYear()} {brand.name}. {t("footerRights")}</p>
          </div>
        </div>
      </footer>
    </>
  );
}

function ArrowUpRightIcon() {
  return <ArrowUpRight aria-hidden="true" size={17} />;
}

type TrustItemProps = {
  body: string;
  icon: typeof Fingerprint;
  number: string;
  title: string;
};

function TrustItem({body, icon: Icon, number, title}: TrustItemProps) {
  return (
    <article className="trust-item">
      <div>
        <span>{number}</span>
        <Icon aria-hidden="true" size={22} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
