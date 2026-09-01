"use server";

import {createHash, randomUUID} from "node:crypto";

import {redirect} from "next/navigation";
import {z} from "zod";
import {diagnosticConfirmationReady} from "@offroad/case-understanding";
import {capitalProjectJobSchema} from "@offroad/work-plan";

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
import {canStartPreliminaryUnderstanding, dealBriefFormSchema, saveDealBrief, toDealBrief} from "@/lib/intake/deal-brief";
import {normalizeCompanyWebsite} from "@/lib/intake/company-profile";
import {prepareIntakeRequestLadders} from "@/lib/intake/replay";
import type {IntakeErrorCode} from "@/lib/intake/types";
import type {Json} from "@/types/database";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData): AppLocale {
  const raw = value(formData, "locale");
  return routing.locales.includes(raw as AppLocale) ? raw as AppLocale : routing.defaultLocale;
}

type GuidedStep = "company" | "operation" | "preliminary" | "documents";

// PostgREST accepts SQL NULL for nullable function parameters, while generated
// function argument types do not encode PostgreSQL nullability.
const guidedCompanySchema = z.object({
  name: z.union([z.literal(""), z.string().trim().min(2).max(160)]),
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
  const parsedEntryJob = capitalProjectJobSchema.safeParse(value(formData, "entry_job"));
  const entryJob = parsedEntryJob.success ? parsedEntryJob.data : "capital_planning";
  const entryJobQuery = `job=${entryJob}`;
  const existingSessionId = value(formData, "session_id");
  const projectSetupUrl = existingSessionId
    ? `/${locale}/app/new?mode=documents&session=${existingSessionId}&setup=project`
    : `/${locale}/app/new?${entryJobQuery}&setup=project`;
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
    : await supabase.rpc("start_workspace_capital_project", {
        p_locale: locale,
        p_project_name: parsed.data.projectName,
        p_identity_policy: parsed.data.identityPolicy,
        p_representation_declared: true,
        p_entry_job: entryJob,
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
  const parsedEntryJob = capitalProjectJobSchema.safeParse(value(formData, "entry_job"));
  const entryJob = parsedEntryJob.success ? parsedEntryJob.data : "capital_planning";
  const projectSetupUrl = `/${locale}/app/new?job=${entryJob}&setup=project`;
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
  if (!parsed.success) redirect(`/${locale}/app/new?job=${entryJob}&setup=terms&error=validation`);

  // A later financing asks for a fresh, explicit acknowledgement in the UI,
  // while the canonical legal acceptance remains organization-scoped and immutable.
  // The project setup page rechecks that canonical record before it is rendered.
  if (value(formData, "terms_acceptance_recorded") === "confirmed") {
    redirect(projectSetupUrl);
  }

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);
  const {error} = await supabase.rpc("accept_private_workspace_terms", {
    p_locale: locale,
    p_signatory_name: parsed.data.signatoryName,
    p_signatory_title: parsed.data.signatoryTitle,
    p_terms_agreed: true,
    p_information_rights_declared: true,
  });
  if (error) redirect(`/${locale}/app/new?job=${entryJob}&setup=terms&error=save`);
  redirect(projectSetupUrl);
}

export async function saveWorkspaceGuidedCompanyProfile(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const parsed = guidedCompanySchema.safeParse({
    name: value(formData, "company_name"),
    legalName: value(formData, "legal_name"),
    website: normalizeCompanyWebsite(value(formData, "website")),
    description: value(formData, "description"),
    identifier: value(formData, "legal_identifier").replace(/[^0-9A-Za-z]/g, ""),
  });
  if (!parsed.success) redirect(intakeUrl(locale, sessionId, "validation", "company"));

  const identifierHashHex = parsed.data.identifier
    ? createHash("sha256").update(parsed.data.identifier).digest("hex")
    : null;
  const profile = {
    ...(parsed.data.name ? {name: parsed.data.name} : {}),
    ...(parsed.data.legalName ? {legal_name: parsed.data.legalName} : {}),
    ...(parsed.data.website ? {website: parsed.data.website} : {}),
    ...(parsed.data.description ? {description: parsed.data.description} : {}),
    ...(identifierHashHex ? {
      identifier_hash_hex: identifierHashHex,
      identifier_last4: parsed.data.identifier.slice(-4).toUpperCase(),
    } : {}),
  } satisfies Record<string, Json>;
  const {error} = await runtime.supabase.rpc("save_project_company_context", {
    p_session_id: runtime.sessionId,
    p_profile: profile,
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
  redirect(intakeUrl(locale, sessionId, outcome.ok ? undefined : outcome.error, "operation"));
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

/**
 * Records the company's review of the compiled case and rebuilds the diagnosis.
 *
 * The feedback remains a company statement, never a reconciled fact. It may correct framing or
 * point the desk to an error, but it cannot overwrite documentary evidence or a calculation.
 */
export async function reviseWorkspaceDiagnosticCase(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const parsed = z.string().trim().min(3).max(4000).safeParse(value(formData, "case_feedback"));
  if (!parsed.success) redirect(intakeUrl(locale, sessionId, "validation"));

  const {error} = await runtime.supabase.rpc("record_intake_information_command", {
    p_organization_id: runtime.organizationId,
    p_session_id: sessionId,
    p_event_id: randomUUID(),
    p_requirement_id: "case_review_feedback",
    p_answer: parsed.data,
    p_response: "provided",
    p_note: locale === "pt-BR"
      ? "Orientação da companhia para revisar o case diagnóstico."
      : "Company instruction for revising the diagnostic case.",
  });
  if (error) redirect(intakeUrl(locale, sessionId, "save"));

  const processing = await processIntakeSession(runtime);
  redirect(intakeUrl(locale, sessionId, processing.ok ? undefined : processing.error));
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

  // The opportunity is born only after the user accepted the first read and the later diagnostic
  // loop closed its material blockers. The database repeats both checks so this form cannot be
  // bypassed by calling the RPC directly.
  const [{data: preliminary}, {data: session}] = await Promise.all([
    runtime.supabase
      .from("preliminary_understandings")
      .select("id")
      .eq("organization_id", runtime.organizationId)
      .eq("intake_session_id", sessionId)
      .eq("status", "confirmed")
      .limit(1)
      .maybeSingle(),
    runtime.supabase
      .from("document_intake_sessions")
      .select("result_summary")
      .eq("organization_id", runtime.organizationId)
      .eq("id", sessionId)
      .maybeSingle(),
  ]);
  const summary = session?.result_summary && typeof session.result_summary === "object" && !Array.isArray(session.result_summary)
    ? session.result_summary as Record<string, unknown>
    : {};
  const caseState = summary.case_state && typeof summary.case_state === "object" && !Array.isArray(summary.case_state)
    ? summary.case_state as Record<string, unknown>
    : {};
  const readiness = caseState.readiness && typeof caseState.readiness === "object" && !Array.isArray(caseState.readiness)
    ? caseState.readiness as Record<string, unknown>
    : {};
  const diagnosticCanBeConfirmed = Array.isArray(readiness.blockers)
    && diagnosticConfirmationReady({blockers: readiness.blockers});
  if (!preliminary || !diagnosticCanBeConfirmed) {
    redirect(intakeUrl(locale, sessionId, "confirmation", "documents"));
  }
  const outcome = await confirmIntakeCase(runtime);
  if (!outcome.ok) redirect(intakeUrl(locale, sessionId, outcome.error));

  // `confirm_document_intake` atomically countersigns the exact worker snapshot and creates the
  // opportunity. Only after that transaction commits may the structuring DAG be enqueued.
  const {error: queueError} = await runtime.supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: runtime.organizationId,
    p_session_id: sessionId,
    p_trigger_source: "understanding_confirmed",
  });
  redirect(`/${locale}/app/opportunities/${outcome.value.opportunityId}?notice=${queueError ? "queue_failed" : "structure_started"}`);
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
  if (!parsed.success) redirect(intakeUrl(locale, sessionId, "validation", "operation"));

  const brief = toDealBrief(parsed.data);
  if (!brief) redirect(intakeUrl(locale, sessionId, "validation", "operation"));

  const {count: documentCount, error: documentCountError} = await runtime.supabase
    .from("source_documents")
    .select("id", {count: "exact", head: true})
    .eq("organization_id", runtime.organizationId)
    .eq("intake_session_id", sessionId);
  if (documentCountError) redirect(intakeUrl(locale, sessionId, "save", "operation"));
  if (!canStartPreliminaryUnderstanding(brief, documentCount ?? 0)) {
    redirect(intakeUrl(locale, sessionId, "validation", "operation"));
  }

  const saved = await saveDealBrief({
    supabase: runtime.supabase,
    organizationId: runtime.organizationId,
    sessionId,
    brief,
  });
  if (!saved.ok) redirect(intakeUrl(locale, sessionId, "save", "operation"));
  const processing = await processIntakeSession(runtime);
  redirect(intakeUrl(locale, sessionId, processing.ok ? undefined : processing.error, processing.ok ? "preliminary" : "operation"));
}

/** Confirms only the first company/operation read and then compiles the tailored evidence list. */
export async function decideWorkspacePreliminaryUnderstanding(formData: FormData) {
  const locale = localeFrom(formData);
  const sessionId = value(formData, "session_id");
  const runtime = await workspaceRuntime(locale, sessionId);
  const parsed = z.object({
    objectFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["confirmed", "changes_requested"]),
    correction: z.string().trim().max(4000),
  }).safeParse({
    objectFingerprint: value(formData, "object_fingerprint"),
    decision: value(formData, "decision"),
    correction: value(formData, "correction"),
  });
  if (!parsed.success || (parsed.data.decision === "changes_requested" && parsed.data.correction.length < 3)) {
    redirect(intakeUrl(locale, sessionId, "validation", "preliminary"));
  }
  // Compile before committing the confirmation so a projection failure cannot leave the user
  // with a confirmed gate and no next screen. The list remains invisible until the exact object
  // is confirmed below.
  if (parsed.data.decision === "confirmed") {
    try {
      await prepareIntakeRequestLadders({
        supabase: runtime.supabase,
        organizationId: runtime.organizationId,
        sessionId,
      });
    } catch {
      redirect(intakeUrl(locale, sessionId, "save", "preliminary"));
    }
  }
  const {error} = await runtime.supabase.rpc("decide_preliminary_understanding", {
    p_organization_id: runtime.organizationId,
    p_session_id: sessionId,
    p_object_fingerprint: parsed.data.objectFingerprint,
    p_decision: parsed.data.decision,
    p_correction: parsed.data.correction || undefined,
  });
  if (error) redirect(intakeUrl(locale, sessionId, "save", "preliminary"));
  if (parsed.data.decision === "changes_requested") redirect(intakeUrl(locale, sessionId, undefined, "operation"));
  redirect(intakeUrl(locale, sessionId, undefined, "documents"));
}
