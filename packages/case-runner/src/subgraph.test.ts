import {describe, expect, it} from "vitest";
import {z} from "zod";

import {runSubgraph, type SubtaskDefinition} from "./subgraph";

type TaskId = "root" | "left" | "right" | "join";
type Input = {amount: string};
const outputSchema = z.object({value: z.string()});

function tasks(started: TaskId[] = []): SubtaskDefinition<TaskId, Input>[] {
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const task = (id: TaskId, dependencies: TaskId[], execute: SubtaskDefinition<TaskId, Input>["execute"]): SubtaskDefinition<TaskId, Input> => ({
    spec: {id, version: "1", dependencies, executionClass: "deterministic", allowedTools: [id]},
    outputSchema,
    selectInput: (input) => input,
    execute,
  });
  return [
    task("root", [], ({input}) => ({output: {value: input.amount}, toolsUsed: ["root"]})),
    task("left", ["root"], async () => {
      started.push("left");
      if (started.length === 2) release?.();
      await hold;
      return {output: {value: "left"}, toolsUsed: ["left"]};
    }),
    task("right", ["root"], async () => {
      started.push("right");
      if (started.length === 2) release?.();
      await hold;
      return {output: {value: "right"}, toolsUsed: ["right"]};
    }),
    task("join", ["left", "right"], ({outputs}) => ({
      output: {value: `${(outputs.left as {value: string}).value}:${(outputs.right as {value: string}).value}`},
      toolsUsed: ["join"],
    })),
  ];
}

describe("bounded subgraph executor", () => {
  it("executes independent deterministic tasks in parallel and records governed traces", async () => {
    const started: TaskId[] = [];
    const result = await runSubgraph({graphId: "test", caseId: "case-1", input: {amount: "10"}, tasks: tasks(started)});
    expect(started).toEqual(["left", "right"]);
    expect(result.outputs.join).toEqual({value: "left:right"});
    expect(result.taskRuns.map((trace) => trace.taskId)).toEqual(["root", "left", "right", "join"]);
    expect(result.taskRuns.every((trace) => trace.status === "succeeded" && trace.outputFingerprint?.length === 64)).toBe(true);
    expect(result.taskRuns.find((trace) => trace.taskId === "join")?.dependencies).toEqual(["left", "right"]);
    expect(result.usage).toEqual({costUsd: 0, modelCalls: 0});
  });

  it("rejects an ungoverned tool at the exact subtask", async () => {
    const broken = tasks();
    broken[0] = {...broken[0]!, execute: () => ({output: {value: "10"}, toolsUsed: ["outside"]})};
    await expect(runSubgraph({graphId: "test", caseId: "case-1", input: {amount: "10"}, tasks: broken}))
      .rejects.toMatchObject({
        code: "subtask_root_invalid_output",
        subtasks: [{taskId: "root", status: "failed", code: "invalid_output"}],
      });
  });

  it("serializes ready model tasks while keeping their execution governed", async () => {
    type ModelTaskId = "root" | "model_a" | "model_b" | "join";
    let active = 0;
    let maxActive = 0;
    const modelTask = (id: "model_a" | "model_b"): SubtaskDefinition<ModelTaskId, Input> => ({
      spec: {id, version: "1", dependencies: ["root"], executionClass: "model", allowedTools: [id]},
      outputSchema,
      execute: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return {output: {value: id}, toolsUsed: [id], usage: {costUsd: 0.01, modelCalls: 1}};
      },
    });
    const governed: SubtaskDefinition<ModelTaskId, Input>[] = [
      {
        spec: {id: "root", version: "1", dependencies: [], executionClass: "deterministic", allowedTools: []},
        outputSchema,
        execute: () => ({output: {value: "root"}}),
      },
      modelTask("model_a"),
      modelTask("model_b"),
      {
        spec: {id: "join", version: "1", dependencies: ["model_a", "model_b"], executionClass: "deterministic", allowedTools: []},
        outputSchema,
        execute: () => ({output: {value: "done"}}),
      },
    ];

    const result = await runSubgraph({graphId: "models", caseId: "case-1", input: {amount: "10"}, tasks: governed});
    expect(maxActive).toBe(1);
    expect(result.usage).toEqual({costUsd: 0.02, modelCalls: 2});
  });

  it("rejects cycles before executing work", async () => {
    const cyclic = tasks();
    cyclic[0] = {...cyclic[0]!, spec: {...cyclic[0]!.spec, dependencies: ["join"]}};
    await expect(runSubgraph({graphId: "test", caseId: "case-1", input: {amount: "10"}, tasks: cyclic}))
      .rejects.toMatchObject({code: "subgraph_dependency_cycle"});
  });
});
