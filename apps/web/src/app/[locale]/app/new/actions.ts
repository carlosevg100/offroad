"use server";

import {createHash} from "node:crypto";

import {redirect} from "next/navigation";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {createClient} from "@/lib/supabase/server";
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

type GuidedStep = "company" | "operation" | "request" | "documents";

// PostgREST accepts SQL NULL for nullable function parameters, while generated
// function argument types do not encode PostgreSQL nullability.
const rpcNull = null as never;

const guidedCompanySchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200),
  website: z.union([z.literal(""), z.string().url().max(500)]),
  description: z.string().trim().max(5000),
  identifier: z.string().trim().max(40),
});

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
  const existingSessionId = value(formData, "session_id");
  const projectSetupUrl = existingSessionId
    ? `/${locale}/app/new?mode=documents&session=${existingSessionId}&setup=project`
    : `/${locale}/app/new?setup=project`;
  const parsed = z.object({
    projectName: z.string().trim().min(2).max(80),
    identityPolicy: z.enum(["identified_restricted", "blind_initial"]),
    representationDeclared: z.literal("confirmed"),
  }).safeParse({
    projectName: value(formData, "project_name"),
    identityPolicy: value(formData, "identity_policy"),
    representationDeclared: value(formData, "representation_declared"),
  });
  if (!parsed.success) redirect(`${projectSetupUrl}&error=validation`);
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);
  const {data, error} = existingSessionId
    ? await supabase.rpc("update_workspace_project", {
        p_session_id: existingSessionId,
        p_project_name: parsed.data.projectName,
        p_identity_policy: parsed.data.identityPolicy,
      })
    : await supabase.rpc("start_workspace_project", {
        p_locale: locale,
        p_project_name: parsed.data.projectName,
        p_identity_policy: parsed.data.identityPolicy,
        p_representation_declared: true,
      });
  let sessionId = data;
  if (!existingSessionId && error && (error.code === "PGRST202" || error.code === "42883")) {
    const {organization, userId} = await requireWorkspace(locale);
    const fallback = await startIntakeSession({
      supabase,
      organizationId: organization.id,
      userId,
      locale,
      journey: organization.organization_type === "originator" ? "originator" : "company",
      projectName: parsed.data.projectName,
      identityPolicy: parsed.data.identityPolicy,
    });
    if (!fallback.ok) redirect(`${projectSetupUrl}&error=${fallback.error}`);
    sessionId = fallback.value;
  } else if (error) {
    const errorCode = error.message.includes("project_name_already_in_use") ? "duplicate" : error.code === "P0002" ? "session" : "save";
    redirect(`${projectSetupUrl}&error=${errorCode}`);
  }
  if (!sessionId) {
    redirect(`${projectSetupUrl}&error=save`);
  }
  redirect(intakeUrl(locale, sessionId, undefined, "company"));
}

export async function acceptWorkspacePrivateTerms(formData: FormData) {
  const locale = localeFrom(formData);
  const parsed = z.object({
    signatoryName: z.string().trim().min(2).max(160),
    signatoryTitle: z.string().trim().min(2).max(160),
    termsAgreed: z.literal("confirmed"),
    informationRightsDeclared: z.literal("confirmed"),
  }).safeParse({
    signatoryName: value(formData, "signatory_name"),
    signatoryTitle: value(formData, "signatory_title"),
    termsAgreed: value(formData, "terms_agreed"),
    informationRightsDeclared: value(formData, "information_rights_declared"),
  });
  if (!parsed.success) redirect(`/${locale}/app/new?setup=terms&error=validation`);

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);
  const {error} = await supabase.rpc("accept_private_workspace_terms", {
    p_locale: locale,
    p_signatory_name: parsed.data.signatoryName,
    p_signatory_title: parsed.data.signatoryTitle,
    p_terms_agreed: true,
    p_information_rights_declared: true,
  });
  if (error) redirect(`/${locale}/app/new?setup=terms&error=save`);
  redirect(`/${locale}/app/new?setup=project`);
}

export async function saveWorkspaceGuidedCompanyProfile(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const parsed = guidedCompanySchema.safeParse({
    name: value(formData, "company_name"),
    legalName: value(formData, "legal_name"),
    website: value(formData, "website"),
    description: value(formData, "description"),
    identifier: value(formData, "legal_identifier").replace(/[^0-9A-Za-z]/g, ""),
  });
  if (!parsed.success) redirect(intakeUrl(locale, sessionId, "validation", "company"));

  const identifierHash = parsed.data.identifier
    ? `\\x${createHash("sha256").update(parsed.data.identifier).digest("hex")}`
    : undefined;
  const {error} = await runtime.supabase.rpc("save_project_company_profile", {
    p_session_id: runtime.sessionId,
    p_name: parsed.data.name,
    p_legal_name: parsed.data.legalName || rpcNull,
    p_website: parsed.data.website || rpcNull,
    p_description: parsed.data.description || rpcNull,
    p_identifier_hash: identifierHash ?? rpcNull,
    p_identifier_last4: parsed.data.identifier.slice(-4) || rpcNull,
  });
  redirect(intakeUrl(locale, sessionId, error ? "save" : undefined, error ? "company" : "operation"));
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
