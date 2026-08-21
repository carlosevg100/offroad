import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database} from "@/types/database";

import type {IntakeDocumentSummary} from "./types";

/** Documents are stored under `{organizationId}/{scopeId}/…`; the scope is an intake session or an opportunity. */
export type UploadScope = {kind: "session"; sessionId: string} | {kind: "opportunity"; opportunityId: string};

/**
 * What a company may send, which is everything the engine can read.
 *
 * The founder's decision (18/08/2026) is that the product accepts whatever format the company
 * already has, because a mid-market company keeps its debt map in whatever its accountant used
 * and telling it to convert the file first is telling it to go away. `@offroad/document-parsers`
 * was built for exactly that: it reads OpenDocument, the binary Excel dialects and dBase
 * directly, and converts the older Microsoft and WordPerfect formats through the worker.
 *
 * This list had never caught up. The engine read `.ods`, `.xlsb`, `.dbf`, `.rtf`, `.odt`, `.odp`
 * and `.tsv`; the browser refused all seven before they left the sender's machine, and the
 * refusal is the one failure the sender experiences as "this product does not want my files".
 * `upload.test.ts` now holds the two sides together.
 */
export const DOCUMENT_ALLOWED_EXTENSIONS = new Set([
  // Read directly
  "pdf", "csv", "tsv", "prn", "txt",
  "xlsx", "xls", "xlsb", "ods", "fods", "dbf",
  "docx", "pptx",
  "jpg", "jpeg", "png", "webp",
  // Converted by the worker into the modern equivalent, then parsed normally
  "doc", "ppt", "rtf", "odt", "odp", "wpd",
]);
export const DOCUMENT_MAX_BYTES = 52_428_800;
export const DOCUMENT_MAX_FILES_PER_BATCH = 20;
export const DOCUMENT_ACCEPT = [...DOCUMENT_ALLOWED_EXTENSIONS].map((extension) => `.${extension}`).join(",");

export type UploadFailure = "invalid" | "upload" | "register";

export type UploadResult = {
  uploaded: IntakeDocumentSummary[];
  /** First failure code, if any (the UI shows one message; every valid file is still attempted). */
  failure: UploadFailure | null;
};

/** ASCII-safe object name: strips diacritics, replaces anything else with "-", keeps the last 140 chars (extension included). */
export function safeObjectName(name: string) {
  return name.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140);
}

export function isAcceptedDocument(file: Pick<File, "name" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_ALLOWED_EXTENSIONS.has(extension) && file.size > 0 && file.size <= DOCUMENT_MAX_BYTES;
}

export async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Uploads files straight from the browser to the private bucket and registers them in
 * `source_documents` (RLS-protected; the tenant scope comes from the caller's session data).
 * The browser hash is stored as a first claim; the server recomputes it during processing.
 */
export async function uploadDocuments(input: {
  supabase: SupabaseClient<Database>;
  files: File[];
  organizationId: string;
  userId: string;
  scope: UploadScope;
}): Promise<UploadResult> {
  const {supabase, organizationId, userId, scope} = input;
  const scopeId = scope.kind === "session" ? scope.sessionId : scope.opportunityId;
  const uploaded: IntakeDocumentSummary[] = [];
  let failure: UploadFailure | null = null;

  for (const file of input.files.slice(0, DOCUMENT_MAX_FILES_PER_BATCH)) {
    if (!isAcceptedDocument(file)) {
      failure ??= "invalid";
      continue;
    }
    const objectPath = `${organizationId}/${scopeId}/${crypto.randomUUID()}-${safeObjectName(file.name)}`;
    const fileHash = await sha256Hex(file);
    const {error: uploadError} = await supabase.storage.from("opportunity-documents").upload(objectPath, file, {upsert: false, contentType: file.type || "application/octet-stream"});
    if (uploadError) {
      failure ??= "upload";
      continue;
    }
    const {data, error: insertError} = await supabase.from("source_documents").insert({
      organization_id: organizationId,
      opportunity_id: scope.kind === "opportunity" ? scope.opportunityId : null,
      intake_session_id: scope.kind === "session" ? scope.sessionId : null,
      bucket_id: "opportunity-documents",
      object_path: objectPath,
      original_name: file.name,
      mime_type: file.type || null,
      byte_size: file.size,
      // The hash the browser computed, which the server recomputes and overwrites once it has
      // downloaded the object itself. Classification and processing status are the system's
      // judgement and now carry column defaults: a browser that could set `processing_status`
      // could declare a file clean before anything looked at it.
      sha256: fileHash,
      created_by: userId,
    }).select("id, original_name, byte_size").single();
    if (insertError || !data) {
      await supabase.storage.from("opportunity-documents").remove([objectPath]);
      failure ??= "register";
      continue;
    }
    uploaded.push(data);
  }
  return {uploaded, failure};
}
