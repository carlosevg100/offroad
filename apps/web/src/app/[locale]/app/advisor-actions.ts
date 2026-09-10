"use server";

import {isGovernedWorkProductRevisionRequest} from "@offroad/agent-contracts";
import {
  canCompileStandaloneDocumentWorkRequest,
  documentWorkPlanSnapshot,
  capitalProjectJob,
  capitalProjectJobSchema,
  compileAdvisorStartingPlan,
  isProviderResearchRequest,
  providerResearchPlanSnapshot,
  type CapitalProjectJob,
} from "@offroad/work-plan";
import {after} from "next/server";
import {z} from "zod";

import {advisorActionError, type AdvisorActionError} from "@/lib/advisor/advisor-action-error";
import {requireUser, requireWorkspace} from "@/lib/auth/workspace";
import type {Json} from "@/types/database";
import {processIntakeSession} from "@/lib/intake/server";
import {reviewInstitutionalConfiguration} from "@/lib/advisor/institutional-configuration-review-command";
import {startProviderResearchProject} from "@/lib/advisor/provider-research-command";

const localeSchema = z.enum(["pt-BR", "en-US"]);
const startSchema = z.object({
  locale: localeSchema,
  prompt: z.string().trim().min(2).max(8000),
  entryJobHint: capitalProjectJobSchema.exclude(["prepare_materials_and_process"]).nullable().optional(),
  hasAttachments: z.boolean(),
  requestId: z.string().uuid(),
  groupId: z.string().uuid().nullable().optional(),
});
const continueSchema = z.object({
  locale: localeSchema,
  projectId: z.string().uuid(),
  content: z.string().trim().min(1).max(8000),
  messageId: z.string().uuid(),
});
const executionBriefEditSchema = continueSchema.extend({
  executionBriefId: z.string().uuid(),
  expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
const informationResponseSchema = continueSchema.extend({
  requestId: z.string().uuid(),
  expectedUpdatedAt: z.iso.datetime({offset: true}),
  answerSource: z.enum(["choice", "custom", "unavailable"]),
});
const projectSchema = z.object({locale: localeSchema, projectId: z.string().uuid()});
const executionBriefApprovalSchema = projectSchema.extend({
  executionBriefId: z.uuid(),
  expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  commandId: z.uuid(),
});

export type {AdvisorActionError} from "@/lib/advisor/advisor-action-error";
export type StartAdvisorProjectResult =
  | {ok: true; entryJob: CapitalProjectJob; projectId: string; sessionId: string}
  | {ok: false; error: AdvisorActionError};
export type AdvisorMessageResult = {ok: true} | {ok: false; error: AdvisorActionError};
export type AdvisorUploadScopeResult =
  | {ok: true; organizationId: string; sessionId: string; userId: string}
  | {ok: false; error: AdvisorActionError};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}


function projectTitle(prompt: string, job: CapitalProjectJob, locale: "pt-BR" | "en-US"): string {
  const withoutUrl = prompt.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  const sentence = withoutUrl.split(/[.!?\n]/, 1)[0]?.trim() ?? "";
  if (sentence.length >= 2) return sentence.slice(0, 80).trim();
  return capitalProjectJob(job).title[locale === "en-US" ? "en" : "pt"].slice(0, 80);
}

/** Creates the project shell immediately. Analysis is started only after the prompt and any
 * selected documents are durably registered, so a click never waits for an LLM round trip. */
export async function startAdvisorProject(input: unknown): Promise<StartAdvisorProjectResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {locale, prompt, entryJobHint, hasAttachments, requestId, groupId} = parsed.data;
  const providerResearch = !hasAttachments && !entryJobHint && isProviderResearchRequest(prompt);
  const {entryJob, plan} = providerResearch ? {entryJob: "company_debt_view" as const, plan: providerResearchPlanSnapshot()} : compileAdvisorStartingPlan({
    message: prompt,
    hasAttachments,
    explicitHint: entryJobHint,
    documentaryEnabled: process.env.DOCUMENTARY_WORK_PLANNING_ENABLED === "true",
  });
  const {supabase} = await requireWorkspace(locale);
  const baseName = projectTitle(prompt, entryJob, locale);
  const args = {
    p_request_id: requestId,
    p_locale: locale,
    p_project_name: baseName,
    p_entry_job: entryJob,
    p_prompt: prompt,
    p_access_basis: hasAttachments || ["structure_from_documents", "review_existing_operation"].includes(entryJob)
      ? "authorized_private"
      : "public_information",
    p_plan: plan as unknown as Json,
  };
  const result = providerResearch
    ? await startProviderResearchProject(supabase, {p_request_id: requestId, p_locale: locale, p_project_name: baseName,
      p_prompt: prompt, p_plan: plan as unknown as Json, p_group_id: groupId ?? undefined})
    : await supabase.rpc("start_advisor_project_in_group_v1", {...args, p_group_id: groupId ?? undefined});
  if (result.error) return {ok: false, error: advisorActionError(result.error)};
  const payload = record(result.data);
  const projectId = typeof payload?.capital_project_id === "string" ? payload.capital_project_id : null;
  const sessionId = typeof payload?.intake_session_id === "string" ? payload.intake_session_id : null;
  if (!projectId || !sessionId) return {ok: false, error: "save"};
  const privateCase = ["structure_from_documents", "review_existing_operation"].includes(entryJob);
  if (!hasAttachments && !privateCase && !providerResearch) {
    // The project shell is the user-facing acknowledgement. Queueing is idempotent and runs
    // after that response so worker availability never delays navigation into the workspace.
    after(async () => {
      await supabase.rpc("queue_advisor_initial_turn_v1", {p_project_id: projectId});
    });
  }
  return {ok: true, entryJob, projectId, sessionId};
}

export async function appendAdvisorMessage(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = continueSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  if (isGovernedWorkProductRevisionRequest(parsed.data.content)) {
    const revision = await supabase.rpc("submit_advisor_artifact_revision_turn_v1", {
      p_project_id: parsed.data.projectId,
      p_message_id: parsed.data.messageId,
      p_locale: parsed.data.locale,
      p_content: parsed.data.content,
    });
    if (!revision.error) return {ok: true};
    // No pending governed artifact means this is an ordinary conversational request. The generic
    // turn remains available; authorization, stale-state and validation errors still fail closed.
    if (revision.error.code !== "P0002" || !revision.error.message.includes("advisor_revision_artifact_not_available")) {
      return {ok: false, error: advisorActionError(revision.error)};
    }
  }
  const {error} = await supabase.rpc("submit_advisor_turn_v1", {
    p_project_id: parsed.data.projectId,
    p_message_id: parsed.data.messageId,
    p_locale: parsed.data.locale,
    p_content: parsed.data.content,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

/** Starts a bounded documentary request in the same project. The atomic command preserves
 * history and source versions, then proposes a new plan requiring its own approval. */
export async function requestAdvisorDocumentaryWork(input: unknown): Promise<AdvisorMessageResult> {
  if (process.env.DOCUMENTARY_WORK_PLANNING_ENABLED !== "true") return {ok: false, error: "processing"};
  const parsed = executionBriefEditSchema.safeParse(input);
  if (!parsed.success || !canCompileStandaloneDocumentWorkRequest({objective: parsed.data.content,
    proposedDeliverable: "Preliminary documentary reading"})) return {ok: false, error: "invalid"};
  const {supabase, organization} = await requireWorkspace(parsed.data.locale);
  const {data: project, error: readError} = await supabase.from("capital_projects")
    .select("entry_job").eq("organization_id", organization.id).eq("id", parsed.data.projectId).maybeSingle();
  if (readError || !project) return {ok: false, error: "not_found"};
  const entry = capitalProjectJobSchema.safeParse(project.entry_job);
  if (!entry.success) return {ok: false, error: "invalid"};
  const {error} = await supabase.rpc("request_documentary_work_revision_v1", {
    p_project_id: parsed.data.projectId, p_execution_brief_id: parsed.data.executionBriefId,
    p_expected_fingerprint: parsed.data.expectedFingerprint, p_message_id: parsed.data.messageId,
    p_locale: parsed.data.locale, p_content: parsed.data.content,
    p_plan: documentWorkPlanSnapshot(entry.data) as unknown as Json,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

/** Records a plan adjustment against the exact immutable brief the person reviewed, then queues
 * the same advisor runtime used by the conversation. The database owns stale-state detection,
 * idempotency and the audit binding; the UI never manufactures a replacement plan. */
export async function requestAdvisorExecutionBriefEdit(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = executionBriefEditSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireUser(parsed.data.locale);
  const {error} = await supabase.rpc("submit_advisor_execution_brief_edit_v1", {
    p_project_id: parsed.data.projectId,
    p_execution_brief_id: parsed.data.executionBriefId,
    p_expected_fingerprint: parsed.data.expectedFingerprint,
    p_message_id: parsed.data.messageId,
    p_locale: parsed.data.locale,
    p_content: parsed.data.content,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

/** Records exact-plan consent and releases only the already bound work in one transaction.
 * Workspace identity comes from the authenticated session; the client cannot grant authority. */
export async function approveAdvisorExecutionBrief(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = executionBriefApprovalSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireUser(parsed.data.locale);
  const {error} = await supabase.rpc("approve_advisor_execution_brief_v1", {
    p_project_id: parsed.data.projectId,
    p_execution_brief_id: parsed.data.executionBriefId,
    p_expected_fingerprint: parsed.data.expectedFingerprint,
    p_command_id: parsed.data.commandId,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

/** Answers the exact contextual question displayed in the workspace. Closing the question,
 * recording its audit binding and queueing replanning are one database transaction. */
export async function answerAdvisorInformationRequest(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = informationResponseSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("submit_advisor_information_response_v1", {
    p_project_id: parsed.data.projectId,
    p_request_id: parsed.data.requestId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_message_id: parsed.data.messageId,
    p_locale: parsed.data.locale,
    p_answer_source: parsed.data.answerSource,
    p_content: parsed.data.content,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

/** Returns only the tenant scope derived from the authenticated workspace. Public projects are
 * promoted to private preparation under the already accepted workspace terms; representation
 * remains untouched and is still required only by the later introduction release. */
export async function prepareAdvisorDocumentUpload(input: unknown): Promise<AdvisorUploadScopeResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase, organization, userId} = await requireWorkspace(parsed.data.locale);
  const {data: project} = await supabase.from("capital_projects")
    .select("id, access_basis")
    .eq("organization_id", organization.id)
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (!project) return {ok: false, error: "not_found"};
  if (project.access_basis !== "authorized_private") {
    const {error} = await supabase.rpc("authorize_capital_project_private_work", {
      p_project_id: project.id,
      p_information_rights_declared: true,
    });
    if (error) return {ok: false, error: advisorActionError(error)};
  }
  const {data: session} = await supabase.from("document_intake_sessions")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("capital_project_id", project.id)
    .order("created_at", {ascending: true})
    .limit(1)
    .maybeSingle();
  return session
    ? {ok: true, organizationId: organization.id, sessionId: session.id, userId}
    : {ok: false, error: "not_found"};
}

export async function beginAdvisorProjectProcessing(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase, organization, userId} = await requireWorkspace(parsed.data.locale);
  const [{data: session}, {data: project}] = await Promise.all([
    supabase.from("document_intake_sessions")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", parsed.data.projectId)
      .order("created_at", {ascending: true})
      .limit(1)
      .maybeSingle(),
    supabase.from("capital_projects")
      .select("entry_job, access_basis")
      .eq("organization_id", organization.id)
      .eq("id", parsed.data.projectId)
      .maybeSingle(),
  ]);
  if (!session || !project) return {ok: false, error: "not_found"};
  const outcome = await processIntakeSession({
    supabase,
    organizationId: organization.id,
    userId,
    locale: parsed.data.locale,
    sessionId: session.id,
  });
  const privateCase = project.access_basis === "authorized_private"
    || ["structure_from_documents", "review_existing_operation"].includes(project.entry_job);
  if (privateCase) return outcome.ok ? {ok: true} : {ok: false, error: "processing"};
  // Public planning and origination executors still begin through their deterministic activation
  // route. Private work instead advances through the preliminary evidence gate above.
  const queued = await supabase.rpc("queue_advisor_initial_turn_v1", {p_project_id: parsed.data.projectId});
  return outcome.ok && !queued.error ? {ok: true} : {ok: false, error: "processing"};
}

/** Reviews an immutable configuration and queues deterministic calculation on approval. */
export async function reviewAdvisorInstitutionalConfiguration(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = projectSchema.extend({candidateId: z.uuid(), requestId: z.uuid(), expectedParentFingerprint: z.string().regex(/^[0-9a-f]{64}$/).nullable(), expectedCandidateFingerprint: z.string().regex(/^[0-9a-f]{64}$/), decision: z.enum(["approved", "rejected"])}).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await reviewInstitutionalConfiguration(supabase, {p_project_id: parsed.data.projectId, p_candidate_id: parsed.data.candidateId,
    p_expected_parent_fingerprint: parsed.data.expectedParentFingerprint, p_expected_candidate_fingerprint: parsed.data.expectedCandidateFingerprint, p_decision: parsed.data.decision, p_request_id: parsed.data.requestId, p_locale: parsed.data.locale});
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}
