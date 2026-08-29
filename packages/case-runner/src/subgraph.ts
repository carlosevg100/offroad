import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

import {
  stageUsageSchema,
  subtaskRunTraceSchema,
  taskExecutionClassSchema,
  type StageUsage,
  type SubtaskRunTrace,
} from "./runner";

export type SubtaskSpec<Id extends string> = {
  id: Id;
  version: string;
  dependencies: readonly Id[];
  executionClass: z.infer<typeof taskExecutionClassSchema>;
  allowedTools: readonly string[];
};

export type SubtaskContext<Id extends string, Input> = {
  input: Input;
  outputs: Readonly<Partial<Record<Id, unknown>>>;
  usage: Readonly<StageUsage>;
};

export type SubtaskExecution = {
  output: unknown;
  usage?: Partial<StageUsage>;
  toolsUsed?: string[];
  sourceIds?: string[];
  discardedSourceIds?: string[];
};

export type SubtaskDefinition<Id extends string, Input> = {
  spec: SubtaskSpec<Id>;
  outputSchema: z.ZodType;
  selectInput?: (input: Input, outputs: Readonly<Partial<Record<Id, unknown>>>) => unknown;
  execute: (context: SubtaskContext<Id, Input>) => Promise<SubtaskExecution> | SubtaskExecution;
};

export type RunSubgraphInput<Id extends string, Input> = {
  graphId: string;
  caseId: string;
  input: Input;
  tasks: readonly SubtaskDefinition<Id, Input>[];
  versions?: Record<string, string>;
  now?: () => Date;
  monotonicNow?: () => number;
};

export type SubgraphResult<Id extends string> = {
  outputs: Record<Id, unknown>;
  taskRuns: SubtaskRunTrace[];
  usage: StageUsage;
};

/**
 * Executes a bounded graph inside one product phase. The outer case graph decides when the phase
 * may run; this executor makes the phase itself inspectable instead of hiding it behind one
 * prompt or one monolithic function.
 */
export async function runSubgraph<Id extends string, Input>(input: RunSubgraphInput<Id, Input>): Promise<SubgraphResult<Id>> {
  const now = input.now ?? (() => new Date());
  const monotonicNow = input.monotonicNow ?? (() => Date.now());
  const byId = new Map(input.tasks.map((task) => [task.spec.id, task]));
  validateSubgraph(input.graphId, input.tasks, byId);
  const pending = new Set(input.tasks.map((task) => task.spec.id));
  const outputs: Partial<Record<Id, unknown>> = {};
  const fingerprints = new Map<Id, string>();
  const traces = new Map<Id, SubtaskRunTrace>();
  const usage: StageUsage = {costUsd: 0, modelCalls: 0};

  while (pending.size > 0) {
    const ready = [...pending].filter((taskId) => {
      const task = byId.get(taskId)!;
      return task.spec.dependencies.every((dependency) => fingerprints.has(dependency));
    });
    if (ready.length === 0) {
      throw Object.assign(new Error(`subgraph ${input.graphId} has no executable task`), {code: "subgraph_deadlock"});
    }

    const deterministic = ready.filter((taskId) => byId.get(taskId)!.spec.executionClass === "deterministic");
    const model = ready.filter((taskId) => byId.get(taskId)!.spec.executionClass === "model");
    const executable = [...deterministic, ...model.slice(0, 1)];
    const batchOutputs = {...outputs};
    const batchUsage = {...usage};
    let completed: Array<{taskId: Id; output: unknown; outputFingerprint: string; trace: SubtaskRunTrace}>;
    try {
      completed = await Promise.all(executable.map(async (taskId) => {
        const definition = byId.get(taskId)!;
        const dependencyFingerprints = Object.fromEntries(definition.spec.dependencies.map((dependency) => [dependency, fingerprints.get(dependency)!]));
        const selectedInput = definition.selectInput?.(input.input, batchOutputs) ?? input.input;
        const inputFingerprint = fingerprintJson({
          caseId: input.caseId,
          graphId: input.graphId,
          taskId,
          specVersion: definition.spec.version,
          versions: input.versions ?? {},
          selectedInput,
          dependencies: dependencyFingerprints,
        });
        const started = monotonicNow();
        const startedAt = now().toISOString();
        try {
          const execution = await definition.execute({input: input.input, outputs: batchOutputs, usage: batchUsage});
          const output = definition.outputSchema.parse(execution.output);
          const taskUsage = stageUsageSchema.parse({costUsd: execution.usage?.costUsd ?? 0, modelCalls: execution.usage?.modelCalls ?? 0});
          const outputFingerprint = fingerprintJson(output);
          const trace = subtaskRunTraceSchema.parse({
            graphId: input.graphId,
            taskId,
            specVersion: definition.spec.version,
            executionClass: definition.spec.executionClass,
            status: "succeeded",
            dependencies: [...definition.spec.dependencies],
            dependencyFingerprints,
            inputFingerprint,
            outputFingerprint,
            allowedTools: [...definition.spec.allowedTools],
            toolsUsed: execution.toolsUsed ?? [],
            sourceIds: execution.sourceIds ?? [],
            discardedSourceIds: execution.discardedSourceIds ?? [],
            usage: taskUsage,
            durationMs: elapsed(started, monotonicNow()),
            startedAt,
            completedAt: now().toISOString(),
          });
          return {taskId, output, outputFingerprint, trace};
        } catch (error) {
          const code = errorCode(error);
          const trace = subtaskRunTraceSchema.parse({
            graphId: input.graphId,
            taskId,
            specVersion: definition.spec.version,
            executionClass: definition.spec.executionClass,
            status: "failed",
            dependencies: [...definition.spec.dependencies],
            dependencyFingerprints,
            inputFingerprint,
            allowedTools: [...definition.spec.allowedTools],
            toolsUsed: [],
            sourceIds: [],
            discardedSourceIds: [],
            usage: {costUsd: 0, modelCalls: 0},
            durationMs: elapsed(started, monotonicNow()),
            startedAt,
            completedAt: now().toISOString(),
            code,
          });
          throw Object.assign(new Error(`subtask ${taskId} failed`), {code: `subtask_${taskId.toLowerCase()}_${code}`, trace});
        }
      }));
    } catch (error) {
      const failedTrace = error && typeof error === "object" && "trace" in error
        ? subtaskRunTraceSchema.safeParse(error.trace)
        : null;
      throw Object.assign(error instanceof Error ? error : new Error("subgraph task failed"), {
        subtasks: [
          ...input.tasks.flatMap((task) => {
            const trace = traces.get(task.spec.id);
            return trace ? [trace] : [];
          }),
          ...(failedTrace?.success ? [failedTrace.data] : []),
        ],
      });
    }

    for (const result of completed) {
      outputs[result.taskId] = result.output;
      fingerprints.set(result.taskId, result.outputFingerprint);
      traces.set(result.taskId, result.trace);
      usage.costUsd += result.trace.usage.costUsd;
      usage.modelCalls += result.trace.usage.modelCalls;
      pending.delete(result.taskId);
    }
  }

  return {
    outputs: outputs as Record<Id, unknown>,
    taskRuns: input.tasks.map((task) => traces.get(task.spec.id)!),
    usage,
  };
}

function validateSubgraph<Id extends string, Input>(
  graphId: string,
  tasks: readonly SubtaskDefinition<Id, Input>[],
  byId: ReadonlyMap<Id, SubtaskDefinition<Id, Input>>,
): void {
  if (tasks.length === 0) throw Object.assign(new Error(`subgraph ${graphId} has no tasks`), {code: "subgraph_empty"});
  if (byId.size !== tasks.length) throw Object.assign(new Error(`subgraph ${graphId} has duplicate task ids`), {code: "subgraph_duplicate_task"});
  for (const task of tasks) {
    for (const dependency of task.spec.dependencies) {
      if (!byId.has(dependency)) throw Object.assign(new Error(`${task.spec.id} depends on unknown task ${dependency}`), {code: "subgraph_unknown_dependency"});
    }
  }
  const visiting = new Set<Id>();
  const visited = new Set<Id>();
  const visit = (taskId: Id) => {
    if (visiting.has(taskId)) throw Object.assign(new Error(`subgraph ${graphId} cycle at ${taskId}`), {code: "subgraph_dependency_cycle"});
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of byId.get(taskId)!.spec.dependencies) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.spec.id);
}

function errorCode(error: unknown): string {
  if (error instanceof z.ZodError) return "invalid_output";
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[a-z0-9_:-]+$/i.test(error.code)) {
    return error.code.slice(0, 100);
  }
  return "execution_failed";
}

function elapsed(started: number, ended: number): number {
  return Math.max(0, Math.round(ended - started));
}
