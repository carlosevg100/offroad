import {createHash} from "node:crypto";

import {buildRedeHorizonteDocumentIntake} from "@offroad/testing-fixtures";
import type {PostgrestError, SupabaseClient} from "@supabase/supabase-js";
import {getTranslations} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import type {Database, Json} from "@/types/database";

import {buildCandidatePayload, buildIssuePayload, deriveCase, summarizeCompilation, type DerivedCase, type IntakeIssuePayload} from "./case";
import {parseList, parseLocalizedNumber} from "./format";
import {pipelineRunsEnabled, startProcessingRun} from "./pipeline-run";
import {intakeDecisions, type IntakeCandidate, type IntakeDecision, type IntakeDocument, type IntakeErrorCode, type IntakeIssue, type IntakeSession} from "./types";

/**
 * Everything the intake operations need, resolved by the caller (onboarding or workspace).
 * Tenant scope always comes from the verified session, never from form fields.
 */
export type IntakeRuntime = {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  userId: string;
  locale: AppLocale;
  sessionId: string;
};

export type IntakeOutcome<T = null> = {ok: true; value: T} | {ok: false; error: IntakeErrorCode};

const ok = <T,>(value: T): IntakeOutcome<T> => ({ok: true, value});
const fail = <T = null,>(error: IntakeErrorCode): IntakeOutcome<T> => ({ok: false, error});

/** Maps a Postgres error raised by the intake RPCs to a user-facing error code. */
export function intakeErrorFrom(error: PostgrestError | null | undefined, fallback: IntakeErrorCode = "save"): IntakeErrorCode {
  const message = error?.message ?? "";
  if (message.includes("duplicate_opportunity")) return "duplicate";
  if (message.includes("document_not_removable")) return "remove";
  if (message.includes("intake_case_incomplete") || message.includes("intake_session_not_ready") || message.includes("intake_session_already_confirmed")) return "confirmation";
  if (message.includes("intake_session_not_found") || message.includes("organization_access_denied") || message.includes("authentication_required")) return "session";
  if (message.includes("invalid_review_decision") || message.includes("edit_requires_value") || message.includes("intake_candidate_not_found") || message.includes("invalid_intake_payload") || message.includes("intake_case_out_of_bounds")) return "validation";
  return fallback;
}

/**
 * Structured server log for intake failures. Only the Postgres error code and message are
 * logged (never row data, ids, or user input) so production logs stay free of confidential
 * content while remaining actionable.
 */
function logIntakeFailure(step: string, error: {code?: string; message?: string} | null | undefined) {
  console.error("intake_step_failed", {step, code: error?.code ?? null, message: error?.message ?? null});
}

export async function loadIntakeSession(runtime: IntakeRuntime) {
  const {data} = await runtime.supabase.from("document_intake_sessions").select("*").eq("organization_id", runtime.organizationId).eq("id", runtime.sessionId).maybeSingle();
  return data;
}

/** Session, documents (with 15-minute evidence links), candidates and issues for the review UI. */
export async function loadIntakeReview(runtime: IntakeRuntime): Promise<{session: IntakeSession | null; documents: IntakeDocument[]; candidates: IntakeCandidate[]; issues: IntakeIssue[]}> {
  const {supabase, organizationId, sessionId} = runtime;
  const [sessionResult, documentsResult, candidatesResult, issuesResult] = await Promise.all([
    supabase.from("document_intake_sessions").select("*").eq("organization_id", organizationId).eq("id", sessionId).maybeSingle(),
    supabase.from("source_documents").select("id, original_name, byte_size, object_path").eq("organization_id", organizationId).eq("intake_session_id", sessionId).order("created_at"),
    supabase.from("intake_field_candidates").select("*").eq("organization_id", organizationId).eq("intake_session_id", sessionId).order("field_group").order("field_path").order("evidence_rank"),
    supabase.from("intake_issues").select("*").eq("organization_id", organizationId).eq("intake_session_id", sessionId).order("priority").order("created_at"),
  ]);
  const baseDocuments: IntakeDocument[] = documentsResult.data ?? [];
  const signedEntries = await Promise.all(baseDocuments.map(async (document) => {
    const {data} = await supabase.storage.from("opportunity-documents").createSignedUrl(document.object_path, 900);
    return [document.id, data?.signedUrl] as const;
  }));
  const signedById = new Map(signedEntries);
  return {
    session: sessionResult.data,
    documents: baseDocuments.map((document) => ({...document, signedUrl: signedById.get(document.id)})),
    candidates: candidatesResult.data ?? [],
    issues: issuesResult.data ?? [],
  };
}

/** Starts a session for the tenant. `journey` follows the organization type. */
export async function startIntakeSession(input: {supabase: SupabaseClient<Database>; organizationId: string; userId: string; locale: AppLocale; journey: "company" | "originator"}) {
  const {data, error} = await input.supabase.from("document_intake_sessions").insert({organization_id: input.organizationId, started_by: input.userId, journey: input.journey, locale: input.locale}).select("id").single();
  if (error || !data) {
    logIntakeFailure("start_session", error);
    return fail<string>("session");
  }
  return ok(data.id);
}

async function markSessionFailed(runtime: IntakeRuntime, reason: string) {
  await runtime.supabase.from("document_intake_sessions").update({status: "failed", processing_completed_at: new Date().toISOString(), result_summary: {error: reason}}).eq("organization_id", runtime.organizationId).eq("id", runtime.sessionId);
}

/**
 * Runs the extractor over the session's documents and persists candidates and issues.
 * `begin_intake_processing` clears previous results and marks the session `processing`;
 * `complete_intake_processing` writes the new generation and marks `review_ready` in one
 * transaction — a reprocess never mixes generations and a failure never leaves partial rows.
 * Two extractors, one switch. With `PIPELINE_RUNS_ENABLED` the session is handed to the
 * document pipeline: the app signs the links, `begin_processing_run` queues one job per
 * document, and the worker reads, verifies and proposes — the session stays `processing`
 * until the worker's last job moves it to `review_ready`, which is what the screen watches.
 * Without the switch it is the content-hash-verified Rede Horizonte fixture, where an unknown
 * set yields zero candidates and one explicit issue.
 *
 * The two never run together. `begin_processing_run` returns the session to `processing`, so
 * calling it after the fixture path finished would undo the `review_ready` it had just set and
 * leave the journey in a spinner.
 *
 * Failures mark the session `failed` so the UI offers a retry instead of leaving it stuck.
 */
export async function processIntakeSession(runtime: IntakeRuntime): Promise<IntakeOutcome> {
  const {supabase, organizationId, sessionId} = runtime;
  const {data: documents} = await supabase.from("source_documents").select("id, original_name, sha256").eq("organization_id", organizationId).eq("intake_session_id", sessionId).order("created_at");
  if (!documents?.length) return fail("documents");

  const begin = await supabase.rpc("begin_intake_processing", {p_organization_id: organizationId, p_session_id: sessionId});
  if (begin.error) {
    logIntakeFailure("begin_processing", begin.error);
    return fail(intakeErrorFrom(begin.error, "processing"));
  }

  // Content verification: recompute SHA-256 from the stored objects so the extractor and the
  // audit trail rely on server-verified hashes, never on the browser's claim. The pipeline
  // needs this too — the worker's gate refuses any file whose bytes do not match what the app
  // recorded, and that comparison is only meaningful against a server-computed hash.
  const verification = await verifyIntakeDocuments(runtime);
  if (!verification.ok) {
    logIntakeFailure("verify_documents", null);
    await markSessionFailed(runtime, "verification_failed");
    return fail("processing");
  }

  if (pipelineRunsEnabled()) {
    const run = await startProcessingRun({supabase, organizationId, sessionId, trigger: "upload"});
    if (!run.ok) {
      logIntakeFailure("begin_processing_run", null);
      await markSessionFailed(runtime, "pipeline_start_failed");
      return run;
    }
    // The session stays `processing`; the worker's last job is what moves it on. Returning
    // here is the point — the fixture path must not also write a generation of candidates.
    return ok(null);
  }
  const verifiedDocuments = documents.map((document) => ({...document, sha256: verification.value.hashes.get(document.id) ?? document.sha256}));

  const compilation = buildRedeHorizonteDocumentIntake(verifiedDocuments);
  const candidates = buildCandidatePayload(compilation);
  const issues: IntakeIssuePayload[] = [...buildIssuePayload(compilation), ...verification.value.mismatchIssues];
  const summary = {...summarizeCompilation(compilation, {documents: documents.length, candidates: candidates.length, issues: issues.length}), verified_documents: verification.value.verified, hash_mismatches: verification.value.mismatchIssues.length};
  const complete = await supabase.rpc("complete_intake_processing", {p_organization_id: organizationId, p_session_id: sessionId, p_candidates: candidates as Json, p_issues: issues as Json, p_summary: summary as Json});
  if (complete.error) {
    logIntakeFailure("complete_processing", complete.error);
    await markSessionFailed(runtime, "persistence_failed");
    return fail(intakeErrorFrom(complete.error, "processing"));
  }
  return ok(null);
}

export function sha256HexOf(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

type VerificationResult = {hashes: Map<string, string>; verified: number; mismatchIssues: IntakeIssuePayload[]};

/**
 * Downloads every document of the session that has not been verified yet, recomputes its
 * SHA-256 and stores the verified value (`sha256_verified_at`). A mismatch with the browser's
 * claim keeps the file, records the server hash and surfaces an explicit integrity issue.
 */
export async function verifyIntakeDocuments(runtime: IntakeRuntime): Promise<IntakeOutcome<VerificationResult>> {
  const {supabase, organizationId, sessionId, locale} = runtime;
  const {data: documents, error} = await supabase.from("source_documents").select("id, original_name, object_path, sha256, sha256_verified_at").eq("organization_id", organizationId).eq("intake_session_id", sessionId).order("created_at");
  if (error || !documents) return fail("processing");
  const t = await getTranslations({locale, namespace: "Intake.issues"});
  const hashes = new Map<string, string>();
  const mismatchIssues: IntakeIssuePayload[] = [];
  let verified = 0;

  for (const document of documents) {
    if (document.sha256_verified_at && document.sha256) {
      hashes.set(document.id, document.sha256);
      continue;
    }
    const {data: blob, error: downloadError} = await supabase.storage.from("opportunity-documents").download(document.object_path);
    if (downloadError || !blob) {
      logIntakeFailure("download_document", {message: downloadError?.message});
      return fail("processing");
    }
    const serverHash = sha256HexOf(new Uint8Array(await blob.arrayBuffer()));
    const now = new Date().toISOString();
    const {error: updateError} = await supabase.from("source_documents").update({sha256: serverHash, sha256_verified_at: now, processing_status: "clean"}).eq("organization_id", organizationId).eq("id", document.id);
    if (updateError) {
      logIntakeFailure("store_verified_hash", updateError);
      return fail("processing");
    }
    hashes.set(document.id, serverHash);
    verified += 1;
    if (document.sha256 && document.sha256 !== serverHash) {
      mismatchIssues.push({
        issue_type: "validation",
        priority: "diligence",
        field_group: null,
        field_path: null,
        candidate_keys: [],
        title: t("hashMismatchTitle", {name: document.original_name}),
        description: t("hashMismatchBody"),
        resolution_hint: t("hashMismatchHint"),
      });
    }
  }
  return ok({hashes, verified, mismatchIssues});
}

/**
 * Removes a document while the session is still open: the row goes first (RLS decides — only
 * intake documents of a non-confirmed session, not yet linked to an opportunity), then the
 * object. A leftover object without a row is harmless (private bucket, unreachable by the app).
 */
export async function removeIntakeDocument(runtime: IntakeRuntime, documentId: string): Promise<IntakeOutcome> {
  const {supabase, organizationId, sessionId} = runtime;
  if (!documentId) return fail("validation");
  const {data: document} = await supabase.from("source_documents").select("id, object_path").eq("organization_id", organizationId).eq("intake_session_id", sessionId).eq("id", documentId).maybeSingle();
  if (!document) return fail("remove");
  const {data: deleted, error} = await supabase.from("source_documents").delete().eq("organization_id", organizationId).eq("intake_session_id", sessionId).eq("id", documentId).select("id");
  if (error || !deleted?.length) return fail("remove");
  await supabase.storage.from("opportunity-documents").remove([document.object_path]);
  return ok(null);
}

/** Accepts every still-proposed primary candidate with confidence ≥ 0.95. */
export async function acceptHighConfidenceCandidates(runtime: IntakeRuntime): Promise<IntakeOutcome> {
  const {error} = await runtime.supabase.from("intake_field_candidates")
    .update({review_state: "accepted", reviewed_by: runtime.userId, reviewed_at: new Date().toISOString()})
    .eq("organization_id", runtime.organizationId).eq("intake_session_id", runtime.sessionId)
    .eq("is_primary", true).eq("review_state", "proposed").gte("confidence", 0.95);
  return error ? fail("save") : ok(null);
}

export type ReviewInput = {candidateId: string; decision: string; rawValue: string; comment: string};

/** Accept / edit / reject / N/A one candidate. Edits parse numbers in the user's locale; persistence is atomic. */
export async function reviewIntakeCandidate(runtime: IntakeRuntime, input: ReviewInput): Promise<IntakeOutcome> {
  const {supabase, organizationId, sessionId} = runtime;
  if (!input.candidateId || !intakeDecisions.includes(input.decision as IntakeDecision)) return fail("validation");
  const decision = input.decision as IntakeDecision;

  let normalized: Json | undefined;
  if (decision === "edit") {
    const {data: candidate} = await supabase.from("intake_field_candidates").select("value_type").eq("organization_id", organizationId).eq("intake_session_id", sessionId).eq("id", input.candidateId).maybeSingle();
    if (!candidate) return fail("validation");
    const raw = input.rawValue.trim();
    if (candidate.value_type === "number") {
      const parsed = parseLocalizedNumber(raw, runtime.locale);
      if (parsed === null) return fail("validation");
      normalized = parsed;
    } else if (candidate.value_type === "boolean") {
      normalized = raw === "true";
    } else if (candidate.value_type === "list") {
      normalized = parseList(raw);
    } else {
      if (!raw) return fail("validation");
      normalized = raw;
    }
  }

  const {error: reviewError} = await supabase.rpc("review_intake_candidate", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_candidate_id: input.candidateId,
    p_decision: decision,
    ...(normalized === undefined ? {} : {p_normalized_value: normalized}),
    ...(input.comment.trim() ? {p_comment: input.comment.trim()} : {}),
  });
  if (reviewError) logIntakeFailure("review_candidate", reviewError);
  return reviewError ? fail(intakeErrorFrom(reviewError, "save")) : ok(null);
}

export async function resolveIntakeIssue(runtime: IntakeRuntime, input: {issueId: string; status: string}): Promise<IntakeOutcome> {
  if (!input.issueId) return fail("validation");
  const status = input.status === "dismissed" ? "dismissed" : "resolved";
  const {error} = await runtime.supabase.from("intake_issues").update({status, resolved_by: runtime.userId, resolved_at: new Date().toISOString()}).eq("organization_id", runtime.organizationId).eq("intake_session_id", runtime.sessionId).eq("id", input.issueId);
  return error ? fail("save") : ok(null);
}

export type ConfirmedCase = {
  opportunityId: string;
  companyId: string;
  capitalRequestId: string;
  derived: DerivedCase;
  documentCount: number;
  alreadyConfirmed: boolean;
};

/**
 * Creates the case from the confirmed candidates in one transaction
 * (`confirm_document_intake`): company (reused when the tenant already has the same legal
 * identifier), capital request, opportunity (fingerprinted; duplicates are refused), approved
 * evidence facts, document links and the session closure. Idempotent: confirming an already
 * confirmed session returns the same opportunity. Every value comes from confirmed candidates
 * — nothing is specific to a document set.
 */
export async function confirmIntakeCase(runtime: IntakeRuntime): Promise<IntakeOutcome<ConfirmedCase>> {
  const {supabase, organizationId, sessionId, locale} = runtime;
  const {data: candidates} = await supabase.from("intake_field_candidates").select("*").eq("organization_id", organizationId).eq("intake_session_id", sessionId);
  const derived = deriveCase(candidates ?? []);
  if (!derived) {
    // The session may already be confirmed (candidates unchanged) — let the RPC answer idempotently.
    const {data: session} = await supabase.from("document_intake_sessions").select("status, opportunity_id").eq("organization_id", organizationId).eq("id", sessionId).maybeSingle();
    if (!(session?.status === "confirmed" && session.opportunity_id)) return fail("confirmation");
  }

  const {data, error} = await supabase.rpc("confirm_document_intake", {p_organization_id: organizationId, p_session_id: sessionId, p_output_locale: locale});
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    logIntakeFailure("confirm_case", error);
    return fail(intakeErrorFrom(error, "save"));
  }
  const result = data as Record<string, Json | undefined>;
  const opportunityId = typeof result.opportunity_id === "string" ? result.opportunity_id : "";
  const companyId = typeof result.company_id === "string" ? result.company_id : "";
  const capitalRequestId = typeof result.capital_request_id === "string" ? result.capital_request_id : "";
  if (!opportunityId || !companyId || !capitalRequestId) return fail("save");
  return ok({
    opportunityId,
    companyId,
    capitalRequestId,
    derived: derived ?? deriveCase(candidates ?? []) ?? emptyDerived(),
    documentCount: typeof result.document_count === "number" ? result.document_count : 0,
    alreadyConfirmed: result.already_confirmed === true,
  });
}

function emptyDerived(): DerivedCase {
  return {legalName: "", displayName: "", purpose: "", requestedAmount: 0, currency: "BRL", identifier: "", sector: null, subsector: null, website: null, city: null, state: null, projectCost: null, collateralTotal: null, title: ""};
}
