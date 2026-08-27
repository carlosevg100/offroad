"use server";

import {redirect} from "next/navigation";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {
  acceptHighConfidenceCandidates,
  confirmIntakeCase,
  loadIntakeSession,
  processIntakeSession,
  recordInformationAnswer as recordAnswer,
  resolveAnalysisScopeSuggestion,
  revokeAdvisorAuthorization,
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

type GuidedStep = "operation" | "request" | "documents";

function intakeUrl(locale: string, sessionId: string, error?: IntakeErrorCode, step: GuidedStep = "documents") {
  return `/${locale}/app/new?mode=documents&session=${sessionId}&step=${step}${error ? `&error=${error}` : ""}`;
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

export async function startWorkspaceDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const parsed = z.object({
    projectName: z.string().trim().min(2).max(80),
    identityPolicy: z.enum(["identified_restricted", "blind_initial"]),
    representationDeclared: z.literal("confirmed"),
  }).safeParse({
    projectName: value(formData, "project_name"),
    identityPolicy: value(formData, "identity_policy"),
    representationDeclared: value(formData, "representation_declared"),
  });
  if (!parsed.success) redirect(`/${locale}/app/new?error=validation`);
  const {supabase, organization, userId} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);
  const outcome = await startIntakeSession({
    supabase,
    organizationId: organization.id,
    userId,
    locale,
    journey: organization.organization_type === "originator" ? "originator" : "company",
    projectName: parsed.data.projectName,
    identityPolicy: parsed.data.identityPolicy,
  });
  if (!outcome.ok) redirect(`/${locale}/app/new?error=${outcome.error}`);
  redirect(intakeUrl(locale, outcome.value, undefined, "operation"));
}

export async function setWorkspaceIntakeOperation(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await setArchetype(runtime, {
    archetype: value(formData, "archetype"),
    clientLegalName: value(formData, "client_legal_name"),
    authorityKind: value(formData, "authority_kind"),
    authorityReference: value(formData, "authority_reference"),
    authorityConfirmed: value(formData, "authority_confirmed") === "confirmed",
  });
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error, outcome.ok ? "request" : "operation"));
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

export async function resolveWorkspaceScopeSuggestion(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await resolveAnalysisScopeSuggestion(runtime, {
    suggestionId: value(formData, "suggestion_id"),
    decision: value(formData, "decision"),
    role: value(formData, "role"),
    reason: value(formData, "reason"),
  });
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error));
}

export async function revokeWorkspaceAdvisorAuthorization(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const outcome = await revokeAdvisorAuthorization(runtime, value(formData, "reason"));
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

/**
 * Saves the deal brief.
 *
 * The whole form is one submit rather than a field at a time: unlike the information answers,
 * these facts move together because changing the objective usually changes amount and tenor, and saving them
 * separately would compute a fit against a half-updated request.
 */
export async function saveWorkspaceDealBrief(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);

  const parsed = dealBriefFormSchema.safeParse({
    objective: value(formData, "objective"),
    amount: value(formData, "amount"),
    currency: value(formData, "currency") || undefined,
    urgency: value(formData, "urgency") || undefined,
    term_months: value(formData, "term_months"),
    grace_months: value(formData, "grace_months"),
    consequence: value(formData, "consequence"),
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
  redirect(intakeUrl(locale, sessionId, saved.ok ? undefined : "save", saved.ok ? "documents" : "request"));
}
