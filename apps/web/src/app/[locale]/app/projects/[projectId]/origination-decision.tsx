"use client";

import {Check, LoaderCircle, RotateCcw} from "lucide-react";
import {useRouter} from "next/navigation";
import {useActionState, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {capitalProjectReviewAllowed, type CapitalProjectReviewBasis} from "@/lib/artifacts/capital-project-review";

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
  reviewBasis?: CapitalProjectReviewBasis | null;
};

const initialState: OriginationDecisionState = {ok: false};

export function OriginationDecision({artifactId, copy, fingerprint, locale, projectId, reviewBasis}: Props) {
  const router = useRouter();
  const reviewText = useTranslations("ArtifactRevisionReview");
  const commands = useRef(new Map<string, string>());
  const [declaration, setDeclaration] = useState<{basis: string; declared: boolean} | null>(null);
  const basisKey = reviewBasis ? `${reviewBasis.revisionId}:${reviewBasis.manifestFingerprint}:${reviewBasis.artifactFingerprint}` : "";
  const declared = Boolean(basisKey && declaration?.basis === basisKey && declaration.declared);
  const selfReview = Boolean(reviewBasis && reviewBasis.preparedBy === reviewBasis.viewerId);
  const allowed = (decision: "confirm" | "request_changes") => Boolean(reviewBasis && capitalProjectReviewAllowed(reviewBasis, decision, declared));
  const [state, formAction, pending] = useActionState(async (previous: OriginationDecisionState, data: FormData) => {
    const key = JSON.stringify([projectId, artifactId, basisKey, data.get("decision"), data.get("note") ?? "", declared]);
    let id = commands.current.get(key);
    if (!id) {id = crypto.randomUUID(); commands.current.set(key, id);}
    data.set("command_id", id);
    data.set("self_approval_declared", String(declared));
    return decideOriginationArtifact(previous, data);
  }, initialState);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  const error = state.code === "invalid" ? copy.errorInvalid : state.code === "stale" ? copy.errorStale : state.code ? copy.errorSave : null;

  return (
    <section className="origination-decision">
      <div><span className="section-kicker">{copy.title}</span></div>
      {selfReview ? reviewBasis?.policy.selfApprovalAllowed
        ? <label><input checked={declared} disabled={pending} onChange={event => setDeclaration({basis: basisKey, declared: event.target.checked})} type="checkbox" />{reviewText("declaration")}</label>
        : <p>{reviewText("differentReviewer")}</p> : null}
      <div className="origination-decision__actions">
        <form action={formAction}>
          <DecisionIdentityFields artifactId={artifactId} fingerprint={fingerprint} locale={locale} projectId={projectId} reviewBasis={reviewBasis} />
          <button className="button" disabled={pending || !allowed("confirm")} name="decision" type="submit" value="confirm">
            {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Check aria-hidden="true" size={14} />}{state.decision === "confirm" ? copy.confirmed : copy.confirm}
          </button>
        </form>
        <details>
          <summary><RotateCcw aria-hidden="true" size={14} />{copy.requestChanges}</summary>
          <form action={formAction}>
            <DecisionIdentityFields artifactId={artifactId} fingerprint={fingerprint} locale={locale} projectId={projectId} reviewBasis={reviewBasis} />
            <label><span>{copy.note}</span><textarea maxLength={5000} minLength={2} name="note" placeholder={copy.notePlaceholder} required rows={4} /></label>
            <button className="button button--secondary" disabled={pending || !allowed("request_changes")} name="decision" type="submit" value="request_changes">
              {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}{state.decision === "request_changes" ? copy.requested : copy.requestChanges}
            </button>
          </form>
        </details>
      </div>
      {error ? <p className="form-notice form-notice--error" role="alert">{error}</p> : null}
    </section>
  );
}

function DecisionIdentityFields({artifactId, fingerprint, locale, projectId, reviewBasis}: Pick<Props, "artifactId" | "fingerprint" | "locale" | "projectId" | "reviewBasis">) {
  return (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="project_id" type="hidden" value={projectId} />
      <input name="artifact_id" type="hidden" value={artifactId} />
      <input name="artifact_fingerprint" type="hidden" value={fingerprint} />
      <input name="revision_id" type="hidden" value={reviewBasis?.revisionId ?? ""} />
      <input name="manifest_fingerprint" type="hidden" value={reviewBasis?.manifestFingerprint ?? ""} />
    </>
  );
}
