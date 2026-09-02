import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";

/**
 * The worker's only vocabulary against the database: the seven commands created in
 * `20260818171246`. It never issues a plain insert or update, never holds a service-role key,
 * and never passes an `organization_id` — scope always comes from the job it claimed
 * (P1 plan §13.4, ADR 0008 decision 7).
 *
 * Two credentials, neither sufficient alone: the hashed worker token claims a job, and the
 * capability token issued at claim time authorises everything after it. The capability dies
 * with the lease, so a leaked one is worthless minutes later.
 */
export const jobPayloadSchema = z.object({
  source_document_id: z.uuid(),
  document_version: z.number().int().positive().default(1),
  original_name: z.string().min(1),
  mime_type: z.string().min(1).optional(),
  byte_size: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  object_path: z.string().min(1),
  download_url: z.url().optional(),
  layer_object_path: z.string().min(1).optional(),
  layer_upload_url: z.url().optional(),
  locale: z.string().optional(),
  model_budget: z.object({
    max_cost_usd: z.number().positive(),
    max_calls: z.number().int().positive(),
  }).optional(),
});
export type JobPayload = z.infer<typeof jobPayloadSchema>;

const claimedJobBase = z.object({
  claimed: z.literal(true),
  job_id: z.uuid(),
  capability_token: z.string().min(32),
  lease_expires_at: z.string(),
  attempt: z.number().int().positive(),
  organization_id: z.uuid(),
  intake_session_id: z.uuid(),
  processing_run_id: z.uuid(),
});
export const documentJobSchema = claimedJobBase.extend({
  kind: z.literal("document_pipeline"),
  payload: jobPayloadSchema,
});
const analysisJobPayloadSchema = z.object({
    locale: z.enum(["pt-BR", "en-US"]).optional(),
    execution_id: z.uuid().optional(),
    execution_mode: z.enum(["primary", "shadow", "replay"]).default("primary"),
    analysis_scope: z.enum(["preliminary_understanding", "full_case"]).default("full_case"),
    baseline_execution_id: z.uuid().optional(),
    model_budget: z.object({
      max_cost_usd: z.number().positive(),
      max_calls: z.number().int().positive(),
    }).optional(),
  });
export const caseAnalysisJobSchema = claimedJobBase.extend({
  kind: z.literal("case_analysis"),
  payload: analysisJobPayloadSchema.extend({analysis_scope: z.literal("full_case")}),
});
export const preliminaryAnalysisJobSchema = claimedJobBase.extend({
  kind: z.literal("preliminary_analysis"),
  payload: analysisJobPayloadSchema.extend({analysis_scope: z.literal("preliminary_understanding")}),
});
export const agentOperationBriefJobSchema = claimedJobBase.extend({
  kind: z.literal("agent_operation_brief"),
  payload: z.object({
    message_id: z.uuid(),
    locale: z.enum(["pt-BR", "en-US"]),
  }),
});
export const capitalProjectAnalysisJobSchema = claimedJobBase.extend({
  kind: z.literal("capital_project_analysis"),
  payload: z.object({
    analysis_scope: z.enum(["origination_thesis", "company_debt_view", "capital_planning"]),
    locale: z.enum(["pt-BR", "en-US"]),
    capital_project_id: z.uuid(),
    capital_project_plan_id: z.uuid(),
    capital_project_brief_id: z.uuid(),
    capital_task_ids: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).min(1).max(80),
    capital_artifact_required: z.literal(true),
    revision_of_artifact_id: z.uuid().optional(),
    correction_decision_id: z.uuid().optional(),
    trigger_event: z.record(z.string(), z.unknown()).default({}),
    model_budget: z.object({
      max_cost_usd: z.number().positive(),
      max_calls: z.number().int().positive(),
    }),
  }).refine((payload) => Boolean(payload.revision_of_artifact_id) === Boolean(payload.correction_decision_id), {
    message: "revision artifact and decision must be supplied together",
  }),
});
export const claimedJobSchema = z.discriminatedUnion("kind", [
  documentJobSchema, preliminaryAnalysisJobSchema, caseAnalysisJobSchema,
  agentOperationBriefJobSchema, capitalProjectAnalysisJobSchema,
]);
export type ClaimedJob = z.infer<typeof claimedJobSchema>;
export type DocumentJob = z.infer<typeof documentJobSchema>;
export type FullCaseAnalysisJob = z.infer<typeof caseAnalysisJobSchema>;
export type PreliminaryAnalysisJob = z.infer<typeof preliminaryAnalysisJobSchema>;
export type CaseAnalysisJob = FullCaseAnalysisJob | PreliminaryAnalysisJob;
export type AgentOperationBriefJob = z.infer<typeof agentOperationBriefJobSchema>;
export type CapitalProjectAnalysisJob = z.infer<typeof capitalProjectAnalysisJobSchema>;

const noJobSchema = z.object({
  claimed: z.literal(false),
  poisoned_job_id: z.uuid().optional(),
});

export type StageStatus = "started" | "succeeded" | "failed" | "skipped";
export type CapitalTaskFinishStatus = "waiting_user" | "blocked" | "succeeded" | "failed" | "cancelled";

export type QueueClient = {
  claim(): Promise<ClaimedJob | null>;
  heartbeat(job: ClaimedJob): Promise<void>;
  writeStage(job: ClaimedJob, stage: string, status: StageStatus, detail?: unknown, usage?: Record<string, number>): Promise<void>;
  startCapitalTask(job: ClaimedJob, input: {
    taskId: string;
    executorKey: string;
    executorVersion: string;
    inputFingerprint: string;
    contextManifest?: unknown;
  }): Promise<string>;
  recordCapitalProjectArtifact(job: ClaimedJob, input: {
    taskRunId: string;
    artifactType: string;
    schemaVersion: string;
    status: "draft" | "pending_confirmation";
    inputFingerprint: string;
    content: unknown;
    evidenceRefs?: unknown[];
    dependencies?: unknown[];
  }): Promise<{id: string; artifactFingerprint: string; artifactVersion: number; replayed: boolean}>;
  finishCapitalTask(job: ClaimedJob, input: {
    taskRunId: string;
    status: CapitalTaskFinishStatus;
    outputReference?: unknown;
    outputFingerprint?: string;
    qualityResults?: unknown[];
    usage?: Record<string, unknown>;
    error?: unknown;
  }): Promise<string>;
  recordDocument(job: ClaimedJob, input: {scanResult?: unknown; profile?: unknown; layer?: unknown}): Promise<void>;
  recordCandidates(job: ClaimedJob, candidates: unknown[]): Promise<{written: number; replaced: number}>;
  recordRetrievalChunks(job: DocumentJob, chunks: unknown[]): Promise<{written: number; sourceDocumentId: string}>;
  recordReceivablesEvidence(job: DocumentJob, input: {
    contentKind: "document_layer" | "nfe_archive";
    schemaVersion: string;
    sourceSha256: string;
    contentSha256: string;
    payloadSha256: string;
    uncompressedBytes: number;
    payloadBase64: string;
  }): Promise<{written: boolean; replayed: boolean; source_document_id: string; content_sha256: string}>;
  loadIntakeEvents(job: DocumentJob): Promise<unknown[]>;
  recordIntakeRequestLadders(job: DocumentJob, events: unknown[]): Promise<void>;
  recordAnalysisScopeSuggestions(job: DocumentJob, eventId: string, suggestions: unknown[]): Promise<unknown>;
  documentAdvisorAuthorization(job: DocumentJob, eventId: string): Promise<unknown>;
  loadPreliminaryInput(job: PreliminaryAnalysisJob): Promise<unknown>;
  loadCaseInput(job: FullCaseAnalysisJob): Promise<unknown>;
  loadRetrievalContext(job: FullCaseAnalysisJob, input: {
    query: string;
    allowedFundIds?: string[];
    precedentPurpose?: string;
    limit?: number;
  }): Promise<unknown>;
  recordPublicResearch(job: CaseAnalysisJob | CapitalProjectAnalysisJob, plan: unknown, result: unknown): Promise<string>;
  loadPublicResearchCache?(job: CapitalProjectAnalysisJob, queryIds: string[]): Promise<unknown>;
  storePublicResearchCache?(job: CapitalProjectAnalysisJob, entries: unknown[]): Promise<unknown>;
  recordPreliminaryUnderstanding(job: PreliminaryAnalysisJob, input: {
    inputFingerprint: string;
    payload: unknown;
  }): Promise<string>;
  recordDealStateObject(job: FullCaseAnalysisJob, input: {
    objectType: string;
    status: string;
    inputFingerprint: string;
    payload: unknown;
    dependencies?: unknown[];
  }): Promise<string>;
  recordCaseSnapshot(job: FullCaseAnalysisJob, manifest: unknown, state: unknown): Promise<string>;
  recordOperatingControlSnapshot(job: FullCaseAnalysisJob, input: {
    scopeId: string;
    requestedUse: "internal_decision";
    inputFingerprint: string;
    binding: unknown;
    snapshot: unknown;
  }): Promise<{
    id: string;
    allowed: boolean;
    blockers: string[];
    warnings: string[];
    decisionFingerprint: string;
    replayed: boolean;
  }>;
  recordControlledExecution(job: FullCaseAnalysisJob, report: unknown, manifest: unknown, comparison?: unknown): Promise<string>;
  loadAgentContext(job: AgentOperationBriefJob): Promise<unknown>;
  loadCapitalProjectContext(job: CapitalProjectAnalysisJob): Promise<unknown>;
  recordAgentResponse(
    job: AgentOperationBriefJob,
    assistantMessageId: string,
    response: unknown,
    proposal?: unknown,
    activation?: unknown,
  ): Promise<unknown>;
  recordAgentFailure(job: AgentOperationBriefJob, errorCode: string): Promise<void>;
  completeAdvisorSpecializedJob(job: CapitalProjectAnalysisJob, input: {
    completionMessageId: string;
    artifactId: string;
    artifactFingerprint: string;
    content: string;
    result: unknown;
  }): Promise<void>;
  complete(job: ClaimedJob, result: unknown): Promise<void>;
  fail(job: ClaimedJob, error: unknown, options?: {retryable?: boolean; retryInSeconds?: number}): Promise<void>;
};

export function createQueueClient(
  supabase: SupabaseClient,
  options: {workerToken: string; leaseSeconds: number},
): QueueClient {
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const {data, error} = await supabase.rpc(name, args);
    if (error) throw new Error(`${name} failed: ${error.message}`);
    return data;
  };

  return {
    async claim() {
      const data = await call("worker_claim_job", {
        p_worker_token: options.workerToken,
        p_lease_seconds: options.leaseSeconds,
      });

      const empty = noJobSchema.safeParse(data);
      if (empty.success) {
        if (empty.data.poisoned_job_id) {
          throw new PoisonedJobError(empty.data.poisoned_job_id);
        }
        return null;
      }

      const claimed = claimedJobSchema.safeParse(data);
      if (!claimed.success) {
        // A payload we cannot understand is a bug in the app that queued it, not something to
        // guess our way through.
        throw new Error(`worker_claim_job returned an unusable job: ${claimed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
      }
      return claimed.data;
    },

    async heartbeat(job) {
      await call("worker_heartbeat", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_lease_seconds: options.leaseSeconds,
      });
    },

    async writeStage(job, stage, status, detail, usage) {
      await call("worker_write_stage_result", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_stage: stage,
        p_status: status,
        p_detail: detail ?? {},
        p_usage: usage ?? {},
      });
    },

    async startCapitalTask(job, input) {
      const data = await call("worker_start_capital_project_task", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_task_id: input.taskId,
        p_executor_key: input.executorKey,
        p_executor_version: input.executorVersion,
        p_input_fingerprint: input.inputFingerprint,
        p_context_manifest: input.contextManifest ?? {},
      });
      return z.uuid().parse(data);
    },

    async recordCapitalProjectArtifact(job, input) {
      const data = await call("worker_record_capital_project_artifact", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_task_run_id: input.taskRunId,
        p_artifact_type: input.artifactType,
        p_schema_version: input.schemaVersion,
        p_status: input.status,
        p_input_fingerprint: input.inputFingerprint,
        p_content: input.content,
        p_evidence_refs: input.evidenceRefs ?? [],
        p_dependencies: input.dependencies ?? [],
      });
      const parsed = z.object({
        id: z.uuid(),
        artifact_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        artifact_version: z.number().int().positive(),
        replayed: z.boolean(),
      }).parse(data);
      return {
        id: parsed.id,
        artifactFingerprint: parsed.artifact_fingerprint,
        artifactVersion: parsed.artifact_version,
        replayed: parsed.replayed,
      };
    },

    async finishCapitalTask(job, input) {
      const data = await call("worker_finish_capital_project_task", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_task_run_id: input.taskRunId,
        p_status: input.status,
        p_output_reference: input.outputReference ?? null,
        p_output_fingerprint: input.outputFingerprint ?? null,
        p_quality_results: input.qualityResults ?? [],
        p_usage: input.usage ?? {},
        p_error: input.error ?? null,
      });
      return z.uuid().parse(data);
    },

    async recordDocument(job, input) {
      await call("worker_record_document_result", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_scan_result: input.scanResult ?? null,
        p_profile: input.profile ?? null,
        p_layer: input.layer ?? null,
      });
    },

    async recordCandidates(job, candidates) {
      const data = await call("worker_record_candidates", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_candidates: candidates,
      });
      const result = (data ?? {}) as {written?: number; replaced?: number};
      return {written: result.written ?? 0, replaced: result.replaced ?? 0};
    },

    async recordRetrievalChunks(job, chunks) {
      const data = await call("worker_record_retrieval_chunks", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_chunks: chunks,
      });
      const result = (data ?? {}) as {written?: number; source_document_id?: string};
      return {
        written: result.written ?? 0,
        sourceDocumentId: result.source_document_id ?? job.payload.source_document_id,
      };
    },

    async recordReceivablesEvidence(job, input) {
      const data = await call("worker_record_receivables_evidence", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_content_kind: input.contentKind,
        p_schema_version: input.schemaVersion,
        p_source_sha256: input.sourceSha256,
        p_content_sha256: input.contentSha256,
        p_payload_sha256: input.payloadSha256,
        p_uncompressed_bytes: input.uncompressedBytes,
        p_payload_base64: input.payloadBase64,
      });
      return z.object({
        written: z.boolean(),
        replayed: z.boolean(),
        source_document_id: z.uuid(),
        content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }).parse(data);
    },

    async loadIntakeEvents(job) {
      const data = await call("worker_load_intake_events", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
      });
      if (!Array.isArray(data)) throw new Error("worker_load_intake_events returned a non-array payload");
      return data;
    },

    async recordIntakeRequestLadders(job, events) {
      await call("worker_record_intake_request_ladders", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_events: events,
      });
    },

    async recordAnalysisScopeSuggestions(job, eventId, suggestions) {
      return call("worker_record_analysis_scope_suggestions", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_event_id: eventId,
        p_suggestions: suggestions,
      });
    },

    async documentAdvisorAuthorization(job, eventId) {
      return call("worker_document_advisor_authorization", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_event_id: eventId,
      });
    },

    async loadPreliminaryInput(job) {
      return call("worker_load_preliminary_input_v2", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
      });
    },

    async loadCaseInput(job) {
      const args = {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
      };
      const [input, decisions] = await Promise.all([
        call("worker_load_case_input", args),
        call("worker_load_claim_decisions", args),
      ]);
      if (!input || typeof input !== "object" || Array.isArray(input)) return input;
      const liveInput = {...input, claim_decisions: decisions};
      const frozen = await call("worker_freeze_case_input", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_live_input: liveInput,
      });
      if (!frozen || typeof frozen !== "object" || Array.isArray(frozen)) return frozen;
      const priorCaseReport = await call("worker_load_prior_case_report", args);
      return {...frozen, prior_case_report: priorCaseReport};
    },

    async loadRetrievalContext(job, input) {
      return call("worker_load_retrieval_context", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_query: input.query,
        p_allowed_fund_ids: input.allowedFundIds ?? [],
        p_precedent_purpose: input.precedentPurpose ?? null,
        p_limit: input.limit ?? 20,
      });
    },
    async recordPublicResearch(job, plan, result) {
      const data = await call("worker_record_public_research", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_plan: plan,
        p_result: result,
      });
      return z.uuid().parse(data);
    },
    async loadPublicResearchCache(job, queryIds) {
      return call("worker_load_public_research_cache", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_query_ids: queryIds,
      });
    },
    async storePublicResearchCache(job, entries) {
      return call("worker_store_public_research_cache", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_entries: entries,
      });
    },

    async recordPreliminaryUnderstanding(job, input) {
      const data = await call("worker_record_preliminary_understanding", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_input_fingerprint: input.inputFingerprint,
        p_payload: input.payload,
      });
      return z.uuid().parse(data);
    },

    async recordDealStateObject(job, input) {
      const data = await call("worker_record_deal_state_object", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_object_type: input.objectType,
        p_status: input.status,
        p_input_fingerprint: input.inputFingerprint,
        p_payload: input.payload,
        p_dependencies: input.dependencies ?? [],
      });
      return z.uuid().parse(data);
    },

    async recordCaseSnapshot(job, manifest, state) {
      const data = await call("worker_record_case_snapshot", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_manifest: manifest,
        p_case_state: state,
      });
      return String(data);
    },

    async recordOperatingControlSnapshot(job, input) {
      const data = await call("worker_record_operating_control_snapshot_v1", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_scope_id: input.scopeId,
        p_requested_use: input.requestedUse,
        p_input_fingerprint: input.inputFingerprint,
        p_binding: input.binding,
        p_snapshot: input.snapshot,
      });
      return z.object({
        id: z.uuid(),
        allowed: z.boolean(),
        blockers: z.array(z.string()),
        warnings: z.array(z.string()),
        decisionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        replayed: z.boolean(),
      }).parse(data);
    },

    async recordControlledExecution(job, report, manifest, comparison) {
      const data = await call("worker_record_controlled_execution", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_report: report,
        p_manifest: manifest,
        p_comparison: comparison ?? null,
      });
      return String(data);
    },

    async loadAgentContext(job) {
      return call("worker_load_agent_context", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
      });
    },

    async loadCapitalProjectContext(job) {
      return call("worker_load_capital_project_context_v3", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
      });
    },

    async recordAgentResponse(job, assistantMessageId, response, proposal, activation) {
      return call("worker_record_agent_response_and_activate_v2", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_assistant_message_id: assistantMessageId,
        p_response: response,
        p_proposal: proposal ?? null,
        p_activation: activation ?? null,
      });
    },

    async recordAgentFailure(job, errorCode) {
      await call("worker_record_agent_failure", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_error_code: errorCode,
      });
    },

    async completeAdvisorSpecializedJob(job, input) {
      await call("worker_complete_advisor_specialized_job_v2", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_completion_message_id: input.completionMessageId,
        p_artifact_id: input.artifactId,
        p_artifact_fingerprint: input.artifactFingerprint,
        p_content: input.content,
        p_result: input.result ?? {},
      });
    },

    async complete(job, result) {
      await call("worker_complete_job", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_result: result ?? {},
      });
    },

    async fail(job, error, opts) {
      await call("worker_fail_job", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_error: error ?? {},
        p_retryable: opts?.retryable ?? true,
        p_retry_in_seconds: opts?.retryInSeconds ?? 60,
      });
    },
  };
}

export class PoisonedJobError extends Error {
  readonly jobId: string;
  constructor(jobId: string) {
    super(`job ${jobId} exceeded its attempts and was marked poison`);
    this.name = "PoisonedJobError";
    this.jobId = jobId;
  }
}

/**
 * Keeps the lease alive while a long document is being read. Stops on its own when the work
 * finishes or throws, so a crashed job's lease expires and another worker picks it up.
 */
export function startHeartbeat(queue: QueueClient, job: ClaimedJob, everyMs: number, onError: (error: Error) => void): () => void {
  const timer = setInterval(() => {
    queue.heartbeat(job).catch((error: Error) => onError(error));
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
