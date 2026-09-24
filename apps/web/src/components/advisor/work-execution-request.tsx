"use client";
import {useRef, useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {requestCapitalExecution} from "@/app/[locale]/app/projects/[projectId]/executions/actions";
import "./work-execution.css";

type Unverified = Array<{sourceVersionId: string; reason: "rights_missing" | "bytes_unverified" | "binding_missing"}>;
/** One request per form content: the request id is minted once for the typed values and kept
 * across retries, so a second click reaches the execution the first one created. */
export function WorkExecutionRequest({locale, projectId, versions, selectedVersionId}: {locale: string; projectId: string; versions: Array<{id: string; revision: number}>; selectedVersionId: string | null}) {
  const t = useTranslations("App.workExecutions"), router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null), [unverified, setUnverified] = useState<Unverified>([]);
  const request = useRef<{payload: string; id: string} | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  function requestId(payload: unknown) {const serialized = JSON.stringify(payload); if (request.current?.payload !== serialized) request.current = {payload: serialized, id: crypto.randomUUID()}; return request.current.id;}
  const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
  if (!versions.length) return <section><h2>{t("request.title")}</h2><p>{t("request.noVersions")}</p></section>;
  return <section><h2>{t("request.title")}</h2><p>{t("request.help")}</p>
    {error ? <p role="alert">{t(`errors.${error}`)}{unverified.length ? <span> {t("unverified.title")} <ul>{unverified.map(s => <li key={s.sourceVersionId}><code>{s.sourceVersionId}</code>: {t(`unverified.${s.reason}`)}</li>)}</ul></span> : null}</p> : null}
    <form action={f => {
      const payload = {locale, projectId, versionId: text(f, "versionId"), question: text(f, "question"), objectives: text(f, "objectives").split("\n").map(o => o.trim()).filter(Boolean), asOf: text(f, "asOf")};
      const id = requestId(payload); setError(null); setUnverified([]);
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
      <label>{t("request.objectives")}<textarea name="objectives" required maxLength={20000} /></label>
      <p>{t("request.objectivesHelp")}</p>
      <button disabled={pending}>{t("request.submit")}</button>
    </form></section>;
}
