import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

const publicSourceSchema = z.object({
  provider: z.string(),
  topic: z.string(),
  title: z.string(),
  url: z.url(),
  snippet: z.string(),
  publishedAt: z.string().nullable(),
});

export const preliminaryUnderstandingSchema = z.object({
  schemaVersion: z.literal("2026.08.31-v1"),
  caseId: z.uuid(),
  locale: z.enum(["pt-BR", "en-US"]),
  summary: z.string().min(1),
  company: z.object({
    name: z.string().min(1),
    legalName: z.string().nullable(),
    description: z.string().nullable(),
    website: z.string().nullable(),
    sector: z.string().nullable(),
    geography: z.string().nullable(),
    companySummary: z.string().min(1),
    sectorSummary: z.string().nullable(),
    positioningSummary: z.string().nullable(),
  }),
  operation: z.object({
    archetypeId: z.string(),
    archetypeLabel: z.string(),
    objective: z.string().nullable(),
    requestedAmount: z.string().nullable(),
    currency: z.string(),
    urgency: z.string().nullable(),
    requestedTermMonths: z.number().nullable(),
    consequenceIfNotExecuted: z.string().nullable(),
    operationSummary: z.string().min(1),
  }),
  basis: z.object({
    preliminaryDocumentCount: z.number().int().nonnegative(),
    userDeclared: z.boolean(),
    publicResearch: z.object({
      status: z.enum(["succeeded", "partial", "abstained", "skipped"]),
      sourceCount: z.number().int().nonnegative(),
      topicCounts: z.record(z.string(), z.number()),
      researchRunId: z.string().nullable(),
      sources: z.array(publicSourceSchema),
    }),
  }),
  preliminaryAssessment: z.object({
    openPoints: z.array(z.string()),
    researchSignals: z.array(z.object({
      claim: z.string(),
      sourceUrls: z.array(z.url()),
    })),
    boundary: z.string(),
  }),
});

export type PreliminaryUnderstanding = z.infer<typeof preliminaryUnderstandingSchema>;
export type PreliminaryUnderstandingRow = Database["public"]["Tables"]["preliminary_understandings"]["Row"];

export const preliminaryTaskIds = ["receive", "read", "organize", "research", "compile"] as const;
export type PreliminaryTaskId = typeof preliminaryTaskIds[number];
export type PreliminaryTaskStatus = "pending" | "running" | "completed" | "failed";
export type PreliminaryTask = {id: PreliminaryTaskId; status: PreliminaryTaskStatus};

const stageEventSchema = z.object({
  stage: z.string(),
  status: z.enum(["started", "succeeded", "failed", "skipped"]),
});

const stageToTask: Record<string, PreliminaryTaskId> = {
  download: "receive",
  gate: "receive",
  parse: "read",
  parse_nfe_archive: "read",
  profile: "read",
  extract: "read",
  index_retrieval: "organize",
  record_candidates: "organize",
  store_receivables_evidence: "organize",
  prepare_requests: "organize",
  public_research: "research",
  preliminary_understanding: "compile",
};

/** Projects the durable worker timeline into the five user-facing steps of the first reading. */
export function projectPreliminaryTasks(stages: unknown, isProcessing: boolean): PreliminaryTask[] {
  const events = z.array(stageEventSchema).catch([]).parse(stages);
  const byTask = new Map<PreliminaryTaskId, PreliminaryTaskStatus>();
  for (const event of events) {
    const task = stageToTask[event.stage];
    if (!task) continue;
    const previous = byTask.get(task);
    if (event.status === "failed") byTask.set(task, "failed");
    else if (event.status === "succeeded" || event.status === "skipped") {
      if (previous !== "failed") byTask.set(task, "completed");
    } else if (!previous) byTask.set(task, "running");
  }

  const preliminaryStarted = events.some((event) => event.stage === "preliminary_understanding");
  if (preliminaryStarted) {
    for (const id of ["receive", "read", "organize"] as const) {
      if (byTask.get(id) !== "failed") byTask.set(id, "completed");
    }
  }
  if (byTask.get("research") === "completed" && byTask.get("compile") !== "completed" && byTask.get("compile") !== "failed") {
    byTask.set("compile", "running");
  }

  const tasks = preliminaryTaskIds.map((id) => ({id, status: byTask.get(id) ?? "pending"}));
  if (isProcessing && tasks.every((task) => task.status === "pending")) tasks[0]!.status = "running";
  if (isProcessing && !tasks.some((task) => task.status === "running" || task.status === "failed")) {
    const next = tasks.find((task) => task.status === "pending");
    if (next) next.status = "running";
  }
  return tasks;
}

export type PreliminaryUnderstandingState = {
  current: {row: PreliminaryUnderstandingRow; value: PreliminaryUnderstanding} | null;
  isProcessing: boolean;
  tasks: PreliminaryTask[];
};

/** Loads the exact preliminary object the user may confirm, plus whether its worker is active. */
export async function loadPreliminaryUnderstanding(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<PreliminaryUnderstandingState> {
  const [understandingResult, jobsResult, runResult] = await Promise.all([
    supabase
      .from("preliminary_understandings")
      .select("id, organization_id, intake_session_id, processing_run_id, object_version, status, input_fingerprint, object_fingerprint, payload, correction, decided_by, decided_at, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId)
      .neq("status", "superseded")
      .order("object_version", {ascending: false})
      .limit(1)
      .maybeSingle(),
    supabase
      .from("processing_jobs")
      .select("id, kind, status")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId)
      .in("kind", ["document_pipeline", "preliminary_analysis"])
      .in("status", ["queued", "leased"])
      .limit(1),
    supabase
      .from("processing_runs")
      .select("id, status, stages")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId)
      .order("run_no", {ascending: false})
      .limit(1)
      .maybeSingle(),
  ]);
  if (understandingResult.error) throw understandingResult.error;
  if (jobsResult.error) throw jobsResult.error;
  if (runResult.error) throw runResult.error;
  const parsed = preliminaryUnderstandingSchema.safeParse(understandingResult.data?.payload);
  const isProcessing = Boolean(jobsResult.data?.length);
  return {
    current: understandingResult.data && parsed.success
      ? {row: understandingResult.data, value: parsed.data}
      : null,
    isProcessing,
    tasks: projectPreliminaryTasks(runResult.data?.stages, isProcessing),
  };
}
