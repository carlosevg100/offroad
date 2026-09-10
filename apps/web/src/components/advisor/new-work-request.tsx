"use client";

import {
  dispatchProjectWork,
  localizeProjectCapability,
  projectCapabilityRegistry,
  type ProjectCapabilityId,
  type ProjectWorkContext,
  type ProjectWorkDispatch,
} from "@offroad/work-plan";
import {useTranslations} from "next-intl";
import {useRef, useState} from "react";

import type {ProjectWorkRequestRecord} from "@/lib/advisor/project-work-requests";

import styles from "./new-work-request.module.css";

export type NewWorkRequestOutcome =
  | {ok: true; status: "dispatched" | "needs_information"; surface: string}
  | {ok: false; error: string};

export type NewWorkRequestProps = {
  availableSurfaces: readonly string[];
  context: ProjectWorkContext;
  disabled: boolean;
  initialCapability?: ProjectCapabilityId | "auto";
  initialObjective?: string;
  locale: "pt-BR" | "en-US";
  onOpenSurface: (surface: string) => void;
  onRequest: (input: {objective: string; capability: ProjectCapabilityId | "auto"; dispatch: ProjectWorkDispatch}) => Promise<NewWorkRequestOutcome>;
  requests: readonly ProjectWorkRequestRecord[];
};

const capabilityOptions = ["auto", ...projectCapabilityRegistry.map((entry) => entry.id)] as const;

/** One entry for every capability the project can execute. The registry explains the plan, the
 * data used, the expected result and the limits before anything is sent; the server takes the
 * same decision again and the database enforces who may prepare. Nothing runs without approval. */
export function NewWorkRequest(props: NewWorkRequestProps) {
  const t = useTranslations("NewWorkRequest");
  const [objective, setObjective] = useState(props.initialObjective ?? "");
  const [capability, setCapability] = useState<ProjectCapabilityId | "auto">(props.initialCapability ?? "auto");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const text = (value: {pt: string; en: string}) => localizeProjectCapability(value, props.locale);
  const dispatch = objective.trim().length >= 3 ? dispatchProjectWork({objective: objective.trim(), capability}, props.context) : null;
  const canSend = dispatch?.kind === "dispatch" || (dispatch?.kind === "blocked" && dispatch.reason === "missing_inputs");
  const reason = dispatch?.kind === "blocked" || dispatch?.kind === "unsupported" ? dispatch.reason : undefined;

  async function submit() {
    if (!dispatch || !canSend || props.disabled || lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await props.onRequest({objective: objective.trim(), capability, dispatch});
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setObjective("");
      setNotice(result.status === "dispatched" ? t(`dispatched.${dispatch.capability}`) : t("recorded"));
      if (result.status === "dispatched" && dispatch.capability !== "documentary_reading" && props.availableSurfaces.includes(result.surface)) {
        props.onOpenSurface(result.surface);
      }
    } catch {
      setError(t("uncertain"));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return <details className={styles.request} data-testid="new-work-request">
    <summary>{t("title")}</summary>
    <p>{t("description")}</p>
    <form onSubmit={(event) => {event.preventDefault(); void submit();}}>
      <label>{t("objective")}<textarea disabled={props.disabled || pending} maxLength={8000} name="objective" onChange={(event) => setObjective(event.target.value)} placeholder={t("placeholder")} rows={3} value={objective} /></label>
      <fieldset className={styles.options}>
        <legend>{t("capability")}</legend>
        {capabilityOptions.map((option) => <label key={option}>
          <input checked={capability === option} disabled={props.disabled || pending} name="capability" onChange={() => setCapability(option)} type="radio" value={option} />
          <span><strong>{t(`options.${option}.title`)}</strong><small>{t(`options.${option}.hint`)}</small></span>
        </label>)}
      </fieldset>
      {dispatch ? <section aria-live="polite" className={styles.preview} data-capability={dispatch.capability ?? ""} data-kind={dispatch.kind} data-reason={reason} data-testid="new-work-preview">
        {dispatch.kind === "unsupported" ? <>
          <strong>{t("unsupported.title")}</strong>
          <p>{text(dispatch.explanation)}</p>
          <p><strong>{t("nextStep")}</strong>{text(dispatch.nextStep)}</p>
          {dispatch.suggestedCapability ? <div><button className="button button--ghost" disabled={props.disabled || pending} onClick={() => setCapability(dispatch.suggestedCapability!)} type="button">{t("useSuggestion", {capability: t(`options.${dispatch.suggestedCapability}.title`)})}</button></div> : null}
        </> : null}
        {dispatch.kind === "blocked" ? <>
          <strong>{t(`blocked.${dispatch.reason}`)}</strong>
          <p>{text(dispatch.explanation)}</p>
          <p><strong>{t("nextStep")}</strong>{text(dispatch.nextStep)}</p>
          {dispatch.missingInputs.length ? <ul>{dispatch.missingInputs.map((input) => <li key={input}>{t(`inputs.${input}`)}</li>)}</ul> : null}
        </> : null}
        {dispatch.kind === "dispatch" ? <>
          <header><strong>{text(dispatch.entry.intention)}</strong><small>{t("executor", {surface: t(`surfaces.${dispatch.surface}`)})}</small></header>
          {dispatch.note ? <p className={styles.note}>{t(`notes.${dispatch.note}`)}</p> : null}
          <div><strong>{t("plan")}</strong><ol>{dispatch.entry.plan.map((step) => <li key={step.pt}>{text(step)}</li>)}</ol></div>
          <div><strong>{t("dataUsed")}</strong><ul>{dispatch.entry.inputs.map((input) => <li data-needed-before={input.neededBefore} key={input.key}>{text(input.label)} · {t(`inputTiming.${input.neededBefore}`)}</li>)}</ul></div>
          <div><strong>{t("expectedResult")}</strong><p>{text(dispatch.entry.expectedResult)}</p></div>
          <div><strong>{t("limits")}</strong><ul>{dispatch.entry.limits.map((limit) => <li key={limit.pt}>{text(limit)}</li>)}</ul></div>
          <p>{t(`approval.${dispatch.entry.approval.gate}`)}</p>
        </> : null}
      </section> : null}
      <footer>
        <button className="button button--ghost" disabled={!canSend || props.disabled || pending} type="submit">{t(pending ? "saving" : dispatch?.kind === "blocked" ? "record" : "submit")}</button>
        <small>{t("scope")}</small>
      </footer>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </form>
    {props.requests.length ? <section className={styles.history} data-testid="new-work-history">
      <h3>{t("history")}</h3>
      <ul>{props.requests.map((request) => <li data-capability={request.capability} data-status={request.status} key={request.id}>
        <span>{t(`options.${request.capability}.title`)} · {t(`status.${request.status}`)}</span>
        <p>{request.objective}</p>
        <div>
          {request.surface && props.availableSurfaces.includes(request.surface) ? <button className="button button--ghost" onClick={() => props.onOpenSurface(request.surface!)} type="button">{t("open")}</button> : null}
          {request.originSection && request.originSection !== request.surface && props.availableSurfaces.includes(request.originSection) ? <button className="button button--ghost" onClick={() => props.onOpenSurface(request.originSection!)} type="button">{t("origin")}</button> : null}
        </div>
      </li>)}</ul>
    </section> : null}
  </details>;
}
