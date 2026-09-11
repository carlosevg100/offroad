"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {informationPackProposal} from "@/lib/advisor/distribution-context";
import {requireWorkspace} from "@/lib/auth/workspace";
import {governedMaterialPackageFromRows} from "@/lib/deal-state/materials";
import {latestActiveDealState} from "@/lib/deal-state/workbench";
import type {Json} from "@/types/database";

export type DistributionActionState = {
  ok: boolean;
  code?: "invalid" | "stale" | "forbidden" | "policy" | "consent" | "wave" | "recipient" | "save";
};

export type QualifiedContactActionState = {
  ok: boolean;
  code?: "invalid" | "stale" | "forbidden" | "pack" | "hypothesis" | "save";
};

const localeOf = (value: FormDataEntryValue | null): AppLocale => (
  routing.locales.includes(String(value ?? "") as AppLocale)
    ? String(value) as AppLocale
    : routing.defaultLocale
);

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

async function distributionRuntime(locale: AppLocale, projectId: string, sessionId: string) {
  const workspace = await requireWorkspace(locale);
  const {data: session} = await workspace.supabase.from("document_intake_sessions")
    .select("id, capital_project_id, representation_status, identity_policy")
    .eq("organization_id", workspace.organization.id)
    .eq("id", sessionId)
    .eq("capital_project_id", projectId)
    .maybeSingle();
  if (!session) return null;
  return {...workspace, session};
}

/**
 * Records the pack revision that matches the approved material package exactly. It exports nothing
 * and shares nothing: it fixes which files a recipient would open, under one pack fingerprint.
 */
export async function recordProjectInformationPack(
  _previous: DistributionActionState,
  formData: FormData,
): Promise<DistributionActionState> {
  void _previous;
  const locale = localeOf(formData.get("locale"));
  const parsed = z.object({projectId: z.uuid(), sessionId: z.uuid()}).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await distributionRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};

  const {data: rows} = await runtime.supabase.from("deal_state_objects")
    .select("id, organization_id, intake_session_id, object_type, object_version, status, input_fingerprint, object_fingerprint, payload, dependencies, created_by, created_by_kind, created_at, updated_at, superseded_at")
    .eq("organization_id", runtime.organization.id)
    .eq("intake_session_id", runtime.session.id)
    .order("object_version", {ascending: false});
  const governed = governedMaterialPackageFromRows(rows ?? []);
  if (!governed) return {ok: false, code: "stale"};

  const latest = latestActiveDealState(rows ?? []);
  const sourceResultIds = (["structure_decision", "production_plan", "material_artifact"] as const)
    .flatMap((objectType) => {
      const row = latest.get(objectType);
      return row ? [row.object_fingerprint] : [];
    });
  const items = await informationPackProposal({
    governed,
    locale: locale === "en-US" ? "en-US" : "pt-BR",
    projectId: parsed.data.projectId,
    sessionId: runtime.session.id,
    sourceResultIds,
    supabase: runtime.supabase,
  });
  if (items.length === 0) return {ok: false, code: "stale"};

  const {error} = await runtime.supabase.rpc("record_information_pack_revision", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.session.id,
    p_items: items as unknown as Json,
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  if (error) return {ok: false, code: error.code === "42501" ? "forbidden" : "save"};
  return {ok: true};
}

const recipientSchema = z.object({
  kind: z.enum(["registered_organization", "directory_entry"]),
  id: z.uuid(),
  label: z.string().trim().min(2).max(200),
});

/** The issuer authorizes an exact pack revision for named recipient organizations, with consent. */
export async function authorizeProjectPackDistribution(
  _previous: DistributionActionState,
  formData: FormData,
): Promise<DistributionActionState> {
  void _previous;
  const locale = localeOf(formData.get("locale"));
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    packRevisionId: z.uuid(),
    packFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    consentStatement: z.string().trim().min(20).max(2000),
    consentAttestation: z.literal("confirmed"),
    recipients: z.array(recipientSchema).min(1).max(20),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    packRevisionId: value(formData, "pack_revision_id"),
    packFingerprint: value(formData, "pack_fingerprint"),
    consentStatement: value(formData, "consent_statement"),
    consentAttestation: value(formData, "consent_attestation"),
    recipients: formData.getAll("recipient").flatMap((entry) => {
      if (typeof entry !== "string") return [];
      const [kind, id, ...label] = entry.split("|");
      return [{kind, id, label: label.join("|")}];
    }),
  });
  if (!parsed.success) return {ok: false, code: parsed.error.issues.some((issue) => issue.path[0] === "consentStatement" || issue.path[0] === "consentAttestation") ? "consent" : "invalid"};

  const runtime = await distributionRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  if (runtime.session.representation_status !== "verified") return {ok: false, code: "forbidden"};

  const {error} = await runtime.supabase.rpc("authorize_pack_distribution", {
    p_organization_id: runtime.organization.id,
    p_session_id: runtime.session.id,
    p_pack_revision_id: parsed.data.packRevisionId,
    p_pack_fingerprint: parsed.data.packFingerprint,
    p_consent_statement: parsed.data.consentStatement,
    p_recipients: parsed.data.recipients.map((recipient) => ({
      recipientKind: recipient.kind,
      ...(recipient.kind === "registered_organization"
        ? {recipientOrganizationId: recipient.id}
        : {recipientDirectoryId: recipient.id}),
      label: recipient.label,
    })) as unknown as Json,
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  if (!error) return {ok: true};
  if (error.code === "42501") return {ok: false, code: "forbidden"};
  if (error.message.includes("active_market_distribution_policy_required")) return {ok: false, code: "policy"};
  if (error.message.includes("wave_limit_exceeded")) return {ok: false, code: "wave"};
  if (error.message.includes("consent")) return {ok: false, code: "consent"};
  if (error.message.includes("recipient")) return {ok: false, code: "recipient"};
  return {ok: false, code: "save"};
}

export async function revokeProjectPackDistribution(
  _previous: DistributionActionState,
  formData: FormData,
): Promise<DistributionActionState> {
  void _previous;
  const locale = localeOf(formData.get("locale"));
  const parsed = z.object({projectId: z.uuid(), sessionId: z.uuid(), authorizationId: z.uuid()}).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    authorizationId: value(formData, "authorization_id"),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await distributionRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const {error} = await runtime.supabase.rpc("revoke_pack_distribution", {
    p_authorization_id: parsed.data.authorizationId,
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  if (error) return {ok: false, code: error.code === "42501" ? "forbidden" : "save"};
  return {ok: true};
}

/**
 * Prepares one qualified contact. Only a candidate whose fit is eligible may name a pack share; a
 * research hypothesis is prepared for study and can never be introduced.
 */
export async function prepareProjectQualifiedContact(
  _previous: QualifiedContactActionState,
  formData: FormData,
): Promise<QualifiedContactActionState> {
  void _previous;
  const locale = localeOf(formData.get("locale"));
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    targetId: z.uuid(),
    candidateFit: z.enum(["eligible", "hypothesis"]),
    rationale: z.string().trim().min(20).max(4000),
    shareId: z.uuid().optional(),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    targetId: value(formData, "target_id"),
    candidateFit: value(formData, "candidate_fit"),
    rationale: value(formData, "rationale"),
    shareId: value(formData, "share_id") || undefined,
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  if (parsed.data.candidateFit === "eligible" && !parsed.data.shareId) return {ok: false, code: "pack"};
  if (parsed.data.candidateFit === "hypothesis" && parsed.data.shareId) return {ok: false, code: "hypothesis"};

  const runtime = await distributionRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const {error} = await runtime.supabase.rpc("prepare_qualified_contact", {
    p_target_id: parsed.data.targetId,
    p_candidate_fit: parsed.data.candidateFit,
    p_rationale: parsed.data.rationale,
    ...(parsed.data.shareId ? {p_share_id: parsed.data.shareId} : {}),
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  if (!error) return {ok: true};
  if (error.code === "42501") return {ok: false, code: "forbidden"};
  if (error.message.includes("hypothesis")) return {ok: false, code: "hypothesis"};
  if (error.message.includes("pack") || error.message.includes("share")) return {ok: false, code: "pack"};
  return {ok: false, code: "save"};
}

/** Records the introduction inside the product. It creates no delivery of any kind. */
export async function releaseProjectQualifiedContact(
  _previous: QualifiedContactActionState,
  formData: FormData,
): Promise<QualifiedContactActionState> {
  void _previous;
  const locale = localeOf(formData.get("locale"));
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    preparationId: z.uuid(),
    packFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    releaseAttestation: z.literal("confirmed"),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    preparationId: value(formData, "preparation_id"),
    packFingerprint: value(formData, "pack_fingerprint"),
    releaseAttestation: value(formData, "release_attestation"),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await distributionRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const {error} = await runtime.supabase.rpc("release_qualified_contact", {
    p_preparation_id: parsed.data.preparationId,
    p_pack_fingerprint: parsed.data.packFingerprint,
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  if (!error) return {ok: true};
  if (error.code === "42501") return {ok: false, code: "forbidden"};
  if (error.message.includes("hypothesis")) return {ok: false, code: "hypothesis"};
  if (error.message.includes("pack_changed")) return {ok: false, code: "pack"};
  return {ok: false, code: "save"};
}

/** The issuer records the work it will do for one recipient. No option asserts an outcome. */
export async function recordProjectDistributionNextStep(
  _previous: DistributionActionState,
  formData: FormData,
): Promise<DistributionActionState> {
  void _previous;
  const locale = localeOf(formData.get("locale"));
  const parsed = z.object({
    projectId: z.uuid(),
    sessionId: z.uuid(),
    shareId: z.uuid(),
    stepCode: z.enum([
      "prepare_information_answer",
      "revise_structure",
      "schedule_conversation",
      "keep_on_hold",
      "close_without_continuation",
    ]),
    note: z.string().trim().min(3).max(2000).optional(),
  }).safeParse({
    projectId: value(formData, "project_id"),
    sessionId: value(formData, "session_id"),
    shareId: value(formData, "share_id"),
    stepCode: value(formData, "step_code"),
    note: value(formData, "note") || undefined,
  });
  if (!parsed.success) return {ok: false, code: "invalid"};
  const runtime = await distributionRuntime(locale, parsed.data.projectId, parsed.data.sessionId);
  if (!runtime) return {ok: false, code: "stale"};
  const {error} = await runtime.supabase.rpc("record_pack_distribution_next_step", {
    p_share_id: parsed.data.shareId,
    p_step_code: parsed.data.stepCode,
    ...(parsed.data.note ? {p_note: parsed.data.note} : {}),
  });
  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  if (error) return {ok: false, code: error.code === "42501" ? "forbidden" : "save"};
  return {ok: true};
}
