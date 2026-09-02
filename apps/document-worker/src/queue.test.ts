import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";
import {createQueueClient, type CapitalProjectAnalysisJob, type CaseAnalysisJob} from "./queue";

const job: CaseAnalysisJob = {
  claimed: true,
  kind: "case_analysis",
  job_id: "10000000-0000-4000-8000-000000000001",
  capability_token: "capability-token-with-at-least-32-characters",
  lease_expires_at: "2026-08-29T18:00:00.000Z",
  attempt: 1,
  organization_id: "20000000-0000-4000-8000-000000000001",
  intake_session_id: "30000000-0000-4000-8000-000000000001",
  processing_run_id: "40000000-0000-4000-8000-000000000001",
  payload: {execution_mode: "primary", analysis_scope: "full_case"},
};

describe("case input loading", () => {
  it("freezes live case data before attaching the prior report cache", async () => {
    const prior = {schemaVersion: "2026.08.29-v4", reportFingerprint: "prior"};
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "worker_load_case_input") return {data: {session: {id: "case"}}, error: null};
      if (name === "worker_load_claim_decisions") return {data: [{id: "decision"}], error: null};
      if (name === "worker_freeze_case_input") {
        const liveInput = args.p_live_input as Record<string, unknown>;
        expect(liveInput).toEqual({session: {id: "case"}, claim_decisions: [{id: "decision"}]});
        expect(liveInput).not.toHaveProperty("prior_case_report");
        return {data: {...liveInput, _execution: {id: "execution"}}, error: null};
      }
      if (name === "worker_load_prior_case_report") return {data: prior, error: null};
      throw new Error(`unexpected RPC ${name}`);
    });
    const supabase = {rpc} as unknown as SupabaseClient;

    const result = await createQueueClient(supabase, {workerToken: "worker", leaseSeconds: 60}).loadCaseInput(job);

    expect(result).toMatchObject({
      session: {id: "case"},
      prior_case_report: prior,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "worker_load_case_input",
      "worker_load_claim_decisions",
      "worker_freeze_case_input",
      "worker_load_prior_case_report",
    ]);
  });
});

describe("capital TaskRun lifecycle", () => {
  it("passes the claimed capability, versioned executor and proof-bearing result", async () => {
    const taskRunId = "50000000-0000-4000-8000-000000000001";
    const artifactId = "60000000-0000-4000-8000-000000000001";
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "worker_start_capital_project_task") {
        expect(args).toMatchObject({
          p_job_id: job.job_id,
          p_capability_token: job.capability_token,
          p_task_id: "M01",
          p_executor_key: "resolve-company",
          p_executor_version: "2026.09.01-v1",
          p_input_fingerprint: "a".repeat(64),
          p_context_manifest: {company: ["name", "website"]},
        });
        return {data: taskRunId, error: null};
      }
      if (name === "worker_finish_capital_project_task") {
        expect(args).toMatchObject({
          p_job_id: job.job_id,
          p_capability_token: job.capability_token,
          p_task_run_id: taskRunId,
          p_status: "succeeded",
          p_output_reference: {type: "capital_project_artifact", id: artifactId},
          p_output_fingerprint: "b".repeat(64),
          p_quality_results: [{grader: "schema", passed: true}],
          p_usage: {durationMs: 12},
          p_error: null,
        });
        return {data: taskRunId, error: null};
      }
      if (name === "worker_record_capital_project_artifact") {
        expect(args).toMatchObject({
          p_job_id: job.job_id,
          p_capability_token: job.capability_token,
          p_task_run_id: taskRunId,
          p_artifact_type: "company_resolution",
          p_schema_version: "company-resolution.v1",
          p_status: "draft",
          p_input_fingerprint: "a".repeat(64),
          p_content: {companyName: "Example"},
          p_evidence_refs: [{sourceType: "public_url", sourceId: "https://example.com"}],
          p_dependencies: [],
        });
        return {data: {
          id: artifactId,
          artifact_fingerprint: "b".repeat(64),
          artifact_version: 1,
          replayed: false,
        }, error: null};
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    const started = await queue.startCapitalTask(job, {
      taskId: "M01",
      executorKey: "resolve-company",
      executorVersion: "2026.09.01-v1",
      inputFingerprint: "a".repeat(64),
      contextManifest: {company: ["name", "website"]},
    });
    const artifact = await queue.recordCapitalProjectArtifact(job, {
      taskRunId: started,
      artifactType: "company_resolution",
      schemaVersion: "company-resolution.v1",
      status: "draft",
      inputFingerprint: "a".repeat(64),
      content: {companyName: "Example"},
      evidenceRefs: [{sourceType: "public_url", sourceId: "https://example.com"}],
    });
    const finished = await queue.finishCapitalTask(job, {
      taskRunId: started,
      status: "succeeded",
      outputReference: {type: "capital_project_artifact", id: artifact.id},
      outputFingerprint: artifact.artifactFingerprint,
      qualityResults: [{grader: "schema", passed: true}],
      usage: {durationMs: 12},
    });

    expect(finished).toBe(taskRunId);
    expect(artifact).toEqual({
      id: artifactId,
      artifactFingerprint: "b".repeat(64),
      artifactVersion: 1,
      replayed: false,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "worker_start_capital_project_task",
      "worker_record_capital_project_artifact",
      "worker_finish_capital_project_task",
    ]);
  });
});

describe("advisor specialized completion", () => {
  it("passes the exact capability, artifact and durable message to the atomic RPC", async () => {
    const capitalJob: CapitalProjectAnalysisJob = {
      ...job,
      kind: "capital_project_analysis",
      payload: {
        analysis_scope: "origination_thesis",
        locale: "pt-BR",
        capital_project_id: "50000000-0000-4000-8000-000000000001",
        capital_project_plan_id: "60000000-0000-4000-8000-000000000001",
        capital_project_brief_id: "70000000-0000-4000-8000-000000000001",
        capital_task_ids: ["M07"],
        capital_artifact_required: true,
        trigger_event: {
          type: "advisor_semantic_route",
          sourceMessageId: "80000000-0000-4000-8000-000000000001",
          assistantMessageId: "90000000-0000-4000-8000-000000000001",
        },
        model_budget: {max_cost_usd: 0.75, max_calls: 2},
      },
    };
    const rpc = vi.fn(async () => ({data: {job_id: capitalJob.job_id}, error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await queue.completeAdvisorSpecializedJob(capitalJob, {
      completionMessageId: "a0000000-0000-4000-8000-000000000001",
      artifactId: "b0000000-0000-4000-8000-000000000001",
      artifactFingerprint: "f".repeat(64),
      content: "O trabalho está pronto para revisão.",
      result: {capital_project_id: capitalJob.payload.capital_project_id},
    });

    expect(rpc).toHaveBeenCalledWith("worker_complete_advisor_specialized_job_v2", {
      p_job_id: capitalJob.job_id,
      p_capability_token: capitalJob.capability_token,
      p_completion_message_id: "a0000000-0000-4000-8000-000000000001",
      p_artifact_id: "b0000000-0000-4000-8000-000000000001",
      p_artifact_fingerprint: "f".repeat(64),
      p_content: "O trabalho está pronto para revisão.",
      p_result: {capital_project_id: capitalJob.payload.capital_project_id},
    });
  });
});
