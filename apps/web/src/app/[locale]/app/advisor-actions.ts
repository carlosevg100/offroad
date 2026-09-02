"use server";

import {
  capitalProjectJob,
  capitalProjectJobSchema,
  inferCapitalProjectJob,
  type CapitalProjectJob,
} from "@offroad/work-plan";
import {after} from "next/server";
import {z} from "zod";

import {requireWorkspace} from "@/lib/auth/workspace";
import {compiledCapitalProjectPlan} from "@/lib/capital-project/plan";
import {processIntakeSession} from "@/lib/intake/server";

const localeSchema = z.enum(["pt-BR", "en-US"]);
const startSchema = z.object({
  locale: localeSchema,
  prompt: z.string().trim().min(2).max(8000),
  entryJobHint: capitalProjectJobSchema.exclude(["prepare_materials_and_process"]).nullable().optional(),
  hasAttachments: z.boolean(),
  requestId: z.string().uuid(),
});
const continueSchema = z.object({
  locale: localeSchema,
  projectId: z.string().uuid(),
  content: z.string().trim().min(1).max(8000),
  messageId: z.string().uuid(),
});
const projectSchema = z.object({locale: localeSchema, projectId: z.string().uuid()});

export type AdvisorActionError = "invalid" | "denied" | "duplicate" | "not_found" | "save" | "processing";
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

function actionError(error: {code?: string; message?: string} | null): AdvisorActionError {
  const message = error?.message ?? "";
  if (error?.code === "23505" || message.includes("already_in_use")) return "duplicate";
  if (error?.code === "P0002" || message.includes("not_found")) return "not_found";
  if (error?.code === "55000" || message.includes("in_progress")) return "processing";
  if (error?.code === "42501" || message.includes("required")) return "denied";
  return "save";
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
  const {locale, prompt, entryJobHint, hasAttachments, requestId} = parsed.data;
  const entryJob = inferCapitalProjectJob({
    message: prompt,
    hasAttachments,
    explicitHint: entryJobHint,
  }).job;
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
    p_plan: compiledCapitalProjectPlan(entryJob),
  };
  const result = await supabase.rpc("start_advisor_project_v1", args);
  if (result.error) return {ok: false, error: actionError(result.error)};
  const payload = record(result.data);
  const projectId = typeof payload?.capital_project_id === "string" ? payload.capital_project_id : null;
  const sessionId = typeof payload?.intake_session_id === "string" ? payload.intake_session_id : null;
  if (!projectId || !sessionId) return {ok: false, error: "save"};
  const privateCase = ["structure_from_documents", "review_existing_operation"].includes(entryJob);
  if (!hasAttachments && !privateCase) {
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
  const {error} = await supabase.rpc("submit_advisor_turn_v1", {
    p_project_id: parsed.data.projectId,
    p_message_id: parsed.data.messageId,
    p_locale: parsed.data.locale,
    p_content: parsed.data.content,
  });
  return error ? {ok: false, error: actionError(error)} : {ok: true};
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
    if (error) return {ok: false, error: actionError(error)};
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
      .select("entry_job")
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
  const privateCase = ["structure_from_documents", "review_existing_operation"].includes(project.entry_job);
  if (privateCase) return outcome.ok ? {ok: true} : {ok: false, error: "processing"};
  // Public planning and origination executors still begin through their deterministic activation
  // route. Private work instead advances through the preliminary evidence gate above.
  const queued = await supabase.rpc("queue_advisor_initial_turn_v1", {p_project_id: parsed.data.projectId});
  return outcome.ok && !queued.error ? {ok: true} : {ok: false, error: "processing"};
}
