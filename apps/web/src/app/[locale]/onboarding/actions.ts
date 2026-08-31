"use server";

import {createHash, randomUUID} from "node:crypto";

import {redirect} from "next/navigation";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {
  acceptHighConfidenceCandidates as acceptCandidates,
  confirmIntakeCase,
  loadIntakeSession,
  processIntakeSession,
  recordInformationAnswer as recordAnswer,
  resolveAnalysisScopeSuggestion,
  revokeAdvisorAuthorization,
  setIntakeArchetype as setArchetype,
  removeIntakeDocument as removeDocument,
  resolveIntakeIssue as resolveIssue,
  reviewIntakeCandidate as reviewCandidate,
  type IntakeRuntime,
} from "@/lib/intake/server";
import {dealBriefFormSchema, saveDealBrief, toDealBrief} from "@/lib/intake/deal-brief";
import {normalizeCompanyWebsite} from "@/lib/intake/company-profile";
import type {IntakeErrorCode} from "@/lib/intake/types";
import {createClient} from "@/lib/supabase/server";
import type {Json} from "@/types/database";
import {reportServerFailure} from "@/lib/observability/report";
import {prepareIntakeRequestLadders} from "@/lib/intake/replay";

type Journey = "company" | "originator" | "capital_provider";
type AnswerMap = Record<string, Json | undefined>;

// PostgREST accepts SQL NULL for nullable function parameters, but generated function argument
// types do not encode PostgreSQL parameter nullability. Keep that boundary explicit and local.
const rpcNull = null as never;

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData): AppLocale {
  const raw = value(formData, "locale");
  return routing.locales.includes(raw as AppLocale) ? raw as AppLocale : routing.defaultLocale;
}

function optional(valueToCheck: string) {
  return valueToCheck || null;
}

function csv(valueToSplit: string) {
  return valueToSplit.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 50);
}

function onboardingUrl(locale: string, error?: IntakeErrorCode | "provider" | "company" | "mandate") {
  return `/${locale}/onboarding${error ? `?error=${error}` : ""}`;
}

async function onboardingContext(locale: AppLocale) {
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/onboarding?error=provider`);

  const {data: claimsData, error: claimsError} = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) redirect(`/${locale}/login`);

  const {data: membership} = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect(`/${locale}/signup?error=session`);

  const {data: progress} = await supabase
    .from("onboarding_progress")
    .select("journey, current_step, answers, completed_at")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!progress) redirect(`/${locale}/signup?error=session`);
  if (progress.completed_at) redirect(`/${locale}/app`);

  return {
    supabase,
    userId,
    organizationId: membership.organization_id,
    journey: progress.journey as Journey,
    currentStep: progress.current_step,
    answers: (progress.answers ?? {}) as AnswerMap,
  };
}

type OnboardingContext = Awaited<ReturnType<typeof onboardingContext>>;

async function updateProgress(
  context: OnboardingContext,
  step: string,
  nextStep: string,
  patch: AnswerMap,
  locale: AppLocale,
  requestedReturnStep = "",
) {
  const isEditing = requestedReturnStep === context.currentStep && sectionIsAvailable(context.journey, step, context.answers);
  if (context.currentStep !== step && !isEditing) redirect(`/${locale}/onboarding`);
  const answers = {...context.answers, ...patch};
  delete answers.edit_return_step;
  const {error} = await context.supabase
    .from("onboarding_progress")
    .update({answers, current_step: isEditing ? requestedReturnStep : nextStep})
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.userId)
    .eq("journey", context.journey);
  if (error) redirect(`/${locale}/onboarding?error=save`);
  redirect(`/${locale}/onboarding`);
}

// ---------------------------------------------------------------------------------------------
// Document-first intake (onboarding context). The operations themselves live in
// `@/lib/intake/server` and are shared with the workspace new-case flow; these wrappers only
// resolve the onboarding scope, pick the session and translate outcomes into redirects.
// ---------------------------------------------------------------------------------------------

/** Session id comes from the form when present, otherwise from the persisted onboarding answers. */
async function onboardingIntakeRuntime(locale: AppLocale, formData: FormData): Promise<{runtime: IntakeRuntime; context: OnboardingContext}> {
  const context = await onboardingContext(locale);
  if (context.journey === "capital_provider") redirect(onboardingUrl(locale, "step"));
  const sessionId = value(formData, "session_id") || (typeof context.answers.intake_session_id === "string" ? context.answers.intake_session_id : "");
  if (!sessionId) redirect(onboardingUrl(locale, "step"));
  const runtime: IntakeRuntime = {supabase: context.supabase, organizationId: context.organizationId, userId: context.userId, locale, sessionId};
  const session = await loadIntakeSession(runtime);
  if (!session) redirect(onboardingUrl(locale, "session"));
  return {runtime, context};
}

export async function startDocumentIntake(formData: FormData) {
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
  if (!parsed.success) redirect(`/${locale}/onboarding?setup=project&error=validation`);

  const supabase = await createClient();
  if (!supabase) redirect(onboardingUrl(locale, "provider"));
  const {data: sessionId, error} = await supabase.rpc("start_onboarding_project", {
    p_locale: locale,
    p_project_name: parsed.data.projectName,
    p_identity_policy: parsed.data.identityPolicy,
    p_representation_declared: true,
  });
  if (error) {
    reportServerFailure({step: "intake.start_onboarding_project", error});
    const errorCode = error.message.includes("project_name_already_in_use") ? "duplicate" : error.code === "P0002" ? "step" : "session";
    redirect(`/${locale}/onboarding?setup=project&error=${errorCode}`);
  }
  redirect(`/${locale}/app/new?mode=documents&session=${sessionId}&step=company`);
}

export async function acceptPrivateWorkspaceTerms(formData: FormData) {
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
  if (!parsed.success) redirect(`/${locale}/onboarding?setup=terms&error=validation`);

  const supabase = await createClient();
  if (!supabase) redirect(onboardingUrl(locale, "provider"));
  const {error} = await supabase.rpc("accept_private_workspace_terms", {
    p_locale: locale,
    p_signatory_name: parsed.data.signatoryName,
    p_signatory_title: parsed.data.signatoryTitle,
    p_terms_agreed: true,
    p_information_rights_declared: true,
  });
  if (error) {
    reportServerFailure({step: "intake.accept_private_workspace_terms", error});
    redirect(`/${locale}/onboarding?setup=terms&error=save`);
  }
  redirect(`/${locale}/onboarding?setup=project`);
}

const guidedCompanySchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200),
  website: z.union([z.literal(""), z.string().url().max(500)]),
  description: z.string().trim().max(5000),
  identifier: z.string().trim().max(40),
});

/** Saves the first guided milestone. Company context can come from prose or from a document
 * already uploaded into the session; the database command validates that at least one exists. */
export async function saveGuidedCompanyProfile(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const parsed = guidedCompanySchema.safeParse({
    name: value(formData, "company_name"),
    legalName: value(formData, "legal_name"),
    website: normalizeCompanyWebsite(value(formData, "website")),
    description: value(formData, "description"),
    identifier: value(formData, "legal_identifier").replace(/[^0-9A-Za-z]/g, ""),
  });
  if (!parsed.success) redirect(`/${locale}/onboarding?stage=company&error=validation`);

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
  if (error) {
    reportServerFailure({step: "intake.save_guided_company", error});
    redirect(`/${locale}/onboarding?stage=company&error=${error.code === "22023" ? "validation" : "save"}`);
  }
  redirect(`/${locale}/onboarding?stage=operation`);
}

export async function setIntakeOperation(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await setArchetype(runtime, {
    archetype: value(formData, "archetype"),
    clientLegalName: value(formData, "client_legal_name"),
    authorityKind: value(formData, "authority_kind"),
    authorityReference: value(formData, "authority_reference"),
    authorityConfirmed: value(formData, "authority_confirmed") === "confirmed",
  });
  redirect(outcome.ok ? `/${locale}/onboarding?stage=request` : onboardingUrl(locale, outcome.error));
}

/**
 * Saves the deal brief during onboarding.
 *
 * One submit for the whole form rather than a field at a time: unlike the information answers,
 * these facts move together because changing the objective usually changes amount and tenor, and saving them
 * separately would assess fit against a half-updated request.
 */
export async function saveDealBriefAction(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);

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
  if (!parsed.success) redirect(onboardingUrl(locale, "validation"));

  const brief = toDealBrief(parsed.data);
  if (!brief) redirect(onboardingUrl(locale, "validation"));

  const saved = await saveDealBrief({
    supabase: runtime.supabase,
    organizationId: runtime.organizationId,
    sessionId: runtime.sessionId,
    brief,
  });
  redirect(saved.ok ? `/${locale}/onboarding?stage=documents` : onboardingUrl(locale, "save"));
}

export async function submitAgentMessageAction(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const content = value(formData, "message");
  if (content.length < 1 || content.length > 4000) redirect(onboardingUrl(locale, "validation"));
  const {error} = await runtime.supabase.rpc("submit_agent_message", {
    p_organization_id: runtime.organizationId,
    p_session_id: runtime.sessionId,
    p_message_id: randomUUID(),
    p_content: content,
    p_locale: locale,
  });
  if (error) {
    reportServerFailure({step: "agent.submit_message", error});
    redirect(onboardingUrl(locale, "save"));
  }
  redirect(onboardingUrl(locale));
}

export async function decideAgentProposalAction(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const proposalId = value(formData, "proposal_id");
  const decision = value(formData, "decision");
  if (!z.string().uuid().safeParse(proposalId).success || !["accept", "reject"].includes(decision)) {
    redirect(onboardingUrl(locale, "validation"));
  }

  if (decision === "reject") {
    const {error} = await runtime.supabase.rpc("decide_agent_change_proposal", {
      p_organization_id: runtime.organizationId,
      p_proposal_id: proposalId,
      p_decision: "rejected",
      p_reason: "rejected_by_user",
    });
    if (error) {
      reportServerFailure({step: "agent.reject_proposal", error});
      redirect(onboardingUrl(locale, "save"));
    }
    redirect(onboardingUrl(locale));
  }

  const {data, error} = await runtime.supabase.rpc("accept_and_apply_agent_operation_brief_proposal", {
    p_organization_id: runtime.organizationId,
    p_proposal_id: proposalId,
    p_event_id: randomUUID(),
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data) || data.status !== "applied") {
    reportServerFailure({step: "agent.accept_apply_proposal", error: error ?? {message: "proposal was not applied"}});
    redirect(onboardingUrl(locale, "save"));
  }
  try {
    await prepareIntakeRequestLadders({
      supabase: runtime.supabase,
      organizationId: runtime.organizationId,
      sessionId: runtime.sessionId,
    });
  } catch (ladderError) {
    reportServerFailure({
      step: "agent.prepare_request_ladders",
      error: {message: ladderError instanceof Error ? ladderError.message : "request ladder refresh failed"},
    });
  }
  redirect(onboardingUrl(locale));
}

export async function saveIntakeAnswer(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await recordAnswer(runtime, {
    requirementId: value(formData, "requirement_id"),
    answer: value(formData, "answer"),
    response: value(formData, "response"),
    note: value(formData, "note"),
  });
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

export async function resolveOnboardingScopeSuggestion(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await resolveAnalysisScopeSuggestion(runtime, {
    suggestionId: value(formData, "suggestion_id"),
    decision: value(formData, "decision"),
    role: value(formData, "role"),
    reason: value(formData, "reason"),
  });
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

export async function revokeOnboardingAdvisorAuthorization(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await revokeAdvisorAuthorization(runtime, value(formData, "reason"));
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

export async function processDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await processIntakeSession(runtime);
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

export async function acceptHighConfidenceCandidates(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await acceptCandidates(runtime);
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

export async function reviewIntakeCandidate(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await reviewCandidate(runtime, {candidateId: value(formData, "candidate_id"), decision: value(formData, "decision"), rawValue: value(formData, "normalized_value"), comment: value(formData, "comment")});
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

export async function removeIntakeDocument(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await removeDocument(runtime, value(formData, "document_id"));
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

export async function resolveIntakeIssue(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime} = await onboardingIntakeRuntime(locale, formData);
  const outcome = await resolveIssue(runtime, {issueId: value(formData, "issue_id"), status: value(formData, "issue_status")});
  redirect(onboardingUrl(locale, outcome.ok ? undefined : outcome.error));
}

/**
 * Creates the case from the reviewed candidates and moves onboarding to the review step.
 * Case creation is shared with the workspace flow; only the onboarding bookkeeping
 * (organization profile for company journeys, progress answers) lives here.
 */
export async function confirmDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const {runtime, context} = await onboardingIntakeRuntime(locale, formData);
  if (value(formData, "confirmation") !== "confirmed") redirect(onboardingUrl(locale, "confirmation"));

  const outcome = await confirmIntakeCase(runtime);
  if (!outcome.ok) redirect(onboardingUrl(locale, outcome.error));
  const {derived, opportunityId, companyId, capitalRequestId, documentCount} = outcome.value;

  if (context.journey === "company" && derived.legalName) {
    const {error} = await context.supabase.from("organizations").update({
      name: derived.displayName,
      legal_name: derived.legalName,
      website: derived.website,
      country_code: "BR",
      state_code: derived.state,
      city: derived.city,
      sector: derived.sector,
      subsector: derived.subsector,
    }).eq("id", context.organizationId);
    if (error) redirect(onboardingUrl(locale, "save"));
  }

  const identifierLast4 = derived.identifier ? derived.identifier.slice(-4) : null;
  const progressPatch: AnswerMap = {
    ...context.answers,
    company_id: companyId,
    capital_request_id: capitalRequestId,
    opportunity_id: opportunityId,
    documents_uploaded: documentCount,
    funding: {purpose_category: null, purpose_summary: derived.purpose, requested_amount: derived.requestedAmount, currency: derived.currency, collateral_summary: null},
    organization: context.journey === "company"
      ? {name: derived.displayName, legal_name: derived.legalName, website: derived.website, country_code: "BR", state_code: derived.state, city: derived.city, sector: derived.sector, subsector: derived.subsector, identifier_last4: identifierLast4}
      : context.answers.organization,
    advised_company: context.journey === "originator"
      ? {display_name: derived.displayName, legal_name: derived.legalName, website: derived.website, sector: derived.sector, subsector: derived.subsector}
      : context.answers.advised_company,
  };
  const {error: progressError} = await context.supabase.from("onboarding_progress").update({answers: progressPatch, current_step: "review"}).eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("journey", context.journey);
  if (progressError) redirect(onboardingUrl(locale, "save"));
  redirect(onboardingUrl(locale));
}

const organizationSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200),
  website: z.string().trim().max(500),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
  stateCode: z.string().trim().max(8),
  city: z.string().trim().max(120),
  sector: z.string().trim().max(160),
  subsector: z.string().trim().max(160),
  identifier: z.string().trim().max(40),
  phone: z.string().trim().max(40),
});

export async function saveOrganizationStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey !== "capital_provider") redirect(`/${locale}/onboarding?error=step`);
  const parsed = organizationSchema.safeParse({
    organizationName: value(formData, "organization_name"),
    legalName: value(formData, "legal_name"),
    website: value(formData, "website"),
    countryCode: value(formData, "country_code").toUpperCase() || "BR",
    stateCode: value(formData, "state_code").toUpperCase(),
    city: value(formData, "city"),
    sector: value(formData, "sector"),
    subsector: value(formData, "subsector"),
    identifier: value(formData, "legal_identifier").replace(/[^0-9A-Za-z]/g, ""),
    phone: value(formData, "phone"),
  });
  if (!parsed.success) redirect(`/${locale}/onboarding?error=validation`);

  const providerType = value(formData, "provider_type");
  const description = value(formData, "description");
  const {error: organizationError} = await context.supabase
    .from("organizations")
    .update({
      name: parsed.data.organizationName,
      legal_name: optional(parsed.data.legalName),
      website: optional(parsed.data.website),
      country_code: parsed.data.countryCode,
      state_code: optional(parsed.data.stateCode),
      city: optional(parsed.data.city),
      sector: optional(parsed.data.sector),
      subsector: optional(parsed.data.subsector),
      provider_type: providerType || null,
      description: optional(description),
    })
    .eq("id", context.organizationId);
  if (organizationError) redirect(`/${locale}/onboarding?error=save`);

  if (parsed.data.phone) {
    await context.supabase.from("profiles").update({phone: parsed.data.phone}).eq("id", context.userId);
  }

  await updateProgress(context, "organization", "fund", {
    organization: {
      name: parsed.data.organizationName,
      legal_name: parsed.data.legalName,
      website: parsed.data.website,
      country_code: parsed.data.countryCode,
      state_code: parsed.data.stateCode,
      city: parsed.data.city,
      sector: parsed.data.sector,
      subsector: parsed.data.subsector,
      provider_type: providerType,
      description,
      identifier_last4: parsed.data.identifier.slice(-4),
    },
  }, locale, value(formData, "return_step"));
}

export async function saveFundStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey !== "capital_provider") redirect(`/${locale}/onboarding?error=step`);
  const name = value(formData, "fund_name");
  const strategy = value(formData, "strategy");
  if (name.length < 2 || strategy.length < 2) redirect(`/${locale}/onboarding?error=validation`);
  let fundId = typeof context.answers.fund_id === "string" ? context.answers.fund_id : null;
  if (fundId) {
    const {error} = await context.supabase.from("funds").update({name, strategy}).eq("organization_id", context.organizationId).eq("id", fundId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  } else {
    const {data, error} = await context.supabase.from("funds").insert({organization_id: context.organizationId, name, strategy, status: "active", created_by: context.userId}).select("id").single();
    if (error || !data) redirect(`/${locale}/onboarding?error=save`);
    fundId = data.id;
  }
  await updateProgress(context, "fund", "mandate", {fund_id: fundId, fund: {name, strategy}}, locale, value(formData, "return_step"));
}

export async function saveMandateStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey !== "capital_provider") redirect(`/${locale}/onboarding?error=step`);
  const fundId = typeof context.answers.fund_id === "string" ? context.answers.fund_id : null;
  if (!fundId) redirect(`/${locale}/onboarding?error=fund`);
  const ticketMin = Number(value(formData, "ticket_min"));
  const ticketMax = Number(value(formData, "ticket_max"));
  if (!Number.isFinite(ticketMin) || !Number.isFinite(ticketMax) || ticketMin <= 0 || ticketMax < ticketMin) redirect(`/${locale}/onboarding?error=validation`);

  const constraints = {
    currencies: csv(value(formData, "currencies").toUpperCase()),
    geographies: csv(value(formData, "geographies")),
    ticket: {min: ticketMin, max: ticketMax},
    sectors: csv(value(formData, "sectors")),
    excluded_sectors: csv(value(formData, "excluded_sectors")),
    purposes: csv(value(formData, "purposes")),
    structure_types: csv(value(formData, "structure_types")),
    seniority: csv(value(formData, "seniority")),
    term_months: {min: Number(value(formData, "term_min")) || null, max: Number(value(formData, "term_max")) || null},
    pricing: value(formData, "pricing"),
    collateral: csv(value(formData, "collateral")),
    exclusions: value(formData, "exclusions"),
  };
  let mandateId = typeof context.answers.mandate_id === "string" ? context.answers.mandate_id : null;
  const mandatePayload = {
    constraints,
    provenance: {source: "self_declared_onboarding", reviewed_by: context.userId},
    valid_from: new Date().toISOString().slice(0, 10),
    valid_until: optional(value(formData, "valid_until")),
    confidence: 1,
    status: "draft",
    source_kind: "declared",
  };
  if (mandateId) {
    const {error} = await context.supabase.from("mandate_versions").update(mandatePayload).eq("organization_id", context.organizationId).eq("id", mandateId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  } else {
    const {data, error} = await context.supabase.from("mandate_versions").insert({...mandatePayload, organization_id: context.organizationId, fund_id: fundId, version_number: 1, created_by: context.userId}).select("id").single();
    if (error || !data) redirect(`/${locale}/onboarding?error=save`);
    mandateId = data.id;
  }
  await updateProgress(context, "mandate", "contacts", {mandate_id: mandateId, mandate: constraints}, locale, value(formData, "return_step"));
}

export async function saveContactStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey !== "capital_provider") redirect(`/${locale}/onboarding?error=step`);
  const fundId = typeof context.answers.fund_id === "string" ? context.answers.fund_id : null;
  const fullName = value(formData, "contact_name");
  const email = value(formData, "contact_email").toLowerCase();
  if (fullName.length < 2 || !z.email().safeParse(email).success) redirect(`/${locale}/onboarding?error=validation`);
  const routingCriteria = {
    sectors: csv(value(formData, "routing_sectors")),
    geographies: csv(value(formData, "routing_geographies")),
    ticket_notes: value(formData, "routing_ticket"),
    operation_types: csv(value(formData, "routing_operations")),
  };
  let contactId = typeof context.answers.contact_id === "string" ? context.answers.contact_id : null;
  const contactPayload = {
    fund_id: fundId,
    full_name: fullName,
    job_title: optional(value(formData, "contact_title")),
    email,
    phone: optional(value(formData, "contact_phone")),
    routing_criteria: routingCriteria,
    is_primary: true,
    status: "active",
  };
  if (contactId) {
    const {error} = await context.supabase.from("provider_contacts").update(contactPayload).eq("organization_id", context.organizationId).eq("id", contactId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  } else {
    const {data, error} = await context.supabase.from("provider_contacts").insert({...contactPayload, organization_id: context.organizationId, created_by: context.userId}).select("id").single();
    if (error || !data) redirect(`/${locale}/onboarding?error=save`);
    contactId = data.id;
  }
  await updateProgress(context, "contacts", "review", {contact_id: contactId, contact: {full_name: fullName, email, ...routingCriteria}}, locale, value(formData, "return_step"));
}

export async function completeOnboarding(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.currentStep !== "review") redirect(`/${locale}/onboarding`);
  if (context.journey === "capital_provider") {
    const mandateId = typeof context.answers.mandate_id === "string" ? context.answers.mandate_id : null;
    if (!mandateId) redirect(`/${locale}/onboarding?error=mandate`);
    const {error} = await context.supabase.from("mandate_versions").update({status: "active"}).eq("organization_id", context.organizationId).eq("id", mandateId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  } else {
    const requestId = typeof context.answers.capital_request_id === "string" ? context.answers.capital_request_id : null;
    if (!requestId) redirect(`/${locale}/onboarding?error=company`);
    const {error} = await context.supabase.from("capital_requests").update({status: "submitted"}).eq("organization_id", context.organizationId).eq("id", requestId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  }
  await context.supabase.from("organizations").update({verification_status: "pending"}).eq("id", context.organizationId);
  const {error} = await context.supabase.from("onboarding_progress").update({current_step: "complete", completed_at: new Date().toISOString()}).eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("journey", context.journey);
  if (error) redirect(`/${locale}/onboarding?error=save`);
  redirect(`/${locale}/app?welcome=1`);
}

function sectionIsAvailable(journey: Journey, target: string, answers: AnswerMap) {
  if (journey !== "capital_provider") return false;
  if (target === "organization") return true;
  if (target === "fund") return typeof answers.organization === "object";
  if (target === "mandate") return typeof answers.fund_id === "string";
  if (target === "contacts") return typeof answers.mandate_id === "string";
  if (target === "review") return typeof answers.contact_id === "string";
  return false;
}

export async function previousOnboardingStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey !== "capital_provider") redirect(`/${locale}/onboarding`);
  const previous: Record<string, string> = {fund: "organization", mandate: "fund", contacts: "mandate", review: "contacts"};
  const destination = previous[context.currentStep];
  if (!destination) redirect(`/${locale}/onboarding`);
  const {error} = await context.supabase.from("onboarding_progress").update({current_step: destination}).eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("journey", context.journey);
  if (error) redirect(`/${locale}/onboarding?error=save`);
  redirect(`/${locale}/onboarding`);
}
