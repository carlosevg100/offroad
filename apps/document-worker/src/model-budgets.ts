import {productionModelCeilingsUsd} from "@offroad/model-gateway";

import type {ClaimedJob} from "./queue";

/**
 * The model-spend ceiling of one attempt of a production job, from `productionModelCeilingsUsd`
 * (packages/model-gateway/src/production-budgets.ts, where each value is derived). The worker
 * applies the smallest of this ceiling, the budget the database wrote into the job and the
 * optional MODEL_MAX_COST_USD_PER_JOB override, so the database stays the authority it was while
 * a kind whose budget the database does not set (the agent operation brief) has one of its own.
 */
export function productionCeilingUsd(job: ClaimedJob): number {
  switch (job.kind) {
    case "document_pipeline": return productionModelCeilingsUsd.documentPipeline;
    case "case_analysis": return productionModelCeilingsUsd.caseAnalysis;
    case "preliminary_analysis": return productionModelCeilingsUsd.preliminaryAnalysis;
    case "agent_operation_brief": return productionModelCeilingsUsd.agentOperationBrief;
    case "work_conversation": return productionModelCeilingsUsd.workConversation;
    // Deterministic proposal: no model call, so no money.
    case "execution_brief_proposal": return 0;
    case "capital_project_analysis": {
      const revision = Boolean(job.payload.revision_of_artifact_id);
      switch (job.payload.analysis_scope) {
        case "origination_thesis": return revision ? productionModelCeilingsUsd.originationThesisRevision : productionModelCeilingsUsd.originationThesis;
        case "company_debt_view": return revision ? productionModelCeilingsUsd.companyDebtViewRevision : productionModelCeilingsUsd.companyDebtView;
        case "capital_planning": return revision ? productionModelCeilingsUsd.capitalPlanningRevision : productionModelCeilingsUsd.capitalPlanning;
        case "integration_preview": return productionModelCeilingsUsd.integrationPreview;
        // Provider research and case fit read the public catalogue; the database gives them zero.
        case "provider_research": case "provider_case_fit": return 0;
      }
    }
  }
}

/**
 * Public-research queries whose worst cost is set aside before the model calls of a job: a first
 * origination thesis runs 12, a first company debt view or capital planning 8, a case or
 * preliminary analysis 5. A revision reuses the research of the run it corrects, provider research
 * and case fit make no paid search, and the integration preview reads its frozen case only, so
 * none of them reserves anything (the preview used to lose 8 queries' worth for research it never
 * runs).
 */
export function researchQueryReserve(job: ClaimedJob): number {
  if (job.kind === "case_analysis" || job.kind === "preliminary_analysis") return 5;
  if (job.kind !== "capital_project_analysis" || job.payload.revision_of_artifact_id) return 0;
  switch (job.payload.analysis_scope) {
    case "origination_thesis": return 12;
    case "company_debt_view": case "capital_planning": return 8;
    default: return 0;
  }
}

/**
 * The gateway budget of one attempt. The research reserve comes out of the model ceiling, as it
 * always has; it never takes the last cent, so a job whose search is expensive still reaches the
 * model with whatever the ceiling leaves.
 */
export function jobModelBudget(input: {
  job: ClaimedJob;
  /** Sum of the worst per-call cost of the discovery providers this job may call; 0 without any. */
  researchCostPerQueryUsd: number;
  researchProvidersConfigured: boolean;
  overrideMaxCostUsd?: number | undefined;
  maxCallsPerJob: number;
}): {maxCostUsd: number; maxCalls: number; researchReserveUsd: number} {
  const requested = "model_budget" in input.job.payload ? input.job.payload.model_budget : undefined;
  const ceilingUsd = Math.min(
    productionCeilingUsd(input.job),
    requested?.max_cost_usd ?? Number.POSITIVE_INFINITY,
    input.overrideMaxCostUsd ?? Number.POSITIVE_INFINITY,
  );
  const researchReserveUsd = input.researchProvidersConfigured
    ? Math.min(researchQueryReserve(input.job) * input.researchCostPerQueryUsd, Math.max(0, ceilingUsd - 0.01))
    : 0;
  return {
    maxCostUsd: ceilingUsd - researchReserveUsd,
    maxCalls: Math.min(input.maxCallsPerJob, requested?.max_calls ?? input.maxCallsPerJob),
    researchReserveUsd,
  };
}
