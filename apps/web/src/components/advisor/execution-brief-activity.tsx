import type {ExecutionBriefNarrative} from "@offroad/work-plan";
import {Check, Circle, LoaderCircle, X} from "lucide-react";

type Props = {
  active: boolean;
  event: ExecutionBriefNarrative["events"][number];
  locale: "pt-BR" | "en-US";
};

export function ExecutionBriefActivity({active, event, locale}: Props) {
  const completed = event.kind === "completed";
  const failed = event.kind === "needs_attention";
  const running = event.kind === "started" && !event.carriedForward;
  return <article
    className={`advisor-thread__activity-event advisor-thread__brief-activity${failed ? " is-failed" : completed ? " is-complete" : ""}`}
    data-kind={event.kind}
    data-testid="execution-brief-activity"
  >
    <span>{running ? <LoaderCircle aria-hidden="true" className={active ? "spin" : undefined} size={13} /> : completed ? <Check aria-hidden="true" size={13} /> : failed ? <X aria-hidden="true" size={13} /> : <Circle aria-hidden="true" size={12} />}</span>
    <div>
      <small>{executionNarrativeLabel(event.kind, locale)}</small>
      <p>{executionNarrativeCopy(event, locale)}</p>
    </div>
  </article>;
}

function executionNarrativeLabel(
  kind: ExecutionBriefNarrative["events"][number]["kind"],
  locale: "pt-BR" | "en-US",
) {
  const pt = locale === "pt-BR";
  if (kind === "started") return pt ? "Trabalho iniciado" : "Work started";
  if (kind === "completed") return pt ? "Frente concluída" : "Workstream completed";
  if (kind === "waiting_user") return pt ? "Aguardando você" : "Waiting for you";
  return pt ? "Requer atenção" : "Needs attention";
}

function executionNarrativeCopy(
  event: ExecutionBriefNarrative["events"][number],
  locale: "pt-BR" | "en-US",
) {
  const pt = locale === "pt-BR";
  if (event.kind === "started") {
    if (event.carriedForward) return pt
      ? `“${event.label}” já estava em andamento e foi preservada nesta versão do plano.`
      : `“${event.label}” was already in progress and was preserved in this plan version.`;
    return pt
      ? `Comecei “${event.label}”. ${event.purpose}`
      : `I started “${event.label}”. ${event.purpose}`;
  }
  if (event.kind === "completed") {
    if (event.carriedForward) return pt
      ? `“${event.label}” já estava concluída e foi preservada nesta versão. Resultado: ${event.output}.`
      : `“${event.label}” was already complete and was preserved in this version. Result: ${event.output}.`;
    return pt
      ? `Concluí “${event.label}”. Resultado desta frente: ${event.output}.`
      : `I completed “${event.label}”. Workstream result: ${event.output}.`;
  }
  if (event.kind === "waiting_user") return event.carriedForward
    ? (pt ? `“${event.label}” continua aguardando uma informação sua antes de avançar.` : `“${event.label}” is still waiting for information from you before it can proceed.`)
    : (pt ? `“${event.label}” aguarda uma informação sua antes de avançar.` : `“${event.label}” is waiting for information from you before it can proceed.`);
  return event.carriedForward
    ? (pt ? `“${event.label}” continua com um ponto que precisa ser resolvido antes de avançar.` : `“${event.label}” still has an issue that must be resolved before it can proceed.`)
    : (pt ? `“${event.label}” encontrou um ponto que precisa ser resolvido antes de avançar.` : `“${event.label}” found an issue that must be resolved before it can proceed.`);
}
