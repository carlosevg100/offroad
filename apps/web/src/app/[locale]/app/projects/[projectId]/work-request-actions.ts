"use server";

import {
  capitalProjectJobSchema,
  dispatchProjectWork,
  documentWorkPlanSnapshot,
  projectCapabilityIdSchema,
  projectCapabilityRegistryVersion,
  type ProjectWorkContext,
  type ProjectWorkSurface,
} from "@offroad/work-plan";
import {revalidatePath} from "next/cache";
import {z} from "zod";

import {advisorActionError, type AdvisorActionError} from "@/lib/advisor/advisor-action-error";
import {loadInstitutionalSetupContext} from "@/lib/advisor/institutional-setup-reader";
import {countAcceptedDebtFacts} from "@/lib/advisor/project-work-requests";
import {loadProjectReviewContext} from "@/lib/advisor/project-review-context";
import {requireWorkspace} from "@/lib/auth/workspace";
import type {Json} from "@/types/database";

const requestSchema = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  projectId: z.uuid(),
  requestId: z.uuid(),
  capability: z.union([projectCapabilityIdSchema, z.literal("auto")]),
  objective: z.string().trim().min(3).max(8000),
  originSection: z.string().trim().min(1).max(120).nullable().optional(),
  documentary: z.object({
    executionBriefId: z.uuid(),
    expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict().optional(),
}).strict();

export type ProjectWorkRequestResult =
  | {ok: true; status: "dispatched" | "needs_information"; surface: ProjectWorkSurface; requestId: string}
  | {ok: false; error: AdvisorActionError | "unsupported" | "blocked"};

/** Same registry decision as the preview, taken again on the server from the project's real
 * state, then one atomic command. Documentary reading runs its existing revision command inside
 * that transaction; financial and provider work continue on their own governed surfaces. */
export async function requestProjectWork(input: unknown): Promise<ProjectWorkRequestResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {locale, projectId, requestId, capability, objective, originSection, documentary} = parsed.data;
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects")
    .select("id, entry_job, access_basis, status")
    .eq("organization_id", organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return {ok: false, error: "not_found"};
  const entry = capitalProjectJobSchema.safeParse(project.entry_job);
  if (!entry.success) return {ok: false, error: "invalid"};
  const {data: session} = await supabase.from("document_intake_sessions")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("capital_project_id", projectId)
    .order("created_at", {ascending: true})
    .limit(1)
    .maybeSingle();
  const [{data: documents}, {data: brief}, {data: plan}, institutional, review] = await Promise.all([
    session
      ? supabase.from("source_documents").select("id, processing_status").eq("organization_id", organization.id).eq("intake_session_id", session.id)
      : Promise.resolve({data: [] as {id: string; processing_status: string}[]}),
    supabase.from("capital_project_execution_briefs").select("id, brief_fingerprint").eq("organization_id", organization.id)
      .eq("capital_project_id", projectId).order("brief_version", {ascending: false}).limit(1).maybeSingle(),
    supabase.from("capital_project_plans").select("id").eq("organization_id", organization.id)
      .eq("capital_project_id", projectId).eq("status", "active").maybeSingle(),
    loadInstitutionalSetupContext(supabase, projectId),
    loadProjectReviewContext(supabase, projectId),
  ]);
  const context: ProjectWorkContext = {
    accessBasis: project.access_basis,
    documentaryPlanningEnabled: process.env.DOCUMENTARY_WORK_PLANNING_ENABLED === "true",
    readyDocumentCount: (documents ?? []).filter((document) => document.processing_status === "ready").length,
    executionBriefAvailable: Boolean(brief),
    institutionalSetupAvailable: Boolean(institutional),
    providerCaseFitAvailable: Boolean(plan),
    acceptedDebtFactCount: countAcceptedDebtFacts(institutional),
    callerActions: review
      ? {prepare: review.caller.canPrepare, return: review.caller.canReturn, approve: review.caller.canApprove}
      : {prepare: false, return: false, approve: false},
  };
  const dispatch = dispatchProjectWork({objective, capability}, context);
  if (dispatch.kind === "unsupported") return {ok: false, error: "unsupported"};
  if (dispatch.kind === "blocked") {
    if (dispatch.reason === "not_authorized") return {ok: false, error: "role"};
    if (dispatch.reason !== "missing_inputs") return {ok: false, error: "blocked"};
  }
  const surface = dispatch.entry.executor.surface;
  const status = dispatch.kind === "dispatch" ? "dispatched" as const : "needs_information" as const;
  const documentaryCommand = dispatch.kind === "dispatch" && dispatch.capability === "documentary_reading";
  if (documentaryCommand && (!documentary || !brief || brief.id !== documentary.executionBriefId)) {
    // The reviewed version must be the current one; a newer version requires a fresh request.
    return {ok: false, error: !documentary ? "invalid" : "stale"};
  }
  const {error} = await supabase.rpc("record_capital_project_work_request_v1", {
    p_project_id: projectId,
    p_request_id: requestId,
    p_capability: dispatch.capability,
    p_objective: objective,
    p_locale: locale,
    p_registry_version: projectCapabilityRegistryVersion,
    p_dispatch: {
      surface,
      executor: dispatch.entry.executor.key,
      executorVersion: dispatch.entry.executor.version,
      capabilityVersion: dispatch.entry.version,
      documentaryJob: dispatch.kind === "dispatch" ? dispatch.documentaryJob : null,
      note: dispatch.kind === "dispatch" ? dispatch.note : null,
      missingInputs: dispatch.kind === "blocked" ? dispatch.missingInputs : [],
    } as unknown as Json,
    // The parameter is nullable text; the generated client type does not express nullability.
    p_origin_section: originSection ?? (null as unknown as string),
    p_status: status,
    ...(documentaryCommand && documentary ? {
      p_documentary: {
        execution_brief_id: documentary.executionBriefId,
        expected_fingerprint: documentary.expectedFingerprint,
        message_id: requestId,
        plan: documentWorkPlanSnapshot(entry.data),
      } as unknown as Json,
    } : {}),
  });
  if (error) return {ok: false, error: advisorActionError(error)};
  revalidatePath(`/${locale}/app/projects/${projectId}`);
  return {ok: true, status, surface, requestId};
}
