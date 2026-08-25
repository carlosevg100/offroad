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
export const caseAnalysisJobSchema = claimedJobBase.extend({
  kind: z.literal("case_analysis"),
  payload: z.object({
    locale: z.enum(["pt-BR", "en-US"]).optional(),
    execution_id: z.uuid().optional(),
    execution_mode: z.enum(["primary", "shadow", "replay"]).default("primary"),
    baseline_execution_id: z.uuid().optional(),
  }),
});
export const claimedJobSchema = z.discriminatedUnion("kind", [documentJobSchema, caseAnalysisJobSchema]);
export type ClaimedJob = z.infer<typeof claimedJobSchema>;
export type DocumentJob = z.infer<typeof documentJobSchema>;
export type CaseAnalysisJob = z.infer<typeof caseAnalysisJobSchema>;

const noJobSchema = z.object({
  claimed: z.literal(false),
  poisoned_job_id: z.uuid().optional(),
});

export type StageStatus = "started" | "succeeded" | "failed" | "skipped";

export type QueueClient = {
  claim(): Promise<ClaimedJob | null>;
  heartbeat(job: ClaimedJob): Promise<void>;
  writeStage(job: ClaimedJob, stage: string, status: StageStatus, detail?: unknown, usage?: Record<string, number>): Promise<void>;
  recordDocument(job: ClaimedJob, input: {scanResult?: unknown; profile?: unknown; layer?: unknown}): Promise<void>;
  recordCandidates(job: ClaimedJob, candidates: unknown[]): Promise<{written: number; replaced: number}>;
  recordRetrievalChunks(job: DocumentJob, chunks: unknown[]): Promise<{written: number; sourceDocumentId: string}>;
  loadCaseInput(job: CaseAnalysisJob): Promise<unknown>;
  loadRetrievalContext(job: CaseAnalysisJob, input: {
    query: string;
    allowedFundIds?: string[];
    precedentPurpose?: string;
    limit?: number;
  }): Promise<unknown>;
  recordCaseSnapshot(job: CaseAnalysisJob, manifest: unknown, state: unknown): Promise<string>;
  recordControlledExecution(job: CaseAnalysisJob, report: unknown, manifest: unknown, comparison?: unknown): Promise<string>;
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
      return call("worker_freeze_case_input", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_live_input: liveInput,
      });
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

    async recordCaseSnapshot(job, manifest, state) {
      const data = await call("worker_record_case_snapshot", {
        p_job_id: job.job_id,
        p_capability_token: job.capability_token,
        p_manifest: manifest,
        p_case_state: state,
      });
      return String(data);
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
