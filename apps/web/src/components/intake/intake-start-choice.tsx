import {ArrowRight, FileSearch, ListChecks, ShieldCheck, Waypoints} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {IntakeContext, IntakeStartActionSet} from "@/lib/intake/types";

import {IntakeJourneyTelemetry} from "./intake-journey-telemetry";

type Props = {
  locale: string;
  context: IntakeContext;
  journey: "company" | "originator";
  actions: IntakeStartActionSet;
};

/**
 * One guided entry point, shared by onboarding and the workspace new-case flow.
 *
 * Uploading versus typing is an implementation detail, not a decision the company should have
 * to make before it has even described the transaction. The guided journey asks the purpose
 * first, builds the request list from it, and lets files and direct answers coexist later.
 */
export async function IntakeStartChoice({locale, context, journey, actions}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.start"});
  const isCase = context === "workspace";

  if (!isCase) {
    return (
      <section className="intake-start intake-start--welcome">
        <IntakeJourneyTelemetry
          journey={journey}
          locale={locale}
          stage="start"
          state="open"
          surface={context}
        />

        <div className="intake-welcome__explanation">
          <span className="section-kicker">{t("howKicker")}</span>
          <h2><span>{t("howTitlePrimary")}</span> <span>{t("howTitleMuted")}</span></h2>
          <div className="intake-welcome__narrative">
            <div><span>01</span><p>{t("howIntro")}</p></div>
            <div><span>02</span><p>{t("howAnalysis")}</p></div>
            <div><span>03</span><p>{t("howMarket")}</p></div>
          </div>
        </div>

        <div className="intake-welcome__roles">
          <section>
            <header><span>01</span><h3>{t("youDoTitle")}</h3></header>
            <ol>
              <li><span>1</span><p>{t("youDo1")}</p></li>
              <li><span>2</span><p>{t("youDo2")}</p></li>
              <li><span>3</span><p>{t("youDo3")}</p></li>
            </ol>
          </section>
          <section className="intake-welcome__roles-offroad">
            <header><span>02</span><h3>{t("offroadDoesTitle")}</h3></header>
            <ol>
              <li><span>4</span><p>{t("offroadDoes1")}</p></li>
              <li><span>5</span><p>{t("offroadDoes2")}</p></li>
              <li><span>6</span><p>{t("offroadDoes3")}</p></li>
            </ol>
          </section>
        </div>

        <form action={actions.start} className="intake-welcome__action">
          <input name="locale" type="hidden" value={locale} />
          <div>
            <strong>{t("welcomeActionTitle")}</strong>
            <p>{t("welcomeActionBody")}</p>
          </div>
          <button className="button" type="submit">{t("guidedCta")}<ArrowRight size={15} /></button>
        </form>

        <div className="intake-start__security"><ShieldCheck size={15} /><span>{t("security")}</span></div>
      </section>
    );
  }

  return (
    <section className="intake-start">
      <IntakeJourneyTelemetry
        journey={journey}
        locale={locale}
        stage="start"
        state="open"
        surface={context}
      />
      <header>
        <span className="section-kicker">{isCase ? t("kickerCase") : t("kickerOnboarding")}</span>
        <h2>{isCase ? t("titleCase") : t("titleOnboarding")}</h2>
        <p>{t("body")}</p>
      </header>
      <form action={actions.start} className="intake-start__journey is-recommended">
        <input name="locale" type="hidden" value={locale} />
        <div className="intake-start__journey-copy">
          <span className="section-kicker">{t("guidedKicker")}</span>
          <h3>{t("guidedTitle")}</h3>
          <p>{t("guidedBody")}</p>
          <button className="button" type="submit">{t("guidedCta")}<ArrowRight size={15} /></button>
        </div>
        <ol className="intake-start__steps">
          <li><span>01</span><Waypoints aria-hidden="true" size={18} /><div><strong>{t("stepOperationTitle")}</strong><p>{t("stepOperationBody")}</p></div></li>
          <li><span>02</span><ListChecks aria-hidden="true" size={18} /><div><strong>{t("stepRequestTitle")}</strong><p>{t("stepRequestBody")}</p></div></li>
          <li><span>03</span><FileSearch aria-hidden="true" size={18} /><div><strong>{t("stepDocumentsTitle")}</strong><p>{t("stepDocumentsBody")}</p></div></li>
        </ol>
      </form>
      <div className="intake-start__security"><ShieldCheck size={15} /><span>{t("security")}</span></div>
    </section>
  );
}
