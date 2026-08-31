import {describe, expect, it} from "vitest";

import {projectPreliminaryTasks} from "./preliminary-understanding";

describe("projectPreliminaryTasks", () => {
  it("starts with document verification when the run has not emitted events", () => {
    expect(projectPreliminaryTasks([], true)).toEqual([
      {id: "receive", status: "running"},
      {id: "read", status: "pending"},
      {id: "organize", status: "pending"},
      {id: "research", status: "pending"},
      {id: "compile", status: "pending"},
    ]);
  });

  it("does not claim deep analysis while compiling the preliminary object", () => {
    const tasks = projectPreliminaryTasks([
      {stage: "preliminary_understanding", status: "started"},
      {stage: "public_research", status: "succeeded"},
    ], true);
    expect(tasks).toEqual([
      {id: "receive", status: "completed"},
      {id: "read", status: "completed"},
      {id: "organize", status: "completed"},
      {id: "research", status: "completed"},
      {id: "compile", status: "running"},
    ]);
  });

  it("surfaces the stage that failed", () => {
    const tasks = projectPreliminaryTasks([
      {stage: "download", status: "succeeded"},
      {stage: "parse", status: "failed"},
    ], false);
    expect(tasks.find((task) => task.id === "read")?.status).toBe("failed");
  });
});
