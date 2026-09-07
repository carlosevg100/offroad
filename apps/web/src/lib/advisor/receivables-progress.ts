export type AdvisorReceivablesProgress = {
  completed: number;
  total: number;
  currentStageId: string | null;
  stages: Array<{id: ReceivablesStageId; state: ReceivablesStageState}>;
};

export type ReceivablesStageId = typeof stageIds[number];
export type ReceivablesStageState = typeof stageStates[number];

const stageIds = [
  "portfolio_diagnostics",
  "evidence_reconciliation",
  "eligibility_analysis",
  "structure_sizing",
  "cash_waterfall",
  "full_underwriting",
] as const;
const stageStates = ["complete", "in_progress", "waiting", "conflicting"] as const;
const stageIdSet = new Set<string>(stageIds);
const stageStateSet = new Set<string>(stageStates);

export function advisorReceivablesProgress(summary: unknown): AdvisorReceivablesProgress | null {
  const summaryRecord = objectRecord(summary);
  const caseState = objectRecord(summaryRecord?.case_state);
  const vertical = objectRecord(caseState?.receivablesVertical);
  const readiness = objectRecord(vertical?.methodReadiness);
  const progress = objectRecord(readiness?.progress);
  if (!progress || !Array.isArray(progress.stages)) return null;
  if (typeof progress.completed !== "number" || !Number.isInteger(progress.completed)) return null;
  if (progress.total !== stageIds.length || progress.completed < 0 || progress.completed > stageIds.length) return null;

  const stages = progress.stages.flatMap((stage) => {
    const item = objectRecord(stage);
    if (!item || typeof item.id !== "string" || !stageIdSet.has(item.id)) return [];
    if (typeof item.state !== "string" || !stageStateSet.has(item.state)) return [];
    return [{id: item.id as ReceivablesStageId, state: item.state as ReceivablesStageState}];
  });
  if (stages.length !== stageIds.length || new Set(stages.map((stage) => stage.id)).size !== stageIds.length) return null;
  if (stages.filter((stage) => stage.state === "complete").length !== progress.completed) return null;

  const currentStageId = typeof progress.currentStageId === "string" && stageIdSet.has(progress.currentStageId)
    ? progress.currentStageId as ReceivablesStageId
    : null;
  if (currentStageId && !stages.some((stage) => stage.id === currentStageId && stage.state === "in_progress")) return null;

  return {completed: progress.completed, total: stageIds.length, currentStageId, stages};
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
