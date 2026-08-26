"use client";

import {Bot, Check, LoaderCircle, Send, X} from "lucide-react";
import {useRouter} from "next/navigation";
import {useEffect} from "react";

type AgentMessage = {
  id: string;
  role: string;
  status: string;
  content: string;
  proposal_id: string | null;
  metadata: unknown;
};

type AgentProposal = {
  id: string;
  status: string;
  title: string;
  rationale: string;
  impact_summary: string;
  proposal: unknown;
};

type AgentPanelProps = {
  copy: AgentPanelCopy;
  locale: string;
  sessionId: string;
  conversationState: string;
  messages: AgentMessage[];
  proposals: AgentProposal[];
  submitAction: (formData: FormData) => Promise<void>;
  decideAction: (formData: FormData) => Promise<void>;
};

export type AgentPanelCopy = {
  eyebrow: string;
  title: string;
  body: string;
  placeholder: string;
  send: string;
  states: {
    analyzing: string;
    asking: string;
    proposing: string;
    idle: string;
    failed: string;
  };
  preview: string;
  impact: string;
  accept: string;
  reject: string;
  applied: string;
  rejected: string;
  stale: string;
  control: string;
  monthValue: string;
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

export function AgentPanel(props: AgentPanelProps) {
  const router = useRouter();
  const {copy} = props;
  const pending = props.conversationState === "analyzing"
    || props.messages.some((message) => message.role === "user" && ["queued", "processing"].includes(message.status));

  useEffect(() => {
    if (!pending) return;
    const interval = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(interval);
  }, [pending, router]);

  const proposalById = new Map(props.proposals.map((proposal) => [proposal.id, proposal]));
  const state = ["analyzing", "asking", "proposing", "failed"].includes(props.conversationState)
    ? props.conversationState as "analyzing" | "asking" | "proposing" | "failed"
    : "idle";
  const stateLabel = copy.states[state];

  return (
    <section className="agent-panel">
      <header className="agent-panel__header">
        <div className="agent-panel__identity"><span><Bot aria-hidden="true" size={15} /></span><div><small>{copy.eyebrow}</small><h3>{copy.title}</h3></div></div>
        <div className={`agent-panel__state is-${props.conversationState}`}>
          {pending ? <LoaderCircle aria-hidden="true" size={12} /> : <i />}{stateLabel}
        </div>
        <p>{copy.body}</p>
      </header>

      {props.messages.length > 0 ? (
        <div aria-live="polite" className="agent-panel__messages">
          {props.messages.map((message) => {
            const proposal = message.proposal_id ? proposalById.get(message.proposal_id) : undefined;
            return (
              <article className={`agent-message is-${message.role}`} key={message.id}>
                <div className="agent-message__bubble">{message.content}</div>
                {message.status === "failed" ? <small>{copy.states.failed}</small> : null}
                {proposal ? <ProposalCard copy={copy} locale={props.locale} proposal={proposal} sessionId={props.sessionId} decideAction={props.decideAction} /> : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <form action={props.submitAction} className="agent-composer">
        <input name="locale" type="hidden" value={props.locale} />
        <input name="session_id" type="hidden" value={props.sessionId} />
        <label><span className="sr-only">{copy.placeholder}</span><textarea disabled={pending} maxLength={4000} name="message" placeholder={copy.placeholder} required rows={3} /></label>
        <button aria-label={copy.send} disabled={pending} type="submit"><Send aria-hidden="true" size={14} /><span>{copy.send}</span></button>
      </form>
      <footer><Check aria-hidden="true" size={11} /><span>{copy.control}</span></footer>
    </section>
  );
}

function ProposalCard({
  copy, proposal, locale, sessionId, decideAction,
}: {
  copy: AgentPanelCopy;
  proposal: AgentProposal;
  locale: string;
  sessionId: string;
  decideAction: (formData: FormData) => Promise<void>;
}) {
  const proposalBody = asRecord(proposal.proposal);
  const patches = Array.isArray(proposalBody?.patches) ? proposalBody.patches.map(asRecord).filter(Boolean) : [];
  return (
    <section className={`agent-proposal is-${proposal.status}`}>
      <span>{copy.preview}</span>
      <h4>{proposal.title}</h4>
      <p>{proposal.rationale}</p>
      <dl>
        {patches.map((patch, index) => {
          const path = String(patch?.path ?? "");
          return <div key={`${path}-${index}`}><dt>{fieldLabel(path, copy)}</dt><dd>{formatValue(patch?.value, path, locale, copy)}</dd></div>;
        })}
      </dl>
      <div className="agent-proposal__impact"><strong>{copy.impact}</strong><p>{proposal.impact_summary}</p></div>
      {proposal.status === "proposed" ? (
        <form action={decideAction} className="agent-proposal__actions">
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={sessionId} />
          <input name="proposal_id" type="hidden" value={proposal.id} />
          <button name="decision" type="submit" value="accept"><Check aria-hidden="true" size={12} />{copy.accept}</button>
          <button className="is-secondary" name="decision" type="submit" value="reject"><X aria-hidden="true" size={12} />{copy.reject}</button>
        </form>
      ) : <p className="agent-proposal__outcome">{proposal.status === "applied" ? copy.applied : proposal.status === "rejected" ? copy.rejected : copy.stale}</p>}
    </section>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatValue(value: unknown, path: string, locale: string, copy: AgentPanelCopy): string {
  if (typeof value === "number" && path === "/requestedAmount") return new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(value);
  if (typeof value === "number" && ["/requestedTermMonths", "/requestedGraceMonths"].includes(path)) {
    return copy.monthValue.replace("{value}", new Intl.NumberFormat(locale).format(value));
  }
  if (typeof value === "number") return new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

function fieldLabel(path: string, copy: AgentPanelCopy): string {
  const key = proposalFieldKeys[path as keyof typeof proposalFieldKeys];
  return key ? copy.fields[key] : path.replace(/^\//, "");
}
