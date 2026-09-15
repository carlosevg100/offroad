import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database, Json} from "@/types/database";

import type {IntakeErrorCode} from "./types";

/**
 * Opens work with document IDs. The database binds the responsible person and authorization
 * revision; the signed-in worker reads Storage only while that job remains authorized.
 * The browser never mints bearer access for background execution.
 */

/** Pipeline contract version recorded on the run. Must match what the worker reports. */
export const PIPELINE_VERSION = "f2-2026.08.24";

/**
 * Economic contract for a production case. The database persists and distributes it to jobs;
 * the worker enforces the smaller of these values and its environment ceiling.
 */
export const DEFAULT_RUN_BUDGET = {
  max_cost_usd: 5,
  max_calls: 160,
  document_max_cost_usd: 0.75,
  document_max_calls: 8,
  case_max_cost_usd: 1,
  case_max_calls: 4,
} as const;

export type ProcessingTrigger = "upload" | "manual" | "answer" | "reprocess" | "document_removed";

export type ProcessingRunStarted = {
  processingRunId: string;
  runNo: number;
  jobIds: string[];
};

type Outcome<T> = {ok: true; value: T} | {ok: false; error: IntakeErrorCode};

/**
 * Which extractor this organization gets.
 *
 * Per organization, in the database, because promotion is gradual: one tenant moves to the
 * pipeline, its runs are watched, and the switch goes back if they are not good enough — none
 * of which should require a deployment. The column is readable by the organization's members
 * (the review screen can honestly say which extractor produced a candidate) and writable by
 * nobody through the Data API, so a tenant cannot promote itself.
 *
 * Off is the safe default and stays the default: a run with no worker behind it parks the
 * intake session in `processing`, trading a working journey for one that hangs.
 */
export function pipelineEnabledFor(organization: {
  pipeline_enabled?: boolean | null;
  /**
   * The generated database type is intentionally `string` because the rollout states are
   * protected by a SQL CHECK rather than a Postgres enum. Treat an unknown future value as
   * disabled here so an application/database version skew fails closed.
   */
  rollout_state?: string | null;
} | null | undefined): boolean {
  if (organization?.rollout_state) {
    return organization.pipeline_enabled === true
      && ["shadow", "canary", "active"].includes(organization.rollout_state);
  }
  // Backward-compatible only for the rolling-deploy window in which application code may reach
  // a project before the rollout-policy migration. Once the row exists, policy is authoritative.
  return organization?.pipeline_enabled === true;
}

/** Documents are references; storage locations and authority are resolved by the database. */
export type PipelineDocument = {id: string; object_path: string; processing_status?: string | null};
export function preparePipelineDocuments(documents: PipelineDocument[]): Array<{source_document_id: string}> {
  return documents.map((document) => ({source_document_id: document.id}));
}

/**
 * Opens a processing run for the session's documents and queues one job per document.
 *
 * Tenant scope comes from the caller's verified session, never from a form field, and the
 * command refuses a document that does not belong to the session (`source_document_not_in_session`).
 */
export async function startProcessingRun(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  trigger: ProcessingTrigger;
  budget?: Record<string, number>;
}): Promise<Outcome<ProcessingRunStarted>> {
  const [{data: documents, error: documentsError}, {data: session, error: sessionError}] = await Promise.all([
    input.supabase
      .from("source_documents")
      .select("id, object_path, processing_status")
      .eq("organization_id", input.organizationId)
      .eq("intake_session_id", input.sessionId)
      .order("created_at"),
    input.supabase
      .from("document_intake_sessions")
      .select("pipeline_version")
      .eq("organization_id", input.organizationId)
      .eq("id", input.sessionId)
      .maybeSingle(),
  ]);
  if (documentsError) return {ok: false, error: "processing"};
  if (sessionError || !session) return {ok: false, error: "session"};
  const sourceDocuments = documents ?? [];

  // Reuse is only legal under the same pipeline contract. A ready immutable document with the
  // same version already has a verified layer and candidates; paying a provider to read it
  // again would change neither evidence nor answer. A pipeline-version change is an explicit
  // full rebuild and schedules every document.
  const documentsToProcess = session.pipeline_version === PIPELINE_VERSION
    ? sourceDocuments.filter((document) => document.processing_status !== "ready")
    : sourceDocuments;

  const documentsForRun = preparePipelineDocuments(documentsToProcess);

  const {data, error} = await input.supabase.rpc("begin_processing_run", {
    p_organization_id: input.organizationId,
    p_session_id: input.sessionId,
    p_trigger: input.trigger,
    p_documents: documentsForRun as unknown as Json,
    p_pipeline_version: PIPELINE_VERSION,
    p_budget: (input.budget ?? DEFAULT_RUN_BUDGET) as unknown as Json,
  });
  // The ceiling is not a processing failure, and telling somebody to try again when trying
  // again cannot work is the kind of small dishonesty that costs a user an afternoon.
  if (error?.message.includes("model_month_ceiling_reached")) return {ok: false, error: "capacity"};
  if (error || !data) return {ok: false, error: "processing"};

  return {ok: true, value: readRunResult(data)};
}

/** Reads what `begin_processing_run` returns, without trusting its shape. */
export function readRunResult(data: Json): ProcessingRunStarted {
  const result = (typeof data === "object" && data !== null && !Array.isArray(data) ? data : {}) as Record<string, Json | undefined>;
  return {
    processingRunId: typeof result.processing_run_id === "string" ? result.processing_run_id : "",
    runNo: typeof result.run_no === "number" ? result.run_no : 0,
    jobIds: Array.isArray(result.job_ids) ? result.job_ids.filter((id): id is string => typeof id === "string") : [],
  };
}
