import {createHash, createHmac, timingSafeEqual} from "node:crypto";

import {
  candidateExecutorRegistrationSchema,
  computeUniversalDispatchCandidateFingerprint,
  fingerprintCandidateExecutorRegistry,
  universalDispatchCandidateSchema,
  type CandidateExecutorRegistration,
  type UniversalDispatchCandidate,
} from "@offroad/dcm-specialization";
import {
  verifyAuthorizedContextResolution,
  type AuthorizedContextResolution,
  type ContextIssuerTrust,
} from "@offroad/governed-retrieval";
import {
  receivablesPoolUnderwritingInputSchema,
  receivablesPoolUnderwritingSchema,
  underwriteReceivablesPool,
} from "@offroad/receivables-analysis";
import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const isoInstantSchema = z.iso.datetime({offset: true});
const taskIdSchema = z.string().regex(/^[A-Z][0-9]{2}$/);

const internalDispatchAuthorizationPayloadSchema = z.object({
  schemaVersion: z.literal("internal-universal-dispatch-authorization.v2"),
  purpose: z.literal("internal_validation_fixture"),
  keyId: z.string().min(1),
  candidateFingerprint: sha256Schema,
  capabilityManifestHash: sha256Schema,
  executionContextHash: sha256Schema,
  contextResolutionFingerprint: sha256Schema,
  contextResolutionValidUntil: isoInstantSchema,
  contextControlRevision: z.number().int().positive(),
  executorRegistryHash: sha256Schema,
  authorizedTaskIds: z.array(taskIdSchema).min(1),
  issuedAt: isoInstantSchema,
  expiresAt: isoInstantSchema,
  externalEffectAllowed: z.literal(false),
}).strict().superRefine((authorization, context) => {
  if (Date.parse(authorization.expiresAt) <= Date.parse(authorization.issuedAt)) {
    context.addIssue({code: "custom", path: ["expiresAt"], message: "expiresAt must be after issuedAt"});
  }
});

export const internalDispatchAuthorizationSchema = internalDispatchAuthorizationPayloadSchema.extend({
  signature: sha256Schema,
}).strict();
export type InternalDispatchAuthorization = z.infer<typeof internalDispatchAuthorizationSchema>;

const taskReceiptErrorSchema = z.object({
  code: z.enum(["cancelled", "timeout", "execution_failed", "output_invalid", "graph_halted"]),
  detail: z.string().min(1).nullable(),
}).strict();

export const internalDispatchTaskReceiptSchema = z.object({
  schemaVersion: z.literal("internal-dispatch-task-receipt.v2"),
  mode: z.literal("internal_validation_fixture"),
  status: z.enum(["succeeded", "failed", "skipped"]),
  candidateFingerprint: sha256Schema,
  contextResolutionFingerprint: sha256Schema,
  taskId: taskIdSchema,
  taskExecutionFingerprint: sha256Schema,
  inputFingerprint: sha256Schema,
  executorKey: z.string().min(1),
  executorVersion: z.string().min(1),
  procedure: z.object({id: z.string().min(1), version: z.string().min(1)}).strict(),
  resultContract: z.string().min(1),
  resultFingerprint: sha256Schema.nullable(),
  error: taskReceiptErrorSchema.nullable(),
  startedAt: isoInstantSchema,
  completedAt: isoInstantSchema,
  externalEffectAllowed: z.literal(false),
  fingerprint: sha256Schema,
}).strict();
export type InternalDispatchTaskReceipt = z.infer<typeof internalDispatchTaskReceiptSchema>;

export const internalDispatchGraphReceiptSchema = z.object({
  schemaVersion: z.literal("internal-dispatch-graph-receipt.v2"),
  mode: z.literal("internal_validation_fixture"),
  status: z.enum(["succeeded", "failed"]),
  candidateFingerprint: sha256Schema,
  contextResolutionFingerprint: sha256Schema,
  graphExecutionFingerprint: sha256Schema,
  taskReceipts: z.array(internalDispatchTaskReceiptSchema).min(1),
  startedAt: isoInstantSchema,
  completedAt: isoInstantSchema,
  externalEffectAllowed: z.literal(false),
  fingerprint: sha256Schema,
}).strict();
export type InternalDispatchGraphReceipt = z.infer<typeof internalDispatchGraphReceiptSchema>;

export type InternalBundledExecutor = CandidateExecutorRegistration & {
  maximumEffect: "none";
  inputSchema: z.ZodType;
  resultSchema: z.ZodType;
  execute: (input: unknown, context: {signal: AbortSignal}) => unknown | Promise<unknown>;
};

function executorRegistration(executor: InternalBundledExecutor): CandidateExecutorRegistration {
  return candidateExecutorRegistrationSchema.parse({
    taskId: executor.taskId,
    executorKey: executor.executorKey,
    executorVersion: executor.executorVersion,
    procedure: executor.procedure,
    resultContract: executor.resultContract,
  });
}

/**
 * The only executor bundled for this internal fixture runtime. Its capability remains shadow;
 * registry presence is not a production authorization and this module is not wired to a queue.
 */
export const bundledInternalDispatchExecutorRegistry: readonly InternalBundledExecutor[] = Object.freeze([{
  taskId: "R01",
  executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
  executorVersion: "2026.09.06-v1",
  procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
  resultContract: "method.underwrite-receivables-pool.v1",
  maximumEffect: "none",
  inputSchema: receivablesPoolUnderwritingInputSchema,
  resultSchema: receivablesPoolUnderwritingSchema,
  execute: (input) => underwriteReceivablesPool(receivablesPoolUnderwritingInputSchema.parse(input)),
}]);

export class InternalDispatchRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "InternalDispatchRefusal";
  }
}

export function issueInternalFixtureAuthorization(input: {
  candidate: UniversalDispatchCandidate;
  contextResolution: AuthorizedContextResolution;
  keyId: string;
  secret: string;
  issuedAt: string;
  expiresAt: string;
  contextResolutionTrust: readonly ContextIssuerTrust[];
}): InternalDispatchAuthorization {
  const candidate = universalDispatchCandidateSchema.parse(input.candidate);
  const issuedAt = new Date(input.issuedAt);
  const contextResolution = verifyDispatchContext(candidate, input.contextResolution, input.contextResolutionTrust, issuedAt);
  if (Date.parse(input.issuedAt) < Date.parse(contextResolution.resolvedAt)
    || Date.parse(input.expiresAt) > Date.parse(contextResolution.validUntil)) {
    throw new InternalDispatchRefusal("dispatch_authorization_exceeds_context_resolution");
  }
  const payload = internalDispatchAuthorizationPayloadSchema.parse({
    schemaVersion: "internal-universal-dispatch-authorization.v2",
    purpose: "internal_validation_fixture",
    keyId: input.keyId,
    candidateFingerprint: candidate.fingerprint,
    capabilityManifestHash: candidate.capabilityManifestHash,
    executionContextHash: candidate.executionContextHash,
    contextResolutionFingerprint: contextResolution.fingerprint,
    contextResolutionValidUntil: contextResolution.validUntil,
    contextControlRevision: contextResolution.controlRevision,
    executorRegistryHash: candidate.executorRegistryHash,
    authorizedTaskIds: candidate.tasks.map((task) => task.taskId),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    externalEffectAllowed: false,
  });
  return internalDispatchAuthorizationSchema.parse({
    ...payload,
    signature: sign(payload, input.secret),
  });
}

export function createInternalUniversalDispatchRuntime(options: {
  registry: readonly InternalBundledExecutor[];
  authorizationKeys: Readonly<Record<string, string>>;
  contextResolutionTrust: readonly ContextIssuerTrust[];
  now?: () => Date;
}) {
  const registry = [...options.registry];
  const sourceNow = options.now ?? (() => new Date());
  let lastTrustedNowMs = Number.NEGATIVE_INFINITY;
  const now = (): Date => {
    const value = sourceNow();
    const valueMs = value instanceof Date ? value.getTime() : Number.NaN;
    if (!Number.isFinite(valueMs)) throw new InternalDispatchRefusal("dispatch_clock_invalid");
    if (valueMs < lastTrustedNowMs) throw new InternalDispatchRefusal("dispatch_clock_rewind");
    lastTrustedNowMs = valueMs;
    return new Date(valueMs);
  };
  const graphRuns = new Map<string, Promise<StoredGraphRun>>();

  return {
    async execute(input: {
      candidate: unknown;
      contextResolution: unknown;
      authorization: unknown;
      inputsByTaskId: Readonly<Record<string, unknown>>;
      timeoutMs: number;
      signal?: AbortSignal;
    }): Promise<{receipt: InternalDispatchGraphReceipt; outputsByTaskId: Readonly<Record<string, unknown>>; replayed: boolean}> {
      const prepared = prepareExecution({...input, registry, authorizationKeys: options.authorizationKeys, contextResolutionTrust: options.contextResolutionTrust, now});
      const existing = graphRuns.get(prepared.graphExecutionFingerprint);
      if (existing) {
        const replay = await existing;
        revalidatePreparedContext(prepared, now());
        return {...replay, replayed: true};
      }
      const run = executePreparedGraph(prepared, now, input.signal);
      graphRuns.set(prepared.graphExecutionFingerprint, run);
      try {
        const completed = await run;
        if (completed.receipt.status !== "succeeded"
          && graphRuns.get(prepared.graphExecutionFingerprint) === run) {
          graphRuns.delete(prepared.graphExecutionFingerprint);
        }
        return {...completed, replayed: false};
      } catch (error) {
        if (graphRuns.get(prepared.graphExecutionFingerprint) === run) {
          graphRuns.delete(prepared.graphExecutionFingerprint);
        }
        throw error;
      }
    },
  };
}

type PreparedTask = {
  candidateTask: UniversalDispatchCandidate["tasks"][number];
  executor: InternalBundledExecutor;
  parsedInput: unknown;
  inputFingerprint: string;
  taskExecutionFingerprint: string;
};

type PreparedExecution = {
  candidate: UniversalDispatchCandidate;
  contextResolution: AuthorizedContextResolution;
  contextResolutionTrust: readonly ContextIssuerTrust[];
  authorization: InternalDispatchAuthorization;
  authorizationKeys: Readonly<Record<string, string>>;
  contextResolutionFingerprint: string;
  tasksById: Map<string, PreparedTask>;
  timeoutMs: number;
  graphExecutionFingerprint: string;
};

type StoredGraphRun = {
  receipt: InternalDispatchGraphReceipt;
  outputsByTaskId: Readonly<Record<string, unknown>>;
};

function prepareExecution(input: {
  candidate: unknown;
  contextResolution: unknown;
  authorization: unknown;
  inputsByTaskId: Readonly<Record<string, unknown>>;
  timeoutMs: number;
  registry: readonly InternalBundledExecutor[];
  authorizationKeys: Readonly<Record<string, string>>;
  contextResolutionTrust: readonly ContextIssuerTrust[];
  now: () => Date;
}): PreparedExecution {
  const candidate = universalDispatchCandidateSchema.parse(input.candidate);
  if (candidate.status !== "candidate") throw new InternalDispatchRefusal("dispatch_candidate_blocked");
  if (computeUniversalDispatchCandidateFingerprint(candidate) !== candidate.fingerprint) {
    throw new InternalDispatchRefusal("dispatch_candidate_fingerprint_mismatch");
  }
  const preparedAt = input.now();
  const contextResolution = verifyDispatchContext(candidate, input.contextResolution, input.contextResolutionTrust, preparedAt);
  const authorization = verifyAuthorization(candidate, contextResolution, input.authorization, input.authorizationKeys, preparedAt);
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 60_000) {
    throw new InternalDispatchRefusal("dispatch_timeout_invalid");
  }

  const expectedTaskIds = candidate.tasks.map((task) => task.taskId).sort();
  const inputTaskIds = Object.keys(input.inputsByTaskId).sort();
  if (stableJson(expectedTaskIds) !== stableJson(inputTaskIds)) {
    throw new InternalDispatchRefusal("dispatch_input_partition_mismatch");
  }
  if (stableJson([...authorization.authorizedTaskIds].sort()) !== stableJson(expectedTaskIds)) {
    throw new InternalDispatchRefusal("dispatch_authorization_task_mismatch");
  }
  const batchedTaskIds = candidate.parallelBatches.flat();
  if (new Set(batchedTaskIds).size !== batchedTaskIds.length
    || stableJson([...batchedTaskIds].sort()) !== stableJson(expectedTaskIds)) {
    throw new InternalDispatchRefusal("dispatch_graph_partition_mismatch");
  }

  const grouped = groupExecutors(input.registry);
  const preparedTasks: PreparedTask[] = [];
  for (const candidateTask of candidate.tasks) {
    const matches = grouped.get(candidateTask.taskId) ?? [];
    if (matches.length === 0) throw new InternalDispatchRefusal(`dispatch_executor_absent:${candidateTask.taskId}`);
    if (matches.length > 1) throw new InternalDispatchRefusal(`dispatch_executor_duplicate:${candidateTask.taskId}`);
    const executor = matches[0]!;
    if (executor.maximumEffect !== "none") throw new InternalDispatchRefusal(`dispatch_executor_effect_denied:${candidateTask.taskId}`);
    const identity = executorRegistration(executor);
    if (stableJson(identity) !== stableJson(candidateTask)) {
      throw new InternalDispatchRefusal(`dispatch_executor_identity_mismatch:${candidateTask.taskId}`);
    }
    const parsed = executor.inputSchema.safeParse(input.inputsByTaskId[candidateTask.taskId]);
    if (!parsed.success) throw new InternalDispatchRefusal(`dispatch_input_invalid:${candidateTask.taskId}`);
    const inputFingerprint = fingerprint(parsed.data);
    const taskExecutionFingerprint = fingerprint({
      candidateFingerprint: candidate.fingerprint,
      contextResolutionFingerprint: contextResolution.fingerprint,
      taskId: candidateTask.taskId,
      inputFingerprint,
      executor: identity,
    });
    preparedTasks.push({candidateTask, executor, parsedInput: parsed.data, inputFingerprint, taskExecutionFingerprint});
  }
  if (fingerprintCandidateExecutorRegistry(input.registry.map(executorRegistration))
    !== candidate.executorRegistryHash) {
    throw new InternalDispatchRefusal("dispatch_executor_registry_hash_mismatch");
  }
  const graphExecutionFingerprint = fingerprint({
    candidateFingerprint: candidate.fingerprint,
    contextResolutionFingerprint: contextResolution.fingerprint,
    tasks: preparedTasks.map((task) => ({taskId: task.candidateTask.taskId, fingerprint: task.taskExecutionFingerprint})),
  });
  return {candidate, contextResolution, contextResolutionTrust: input.contextResolutionTrust, authorization, authorizationKeys: input.authorizationKeys, contextResolutionFingerprint: contextResolution.fingerprint, tasksById: new Map(preparedTasks.map((task) => [task.candidateTask.taskId, task])), timeoutMs: input.timeoutMs, graphExecutionFingerprint};
}

function verifyDispatchContext(
  candidate: UniversalDispatchCandidate,
  raw: unknown,
  trust: readonly ContextIssuerTrust[],
  now: Date,
): AuthorizedContextResolution {
  let resolution: AuthorizedContextResolution;
  try {
    resolution = verifyAuthorizedContextResolution(raw, trust, now);
  } catch (error) {
    if (error instanceof Error && error.message === "context_resolution_expired") {
      throw new InternalDispatchRefusal("dispatch_context_resolution_expired");
    }
    throw new InternalDispatchRefusal("dispatch_context_resolution_invalid");
  }
  if (resolution.status === "blocked" || resolution.status === "needs_context") {
    throw new InternalDispatchRefusal(`dispatch_context_${resolution.status}`);
  }
  if (resolution.executionContextHash !== candidate.executionContextHash) {
    throw new InternalDispatchRefusal("dispatch_context_execution_identity_mismatch");
  }
  if (resolution.externalEffectAllowed !== false) {
    throw new InternalDispatchRefusal("dispatch_context_effect_denied");
  }
  return resolution;
}

function verifyAuthorization(
  candidate: UniversalDispatchCandidate,
  contextResolution: AuthorizedContextResolution,
  raw: unknown,
  keys: Readonly<Record<string, string>>,
  now: Date,
): InternalDispatchAuthorization {
  const authorization = internalDispatchAuthorizationSchema.parse(raw);
  const secret = keys[authorization.keyId];
  if (!secret) throw new InternalDispatchRefusal("dispatch_authorization_key_unknown");
  const {signature, ...payload} = authorization;
  const expected = sign(payload, secret);
  if (!safeSignatureEqual(signature, expected)) throw new InternalDispatchRefusal("dispatch_authorization_signature_invalid");
  if (Date.parse(authorization.issuedAt) > now.getTime() || Date.parse(authorization.expiresAt) <= now.getTime()) {
    throw new InternalDispatchRefusal("dispatch_authorization_expired");
  }
  if (Date.parse(authorization.issuedAt) < Date.parse(contextResolution.resolvedAt)
    || Date.parse(authorization.expiresAt) > Date.parse(contextResolution.validUntil)) {
    throw new InternalDispatchRefusal("dispatch_authorization_exceeds_context_resolution");
  }
  if (authorization.candidateFingerprint !== candidate.fingerprint
    || authorization.capabilityManifestHash !== candidate.capabilityManifestHash
    || authorization.executionContextHash !== candidate.executionContextHash
    || authorization.contextResolutionFingerprint !== contextResolution.fingerprint
    || authorization.contextResolutionValidUntil !== contextResolution.validUntil
    || authorization.contextControlRevision !== contextResolution.controlRevision
    || authorization.executorRegistryHash !== candidate.executorRegistryHash) {
    throw new InternalDispatchRefusal("dispatch_authorization_identity_mismatch");
  }
  return authorization;
}

async function executePreparedGraph(
  prepared: PreparedExecution,
  now: () => Date,
  parentSignal?: AbortSignal,
): Promise<StoredGraphRun> {
  const graphStartedAt = now();
  revalidatePreparedContext(prepared, graphStartedAt);
  const startedAt = graphStartedAt.toISOString();
  const receipts = new Map<string, InternalDispatchTaskReceipt>();
  const outputs: Record<string, unknown> = {};
  let halted = false;
  for (const batch of prepared.candidate.parallelBatches) {
    if (halted) break;
    revalidatePreparedContext(prepared, now());
    const results = await Promise.all(batch.map((taskId) => executePreparedTask(
      prepared.candidate.fingerprint,
      prepared.contextResolutionFingerprint,
      prepared.tasksById.get(taskId)!,
      prepared.timeoutMs,
      now,
      parentSignal,
      prepared.contextResolution,
      prepared.contextResolutionTrust,
      prepared.candidate,
      prepared.authorization,
      prepared.authorizationKeys,
    )));
    for (const result of results) {
      receipts.set(result.receipt.taskId, result.receipt);
      if (result.output !== undefined) outputs[result.receipt.taskId] = result.output;
      if (result.receipt.status === "failed") halted = true;
    }
  }
  for (const candidateTask of prepared.candidate.tasks) {
    if (receipts.has(candidateTask.taskId)) continue;
    const task = prepared.tasksById.get(candidateTask.taskId)!;
    const skippedAt = now().toISOString();
    receipts.set(candidateTask.taskId, taskReceipt({
      candidateFingerprint: prepared.candidate.fingerprint,
      contextResolutionFingerprint: prepared.contextResolutionFingerprint,
      task,
      status: "skipped",
      resultFingerprint: null,
      error: {code: "graph_halted", detail: "a prior batch failed"},
      startedAt: skippedAt,
      completedAt: skippedAt,
    }));
  }
  const graphCompletedAt = now();
  revalidatePreparedContext(prepared, graphCompletedAt);
  const orderedReceipts = prepared.candidate.tasks.map((task) => receipts.get(task.taskId)!);
  const payload = {
    schemaVersion: "internal-dispatch-graph-receipt.v2" as const,
    mode: "internal_validation_fixture" as const,
    status: orderedReceipts.every((receipt) => receipt.status === "succeeded") ? "succeeded" as const : "failed" as const,
    candidateFingerprint: prepared.candidate.fingerprint,
    contextResolutionFingerprint: prepared.contextResolutionFingerprint,
    graphExecutionFingerprint: prepared.graphExecutionFingerprint,
    taskReceipts: orderedReceipts,
    startedAt,
    completedAt: graphCompletedAt.toISOString(),
    externalEffectAllowed: false as const,
  };
  return {
    receipt: internalDispatchGraphReceiptSchema.parse({...payload, fingerprint: fingerprint(payload)}),
    outputsByTaskId: Object.freeze({...outputs}),
  };
}

async function executePreparedTask(
  candidateFingerprint: string,
  contextResolutionFingerprint: string,
  task: PreparedTask,
  timeoutMs: number,
  now: () => Date,
  parentSignal?: AbortSignal,
  contextResolution?: AuthorizedContextResolution,
  contextResolutionTrust?: readonly ContextIssuerTrust[],
  candidate?: UniversalDispatchCandidate,
  authorization?: InternalDispatchAuthorization,
  authorizationKeys?: Readonly<Record<string, string>>,
): Promise<{receipt: InternalDispatchTaskReceipt; output?: unknown}> {
  const taskStartedAt = now();
  const startedAt = taskStartedAt.toISOString();
  if (contextResolution && contextResolutionTrust) {
    try {
      verifyAuthorizedContextResolution(contextResolution, contextResolutionTrust, taskStartedAt);
    } catch {
      throw new InternalDispatchRefusal("dispatch_context_resolution_expired_before_executor");
    }
  }
  let raw: unknown;
  let executionError: unknown;
  try {
    raw = await withDeadline(task.executor, task.parsedInput, timeoutMs, parentSignal);
  } catch (error) {
    executionError = error;
  }
  // Result bytes remain untrusted and unpublished until both authorities are checked after the
  // await boundary. An expiry here rejects the graph promise: no output, cache entry or receipt is
  // emitted for the stale result.
  const authorityCheckedAt = now();
  if (contextResolution && contextResolutionTrust && candidate && authorization && authorizationKeys) {
    try {
      verifyAuthorizedContextResolution(contextResolution, contextResolutionTrust, authorityCheckedAt);
      verifyAuthorization(candidate, contextResolution, authorization, authorizationKeys, authorityCheckedAt);
    } catch {
      throw new InternalDispatchRefusal("dispatch_authority_expired_after_executor");
    }
  }
  if (executionError !== undefined) {
    const failure = executionError instanceof TaskExecutionFailure
      ? executionError
      : new TaskExecutionFailure("execution_failed", executionError instanceof Error ? executionError.name : "non-error rejection");
    return {receipt: taskReceipt({
      candidateFingerprint, contextResolutionFingerprint, task, status: "failed", resultFingerprint: null,
      error: {code: failure.code, detail: failure.detail}, startedAt, completedAt: authorityCheckedAt.toISOString(),
    })};
  }
  const parsed = task.executor.resultSchema.safeParse(raw);
  if (!parsed.success) {
    const failure = new TaskExecutionFailure("output_invalid", "executor result violated the exact result schema");
    return {receipt: taskReceipt({
      candidateFingerprint, contextResolutionFingerprint, task, status: "failed", resultFingerprint: null,
      error: {code: failure.code, detail: failure.detail}, startedAt, completedAt: authorityCheckedAt.toISOString(),
    })};
  }
  const resultFingerprint = fingerprint(parsed.data);
  return {
    receipt: taskReceipt({
      candidateFingerprint, contextResolutionFingerprint, task, status: "succeeded", resultFingerprint, error: null,
      startedAt, completedAt: authorityCheckedAt.toISOString(),
    }),
    output: parsed.data,
  };
}

function revalidatePreparedContext(prepared: PreparedExecution, at: Date): void {
  try {
    verifyAuthorizedContextResolution(prepared.contextResolution, prepared.contextResolutionTrust, at);
    verifyAuthorization(prepared.candidate, prepared.contextResolution, prepared.authorization, prepared.authorizationKeys, at);
  } catch {
    throw new InternalDispatchRefusal("dispatch_context_resolution_expired_before_read");
  }
}

function taskReceipt(input: {
  candidateFingerprint: string;
  contextResolutionFingerprint: string;
  task: PreparedTask;
  status: "succeeded" | "failed" | "skipped";
  resultFingerprint: string | null;
  error: z.infer<typeof taskReceiptErrorSchema> | null;
  startedAt: string;
  completedAt: string;
}): InternalDispatchTaskReceipt {
  const payload = {
    schemaVersion: "internal-dispatch-task-receipt.v2" as const,
    mode: "internal_validation_fixture" as const,
    status: input.status,
    candidateFingerprint: input.candidateFingerprint,
    contextResolutionFingerprint: input.contextResolutionFingerprint,
    taskId: input.task.candidateTask.taskId,
    taskExecutionFingerprint: input.task.taskExecutionFingerprint,
    inputFingerprint: input.task.inputFingerprint,
    executorKey: input.task.candidateTask.executorKey,
    executorVersion: input.task.candidateTask.executorVersion,
    procedure: input.task.candidateTask.procedure,
    resultContract: input.task.candidateTask.resultContract,
    resultFingerprint: input.resultFingerprint,
    error: input.error,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    externalEffectAllowed: false as const,
  };
  return internalDispatchTaskReceiptSchema.parse({...payload, fingerprint: fingerprint(payload)});
}

async function withDeadline(
  executor: InternalBundledExecutor,
  input: unknown,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<unknown> {
  if (parentSignal?.aborted) {
    throw new TaskExecutionFailure("cancelled", "execution signal was aborted");
  }
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let removeParentListener = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort("timeout");
      reject(new TaskExecutionFailure("timeout", `task exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    if (parentSignal) {
      const cancel = () => {
        controller.abort("cancelled");
        reject(new TaskExecutionFailure("cancelled", "execution signal was aborted"));
      };
      if (parentSignal.aborted) cancel();
      else {
        parentSignal.addEventListener("abort", cancel, {once: true});
        removeParentListener = () => parentSignal.removeEventListener("abort", cancel);
      }
    }
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => executor.execute(input, {signal: controller.signal})),
      deadline,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    removeParentListener();
  }
}

class TaskExecutionFailure extends Error {
  constructor(readonly code: "cancelled" | "timeout" | "execution_failed" | "output_invalid", readonly detail: string) {
    super(code);
  }
}

function groupExecutors(registry: readonly InternalBundledExecutor[]): Map<string, InternalBundledExecutor[]> {
  const grouped = new Map<string, InternalBundledExecutor[]>();
  for (const executor of registry) grouped.set(executor.taskId, [...(grouped.get(executor.taskId) ?? []), executor]);
  return grouped;
}

function sign(payload: z.infer<typeof internalDispatchAuthorizationPayloadSchema>, secret: string): string {
  return createHmac("sha256", secret).update(stableJson(payload)).digest("hex");
}

function safeSignatureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
