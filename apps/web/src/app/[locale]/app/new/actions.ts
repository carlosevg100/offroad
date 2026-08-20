"use server";

import {redirect} from "next/navigation";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {
  acceptHighConfidenceCandidates,
  confirmIntakeCase,
  loadIntakeSession,
  processIntakeSession,
  recordInformationAnswer as recordAnswer,
  setIntakeArchetype as setArchetype,
  removeIntakeDocument,
  resolveIntakeIssue,
  reviewIntakeCandidate,
  startIntakeSession,
  type IntakeRuntime,
} from "@/lib/intake/server";
import {dealBriefFormSchema, saveDealBrief, toDealBrief} from "@/lib/intake/deal-brief";
import type {IntakeErrorCode} from "@/lib/intake/types";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData): AppLocale {
  const raw = value(formData, "locale");
  return routing.locales.includes(raw as AppLocale) ? raw as AppLocale : routing.defaultLocale;
}

function intakeUrl(locale: string, sessionId: string, error?: IntakeErrorCode) {
  return `/${locale}/app/new?mode=documents&session=${sessionId}${error ? `&error=${error}` : ""}`;
}

/** Resolves the tenant scope from the verified session and checks the intake session belongs to it. */
async function workspaceRuntime(locale: AppLocale, sessionId: string): Promise<IntakeRuntime> {
  const context = await requireWorkspace(locale);
  if (context.organization.organization_type === "capital_provider") redirect(`/${locale}/app`);
  if (!sessionId) redirect(`/${locale}/app/new?error=session`);
  const runtime: IntakeRuntime = {supabase: context.supabase, organizationId: context.organization.id, userId: context.userId, locale, sessionId};
  const session = await loadIntakeSession(runtime);
  if (!session) redirect(`/${locale}/app/new?error=session`);
  return runtime;
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
  const outcome = await startIntakeSession({supabase, organizationId: organization.id, userId, locale, journey: organization.organization_type === "originator" ? "originator" : "company"});
  if (!outcome.ok) redirect(`/${locale}/app/new?error=${outcome.error}`);
  redirect(intakeUrl(locale, outcome.value));
}

export async function setWorkspaceIntakeOperation(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await setArchetype(runtime, value(formData, "archetype"));
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function saveWorkspaceIntakeAnswer(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await recordAnswer(runtime, {
    requirementId: value(formData, "requirement_id"),
    answer: value(formData, "answer"),
    response: value(formData, "response"),
    note: value(formData, "note"),
  });
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function processWorkspaceDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await processIntakeSession(runtime);
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function acceptWorkspaceIntakeCandidates(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await acceptHighConfidenceCandidates(runtime);
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function reviewWorkspaceIntakeCandidate(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await reviewIntakeCandidate(runtime, {candidateId: value(formData, "candidate_id"), decision: value(formData, "decision"), rawValue: value(formData, "normalized_value"), comment: value(formData, "comment")});
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function resolveWorkspaceIntakeIssue(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await resolveIntakeIssue(runtime, {issueId: value(formData, "issue_id"), status: value(formData, "issue_status")});
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function removeWorkspaceIntakeDocument(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await removeIntakeDocument(runtime, value(formData, "document_id"));
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function confirmWorkspaceDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  if (value(formData, "confirmation") !== "confirmed") redirect(intakeUrl(locale, sessionId, "confirmation"));
  const outcome = await confirmIntakeCase(runtime);
  if (!outcome.ok) redirect(intakeUrl(locale, sessionId, outcome.error));
  redirect(`/${locale}/app/opportunities/${outcome.value.opportunityId}`);
}

export async function createOpportunity(formData: FormData) {
  const locale = localeFrom(formData);
  const {supabase, organization} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);
  const amount = value(formData, "requested_amount").replace(",", ".");
  const term = Number(value(formData, "desired_term_months"));

  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(amount) || !Number.isInteger(term) || term < 1 || term > 360) {
    redirect(`/${locale}/app/new?mode=manual&error=validation`);
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

  if (error || !data) redirect(`/${locale}/app/new?mode=manual&error=save`);
  const sessionId = value(formData, "session_id");
  if (sessionId) {
    // Manual completion after a document session: keep the uploaded files attached to the new case.
    const {data: session} = await supabase.from("document_intake_sessions").select("id").eq("organization_id", organization.id).eq("id", sessionId).maybeSingle();
    if (session) {
      await supabase.from("source_documents").update({opportunity_id: data}).eq("organization_id", organization.id).eq("intake_session_id", sessionId);
      await supabase.from("document_intake_sessions").update({status: "confirmed", opportunity_id: data, confirmed_at: new Date().toISOString()}).eq("organization_id", organization.id).eq("id", sessionId);
    }
  }
  redirect(`/${locale}/app/opportunities/${data}`);
}

/**
 * Saves the deal brief.
 *
 * The whole form is one submit rather than a field at a time: unlike the information answers,
 * these six move together — changing the amount usually changes the tenor, and saving them
 * separately would compute a fit against a half-updated request.
 */
export async function saveWorkspaceDealBrief(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);

  const parsed = dealBriefFormSchema.safeParse({
    amount: value(formData, "amount"),
    term_months: value(formData, "term_months"),
    grace_months: value(formData, "grace_months"),
    sector: value(formData, "sector"),
    geography: value(formData, "geography"),
    instruments: formData.getAll("instruments").map(String),
    collateral_kinds: formData.getAll("collateral_kinds").map(String),
    expected_rate: value(formData, "expected_rate"),
  });
  if (!parsed.success) redirect(intakeUrl(locale, sessionId, "validation"));

  const brief = toDealBrief(parsed.data);
  if (!brief) redirect(intakeUrl(locale, sessionId, "validation"));

  const saved = await saveDealBrief({
    supabase: runtime.supabase,
    organizationId: runtime.organizationId,
    sessionId,
    brief,
  });
  redirect(intakeUrl(locale, sessionId, saved.ok ? undefined : "save"));
}
