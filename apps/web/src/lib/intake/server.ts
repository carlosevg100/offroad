import {createHash} from "node:crypto";

import {buildRedeHorizonteDocumentIntake} from "@offroad/testing-fixtures";
import type {SupabaseClient} from "@supabase/supabase-js";

import type {AppLocale} from "@/i18n/routing";
import type {Database, Json} from "@/types/database";

import {buildCandidateRows, buildEvidenceRows, buildIssueRows, deriveCase, summarizeCompilation, type DerivedCase} from "./case";
import {parseList, parseLocalizedNumber} from "./format";
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

/** SHA-256 of a legal identifier as a Postgres bytea literal (`\x…`); only the last 4 chars stay in clear. */
export function identifierHash(identifier: string) {
  const clean = identifier.replace(/[^0-9A-Za-z]/g, "");
  return clean ? {hash: `\\x${createHash("sha256").update(clean).digest("hex")}`, last4: clean.slice(-4)} : {hash: null, last4: null};
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
  return error || !data ? fail<string>("session") : ok(data.id);
}

async function markSessionFailed(runtime: IntakeRuntime, reason: string) {
  await runtime.supabase.from("document_intake_sessions").update({status: "failed", processing_completed_at: new Date().toISOString(), result_summary: {error: reason}}).eq("organization_id", runtime.organizationId).eq("id", runtime.sessionId);
}

/**
 * Runs the extractor over the session's documents and (re)builds candidates and issues.
 * Today the only extractor is the content-hash-verified Rede Horizonte fixture; unknown sets
 * yield zero candidates and one explicit issue. Any persistence failure marks the session
 * `failed` so the UI can offer a retry instead of leaving it stuck in `processing`.
 */
export async function processIntakeSession(runtime: IntakeRuntime): Promise<IntakeOutcome> {
  const {supabase, organizationId, sessionId, userId} = runtime;
  const {data: documents} = await supabase.from("source_documents").select("id, original_name, sha256").eq("organization_id", organizationId).eq("intake_session_id", sessionId).order("created_at");
  if (!documents?.length) return fail("documents");

  await supabase.from("document_intake_sessions").update({status: "processing", processing_started_at: new Date().toISOString(), processing_completed_at: null}).eq("organization_id", organizationId).eq("id", sessionId);
  const [issuesReset, candidatesReset] = await Promise.all([
    supabase.from("intake_issues").delete().eq("organization_id", organizationId).eq("intake_session_id", sessionId),
    supabase.from("intake_field_candidates").delete().eq("organization_id", organizationId).eq("intake_session_id", sessionId),
  ]);
  if (issuesReset.error || candidatesReset.error) {
    await markSessionFailed(runtime, "reset_failed");
    return fail("processing");
  }

  const compilation = buildRedeHorizonteDocumentIntake(documents);
  const scope = {organizationId, sessionId, userId};
  const candidateRows = buildCandidateRows(compilation, scope);
  const idByKey = new Map<string, string>();
  if (candidateRows.length) {
    const {data, error} = await supabase.from("intake_field_candidates").insert(candidateRows).select("id, extractor_key");
    if (error || !data) {
      await markSessionFailed(runtime, "candidate_persistence_failed");
      return fail("processing");
    }
    for (const row of data) idByKey.set(row.extractor_key, row.id);
  }
  const issueRows = buildIssueRows(compilation, scope, idByKey);
  if (issueRows.length) {
    const {error} = await supabase.from("intake_issues").insert(issueRows);
    if (error) {
      await markSessionFailed(runtime, "issue_persistence_failed");
      return fail("processing");
    }
  }

  await supabase.from("source_documents").update({processing_status: "ready"}).eq("organization_id", organizationId).eq("intake_session_id", sessionId);
  const {error} = await supabase.from("document_intake_sessions").update({
    status: "review_ready",
    processing_completed_at: new Date().toISOString(),
    result_summary: summarizeCompilation(compilation, {documents: documents.length, candidates: candidateRows.length, issues: issueRows.length}),
  }).eq("organization_id", organizationId).eq("id", sessionId);
  if (error) {
    await markSessionFailed(runtime, "session_update_failed");
    return fail("processing");
  }
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

/** Accept / edit / reject / N/A one candidate. Edits parse numbers in the user's locale. */
export async function reviewIntakeCandidate(runtime: IntakeRuntime, input: ReviewInput): Promise<IntakeOutcome> {
  const {supabase, organizationId, sessionId, userId} = runtime;
  if (!input.candidateId || !intakeDecisions.includes(input.decision as IntakeDecision)) return fail("validation");
  const decision = input.decision as IntakeDecision;
  const {data: candidate} = await supabase.from("intake_field_candidates").select("id, field_path, value_type, normalized_value").eq("organization_id", organizationId).eq("intake_session_id", sessionId).eq("id", input.candidateId).maybeSingle();
  if (!candidate) return fail("validation");

  let normalized: Json = candidate.normalized_value;
  if (decision === "edit") {
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

  if (decision === "accept" || decision === "edit") {
    const {error} = await supabase.from("intake_field_candidates").update({is_primary: false}).eq("organization_id", organizationId).eq("intake_session_id", sessionId).eq("field_path", candidate.field_path).neq("id", candidate.id);
    if (error) return fail("save");
  }
  const {error} = await supabase.from("intake_field_candidates").update({
    normalized_value: normalized,
    review_state: decision === "accept" ? "accepted" : decision === "edit" ? "edited" : decision,
    is_primary: decision === "accept" || decision === "edit",
    ...(decision === "edit" ? {extraction_method: "user_entry"} : {}),
    reviewer_comment: input.comment.trim() || null,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  }).eq("organization_id", organizationId).eq("intake_session_id", sessionId).eq("id", candidate.id);
  return error ? fail("save") : ok(null);
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
 * Creates the case from the confirmed candidates: company + capital request + opportunity
 * (through `create_opportunity_intake`), evidence facts, document links, and the session
 * closure. Idempotent when the session was already confirmed. Nothing here is specific to a
 * document set: every value comes from confirmed candidates or stays null.
 *
 * Note: the writes after the RPC are still sequential (see docs/build/RISK_REGISTER.md); a
 * single Postgres function replaces this sequence in the next increment.
 */
export async function confirmIntakeCase(runtime: IntakeRuntime): Promise<IntakeOutcome<ConfirmedCase>> {
  const {supabase, organizationId, sessionId, userId, locale} = runtime;
  const {data: session} = await supabase.from("document_intake_sessions").select("id, status, opportunity_id").eq("organization_id", organizationId).eq("id", sessionId).maybeSingle();
  if (!session) return fail("session");

  const {data: candidates} = await supabase.from("intake_field_candidates").select("*").eq("organization_id", organizationId).eq("intake_session_id", sessionId);
  const derived = deriveCase(candidates ?? []);
  if (!derived) return fail("confirmation");
  const {count: documentCount} = await supabase.from("source_documents").select("id", {count: "exact", head: true}).eq("organization_id", organizationId).eq("intake_session_id", sessionId);

  if (session.status === "confirmed" && session.opportunity_id) {
    const {data: existing} = await supabase.from("opportunities").select("id, company_id, capital_request_id").eq("organization_id", organizationId).eq("id", session.opportunity_id).maybeSingle();
    if (existing) return ok({opportunityId: existing.id, companyId: existing.company_id, capitalRequestId: existing.capital_request_id, derived, documentCount: documentCount ?? 0, alreadyConfirmed: true});
  }
  if (session.status !== "review_ready") return fail("confirmation");

  const {data: opportunityId, error: rpcError} = await supabase.rpc("create_opportunity_intake", {
    p_organization_id: organizationId,
    p_legal_name: derived.legalName,
    p_sector: derived.sector ?? "",
    p_purpose: derived.purpose,
    p_requested_amount: derived.requestedAmount,
    p_currency: derived.currency,
    p_desired_term_months: null as unknown as number,
    p_output_locale: locale,
  });
  if (rpcError || !opportunityId) return fail("save");

  const {data: opportunity} = await supabase.from("opportunities").select("id, company_id, capital_request_id").eq("organization_id", organizationId).eq("id", opportunityId).single();
  if (!opportunity) return fail("save");

  const {hash, last4} = identifierHash(derived.identifier);
  const [companyUpdate, opportunityUpdate] = await Promise.all([
    supabase.from("companies").update({
      display_name: derived.displayName,
      legal_identifier_hash: hash,
      legal_identifier_last4: last4,
      website: derived.website,
      sector: derived.sector,
      subsector: derived.subsector,
      headquarters_city: derived.city,
      headquarters_state: derived.state,
    }).eq("organization_id", organizationId).eq("id", opportunity.company_id),
    supabase.from("opportunities").update({title: derived.title}).eq("organization_id", organizationId).eq("id", opportunity.id),
  ]);
  if (companyUpdate.error || opportunityUpdate.error) return fail("save");

  const now = new Date().toISOString();
  const evidenceRows = buildEvidenceRows(candidates ?? [], {organizationId, opportunityId: opportunity.id, userId, now});
  if (evidenceRows.length) {
    const {error} = await supabase.from("evidence_facts").insert(evidenceRows);
    if (error) return fail("save");
  }
  const [documentsLink, sessionClose] = await Promise.all([
    supabase.from("source_documents").update({opportunity_id: opportunity.id}).eq("organization_id", organizationId).eq("intake_session_id", sessionId),
    supabase.from("document_intake_sessions").update({status: "confirmed", opportunity_id: opportunity.id, confirmed_at: now}).eq("organization_id", organizationId).eq("id", sessionId),
  ]);
  if (documentsLink.error || sessionClose.error) return fail("save");

  return ok({opportunityId: opportunity.id, companyId: opportunity.company_id, capitalRequestId: opportunity.capital_request_id, derived, documentCount: documentCount ?? 0, alreadyConfirmed: false});
}
