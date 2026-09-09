"use client";

import {Check} from "lucide-react";
import {useTranslations} from "next-intl";

export type DocumentaryWorkContext = {
  job: "comparison" | "meeting" | "review";
  /** Questions from the current bound documentary result, never the capital checklist. */
  gaps?: Array<{text: string; question: string}>;
};

export function DocumentaryWorkNextStep({context}: {context: DocumentaryWorkContext}) {
  const t = useTranslations("App.privateCase.documentaryWork");
  return <section className="advisor-private-work__request" data-testid="documentary-work-next-step">
    <header><Check aria-hidden="true" size={15} /><div><span>{t("kicker")}</span><h2>{t(`jobs.${context.job}`)}</h2><p>{t("body")}</p></div></header>
    {context.gaps?.length ? <>
      <h3 className="advisor-documentary-work__gaps-title">{t("gapsTitle")}</h3>
      <ol>{context.gaps.map((gap, index) => <li key={`${index}:${gap.question}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{gap.question}</strong><p>{gap.text}</p></div></li>)}</ol>
    </> : <p className="advisor-private-work__request-empty">{t("nextStep")}</p>}
    <footer>{t("footer")}</footer>
  </section>;
}
