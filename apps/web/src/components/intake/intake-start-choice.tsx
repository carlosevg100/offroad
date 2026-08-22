import {ArrowRight, FileSearch, ListChecks, ShieldCheck, Waypoints} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {IntakeContext, IntakeStartActionSet} from "@/lib/intake/types";

type Props = {
  locale: string;
  context: IntakeContext;
  actions: IntakeStartActionSet;
};

/**
 * One guided entry point, shared by onboarding and the workspace new-case flow.
 *
 * Uploading versus typing is an implementation detail, not a decision the company should have
 * to make before it has even described the transaction. The guided journey asks the purpose
 * first, builds the request list from it, and lets files and direct answers coexist later.
 */
export async function IntakeStartChoice({locale, context, actions}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.start"});
  const isCase = context === "workspace";
  return (
    <section className="intake-start">
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
