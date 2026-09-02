"use server";

import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {matchScreenSchema} from "@offroad/domain-contracts";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {prepareIntakeRequestLadders} from "@/lib/intake/replay";
import {processIntakeSession} from "@/lib/intake/server";
import {latestActiveDealState, parseCompiledStructure} from "@/lib/deal-state/workbench";
import {governedMaterialPackageFromRows} from "@/lib/deal-state/materials";
import {marketFeedbackInputSchema} from "@/lib/market-feedback/input";
import type {Json} from "@/types/database";

export type OriginationDecisionState = {
  ok: boolean;
  decision?: "confirm" | "request_changes";
  code?: "invalid" | "stale" | "save";
};

export type PrivatePreliminaryDecisionState = {
  ok: boolean;
  decision?: "confirmed" | "changes_requested";
  code?: "invalid" | "stale" | "save" | "processing";
};

export type PrivateDiagnosticDecisionState = {
  ok: boolean;
  code?: "stale" | "save" | "processing";
};

export type PrivateStructureDecisionState = {
  ok: boolean;
  decision?: "confirm" | "request_changes" | "decline";
  code?: "invalid" | "stale" | "save" | "processing";
};

export type PrivateGovernedDecisionState = {
  ok: boolean;
  code?: "invalid" | "stale" | "save" | "processing" | "incomplete" | "forbidden";
};

export type PrivateMatchDecisionState = PrivateGovernedDecisionState & {
  selectedCount?: number;
};

export type AdvisorProposalDecisionState = {
  ok: boolean;
  decision?: "accept" | "reject";
  code?: "invalid" | "stale" | "save" | "processing";
};

export type MarketFeedbackState = {
  ok: boolean;
  code?: "invalid" | "stale" | "save";
};

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function record(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

async function privateProjectRuntime(locale: AppLocale, projectId: string, sessionId: string) {
  const workspace = await requireWorkspace(locale);
  const {data: session} = await workspace.supabase.from("document_intake_sessions")
    .select("id, capital_project_id, representation_status")
    .eq("organization_id", workspace.organization.id)
    .eq("id", sessionId)
    .eq("capital_project_id", projectId)
    .maybeSingle();
  if (!session) return null;
  const {data: rows} = await workspace.supabase.from("deal_state_objects")
    .select("id, organization_id, intake_session_id, object_type, object_version, status, input_fingerprint, object_fingerprint, payload, dependencies, created_by, created_by_kind, created_at, updated_at, superseded_at")
    .eq("organization_id", workspace.organization.id)
    .eq("intake_session_id", session.id)
    .order("object_version", {ascending: false});
  return {...workspace, session, rows: rows ?? [], latest: latestActiveDealState(rows ?? [])};
}

/** Applies a conversational edit only after the user reviews its field-level preview. The
 * database performs the atomic stale-snapshot check; private cases then rebuild only the
 * invalidated preliminary frontier rather than silently carrying old analysis forward. */
export async function decideAdvisorProjectProposal(
  _previous: AdvisorProposalDecisionState,
  formData: FormData,
): Promise<AdvisorProposalDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    proposalId: z.uuid(),
    decision: z.enum(["accept", "reject"]),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    proposalId: value(formData, "proposal_id"),
    decision: value(formData, "decision"),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};

  const runtime = await privateProjectRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const {data: proposal} = await runtime.supabase.from("agent_change_proposals")
    .select("id, status")
    .eq("organization_id", runtime.organization.id)
    .eq("intake_session_id", runtime.session.id)
    .eq("id", parsed.data.proposalId)
    .maybeSingle();
  if (!proposal || proposal.status !== "proposed") return {ok: false, code: "stale"};

  if (parsed.data.decision === "reject") {
    const {error} = await runtime.supabase.rpc("decide_agent_change_proposal", {
      p_organization_id: runtime.organization.id,
      p_proposal_id: proposal.id,
      p_decision: "rejected",
      p_reason: "rejected_by_user",
    });
    if (error) return {ok: false, code: error.code === "55000" ? "stale" : "save"};
    revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
    return {ok: true, decision: "reject"};
  }

  const {data, error} = await runtime.supabase.rpc("accept_and_apply_agent_operation_brief_proposal", {
    p_organization_id: runtime.organization.id,
    p_proposal_id: proposal.id,
    p_event_id: randomUUID(),
  });
  const result = record(data as Json);
  if (error || result.status !== "applied") {
    return {ok: false, code: result.status === "stale" || error?.code === "55000" ? "stale" : "save"};
  }

  const {data: project} = await runtime.supabase.from("capital_projects")
    .select("entry_job")
    .eq("organization_id", runtime.organization.id)
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  const isPrivateCase = project && ["structure_from_documents", "review_existing_operation"].includes(project.entry_job);
  let processingOk = true;
  if (isPrivateCase) {
    const processing = await processIntakeSession({
      supabase: runtime.supabase,
      organizationId: runtime.organization.id,
      userId: runtime.userId,
      locale,
      sessionId: runtime.session.id,
    });
    processingOk = processing.ok;
  } else {
    try {
      await prepareIntakeRequestLadders({
        supabase: runtime.supabase,
        organizationId: runtime.organization.id,
        sessionId: runtime.session.id,
      });
    } catch {
      processingOk = false;
    }
  }
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return processingOk ? {ok: true, decision: "accept"} : {ok: false, code: "processing", decision: "accept"};
}

export async function decideOriginationArtifact(
  _previous: OriginationDecisionState,
  formData: FormData,
): Promise<OriginationDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    artifactId: z.uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["confirm", "request_changes"]),
    note: z.string().trim().max(5_000),
  }).safeParse({
    projectId: value(formData, "project_id"),
    artifactId: value(formData, "artifact_id"),
    fingerprint: value(formData, "artifact_fingerprint"),
    decision: value(formData, "decision"),
    note: value(formData, "note"),
  });
  if (!parsed.success || (parsed.data.decision === "request_changes" && parsed.data.note.length < 2)) {
    return {ok: false, code: "invalid"};
  }

  const {supabase, organization} = await requireWorkspace(locale);
  const [{data: artifact}, {data: project}] = await Promise.all([
    supabase.from("capital_project_artifacts")
      .select("id, artifact_fingerprint, status")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", parsed.data.projectId)
      .eq("id", parsed.data.artifactId)
      .maybeSingle(),
    supabase.from("capital_projects")
      .select("entry_job")
      .eq("organization_id", organization.id)
      .eq("id", parsed.data.projectId)
      .maybeSingle(),
  ]);
  if (!artifact || artifact.status !== "pending_confirmation" || artifact.artifact_fingerprint !== parsed.data.fingerprint) {
    return {ok: false, code: "stale"};
  }

  const revision = project?.entry_job === "company_debt_view"
    ? "request_company_debt_view_revision_v1" as const
    : project?.entry_job === "origination_thesis"
      ? "request_origination_thesis_revision_v1" as const
      : project?.entry_job === "capital_planning"
        ? "request_capital_planning_revision_v1" as const
      : null;
  if (!revision) return {ok: false, code: "stale"};

  const {error} = parsed.data.decision === "request_changes"
    ? await supabase.rpc(revision, {
        p_artifact_id: parsed.data.artifactId,
        p_artifact_fingerprint: parsed.data.fingerprint,
        p_note: parsed.data.note,
      })
    : await supabase.rpc("decide_capital_project_artifact", {
        p_artifact_id: parsed.data.artifactId,
        p_artifact_fingerprint: parsed.data.fingerprint,
        p_decision: "confirm",
        p_note: undefined,
      });
  if (error) return {ok: false, code: error.code === "55000" || error.code === "P0002" ? "stale" : "save"};

  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return {ok: true, decision: parsed.data.decision};
}

/** Keeps the established preliminary gate inside the conversational project. Confirmation
 * compiles the tailored information request; a correction queues only a revised first read. */
export async function decidePrivateProjectPreliminary(
  _previous: PrivatePreliminaryDecisionState,
  formData: FormData,
): Promise<PrivatePreliminaryDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    objectFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["confirmed", "changes_requested"]),
    correction: z.string().trim().max(4_000),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    objectFingerprint: value(formData, "object_fingerprint"),
    decision: value(formData, "decision"),
    correction: value(formData, "correction"),
  });
  if (!parsed.success || (parsed.data.decision === "changes_requested" && parsed.data.correction.length < 3)) {
    return {ok: false, code: "invalid"};
  }

  const {supabase, organization, userId} = await requireWorkspace(locale);
  const {data: session} = await supabase.from("document_intake_sessions")
    .select("id, capital_project_id")
    .eq("organization_id", organization.id)
    .eq("id", parsed.data.sessionId)
    .eq("capital_project_id", parsed.data.projectId)
    .maybeSingle();
  if (!session) return {ok: false, code: "stale"};

  const {error} = await supabase.rpc("decide_advisor_preliminary_v1", {
    p_project_id: parsed.data.projectId,
    p_object_fingerprint: parsed.data.objectFingerprint,
    p_decision: parsed.data.decision,
    p_correction: parsed.data.correction || undefined,
  });
  if (error) return {ok: false, code: error.code === "55000" ? "stale" : "save"};

  if (parsed.data.decision === "confirmed") {
    try {
      await prepareIntakeRequestLadders({
        supabase,
        organizationId: organization.id,
        sessionId: session.id,
      });
    } catch {
      return {ok: false, code: "save"};
    }
    const processing = await processIntakeSession({
      supabase,
      organizationId: organization.id,
      userId,
      locale,
      sessionId: session.id,
    });
    if (!processing.ok) return {ok: false, code: "processing"};
  }

  if (parsed.data.decision === "changes_requested") {
    const processing = await processIntakeSession({
      supabase,
      organizationId: organization.id,
      userId,
      locale,
      sessionId: session.id,
    });
    if (!processing.ok) return {ok: false, code: "processing"};
  }

  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return {ok: true, decision: parsed.data.decision};
}

/** Countersigns one ready diagnostic snapshot, creates the internal opportunity projection and
 * queues structure design. It does not approve a structure, authorize materials or contact a
 * financing provider. */
export async function confirmPrivateProjectDiagnostic(
  _previous: PrivateDiagnosticDecisionState,
  formData: FormData,
): Promise<PrivateDiagnosticDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    objectFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    objectFingerprint: value(formData, "object_fingerprint"),
  });
  if (!parsed.success) return {ok: false, code: "stale"};

  const {supabase, organization} = await requireWorkspace(locale);
  const {data: session} = await supabase.from("document_intake_sessions")
    .select("id, capital_project_id")
    .eq("organization_id", organization.id)
    .eq("id", parsed.data.sessionId)
    .eq("capital_project_id", parsed.data.projectId)
    .maybeSingle();
  if (!session) return {ok: false, code: "stale"};
  const {data: snapshot} = await supabase.from("deal_state_objects")
    .select("id, object_fingerprint, status")
    .eq("organization_id", organization.id)
    .eq("intake_session_id", session.id)
    .eq("object_type", "understanding_snapshot")
    .order("object_version", {ascending: false})
    .limit(1)
    .maybeSingle();
  if (
    !snapshot
    || snapshot.status !== "pending_confirmation"
    || snapshot.object_fingerprint !== parsed.data.objectFingerprint
  ) return {ok: false, code: "stale"};

  const {error: confirmationError} = await supabase.rpc("confirm_document_intake", {
    p_organization_id: organization.id,
    p_session_id: session.id,
    p_output_locale: locale,
  });
  if (confirmationError) return {ok: false, code: confirmationError.code === "55000" ? "stale" : "save"};

  const {error: queueError} = await supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: organization.id,
    p_session_id: session.id,
    p_trigger_source: "understanding_confirmed",
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return queueError ? {ok: false, code: "processing"} : {ok: true};
}

export async function decidePrivateProjectStructure(
  _previous: PrivateStructureDecisionState,
  formData: FormData,
): Promise<PrivateStructureDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    decision: z.enum(["confirm", "request_changes", "decline"]),
    selectedAlternativeId: z.string().trim().min(1).max(120),
    proposalFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    feedback: z.string().trim().max(2_500),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    decision: value(formData, "decision"),
    selectedAlternativeId: value(formData, "selected_alternative_id"),
    proposalFingerprint: value(formData, "proposal_fingerprint"),
    feedback: value(formData, "feedback"),
  });
  if (!parsed.success || (parsed.data.decision === "request_changes" && parsed.data.feedback.length < 3)) {
    return {ok: false, code: "invalid"};
  }

  const {supabase, organization, userId} = await requireWorkspace(locale);
  const {data: session} = await supabase.from("document_intake_sessions")
    .select("id, capital_project_id")
    .eq("organization_id", organization.id)
    .eq("id", parsed.data.sessionId)
    .eq("capital_project_id", parsed.data.projectId)
    .maybeSingle();
  if (!session) return {ok: false, code: "stale"};
  const {data: rows} = await supabase.from("deal_state_objects")
    .select("id, organization_id, intake_session_id, object_type, object_version, status, input_fingerprint, object_fingerprint, payload, dependencies, created_by, created_by_kind, created_at, updated_at, superseded_at")
    .eq("organization_id", organization.id)
    .eq("intake_session_id", session.id)
    .order("object_version", {ascending: false});
  const latest = latestActiveDealState(rows ?? []);
  const option = latest.get("structure_option");
  const structure = parseCompiledStructure(option);
  if (
    !option
    || option.status !== "pending_confirmation"
    || !structure?.value.proposalFingerprint
    || structure.value.proposalFingerprint !== parsed.data.proposalFingerprint
  ) return {ok: false, code: "stale"};
  const selected = structure.value.alternatives.find((item) => item.id === parsed.data.selectedAlternativeId);
  if (!selected || (parsed.data.decision === "confirm" && !selected.confirmationEligible)) {
    return {ok: false, code: "invalid"};
  }

  const decidedAt = new Date().toISOString();
  const confirmation = {
    decision: parsed.data.decision,
    selectedAlternativeId: selected.id,
    proposalFingerprint: structure.value.proposalFingerprint,
    actorId: userId,
    decidedAt,
    ...(parsed.data.feedback ? {rationale: parsed.data.feedback} : {}),
    ...(parsed.data.decision === "request_changes" ? {requestedChanges: [parsed.data.feedback]} : {}),
  };
  const status = parsed.data.decision === "confirm"
    ? "confirmed"
    : parsed.data.decision === "request_changes" ? "changes_requested" : "declined";
  const {error: decisionError} = await supabase.rpc("record_deal_state_object", {
    p_organization_id: organization.id,
    p_session_id: session.id,
    p_object_type: "structure_decision",
    p_status: status,
    p_input_fingerprint: option.input_fingerprint,
    p_payload: {schemaVersion: "2026.08.29-v2", confirmation},
    p_dependencies: [{objectType: "structure_option", objectFingerprint: option.object_fingerprint}],
  });
  if (decisionError) return {ok: false, code: "save"};

  if (parsed.data.decision !== "decline") {
    const {error: queueError} = await supabase.rpc("enqueue_deal_state_analysis", {
      p_organization_id: organization.id,
      p_session_id: session.id,
      p_trigger_source: parsed.data.decision === "confirm" ? "structure_confirmed" : "structure_changes_requested",
    });
    if (queueError) return {ok: false, code: "processing"};
  }
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return {ok: true, decision: parsed.data.decision};
}

/** Approves only the internal production plan tied to the confirmed structure. */
export async function approvePrivateProjectProductionPlan(
  _previous: PrivateGovernedDecisionState,
  formData: FormData,
): Promise<PrivateGovernedDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    planFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    planFingerprint: value(formData, "plan_fingerprint"),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await privateProjectRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const plan = runtime.latest.get("production_plan");
  const structureDecision = runtime.latest.get("structure_decision");
  if (
    !plan
    || plan.status !== "pending_confirmation"
    || plan.object_fingerprint !== parsed.data.planFingerprint
    || !structureDecision
    || !["confirmed", "approved"].includes(structureDecision.status)
  ) return {ok: false, code: "stale"};

  const {error} = await runtime.supabase.rpc("record_deal_state_object", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.session.id,
    p_object_type: "production_plan",
    p_status: "approved",
    p_input_fingerprint: plan.input_fingerprint,
    p_payload: {
      ...record(plan.payload),
      approval: {
        actorId: runtime.userId,
        approvedAt: new Date().toISOString(),
        scope: "internal_material_preparation",
      },
    },
    p_dependencies: plan.dependencies,
  });
  if (error) return {ok: false, code: "save"};
  const {error: queueError} = await runtime.supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.session.id,
    p_trigger_source: "production_plan_approved",
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return queueError ? {ok: false, code: "processing"} : {ok: true};
}

/** Pins the exact internal package after every artifact in the approved plan exists. */
export async function approvePrivateProjectMaterialPackage(
  _previous: PrivateGovernedDecisionState,
  formData: FormData,
): Promise<PrivateGovernedDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    artifactFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    artifactFingerprint: value(formData, "artifact_fingerprint"),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await privateProjectRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const artifact = runtime.latest.get("material_artifact");
  const plan = runtime.latest.get("production_plan");
  const governed = governedMaterialPackageFromRows(runtime.rows);
  const complete = Boolean(governed && governed.plannedArtifacts.every((planned) => {
    if (planned === "financial_model") return Boolean(governed.financialModel);
    const kind = planned === "indicative_term_sheet" ? "term_sheet" : planned;
    return governed.materials.some((material) => material.kind === kind);
  }));
  if (!complete) return {ok: false, code: "incomplete"};
  if (
    !artifact
    || artifact.status !== "pending_confirmation"
    || artifact.object_fingerprint !== parsed.data.artifactFingerprint
    || !plan
    || plan.status !== "approved"
  ) return {ok: false, code: "stale"};

  const {error} = await runtime.supabase.rpc("record_deal_state_object", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.session.id,
    p_object_type: "package_review",
    p_status: "approved",
    p_input_fingerprint: artifact.input_fingerprint,
    p_payload: {
      schemaVersion: "2026.08.29-v1",
      approval: {
        actorId: runtime.userId,
        approvedAt: new Date().toISOString(),
        scope: "internal_material_package",
        artifactFingerprint: artifact.object_fingerprint,
      },
    },
    p_dependencies: [
      {objectType: "production_plan", objectFingerprint: plan.object_fingerprint},
      {objectType: "material_artifact", objectFingerprint: artifact.object_fingerprint},
    ],
  });
  if (error) return {ok: false, code: "save"};
  const {error: queueError} = await runtime.supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.session.id,
    p_trigger_source: "material_package_approved",
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return queueError ? {ok: false, code: "processing"} : {ok: true};
}

/** Approves only a governed shortlist; the RPC creates a contact-free draft plan. */
export async function approvePrivateProjectMatchShortlist(
  _previous: PrivateMatchDecisionState,
  formData: FormData,
): Promise<PrivateMatchDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    matchScreenFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    selectedProviderIds: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    matchScreenFingerprint: value(formData, "match_screen_fingerprint"),
    selectedProviderIds: [...new Set(formData.getAll("selected_provider_id").map(String).map((item) => item.trim()))],
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await privateProjectRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const row = runtime.latest.get("match_screen");
  const screen = row ? matchScreenSchema.safeParse(row.payload) : null;
  if (
    !row
    || row.status !== "pending_confirmation"
    || row.object_fingerprint !== parsed.data.matchScreenFingerprint
    || !screen?.success
  ) return {ok: false, code: "stale"};
  const eligible = new Set(screen.data.candidates.filter((candidate) => candidate.eligibleForShortlist).map((candidate) => candidate.providerId));
  if (parsed.data.selectedProviderIds.some((id) => !eligible.has(id))) return {ok: false, code: "invalid"};
  const {error} = await runtime.supabase.rpc("approve_match_shortlist_and_prepare_plan", {
    p_match_screen_fingerprint: parsed.data.matchScreenFingerprint,
    p_organization_id: runtime.organization.id,
    p_selected_provider_ids: parsed.data.selectedProviderIds,
    p_session_id: runtime.session.id,
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  if (error) return {ok: false, code: error.code === "42501" ? "forbidden" : "save"};
  return {ok: true, selectedCount: parsed.data.selectedProviderIds.length};
}

/** Records authorization for the exact reviewed recipients and artifact fingerprint. */
export async function authorizePrivateProjectIntroduction(
  _previous: PrivateGovernedDecisionState,
  formData: FormData,
): Promise<PrivateGovernedDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    planId: z.uuid(),
    materialFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    representationAttestation: z.literal("confirmed"),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    planId: value(formData, "plan_id"),
    materialFingerprint: value(formData, "material_fingerprint"),
    representationAttestation: value(formData, "representation_attestation"),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await privateProjectRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  if (runtime.session.representation_status !== "verified") return {ok: false, code: "forbidden"};
  const {data: plan} = await runtime.supabase.from("qualified_introduction_plans")
    .select("id, status, material_fingerprint, technical_review_fingerprint, technical_reviewed_at")
    .eq("organization_id", runtime.organization.id)
    .eq("intake_session_id", runtime.session.id)
    .eq("id", parsed.data.planId)
    .maybeSingle();
  if (
    !plan
    || plan.status !== "draft"
    || plan.material_fingerprint !== parsed.data.materialFingerprint
    || plan.technical_review_fingerprint !== plan.material_fingerprint
    || !plan.technical_reviewed_at
  ) return {ok: false, code: "stale"};
  const {error} = await runtime.supabase.rpc("authorize_qualified_introduction_plan", {
    p_material_fingerprint: parsed.data.materialFingerprint,
    p_plan_id: parsed.data.planId,
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  if (error) return {ok: false, code: error.code === "42501" ? "forbidden" : "save"};
  return {ok: true};
}

/** Records an observed post-introduction signal. It never represents lender work as an Offroad
 * task and cannot exist before an exact, authorized introduction has actually been recorded. */
export async function recordPrivateProjectMarketFeedback(
  _previous: MarketFeedbackState,
  formData: FormData,
): Promise<MarketFeedbackState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const amountInput = value(formData, "amount");
  const occurredAtInput = value(formData, "occurred_at");
  const parsed = marketFeedbackInputSchema.safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    introductionId: value(formData, "introduction_id"),
    eventType: value(formData, "event_type"),
    sourceKind: value(formData, "source_kind"),
    verificationState: value(formData, "verification_state"),
    reasonCode: value(formData, "reason_code") || undefined,
    note: value(formData, "note") || undefined,
    requestedInformationCount: value(formData, "requested_information_count") || undefined,
    amount: amountInput || undefined,
    currency: amountInput ? value(formData, "currency") : undefined,
    occurredAt: occurredAtInput || undefined,
  });
  if (!parsed.success) return {ok: false, code: "invalid"};

  const runtime = await privateProjectRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const {data: introduction} = await runtime.supabase.from("qualified_introductions")
    .select("id, introduced_at")
    .eq("organization_id", runtime.organization.id)
    .eq("intake_session_id", runtime.session.id)
    .eq("id", parsed.data.introductionId)
    .maybeSingle();
  if (!introduction) return {ok: false, code: "stale"};
  const occurredDate = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  if (!Number.isFinite(occurredDate.valueOf())) return {ok: false, code: "invalid"};
  const occurredAt = occurredDate.toISOString();
  if (occurredDate < new Date(introduction.introduced_at) || occurredDate > new Date(Date.now() + 5 * 60_000)) {
    return {ok: false, code: "invalid"};
  }

  const {error} = await runtime.supabase.rpc("record_qualified_introduction_feedback", {
    p_introduction_id: introduction.id,
    p_event_type: parsed.data.eventType,
    p_occurred_at: occurredAt,
    p_source_kind: parsed.data.sourceKind,
    p_verification_state: parsed.data.verificationState,
    ...(parsed.data.reasonCode ? {p_reason_code: parsed.data.reasonCode} : {}),
    ...(parsed.data.note ? {p_note: parsed.data.note} : {}),
    ...(parsed.data.requestedInformationCount ? {p_requested_information_count: parsed.data.requestedInformationCount} : {}),
    ...(parsed.data.amount !== undefined ? {p_amount: parsed.data.amount, p_currency: parsed.data.currency} : {}),
  });
  if (error) return {ok: false, code: error.code === "22023" ? "invalid" : "save"};
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return {ok: true};
}
