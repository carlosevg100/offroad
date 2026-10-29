import type {UploadResult} from "@/lib/intake/upload-client";
import type {AdvisorActionError} from "./advisor-action-error";

/** Registered siblings and confirmed duplicates can advance even if another upload failed.
 * Only stable error codes cross back to the UI; a failed processing call preserves the work. */
export async function finishAdvisorDocumentUpload(
  upload: UploadResult,
  startProcessing: () => Promise<{ok: true} | {ok: false; error: AdvisorActionError}>,
): Promise<{failedFiles: string[]; error: AdvisorActionError | "upload" | null}> {
  const failedFiles = upload.failed.map((file) => file.original_name);
  if (upload.uploaded.length === 0 && upload.duplicateCount === 0) return {failedFiles, error: "upload"};
  try {
    const processing = await startProcessing();
    if (!processing.ok) return {failedFiles, error: processing.error};
  } catch {
    return {failedFiles, error: "processing"};
  }
  return {failedFiles, error: upload.failure ? "upload" : null};
}
