import type {EndgameProgramBoard, ProgramTask, ProgramTaskState} from "./endgame-program-board";

const stateLabel: Record<ProgramTaskState, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "Em implementação",
  blocked: "Bloqueado",
  code_complete: "Code complete",
  evidence_complete: "Evidence complete",
  gate_passed: "Gate passed",
  promoted: "Promovido",
};

export function renderEndgameProgramBoard(board: EndgameProgramBoard, fingerprint: string): string {
  const lines = [
    "# Endgame Program Board",
    "",
    "> Vista gerada de `current-endgame-program.ts`. Não editar manualmente. O objeto TypeScript é a fonte canônica machine-readable.",
    "",
    `Atualizado em: ${board.generatedAt}`,
    `Baseline: \`${board.baseline.branch}@${board.baseline.commit}\``,
    `Capability Ledger: \`${board.baseline.capabilityLedgerVersion}@${board.baseline.capabilityLedgerCommit}\``,
    `Fingerprint do board: \`${fingerprint}\``,
    "",
    "## Leitura executiva",
    "",
    "Este quadro mede gates comprovados, não volume de código. `Gate passed` exige dependências encerradas, critérios aceitos com evidência e nenhum bloqueador aberto. Se a tarefa declara uma transição, ela precisa ser válida e, quando registrada, já estar refletida no Capability Ledger. `Promovido` exige transição registrada, runtime live e exposição diferente de `none`.",
    "",
    "## Reconciliação do baseline",
    "",
    "| Finding | Severidade | Estado | Responsável | Descrição |",
    "|---|---|---|---|---|",
    ...board.reconciliationFindings.map((finding) => `| ${finding.findingId} | ${finding.severity} | ${finding.status} | ${finding.ownerRole} | ${finding.description} |`),
    "",
    "## Sequência de releases",
    "",
  ];
  for (const releaseId of board.releaseSequence) {
    const tasks = board.tasks.filter((task) => task.releaseId === releaseId);
    lines.push(`### ${releaseId}`);
    lines.push("");
    lines.push("| ID | Estado | Resultado | Capabilities vinculadas | Dependências | Bloqueadores abertos |");
    lines.push("|---|---|---|---|---|---|");
    for (const task of tasks) {
      lines.push(`| ${task.taskId} | ${stateLabel[task.state]} | ${task.outcome} | ${task.capabilityRefs.join(", ") || "sem vínculo"} | ${task.dependsOn.join(", ") || "sem dependência"} | ${task.blockers.filter((blocker) => blocker.status === "open").map((blocker) => blocker.blockerId).join(", ") || "sem blocker"} |`);
    }
    lines.push("");
  }
  lines.push("## Próxima onda controlada", "");
  for (const task of board.tasks.filter((task) => task.state === "in_progress" || task.state === "ready" || task.state === "blocked")) renderTask(lines, task);
  lines.push("## Evidence Index", "", "| ID | Tipo | Ambiente | Referência |", "|---|---|---|---|");
  for (const evidence of board.evidenceIndex) lines.push(`| ${evidence.evidenceId} | ${evidence.kind} | ${evidence.environment} | ${evidence.ref} |`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderTask(lines: string[], task: ProgramTask) {
  lines.push(`### ${task.taskId}: ${task.title}`, "", `Estado: **${stateLabel[task.state]}** · owner: ${task.ownerRole}`, "", "Subtarefas:", "");
  for (const subtask of task.subtasks) lines.push(`- [${subtask.state === "done" ? "x" : " "}] ${subtask.subtaskId}: ${subtask.title} (${subtask.state})`);
  lines.push("", "Critérios de aceite:", "");
  for (const criterion of task.acceptance) lines.push(`- ${criterion.criterionId}: ${criterion.description} · **${criterion.status}**${criterion.evidenceRefs.length ? ` · ${criterion.evidenceRefs.join(", ")}` : ""}`);
  if (task.capabilityRefs.length) lines.push("", `Capabilities relacionadas: ${task.capabilityRefs.map((capabilityId) => `\`${capabilityId}\``).join(", ")}.`);
  if (task.capabilityTransition) lines.push("", `Transição planejada: \`${task.capabilityTransition.capabilityId}\` · ${task.capabilityTransition.from} → ${task.capabilityTransition.to} (${task.capabilityTransition.status}).`);
  lines.push("");
}
