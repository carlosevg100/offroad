import {ArrowRight, FileSearch, ListChecks, ShieldCheck, Waypoints} from "lucide-react";
import {getTranslations} from "next-intl/server";
import Link from "next/link";

import type {IntakeContext, IntakeStartActionSet} from "@/lib/intake/types";

import {IntakeJourneyTelemetry} from "./intake-journey-telemetry";
import {IntakeActionSubmit} from "./intake-action-submit";

type Props = {
  locale: string;
  context: IntakeContext;
  journey: "company" | "originator";
  actions: IntakeStartActionSet;
  startHref?: string;
  hideAction?: boolean;
};

/**
 * One guided entry point, shared by onboarding and the workspace new-case flow.
 *
 * Uploading versus typing is an implementation detail, not a decision the company should have
 * to make before it has even described the transaction. The guided journey asks the purpose
 * first, builds the request list from it, and lets files and direct answers coexist later.
 */
export async function IntakeStartChoice({locale, context, journey, actions, startHref, hideAction = false}: Props) {
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
              <li><span>1</span><div><strong>{t("youDo1Title")}</strong><p>{t("youDo1Body")}</p></div></li>
              <li><span>2</span><div><strong>{t("youDo2Title")}</strong><p>{t("youDo2Body")}</p></div></li>
              <li><span>3</span><div><strong>{t("youDo3Title")}</strong><p>{t("youDo3Body")}</p></div></li>
              <li><span>4</span><div><strong>{t("youDo4Title")}</strong><p>{t("youDo4Body")}</p></div></li>
            </ol>
          </section>
          <section className="intake-welcome__roles-offroad">
            <header><span>02</span><h3>{t("offroadDoesTitle")}</h3></header>
            <ol>
              <li><span>5</span><div><strong>{t("offroadDoes1Title")}</strong><p>{t("offroadDoes1Body")}</p></div></li>
              <li><span>6</span><div><strong>{t("offroadDoes2Title")}</strong><p>{t("offroadDoes2Body")}</p></div></li>
              <li><span>7</span><div><strong>{t("offroadDoes3Title")}</strong><p>{t("offroadDoes3Body")}</p></div></li>
              <li><span>8</span><div><strong>{t("offroadDoes4Title")}</strong><p>{t("offroadDoes4Body")}</p></div></li>
              <li><span>9</span><div><strong>{t("offroadDoes5Title")}</strong><p>{t("offroadDoes5Body")}</p></div></li>
              <li><span>10</span><div><strong>{t("offroadDoes6Title")}</strong><p>{t("offroadDoes6Body")}</p></div></li>
            </ol>
          </section>
        </div>

        {!hideAction ? <div className="intake-welcome__action">
          {startHref ? <Link className="button" href={startHref}>{t("guidedCta")}<ArrowRight aria-hidden="true" size={15} /></Link> : (
            <form action={actions.start}>
              <input name="locale" type="hidden" value={locale} />
              <IntakeActionSubmit idle={t("guidedCta")} pending={t("guidedCtaPending")} />
            </form>
          )}
          <span>{t("welcomeActionTime")}</span>
        </div> : null}

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
