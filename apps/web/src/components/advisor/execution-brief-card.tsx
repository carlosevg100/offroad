"use client";
import {z} from "zod";

import type {ExecutionBriefChange, ExecutionBriefProgress, ExecutionBriefWorkstreamProgressStatus, VisibleExecutionBrief} from "@offroad/work-plan";
import {AlertCircle, ArrowDown, ArrowRight, Check, Circle, FileOutput, LoaderCircle, PencilLine, Search, ShieldCheck, X} from "lucide-react";
import {useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";

import type {ExecutionBriefApprovalReason, ExecutionBriefApprovalRecord} from "@/lib/advisor/execution-brief-approval";

export type ExecutionBriefApproval = {
  status: "awaiting" | "approved" | "superseded" | "unavailable";
  reason?: ExecutionBriefApprovalReason;
  fingerprint: string;
  version: number;
  /** Decided in Postgres from the project review roles; the card only explains it. */
  reviewMode?: "open" | "assigned";
  callerCanApprove?: boolean;
  /** Ids come from the projection; the project page resolves the labels it can show. */
  record?: ExecutionBriefApprovalRecord & {preparedByLabel?: string | null; reviewedByLabel?: string | null};
};

const scopeBasisSchema = z.object({scopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/), reportingDate: z.iso.date(), primaryDocumentId: z.uuid(), headerRow: z.number().int().positive(), selectedSourceCount: z.number().int().positive(), documentVersion: z.number().int().positive(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), contentSha256: z.string().regex(/^[a-f0-9]{64}$/)}).strict();
function parseScopeBasis(value: string) {try {const result = scopeBasisSchema.safeParse(JSON.parse(value)); return result.success ? result.data : null;} catch {return null;}}
type Props = {
  approval?: ExecutionBriefApproval;
  disabled?: boolean;
  onRefresh?: () => void;
  onApprove?: (input: {expectedFingerprint: string; expectedVersion: number}) => Promise<{ok: true} | {ok: false; error: string}>;
  brief: VisibleExecutionBrief;
  changes?: readonly ExecutionBriefChange[];
  onRequestEdit?: (content: string) => Promise<{ok: true} | {ok: false; error: string}>;
  progress?: ExecutionBriefProgress | null;
  version: number;
};

export function ExecutionBriefCard({approval, brief, changes = [], disabled = false, onApprove, onRefresh, onRequestEdit, progress, version}: Props) {
  const t = useTranslations("ExecutionBriefCard");
  const format = useFormatter();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const approvalLock = useRef(false);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [submittedFingerprint, setSubmittedFingerprint] = useState<string | null>(null);
  const approvalStatus = !approval ? "unavailable"
    : approval.fingerprint !== brief.fingerprint || approval.version !== version ? "superseded"
    : approval.status;
  const awaitingRefresh = submittedFingerprint === brief.fingerprint && approvalStatus === "awaiting";
  const busy = disabled || submitting || approving || awaitingRefresh;
  const currentApproval = approval && approval.fingerprint === brief.fingerprint && approval.version === version ? approval : undefined;
  const roleBlocked = approvalStatus === "awaiting" && currentApproval?.callerCanApprove === false;
  const unknownPerson = t("approval.record.unknownPerson");
  async function approve() {
    if (!onApprove || approvalStatus !== "awaiting" || busy || editing || roleBlocked || approvalLock.current) return;
    approvalLock.current = true;
    setApproving(true);
    setApprovalError("");
    try {
      const result = await onApprove({expectedFingerprint: brief.fingerprint, expectedVersion: version});
      if (!result.ok) setApprovalError(result.error);
      else setSubmittedFingerprint(brief.fingerprint);
    } catch {
      setApprovalError(t("approval.uncertain"));
    } finally {
      approvalLock.current = false;
      setApproving(false);
    }
  }
  return (
    <article className="execution-brief-card" data-execution-mode={brief.executionMode} data-brief-fingerprint={brief.fingerprint} data-testid="execution-brief">
      <header>
        <div>
          <h2>{t("title")}</h2>
        </div>
        <small><ShieldCheck aria-hidden="true" size={12} />{t("version", {version})} · {t(`approval.${approvalStatus}.title`)}</small>
      </header>
      <p className="execution-brief-card__objective">{brief.objectiveSummary ?? brief.objective}</p>
      {brief.objectiveSummary && brief.objectiveSummary !== brief.objective ? <details className="execution-brief-card__objective-context">
        <summary>{t("completeObjective")}</summary>
        <p style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{brief.objective}</p>
      </details> : null}

      <section className="execution-brief-card__deliverable">
        <FileOutput aria-hidden="true" size={16} />
        <div><small>{t("deliverable")}</small><strong>{brief.proposedDeliverable}</strong></div>
      </section>

      <section className="execution-brief-card__approval" data-approval-status={approvalStatus} data-caller-can-approve={currentApproval?.callerCanApprove === undefined ? undefined : String(currentApproval.callerCanApprove)} aria-busy={approving || awaitingRefresh}>
        <div role="status"><strong>{t(`approval.${approvalStatus}.title`)}</strong><p>{t(currentApproval?.reason ? `approval.reason.${currentApproval.reason}` : `approval.${approvalStatus}.description`)}</p>
          {currentApproval?.record?.decision === "approved" && approvalStatus === "approved" ? <p className="execution-brief-card__record" data-testid="execution-brief-approval-record">{t("approval.record.approved", {reviewer: currentApproval.record.reviewedByLabel ?? unknownPerson, preparer: currentApproval.record.preparedByLabel ?? unknownPerson, version: currentApproval.record.approvedVersion ?? version})}</p> : null}
          {currentApproval?.record?.decision === "returned" ? <p className="execution-brief-card__record" data-testid="execution-brief-approval-record">{t("approval.record.returned", {reviewer: currentApproval.record.reviewedByLabel ?? unknownPerson})}</p> : null}
          {roleBlocked ? <p className="execution-brief-card__role" data-testid="execution-brief-role-required">{t("approval.roleRequired")}</p> : null}
        </div>
        {approvalStatus === "awaiting" ? <button disabled={busy || editing || !onApprove || roleBlocked} onClick={() => void approve()} type="button">
          {approving || awaitingRefresh ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Check aria-hidden="true" size={14} />}
          {t(approving ? "approval.saving" : awaitingRefresh ? "approval.refreshing" : approvalError ? "approval.retry" : "approval.approve", {version})}
        </button> : null}
        {awaitingRefresh && onRefresh ? <button onClick={onRefresh} type="button">{t("approval.refresh")}</button> : null}
        {approvalError && approvalStatus === "awaiting" ? <p role="alert">{approvalError}</p> : null}
      </section>

      <ol className="execution-brief-card__workstreams">
        {brief.workstreams.map((workstream, index) => {
          // Progress is an independently loaded snapshot. Never borrow a status from an older
          // plan or from an array slot that now represents a different piece of work.
          const candidates = progress?.version === version
            ? progress.workstreams.filter((item) => item.position === index && item.label === workstream.label)
            : [];
          const candidate = candidates.length === 1 ? candidates[0] : undefined;
          const workstreamProgress = candidate && candidate.completed <= candidate.total
            && (candidate.status !== "completed" || candidate.completed === candidate.total)
            ? candidate : undefined;
          return <li data-progress={workstreamProgress?.status ?? "waiting"} data-workstream-position={index} key={`${workstream.label}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <header><strong>{workstream.label}</strong><div>
                {workstreamProgress ? <span className="execution-brief-card__progress">
                  {progressIcon(workstreamProgress.status)}
                  {t(`progress.${workstreamProgress.status}`)} · {format.number(workstreamProgress.completed)}/{format.number(workstreamProgress.total)}
                </span> : null}
              </div></header>
              {workstream.dependencies.length ? <div className="execution-brief-card__dependencies"><ArrowDown aria-hidden="true" size={10} /><span>{t("after")} {workstream.dependencies.join(", ")}</span></div> : null}
              <p>{workstream.purpose}</p>
              <div className="execution-brief-card__sources">
                {workstream.sources.map((source) => <span data-status={source.status} key={`${workstream.label}-${source.label}`}>
                  {source.status === "available" ? <Check aria-hidden="true" size={10} /> : source.status === "to_research" ? <Search aria-hidden="true" size={10} /> : <Circle aria-hidden="true" size={9} />}
                  {source.label}<i>{t(`source.${source.status}`)}</i>
                </span>)}
              </div>
              <details>
                <summary>{t("stepDetails")}</summary>
                <ul>{workstream.analyses.map((analysis) => <li key={analysis}>{analysis}</li>)}</ul>
                <footer><small>{t("output")}</small><strong>{workstream.output}</strong></footer>
              </details>
            </div>
          </li>;
        })}
      </ol>

      {brief.planningContext ? <section className="execution-brief-card__assumptions" data-testid="execution-brief-planning-context" aria-label={t("planningContext.title")} style={{minWidth: 0, overflowWrap: "anywhere"}}>
        <header><strong>{t("planningContext.title")}</strong><small>{t("planningContext.notExamined")}</small></header>
        <p>{t("planningContext.description")}</p>
        {brief.planningContext.objects.map((object) => <details key={object.id} style={{minWidth: 0, marginTop: "0.75rem"}}>
          <summary style={{cursor: "pointer", paddingBlock: "0.5rem"}}>{object.label}</summary>
          {object.attributes.length ? <div><strong>{t("planningContext.attributes")}</strong><dl>{object.attributes.map((attribute, index) => <div key={`${attribute.dimension}-${index}`}>
            <dt>{attribute.label}</dt><dd><strong>{attribute.value ?? t("planningContext.unknown")}</strong><span>{t(`planningContext.status.${attribute.status}`)}</span>
              {attribute.sources.length ? <details><summary>{t("planningContext.sources")}</summary><ul>{attribute.sources.map((source, sourceIndex) => <li key={sourceIndex}>{source.label} · {t("planningContext.sourceVersion", {version: source.version})}<p>{source.anchor}</p><small>{t(`planningContext.basis.${source.basis}`)}</small></li>)}</ul></details> : null}
            </dd></div>)}</dl></div> : null}
          {object.requirements.length ? <details><summary>{t("planningContext.requirements")}</summary><ul>{object.requirements.map((requirement) => <li key={requirement.id}><strong>{requirement.label}</strong><p>{t("planningContext.notExamined")}</p><strong>{t("planningContext.evidenceNeeded")}</strong><ul>{requirement.evidenceNeeded.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul></li>)}</ul></details> : null}
          {object.gaps.length ? <details><summary>{t("planningContext.gaps")}</summary><ul>{object.gaps.map((gap) => <li key={gap.id}>{gap.label}</li>)}</ul></details> : null}
        </details>)}
      </section> : null}

      {version > 1 && changes.length ? <section className="execution-brief-card__changes" data-testid="execution-brief-changes">
        <header><strong>{t("changesTitle")}</strong><small>{t("changesPreserved")}</small></header>
        <ul>{changes.map((change, index) => <li key={`${change.kind}-${change.label}-${index}`}>
          <span>{t(`change.${change.kind}`)}</span>
          <div><strong>{change.label}</strong>{change.from || change.to ? <small>{change.from ? `${change.from} → ` : ""}{change.to ?? (t("removed"))}</small> : null}</div>
        </li>)}</ul>
      </section> : null}

      {brief.assumptions.length ? <section className="execution-brief-card__assumptions">
        <header><strong>{t("assumptions")}</strong><small>{t("newVersion")}</small></header>
        <dl>{brief.assumptions.map((assumption) => <div key={assumption.label}><dt>{assumption.label}</dt><dd><strong>{assumption.value}</strong>{(() => {const scope = parseScopeBasis(assumption.basis); return scope ? <><span>{t("scopeBasis", {version: scope.documentVersion, count: scope.selectedSourceCount, date: scope.reportingDate})}</span><details><summary>{t("scopeTrace")}</summary><dl><dt>{t("scopeFingerprint")}</dt><dd>{scope.scopeFingerprint}</dd><dt>{t("scopeSourceHash")}</dt><dd>{scope.sourceSha256}</dd></dl></details></> : <span>{assumption.basis}</span>;})()}</dd></div>)}</dl>
      </section> : null}

      {onRequestEdit ? <section className="execution-brief-card__edit" data-editing={editing || undefined}>
        {!editing ? <button disabled={busy || approvalStatus === "superseded"} onClick={() => setEditing(true)} type="button">
          <PencilLine aria-hidden="true" size={13} />
          <span><strong>{t("edit")}</strong><small>{t("editHint")}</small></span>
          <ArrowRight aria-hidden="true" size={13} />
        </button> : <form onSubmit={async (event) => {
          event.preventDefault();
          const content = editContent.trim();
          if (content.length < 3 || busy) return;
          setSubmitting(true);
          setEditError("");
          let result: {ok: true} | {ok: false; error: string};
          try { result = await onRequestEdit(content); }
          catch { result = {ok: false, error: t("editUncertain")}; }
          finally { setSubmitting(false); }
          if (!result.ok) {
            setEditError(result.error);
            return;
          }
          setEditContent("");
          setEditing(false);
        }}>
          <header><div><strong>{t("editQuestion")}</strong><small>{t("editVersion", {version})}</small></div><button aria-label={t("cancelEdit")} disabled={busy} onClick={() => { setEditing(false); setEditContent(""); setEditError(""); }} type="button"><X aria-hidden="true" size={13} /></button></header>
          <textarea aria-label={t("editQuestion")} autoFocus disabled={busy} maxLength={8000} onChange={(event) => setEditContent(event.target.value)} placeholder={t("editPlaceholder")} rows={3} value={editContent} />
          <footer><small>{t("editConsequence")}</small><button disabled={editContent.trim().length < 3 || busy} type="submit">{submitting ? <LoaderCircle aria-hidden="true" className="spin" size={12} /> : null}{t("submitEdit")}</button></footer>
          {editError ? <p role="alert">{editError}</p> : null}
        </form>}
      </section> : null}

      {brief.checkpoints.length ? <footer className="execution-brief-card__checkpoint">
        <Circle aria-hidden="true" size={11} />
        <span><small>{t("nextDecision")}</small><strong>{brief.checkpoints[0]!.label}</strong></span>
      </footer> : null}
    </article>
  );
}

function progressIcon(status: ExecutionBriefWorkstreamProgressStatus) {
  if (status === "completed") return <Check aria-hidden="true" size={10} />;
  if (status === "running") return <LoaderCircle aria-hidden="true" className="spin" size={10} />;
  if (status === "needs_attention") return <AlertCircle aria-hidden="true" size={10} />;
  return <Circle aria-hidden="true" size={9} />;
}
