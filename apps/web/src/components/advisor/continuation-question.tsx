"use client";

import {ArrowRight, MessageSquare, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {useState} from "react";

import type {ContinuationChoice} from "@/lib/advisor/work-continuation";

import "@/app/work-updates.css";

export type ContinuationQuestionState = Readonly<{
  text: string;
  code: "ambiguous_base" | "no_approved_base";
  options: readonly ContinuationChoice[];
}>;

/**
 * The question a continuation becomes when its base is ambiguous or absent. The person chooses the
 * base, sends the text as an ordinary message or goes back to the text; nothing is recorded before.
 */
export function ContinuationQuestion({question, disabled, onChoose, onSendAsMessage, onDismiss}: {
  question: ContinuationQuestionState;
  disabled: boolean;
  onChoose: (option: ContinuationChoice) => void;
  onSendAsMessage: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("App.advisorProject.continuation.question");
  const [selected, setSelected] = useState<string | null>(question.options.length === 1 ? question.options[0]?.milestoneId ?? null : null);
  const chosen = question.options.find((option) => option.milestoneId === selected);
  const explanation = question.options.length === 0 ? t("none") : t(question.code);
  return <section aria-labelledby="continuation-question-title" className="continuation-question" role="group">
    <header>
      <h2 id="continuation-question-title">{t("title")}</h2>
      <button aria-label={t("dismiss")} className="continuation-question__close" disabled={disabled} onClick={onDismiss} title={t("dismiss")} type="button"><X aria-hidden="true" size={14} /></button>
    </header>
    <p>{explanation}</p>
    <blockquote><span>{t("request")}</span>{question.text}</blockquote>
    {question.options.length ? <fieldset disabled={disabled}>
      <legend>{t("legend")}</legend>
      {question.options.map((option) => <label key={option.milestoneId}>
        <input checked={selected === option.milestoneId} name="continuation-base" onChange={() => setSelected(option.milestoneId)} type="radio" value={option.milestoneId} />
        <span>{t("option", {label: option.label, revision: option.revision})}</span>
      </label>)}
    </fieldset> : null}
    <footer>
      {question.options.length ? <button className="button button--small" disabled={disabled || !chosen} onClick={() => chosen && onChoose(chosen)} type="button">
        <ArrowRight aria-hidden="true" size={14} />{t("choose")}
      </button> : null}
      <button className="button button--small button--outline" disabled={disabled} onClick={onSendAsMessage} type="button"><MessageSquare aria-hidden="true" size={14} />{t("sendAsMessage")}</button>
    </footer>
  </section>;
}
