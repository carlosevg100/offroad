"use server";

import {buildRedeHorizonteDocumentIntake} from "@offroad/testing-fixtures";
import {redirect} from "next/navigation";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import type {Json} from "@/types/database";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData) {
  const raw = value(formData, "locale");
  return routing.locales.includes(raw as AppLocale) ? raw as AppLocale : routing.defaultLocale;
}

function workspaceIntakeUrl(locale: string, sessionId: string, error = "") {
  return `/${locale}/app/new?mode=documents&session=${sessionId}${error ? `&error=${error}` : ""}`;
}

async function workspaceIntakeContext(locale: AppLocale, sessionId: string) {
  const context = await requireWorkspace(locale);
  if (context.organization.organization_type === "capital_provider") redirect(`/${locale}/app`);
  const {data: session} = await context.supabase.from("document_intake_sessions").select("id, status").eq("organization_id", context.organization.id).eq("id", sessionId).maybeSingle();
  if (!session) redirect(`/${locale}/app/new?error=session`);
  return {...context, session};
}

export async function chooseWorkspaceManualIntake(formData: FormData) {
  const locale = localeFrom(formData);
  await requireWorkspace(locale);
  redirect(`/${locale}/app/new?mode=manual`);
}

export async function startWorkspaceDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const {supabase, organization, userId} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);
  const journey = organization.organization_type === "originator" ? "originator" : "company";
  const {data, error} = await supabase.from("document_intake_sessions").insert({organization_id: organization.id, started_by: userId, journey, locale}).select("id").single();
  if (error || !data) redirect(`/${locale}/app/new?error=session`);
  redirect(workspaceIntakeUrl(locale, data.id));
}

export async function processWorkspaceDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const context = await workspaceIntakeContext(locale, sessionId);
  const {data: documents} = await context.supabase.from("source_documents").select("id, original_name, sha256").eq("organization_id", context.organization.id).eq("intake_session_id", sessionId).order("created_at");
  if (!documents?.length) redirect(workspaceIntakeUrl(locale, sessionId, "documents"));
  await context.supabase.from("document_intake_sessions").update({status: "processing", processing_started_at: new Date().toISOString()}).eq("organization_id", context.organization.id).eq("id", sessionId);
  await context.supabase.from("intake_issues").delete().eq("organization_id", context.organization.id).eq("intake_session_id", sessionId);
  await context.supabase.from("intake_field_candidates").delete().eq("organization_id", context.organization.id).eq("intake_session_id", sessionId);
  const compilation = buildRedeHorizonteDocumentIntake(documents);
  const rows = compilation.candidates.map((candidate) => ({organization_id: context.organization.id, intake_session_id: sessionId, source_document_id: candidate.sourceDocumentId, extractor_key: candidate.key, field_path: candidate.fieldPath, field_group: candidate.fieldGroup, label: candidate.label, raw_value: candidate.rawValue, normalized_value: candidate.normalizedValue as Json, value_type: candidate.valueType, unit: candidate.unit ?? null, currency: candidate.currency ?? null, period_start: candidate.periodStart ?? null, period_end: candidate.periodEnd ?? null, information_class: candidate.informationClass, evidence_rank: candidate.evidenceRank, source_anchor: candidate.sourceAnchor as Json, confidence: candidate.confidence, extraction_method: candidate.extractionMethod, is_primary: candidate.isPrimary ?? false, created_by: context.userId}));
  let inserted: Array<{id: string; extractor_key: string}> = [];
  if (rows.length) {
    const result = await context.supabase.from("intake_field_candidates").insert(rows).select("id, extractor_key");
    if (result.error || !result.data) redirect(workspaceIntakeUrl(locale, sessionId, "processing"));
    inserted = result.data;
  }
  const idByKey = new Map(inserted.map((candidate) => [candidate.extractor_key, candidate.id]));
  const issueRows = compilation.issues.map((issue) => ({organization_id: context.organization.id, intake_session_id: sessionId, issue_type: issue.type, priority: issue.priority, field_group: issue.fieldGroup ?? null, field_path: issue.fieldPath ?? null, candidate_ids: (issue.candidateKeys ?? []).map((key) => idByKey.get(key)).filter((id): id is string => Boolean(id)), title: issue.title, description: issue.description, resolution_hint: issue.resolutionHint ?? null}));
  if (issueRows.length) {
    const {error: issueError} = await context.supabase.from("intake_issues").insert(issueRows);
    if (issueError) redirect(workspaceIntakeUrl(locale, sessionId, "processing"));
  }
  await context.supabase.from("source_documents").update({processing_status: "ready"}).eq("organization_id", context.organization.id).eq("intake_session_id", sessionId);
  await context.supabase.from("document_intake_sessions").update({status: "review_ready", processing_completed_at: new Date().toISOString(), result_summary: {fixture: "rede_horizonte_v1", fixture_matched: compilation.fixtureMatched, documents: documents.length, candidates: rows.length, issues: issueRows.length, missing_files: compilation.missingFiles}}).eq("organization_id", context.organization.id).eq("id", sessionId);
  redirect(workspaceIntakeUrl(locale, sessionId));
}

export async function acceptWorkspaceIntakeCandidates(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const context = await workspaceIntakeContext(locale, sessionId);
  const {error} = await context.supabase.from("intake_field_candidates").update({review_state: "accepted", reviewed_by: context.userId, reviewed_at: new Date().toISOString()}).eq("organization_id", context.organization.id).eq("intake_session_id", sessionId).eq("is_primary", true).eq("review_state", "proposed").gte("confidence", 0.95);
  if (error) redirect(workspaceIntakeUrl(locale, sessionId, "save"));
  redirect(workspaceIntakeUrl(locale, sessionId));
}

export async function reviewWorkspaceIntakeCandidate(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const candidateId = value(formData, "candidate_id");
  const decision = value(formData, "decision");
  const context = await workspaceIntakeContext(locale, sessionId);
  if (!candidateId || !["accept", "edit", "reject", "not_applicable"].includes(decision)) redirect(workspaceIntakeUrl(locale, sessionId, "validation"));
  const {data: candidate} = await context.supabase.from("intake_field_candidates").select("id, field_path, value_type, normalized_value").eq("organization_id", context.organization.id).eq("intake_session_id", sessionId).eq("id", candidateId).maybeSingle();
  if (!candidate) redirect(workspaceIntakeUrl(locale, sessionId, "validation"));
  let normalized = candidate.normalized_value;
  if (decision === "edit") {
    const raw = value(formData, "normalized_value");
    if (candidate.value_type === "number") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) redirect(workspaceIntakeUrl(locale, sessionId, "validation"));
      normalized = parsed;
    } else if (candidate.value_type === "boolean") normalized = raw === "true";
    else if (candidate.value_type === "list") normalized = raw.split(",").map((item) => item.trim()).filter(Boolean);
    else normalized = raw;
  }
  if (decision === "accept" || decision === "edit") await context.supabase.from("intake_field_candidates").update({is_primary: false}).eq("organization_id", context.organization.id).eq("intake_session_id", sessionId).eq("field_path", candidate.field_path).neq("id", candidateId);
  const {error} = await context.supabase.from("intake_field_candidates").update({normalized_value: normalized, review_state: decision === "accept" ? "accepted" : decision === "edit" ? "edited" : decision, is_primary: decision === "accept" || decision === "edit", extraction_method: decision === "edit" ? "user_entry" : undefined, reviewer_comment: value(formData, "comment") || null, reviewed_by: context.userId, reviewed_at: new Date().toISOString()}).eq("organization_id", context.organization.id).eq("intake_session_id", sessionId).eq("id", candidateId);
  if (error) redirect(workspaceIntakeUrl(locale, sessionId, "save"));
  redirect(workspaceIntakeUrl(locale, sessionId));
}

export async function resolveWorkspaceIntakeIssue(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const issueId = value(formData, "issue_id");
  const context = await workspaceIntakeContext(locale, sessionId);
  const {error} = await context.supabase.from("intake_issues").update({status: "resolved", resolved_by: context.userId, resolved_at: new Date().toISOString()}).eq("organization_id", context.organization.id).eq("intake_session_id", sessionId).eq("id", issueId);
  if (error) redirect(workspaceIntakeUrl(locale, sessionId, "save"));
  redirect(workspaceIntakeUrl(locale, sessionId));
}

export async function confirmWorkspaceDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const context = await workspaceIntakeContext(locale, sessionId);
  if (value(formData, "confirmation") !== "confirmed") redirect(workspaceIntakeUrl(locale, sessionId, "confirmation"));
  const {data: candidates} = await context.supabase.from("intake_field_candidates").select("*").eq("organization_id", context.organization.id).eq("intake_session_id", sessionId).in("review_state", ["accepted", "edited"]).eq("is_primary", true);
  const byPath = new Map((candidates ?? []).map((candidate) => [candidate.field_path, candidate]));
  const textAt = (path: string) => { const found = byPath.get(path)?.normalized_value; return typeof found === "string" || typeof found === "number" ? String(found) : ""; };
  const numberAt = (path: string) => { const found = byPath.get(path)?.normalized_value; return typeof found === "number" ? found : 0; };
  const legalName = textAt("company.legal_name");
  const purpose = textAt("transaction.purpose");
  const amount = numberAt("transaction.requested_amount");
  if (!legalName || !purpose || amount <= 0) redirect(workspaceIntakeUrl(locale, sessionId, "confirmation"));
  const {data: opportunityId, error: opportunityError} = await context.supabase.rpc("create_opportunity_intake", {p_organization_id: context.organization.id, p_legal_name: legalName, p_sector: textAt("company.sector"), p_purpose: purpose, p_requested_amount: amount, p_currency: "BRL", p_desired_term_months: null as unknown as number, p_output_locale: locale});
  if (opportunityError || !opportunityId) redirect(workspaceIntakeUrl(locale, sessionId, "save"));
  const {data: opportunity} = await context.supabase.from("opportunities").select("company_id, capital_request_id").eq("organization_id", context.organization.id).eq("id", opportunityId).single();
  if (!opportunity) redirect(workspaceIntakeUrl(locale, sessionId, "save"));
  await context.supabase.from("companies").update({display_name: textAt("company.display_name") || legalName, website: textAt("company.website") || null, sector: textAt("company.sector") || null, subsector: textAt("company.subsector") || null, headquarters_city: textAt("company.city") || null, headquarters_state: textAt("company.state") || null}).eq("organization_id", context.organization.id).eq("id", opportunity.company_id);
  const evidenceRows = (candidates ?? []).map((candidate) => ({organization_id: context.organization.id, opportunity_id: opportunityId, source_document_id: candidate.source_document_id, fact_type: candidate.field_path, label: candidate.label, value_numeric: typeof candidate.normalized_value === "number" ? candidate.normalized_value : null, value_text: typeof candidate.normalized_value === "number" ? null : typeof candidate.normalized_value === "string" ? candidate.normalized_value : JSON.stringify(candidate.normalized_value), unit: candidate.unit, currency: candidate.currency, period_start: candidate.period_start, period_end: candidate.period_end, confidence: candidate.confidence, review_state: "approved", source_anchor: {...(candidate.source_anchor as Record<string, Json>), raw_value: candidate.raw_value, normalized_value: candidate.normalized_value, information_class: candidate.information_class, extraction_method: candidate.extraction_method} as Json, created_by: context.userId, reviewed_by: context.userId, reviewed_at: candidate.reviewed_at ?? new Date().toISOString()}));
  if (evidenceRows.length) {
    const {error: evidenceError} = await context.supabase.from("evidence_facts").insert(evidenceRows);
    if (evidenceError) redirect(workspaceIntakeUrl(locale, sessionId, "save"));
  }
  await context.supabase.from("source_documents").update({opportunity_id: opportunityId}).eq("organization_id", context.organization.id).eq("intake_session_id", sessionId);
  await context.supabase.from("document_intake_sessions").update({status: "confirmed", opportunity_id: opportunityId, confirmed_at: new Date().toISOString()}).eq("organization_id", context.organization.id).eq("id", sessionId);
  redirect(`/${locale}/app/opportunities/${opportunityId}`);
}

export async function createOpportunity(formData: FormData) {
  const locale = localeFrom(formData);
  const {supabase, organization} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);
  const amount = value(formData, "requested_amount").replace(",", ".");
  const term = Number(value(formData, "desired_term_months"));

  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(amount) || !Number.isInteger(term) || term < 1 || term > 360) {
    redirect(`/${locale}/app/new?error=1`);
  }

  const {data, error} = await supabase.rpc("create_opportunity_intake", {
    p_organization_id: organization.id,
    p_legal_name: value(formData, "legal_name"),
    p_sector: value(formData, "sector"),
    p_purpose: value(formData, "purpose"),
    // PostgREST accepts numeric strings and preserves decimal precision.
    p_requested_amount: amount as unknown as number,
    p_currency: value(formData, "currency"),
    p_desired_term_months: term,
    p_output_locale: locale,
  });

  if (error || !data) redirect(`/${locale}/app/new?error=1`);
  const sessionId = value(formData, "session_id");
  if (sessionId) {
    const {data: session} = await supabase.from("document_intake_sessions").select("id").eq("organization_id", organization.id).eq("id", sessionId).maybeSingle();
    if (session) {
      await supabase.from("source_documents").update({opportunity_id: data}).eq("organization_id", organization.id).eq("intake_session_id", sessionId);
      await supabase.from("document_intake_sessions").update({status: "confirmed", opportunity_id: data, confirmed_at: new Date().toISOString()}).eq("organization_id", organization.id).eq("id", sessionId);
    }
  }
  redirect(`/${locale}/app/opportunities/${data}`);
}
