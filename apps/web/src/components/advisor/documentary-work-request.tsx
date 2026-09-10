"use client";

import {useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {canCompileStandaloneDocumentWorkRequest} from "@offroad/work-plan";
import styles from "./documentary-work-request.module.css";
import type {AdvisorCommandResult} from "./advisor-command-recovery";

/** Choosing this control is an explicit scope change; ordinary chat stays conversational. */
export function DocumentaryWorkRequest({disabled, onRequest}: {
  disabled: boolean;
  onRequest: (content: string) => Promise<AdvisorCommandResult>;
}) {
  const t = useTranslations("DocumentaryWorkRequest");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const supported = canCompileStandaloneDocumentWorkRequest({objective: content, proposedDeliverable: "Preliminary documentary reading"});
  return <details className={styles.request} data-testid="documentary-work-request">
    <summary>{t("title")}</summary>
    <p>{t("description")}</p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (disabled || lock.current || !supported) return;
      lock.current = true; setPending(true); setError("");
      try {
        const result = await onRequest(content.trim());
        if (result.ok) setContent(""); else setError(result.error);
      } catch {setError(t("uncertain"));}
      finally {lock.current = false; setPending(false);}
    }}>
      <label>{t("label")}<textarea value={content} maxLength={8000} rows={3}
        disabled={disabled || pending} onChange={event => setContent(event.target.value)} placeholder={t("placeholder")} /></label>
      <p>{t(content.trim() && !supported ? "unsupported" : "scope")}</p>
      <button className="button button--ghost" type="submit" disabled={disabled || pending || !supported}>{t(pending ? "saving" : "submit")}</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  </details>;
}
