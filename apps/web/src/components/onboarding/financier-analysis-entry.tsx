import {ArrowRight, Check, Landmark, LockKeyhole, ShieldCheck} from "lucide-react";
import {getTranslations} from "next-intl/server";
import Link from "next/link";

type Props = {
  locale: string;
  conversationHref: string;
  mandatesHref: string;
  termsAccepted: boolean;
};

/**
 * What `/app/new` shows a financier instead of the representation-declared project setup: the
 * conversation is the entry, private documents need the accepted terms, and the operations
 * outside own analysis are explained rather than offered as buttons the server would refuse.
 */
export async function FinancierAnalysisEntry({locale, conversationHref, mandatesHref, termsAccepted}: Props) {
  const t = await getTranslations({locale, namespace: "App.financierEntry"});

  return (
    <section className="origination-setup financier-analysis-entry" data-testid="financier-analysis-entry">
      <header className="origination-setup__header">
        <p className="section-kicker">{t("kicker")}</p>
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
      </header>

      <div className="origination-setup__layout">
        <div className="origination-form">
          <section className="origination-form__section origination-form__wide">
            <span>01</span><div><strong>{t("availableTitle")}</strong></div>
          </section>
          <ul className="origination-form__wide financier-analysis-entry__list">
            <li><Check aria-hidden="true" size={14} /><span>{t("available.conversation")}</span></li>
            <li><Check aria-hidden="true" size={14} /><span>{t("available.documents")}</span></li>
            <li><Check aria-hidden="true" size={14} /><span>{t("available.mandates")}</span></li>
          </ul>

          <section className="origination-form__section origination-form__wide">
            <span>02</span><div><strong>{t("unavailableTitle")}</strong></div>
          </section>
          <ul className="origination-form__wide financier-analysis-entry__list" data-testid="financier-unavailable-operations">
            <li><LockKeyhole aria-hidden="true" size={14} /><span>{t("unavailable.companyDebt")}</span></li>
            <li><LockKeyhole aria-hidden="true" size={14} /><span>{t("unavailable.representation")}</span></li>
            <li><LockKeyhole aria-hidden="true" size={14} /><span>{t("unavailable.disclosure")}</span></li>
          </ul>

          {termsAccepted ? (
            <div className="private-project-gate__accepted origination-form__wide">
              <div><Check aria-hidden="true" size={15} /><span><strong>{t("termsAcceptedTitle")}</strong> {t("termsAcceptedBody")}</span></div>
            </div>
          ) : null}

          <div className="origination-form__boundary origination-form__wide">
            <ShieldCheck aria-hidden="true" size={17} />
            <p>{t("boundary")}</p>
          </div>
          <div className="origination-form__action origination-form__wide">
            <Link className="button button--ghost" href={mandatesHref}><Landmark aria-hidden="true" size={15} />{t("mandatesCta")}</Link>
            <Link className="button" data-testid="financier-entry-conversation" href={conversationHref}>{t("cta")}<ArrowRight aria-hidden="true" size={15} /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
