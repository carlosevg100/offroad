"use server";

import {createHash} from "node:crypto";

import {redirect} from "next/navigation";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {
  acceptHighConfidenceCandidates as acceptCandidates,
  confirmIntakeCase,
  loadIntakeSession,
  processIntakeSession,
  removeIntakeDocument as removeDocument,
  resolveIntakeIssue as resolveIssue,
  reviewIntakeCandidate as reviewCandidate,
  startIntakeSession,
  type IntakeRuntime,
} from "@/lib/intake/server";
import type {IntakeErrorCode} from "@/lib/intake/types";
import {createClient} from "@/lib/supabase/server";
import type {Json} from "@/types/database";

type Journey = "company" | "originator" | "capital_provider";
type AnswerMap = Record<string, Json | undefined>;

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

export async function chooseManualIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey === "capital_provider") redirect(onboardingUrl(locale));
  const {error} = await context.supabase.from("onboarding_progress").update({
    answers: {...context.answers, intake_mode: "manual"},
    current_step: "organization",
  }).eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("journey", context.journey);
  if (error) redirect(onboardingUrl(locale, "save"));
  redirect(onboardingUrl(locale));
}

export async function startDocumentIntake(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey === "capital_provider") redirect(onboardingUrl(locale));
  const outcome = await startIntakeSession({supabase: context.supabase, organizationId: context.organizationId, userId: context.userId, locale, journey: context.journey});
  if (!outcome.ok) redirect(onboardingUrl(locale, "save"));
  const {error} = await context.supabase.from("onboarding_progress").update({
    answers: {...context.answers, intake_mode: "documents", intake_session_id: outcome.value},
    current_step: "documents",
  }).eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("journey", context.journey);
  if (error) redirect(onboardingUrl(locale, "save"));
  redirect(onboardingUrl(locale));
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

  const providerType = context.journey === "capital_provider" ? value(formData, "provider_type") : null;
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

  let companyId = typeof context.answers.company_id === "string" ? context.answers.company_id : null;
  if (context.journey === "company") {
    const hash = parsed.data.identifier ? `\\x${createHash("sha256").update(parsed.data.identifier).digest("hex")}` : null;
    const companyPayload = {
      legal_name: parsed.data.legalName || parsed.data.organizationName,
      display_name: parsed.data.organizationName,
      jurisdiction_code: parsed.data.countryCode,
      legal_identifier_hash: hash,
      legal_identifier_last4: parsed.data.identifier.slice(-4) || null,
      sector: optional(parsed.data.sector),
      subsector: optional(parsed.data.subsector),
      website: optional(parsed.data.website),
      headquarters_city: optional(parsed.data.city),
      headquarters_state: optional(parsed.data.stateCode),
    };
    if (companyId) {
      const {error} = await context.supabase.from("companies").update(companyPayload).eq("organization_id", context.organizationId).eq("id", companyId);
      if (error) redirect(`/${locale}/onboarding?error=save`);
    } else {
      const {data, error} = await context.supabase.from("companies").insert({
        ...companyPayload,
        organization_id: context.organizationId,
        reporting_currency: "BRL",
        created_by: context.userId,
      }).select("id").single();
      if (error || !data) redirect(`/${locale}/onboarding?error=save`);
      companyId = data.id;
    }
  }

  const nextStep = context.journey === "capital_provider" ? "fund" : context.journey === "originator" ? "company" : "funding";
  await updateProgress(context, "organization", nextStep, {
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
    company_id: companyId,
  }, locale, value(formData, "return_step"));
}

export async function saveAdvisedCompanyStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey !== "originator") redirect(`/${locale}/onboarding?error=step`);
  const legalName = value(formData, "company_legal_name");
  const displayName = value(formData, "company_name") || legalName;
  const identifier = value(formData, "legal_identifier").replace(/[^0-9A-Za-z]/g, "");
  if (legalName.length < 2 || displayName.length < 2) redirect(`/${locale}/onboarding?error=validation`);

  let companyId = typeof context.answers.company_id === "string" ? context.answers.company_id : null;
  const payload = {
    legal_name: legalName,
    display_name: displayName,
    jurisdiction_code: value(formData, "country_code").toUpperCase() || "BR",
    legal_identifier_hash: identifier ? `\\x${createHash("sha256").update(identifier).digest("hex")}` : null,
    legal_identifier_last4: identifier.slice(-4) || null,
    sector: optional(value(formData, "sector")),
    subsector: optional(value(formData, "subsector")),
    website: optional(value(formData, "website")),
  };
  if (companyId) {
    const {error} = await context.supabase.from("companies").update(payload).eq("organization_id", context.organizationId).eq("id", companyId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  } else {
    const {data, error} = await context.supabase.from("companies").insert({
      ...payload,
      organization_id: context.organizationId,
      reporting_currency: "BRL",
      created_by: context.userId,
    }).select("id").single();
    if (error || !data) redirect(`/${locale}/onboarding?error=save`);
    companyId = data.id;
  }

  await updateProgress(context, "company", "funding", {
    company_id: companyId,
    advised_company: {
      legal_name: legalName,
      display_name: displayName,
      sector: value(formData, "sector"),
      subsector: value(formData, "subsector"),
      website: value(formData, "website"),
      relationship: value(formData, "relationship"),
      authority_kind: value(formData, "authority_kind"),
      authority_reference: value(formData, "authority_reference"),
      contact_name: value(formData, "company_contact_name"),
      contact_email: value(formData, "company_contact_email"),
    },
  }, locale, value(formData, "return_step"));
}

export async function saveFundingStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey === "capital_provider") redirect(`/${locale}/onboarding?error=step`);
  const companyId = typeof context.answers.company_id === "string" ? context.answers.company_id : null;
  if (!companyId) redirect(`/${locale}/onboarding?error=company`);

  const requestedAmount = Number(value(formData, "requested_amount"));
  const termValue = Number(value(formData, "desired_term_months"));
  const purpose = value(formData, "purpose_summary");
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || purpose.length < 3 || purpose.length > 500) redirect(`/${locale}/onboarding?error=validation`);

  let capitalRequestId = typeof context.answers.capital_request_id === "string" ? context.answers.capital_request_id : null;
  let opportunityId = typeof context.answers.opportunity_id === "string" ? context.answers.opportunity_id : null;
  const requestPayload = {
    purpose,
    purpose_category: value(formData, "purpose_category") || null,
    rationale: optional(value(formData, "rationale")),
    strategic_importance: optional(value(formData, "strategic_importance")),
    expected_outcome: optional(value(formData, "expected_outcome")),
    desired_timing: optional(value(formData, "desired_timing")),
    repayment_source: optional(value(formData, "repayment_source")),
    collateral_summary: optional(value(formData, "collateral_summary")),
    requested_amount: requestedAmount,
    currency: value(formData, "currency").toUpperCase() || "BRL",
    desired_term_months: Number.isInteger(termValue) && termValue > 0 ? termValue : null,
    output_locale: locale,
    status: "draft",
  };

  if (capitalRequestId) {
    const {error} = await context.supabase.from("capital_requests").update(requestPayload).eq("organization_id", context.organizationId).eq("id", capitalRequestId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  } else {
    const {data, error} = await context.supabase.from("capital_requests").insert({...requestPayload, organization_id: context.organizationId, company_id: companyId, created_by: context.userId}).select("id").single();
    if (error || !data) redirect(`/${locale}/onboarding?error=save`);
    capitalRequestId = data.id;
  }

  const {data: company} = await context.supabase.from("companies").select("display_name, legal_name").eq("organization_id", context.organizationId).eq("id", companyId).single();
  const title = `${company?.display_name || company?.legal_name || "Empresa"} · ${purpose}`.slice(0, 180);
  if (opportunityId) {
    const {error} = await context.supabase.from("opportunities").update({title, purpose, requested_amount: requestedAmount, currency: requestPayload.currency}).eq("organization_id", context.organizationId).eq("id", opportunityId);
    if (error) redirect(`/${locale}/onboarding?error=save`);
  } else {
    const {data, error} = await context.supabase.from("opportunities").insert({
      organization_id: context.organizationId,
      company_id: companyId,
      capital_request_id: capitalRequestId,
      title,
      purpose,
      requested_amount: requestedAmount,
      currency: requestPayload.currency,
      lead_user_id: context.userId,
      created_by: context.userId,
    }).select("id").single();
    if (error || !data) redirect(`/${locale}/onboarding?error=save`);
    opportunityId = data.id;
  }

  if (context.journey === "originator" && opportunityId) {
    const advised = (context.answers.advised_company ?? {}) as AnswerMap;
    const evidenceKind = typeof advised.authority_kind === "string" && advised.authority_kind ? advised.authority_kind : "mandate";
    const {count} = await context.supabase.from("authority_evidence").select("id", {head: true, count: "exact"}).eq("organization_id", context.organizationId).eq("opportunity_id", opportunityId);
    if ((count ?? 0) === 0) {
      await context.supabase.from("authority_evidence").insert({
        organization_id: context.organizationId,
        opportunity_id: opportunityId,
        representative_user_id: context.userId,
        evidence_kind: evidenceKind,
        evidence_reference: typeof advised.authority_reference === "string" ? advised.authority_reference : null,
        powers: ["prepare", "structure"],
      });
    }
  }

  await updateProgress(context, "funding", "documents", {
    capital_request_id: capitalRequestId,
    opportunity_id: opportunityId,
    funding: {
      purpose_category: requestPayload.purpose_category,
      purpose_summary: purpose,
      rationale: requestPayload.rationale,
      strategic_importance: requestPayload.strategic_importance,
      expected_outcome: requestPayload.expected_outcome,
      desired_timing: requestPayload.desired_timing,
      requested_amount: requestedAmount,
      currency: requestPayload.currency,
      desired_term_months: requestPayload.desired_term_months,
      repayment_source: requestPayload.repayment_source,
      collateral_summary: requestPayload.collateral_summary,
    },
  }, locale, value(formData, "return_step"));
}

export async function finishDocumentsStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  if (context.journey === "capital_provider") redirect(`/${locale}/onboarding?error=step`);
  const opportunityId = typeof context.answers.opportunity_id === "string" ? context.answers.opportunity_id : null;
  if (!opportunityId) redirect(`/${locale}/onboarding?error=company`);
  const {count} = await context.supabase.from("source_documents").select("id", {head: true, count: "exact"}).eq("organization_id", context.organizationId).eq("opportunity_id", opportunityId);
  if ((count ?? 0) < 1) redirect(`/${locale}/onboarding?error=documents`);
  await updateProgress(context, "documents", "review", {documents_uploaded: count ?? 0}, locale, value(formData, "return_step"));
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
  if (target === "organization") return true;
  if (journey === "company") {
    if (target === "funding") return typeof answers.company_id === "string";
    if (target === "documents") return typeof answers.opportunity_id === "string";
    if (target === "review") return Number(answers.documents_uploaded ?? 0) > 0;
  }
  if (journey === "originator") {
    if (target === "company") return typeof answers.organization === "object";
    if (target === "funding") return typeof answers.company_id === "string";
    if (target === "documents") return typeof answers.opportunity_id === "string";
    if (target === "review") return Number(answers.documents_uploaded ?? 0) > 0;
  }
  if (journey === "capital_provider") {
    if (target === "fund") return typeof answers.organization === "object";
    if (target === "mandate") return typeof answers.fund_id === "string";
    if (target === "contacts") return typeof answers.mandate_id === "string";
    if (target === "review") return typeof answers.contact_id === "string";
  }
  return false;
}

export async function previousOnboardingStep(formData: FormData) {
  const locale = localeFrom(formData);
  const context = await onboardingContext(locale);
  const previous: Record<Journey, Record<string, string>> = {
    company: {funding: "organization", documents: "funding", review: "documents"},
    originator: {company: "organization", funding: "company", documents: "funding", review: "documents"},
    capital_provider: {fund: "organization", mandate: "fund", contacts: "mandate", review: "contacts"},
  };
  const destination = previous[context.journey][context.currentStep];
  if (!destination) redirect(`/${locale}/onboarding`);
  const {error} = await context.supabase.from("onboarding_progress").update({current_step: destination}).eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("journey", context.journey);
  if (error) redirect(`/${locale}/onboarding?error=save`);
  redirect(`/${locale}/onboarding`);
}
