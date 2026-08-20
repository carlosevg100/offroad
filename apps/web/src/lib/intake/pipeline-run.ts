import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database, Json} from "@/types/database";

import type {IntakeErrorCode} from "./types";

/**
 * The missing link between "the user asked for processing" and "the worker has a job"
 * (P1 plan §13, handoff §5 item 4).
 *
 * `begin_processing_run` builds the job payload from the document row, but two fields it
 * cannot produce: the URL the worker downloads the file from and the URL it PUTs the parsed
 * layer to. Storage links can only be signed by someone Storage trusts, and the worker is
 * deliberately not that someone — it holds no service-role key and no storage credential, so
 * the app mints both links as the authenticated user and they travel inside the job payload,
 * a column organization members cannot read.
 *
 * The links are short-lived on purpose. A leaked payload is worth minutes, not forever, and
 * a worker that sits on a job past its lease has to be handed fresh links rather than reuse
 * stale ones.
 *
 * Which organizations get this is decided per organization, in the database
 * (`organizations.pipeline_enabled`): promotion is gradual and reversible, and it is not a
 * deployment. Everyone else stays on the content-hash-verified fixture.
 */

/** Pipeline contract version recorded on the run. Must match what the worker reports. */
export const PIPELINE_VERSION = "f1-2026.08.19";

/**
 * How long the job's links live. One hour covers a cold worker (ClamAV loading signatures,
 * LibreOffice starting) plus a large scanned PDF, and expires well before a lease could.
 */
export const PIPELINE_LINK_TTL_SECONDS = 3_600;

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
export function pipelineEnabledFor(organization: {pipeline_enabled?: boolean | null} | null | undefined): boolean {
  return organization?.pipeline_enabled === true;
}

/**
 * Where a document's parsed layer is stored: `<organization>/<session>/<document>/<attempt>`.
 *
 * The first two segments are what the Storage policies read (`private.storage_organization_id`
 * and `private.storage_opportunity_id` take folder 1 and folder 2), so the path itself is what
 * keeps one tenant from writing into another's prefix.
 *
 * The last segment is unique per attempt rather than per document version. That is what lets
 * the bucket keep insert-only permissions: a reprocess writes a new object and repoints the
 * `document_layers` row at it, so nobody needs the right to overwrite, and the layer a fact
 * was cited from is still there to be read.
 */
export function layerObjectPath(input: {
  organizationId: string;
  sessionId: string;
  sourceDocumentId: string;
  attemptId: string;
}): string {
  return `${input.organizationId}/${input.sessionId}/${input.sourceDocumentId}/${input.attemptId}.json`;
}

export type PipelineDocument = {
  id: string;
  object_path: string;
};

export type SignedDocumentEntry = {
  source_document_id: string;
  download_url: string;
  layer_object_path: string;
  layer_upload_url: string;
};

/**
 * Signs both links for every document of the session.
 *
 * All-or-nothing on purpose: a run started with half its documents unreachable would report
 * failures that say nothing about the documents themselves. If any link cannot be signed the
 * caller is told before a run exists.
 */
export async function signPipelineDocuments(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  documents: PipelineDocument[];
  newAttemptId?: () => string;
}): Promise<Outcome<SignedDocumentEntry[]>> {
  const newAttemptId = input.newAttemptId ?? (() => crypto.randomUUID());
  const entries: SignedDocumentEntry[] = [];

  for (const document of input.documents) {
    const download = await input.supabase.storage
      .from("opportunity-documents")
      .createSignedUrl(document.object_path, PIPELINE_LINK_TTL_SECONDS);
    if (download.error || !download.data?.signedUrl) return {ok: false, error: "processing"};

    const objectPath = layerObjectPath({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      sourceDocumentId: document.id,
      attemptId: newAttemptId(),
    });
    const upload = await input.supabase.storage.from("document-layers").createSignedUploadUrl(objectPath);
    if (upload.error || !upload.data?.signedUrl) return {ok: false, error: "processing"};

    entries.push({
      source_document_id: document.id,
      download_url: download.data.signedUrl,
      layer_object_path: objectPath,
      layer_upload_url: upload.data.signedUrl,
    });
  }

  return {ok: true, value: entries};
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
  newAttemptId?: () => string;
}): Promise<Outcome<ProcessingRunStarted>> {
  const {data: documents, error: documentsError} = await input.supabase
    .from("source_documents")
    .select("id, object_path")
    .eq("organization_id", input.organizationId)
    .eq("intake_session_id", input.sessionId)
    .order("created_at");
  if (documentsError) return {ok: false, error: "processing"};
  if (!documents?.length) return {ok: false, error: "documents"};

  const signed = await signPipelineDocuments({
    supabase: input.supabase,
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    documents,
    ...(input.newAttemptId ? {newAttemptId: input.newAttemptId} : {}),
  });
  if (!signed.ok) return signed;

  const {data, error} = await input.supabase.rpc("begin_processing_run", {
    p_organization_id: input.organizationId,
    p_session_id: input.sessionId,
    p_trigger: input.trigger,
    p_documents: signed.value as unknown as Json,
    p_pipeline_version: PIPELINE_VERSION,
    ...(input.budget ? {p_budget: input.budget as unknown as Json} : {}),
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
