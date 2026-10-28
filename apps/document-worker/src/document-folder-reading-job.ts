import {createHash} from "node:crypto";
import {documentLayerSchema} from "@offroad/document-intelligence";
import {providerDataPolicyVersion, type ModelGateway} from "@offroad/model-gateway";
import {z} from "zod";
import {documentFolderReadingExtractionContract, readDocumentFolderFile, type DocumentFolderReadingOutcome} from "./document-folder-premises-proposal";
import {describeJobFailure} from "./job-failure";
import {safeModelSpend} from "./model-call-log";
import type {DocumentFolderReadingJob, QueueClient} from "./queue";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** worker_document_folder_reading_input_v1: the file the job was queued for, its latest ready layer and the registry. */
export const documentFolderReadingInputSchema = z.object({sourceDocumentId: z.uuid(), sha256: hash, mimeType: z.string().max(200).nullable(),
  readerVersion: z.string(), contextFingerprint: hash, context: z.object({registry: z.array(z.object({id: z.string(), label: z.string(), groupLabel: z.string()})).max(200)}),
  layerObjectPath: z.string().min(1).max(1024).nullable(), layerSha256: hash.nullable()});

/** Reads one file of a folder (ficha C09) by content, as the conversation's reading job: the stored layer of the bytes it
 * was queued for, checked against the hash the database recorded, then one extraction under this job's own budget. The
 * reading or its refusal by name is recorded once; a model failure is retried once and then recorded as refused, so the
 * conversation never waits on a reading that will not come. Nothing of the file's content reaches the job's error record. */
export async function processDocumentFolderReadingJob(job: DocumentFolderReadingJob, dependencies: {
  queue: QueueClient; gateway: ModelGateway; log: (event: string, detail?: Record<string, unknown>) => void;
}): Promise<{status: "succeeded" | "failed"}> {
  const {queue, gateway, log} = dependencies;
  const finish = async (outcome: DocumentFolderReadingOutcome) => {
    const {recorded} = await queue.recordDocumentFolderReading!(job, outcome.status === "ready" ? {status: "ready", reading: outcome.reading} : outcome);
    await queue.complete(job, {status: outcome.status, recorded, spend: safeModelSpend(gateway.spent())});
    log("document_folder_reading.finished", {job: job.job_id, status: outcome.status, ...(outcome.status === "refused" ? {refusal: outcome.refusalCode} : {}), recorded});
    return {status: "succeeded" as const};
  };
  try {
    if (!queue.loadDocumentFolderReadingInput || !queue.downloadDocumentFolderLayer || !queue.recordDocumentFolderReading) throw new Error("document_folder_reading_unavailable");
    const input = documentFolderReadingInputSchema.parse(await queue.loadDocumentFolderReadingInput(job));
    if (input.sha256 !== job.payload.sha256 || input.readerVersion !== job.payload.reader_version || input.contextFingerprint !== job.payload.context_fingerprint)
      throw new Error("document_folder_reading_scope_mismatch");
    if (!input.layerObjectPath || !input.layerSha256) return await finish({status: "refused", refusalCode: "unreadable"});
    const bytes = await queue.downloadDocumentFolderLayer(job, input.layerObjectPath);
    // Only the bytes the database recorded for the layer are read.
    if (createHash("sha256").update(bytes).digest("hex") !== input.layerSha256) throw new Error("document_folder_layer_changed");
    const layer = documentLayerSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    let modelFailed = false;
    const outcome = await readDocumentFolderFile({mimeType: input.mimeType, layer}, input.context, async (request) => {
      try {
        return (await gateway.complete({...documentFolderReadingExtractionContract, input: [{type: "text", text: request.text}],
          dataHandling: {classification: "restricted", purpose: "case_analysis", requiredPolicyVersion: providerDataPolicyVersion},
          metadata: {jobId: job.job_id, sourceDocumentId: input.sourceDocumentId}})).output;
      } catch { modelFailed = true; return null; }
    });
    // A provider failure is retried once; the last attempt records the refusal instead of leaving the file unread forever.
    if (modelFailed && job.attempt < 2) throw new Error("document_folder_reading_model_failed");
    return await finish(outcome);
  } catch (error) {
    const code = error instanceof Error && /^document_folder_[a-z_]+$/.test(error.message) ? error.message : "document_folder_reading_failed";
    log("document_folder_reading.failed", {job: job.job_id, code});
    // The last attempt records the refusal by name, so the conversation names the file instead of waiting on it.
    if (job.attempt >= 2 && code !== "document_folder_reading_unavailable" && code !== "document_folder_reading_scope_mismatch") {
      try { return await finish({status: "refused", refusalCode: "reading"}); } catch { /* the failure below is reported instead */ }
    }
    const retryable = code === "document_folder_reading_model_failed" || code === "document_folder_reading_failed";
    await queue.fail(job, describeJobFailure(new Error(code), {code, stage: "document_folder_reading", retryable, spend: safeModelSpend(gateway.spent())}), {retryable});
    return {status: "failed"};
  }
}
