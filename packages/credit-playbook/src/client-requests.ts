import type {RequirementPurpose, RequirementStage} from "./types";
import type {RequirementStatus, SufficiencyReport} from "./sufficiency";

/**
 * A deliberately small client-facing batch selected from the complete desk playbook.
 *
 * The full playbook remains available to the system and the desk. The client sees only what is
 * material now. This prevents a professional information plan from degenerating into a giant
 * checklist that asks the company to perform the analysis before Offroad has read the room.
 */
export type ClientRequestPriority = "case_blocker" | "structure_driver" | "mandate_driver" | "material_quality";

export type ClientRequest = {
  status: RequirementStatus;
  priority: ClientRequestPriority;
  /** The decision or work product the answer unlocks. */
  unlocks: readonly RequirementPurpose[];
};

export type ClientRequestPlan = {
  current: ClientRequest[];
  resolved: RequirementStatus[];
  roadmap: Record<Extract<RequirementStage, "diligence" | "closing">, {open: number; total: number}>;
  hiddenOpenCount: number;
};

export type ClientRequestOptions = {
  /** Four is the product default. Five is the absolute operating ceiling. */
  batchSize?: number;
};

const purposeOrder: Record<RequirementPurpose, number> = {
  financials: 0,
  structure: 1,
  investor_case: 2,
  storytelling: 3,
};

const priorityOf = (status: RequirementStatus): ClientRequestPriority => {
  if (status.requirement.level === "minimum") return "case_blocker";
  if (status.requirement.purposes.includes("structure") || status.requirement.purposes.includes("financials")) return "structure_driver";
  if (status.requirement.purposes.includes("investor_case")) return "mandate_driver";
  return "material_quality";
};

const priorityOrder: Record<ClientRequestPriority, number> = {
  case_blocker: 0,
  structure_driver: 1,
  mandate_driver: 2,
  material_quality: 3,
};

/**
 * Selects the next best requests after the system has read everything currently available.
 *
 * Rules:
 *  - never ask for a satisfied item;
 *  - never surface diligence or closing as a current task;
 *  - prioritize blockers, then facts that change capacity/structure, then mandate fit;
 *  - cap the active batch at five, default four;
 *  - preserve playbook order as the final deterministic tie-breaker.
 */
export function planClientRequests(report: SufficiencyReport, options: ClientRequestOptions = {}): ClientRequestPlan {
  const requestedBatchSize = options.batchSize ?? 4;
  const batchSize = Math.max(1, Math.min(5, Math.trunc(requestedBatchSize)));
  const index = new Map(report.requirements.map((status, position) => [status.requirement.id, position]));
  const openNow = report.byStage.now.filter((status) => !status.satisfied);
  const openStructuring = report.byStage.structuring.filter((status) => !status.satisfied);
  const activeStage = openNow.length > 0 ? openNow : openStructuring;
  const prioritized = activeStage
    .sort((left, right) => {
      const priority = priorityOrder[priorityOf(left)] - priorityOrder[priorityOf(right)];
      if (priority !== 0) return priority;
      const leftPurpose = Math.min(...left.requirement.purposes.map((purpose) => purposeOrder[purpose]));
      const rightPurpose = Math.min(...right.requirement.purposes.map((purpose) => purposeOrder[purpose]));
      if (leftPurpose !== rightPurpose) return leftPurpose - rightPurpose;
      return (index.get(left.requirement.id) ?? 0) - (index.get(right.requirement.id) ?? 0);
    });

  return {
    current: prioritized.slice(0, batchSize).map((status) => ({
      status,
      priority: priorityOf(status),
      unlocks: [...status.requirement.purposes].sort((a, b) => purposeOrder[a] - purposeOrder[b]),
    })),
    resolved: report.requirements.filter((status) => status.satisfied),
    roadmap: {
      diligence: stageSummary(report, "diligence"),
      closing: stageSummary(report, "closing"),
    },
    hiddenOpenCount: Math.max(0, prioritized.length - batchSize),
  };
}

const stageSummary = (report: SufficiencyReport, stage: "diligence" | "closing") => ({
  open: report.byStage[stage].filter((status) => !status.satisfied).length,
  total: report.byStage[stage].length,
});
