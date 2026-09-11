import {ArrowRight, Landmark, ShieldCheck} from "lucide-react";
import {getTranslations} from "next-intl/server";
import Link from "next/link";

type Props = {
  locale: string;
  /** Workspace terms and the information-usage declaration; completes onboarding on acceptance. */
  startHref: string;
  /** The mandate registration path that already existed. Optional, never a prerequisite. */
  mandatesHref: string;
};

const exampleIndexes = [0, 1, 2, 3, 4] as const;

/**
 * The first screen of a financier onboarding. Own analysis starts here without a fund, a mandate
 * or a contact; mandate registration stays reachable as a separate path. There is no
 * representation declaration on this screen or on the terms it leads to.
 */
export async function FinancierOnboardingStart({locale, startHref, mandatesHref}: Props) {
  const t = await getTranslations({locale, namespace: "Onboarding.financier"});

  return (
    <section className="intake-start intake-start--welcome financier-onboarding-start">
      <div className="intake-welcome__explanation">
        <span className="section-kicker">{t("kicker")}</span>
        <h2>{t("title")}</h2>
        <p>{t("body")}</p>
      </div>

      <div className="intake-welcome__roles">
        <section>
          <header><span>01</span><h3>{t("examplesTitle")}</h3></header>
          <ol>
            {exampleIndexes.map((index) => (
              <li key={index}><span>{index + 1}</span><div><p>{t(`examples.${index}`)}</p></div></li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="private-project-gate__boundary">
        <ShieldCheck aria-hidden="true" size={17} />
        <p><strong>{t("boundary")}</strong></p>
      </aside>

      <div className="intake-welcome__action">
        <Link className="button" data-testid="financier-start-analysis" href={startHref}>{t("startCta")}<ArrowRight aria-hidden="true" size={15} /></Link>
        <Link className="button button--ghost" data-testid="financier-register-mandates" href={mandatesHref}><Landmark aria-hidden="true" size={15} />{t("mandateCta")}</Link>
        <small>{t("mandateNote")}</small>
      </div>
    </section>
  );
}
