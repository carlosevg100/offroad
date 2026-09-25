import {productionModelCeilingsUsd, productionRunBudget} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";

import {describeConfig, loadConfig} from "./config";
import {jobModelBudget, productionCeilingUsd, researchQueryReserve} from "./model-budgets";
import type {ClaimedJob} from "./queue";

const base = {
  claimed: true as const, job_id: "11111111-1111-4111-8111-111111111111", capability_token: "c".repeat(64),
  lease_expires_at: "2026-09-24T18:00:00.000Z", attempt: 1, organization_id: "22222222-2222-4222-8222-222222222222",
  intake_session_id: "33333333-3333-4333-8333-333333333333", processing_run_id: "44444444-4444-4444-8444-444444444444",
};
const capital = (scope: string, budget: {max_cost_usd: number; max_calls: number}, revision = false) => ({
  ...base, kind: "capital_project_analysis", payload: {
    analysis_scope: scope, locale: "pt-BR", capital_project_id: "55555555-5555-4555-8555-555555555555",
    capital_project_plan_id: "66666666-6666-4666-8666-666666666666", capital_project_brief_id: "77777777-7777-4777-8777-777777777777",
    capital_task_ids: ["C11"], capital_artifact_required: true, trigger_event: {}, model_budget: budget,
    ...(revision ? {revision_of_artifact_id: "88888888-8888-4888-8888-888888888888", correction_decision_id: "99999999-9999-4999-8999-999999999999"} : {}),
  },
}) as unknown as ClaimedJob;
const caseJob = (budget?: {max_cost_usd: number; max_calls: number}) => ({...base, kind: "case_analysis",
  payload: {locale: "pt-BR", execution_mode: "primary", analysis_scope: "full_case", ...(budget ? {model_budget: budget} : {})}}) as unknown as ClaimedJob;
const documentJob = (budget: {max_cost_usd: number; max_calls: number}) => ({...base, kind: "document_pipeline", payload: {
  source_document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", document_version: 1, original_name: "itr.pdf", object_path: "x/y.pdf", model_budget: budget}}) as unknown as ClaimedJob;
const briefJob = {...base, kind: "agent_operation_brief", payload: {message_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", locale: "pt-BR"}} as unknown as ClaimedJob;
/** OpenAI web search, the only discovery provider production has a verified connection for. */
const webSearch = {researchCostPerQueryUsd: 0.02, researchProvidersConfigured: true, maxCallsPerJob: 8};

describe("worker model budget of one attempt", () => {
  it("names the derived ceiling of every job kind, scope and revision", () => {
    expect(productionCeilingUsd(documentJob({max_cost_usd: 1.6, max_calls: 8}))).toBe(productionModelCeilingsUsd.documentPipeline);
    expect(productionCeilingUsd(caseJob())).toBe(productionModelCeilingsUsd.caseAnalysis);
    expect(productionCeilingUsd(briefJob)).toBe(productionModelCeilingsUsd.agentOperationBrief);
    expect(productionCeilingUsd(capital("origination_thesis", {max_cost_usd: 1.55, max_calls: 2}))).toBe(productionModelCeilingsUsd.originationThesis);
    expect(productionCeilingUsd(capital("company_debt_view", {max_cost_usd: 0.85, max_calls: 1}, true))).toBe(productionModelCeilingsUsd.companyDebtViewRevision);
    expect(productionCeilingUsd(capital("capital_planning", {max_cost_usd: 0.8, max_calls: 1}, true))).toBe(productionModelCeilingsUsd.capitalPlanningRevision);
    expect(productionCeilingUsd(capital("integration_preview", {max_cost_usd: 0.6, max_calls: 4}))).toBe(productionModelCeilingsUsd.integrationPreview);
    expect(productionCeilingUsd(capital("provider_research", {max_cost_usd: 0, max_calls: 0}))).toBe(0);
  });

  it("reserves research only for the jobs that search, and none for the integration preview", () => {
    expect(researchQueryReserve(capital("origination_thesis", {max_cost_usd: 1.55, max_calls: 2}))).toBe(12);
    expect(researchQueryReserve(capital("company_debt_view", {max_cost_usd: 0.95, max_calls: 2}))).toBe(8);
    expect(researchQueryReserve(capital("capital_planning", {max_cost_usd: 0.95, max_calls: 2}))).toBe(8);
    expect(researchQueryReserve(capital("origination_thesis", {max_cost_usd: 1.55, max_calls: 1}, true))).toBe(0);
    expect(researchQueryReserve(capital("integration_preview", {max_cost_usd: 0.6, max_calls: 4}))).toBe(0);
    expect(researchQueryReserve(capital("provider_case_fit", {max_cost_usd: 0, max_calls: 0}))).toBe(0);
    expect(researchQueryReserve(caseJob())).toBe(5);
    expect(researchQueryReserve(briefJob)).toBe(0);
    expect(researchQueryReserve(documentJob({max_cost_usd: 1.6, max_calls: 8}))).toBe(0);
  });

  it("applies the smallest of the kind's ceiling, the database budget and the override, less research", () => {
    // A case analysis of a web-started run: the run budget's case share, less five queries.
    expect(jobModelBudget({job: caseJob({max_cost_usd: productionRunBudget.case_max_cost_usd, max_calls: 4}), ...webSearch}))
      .toEqual({maxCostUsd: 3, maxCalls: 4, researchReserveUsd: 0.1});
    // A job written before the migration, with the old case budget of 1.00, keeps the old 0.90.
    expect(jobModelBudget({job: caseJob({max_cost_usd: 1, max_calls: 4}), ...webSearch}).maxCostUsd).toBeCloseTo(0.9, 10);
    // Origination: the trigger's 1.55 less twelve queries; a job written before the migration keeps
    // the former 1.50, which binds below the derived ceiling.
    expect(jobModelBudget({job: capital("origination_thesis", {max_cost_usd: 1.55, max_calls: 2}), ...webSearch}).maxCostUsd).toBeCloseTo(1.31, 10);
    expect(jobModelBudget({job: capital("origination_thesis", {max_cost_usd: 1.5, max_calls: 2}), ...webSearch}).maxCostUsd).toBeCloseTo(1.26, 10);
    // The agent operation brief has no database budget: its derived ceiling is the budget.
    expect(jobModelBudget({job: briefJob, ...webSearch})).toEqual({maxCostUsd: 1.85, maxCalls: 8, researchReserveUsd: 0});
    // The preview never researches, so its whole database budget reaches the model.
    expect(jobModelBudget({job: capital("integration_preview", {max_cost_usd: 0.6, max_calls: 4}), ...webSearch})).toEqual({maxCostUsd: 0.6, maxCalls: 4, researchReserveUsd: 0});
    // A document gets its database share; an operator's override can only lower it.
    expect(jobModelBudget({job: documentJob({max_cost_usd: 1.6, max_calls: 8}), ...webSearch}).maxCostUsd).toBe(1.6);
    expect(jobModelBudget({job: documentJob({max_cost_usd: 1.6, max_calls: 8}), ...webSearch, overrideMaxCostUsd: 0.4}).maxCostUsd).toBe(0.4);
    expect(jobModelBudget({job: documentJob({max_cost_usd: 1.6, max_calls: 8}), ...webSearch, overrideMaxCostUsd: 99}).maxCostUsd).toBe(1.6);
    expect(jobModelBudget({job: documentJob({max_cost_usd: 1.6, max_calls: 8}), ...webSearch, maxCallsPerJob: 5}).maxCalls).toBe(5);
    // Nothing reaches a job the database gives zero.
    expect(jobModelBudget({job: capital("provider_research", {max_cost_usd: 0, max_calls: 0}), ...webSearch})).toEqual({maxCostUsd: 0, maxCalls: 0, researchReserveUsd: 0});
  });

  it("never lets the research reserve take the last cent, and reserves nothing without a provider", () => {
    const expensive = jobModelBudget({job: caseJob({max_cost_usd: 0.05, max_calls: 4}), researchCostPerQueryUsd: 1, researchProvidersConfigured: true, maxCallsPerJob: 8});
    expect(expensive.researchReserveUsd).toBeCloseTo(0.04, 10);
    expect(expensive.maxCostUsd).toBeCloseTo(0.01, 10);
    expect(jobModelBudget({job: caseJob({max_cost_usd: 3.1, max_calls: 4}), researchCostPerQueryUsd: 0, researchProvidersConfigured: false, maxCallsPerJob: 8}).maxCostUsd).toBe(3.1);
  });

  it("carries no dollar default of its own in the environment", () => {
    const config = loadConfig({SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable-key-for-synthetic-test",
      WORKER_ACCOUNT_EMAIL: "worker@example.com", WORKER_ACCOUNT_PASSWORD: "synthetic-password-long-enough", OFFROAD_WORKER_TOKEN: "synthetic-worker-token-with-thirty-two-characters"});
    expect(config.MODEL_MAX_COST_USD_PER_JOB).toBeUndefined();
    expect(describeConfig(config).maxCostUsdPerJob).toBe("job_kind_ceiling");
  });
});
