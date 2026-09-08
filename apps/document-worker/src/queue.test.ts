import {createHash} from "node:crypto";

import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";
import {claimedJobSchema, createQueueClient, type AgentOperationBriefJob, type CapitalProjectAnalysisJob, type CaseAnalysisJob} from "./queue";

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

  it("stores a governed receivables method input through the exact case capability", async () => {
    const assembly = {schemaVersion: "2026.09.07-v1", source: {datasetHash: "a".repeat(64)}};
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("worker_record_receivables_method_input_assembly_v1");
      expect(args).toEqual({
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_assembly: assembly,
      });
      return {data: {
        id: "50000000-0000-4000-8000-000000000001",
        source_dataset_hash: "a".repeat(64),
        assembly_fingerprint: "b".repeat(64),
        replayed: false,
      }, error: null};
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.recordReceivablesMethodInputAssembly!(
      job as Extract<CaseAnalysisJob, {kind: "case_analysis"}>, assembly,
    )).resolves.toEqual({
      id: "50000000-0000-4000-8000-000000000001",
      sourceDatasetHash: "a".repeat(64),
      assemblyFingerprint: "b".repeat(64),
      replayed: false,
    });
  });

  it("stores a private specialist shadow result bound to its input assembly", async () => {
    const result = {mode: "internal_shadow", taskId: "R01"};
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("worker_record_receivables_specialist_shadow_run_v1");
      expect(args).toEqual({
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_input_assembly_id: "50000000-0000-4000-8000-000000000001",
        p_result: result,
      });
      return {data: {
        id: "60000000-0000-4000-8000-000000000001",
        input_fingerprint: "a".repeat(64),
        output_fingerprint: "b".repeat(64),
        result_fingerprint: "c".repeat(64),
        replayed: false,
      }, error: null};
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.recordReceivablesSpecialistShadowRun!(
      job as Extract<CaseAnalysisJob, {kind: "case_analysis"}>,
      {inputAssemblyId: "50000000-0000-4000-8000-000000000001", result},
    )).resolves.toEqual({
      id: "60000000-0000-4000-8000-000000000001",
      inputFingerprint: "a".repeat(64),
      outputFingerprint: "b".repeat(64),
      resultFingerprint: "c".repeat(64),
      replayed: false,
    });
  });

  it("persists a reconciled supplement patch and draft through the exact capability", async () => {
    const patch = {schemaVersion: "2026.09.07-v1", patchId: "answer-1"};
    const nextDraft = {schemaVersion: "2026.09.07-v1", revision: 1};
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("worker_apply_receivables_method_supplement_patch_v1");
      expect(args).toEqual({
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_patch: patch,
        p_next_draft: nextDraft,
      });
      return {data: {
        patch_id: "50000000-0000-4000-8000-000000000001",
        draft_id: "60000000-0000-4000-8000-000000000001",
        revision: 1,
        draft_fingerprint: "c".repeat(64),
        replayed: false,
      }, error: null};
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.applyReceivablesMethodSupplementPatch!(
      job as Extract<CaseAnalysisJob, {kind: "case_analysis"}>, {patch, nextDraft},
    )).resolves.toMatchObject({revision: 1, draftFingerprint: "c".repeat(64), replayed: false});
  });

  it("stores private field bindings after the visible question projection", async () => {
    const projection = {schemaVersion: "project-information-request-projection.v1", requests: [{producerBinding: {methodId: "R01"}}]};
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("worker_bind_receivables_information_request_fields_v1");
      expect(args).toEqual({p_job_id: job.job_id, p_capability_token: job.capability_token, p_projection: projection});
      return {data: {bound_count: 1, replayed_count: 0}, error: null};
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.bindReceivablesInformationRequestFields!(
      job as Extract<CaseAnalysisJob, {kind: "case_analysis"}>, projection,
    )).resolves.toEqual({boundCount: 1, replayedCount: 0});
  });

  it("advances the R01 question window through its dedicated scoped command", async () => {
    const projection = {schemaVersion: "project-information-request-projection.v1", sourceNamespace: "receivables_method_r01_fields", requests: []};
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("worker_sync_receivables_information_requests_v1");
      expect(args).toEqual({p_job_id: job.job_id, p_capability_token: job.capability_token, p_projection: projection});
      return {data: {open_count: 2, preserved_closed_count: 1, superseded_count: 1, bound_count: 2}, error: null};
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.syncReceivablesInformationRequests!(
      job as Extract<CaseAnalysisJob, {kind: "case_analysis"}>, projection,
    )).resolves.toEqual({openCount: 2, preservedClosedCount: 1, supersededCount: 1, boundCount: 2});
  });

  it("queues one bounded refresh for a complete immutable supplement draft", async () => {
    const agentJob: AgentOperationBriefJob = {
      claimed: true, kind: "agent_operation_brief",
      job_id: "10000000-0000-4000-8000-000000000010",
      capability_token: job.capability_token,
      lease_expires_at: job.lease_expires_at,
      attempt: 1,
      organization_id: job.organization_id,
      intake_session_id: job.intake_session_id,
      processing_run_id: job.processing_run_id,
      payload: {message_id: "10000000-0000-4000-8000-000000000011", locale: "pt-BR"},
    };
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("worker_enqueue_receivables_method_refresh_v1");
      expect(args).toEqual({
        p_job_id: agentJob.job_id,
        p_capability_token: agentJob.capability_token,
        p_draft_fingerprint: "d".repeat(64),
        p_compiled_supplement_fingerprint: "e".repeat(64),
      });
      return {data: {
        processing_run_id: "50000000-0000-4000-8000-000000000001",
        job_id: "60000000-0000-4000-8000-000000000001",
        compiled_supplement_fingerprint: "e".repeat(64),
        replayed: false,
      }, error: null};
    });
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.enqueueReceivablesMethodRefresh!(agentJob, {
      draftFingerprint: "d".repeat(64),
      compiledSupplementFingerprint: "e".repeat(64),
    })).resolves.toEqual({
      processingRunId: "50000000-0000-4000-8000-000000000001",
      jobId: "60000000-0000-4000-8000-000000000001",
      compiledSupplementFingerprint: "e".repeat(64),
      replayed: false,
    });
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

  it("projects workflow questions without requiring an agent-plan row", async () => {
    const projectionJob: CapitalProjectAnalysisJob = {
      ...job,
      kind: "capital_project_analysis",
      payload: {
        analysis_scope: "integration_preview",
        locale: "pt-BR",
        capital_project_id: "50000000-0000-4000-8000-000000000001",
        capital_project_plan_id: "60000000-0000-4000-8000-000000000001",
        capital_project_brief_id: "70000000-0000-4000-8000-000000000001",
        capital_task_ids: ["A01"],
        capital_artifact_required: false,
        trigger_event: {},
        model_budget: {max_cost_usd: 1, max_calls: 1},
      },
    };
    const projection = {
      schemaVersion: "project-information-request-projection.v1",
      projectId: "50000000-0000-4000-8000-000000000001",
      sourceNamespace: "integration_preview",
      projectionRef: "artifact:A01:abc",
      requests: [],
    };
    const rpc = vi.fn(async () => ({data: {
      open_count: 0,
      preserved_closed_count: 1,
      superseded_count: 0,
    }, error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.syncProjectInformationRequests!(projectionJob, projection)).resolves.toEqual({
      openCount: 0,
      preservedClosedCount: 1,
      supersededCount: 0,
    });
    expect(rpc).toHaveBeenCalledWith("worker_sync_project_information_requests_v1", {
      p_job_id: projectionJob.job_id,
      p_capability_token: projectionJob.capability_token,
      p_projection: projection,
    });
  });
});

describe("execution-brief activation", () => {
  it("records the response, activation and paired brief through one capability-bound transaction", async () => {
    const advisorJob: AgentOperationBriefJob = {
      ...job,
      kind: "agent_operation_brief",
      payload: {message_id: "50000000-0000-4000-8000-000000000001", locale: "pt-BR"},
    };
    const internal = {schemaVersion: "execution-brief.v1", fingerprint: "a".repeat(64)};
    const visible = {schemaVersion: "execution-brief.v1", fingerprint: "a".repeat(64)};
    const rpc = vi.fn(async () => ({data: {
      message_id: "60000000-0000-4000-8000-000000000001",
      activation: {job_id: "70000000-0000-4000-8000-000000000001"},
      execution_brief: {id: "80000000-0000-4000-8000-000000000001", version: 2, replayed: false},
    }, error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.recordAgentResponse(
      advisorJob,
      "60000000-0000-4000-8000-000000000001",
      {state: "idle", reply: "Vou começar."},
      undefined,
      {job: "company_debt_view"},
      {internal, visible, changeSummary: [{kind: "turn_activation"}]},
    )).resolves.toEqual({
      activation: {job_id: "70000000-0000-4000-8000-000000000001"},
      executionBrief: {id: "80000000-0000-4000-8000-000000000001", version: 2, replayed: false},
    });
    expect(rpc).toHaveBeenCalledWith("worker_record_agent_response_and_activate_v6", {
      p_job_id: advisorJob.job_id,
      p_capability_token: advisorJob.capability_token,
      p_assistant_message_id: "60000000-0000-4000-8000-000000000001",
      p_response: {state: "idle", reply: "Vou começar."},
      p_proposal: null,
      p_activation: {job: "company_debt_view"},
      p_execution_brief_internal: internal,
      p_execution_brief_visible: visible,
      p_execution_brief_change_summary: [{kind: "turn_activation"}],
      p_expected_input_fingerprint: null,
    });
  });

  it("records the objective plan and preflight through the exact job capability", async () => {
    const advisorJob: AgentOperationBriefJob = {
      ...job,
      kind: "agent_operation_brief",
      payload: {message_id: "50000000-0000-4000-8000-000000000001", locale: "pt-BR"},
    };
    const objectivePlan = {schemaVersion: "objective-plan.v1", structuralIdentity: "a".repeat(64)};
    const preflightDecision = {schemaVersion: "objective-plan-readiness.v1", readinessFingerprint: "b".repeat(64)};
    const specialization = {schemaVersion: "objective-specialization.v1", fingerprint: "c".repeat(64)};
    const methodBinding = {schemaVersion: "objective-method-binding.v1", fingerprint: "d".repeat(64)};
    const workflowSelection = {schemaVersion: "workflow-recipe-selection.v1", fingerprint: "e".repeat(64)};
    const dispatchCandidate = {schemaVersion: "universal-dispatch-candidate.v1", fingerprint: "f".repeat(64)};
    const rpc = vi.fn(async () => ({data: {
      id: "80000000-0000-4000-8000-000000000001",
      status: "blocked",
      terminal_reachable: false,
      replayed: false,
      specialization_id: "90000000-0000-4000-8000-000000000001",
      specialization_fingerprint: "c".repeat(64),
      pack_ids: ["core.institutional-dcm"],
      minimum_maturity: "implemented",
      specialization_replayed: false,
      method_binding_id: "a0000000-0000-4000-8000-000000000001",
      method_binding_fingerprint: "d".repeat(64),
      method_binding_status: "blocked",
      bound_task_ids: [],
      specialist_task_ids: [],
      method_binding_replayed: false,
      workflow_selection_id: "b0000000-0000-4000-8000-000000000001",
      workflow_selection_fingerprint: "e".repeat(64),
      workflow_selection_status: "blocked",
      workflow_selection_reason: "economic_situation_not_implemented",
      workflow_selection_replayed: false,
      dispatch_candidate_id: "c0000000-0000-4000-8000-000000000001",
      dispatch_candidate_fingerprint: "f".repeat(64),
      dispatch_candidate_status: "blocked",
      dispatch_candidate_replayed: false,
    }, error: null}));
    const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.recordObjectivePlanPreflight!(advisorJob, {objectivePlan, preflightDecision, specialization, methodBinding, workflowSelection, dispatchCandidate})).resolves.toEqual({
      id: "80000000-0000-4000-8000-000000000001",
      status: "blocked",
      terminalReachable: false,
      replayed: false,
      specializationId: "90000000-0000-4000-8000-000000000001",
      specializationFingerprint: "c".repeat(64),
      packIds: ["core.institutional-dcm"],
      minimumMaturity: "implemented",
      specializationReplayed: false,
      methodBindingId: "a0000000-0000-4000-8000-000000000001",
      methodBindingFingerprint: "d".repeat(64),
      methodBindingStatus: "blocked",
      boundTaskIds: [],
      specialistTaskIds: [],
      methodBindingReplayed: false,
      workflowSelectionId: "b0000000-0000-4000-8000-000000000001",
      workflowSelectionFingerprint: "e".repeat(64),
      workflowSelectionStatus: "blocked",
      workflowSelectionReason: "economic_situation_not_implemented",
      workflowSelectionReplayed: false,
      dispatchCandidateId: "c0000000-0000-4000-8000-000000000001",
      dispatchCandidateFingerprint: "f".repeat(64),
      dispatchCandidateStatus: "blocked",
      dispatchCandidateReplayed: false,
    });
    expect(rpc).toHaveBeenCalledWith("worker_record_objective_plan_preflight_v5", {
      p_job_id: advisorJob.job_id,
      p_capability_token: advisorJob.capability_token,
      p_objective_plan: objectivePlan,
      p_preflight_decision: preflightDecision,
      p_specialization: specialization,
      p_method_binding: methodBinding,
      p_workflow_selection: workflowSelection,
      p_dispatch_candidate: dispatchCandidate,
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

describe("governed capital-project material storage", () => {
  const capitalJob: CapitalProjectAnalysisJob = {
    ...job,
    kind: "capital_project_analysis",
    payload: {
      analysis_scope: "integration_preview",
      locale: "pt-BR",
      capital_project_id: "50000000-0000-4000-8000-000000000001",
      capital_project_plan_id: "60000000-0000-4000-8000-000000000001",
      capital_project_brief_id: "70000000-0000-4000-8000-000000000001",
      capital_task_ids: ["A02"],
      capital_artifact_required: false,
      trigger_event: {},
      model_budget: {max_cost_usd: 1, max_calls: 1},
      preview: {mode: "integration_preview", composition: "prepare_material", caseId: "gc01-analista-ib-camil", workflow: {id: "case01.prepare_material", version: "2026.09.05-v1", fingerprint: "a".repeat(64)}, premises: {}},
    },
  };

  it("uploads only to the granted path, re-downloads the bytes and closes the grant", async () => {
    const bytes = new TextEncoder().encode("exact workbook bytes");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectPath = `${capitalJob.organization_id}/${capitalJob.payload.capital_project_id}/materials/${sha256}.xlsx`;
    const rpc = vi.fn(async (name: string) => {
      if (name === "worker_authorize_capital_project_material_upload_v1") return {data: {grant_id: "80000000-0000-4000-8000-000000000001", object_path: objectPath, state: "authorized", storage_etag: null, replayed: false}, error: null};
      if (name === "worker_complete_capital_project_material_upload_v1") return {data: {object_path: objectPath, storage_etag: "storage-object-v1", replayed: false}, error: null};
      throw new Error(`unexpected RPC ${name}`);
    });
    const upload = vi.fn(async () => ({data: {id: "storage-object-v1", path: objectPath, fullPath: `case-artifacts/${objectPath}`}, error: null}));
    const download = vi.fn(async () => ({data: new Blob([bytes]), error: null}));
    const from = vi.fn(() => ({upload, download}));
    const queue = createQueueClient({rpc, storage: {from}} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});

    await expect(queue.storeCapitalProjectMaterial!(capitalJob, {
      bytes,
      contentSha256: sha256,
      format: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })).resolves.toEqual({objectPath, storageEtag: "storage-object-v1", replayed: false});

    expect(from).toHaveBeenCalledWith("case-artifacts");
    expect(upload).toHaveBeenCalledWith(objectPath, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
    expect(download).toHaveBeenCalledWith(objectPath);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "worker_authorize_capital_project_material_upload_v1",
      "worker_complete_capital_project_material_upload_v1",
    ]);
  });

  it("refuses a caller-supplied hash that does not describe the bytes", async () => {
    const rpc = vi.fn();
    const queue = createQueueClient({rpc, storage: {from: vi.fn()}} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});
    await expect(queue.storeCapitalProjectMaterial!(capitalJob, {
      bytes: new TextEncoder().encode("different"),
      contentSha256: "a".repeat(64),
      format: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })).rejects.toThrow(/do not match contentSha256/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

it("uses only capability-scoped proposal RPCs and forwards the loaded input fingerprint", async () => {
  const rpc = vi.fn(async () => ({data: {status: "proposed"}, error: null}));
  const queue = createQueueClient({rpc} as unknown as SupabaseClient, {workerToken: "worker", leaseSeconds: 60});
  const proposal = {...job, kind: "execution_brief_proposal" as const, payload: {approval_target_job_id: "10000000-0000-4000-8000-000000000005", locale: "pt-BR" as const}};
  await queue.loadExecutionBriefProposal!(proposal);
  await queue.recordExecutionBriefProposal!(proposal, {internal: true}, {visible: true}, "a".repeat(64));
  expect(rpc.mock.calls).toEqual([
    ["worker_load_execution_brief_proposal_v1", {p_job_id: job.job_id, p_capability_token: job.capability_token}],
    ["worker_record_execution_brief_proposal_v1", {p_job_id: job.job_id, p_capability_token: job.capability_token, p_internal_snapshot: {internal: true}, p_visible_snapshot: {visible: true}, p_expected_input_fingerprint: "a".repeat(64), p_plan: null}],
  ]);
});
