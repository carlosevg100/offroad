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
  schemaVersion: z.literal("2026.08.26-v3"),
  runId: z.string().min(1),
  caseId: z.string().min(1),
  status: z.enum(["succeeded", "blocked", "failed"]),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  stages: z.array(caseStageRecordSchema).length(caseStageIds.length),
  usage: stageUsageSchema,
  versions: z.record(z.string(), z.string().min(1)),
  reportFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((report, context) => {
  if (report.stages.some((record, index) => record.stage !== caseStageIds[index])) {
    context.addIssue({code: "custom", path: ["stages"], message: "stages must preserve the governed order"});
  }
  const firstStop = report.stages.findIndex((stage) => stage.status === "failed" || stage.status === "blocked");
  if (firstStop >= 0 && report.stages.slice(firstStop + 1).some((stage) => stage.status !== "skipped")) {
    context.addIssue({code: "custom", path: ["stages"], message: "nothing may execute after a blocking stage"});
  }
});
export type CaseRunReport = z.infer<typeof caseRunReportSchema>;

export type StageExecution = {
  output: unknown;
  usage?: Partial<StageUsage>;
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
};

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
  const records: CaseStageRecord[] = [];
  const outputs: Partial<Record<CaseStageId, unknown>> = {};
  const usage: StageUsage = {costUsd: 0, modelCalls: 0};
  let stopped = false;

  for (const stage of caseStageIds) {
    if (stopped) {
      const record: CaseStageRecord = {
        stage,
        status: "skipped",
        usage: {costUsd: 0, modelCalls: 0},
        durationMs: 0,
      };
      records.push(record);
      await publishStage(input.onStage, record);
      continue;
    }

    const definition = input.stages[stage];
    const started = monotonicNow();
    await input.onStage?.({stage, status: "started"});
    let record: CaseStageRecord;
    try {
      const execution = await definition.execute({
        runId: input.runId,
        caseId: input.caseId,
        input: parsedInput,
        outputs: {...outputs},
        usage: {...usage},
      });
      const output = definition.outputSchema.parse(execution.output);
      const stageUsage = stageUsageSchema.parse({
        costUsd: execution.usage?.costUsd ?? 0,
        modelCalls: execution.usage?.modelCalls ?? 0,
      });
      const budgetCode = budgetViolation(stage, stageUsage, usage, input.policy);
      if (budgetCode) {
        record = {
          stage,
          status: "failed",
          failureKind: "budget",
          code: budgetCode,
          usage: stageUsage,
          durationMs: elapsed(started, monotonicNow()),
        };
        usage.costUsd += stageUsage.costUsd;
        usage.modelCalls += stageUsage.modelCalls;
      } else {
        outputs[stage] = output;
        usage.costUsd += stageUsage.costUsd;
        usage.modelCalls += stageUsage.modelCalls;
        record = {
          stage,
          status: "succeeded",
          output,
          outputFingerprint: fingerprintJson(output),
          usage: stageUsage,
          durationMs: elapsed(started, monotonicNow()),
        };
      }
    } catch (error) {
      const blocked = error instanceof CaseStageBlocked;
      record = {
        stage,
        status: blocked ? "blocked" : "failed",
        failureKind: error instanceof z.ZodError ? "contract" : failureKindOf[stage],
        code: blocked ? error.code : error instanceof z.ZodError ? "invalid_stage_output" : errorCode(error),
        usage: {costUsd: 0, modelCalls: 0},
        durationMs: elapsed(started, monotonicNow()),
      };
    }
    records.push(record);
    await publishStage(input.onStage, record);
    stopped = record.status === "failed" || record.status === "blocked";
  }

  const completedAt = now().toISOString();
  const status = records.some((stage) => stage.status === "failed")
    ? "failed" as const
    : records.some((stage) => stage.status === "blocked")
      ? "blocked" as const
      : "succeeded" as const;
  const payload = {
    schemaVersion: "2026.08.26-v3" as const,
    runId: input.runId,
    caseId: input.caseId,
    status,
    startedAt,
    completedAt,
    inputFingerprint,
    stages: records,
    usage,
    versions: input.versions,
  };
  return caseRunReportSchema.parse({...payload, reportFingerprint: fingerprintJson(payload)});
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
