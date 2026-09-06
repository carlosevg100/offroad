"use client";

import type {ExecutionBriefChange, ExecutionBriefProgress, ExecutionBriefWorkstreamProgressStatus, VisibleExecutionBrief} from "@offroad/work-plan";
import {AlertCircle, ArrowDown, ArrowRight, Check, Circle, FileOutput, LoaderCircle, PencilLine, Search, ShieldCheck, X} from "lucide-react";
import {useState} from "react";

type Props = {
  brief: VisibleExecutionBrief;
  changes?: readonly ExecutionBriefChange[];
  onRequestEdit?: (content: string) => Promise<{ok: true} | {ok: false; error: string}>;
  progress?: ExecutionBriefProgress | null;
  version: number;
};

export function ExecutionBriefCard({brief, changes = [], onRequestEdit, progress, version}: Props) {
  const pt = brief.locale === "pt-BR";
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mode = brief.executionMode === "start_after_display"
    ? (pt ? "Início após exibição" : "Starts after display")
    : brief.executionMode === "confirm_before_expensive_work"
      ? (pt ? "Confirmação antes de avançar" : "Confirmation before proceeding")
      : (pt ? "Aprovação antes de qualquer ação externa" : "Approval before any external action");
  return (
    <article className="execution-brief-card" data-execution-mode={brief.executionMode} data-testid="execution-brief">
      <header>
        <div>
          <span>{pt ? "Plano deste trabalho" : "Plan for this work"}</span>
          <h2>{brief.objective}</h2>
        </div>
        <small><ShieldCheck aria-hidden="true" size={12} />v{version} · {mode}</small>
      </header>

      <section className="execution-brief-card__deliverable">
        <FileOutput aria-hidden="true" size={16} />
        <div><small>{pt ? "O que ficará pronto" : "What will be ready"}</small><strong>{brief.proposedDeliverable}</strong></div>
      </section>

      <ol className="execution-brief-card__workstreams">
        {brief.workstreams.map((workstream, index) => {
          const workstreamProgress = progress?.workstreams[index];
          return <li data-progress={workstreamProgress?.status ?? "waiting"} data-workstream-position={index} key={`${workstream.label}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <header><strong>{workstream.label}</strong><div>
                {workstreamProgress ? <span className="execution-brief-card__progress">
                  {progressIcon(workstreamProgress.status)}
                  {progressLabel(workstreamProgress.status, pt)} · {workstreamProgress.completed}/{workstreamProgress.total}
                </span> : null}
                {workstream.dependencies.length ? <small><ArrowDown aria-hidden="true" size={10} />{pt ? "depois de" : "after"} {workstream.dependencies.join(", ")}</small> : null}
              </div></header>
              <p>{workstream.purpose}</p>
              <div className="execution-brief-card__sources">
                {workstream.sources.map((source) => <span data-status={source.status} key={`${workstream.label}-${source.label}`}>
                  {source.status === "available" ? <Check aria-hidden="true" size={10} /> : source.status === "to_research" ? <Search aria-hidden="true" size={10} /> : <Circle aria-hidden="true" size={9} />}
                  {source.label}<i>{sourceLabel(source.status, pt)}</i>
                </span>)}
              </div>
              <details>
                <summary>{pt ? "Análises e produto desta etapa" : "Analyses and output for this step"}</summary>
                <ul>{workstream.analyses.map((analysis) => <li key={analysis}>{analysis}</li>)}</ul>
                <footer><small>{pt ? "Saída" : "Output"}</small><strong>{workstream.output}</strong></footer>
              </details>
            </div>
          </li>;
        })}
      </ol>

      {version > 1 && changes.length ? <section className="execution-brief-card__changes" data-testid="execution-brief-changes">
        <header><strong>{pt ? "O que mudou nesta versão" : "What changed in this version"}</strong><small>{pt ? "O restante do plano foi preservado" : "The rest of the plan was preserved"}</small></header>
        <ul>{changes.map((change, index) => <li key={`${change.kind}-${change.label}-${index}`}>
          <span>{changeKindLabel(change.kind, pt)}</span>
          <div><strong>{change.label}</strong>{change.from || change.to ? <small>{change.from ? `${change.from} → ` : ""}{change.to ?? (pt ? "removido" : "removed")}</small> : null}</div>
        </li>)}</ul>
      </section> : null}

      {brief.assumptions.length ? <section className="execution-brief-card__assumptions">
        <header><strong>{pt ? "Premissas que você pode alterar" : "Assumptions you can change"}</strong><small>{pt ? "Toda mudança gera uma nova versão" : "Every change creates a new version"}</small></header>
        <dl>{brief.assumptions.map((assumption) => <div key={assumption.label}><dt>{assumption.label}</dt><dd><strong>{assumption.value}</strong><span>{assumption.basis}</span></dd></div>)}</dl>
      </section> : null}

      {onRequestEdit ? <section className="execution-brief-card__edit" data-editing={editing || undefined}>
        {!editing ? <button onClick={() => setEditing(true)} type="button">
          <PencilLine aria-hidden="true" size={13} />
          <span><strong>{pt ? "Ajustar este plano" : "Adjust this plan"}</strong><small>{pt ? "Inclua, retire ou priorize o que muda a entrega" : "Add, remove or reprioritize what changes the deliverable"}</small></span>
          <ArrowRight aria-hidden="true" size={13} />
        </button> : <form onSubmit={async (event) => {
          event.preventDefault();
          const content = editContent.trim();
          if (content.length < 3 || submitting) return;
          setSubmitting(true);
          setEditError("");
          const result = await onRequestEdit(content);
          setSubmitting(false);
          if (!result.ok) {
            setEditError(result.error);
            return;
          }
          setEditContent("");
          setEditing(false);
        }}>
          <header><div><strong>{pt ? "O que deve mudar no plano?" : "What should change in the plan?"}</strong><small>{pt ? `Seu pedido ficará vinculado à versão ${version}.` : `Your request will be bound to version ${version}.`}</small></div><button aria-label={pt ? "Cancelar ajuste" : "Cancel adjustment"} disabled={submitting} onClick={() => { setEditing(false); setEditContent(""); setEditError(""); }} type="button"><X aria-hidden="true" size={13} /></button></header>
          <textarea autoFocus disabled={submitting} maxLength={8000} onChange={(event) => setEditContent(event.target.value)} placeholder={pt ? "Descreva o que deseja incluir, retirar, aprofundar ou priorizar..." : "Describe what you want to add, remove, deepen or prioritize..."} rows={3} value={editContent} />
          <footer><small>{pt ? "A Offroad recompilará o plano e mostrará as diferenças antes de seguir." : "Offroad will recompile the plan and show the differences before proceeding."}</small><button disabled={editContent.trim().length < 3 || submitting} type="submit">{submitting ? <LoaderCircle aria-hidden="true" className="spin" size={12} /> : null}{pt ? "Enviar ajuste" : "Submit adjustment"}</button></footer>
          {editError ? <p role="alert">{editError}</p> : null}
        </form>}
      </section> : null}

      {brief.checkpoints.length ? <footer className="execution-brief-card__checkpoint">
        <Circle aria-hidden="true" size={11} />
        <span><small>{pt ? "Próximo ponto de decisão" : "Next decision point"}</small><strong>{brief.checkpoints[0]!.label}</strong></span>
      </footer> : null}
    </article>
  );
}

function changeKindLabel(kind: ExecutionBriefChange["kind"], pt: boolean) {
  const labels = pt ? {
    objective_changed: "Objetivo",
    deliverable_changed: "Entrega",
    workstream_added: "Incluído",
    workstream_removed: "Removido",
    assumption_added: "Premissa",
    assumption_updated: "Premissa",
    assumption_removed: "Premissa",
    source_status_changed: "Fonte",
    checkpoint_changed: "Decisão",
  } : {
    objective_changed: "Objective",
    deliverable_changed: "Deliverable",
    workstream_added: "Added",
    workstream_removed: "Removed",
    assumption_added: "Assumption",
    assumption_updated: "Assumption",
    assumption_removed: "Assumption",
    source_status_changed: "Source",
    checkpoint_changed: "Decision",
  };
  return labels[kind];
}

function progressIcon(status: ExecutionBriefWorkstreamProgressStatus) {
  if (status === "completed") return <Check aria-hidden="true" size={10} />;
  if (status === "running") return <LoaderCircle aria-hidden="true" className="spin" size={10} />;
  if (status === "needs_attention") return <AlertCircle aria-hidden="true" size={10} />;
  return <Circle aria-hidden="true" size={9} />;
}

function progressLabel(status: ExecutionBriefWorkstreamProgressStatus, pt: boolean) {
  const labels = pt ? {
    waiting: "Aguardando",
    queued: "Na fila",
    running: "Em andamento",
    waiting_user: "Aguardando você",
    completed: "Concluída",
    needs_attention: "Requer atenção",
  } : {
    waiting: "Waiting",
    queued: "Queued",
    running: "In progress",
    waiting_user: "Waiting for you",
    completed: "Completed",
    needs_attention: "Needs attention",
  };
  return labels[status];
}

function sourceLabel(status: VisibleExecutionBrief["workstreams"][number]["sources"][number]["status"], pt: boolean) {
  if (status === "available") return pt ? "disponível" : "available";
  if (status === "to_research") return pt ? "a pesquisar" : "to research";
  return pt ? "a solicitar" : "to request";
}
