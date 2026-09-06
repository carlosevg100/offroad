"use client";

import {ArrowRight, Bot, CircleHelp, LoaderCircle} from "lucide-react";
import {useState, type FormEvent} from "react";

export type AdvisorInformationRequest = {
  id: string;
  question: string;
  whyItMatters: string;
  decisionImpact: string;
  answerKind: "text" | "number" | "date" | "choice" | "document" | "confirmation";
  choices: string[];
  acceptableEvidence: string[];
  updatedAt: string;
};

export type InformationRequestCopy = {
  eyebrow: string;
  why: string;
  impact: string;
  evidence: string;
  other: string;
  placeholder: string;
  submit: string;
  submitting: string;
  unavailable: string;
  unavailableMessage: string;
  remaining: string;
  confirmYes: string;
  confirmNo: string;
};

type AnswerSource = "choice" | "custom" | "unavailable";

export function InformationRequestCard(props: {
  copy: InformationRequestCopy;
  disabled?: boolean;
  remaining: number;
  request: AdvisorInformationRequest;
  onAnswer: (input: {source: AnswerSource; content: string}) => Promise<{ok: true} | {ok: false; error: string}>;
}) {
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<AnswerSource | null>(null);
  const [error, setError] = useState("");
  const choices = props.request.answerKind === "confirmation" && props.request.choices.length === 0
    ? [props.copy.confirmYes, props.copy.confirmNo]
    : props.request.choices;
  const choiceMode = ["choice", "confirmation"].includes(props.request.answerKind) && choices.length > 0;

  async function answer(source: AnswerSource, content: string) {
    const normalized = content.trim();
    if (!normalized || pending || props.disabled) return;
    setError("");
    setPending(source);
    const result = await props.onAnswer({source, content: normalized});
    setPending(null);
    if (!result.ok) setError(result.error);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void answer("custom", value);
  }

  const inputType = props.request.answerKind === "number"
    ? "number"
    : props.request.answerKind === "date"
    ? "date"
    : "text";

  return <article className="information-request-card" data-answer-kind={props.request.answerKind}>
    <header>
      <span className="advisor-thread__avatar"><Bot aria-hidden="true" size={15} /></span>
      <div>
        <span><CircleHelp aria-hidden="true" size={13} />{props.copy.eyebrow}</span>
        <h2>{props.request.question}</h2>
      </div>
      {props.remaining > 0 ? <small>{props.remaining} {props.copy.remaining}</small> : null}
    </header>

    <div className="information-request-card__context">
      <p><strong>{props.copy.why}</strong>{props.request.whyItMatters}</p>
      <p><strong>{props.copy.impact}</strong>{props.request.decisionImpact}</p>
    </div>

    {choiceMode && !custom ? <div className="information-request-card__choices">
      {choices.map((choice) => <button disabled={Boolean(pending) || props.disabled} key={choice} onClick={() => void answer("choice", choice)} type="button">
        <span>{choice}</span>{pending === "choice" ? <LoaderCircle aria-hidden="true" className="spin" size={13} /> : <ArrowRight aria-hidden="true" size={13} />}
      </button>)}
      <button className="is-other" disabled={Boolean(pending) || props.disabled} onClick={() => setCustom(true)} type="button">{props.copy.other}</button>
    </div> : <form className="information-request-card__answer" onSubmit={submit}>
      {props.request.answerKind === "document" && props.request.acceptableEvidence.length ? <small><strong>{props.copy.evidence}</strong>{props.request.acceptableEvidence.join(" · ")}</small> : null}
      <div>
        <input
          disabled={Boolean(pending) || props.disabled}
          inputMode={props.request.answerKind === "number" ? "decimal" : undefined}
          maxLength={8000}
          onChange={(event) => setValue(event.target.value)}
          placeholder={props.copy.placeholder}
          type={inputType}
          value={value}
        />
        <button aria-label={props.copy.submit} disabled={!value.trim() || Boolean(pending) || props.disabled} type="submit">
          {pending === "custom" ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <ArrowRight aria-hidden="true" size={14} />}
        </button>
      </div>
      {choiceMode ? <button className="information-request-card__back" onClick={() => {setCustom(false); setValue("");}} type="button">{props.copy.other}</button> : null}
    </form>}

    <footer>
      <button disabled={Boolean(pending) || props.disabled} onClick={() => void answer("unavailable", props.copy.unavailableMessage)} type="button">
        {pending === "unavailable" ? <LoaderCircle aria-hidden="true" className="spin" size={12} /> : null}{props.copy.unavailable}
      </button>
    </footer>
    {error ? <p className="information-request-card__error" role="alert">{error}</p> : null}
  </article>;
}
