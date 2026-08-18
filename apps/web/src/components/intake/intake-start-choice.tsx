import {ArrowRight, Check, PencilLine, ShieldCheck, Sparkles, UploadCloud} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {IntakeContext, IntakeStartActionSet} from "@/lib/intake/types";

type Props = {
  locale: string;
  context: IntakeContext;
  actions: IntakeStartActionSet;
};

/** "Start with documents" vs "fill in manually" choice, shared by onboarding and the workspace new-case flow. */
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
      <div className="intake-start__options">
        <form action={actions.start} className="intake-start__card is-recommended">
          <input name="locale" type="hidden" value={locale} />
          <span className="intake-start__badge"><Sparkles aria-hidden="true" size={12} />{t("recommended")}</span>
          <div className="intake-start__icon"><UploadCloud aria-hidden="true" size={25} /></div>
          <h3>{t("documentsTitle")}</h3>
          <p>{t("documentsBody")}</p>
          <ul>
            <li><Check size={12} />{t("benefitTyping")}</li>
            <li><Check size={12} />{t("benefitConflicts")}</li>
            <li><Check size={12} />{t("benefitSources")}</li>
          </ul>
          <button className="button" type="submit">{t("documentsCta")}<ArrowRight size={15} /></button>
        </form>
        <form action={actions.manual} className="intake-start__card">
          <input name="locale" type="hidden" value={locale} />
          <div className="intake-start__icon"><PencilLine aria-hidden="true" size={24} /></div>
          <h3>{t("manualTitle")}</h3>
          <p>{t("manualBody")}</p>
          <button className="button button--ghost" type="submit">{t("manualCta")}<ArrowRight size={15} /></button>
        </form>
      </div>
      <div className="intake-start__security"><ShieldCheck size={15} /><span>{t("security")}</span></div>
    </section>
  );
}
