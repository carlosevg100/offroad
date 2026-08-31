import {createHash, randomUUID} from "node:crypto";

import {buildAutoAcceptPolicy, measureAccuracy, type FeedbackRow} from "@offroad/extraction-learning";
import {buildRedeHorizonteDocumentIntake} from "@offroad/testing-fixtures";
import type {PostgrestError, SupabaseClient} from "@supabase/supabase-js";
import {getTranslations} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import type {Database, Json} from "@/types/database";

import {buildCandidatePayload, buildIssuePayload, deriveCase, summarizeCompilation, type DerivedCase, type IntakeIssuePayload} from "./case";
import {parseList, parseLocalizedNumber} from "./format";
import {pipelineEnabledFor, startProcessingRun} from "./pipeline-run";
import {reconcileIntakeSession} from "./reconcile";
import {parseArchetype} from "./checklist";
import {prepareIntakeRequestLadders} from "./replay";
import {archetype, requirementResponseSchema} from "@offroad/credit-playbook";
import {intakeDecisions, type IntakeCandidate, type IntakeDecision, type IntakeDocument, type IntakeErrorCode, type IntakeIssue, type IntakeSession} from "./types";
import {reportServerFailure} from "@/lib/observability/report";

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

// PostgREST accepts SQL NULL for nullable function parameters, but generated function argument
// types do not encode PostgreSQL parameter nullability. Keep that boundary explicit and local.
const rpcNull = null as never;

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
  // Through the one reporting path: the message is redacted before it leaves the process, and
  // the failure reaches the error view rather than only a log line.
  reportServerFailure({step: `intake.${step}`, error});
}

/**
 * Refreshes the governed request batch after a fact changes.
 *
 * The preceding command already committed the user's fact, so a projection refresh must never
 * make that successful write look failed. A refresh failure is reported and the next worker or
 * command can safely retry because ladder events are append-only and idempotent by event id.
 */
async function refreshIntakeRequests(runtime: Pick<IntakeRuntime, "supabase" | "organizationId" | "sessionId">) {
  try {
    await prepareIntakeRequestLadders(runtime);
  } catch (error) {
    logIntakeFailure("prepare_request_ladders", {
      message: error instanceof Error ? error.message : "request ladder refresh failed",
    });
  }
}

export async function loadIntakeSession(runtime: IntakeRuntime) {
  const {data} = await runtime.supabase.from("document_intake_sessions").select("*").eq("organization_id", runtime.organizationId).eq("id", runtime.sessionId).is("archived_at", null).maybeSingle();
  return data;
}

/** Lightweight project read used while the user is collecting documents or a worker is running. */
export async function loadIntakeCollection(runtime: IntakeRuntime): Promise<{session: IntakeSession | null; documents: IntakeDocument[]}> {
  const {supabase, organizationId, sessionId} = runtime;
  const [sessionResult, documentsResult] = await Promise.all([
    supabase.from("document_intake_sessions").select("*").eq("organization_id", organizationId).eq("id", sessionId).is("archived_at", null).maybeSingle(),
    supabase.from("source_documents").select("id, original_name, byte_size, object_path").eq("organization_id", organizationId).eq("intake_session_id", sessionId).order("created_at"),
  ]);
  return {session: sessionResult.data, documents: documentsResult.data ?? []};
}

/** Session, documents (with 15-minute evidence links), candidates and issues for the review UI. */
export async function loadIntakeReview(runtime: IntakeRuntime): Promise<{session: IntakeSession | null; documents: IntakeDocument[]; candidates: IntakeCandidate[]; issues: IntakeIssue[]}> {
  const {supabase, organizationId, sessionId} = runtime;

  // The pipeline finishes by handing the session to the reviewer; reconciliation is what makes
  // that hand-off worth reading, and it only makes sense once every document has landed. Run
  // once per generation: the marker on the summary says whether this run was already checked.
  await ensureReconciled(runtime);
  const [sessionResult, documentsResult, candidatesResult, issuesResult] = await Promise.all([
    supabase.from("document_intake_sessions").select("*").eq("organization_id", organizationId).eq("id", sessionId).is("archived_at", null).maybeSingle(),
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

/**
 * Reconciles a finished pipeline session, once per run.
 *
 * Deliberately lazy rather than triggered: the worker cannot do it (it holds one document and
 * a token scoped to that job), and a background job would be a second thing to operate. The
 * first reader after the run finishes pays a few milliseconds of arithmetic, and every reader
 * after that pays nothing.
 */
async function ensureReconciled(runtime: IntakeRuntime): Promise<void> {
  const {supabase, organizationId, sessionId} = runtime;
  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("status, current_run_id, result_summary")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .is("archived_at", null)
    .maybeSingle();

  if (!session || session.status !== "review_ready" || !session.current_run_id) return;

  const summary = (session.result_summary ?? {}) as Record<string, unknown>;
  if (summary.reconciled_run === session.current_run_id) return;

  const outcome = await reconcileIntakeSession({supabase, organizationId, sessionId, locale: runtime.locale === "en-US" ? "en" : "pt"});
  if (!outcome.ok) {
    logIntakeFailure("reconcile_session", null);
    return;
  }

  // The merge happens in the database rather than here. Reading the summary, spreading it and
  // writing it back is a read-modify-write, and two of these running at once dropped each
  // other's keys; the command merges with `||` in one statement instead.
  await supabase.rpc("record_intake_analysis", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_patch: {reconciled_run: session.current_run_id} as unknown as Json,
  });
}

/**
 * Records which operation the company is asking for.
 *
 * Validated against the playbook's closed list rather than trusted from the form: the archetype
 * decides which documents are required and which questions come back, so an unrecognised value
 * would produce a checklist for an operation that does not exist.
 */
const advisorAuthorityKinds = [
  "engagement_letter",
  "mandate",
  "power_of_attorney",
  "board_resolution",
  "company_confirmation",
  "other",
] as const;

type AdvisorAuthorityKind = (typeof advisorAuthorityKinds)[number];

export async function setIntakeArchetype(
  runtime: IntakeRuntime,
  input: {
    archetype: string;
    clientLegalName?: string;
    authorityKind?: string;
    authorityReference?: string;
    authorityConfirmed?: boolean;
  },
): Promise<IntakeOutcome> {
  const archetype = parseArchetype(input.archetype);
  if (!archetype) return fail("validation");

  const {data: session, error: sessionError} = await runtime.supabase
    .from("document_intake_sessions")
    .select("journey")
    .eq("organization_id", runtime.organizationId)
    .eq("id", runtime.sessionId)
    .maybeSingle();
  if (sessionError || !session) return fail("session");

  const advisorCase = session.journey === "originator";
  const clientLegalName = input.clientLegalName?.trim() ?? "";
  const authorityReference = input.authorityReference?.trim() ?? "";
  const authorityKind = advisorAuthorityKinds.includes(input.authorityKind as AdvisorAuthorityKind)
    ? input.authorityKind as AdvisorAuthorityKind
    : null;
  if (
    advisorCase && (
      clientLegalName.length < 2 || clientLegalName.length > 240 || !authorityKind ||
      authorityReference.length > 500 || !input.authorityConfirmed
    )
  ) return fail("validation");

  const {error} = await runtime.supabase.rpc("set_intake_operation_context_command", {
    p_organization_id: runtime.organizationId,
    p_session_id: runtime.sessionId,
    p_frame_event_id: randomUUID(),
    p_route_event_id: randomUUID(),
    p_scope_event_id: randomUUID(),
    p_authorization_event_id: advisorCase ? randomUUID() : rpcNull,
    p_early_triage_event_id: randomUUID(),
    p_group_scope_event_id: randomUUID(),
    p_archetype: archetype,
    p_confidence: "medium",
    p_rationale: "Declared by the authorized organization member responsible for this guided intake.",
    p_retest_triggers: ["classified documents", "capital need detail"],
    p_client_legal_name: advisorCase ? clientLegalName : undefined,
    p_authority_kind: advisorCase ? authorityKind ?? undefined : undefined,
    p_authority_reference: advisorCase && authorityReference ? authorityReference : undefined,
  });
  if (error) {
    logIntakeFailure("set_archetype", error);
    return fail(intakeErrorFrom(error, "save"));
  }
  return ok(null);
}

const scopeRoles = ["operating_company", "guarantor", "holding", "target", "other"] as const;
type ScopeRole = (typeof scopeRoles)[number];

/**
 * Resolves one documentary entity suggestion without allowing the extractor to set the case
 * perimeter. Confirmation appends both the new scope version and the suggestion decision in one
 * database transaction; dismissal appends only the decision.
 */
export async function resolveAnalysisScopeSuggestion(
  runtime: IntakeRuntime,
  input: {suggestionId: string; decision: string; role?: string; reason: string},
): Promise<IntakeOutcome> {
  const suggestionId = input.suggestionId.trim();
  const reason = input.reason.trim();
  const decision = input.decision === "confirm" || input.decision === "dismiss" ? input.decision : null;
  const role = scopeRoles.includes(input.role as ScopeRole) ? input.role as ScopeRole : null;
  if (!decision || suggestionId.length < 1 || suggestionId.length > 200 || reason.length < 3 || reason.length > 1000) {
    return fail("validation");
  }
  if (decision === "confirm" && !role) return fail("validation");

  const {error} = await runtime.supabase.rpc("resolve_analysis_scope_suggestion_command", {
    p_organization_id: runtime.organizationId,
    p_session_id: runtime.sessionId,
    p_suggestion_event_id: randomUUID(),
    p_scope_event_id: decision === "confirm" ? randomUUID() : rpcNull,
    p_suggestion_id: suggestionId,
    p_decision: decision,
    p_role: decision === "confirm" ? role ?? rpcNull : rpcNull,
    p_reason: reason,
  });
  if (error) {
    logIntakeFailure("resolve_scope_suggestion", error);
    return fail(intakeErrorFrom(error, "save"));
  }
  await refreshIntakeRequests(runtime);
  return ok(null);
}

/** Revocation is immediate and removes every effective advisor scope from the case. */
export async function revokeAdvisorAuthorization(
  runtime: IntakeRuntime,
  reasonInput: string,
): Promise<IntakeOutcome> {
  const reason = reasonInput.trim();
  if (reason.length < 3 || reason.length > 1000) return fail("validation");
  const {error} = await runtime.supabase.rpc("revoke_advisor_authorization_command", {
    p_organization_id: runtime.organizationId,
    p_session_id: runtime.sessionId,
    p_event_id: randomUUID(),
    p_reason: reason,
  });
  if (error) {
    logIntakeFailure("revoke_advisor_authorization", error);
    return fail(intakeErrorFrom(error, "save"));
  }
  await refreshIntakeRequests(runtime);
  return ok(null);
}

/** Internal operational check. It verifies evidence already attached and grants no new scope. */
export async function verifyAdvisorAuthorization(
  runtime: IntakeRuntime,
  reasonInput: string,
): Promise<IntakeOutcome> {
  const reason = reasonInput.trim();
  if (reason.length < 3 || reason.length > 1000) return fail("validation");
  const {error} = await runtime.supabase.rpc("verify_advisor_authorization_command", {
    p_organization_id: runtime.organizationId,
    p_session_id: runtime.sessionId,
    p_event_id: randomUUID(),
    p_reason: reason,
  });
  if (error) {
    logIntakeFailure("verify_advisor_authorization", error);
    return fail(intakeErrorFrom(error, "save"));
  }
  return ok(null);
}

/**
 * Records one answer to the information request.
 *
 * Validated against the archetype's own list rather than trusted from the form: an answer to a
 * requirement this operation never asked for is not an answer, it is a stray write. And an
 * empty answer deletes rather than storing a blank, so the item goes honestly back to pending
 * instead of looking closed with nothing in it.
 */
export async function recordInformationAnswer(
  runtime: IntakeRuntime,
  input: {requirementId: string; answer?: string; response?: string; note?: string},
): Promise<IntakeOutcome> {
  const {supabase, organizationId, sessionId} = runtime;

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("archetype")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  const archetypeId = parseArchetype(session?.archetype);
  if (!archetypeId) return fail("validation");

  const requirement = archetype(archetypeId).requirements.find((entry) => entry.id === input.requirementId);
  // A notice is something the company is told about, never something it reports on. Accepting
  // a response against one would let the closing tier quietly become a task list.
  if (!requirement || requirement.source === "notice") return fail("validation");

  const parsedResponse = requirementResponseSchema.safeParse(input.response ?? "provided");
  if (!parsedResponse.success) return fail("validation");
  const response = parsedResponse.data;

  const answer = (input.answer ?? "").trim();
  const note = (input.note ?? "").trim();

  // A document item's answer is the file, so `provided` there is expressed by uploading, not by
  // a row here — and an empty row of any kind is the company clearing a red mark with nothing.
  // "Does not apply" with no reason tells an investor only that somebody wanted the item gone.
  // The database enforces this too; refusing here gives the company an error it can act on.
  if ((response === "not_applicable" || response === "unavailable") && !note) return fail("validation");

  const {error} = await supabase.rpc("record_intake_information_command", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_event_id: randomUUID(),
    p_requirement_id: input.requirementId,
    p_answer: answer || undefined,
    p_response: response,
    p_note: note || undefined,
  });
  if (error) {
    logIntakeFailure("record_answer", error);
    return fail(intakeErrorFrom(error, "save"));
  }
  await refreshIntakeRequests(runtime);
  return ok(null);
}

/** Starts a named private project for the tenant. `journey` follows the organization type. */
export async function startIntakeSession(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  userId: string;
  locale: AppLocale;
  journey: "company" | "originator";
  projectName: string;
  identityPolicy: "identified_restricted" | "blind_initial";
}) {
  const {data, error} = await input.supabase.rpc("start_workspace_intake", {
    p_organization_id: input.organizationId,
    p_locale: input.locale,
    p_project_name: input.projectName,
    p_identity_policy: input.identityPolicy,
    p_representation_declared: true,
  });
  if (error || !data) {
    logIntakeFailure("start_session", error);
    return fail<string>(error?.code === "23505" ? "duplicate" : "session");
  }
  return ok(data);
}

async function markSessionFailed(runtime: IntakeRuntime, reason: string) {
  // `status` is the precondition every intake command reads, so it is not writable through the
  // Data API. The command refuses to fail a case that was already confirmed and sent.
  await runtime.supabase.rpc("fail_intake_session", {
    p_organization_id: runtime.organizationId,
    p_session_id: runtime.sessionId,
    p_reason: reason,
  });
}

/**
 * Runs the extractor over the session's documents and persists candidates and issues.
 * `begin_intake_processing` clears previous results and marks the session `processing`;
 * `complete_intake_processing` writes the new generation and marks `review_ready` in one
 * transaction — a reprocess never mixes generations and a failure never leaves partial rows.
 * Two extractors, one controlled rollout held per organization. The legacy boolean remains the
 * emergency feature switch; `organization_rollout_policies.state` controls off, shadow, canary,
 * active and paused without a deployment.
 * With it on, the session is handed to the document pipeline: the app signs the links, `begin_processing_run` queues one job per
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

  const [{data: organization}, {data: rollout}] = await Promise.all([
    supabase.from("organizations").select("pipeline_enabled").eq("id", organizationId).maybeSingle(),
    supabase.from("organization_rollout_policies").select("state").eq("organization_id", organizationId).maybeSingle(),
  ]);

  if (pipelineEnabledFor({...organization, rollout_state: rollout?.state})) {
    // The worker's E0 gate downloads the bytes, checks size and SHA-256 and scans the file
    // before parsing. Repeating that download here made the user wait for work the worker is
    // explicitly designed to own, so production processing now returns as soon as jobs exist.
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

  // Production can produce the preliminary company/operation understanding from the user's
  // declaration plus public research even when no file exists yet. The local deterministic
  // fixture has no such worker and therefore still requires at least one known document.
  if (!documents?.length) return fail("documents");

  // The local fixture has no worker gate, so it keeps the server-side verification path.
  const verification = await verifyIntakeDocuments(runtime);
  if (!verification.ok) {
    logIntakeFailure("verify_documents", null);
    await markSessionFailed(runtime, "verification_failed");
    return fail("processing");
  }

  // The fixture path owns one disposable generation and therefore clears the prior result.
  // The production pipeline does not: it reuses immutable ready documents and replaces only
  // the candidates of documents that actually changed or failed.
  const begin = await supabase.rpc("begin_intake_processing", {p_organization_id: organizationId, p_session_id: sessionId});
  if (begin.error) {
    logIntakeFailure("begin_processing", begin.error);
    return fail(intakeErrorFrom(begin.error, "processing"));
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
    // "The server downloaded this object and the digest matched" is a statement only the server
    // can make, so it is no longer a column a browser can write.
    const {error: updateError} = await supabase.rpc("record_document_verification", {
      p_organization_id: organizationId,
      p_document_id: document.id,
      p_sha256: serverHash,
      p_processing_status: "clean",
    });
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
 * Removes a document while the session is still open. The command appends the removal event and
 * deletes the row in one transaction; the private object is removed afterwards. Retrying the
 * same database command returns the original object path, so storage cleanup remains possible.
 */
export async function removeIntakeDocument(runtime: IntakeRuntime, documentId: string): Promise<IntakeOutcome> {
  const {supabase, organizationId, sessionId} = runtime;
  if (!documentId) return fail("validation");
  const {data, error} = await supabase.rpc("remove_intake_document_command", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_event_id: randomUUID(),
    p_document_id: documentId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return fail("remove");
  const objectPath = typeof data.object_path === "string" ? data.object_path : null;
  if (objectPath) await supabase.storage.from("opportunity-documents").remove([objectPath]);
  await refreshIntakeRequests(runtime);
  return ok(null);
}

export type AutoAcceptOutcome = {
  accepted: number;
  /** Held back for a human, and why. The screen shows this; a silent hold teaches nothing. */
  held: Array<{fieldPath: string; reason: string}>;
};

/**
 * Accepts what the desk has earned the right to accept, and holds the rest.
 *
 * This used to be one line: confidence ≥ 0.95, everything through. That threshold treats every
 * field the same, so the extractor's self-reported confidence on a field it has been wrong
 * about four times in five carried exactly the same weight as on a field it has never missed —
 * and the product had no way to get better at telling those apart, because the evidence was
 * being thrown away.
 *
 * Now the ledger decides. Fields with a scale error in their history are locked outright,
 * unproven fields must earn their way out, and fields the desk has been wrong about need more
 * certainty than fields it has not. The reason is returned rather than swallowed, so a company
 * looking at four held-back numbers can see that they were held because this platform has
 * misread that line before.
 *
 * The bulk accept deliberately does **not** write feedback rows. An automatic acceptance is not
 * a human judgement, and recording it as one would inflate the measured accuracy with values
 * nobody looked at — the ledger would then approve of exactly the fields it never checked. The
 * consequence is a known and acceptable bias: what is measured is accuracy *among candidates a
 * human judged*, which skews toward the harder cases, so the policy is conservative by
 * construction rather than optimistic.
 */
export async function acceptHighConfidenceCandidates(runtime: IntakeRuntime): Promise<IntakeOutcome<AutoAcceptOutcome>> {
  const {supabase, organizationId, sessionId} = runtime;

  // Learning is tenant-wide: a field this company has corrected on one deal should not be
  // auto-accepted on the next just because the session changed.
  const {data: feedback} = await supabase
    .from("extraction_feedback")
    .select("field_path, field_group, value_type, document_kind, extractor_key, decision, proposed_value, corrected_value, confidence, anchor_verified")
    .eq("organization_id", organizationId);

  const policy = buildAutoAcceptPolicy(
    measureAccuracy(
      (feedback ?? []).map((entry) => ({
        fieldPath: entry.field_path,
        fieldGroup: entry.field_group,
        valueType: entry.value_type,
        documentKind: entry.document_kind,
        extractorKey: entry.extractor_key,
        decision: entry.decision as FeedbackRow["decision"],
        proposedValue: typeof entry.proposed_value === "string" ? entry.proposed_value : JSON.stringify(entry.proposed_value),
        correctedValue:
          entry.corrected_value === null
            ? null
            : typeof entry.corrected_value === "string"
              ? entry.corrected_value
              : JSON.stringify(entry.corrected_value),
        confidence: Number(entry.confidence),
        anchorVerified: entry.anchor_verified,
      })),
    ),
  );

  const {data: candidates, error: loadError} = await supabase
    .from("intake_field_candidates")
    .select("id, field_path, confidence, source_document_id")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId)
    .eq("is_primary", true)
    .eq("review_state", "proposed");
  if (loadError) return fail("save");
  if (!candidates?.length) return ok({accepted: 0, held: []});

  // The kind comes from the profile the classifier wrote, not from `source_documents`. That
  // table carries a `document_kind` column nothing has written since the pipeline replaced the
  // fixture, so reading it here handed the policy a null for every candidate and every
  // per-kind rule silently stopped applying: the auto-accept decision was being made by the
  // fallback branch alone, for every field, in every document.
  const documentIds = [...new Set(candidates.map((candidate) => candidate.source_document_id).filter((id): id is string => Boolean(id)))];
  const {data: profiles} = documentIds.length
    ? await supabase
        .from("document_profiles")
        .select("source_document_id, document_kind")
        .eq("organization_id", organizationId)
        .in("source_document_id", documentIds)
    : {data: []};
  const kindOf = new Map((profiles ?? []).map((profile) => [profile.source_document_id, profile.document_kind]));

  const acceptable: string[] = [];
  const held: AutoAcceptOutcome["held"] = [];
  for (const candidate of candidates) {
    const decision = policy.decide({
      fieldPath: candidate.field_path,
      documentKind: candidate.source_document_id ? (kindOf.get(candidate.source_document_id) ?? null) : null,
      confidence: Number(candidate.confidence),
    });
    if (decision.autoAccept) acceptable.push(candidate.id);
    else held.push({fieldPath: candidate.field_path, reason: decision.reason});
  }

  if (acceptable.length === 0) return ok({accepted: 0, held});

  // Through the RPC rather than a direct update: `intake_field_candidates` is no longer writable
  // by a tenant at all, because a table-level grant is a way around every determinism mechanism
  // above it. The function re-checks membership and refuses to revive a decision already made.
  const {data: accepted, error} = await supabase.rpc("accept_intake_candidates", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_candidate_ids: acceptable,
  });
  return error ? fail("save") : ok({accepted: typeof accepted === "number" ? accepted : acceptable.length, held});
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
