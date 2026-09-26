"use client";
import {useId, useRef, useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {requestCapitalExecution} from "@/app/[locale]/app/projects/[projectId]/executions/actions";
import type {ExecutionFollowup} from "@/lib/advisor/work-updates";
import "./work-execution.css";

type Unverified = Array<{sourceVersionId: string; reason: "rights_missing" | "bytes_unverified" | "binding_missing"}>;
/** One request per form content: the request id is minted once for the typed values and kept
 * across retries, so a second click reaches the execution the first one created. The situations
 * are the R3 catalogue, in its order, labelled with the catalogue text; at least one is required.
 * Started from a follow-up of the conversation, the form shows the follow-up and the base it
 * continues and fills the first objective with its text; everything stays editable and the action
 * validates the request as any other. */
export function WorkExecutionRequest({locale, projectId, versions, selectedVersionId, situations, followup = null}: {locale: string; projectId: string; versions: Array<{id: string; revision: number}>; selectedVersionId: string | null; situations: readonly string[];
  followup?: ExecutionFollowup | null}) {
  const t = useTranslations("App.workExecutions"), router = useRouter(), followupTitle = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null), [unverified, setUnverified] = useState<Unverified>([]);
  const request = useRef<{payload: string; id: string} | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  function requestId(payload: unknown) {const serialized = JSON.stringify(payload); if (request.current?.payload !== serialized) request.current = {payload: serialized, id: crypto.randomUUID()}; return request.current.id;}
  const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
  const reference = followup?.state === "ready" ? <aside className="execution-followup" aria-labelledby={followupTitle}>
    <strong id={followupTitle}>{t("request.followup.title")}</strong>
    <blockquote>{followup.text}</blockquote>
    <p>{t("request.followup.base", {label: followup.base.label, revision: followup.base.revision})}</p>
    <p>{t("request.followup.help")}</p>
  </aside> : followup ? <p role="status">{t("request.followup.unavailable")}</p> : null;
  if (!versions.length) return <section><h2>{t("request.title")}</h2>{reference}<p>{t("request.noVersions")}</p></section>;
  return <section><h2>{t("request.title")}</h2><p>{t("request.help")}</p>{reference}
    {error ? <p role="alert">{t(`errors.${error}`)}{unverified.length ? <span> {t("unverified.title")} <ul>{unverified.map(s => <li key={s.sourceVersionId}><code>{s.sourceVersionId}</code>: {t(`unverified.${s.reason}`)}</li>)}</ul></span> : null}</p> : null}
    <form action={f => {
      const payload = {locale, projectId, versionId: text(f, "versionId"), question: text(f, "question"), objectives: text(f, "objectives").split("\n").map(o => o.trim()).filter(Boolean), asOf: text(f, "asOf"),
        situationIds: f.getAll("situationIds").map(String)};
      setError(null); setUnverified([]);
      if (!payload.situationIds.length) {setError("situation_required"); return;}
      const id = requestId(payload);
      startTransition(async () => {
        try {
          const result = await requestCapitalExecution({...payload, requestId: id});
          if (!result.ok) {setError(result.error); setUnverified(result.unverifiedSources ?? []); return;}
          router.push(`/${locale}/app/projects/${projectId}/executions/${result.executionId}`); router.refresh();
        } catch { setError("unavailable"); }
      });
    }}>
      <label>{t("request.version")}<select name="versionId" required defaultValue={selectedVersionId ?? versions[0]!.id}>{versions.map(v => <option key={v.id} value={v.id}>{t("request.revision", {number: v.revision})}</option>)}</select></label>
      <label>{t("request.asOf")}<input name="asOf" type="date" required defaultValue={today} /></label>
      <label>{t("request.question")}<input name="question" required maxLength={2000} /></label>
      <label>{t("request.objectives")}<textarea name="objectives" required maxLength={20000} defaultValue={followup?.state === "ready" ? followup.objective : undefined} /></label>
      <p>{t("request.objectivesHelp")}</p>
      <fieldset className="execution-situations"><legend>{t("request.situations")}</legend><p>{t("request.situationsHelp")}</p>
        {situations.map(id => <label key={id}><input type="checkbox" name="situationIds" value={id} />{t.has(`situations.${id}`) ? t(`situations.${id}`) : id}</label>)}
      </fieldset>
      <button disabled={pending}>{t("request.submit")}</button>
    </form></section>;
}
