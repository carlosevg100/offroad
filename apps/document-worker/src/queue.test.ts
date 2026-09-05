import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";
import {claimedJobSchema, createQueueClient, type CapitalProjectAnalysisJob, type CaseAnalysisJob} from "./queue";

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

describe("claimed job parsing", () => {
  it("accepts a case_analysis job enqueued without a scope, because the kind already fixes it as the full case", () => {
    // Intake confirmation, replays and incremental deal-state analyses enqueue this kind with a
    // locale and an execution only; the claim used to be rejected at payload.analysis_scope.
    const {payload: _payload, ...claimedRow} = job;
    const parsed = claimedJobSchema.parse({...claimedRow, payload: {locale: "pt-BR", execution_mode: "primary"}});
    expect(parsed.kind).toBe("case_analysis");
    expect(parsed.payload).toMatchObject({analysis_scope: "full_case", execution_mode: "primary", locale: "pt-BR"});
  });

  it("lets only the integration_preview scope run without an artifact per task run", () => {
    const {payload: _payload, kind: _kind, ...claimedRow} = job;
    const preview = {
      analysis_scope: "integration_preview", locale: "pt-BR", capital_project_id: "50000000-0000-4000-8000-000000000001",
      capital_project_plan_id: "50000000-0000-4000-8000-000000000002", capital_project_brief_id: "50000000-0000-4000-8000-000000000003",
      capital_task_ids: ["C05"], capital_artifact_required: false, model_budget: {max_cost_usd: 1, max_calls: 1},
      preview: {mode: "integration_preview", composition: "prepare_meeting", caseId: "gc01-analista-ib-camil", workflow: {id: "case01.prepare_meeting", version: "2026.09.05-v1", fingerprint: "a".repeat(64)}, premises: {}},
    };
    expect(claimedJobSchema.safeParse({...claimedRow, kind: "capital_project_analysis", integration_preview: true, payload: preview}).success).toBe(true);
    expect(claimedJobSchema.safeParse({...claimedRow, kind: "capital_project_analysis", payload: {...preview, analysis_scope: "origination_thesis", preview: undefined}}).success).toBe(false);
  });

  it("still rejects a case_analysis job that carries the preliminary scope", () => {
    const {payload: _payload, ...claimedRow} = job;
    const result = claimedJobSchema.safeParse({...claimedRow, payload: {locale: "pt-BR", analysis_scope: "preliminary_understanding"}});
    expect(result.success).toBe(false);
  });
});

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

describe("operating-control persistence", () => {
  it("binds the control snapshot to the exact claimed capability and input fingerprint", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("worker_record_operating_control_snapshot_v1");
      expect(args).toEqual({
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_scope_id: "case-analysis:2026.09.01-v1",
        p_requested_use: "internal_decision",
        p_input_fingerprint: "a".repeat(64),
        p_binding: {caseFingerprint: "b".repeat(64)},
        p_snapshot: {snapshotAt: "2026-09-01T15:00:00.000Z"},
      });
      return {data: {
        id: "50000000-0000-4000-8000-000000000001",
        allowed: false,
        blockers: ["capability_not_accredited_for_recommend"],
        warnings: [],
        decisionFingerprint: "c".repeat(64),
        replayed: false,
      }, error: null};
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    const result = await queue.recordOperatingControlSnapshot(job as Extract<CaseAnalysisJob, {kind: "case_analysis"}>, {
      scopeId: "case-analysis:2026.09.01-v1",
      requestedUse: "internal_decision",
      inputFingerprint: "a".repeat(64),
      binding: {caseFingerprint: "b".repeat(64)},
      snapshot: {snapshotAt: "2026-09-01T15:00:00.000Z"},
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(["capability_not_accredited_for_recommend"]);
  });
});

describe("agent-plan persistence", () => {
  it("projects analytical stage progress into the customer-visible project timeline", async () => {
    const rpc = vi.fn(async () => ({data: {recorded: true}, error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await queue.writeStage(job, "case_analysis", "started", {scope: "full_case"}, {modelCalls: 1});

    expect(rpc.mock.calls).toEqual([
      ["worker_write_stage_result", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_stage: "case_analysis",
        p_status: "started",
        p_detail: {scope: "full_case"},
        p_usage: {modelCalls: 1},
      }],
      ["worker_record_agent_stage_event_v1", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_stage: "case_analysis",
        p_status: "started",
        p_detail: {scope: "full_case"},
      }],
    ]);
  });

  it("loads the planning context through the exact claimed capability", async () => {
    const rpc = vi.fn(async () => ({data: {project: {id: "project"}}, error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.loadAgentPlanContext!(job)).resolves.toEqual({project: {id: "project"}});
    expect(rpc).toHaveBeenCalledWith("worker_load_agent_plan_context_v1", {
      p_job_id: job.job_id,
      p_capability_token: job.capability_token,
    });
  });

  it("binds the Deal Captain plan to the claimed job capability", async () => {
    const capitalJob: CapitalProjectAnalysisJob = {
      claimed: true,
      kind: "capital_project_analysis",
      job_id: "10000000-0000-4000-8000-000000000002",
      capability_token: "capability-token-with-at-least-32-characters",
      lease_expires_at: "2026-09-03T18:00:00.000Z",
      attempt: 1,
      organization_id: "20000000-0000-4000-8000-000000000001",
      intake_session_id: "30000000-0000-4000-8000-000000000001",
      processing_run_id: "40000000-0000-4000-8000-000000000001",
      payload: {
        analysis_scope: "origination_thesis",
        locale: "pt-BR",
        capital_project_id: "50000000-0000-4000-8000-000000000001",
        capital_project_plan_id: "60000000-0000-4000-8000-000000000001",
        capital_project_brief_id: "70000000-0000-4000-8000-000000000001",
        capital_task_ids: ["M01"],
        capital_artifact_required: true,
        trigger_event: {},
        model_budget: {max_cost_usd: 1, max_calls: 1},
      },
    };
    const plan = {schemaVersion: "dcm-agent-plan.v1"};
    const rpc = vi.fn(async () => ({data: "80000000-0000-4000-8000-000000000001", error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.recordAgentPlan!(capitalJob, plan)).resolves.toBe("80000000-0000-4000-8000-000000000001");
    expect(rpc).toHaveBeenCalledWith("worker_record_agent_plan_v1", {
      p_job_id: capitalJob.job_id,
      p_capability_token: capitalJob.capability_token,
      p_agent_plan: plan,
    });
  });

  it("persists coverage, questions and decisions through one capability-bound assessment", async () => {
    const assessment = {
      schemaVersion: "dcm-agent-assessment.v1" as const,
      projectId: "50000000-0000-4000-8000-000000000001",
      assessmentRef: `processing_run:${job.processing_run_id}`,
      coverage: [],
      requests: [],
      decisions: [],
    };
    const rpc = vi.fn(async () => ({data: {
      agent_plan_id: "80000000-0000-4000-8000-000000000001",
      coverage_count: 0,
      request_count: 0,
      decision_count: 0,
    }, error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.recordAgentAssessment!(job, assessment)).resolves.toEqual({
      agentPlanId: "80000000-0000-4000-8000-000000000001",
      coverageCount: 0,
      requestCount: 0,
      decisionCount: 0,
    });
    expect(rpc).toHaveBeenCalledWith("worker_record_agent_assessment_v1", {
      p_job_id: job.job_id,
      p_capability_token: job.capability_token,
      p_assessment: assessment,
    });
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
