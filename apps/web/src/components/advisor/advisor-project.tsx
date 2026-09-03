"use client";

import {ArrowUp, Bot, Check, Circle, FileText, LoaderCircle, Paperclip, X} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useRef, useState, type ReactNode} from "react";

import {
  appendAdvisorMessage,
  beginAdvisorProjectProcessing,
  prepareAdvisorDocumentUpload,
} from "@/app/[locale]/app/advisor-actions";
import {
  AdvisorChangeProposalCard,
  type AdvisorChangeProposal,
  type AdvisorChangeProposalCopy,
} from "@/components/advisor/advisor-change-proposal";
import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {DOCUMENT_ACCEPT, formatDocumentSize, uploadDocuments} from "@/lib/intake/upload-client";
import {createClient} from "@/lib/supabase/client";

export type AdvisorProjectMessage = {
  id: string;
  role: string;
  content: string;
  status: string;
  createdAt: string;
  artifactHref?: string;
  proposalId?: string | null;
};
export type AdvisorProjectDocument = {id: string; name: string; size: number | null; status: string};
export type AdvisorProjectTask = {id: string; label: string; status: string};
export type AdvisorProjectArtifact = {id: string; label: string; status: string};
export type AdvisorProjectActivityEvent = {id: string; type: string; summary: string; createdAt: string};

export type AdvisorProjectCopy = {
  advisor: string;
  context: string;
  conversation: string;
  documents: string;
  noDocuments: string;
  plan: string;
  activity: string;
  evidence: string;
  decisions: string;
  verified: string;
  openIssues: string;
  artifacts: string;
  contextQuestion: string;
  awaitingAnswer: string;
  noArtifacts: string;
  openWork: string;
  placeholder: string;
  attach: string;
  send: string;
  close: string;
  private: string;
  public: string;
  working: string;
  ready: string;
  errors: {invalid: string; denied: string; duplicate: string; not_found: string; save: string; processing: string; upload: string};
  proposal: AdvisorChangeProposalCopy;
};

type Props = {
  accessBasis: string;
  artifacts: AdvisorProjectArtifact[];
  copy: AdvisorProjectCopy;
  documents: AdvisorProjectDocument[];
  locale: "pt-BR" | "en-US";
  messages: AdvisorProjectMessage[];
  activityEvents: AdvisorProjectActivityEvent[];
  coverage: {verified: number; total: number; openIssues: number};
  decisionRecords: Array<{id: string; question: string; recommendation: string | null; status: string}>;
  projectId: string;
  projectName: string;
  pendingRequests?: Array<{id: string; question: string; whyItMatters: string; decisionImpact?: string}>;
  proposals: AdvisorChangeProposal[];
  sessionId: string;
  sessionStatus: string;
  tasks: AdvisorProjectTask[];
  workHref?: string;
  workProduct?: ReactNode;
};

export function AdvisorProject(props: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [optimistic, setOptimistic] = useState<AdvisorProjectMessage[]>([]);
  const active = props.sessionStatus === "processing"
    || props.tasks.some((task) => ["queued", "running"].includes(task.status))
    || props.messages.some((message) => ["queued", "processing"].includes(message.status));
  const completed = props.tasks.filter((task) => task.status === "succeeded").length;
  const allMessages = [...props.messages, ...optimistic];
  const proposalById = new Map(props.proposals.map((proposal) => [proposal.id, proposal]));
  const timeline = [
    ...allMessages.map((message) => ({kind: "message" as const, id: message.id, createdAt: message.createdAt, message})),
    ...props.activityEvents.map((event) => ({kind: "activity" as const, id: event.id, createdAt: event.createdAt, event})),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const lastActivityId = props.activityEvents.at(-1)?.id;

  async function send() {
    const message = content.trim();
    if (!message || pending) return;
    const messageId = crypto.randomUUID();
    setContent("");
    setError("");
    setPending(true);
    setOptimistic((current) => [...current, {id: messageId, role: "user", content: message, status: "completed", createdAt: new Date().toISOString()}]);
    const result = await appendAdvisorMessage({locale: props.locale, projectId: props.projectId, content: message, messageId});
    if (!result.ok) setError(props.copy.errors[result.error]);
    setPending(false);
    setOptimistic([]);
    router.refresh();
  }

  async function upload(selected: FileList | null) {
    if (!selected?.length || uploading) return;
    setError("");
    setUploading(true);
    const scope = await prepareAdvisorDocumentUpload({locale: props.locale, projectId: props.projectId});
    const supabase = createClient();
    if (!scope.ok || !supabase) {
      setError(scope.ok ? props.copy.errors.upload : props.copy.errors[scope.error]);
      setUploading(false);
      return;
    }
    const result = await uploadDocuments({
      supabase,
      files: Array.from(selected),
      organizationId: scope.organizationId,
      userId: scope.userId,
      scope: {kind: "session", sessionId: scope.sessionId},
    });
    if (result.failure || result.uploaded.length === 0) {
      setError(props.copy.errors.upload);
      setUploading(false);
      return;
    }
    const processing = await beginAdvisorProjectProcessing({locale: props.locale, projectId: props.projectId});
    if (!processing.ok) setError(props.copy.errors[processing.error]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <main className="advisor-project">
      <DealStateRefresh active={active || pending || uploading} />
      <section className="advisor-project__conversation">
        <header className="advisor-project__header">
          <div><span className="section-kicker">{props.copy.conversation}</span><h1>{props.projectName}</h1></div>
          <span className={active ? "is-working" : undefined}>{active ? <LoaderCircle aria-hidden="true" className="spin" size={13} /> : <Circle aria-hidden="true" size={13} />}{active ? props.copy.working : props.copy.ready}</span>
        </header>

        <div aria-live="polite" className="advisor-thread">
          {timeline.map((item) => {
            if (item.kind === "activity") {
              const terminal = ["work_completed", "decision_recorded", "question_answered"].includes(item.event.type);
              const failed = ["work_failed", "quality_gate_failed"].includes(item.event.type);
              const live = active && item.id === lastActivityId && ["work_started", "work_progress"].includes(item.event.type);
              return <article className={`advisor-thread__activity-event${failed ? " is-failed" : terminal ? " is-complete" : ""}`} key={`activity-${item.id}`}>
                <span>{live ? <LoaderCircle aria-hidden="true" className="spin" size={13} /> : terminal ? <Check aria-hidden="true" size={13} /> : failed ? <X aria-hidden="true" size={13} /> : <Circle aria-hidden="true" size={12} />}</span>
                <div><small>{props.copy.activity}</small><p>{item.event.summary}</p></div>
              </article>;
            }
            const message = item.message;
            const proposal = message.proposalId ? proposalById.get(message.proposalId) : undefined;
            return <article className={`advisor-thread__message is-${message.role}`} key={message.id}>
              {message.role === "assistant" ? <span className="advisor-thread__avatar"><Bot aria-hidden="true" size={15} /></span> : null}
              <div>
                {message.role === "assistant" ? <small>{props.copy.advisor}</small> : null}
                <p>{message.content}</p>
                {message.artifactHref ? <Link className="advisor-thread__artifact-link" href={message.artifactHref}><FileText aria-hidden="true" size={13} />{props.copy.openWork}</Link> : null}
                {proposal ? <AdvisorChangeProposalCard copy={props.copy.proposal} locale={props.locale} projectId={props.projectId} proposal={proposal} sessionId={props.sessionId} /> : null}
              </div>
            </article>;
          })}
          {props.workProduct ? <div className="advisor-thread__work-product">{props.workProduct}</div> : null}
          {props.pendingRequests?.length ? <article className="advisor-thread__message is-assistant advisor-thread__requests">
            <span className="advisor-thread__avatar"><Bot aria-hidden="true" size={15} /></span>
            <div>
              <small>{props.copy.advisor}</small>
              <strong>{props.copy.contextQuestion}</strong>
              <p>{props.copy.awaitingAnswer}</p>
              <ol>{props.pendingRequests.map((request, index) => <li key={request.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{request.question}</strong><small>{request.whyItMatters}</small>{request.decisionImpact ? <small>{request.decisionImpact}</small> : null}</div>
              </li>)}</ol>
            </div>
          </article> : null}
        </div>

        <div className="advisor-project__composer-wrap">
          <section className="advisor-composer">
            <label><span className="sr-only">{props.copy.placeholder}</span><textarea
              disabled={pending || uploading}
              maxLength={8000}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={props.copy.placeholder}
              rows={3}
              value={content}
            /></label>
            <footer>
              <div>
                <input accept={DOCUMENT_ACCEPT} hidden multiple onChange={(event) => void upload(event.target.files)} ref={inputRef} type="file" />
                <button aria-label={props.copy.attach} disabled={pending || uploading} onClick={() => inputRef.current?.click()} title={props.copy.attach} type="button">{uploading ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : <Paperclip aria-hidden="true" size={17} />}</button>
                <span>{props.accessBasis === "authorized_private" ? props.copy.private : props.copy.public}</span>
              </div>
              <button aria-label={props.copy.send} className="advisor-composer__send" disabled={!content.trim() || pending || uploading} onClick={() => void send()} title={props.copy.send} type="button">{pending ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : <ArrowUp aria-hidden="true" size={17} />}</button>
            </footer>
          </section>
          {error ? <p className="form-notice form-notice--error" role="alert">{error}<button aria-label={props.copy.close} onClick={() => setError("")} type="button"><X aria-hidden="true" size={12} /></button></p> : null}
        </div>
      </section>

      <aside className="advisor-project__context">
        <header><span className="section-kicker">{props.copy.context}</span></header>
        {props.pendingRequests?.length ? <section className="advisor-context-section advisor-context-section--waiting">
          <div><strong>{props.copy.contextQuestion}</strong><small>{props.pendingRequests.length}</small></div>
          <p>{props.pendingRequests[0]!.question}</p>
          <small>{props.pendingRequests[0]!.whyItMatters}</small>
        </section> : null}
        {props.coverage.total > 0 ? <section className="advisor-context-section">
          <div><strong>{props.copy.evidence}</strong><small>{props.coverage.verified}/{props.coverage.total}</small></div>
          <ul>
            <li><Check aria-hidden="true" size={12} /><span>{props.copy.verified}: {props.coverage.verified}</span></li>
            <li><Circle aria-hidden="true" size={12} /><span>{props.copy.openIssues}: {props.coverage.openIssues}</span></li>
          </ul>
        </section> : null}
        {props.decisionRecords.length ? <section className="advisor-context-section">
          <div><strong>{props.copy.decisions}</strong><small>{props.decisionRecords.length}</small></div>
          <ul>{props.decisionRecords.map((decision) => <li key={decision.id}><Circle aria-hidden="true" size={12} /><span><strong>{decision.recommendation ?? decision.question}</strong><small>{decision.status}</small></span></li>)}</ul>
        </section> : null}
        <section className="advisor-context-section advisor-context-section--activity">
          <div><strong>{props.copy.plan}</strong><small>{completed}/{props.tasks.length}</small></div>
          <ol>{props.tasks.map((task) => <li className={`is-${task.status}`} key={task.id}>{task.status === "succeeded" ? <Check aria-hidden="true" size={12} /> : ["running", "queued"].includes(task.status) ? <LoaderCircle aria-hidden="true" className={task.status === "running" ? "spin" : undefined} size={12} /> : <Circle aria-hidden="true" size={12} />}<span>{task.label}</span></li>)}</ol>
        </section>
        <section className="advisor-context-section">
          <div><strong>{props.copy.documents}</strong><small>{props.documents.length}</small></div>
          {props.documents.length ? <ul>{props.documents.map((document) => <li key={document.id}><FileText aria-hidden="true" size={13} /><span><strong>{document.name}</strong><small>{document.size ? formatDocumentSize(document.size) : document.status}</small></span></li>)}</ul> : <p>{props.copy.noDocuments}</p>}
        </section>
        <section className="advisor-context-section">
          <div><strong>{props.copy.artifacts}</strong><small>{props.artifacts.length}</small></div>
          {props.workHref ? <Link className="advisor-context-section__open" href={props.workHref}>{props.copy.openWork}</Link> : null}
          {props.artifacts.length ? <ul>{props.artifacts.map((artifact) => <li key={artifact.id}><FileText aria-hidden="true" size={13} /><span><strong>{artifact.label}</strong></span></li>)}</ul> : <p>{props.copy.noArtifacts}</p>}
        </section>
      </aside>
    </main>
  );
}
