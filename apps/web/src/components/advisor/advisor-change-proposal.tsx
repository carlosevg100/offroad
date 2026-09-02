"use client";

import {Check, LoaderCircle, X} from "lucide-react";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";

import {
  decideAdvisorProjectProposal,
  type AdvisorProposalDecisionState,
} from "@/app/[locale]/app/projects/[projectId]/actions";

export type AdvisorChangeProposal = {
  id: string;
  status: string;
  title: string;
  rationale: string;
  impactSummary: string;
  proposal: unknown;
};

export type AdvisorChangeProposalCopy = {
  preview: string;
  impact: string;
  accept: string;
  reject: string;
  applying: string;
  rejecting: string;
  applied: string;
  rejected: string;
  stale: string;
  monthValue: string;
  errors: {invalid: string; stale: string; save: string; processing: string};
  fields: Record<(typeof proposalFieldKeys)[keyof typeof proposalFieldKeys], string>;
};

const proposalFieldKeys = {
  "/objective": "objective",
  "/requestedAmount": "requestedAmount",
  "/currency": "currency",
  "/urgency": "urgency",
  "/requestedTermMonths": "requestedTermMonths",
  "/requestedGraceMonths": "requestedGraceMonths",
  "/consequenceIfNotExecuted": "consequenceIfNotExecuted",
  "/sector": "sector",
  "/geography": "geography",
  "/instruments": "instruments",
  "/collateralKinds": "collateralKinds",
  "/expectedRate": "expectedRate",
} as const;

const initialState: AdvisorProposalDecisionState = {ok: false};

export function AdvisorChangeProposalCard({
  copy,
  locale,
  projectId,
  proposal,
  sessionId,
}: {
  copy: AdvisorChangeProposalCopy;
  locale: "pt-BR" | "en-US";
  projectId: string;
  proposal: AdvisorChangeProposal;
  sessionId: string;
}) {
  const [state, action] = useActionState(decideAdvisorProjectProposal, initialState);
  const proposalBody = asRecord(proposal.proposal);
  const patches = Array.isArray(proposalBody?.patches) ? proposalBody.patches.map(asRecord).filter(Boolean) : [];

  return (
    <section className={`agent-proposal advisor-change-proposal is-${proposal.status}`}>
      <span>{copy.preview}</span>
      <h4>{proposal.title}</h4>
      <p>{proposal.rationale}</p>
      <dl>
        {patches.map((patch, index) => {
          const path = String(patch?.path ?? "");
          return <div key={`${path}-${index}`}><dt>{fieldLabel(path, copy)}</dt><dd>{formatValue(patch?.value, path, locale, copy)}</dd></div>;
        })}
      </dl>
      <div className="agent-proposal__impact"><strong>{copy.impact}</strong><p>{proposal.impactSummary}</p></div>
      {proposal.status === "proposed" ? (
        <form action={action} className="agent-proposal__actions">
          <input name="locale" type="hidden" value={locale} />
          <input name="project_id" type="hidden" value={projectId} />
          <input name="session_id" type="hidden" value={sessionId} />
          <input name="proposal_id" type="hidden" value={proposal.id} />
          <ProposalDecisionButton copy={copy} decision="accept" />
          <ProposalDecisionButton copy={copy} decision="reject" />
        </form>
      ) : <p className="agent-proposal__outcome">{proposal.status === "applied" ? copy.applied : proposal.status === "rejected" ? copy.rejected : copy.stale}</p>}
      {!state.ok && state.code ? <p className="advisor-change-proposal__error" role="alert">{copy.errors[state.code]}</p> : null}
    </section>
  );
}

function ProposalDecisionButton({copy, decision}: {copy: AdvisorChangeProposalCopy; decision: "accept" | "reject"}) {
  const {data, pending} = useFormStatus();
  const accepting = decision === "accept";
  const isSubmittedDecision = pending && data?.get("decision") === decision;
  return <button className={accepting ? undefined : "is-secondary"} disabled={pending} name="decision" type="submit" value={decision}>
    {isSubmittedDecision ? <LoaderCircle aria-hidden="true" className="spin" size={12} /> : accepting ? <Check aria-hidden="true" size={12} /> : <X aria-hidden="true" size={12} />}
    {isSubmittedDecision ? (accepting ? copy.applying : copy.rejecting) : accepting ? copy.accept : copy.reject}
  </button>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatValue(value: unknown, path: string, locale: string, copy: AdvisorChangeProposalCopy): string {
  if (typeof value === "number" && path === "/requestedAmount") return new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(value);
  if (typeof value === "number" && ["/requestedTermMonths", "/requestedGraceMonths"].includes(path)) {
    return copy.monthValue.replace("{value}", new Intl.NumberFormat(locale).format(value));
  }
  if (typeof value === "number") return new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

function fieldLabel(path: string, copy: AdvisorChangeProposalCopy): string {
  const key = proposalFieldKeys[path as keyof typeof proposalFieldKeys];
  return key ? copy.fields[key] : path.replace(/^\//, "");
}
