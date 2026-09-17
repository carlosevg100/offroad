"use client";

import {useActionState, useEffect, useRef} from "react";
import {useTranslations} from "next-intl";
import {attachWorkDossier, saveWorkContext, type WorkContextState} from "@/app/[locale]/app/work-context-actions";
import styles from "./work-context-editor.module.css";

export type WorkContextValue = {purpose: string; audience: string | null; deadline: string | null; commitment: string; stage: string; revision: number};
export function WorkContextEditor({locale, workId, value, dossiers}: {
  locale: string; workId: string; value: WorkContextValue;
  dossiers: Array<{id: string; name: string; linked: boolean}>;
}) {
  const t = useTranslations("WorkContext");
  const deadline = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!deadline.current) return;
    if (!value.deadline) {deadline.current.value = ""; return;}
    const date = new Date(value.deadline);
    // The browser displays local time; the command receives the exact UTC instant.
    deadline.current.value = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }, [value.deadline]);
  const [state, action, pending] = useActionState(async (previous: WorkContextState, form: FormData) => {
    const local = String(form.get("deadline") ?? "");
    if (local) {
      const date = new Date(local);
      if (!Number.isFinite(date.getTime())) return {ok: false, error: "invalid" as const};
      form.set("deadline", date.toISOString());
    }
    return saveWorkContext(previous, form);
  }, {ok: false});
  const [linkState, linkAction, linking] = useActionState(attachWorkDossier, {ok: false});
  const available = dossiers.filter(d => !d.linked);
  return <details className={styles.context} data-testid="work-context">
    <summary>{t("title")}</summary>
    <form action={action}>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="workId" value={workId} />
      <input type="hidden" name="revision" value={value.revision} /><input type="hidden" name="stage" value={value.stage} />
      <label>{t("purpose")}<textarea name="purpose" required maxLength={8000} defaultValue={value.purpose} /></label>
      <label>{t("audience")}<input name="audience" maxLength={500} defaultValue={value.audience ?? ""} /></label>
      <label>{t("deadline")}<input name="deadline" type="datetime-local" ref={deadline} /></label>
      <label>{t("commitment")}<select name="commitment" defaultValue={value.commitment}>
        {(["exploring", "preparing", "deciding"] as const).map(key => <option key={key} value={key}>{t(key)}</option>)}
      </select></label>
      <button disabled={pending} type="submit">{t("save")}</button>
      {state.error ? <p role="alert">{t(`errors.${state.error}`)}</p> : state.ok ? <p role="status">{t("saved")}</p> : null}
    </form>
    <section>
      <h2>{t("dossiers")}</h2>
      <p>{t("dossiersHelp")}</p>
      <ul>{dossiers.filter(d => d.linked).map(d => <li key={d.id}>{d.name}</li>)}</ul>
      {available.length ? <form action={linkAction}>
        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="workId" value={workId} />
        <label>{t("chooseDossier")}<select name="dossierId" required defaultValue=""><option value="" disabled>{t("chooseDossier")}</option>
          {available.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}
        </select></label>
        <button disabled={linking} type="submit">{t("link")}</button>
      </form> : null}
      {linkState.error ? <p role="alert">{t(`errors.${linkState.error}`)}</p> : null}
    </section>
  </details>;
}
