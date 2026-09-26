"use server";

import {
  canCompileStandaloneDocumentWorkRequest,
  documentWorkPlanSnapshot,
  capitalProjectJob,
  capitalProjectJobSchema,
  compileWorkEntry,
  capitalProjectPlanSnapshot,
  type CapitalProjectJob,
} from "@offroad/work-plan";
import {getTranslations} from "next-intl/server";
import {z} from "zod";

import {advisorActionError, type AdvisorActionError} from "@/lib/advisor/advisor-action-error";
import {
  advisorMessageRoute,
  choiceOf,
  continuationChoiceInputSchema,
  draftRevisionUnavailable,
  resolveContinuation,
  type ContinuationOutcome,
} from "@/lib/advisor/work-continuation";
import {milestoneLabelText, workUpdateViewSchema, type MilestoneLabelKey} from "@/lib/advisor/work-update-view";
import {requireUser, requireWorkspace} from "@/lib/auth/workspace";
import type {Json} from "@/types/database";
import {processIntakeSession} from "@/lib/intake/server";
import {reviewInstitutionalConfiguration} from "@/lib/advisor/institutional-configuration-review-command";

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
  | {ok: true; entryJob: CapitalProjectJob; workId: string; projectId: string; sessionId: string | null}
  | {ok: false; error: AdvisorActionError};
export type {ContinuationChoice, ContinuationOutcome} from "@/lib/advisor/work-continuation";
/** A message may come back as a continuation: recorded from its base, or a question to ask. */
export type AdvisorMessageResult = {ok: true; continuation?: ContinuationOutcome} | {ok: false; error: AdvisorActionError};
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
  const {entryJob, plan} = compileWorkEntry({
    message: prompt, hasAttachments, explicitHint: entryJobHint,
    documentaryEnabled: process.env.DOCUMENTARY_WORK_PLANNING_ENABLED === "true",
  });
  const {supabase} = await requireWorkspace(locale);
  const baseName = projectTitle(prompt, entryJob, locale);
  const args = {
    p_request_id: requestId,
    p_locale: locale,
    p_title: baseName,
    p_entry_job: entryJob,
    p_prompt: prompt,
    p_access_basis: hasAttachments
      ? "authorized_private"
      : "public_information",
    p_plan: plan as unknown as Json,
    p_enqueue: !hasAttachments,
  };
  const result = await supabase.rpc("start_work_v1", {...args, p_group_id: groupId ?? undefined});
  if (result.error) return {ok: false, error: advisorActionError(result.error)};
  const payload = record(result.data);
  const workId = typeof payload?.workId === "string" ? payload.workId : null;
  const sessionId = typeof payload?.intake_session_id === "string" ? payload.intake_session_id : null;
  if (!workId) return {ok: false, error: "save"};
  return {ok: true, entryJob, workId, projectId: workId, sessionId};
}

type WorkspaceClient = Awaited<ReturnType<typeof requireWorkspace>>["supabase"];
type ConversationTurn = z.infer<typeof continueSchema>;

/**
 * Routes a message of the work's conversation (see `advisorMessageRoute`). A continuation is
 * resolved against the work's approved bases and recorded only from an explicit base; an ambiguous
 * or absent base comes back as a question and nothing is recorded until the person chooses. The
 * revision of a draft awaiting confirmation is tried only when the message names that draft. It
 * works the same with or without an intake session.
 */
export async function appendAdvisorMessage(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = continueSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const route = advisorMessageRoute(parsed.data.content);
  if (route.tryDraft) {
    const revision = await supabase.rpc("submit_advisor_artifact_revision_turn_v1", {
      p_project_id: parsed.data.projectId,
      p_message_id: parsed.data.messageId,
      p_locale: parsed.data.locale,
      p_content: parsed.data.content,
    });
    if (!revision.error) return {ok: true};
    // Nothing to revise here: the message follows its route. Authorization, stale-state and
    // validation errors still fail closed.
    if (!draftRevisionUnavailable(revision.error)) return {ok: false, error: advisorActionError(revision.error)};
  }
  if (route.kind === "continuation") return continueFromConversation(supabase, parsed.data);
  return appendConversationTurn(supabase, parsed.data);
}

async function appendConversationTurn(supabase: WorkspaceClient, turn: ConversationTurn): Promise<AdvisorMessageResult> {
  const {error} = await supabase.rpc("append_work_turn_v1", {
    p_work_id: turn.projectId,
    p_message_id: turn.messageId,
    p_locale: turn.locale,
    p_content: turn.content,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

async function milestoneLabels(locale: ConversationTurn["locale"]): Promise<(key: MilestoneLabelKey) => string> {
  const t = await getTranslations({locale, namespace: "App.workUpdates.labels"});
  return (key) => t(key);
}

async function continueFromConversation(supabase: WorkspaceClient, turn: ConversationTurn): Promise<AdvisorMessageResult> {
  const read = await supabase.rpc("work_update_view_v1", {p_work_id: turn.projectId});
  if (read.error) return {ok: false, error: advisorActionError(read.error)};
  const view = workUpdateViewSchema.safeParse(read.data);
  if (!view.success) return {ok: false, error: "save"};
  const translate = await milestoneLabels(turn.locale);
  let resolution: ReturnType<typeof resolveContinuation>;
  try {
    resolution = resolveContinuation({workId: turn.projectId, conversationId: view.data.conversationId, text: turn.content, milestones: view.data.milestones, translate});
  } catch {
    return {ok: false, error: "save"};
  }
  if (resolution.status === "question") {
    return {ok: true, continuation: {status: "question", code: resolution.code, options: resolution.options.map(choiceOf)}};
  }
  return recordContinuation(supabase, turn, resolution.base, translate);
}

async function recordContinuation(supabase: WorkspaceClient, turn: ConversationTurn,
  base: {milestoneId: string; decisionId: string; revision: number}, translate: (key: MilestoneLabelKey) => string): Promise<AdvisorMessageResult> {
  const {data, error} = await supabase.rpc("request_work_continuation_v1", {
    p_request_id: turn.messageId,
    p_work_id: turn.projectId,
    p_locale: turn.locale,
    p_content: turn.content,
    p_base_milestone_id: base.milestoneId,
    p_base_decision_id: base.decisionId,
    p_base_revision: base.revision,
  });
  if (error) return {ok: false, error: advisorActionError(error)};
  // The reply names the base the database recorded, in the person's language.
  const recorded = record(record(data)?.base);
  const label = typeof recorded?.label === "string" ? milestoneLabelText(recorded.label, translate) : "";
  return {ok: true, continuation: {status: "proposed", base: {milestoneId: base.milestoneId, decisionId: base.decisionId, revision: base.revision, label}}};
}

const continuationChoiceSchema = continueSchema.extend({base: continuationChoiceInputSchema});

/** Records a continuation from the base the person chose among the options of the question. */
export async function continueAdvisorWorkFromBase(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = continuationChoiceSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  return recordContinuation(supabase, parsed.data, parsed.data.base, await milestoneLabels(parsed.data.locale));
}

/** Sends the text as an ordinary turn when the person chooses not to continue from a base. */
export async function sendAdvisorMessageAsTurn(input: unknown): Promise<AdvisorMessageResult> {
  const parsed = continueSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  return appendConversationTurn(supabase, parsed.data);
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
  const {data: project} = await supabase.from("capital_projects").select("entry_job")
    .eq("organization_id", organization.id).eq("id", parsed.data.projectId).maybeSingle();
  const entry = capitalProjectJobSchema.safeParse(project?.entry_job);
  if (!entry.success) return {ok: false, error: "not_found"};
  const {data: sessionId, error} = await supabase.rpc("prepare_work_document_intake_v1", {
    p_work_id: parsed.data.projectId, p_locale: parsed.data.locale,
    p_plan: capitalProjectPlanSnapshot(entry.data) as unknown as Json,
  });
  if (error) return {ok: false, error: advisorActionError(error)};
  return sessionId
    ? {ok: true, organizationId: organization.id, sessionId, userId}
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
