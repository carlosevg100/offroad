import {z} from "zod";

export * from "./task-registry";
export * from "./capital-jobs";
export * from "./job-inference";

export const workPlanTaskIds = [
  "secure_documents",
  "read_and_classify",
  "organize_evidence",
  "prepare_information_request",
  "research_public_context",
  "load_house_method",
  "reconcile_sources",
  "analyze_financials",
  "identify_gaps",
  "evaluate_structures",
  "assess_risks",
  "prepare_institutional_materials",
  "screen_mandates",
  "prepare_next_step",
] as const;
export const workPlanTaskIdSchema = z.enum(workPlanTaskIds);
export type WorkPlanTaskId = z.infer<typeof workPlanTaskIdSchema>;

export const workPlanStatusSchema = z.enum(["pending", "running", "completed", "blocked", "failed"]);
export type WorkPlanStatus = z.infer<typeof workPlanStatusSchema>;

export const processingStageEventSchema = z.object({
  stage: z.string().min(1),
  status: z.enum(["started", "succeeded", "failed", "skipped"]),
  job_id: z.string().min(1).optional(),
  source_document_id: z.string().min(1).nullable().optional(),
  at: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).default({}),
});
export type ProcessingStageEvent = z.infer<typeof processingStageEventSchema>;

export type WorkPlanTask = {
  id: WorkPlanTaskId;
  status: WorkPlanStatus;
  completedUnits: number;
  totalUnits: number;
  durationMs: number;
  updatedAt: string | null;
  code?: string;
};

export type WorkPlan = {
  tasks: WorkPlanTask[];
  activeTaskId: WorkPlanTaskId | null;
  completionPercent: number;
  completedCount: number;
  totalCount: number;
};

type TaskSpec = {
  id: WorkPlanTaskId;
  startsWhen: readonly string[];
  completesWhen: readonly string[];
  unit: "document" | "case";
};

const taskSpecs: readonly TaskSpec[] = [
  {id: "secure_documents", startsWhen: ["download"], completesWhen: ["gate"], unit: "document"},
  {id: "read_and_classify", startsWhen: ["parse"], completesWhen: ["profile"], unit: "document"},
  {id: "organize_evidence", startsWhen: ["index_retrieval", "extract"], completesWhen: ["record_candidates"], unit: "document"},
  {id: "prepare_information_request", startsWhen: ["suggest_scope", "prepare_requests"], completesWhen: ["prepare_requests"], unit: "document"},
  {id: "research_public_context", startsWhen: ["public_research"], completesWhen: ["public_research"], unit: "case"},
  {id: "load_house_method", startsWhen: ["retrieval", "case:extraction"], completesWhen: ["case:extraction"], unit: "case"},
  {id: "reconcile_sources", startsWhen: ["case:reconciliation"], completesWhen: ["case:reconciliation"], unit: "case"},
  {id: "analyze_financials", startsWhen: ["case:metrics"], completesWhen: ["case:metrics"], unit: "case"},
  {id: "identify_gaps", startsWhen: ["case:gaps"], completesWhen: ["case:gaps"], unit: "case"},
  {id: "evaluate_structures", startsWhen: ["case:structure"], completesWhen: ["case:structure"], unit: "case"},
  {id: "assess_risks", startsWhen: ["case:red_flags", "case:claims"], completesWhen: ["case:claims"], unit: "case"},
  {id: "prepare_institutional_materials", startsWhen: ["case:materials"], completesWhen: ["case:language_conduct"], unit: "case"},
  {id: "screen_mandates", startsWhen: ["case:matching", "mandate_retrieval"], completesWhen: ["mandate_retrieval"], unit: "case"},
  {id: "prepare_next_step", startsWhen: ["case:outcome"], completesWhen: ["case:outcome"], unit: "case"},
] as const;

export function projectWorkPlan(input: {
  events: unknown;
  expectedDocumentCount?: number;
}): WorkPlan {
  const parsed = z.array(processingStageEventSchema).safeParse(input.events);
  const events = parsed.success ? parsed.data : [];
  const documentJobIds = new Set(events.filter((event) => event.source_document_id).map(eventUnit));
  const expectedDocuments = Math.max(input.expectedDocumentCount ?? 0, documentJobIds.size);
  const tasks = taskSpecs.map((spec) => projectTask(spec, events, expectedDocuments));
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.find((task) => task.status === "failed" || task.status === "blocked")
    ?? tasks.find((task) => task.status === "running")
    ?? tasks.find((task) => task.status === "pending")
    ?? null;
  return {
    tasks,
    activeTaskId: active?.id ?? null,
    completionPercent: tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100),
    completedCount,
    totalCount: tasks.length,
  };
}

function projectTask(spec: TaskSpec, events: ProcessingStageEvent[], expectedDocuments: number): WorkPlanTask {
  const relevant = events.filter((event) => spec.startsWhen.includes(event.stage) || spec.completesWhen.includes(event.stage));
  const latestByUnitAndStage = new Map<string, ProcessingStageEvent>();
  for (const event of relevant) latestByUnitAndStage.set(`${eventUnit(event)}:${event.stage}`, event);
  const latest = [...latestByUnitAndStage.values()];
  const failed = [...latest].reverse().find((event) => event.status === "failed");
  const blocked = failed?.detail.outcome === "blocked";
  const units = new Set(relevant.map(eventUnit));
  const targetUnits = spec.unit === "document" ? expectedDocuments : 1;
  const completedUnits = [...units].filter((unit) => spec.completesWhen.every((stage) => {
    const event = latestByUnitAndStage.get(`${unit}:${stage}`);
    return event?.status === "succeeded" || event?.status === "skipped";
  })).length;
  const hasStarted = latest.some((event) => event.status === "started" || event.status === "succeeded");
  const status: WorkPlanStatus = failed
    ? blocked ? "blocked" : "failed"
    : targetUnits > 0 && completedUnits >= targetUnits
      ? "completed"
      : hasStarted
        ? "running"
        : "pending";
  const updated = relevant.map((event) => event.at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    id: spec.id,
    status,
    completedUnits,
    totalUnits: Math.max(targetUnits, units.size),
    durationMs: latest.reduce((sum, event) => sum + numeric(event.detail.durationMs), 0),
    updatedAt: updated,
    ...(failed && typeof failed.detail.code === "string" ? {code: failed.detail.code} : {}),
  };
}

function eventUnit(event: ProcessingStageEvent): string {
  return event.source_document_id ?? event.job_id ?? "case";
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
