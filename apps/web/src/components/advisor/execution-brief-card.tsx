import type {ExecutionBriefProgress, ExecutionBriefWorkstreamProgressStatus, VisibleExecutionBrief} from "@offroad/work-plan";
import {AlertCircle, ArrowDown, Check, Circle, FileOutput, LoaderCircle, Search, ShieldCheck} from "lucide-react";

type Props = {
  brief: VisibleExecutionBrief;
  progress?: ExecutionBriefProgress | null;
  version: number;
};

export function ExecutionBriefCard({brief, progress, version}: Props) {
  const pt = brief.locale === "pt-BR";
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

      {brief.assumptions.length ? <section className="execution-brief-card__assumptions">
        <header><strong>{pt ? "Premissas que você pode alterar" : "Assumptions you can change"}</strong><small>{pt ? "Toda mudança gera uma nova versão" : "Every change creates a new version"}</small></header>
        <dl>{brief.assumptions.map((assumption) => <div key={assumption.label}><dt>{assumption.label}</dt><dd><strong>{assumption.value}</strong><span>{assumption.basis}</span></dd></div>)}</dl>
      </section> : null}

      {brief.checkpoints.length ? <footer className="execution-brief-card__checkpoint">
        <Circle aria-hidden="true" size={11} />
        <span><small>{pt ? "Próximo ponto de decisão" : "Next decision point"}</small><strong>{brief.checkpoints[0]!.label}</strong></span>
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
