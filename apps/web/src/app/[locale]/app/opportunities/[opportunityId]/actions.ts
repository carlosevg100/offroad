"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {matchScreenSchema} from "@offroad/domain-contracts";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {latestActiveDealState, parseCompiledStructure} from "@/lib/deal-state/workbench";
import {governedMaterialPackageFromRows} from "@/lib/deal-state/materials";
import type {Json} from "@/types/database";

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function localeFrom(formData: FormData): AppLocale {
  const raw = value(formData, "locale");
  return routing.locales.includes(raw as AppLocale) ? raw as AppLocale : routing.defaultLocale;
}

function record(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

async function opportunityRuntime(formData: FormData) {
  const parsed = z.object({
    locale: z.enum(routing.locales),
    opportunityId: z.uuid(),
  }).safeParse({
    locale: localeFrom(formData),
    opportunityId: value(formData, "opportunity_id"),
  });
  if (!parsed.success) redirect(`/${localeFrom(formData)}/app`);

  const workspace = await requireWorkspace(parsed.data.locale);
  const {data: session} = await workspace.supabase
    .from("document_intake_sessions")
    .select("id, status, opportunity_id")
    .eq("organization_id", workspace.organization.id)
    .eq("opportunity_id", parsed.data.opportunityId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (!session) redirect(`/${parsed.data.locale}/app`);

  const {data: rows} = await workspace.supabase
    .from("deal_state_objects")
    .select("id, organization_id, intake_session_id, object_type, object_version, status, input_fingerprint, object_fingerprint, payload, dependencies, created_by, created_by_kind, created_at, updated_at, superseded_at")
    .eq("organization_id", workspace.organization.id)
    .eq("intake_session_id", session.id)
    .order("object_version", {ascending: false});

  return {
    ...workspace,
    locale: parsed.data.locale,
    opportunityId: parsed.data.opportunityId,
    sessionId: session.id,
    latest: latestActiveDealState(rows ?? []),
  };
}

function destination(locale: string, opportunityId: string, notice: string) {
  return `/${locale}/app/opportunities/${opportunityId}?notice=${notice}`;
}

export async function confirmUnderstanding(formData: FormData) {
  const runtime = await opportunityRuntime(formData);
  const snapshot = runtime.latest.get("understanding_snapshot");
  if (!snapshot || snapshot.status !== "pending_confirmation") {
    redirect(destination(runtime.locale, runtime.opportunityId, "understanding_unavailable"));
  }

  const payload = {
    ...record(snapshot.payload),
    confirmation: {
      actorId: runtime.userId,
      confirmedAt: new Date().toISOString(),
      scope: "case_understanding",
    },
  };
  const {error: decisionError} = await runtime.supabase.rpc("record_deal_state_object", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.sessionId,
    p_object_type: "understanding_snapshot",
    p_status: "confirmed",
    p_input_fingerprint: snapshot.input_fingerprint,
    p_payload: payload,
    p_dependencies: [],
  });
  if (decisionError) redirect(destination(runtime.locale, runtime.opportunityId, "decision_failed"));

  const {error: queueError} = await runtime.supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.sessionId,
    p_trigger_source: "understanding_confirmed",
  });
  revalidatePath(`/${runtime.locale}/app/opportunities/${runtime.opportunityId}`);
  redirect(destination(runtime.locale, runtime.opportunityId, queueError ? "queue_failed" : "structure_started"));
}

export async function decideStructure(formData: FormData) {
  const runtime = await opportunityRuntime(formData);
  const parsed = z.object({
    decision: z.enum(["confirm", "request_changes", "decline"]),
    selectedAlternativeId: z.string().trim().min(1).max(120),
    proposalFingerprint: fingerprintSchema,
    feedback: z.string().trim().max(2500),
  }).safeParse({
    decision: value(formData, "decision"),
    selectedAlternativeId: value(formData, "selected_alternative_id"),
    proposalFingerprint: value(formData, "proposal_fingerprint"),
    feedback: value(formData, "feedback"),
  });
  if (!parsed.success || (parsed.data.decision === "request_changes" && !parsed.data.feedback)) {
    redirect(destination(runtime.locale, runtime.opportunityId, "decision_validation"));
  }

  const option = runtime.latest.get("structure_option");
  const structure = parseCompiledStructure(option);
  if (!option || option.status !== "pending_confirmation" || !structure?.value.proposalFingerprint) {
    redirect(destination(runtime.locale, runtime.opportunityId, "structure_unavailable"));
  }
  if (structure.value.proposalFingerprint !== parsed.data.proposalFingerprint) {
    redirect(destination(runtime.locale, runtime.opportunityId, "structure_changed"));
  }
  const selected = structure.value.alternatives.find((alternative) => alternative.id === parsed.data.selectedAlternativeId);
  if (!selected || (parsed.data.decision === "confirm" && !selected.confirmationEligible)) {
    redirect(destination(runtime.locale, runtime.opportunityId, "alternative_unavailable"));
  }

  const decidedAt = new Date().toISOString();
  const confirmation = {
    decision: parsed.data.decision,
    selectedAlternativeId: selected.id,
    proposalFingerprint: structure.value.proposalFingerprint,
    actorId: runtime.userId,
    decidedAt,
    ...(parsed.data.feedback ? {rationale: parsed.data.feedback} : {}),
    ...(parsed.data.decision === "request_changes" ? {requestedChanges: [parsed.data.feedback]} : {}),
  };
  const status = parsed.data.decision === "confirm"
    ? "confirmed"
    : parsed.data.decision === "request_changes" ? "changes_requested" : "declined";
  const {error: decisionError} = await runtime.supabase.rpc("record_deal_state_object", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.sessionId,
    p_object_type: "structure_decision",
    p_status: status,
    p_input_fingerprint: option.input_fingerprint,
    p_payload: {schemaVersion: "2026.08.29-v2", confirmation},
    p_dependencies: [{objectType: "structure_option", objectFingerprint: option.object_fingerprint}],
  });
  if (decisionError) redirect(destination(runtime.locale, runtime.opportunityId, "decision_failed"));

  let queueFailed = false;
  if (parsed.data.decision !== "decline") {
    const {error} = await runtime.supabase.rpc("enqueue_deal_state_analysis", {
      p_organization_id: runtime.organization.id,
      p_session_id: runtime.sessionId,
      p_trigger_source: parsed.data.decision === "confirm" ? "structure_confirmed" : "structure_changes_requested",
    });
    queueFailed = Boolean(error);
  }
  revalidatePath(`/${runtime.locale}/app/opportunities/${runtime.opportunityId}`);
  const notice = queueFailed
    ? "queue_failed"
    : parsed.data.decision === "confirm" ? "materials_plan_started"
      : parsed.data.decision === "request_changes" ? "structure_revision_started" : "structure_declined";
  redirect(destination(runtime.locale, runtime.opportunityId, notice));
}

export async function approveProductionPlan(formData: FormData) {
  const runtime = await opportunityRuntime(formData);
  const parsed = z.object({planFingerprint: fingerprintSchema}).safeParse({
    planFingerprint: value(formData, "plan_fingerprint"),
  });
  const plan = runtime.latest.get("production_plan");
  const structureDecision = runtime.latest.get("structure_decision");
  if (
    !parsed.success
    || !plan
    || plan.status !== "pending_confirmation"
    || plan.object_fingerprint !== parsed.data.planFingerprint
    || !structureDecision
    || !["confirmed", "approved"].includes(structureDecision.status)
  ) {
    redirect(destination(runtime.locale, runtime.opportunityId, "production_plan_changed"));
  }

  const payload = {
    ...record(plan.payload),
    approval: {
      actorId: runtime.userId,
      approvedAt: new Date().toISOString(),
      scope: "internal_material_preparation",
    },
  };
  const {error: decisionError} = await runtime.supabase.rpc("record_deal_state_object", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.sessionId,
    p_object_type: "production_plan",
    p_status: "approved",
    p_input_fingerprint: plan.input_fingerprint,
    p_payload: payload,
    p_dependencies: plan.dependencies,
  });
  if (decisionError) redirect(destination(runtime.locale, runtime.opportunityId, "decision_failed"));

  const {error: queueError} = await runtime.supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.sessionId,
    p_trigger_source: "production_plan_approved",
  });
  revalidatePath(`/${runtime.locale}/app/opportunities/${runtime.opportunityId}`);
  redirect(destination(
    runtime.locale,
    runtime.opportunityId,
    queueError ? "queue_failed" : "materials_started",
  ));
}

export async function approveMaterialPackage(formData: FormData) {
  const runtime = await opportunityRuntime(formData);
  const parsed = z.object({artifactFingerprint: fingerprintSchema}).safeParse({
    artifactFingerprint: value(formData, "artifact_fingerprint"),
  });
  const artifact = runtime.latest.get("material_artifact");
  const plan = runtime.latest.get("production_plan");
  const governed = governedMaterialPackageFromRows([...runtime.latest.values()]);
  const requiredMaterialsPresent = Boolean(
    governed
    && governed.plannedArtifacts.every((planned) => {
      if (planned === "financial_model") return Boolean(governed.financialModel);
      const materialKind = planned === "indicative_term_sheet" ? "term_sheet" : planned;
      return governed.materials.some((material) => material.kind === materialKind);
    }),
  );
  if (
    !parsed.success
    || !artifact
    || artifact.status !== "pending_confirmation"
    || artifact.object_fingerprint !== parsed.data.artifactFingerprint
    || !plan
    || plan.status !== "approved"
    || !requiredMaterialsPresent
  ) {
    redirect(destination(runtime.locale, runtime.opportunityId, requiredMaterialsPresent ? "material_package_changed" : "material_package_incomplete"));
  }

  const {error} = await runtime.supabase.rpc("record_deal_state_object", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.sessionId,
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
  if (error) {
    revalidatePath(`/${runtime.locale}/app/opportunities/${runtime.opportunityId}`);
    redirect(destination(runtime.locale, runtime.opportunityId, "decision_failed"));
  }
  const {error: queueError} = await runtime.supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.sessionId,
    p_trigger_source: "material_package_approved",
  });
  revalidatePath(`/${runtime.locale}/app/opportunities/${runtime.opportunityId}`);
  redirect(destination(runtime.locale, runtime.opportunityId, queueError ? "queue_failed" : "match_started"));
}

export async function approveMatchShortlist(formData: FormData) {
  const runtime = await opportunityRuntime(formData);
  const parsed = z.object({
    matchScreenFingerprint: fingerprintSchema,
    selectedProviderIds: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  }).safeParse({
    matchScreenFingerprint: value(formData, "match_screen_fingerprint"),
    selectedProviderIds: [...new Set(formData.getAll("selected_provider_id").map(String).map((item) => item.trim()))],
  });
  const row = runtime.latest.get("match_screen");
  const screen = row ? matchScreenSchema.safeParse(row.payload) : null;
  if (
    !parsed.success
    || !row
    || row.status !== "pending_confirmation"
    || row.object_fingerprint !== parsed.data.matchScreenFingerprint
    || !screen?.success
  ) {
    redirect(destination(runtime.locale, runtime.opportunityId, "match_changed"));
  }

  const eligibleIds = new Set(
    screen.data.candidates
      .filter((candidate) => candidate.eligibleForShortlist)
      .map((candidate) => candidate.providerId),
  );
  if (parsed.data.selectedProviderIds.some((providerId) => !eligibleIds.has(providerId))) {
    redirect(destination(runtime.locale, runtime.opportunityId, "match_selection_invalid"));
  }

  const {error} = await runtime.supabase.rpc("approve_match_shortlist_and_prepare_plan", {
    p_match_screen_fingerprint: parsed.data.matchScreenFingerprint,
    p_organization_id: runtime.organization.id,
    p_selected_provider_ids: parsed.data.selectedProviderIds,
    p_session_id: runtime.sessionId,
  });
  revalidatePath(`/${runtime.locale}/app/opportunities/${runtime.opportunityId}`);
  redirect(destination(runtime.locale, runtime.opportunityId, error ? "decision_failed" : "match_approved"));
}

export async function authorizeIntroductionPlan(formData: FormData) {
  const runtime = await opportunityRuntime(formData);
  const parsed = z.object({
    planId: z.uuid(),
    materialFingerprint: fingerprintSchema,
  }).safeParse({
    planId: value(formData, "plan_id"),
    materialFingerprint: value(formData, "material_fingerprint"),
  });
  if (!parsed.success) {
    redirect(destination(runtime.locale, runtime.opportunityId, "introduction_plan_changed"));
  }

  const {data: plan} = await runtime.supabase
    .from("qualified_introduction_plans")
    .select("id, status, material_fingerprint, technical_review_fingerprint, technical_reviewed_at")
    .eq("organization_id", runtime.organization.id)
    .eq("intake_session_id", runtime.sessionId)
    .eq("id", parsed.data.planId)
    .maybeSingle();
  if (
    !plan
    || plan.status !== "draft"
    || plan.material_fingerprint !== parsed.data.materialFingerprint
    || plan.technical_review_fingerprint !== plan.material_fingerprint
    || !plan.technical_reviewed_at
  ) {
    redirect(destination(runtime.locale, runtime.opportunityId, "introduction_plan_changed"));
  }

  const {error} = await runtime.supabase.rpc("authorize_qualified_introduction_plan", {
    p_material_fingerprint: parsed.data.materialFingerprint,
    p_plan_id: parsed.data.planId,
  });
  revalidatePath(`/${runtime.locale}/app/opportunities/${runtime.opportunityId}`);
  redirect(destination(runtime.locale, runtime.opportunityId, error ? "introduction_authorization_failed" : "introduction_authorized"));
}
