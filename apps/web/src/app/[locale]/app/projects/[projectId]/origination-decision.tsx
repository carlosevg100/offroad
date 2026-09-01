"use client";

import {Check, LoaderCircle, RotateCcw} from "lucide-react";
import {useRouter} from "next/navigation";
import {useActionState, useEffect} from "react";

import {decideOriginationArtifact, type OriginationDecisionState} from "./actions";

type Props = {
  artifactId: string;
  copy: {
    confirm: string;
    confirmed: string;
    errorInvalid: string;
    errorSave: string;
    errorStale: string;
    note: string;
    notePlaceholder: string;
    requestChanges: string;
    requested: string;
    title: string;
  };
  fingerprint: string;
  locale: string;
  projectId: string;
};

const initialState: OriginationDecisionState = {ok: false};

export function OriginationDecision({artifactId, copy, fingerprint, locale, projectId}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(decideOriginationArtifact, initialState);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  const error = state.code === "invalid" ? copy.errorInvalid : state.code === "stale" ? copy.errorStale : state.code ? copy.errorSave : null;

  return (
    <section className="origination-decision">
      <div><span className="section-kicker">{copy.title}</span></div>
      <div className="origination-decision__actions">
        <form action={formAction}>
          <DecisionIdentityFields artifactId={artifactId} fingerprint={fingerprint} locale={locale} projectId={projectId} />
          <button className="button" disabled={pending} name="decision" type="submit" value="confirm">
            {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Check aria-hidden="true" size={14} />}{state.decision === "confirm" ? copy.confirmed : copy.confirm}
          </button>
        </form>
        <details>
          <summary><RotateCcw aria-hidden="true" size={14} />{copy.requestChanges}</summary>
          <form action={formAction}>
            <DecisionIdentityFields artifactId={artifactId} fingerprint={fingerprint} locale={locale} projectId={projectId} />
            <label><span>{copy.note}</span><textarea maxLength={5000} minLength={2} name="note" placeholder={copy.notePlaceholder} required rows={4} /></label>
            <button className="button button--secondary" disabled={pending} name="decision" type="submit" value="request_changes">
              {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}{state.decision === "request_changes" ? copy.requested : copy.requestChanges}
            </button>
          </form>
        </details>
      </div>
      {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
    </section>
  );
}

function DecisionIdentityFields({artifactId, fingerprint, locale, projectId}: Pick<Props, "artifactId" | "fingerprint" | "locale" | "projectId">) {
  return (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="project_id" type="hidden" value={projectId} />
      <input name="artifact_id" type="hidden" value={artifactId} />
      <input name="artifact_fingerprint" type="hidden" value={fingerprint} />
    </>
  );
}
