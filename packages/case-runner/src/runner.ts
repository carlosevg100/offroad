import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const caseStageIds = [
  "extraction",
  "reconciliation",
  "metrics",
  "gaps",
  "structure",
  "red_flags",
  "claims",
  "materials",
  "language_conduct",
  "matching",
  "outcome",
] as const;
export const caseStageIdSchema = z.enum(caseStageIds);
export type CaseStageId = z.infer<typeof caseStageIdSchema>;

export const taskWorkflowSchema = z.enum(["knowledge", "case", "market"]);
export const taskPhaseSchema = z.enum([
  "understand",
  "diagnose",
  "structure",
  "prepare",
  "match",
  "introduce",
  "capture_feedback",
]);
export const taskEffectSchema = z.enum(["read_only", "propose_state", "compile_artifact", "external"]);
export const taskExecutionClassSchema = z.enum(["deterministic", "model"]);

export type CaseTaskSpec = {
  id: CaseStageId;
  workflow: "case";
  phase: z.infer<typeof taskPhaseSchema>;
  version: string;
  dependencies: readonly CaseStageId[];
  allowedTools: readonly string[];
  effect: z.infer<typeof taskEffectSchema>;
  executionClass: z.infer<typeof taskExecutionClassSchema>;
};

/**
 * The first production-consumed graph registry. This is deliberately smaller than the target
 * registry in the architecture paper: every node below is executed by the current case rail.
 */
export const caseTaskSpecs = [
  {id: "extraction", workflow: "case", phase: "understand", version: "1", dependencies: [], allowedTools: ["document_candidates", "document_inventory"], effect: "read_only", executionClass: "deterministic"},
  {id: "reconciliation", workflow: "case", phase: "diagnose", version: "1", dependencies: ["extraction"], allowedTools: ["reconciliation", "evidence_ledger"], effect: "propose_state", executionClass: "deterministic"},
  {id: "metrics", workflow: "case", phase: "diagnose", version: "1", dependencies: ["reconciliation"], allowedTools: ["readiness", "financial_core", "credit_analysis", "receivables_analysis"], effect: "propose_state", executionClass: "deterministic"},
  {id: "gaps", workflow: "case", phase: "diagnose", version: "1", dependencies: ["reconciliation", "metrics"], allowedTools: ["readiness", "information_request"], effect: "propose_state", executionClass: "deterministic"},
  {id: "structure", workflow: "case", phase: "structure", version: "2", dependencies: ["reconciliation", "metrics"], allowedTools: ["financial_core", "deal_structure", "instrument_catalogue", "market_reference", "structure_designer"], effect: "propose_state", executionClass: "model"},
  {id: "red_flags", workflow: "case", phase: "diagnose", version: "1", dependencies: ["reconciliation", "structure"], allowedTools: ["red_flag_truth", "red_flag_review"], effect: "propose_state", executionClass: "deterministic"},
  {id: "claims", workflow: "case", phase: "diagnose", version: "3", dependencies: ["reconciliation", "metrics"], allowedTools: ["case_brief_writer", "claim_auditor"], effect: "propose_state", executionClass: "model"},
  {id: "materials", workflow: "case", phase: "prepare", version: "2", dependencies: ["extraction", "reconciliation", "metrics", "structure", "red_flags", "claims"], allowedTools: ["case_materials", "financial_model", "data_room", "claim_registry"], effect: "compile_artifact", executionClass: "deterministic"},
  {id: "language_conduct", workflow: "case", phase: "prepare", version: "1", dependencies: ["structure", "materials"], allowedTools: ["language_conduct_truth", "release_gate"], effect: "propose_state", executionClass: "deterministic"},
  {id: "matching", workflow: "case", phase: "match", version: "1", dependencies: ["reconciliation", "metrics", "structure", "red_flags", "materials", "language_conduct"], allowedTools: ["fund_mandate", "matching_core", "market_truth"], effect: "propose_state", executionClass: "deterministic"},
  {id: "outcome", workflow: "case", phase: "introduce", version: "1", dependencies: ["metrics", "gaps", "structure", "red_flags", "materials", "language_conduct", "matching"], allowedTools: ["case_outcome"], effect: "propose_state", executionClass: "deterministic"},
] as const satisfies readonly CaseTaskSpec[];

const taskSpecById = new Map<CaseStageId, CaseTaskSpec>(caseTaskSpecs.map((spec) => [spec.id, spec]));

export const stageFailureKindSchema = z.enum([
  "read",
  "reconciliation",
  "calculation",
  "policy",
  "material",
  "matching",
  "budget",
  "contract",
]);
export type StageFailureKind = z.infer<typeof stageFailureKindSchema>;

export const stageStatusSchema = z.enum(["succeeded", "blocked", "failed", "skipped"]);
export type StageStatus = z.infer<typeof stageStatusSchema>;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const stageUsageSchema = z.object({
  costUsd: z.number().nonnegative(),
  modelCalls: z.number().int().nonnegative(),
});
export type StageUsage = z.infer<typeof stageUsageSchema>;

export const subtaskStatusSchema = z.enum(["succeeded", "failed", "skipped"]);
export const subtaskRunTraceSchema = z.object({
  graphId: z.string().min(1),
  taskId: z.string().min(1),
  specVersion: z.string().min(1),
  executionClass: taskExecutionClassSchema,
  status: subtaskStatusSchema,
  dependencies: z.array(z.string().min(1)),
  dependencyFingerprints: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  allowedTools: z.array(z.string().min(1)),
  toolsUsed: z.array(z.string().min(1)),
  sourceIds: z.array(z.string().min(1)),
  discardedSourceIds: z.array(z.string().min(1)),
  usage: stageUsageSchema,
  durationMs: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  code: z.string().min(1).optional(),
}).superRefine((trace, context) => {
  const allowed = new Set(trace.allowedTools);
  const ungoverned = trace.toolsUsed.filter((tool) => !allowed.has(tool));
  if (ungoverned.length > 0) {
    context.addIssue({code: "custom", path: ["toolsUsed"], message: `tools outside subtask spec: ${ungoverned.join(",")}`});
  }
  if (trace.executionClass === "deterministic" && trace.usage.modelCalls > 0) {
    context.addIssue({code: "custom", path: ["usage", "modelCalls"], message: "a deterministic subtask cannot consume model calls"});
  }
  if (trace.status === "succeeded" && !trace.outputFingerprint) {
    context.addIssue({code: "custom", path: ["outputFingerprint"], message: "a succeeded subtask requires an output fingerprint"});
  }
  if (trace.status === "failed" && !trace.code) {
    context.addIssue({code: "custom", path: ["code"], message: "a failed subtask requires a stable code"});
  }
});
export type SubtaskRunTrace = z.infer<typeof subtaskRunTraceSchema>;

export const taskRunTraceSchema = z.object({
  taskId: caseStageIdSchema,
  specVersion: z.string().min(1),
  workflow: taskWorkflowSchema,
  phase: taskPhaseSchema,
  executionClass: taskExecutionClassSchema,
  status: stageStatusSchema,
  dependencies: z.array(caseStageIdSchema),
  dependencyFingerprints: z.partialRecord(caseStageIdSchema, z.string().regex(/^[a-f0-9]{64}$/)),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  allowedTools: z.array(z.string().min(1)),
  toolsUsed: z.array(z.string().min(1)),
  sourceIds: z.array(z.string().min(1)),
  discardedSourceIds: z.array(z.string().min(1)),
  attemptCount: z.number().int().nonnegative(),
  terminationReason: z.enum([
    "completed",
    "cache_hit",
    "blocked",
    "failed",
    "dependency_not_satisfied",
    "budget_exceeded",
  ]),
  cacheHit: z.boolean(),
  usage: stageUsageSchema,
  durationMs: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  subtasks: z.array(subtaskRunTraceSchema).default([]),
}).superRefine((trace, context) => {
  const allowed = new Set(trace.allowedTools);
  const ungoverned = trace.toolsUsed.filter((tool) => !allowed.has(tool));
  if (ungoverned.length > 0) {
    context.addIssue({code: "custom", path: ["toolsUsed"], message: `tools outside TaskSpec: ${ungoverned.join(",")}`});
  }
  if (trace.executionClass === "deterministic" && trace.usage.modelCalls > 0) {
    context.addIssue({code: "custom", path: ["usage", "modelCalls"], message: "a deterministic task cannot consume model calls"});
  }
});
export type TaskRunTrace = z.infer<typeof taskRunTraceSchema>;

export const caseStageRecordSchema = z.object({
  stage: caseStageIdSchema,
  status: stageStatusSchema,
  failureKind: stageFailureKindSchema.optional(),
  code: z.string().min(1).optional(),
  output: jsonValueSchema.optional(),
  outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  usage: stageUsageSchema,
  durationMs: z.number().int().nonnegative(),
}).superRefine((record, context) => {
  if (record.status === "succeeded" && record.output === undefined) {
    context.addIssue({code: "custom", path: ["output"], message: "a succeeded stage must carry output"});
  }
  if ((record.status === "failed" || record.status === "blocked") && (!record.failureKind || !record.code)) {
    context.addIssue({code: "custom", path: ["code"], message: "a failed or blocked stage must carry a typed code"});
  }
});
export type CaseStageRecord = z.infer<typeof caseStageRecordSchema>;

export type CaseStageEvent =
  | {stage: CaseStageId; status: "started"}
  | {
      stage: CaseStageId;
      status: StageStatus;
      failureKind?: StageFailureKind;
      code?: string;
      outputFingerprint?: string;
      usage: StageUsage;
      durationMs: number;
    };

export const caseRunReportSchema = z.object({
  schemaVersion: z.enum(["2026.08.26-v3", "2026.08.29-v4"]),
  runId: z.string().min(1),
  caseId: z.string().min(1),
  status: z.enum(["succeeded", "blocked", "failed"]),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  stages: z.array(caseStageRecordSchema).length(caseStageIds.length),
  taskRuns: z.array(taskRunTraceSchema).default([]),
  usage: stageUsageSchema,
  versions: z.record(z.string(), z.string().min(1)),
  reportFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((report, context) => {
  if (report.stages.some((record, index) => record.stage !== caseStageIds[index])) {
    context.addIssue({code: "custom", path: ["stages"], message: "stages must preserve the governed order"});
  }
  if (report.taskRuns.length > 0 && report.taskRuns.some((record, index) => record.taskId !== caseStageIds[index])) {
    context.addIssue({code: "custom", path: ["taskRuns"], message: "task traces must preserve registry order"});
  }
  if (report.schemaVersion === "2026.08.29-v4" && report.taskRuns.length !== caseStageIds.length) {
    context.addIssue({code: "custom", path: ["taskRuns"], message: "v4 reports must include one trace per task"});
  }
  const stageById = new Map(report.stages.map((stage) => [stage.stage, stage]));
  for (const spec of caseTaskSpecs) {
    const stage = stageById.get(spec.id);
    if (stage?.status !== "succeeded") continue;
    if (spec.dependencies.some((dependency) => stageById.get(dependency)?.status !== "succeeded")) {
      context.addIssue({code: "custom", path: ["stages"], message: `${spec.id} ran without all governed dependencies`});
    }
  }
});
export type CaseRunReport = z.infer<typeof caseRunReportSchema>;

export type StageExecution = {
  output: unknown;
  usage?: Partial<StageUsage>;
  trace?: {
    toolsUsed?: string[];
    sourceIds?: string[];
    discardedSourceIds?: string[];
    attemptCount?: number;
    subtasks?: SubtaskRunTrace[];
  };
};

export type StageContext = {
  runId: string;
  caseId: string;
  input: unknown;
  outputs: Readonly<Partial<Record<CaseStageId, unknown>>>;
  usage: Readonly<StageUsage>;
};

export type StageHandler = (context: StageContext) => Promise<StageExecution> | StageExecution;

export type StageDefinition = {
  outputSchema: z.ZodType;
  execute: StageHandler;
  /** Only values that can change this node independently of predecessor outputs. */
  selectInput?: (input: unknown) => unknown;
};

export type TaskResultCacheRecord = {
  output: unknown;
  outputFingerprint: string;
  toolsUsed: string[];
  sourceIds: string[];
  discardedSourceIds: string[];
};
export type TaskResultCache = {
  get(key: string): TaskResultCacheRecord | undefined;
  set(key: string, value: TaskResultCacheRecord): void;
};

export class InMemoryTaskResultCache implements TaskResultCache {
  readonly #records = new Map<string, TaskResultCacheRecord>();
  get(key: string) { return this.#records.get(key); }
  set(key: string, value: TaskResultCacheRecord) { this.#records.set(key, value); }
}

/** Rehydrates only verified successful outputs from an earlier report of the same case. */
export function taskCacheFromReport(report: CaseRunReport | undefined): InMemoryTaskResultCache {
  const cache = new InMemoryTaskResultCache();
  if (!report?.taskRuns.length) return cache;
  const stages = new Map(report.stages.map((stage) => [stage.stage, stage]));
  for (const trace of report.taskRuns) {
    const stage = stages.get(trace.taskId);
    if (stage?.status !== "succeeded" || stage.output === undefined || !stage.outputFingerprint) continue;
    if (stage.outputFingerprint !== trace.outputFingerprint || fingerprintJson(stage.output) !== stage.outputFingerprint) continue;
    cache.set(trace.inputFingerprint, {
      output: stage.output,
      outputFingerprint: stage.outputFingerprint,
      toolsUsed: [...trace.toolsUsed],
      sourceIds: [...trace.sourceIds],
      discardedSourceIds: [...trace.discardedSourceIds],
    });
  }
  return cache;
}

export type CaseRunPolicy = {
  maxCostUsd: number;
  maxModelCalls: number;
  stages?: Partial<Record<CaseStageId, Partial<StageUsage>>>;
};

export type RunCaseInput = {
  runId: string;
  caseId: string;
  input: unknown;
  inputSchema: z.ZodType;
  stages: Record<CaseStageId, StageDefinition>;
  policy: CaseRunPolicy;
  versions: Record<string, string>;
  /** Publishes borrower-safe progress without outputs, inputs or exception messages. */
  onStage?: (event: CaseStageEvent) => Promise<void> | void;
  taskCache?: TaskResultCache;
  now?: () => Date;
  monotonicNow?: () => number;
};

const failureKindOf: Record<CaseStageId, StageFailureKind> = {
  extraction: "read",
  reconciliation: "reconciliation",
  metrics: "calculation",
  gaps: "policy",
  structure: "policy",
  red_flags: "policy",
  claims: "policy",
  materials: "material",
  language_conduct: "policy",
  matching: "matching",
  outcome: "policy",
};

/** A deliberate hold. Its message is never persisted; only the stable code is. */
export class CaseStageBlocked extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CaseStageBlocked";
    this.code = code;
  }
}

/**
 * Executes the complete rail. Error messages and inputs are deliberately excluded from the
 * report. The persisted diagnostic is a stable code and a layer-specific failure type.
 */
export async function runCase(input: RunCaseInput): Promise<CaseRunReport> {
  const now = input.now ?? (() => new Date());
  const monotonicNow = input.monotonicNow ?? (() => Date.now());
  const startedAt = now().toISOString();
  const parsedInput = input.inputSchema.parse(input.input);
  const inputFingerprint = fingerprintJson(parsedInput);
  validateCaseGraph();
  const records = new Map<CaseStageId, CaseStageRecord>();
  const traces = new Map<CaseStageId, TaskRunTrace>();
  const outputs: Partial<Record<CaseStageId, unknown>> = {};
  const outputFingerprints = new Map<CaseStageId, string>();
  const usage: StageUsage = {costUsd: 0, modelCalls: 0};
  const pending = new Set<CaseStageId>(caseStageIds);

  while (pending.size > 0) {
    const dependencyBlocked = [...pending].filter((stage) => taskSpec(stage).dependencies.some((dependency) => {
      const status = records.get(dependency)?.status;
      return status === "failed" || status === "blocked" || status === "skipped";
    }));
    for (const stage of dependencyBlocked) {
      const spec = taskSpec(stage);
      const dependencyFingerprints = fingerprintsFor(spec.dependencies, outputFingerprints);
      const taskInputFingerprint = fingerprintJson({
        caseId: input.caseId,
        taskId: spec.id,
        specVersion: spec.version,
        versions: input.versions,
        selectedInput: input.stages[stage].selectInput?.(parsedInput) ?? parsedInput,
        dependencies: dependencyFingerprints,
      });
      const record: CaseStageRecord = {stage, status: "skipped", usage: {costUsd: 0, modelCalls: 0}, durationMs: 0};
      const skippedAt = now().toISOString();
      records.set(stage, record);
      traces.set(stage, traceFor(spec, record, taskInputFingerprint, dependencyFingerprints, {
        terminationReason: "dependency_not_satisfied",
        cacheHit: false,
        attemptCount: 0,
        startedAt: skippedAt,
        completedAt: skippedAt,
      }));
      pending.delete(stage);
      await publishStage(input.onStage, record);
    }
    if (dependencyBlocked.length > 0) continue;

    const ready = [...pending].filter((stage) => taskSpec(stage).dependencies.every((dependency) => records.get(dependency)?.status === "succeeded"));
    if (ready.length === 0) {
      if (pending.size === 0) break;
      throw Object.assign(new Error("case task graph has no executable node"), {code: "case_graph_deadlock"});
    }

    const batchOutputs = {...outputs};
    const batchUsage = {...usage};
    const deterministicReady = ready.filter((stage) => taskSpec(stage).executionClass === "deterministic");
    const modelReady = ready.filter((stage) => taskSpec(stage).executionClass === "model");
    // Model work is deliberately serialized. Deterministic branches remain parallel, while
    // a second expensive task can never spend against a stale view of the case budget.
    const executable = [...deterministicReady, ...modelReady.slice(0, 1)];
    const completed = await Promise.all(executable.map(async (stage) => executeGraphTask({
      stage,
      definition: input.stages[stage],
      parsedInput,
      outputs: batchOutputs,
      priorUsage: batchUsage,
      input,
      monotonicNow,
      now,
      outputFingerprints,
    })));
    for (const result of completed.sort((left, right) => caseStageIds.indexOf(left.stage) - caseStageIds.indexOf(right.stage))) {
      const {stage, record, trace} = result;
      records.set(stage, record);
      traces.set(stage, trace);
      pending.delete(stage);
      usage.costUsd += record.usage.costUsd;
      usage.modelCalls += record.usage.modelCalls;
      if (record.status === "succeeded" && record.output !== undefined && record.outputFingerprint) {
        outputs[stage] = record.output;
        outputFingerprints.set(stage, record.outputFingerprint);
      }
      await publishStage(input.onStage, record);
    }
  }

  const completedAt = now().toISOString();
  const orderedRecords = caseStageIds.map((stage) => records.get(stage)!);
  const orderedTraces = caseStageIds.map((stage) => traces.get(stage)!);
  const status = orderedRecords.some((stage) => stage.status === "failed")
    ? "failed" as const
    : orderedRecords.some((stage) => stage.status === "blocked")
      ? "blocked" as const
      : "succeeded" as const;
  const payload = {
    schemaVersion: "2026.08.29-v4" as const,
    runId: input.runId,
    caseId: input.caseId,
    status,
    startedAt,
    completedAt,
    inputFingerprint,
    stages: orderedRecords,
    taskRuns: orderedTraces,
    usage,
    versions: input.versions,
  };
  return caseRunReportSchema.parse({...payload, reportFingerprint: fingerprintJson(payload)});
}

async function executeGraphTask(input: {
  stage: CaseStageId;
  definition: StageDefinition;
  parsedInput: unknown;
  outputs: Partial<Record<CaseStageId, unknown>>;
  priorUsage: StageUsage;
  input: RunCaseInput;
  monotonicNow: () => number;
  now: () => Date;
  outputFingerprints: Map<CaseStageId, string>;
}): Promise<{stage: CaseStageId; record: CaseStageRecord; trace: TaskRunTrace}> {
  const {stage, definition} = input;
  const spec = taskSpec(stage);
  const dependencyFingerprints = fingerprintsFor(spec.dependencies, input.outputFingerprints);
  const taskInputFingerprint = fingerprintJson({
    caseId: input.input.caseId,
    taskId: spec.id,
    specVersion: spec.version,
    versions: input.input.versions,
    selectedInput: definition.selectInput?.(input.parsedInput) ?? input.parsedInput,
    dependencies: dependencyFingerprints,
  });
  const started = input.monotonicNow();
  const startedAt = input.now().toISOString();
  await input.input.onStage?.({stage, status: "started"});
  const cached = input.input.taskCache?.get(taskInputFingerprint);
  if (cached) {
    const parsedCached = definition.outputSchema.safeParse(cached.output);
    if (parsedCached.success && fingerprintJson(parsedCached.data) === cached.outputFingerprint) {
      const record: CaseStageRecord = {
        stage,
        status: "succeeded",
        output: parsedCached.data,
        outputFingerprint: cached.outputFingerprint,
        usage: {costUsd: 0, modelCalls: 0},
        durationMs: elapsed(started, input.monotonicNow()),
      };
      return {stage, record, trace: traceFor(spec, record, taskInputFingerprint, dependencyFingerprints, {
        terminationReason: "cache_hit",
        cacheHit: true,
        attemptCount: 0,
        toolsUsed: cached.toolsUsed,
        sourceIds: cached.sourceIds,
        discardedSourceIds: cached.discardedSourceIds,
        startedAt,
        completedAt: input.now().toISOString(),
      })};
    }
  }

  let record: CaseStageRecord;
  let executionTrace: StageExecution["trace"];
  let terminationReason: TaskRunTrace["terminationReason"] = "completed";
  try {
    const execution = await definition.execute({
      runId: input.input.runId,
      caseId: input.input.caseId,
      input: input.parsedInput,
      outputs: {...input.outputs},
      usage: {...input.priorUsage},
    });
    executionTrace = execution.trace;
    const output = definition.outputSchema.parse(execution.output);
    const stageUsage = stageUsageSchema.parse({costUsd: execution.usage?.costUsd ?? 0, modelCalls: execution.usage?.modelCalls ?? 0});
    const budgetCode = budgetViolation(stage, stageUsage, input.priorUsage, input.input.policy);
    if (budgetCode) {
      terminationReason = "budget_exceeded";
      record = {stage, status: "failed", failureKind: "budget", code: budgetCode, usage: stageUsage, durationMs: elapsed(started, input.monotonicNow())};
    } else {
      const outputFingerprint = fingerprintJson(output);
      record = {stage, status: "succeeded", output, outputFingerprint, usage: stageUsage, durationMs: elapsed(started, input.monotonicNow())};
      input.input.taskCache?.set(taskInputFingerprint, {
        output,
        outputFingerprint,
        toolsUsed: executionTrace?.toolsUsed ?? [],
        sourceIds: executionTrace?.sourceIds ?? [],
        discardedSourceIds: executionTrace?.discardedSourceIds ?? [],
      });
    }
  } catch (error) {
    if (error && typeof error === "object" && "subtasks" in error) {
      const parsedSubtasks = z.array(subtaskRunTraceSchema).safeParse(error.subtasks);
      if (parsedSubtasks.success) executionTrace = {...executionTrace, subtasks: parsedSubtasks.data};
    }
    const blocked = error instanceof CaseStageBlocked;
    terminationReason = blocked ? "blocked" : "failed";
    record = {
      stage,
      status: blocked ? "blocked" : "failed",
      failureKind: error instanceof z.ZodError ? "contract" : failureKindOf[stage],
      code: blocked ? error.code : error instanceof z.ZodError ? "invalid_stage_output" : errorCode(error),
      usage: {costUsd: 0, modelCalls: 0},
      durationMs: elapsed(started, input.monotonicNow()),
    };
  }
  return {stage, record, trace: traceFor(spec, record, taskInputFingerprint, dependencyFingerprints, {
    terminationReason,
    cacheHit: false,
    attemptCount: executionTrace?.attemptCount ?? 1,
    toolsUsed: executionTrace?.toolsUsed,
    sourceIds: executionTrace?.sourceIds,
    discardedSourceIds: executionTrace?.discardedSourceIds,
    subtasks: executionTrace?.subtasks,
    startedAt,
    completedAt: input.now().toISOString(),
  })};
}

function traceFor(
  spec: CaseTaskSpec,
  record: CaseStageRecord,
  inputFingerprint: string,
  dependencyFingerprints: Partial<Record<CaseStageId, string>>,
  detail: {
    terminationReason: TaskRunTrace["terminationReason"];
    cacheHit: boolean;
    attemptCount: number;
    toolsUsed?: string[] | undefined;
    sourceIds?: string[] | undefined;
    discardedSourceIds?: string[] | undefined;
    subtasks?: SubtaskRunTrace[] | undefined;
    startedAt: string;
    completedAt: string;
  },
): TaskRunTrace {
  return taskRunTraceSchema.parse({
    taskId: spec.id,
    specVersion: spec.version,
    workflow: spec.workflow,
    phase: spec.phase,
    executionClass: spec.executionClass,
    status: record.status,
    dependencies: [...spec.dependencies],
    dependencyFingerprints,
    inputFingerprint,
    ...(record.outputFingerprint ? {outputFingerprint: record.outputFingerprint} : {}),
    allowedTools: [...spec.allowedTools],
    toolsUsed: detail.toolsUsed ?? [],
    sourceIds: detail.sourceIds ?? [],
    discardedSourceIds: detail.discardedSourceIds ?? [],
    subtasks: detail.subtasks ?? [],
    attemptCount: detail.attemptCount,
    terminationReason: detail.terminationReason,
    cacheHit: detail.cacheHit,
    usage: record.usage,
    durationMs: record.durationMs,
    startedAt: detail.startedAt,
    completedAt: detail.completedAt,
  });
}

function taskSpec(stage: CaseStageId): CaseTaskSpec {
  const spec = taskSpecById.get(stage);
  if (!spec) throw Object.assign(new Error(`missing TaskSpec for ${stage}`), {code: "task_spec_missing"});
  return spec;
}

function fingerprintsFor(
  dependencies: readonly CaseStageId[],
  fingerprints: ReadonlyMap<CaseStageId, string>,
): Partial<Record<CaseStageId, string>> {
  return Object.fromEntries(dependencies.flatMap((dependency) => {
    const fingerprint = fingerprints.get(dependency);
    return fingerprint ? [[dependency, fingerprint]] : [];
  }));
}

function validateCaseGraph(): void {
  if (caseTaskSpecs.length !== caseStageIds.length || caseStageIds.some((stage) => !taskSpecById.has(stage))) {
    throw Object.assign(new Error("case task registry does not cover every stage"), {code: "task_registry_incomplete"});
  }
  const visiting = new Set<CaseStageId>();
  const visited = new Set<CaseStageId>();
  const visit = (stage: CaseStageId) => {
    if (visiting.has(stage)) throw Object.assign(new Error(`case task cycle at ${stage}`), {code: "task_dependency_cycle"});
    if (visited.has(stage)) return;
    visiting.add(stage);
    for (const dependency of taskSpec(stage).dependencies) visit(dependency);
    visiting.delete(stage);
    visited.add(stage);
  };
  for (const stage of caseStageIds) visit(stage);
}

async function publishStage(
  listener: RunCaseInput["onStage"],
  record: CaseStageRecord,
): Promise<void> {
  if (!listener) return;
  await listener({
    stage: record.stage,
    status: record.status,
    usage: record.usage,
    durationMs: record.durationMs,
    ...(record.failureKind ? {failureKind: record.failureKind} : {}),
    ...(record.code ? {code: record.code} : {}),
    ...(record.outputFingerprint ? {outputFingerprint: record.outputFingerprint} : {}),
  });
}

function budgetViolation(stage: CaseStageId, current: StageUsage, prior: StageUsage, policy: CaseRunPolicy): string | null {
  const stagePolicy = policy.stages?.[stage];
  if (stagePolicy?.costUsd !== undefined && current.costUsd > stagePolicy.costUsd) return "stage_cost_budget_exceeded";
  if (stagePolicy?.modelCalls !== undefined && current.modelCalls > stagePolicy.modelCalls) return "stage_call_budget_exceeded";
  if (prior.costUsd + current.costUsd > policy.maxCostUsd) return "case_cost_budget_exceeded";
  if (prior.modelCalls + current.modelCalls > policy.maxModelCalls) return "case_call_budget_exceeded";
  return null;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[a-z0-9_:-]+$/i.test(error.code)) {
    return error.code.slice(0, 100);
  }
  return "stage_execution_failed";
}

function elapsed(started: number, ended: number): number {
  return Math.max(0, Math.round(ended - started));
}
