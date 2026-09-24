import {readdirSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {evaluationFamilies} from "./evaluation-families";

describe("evaluation family registry", () => {
  it("registers exactly the evaluation scripts that request through the governed transport, under their file names", () => {
    const directory = new URL("../../../packages/evals/scripts/", import.meta.url);
    const governed = readdirSync(directory)
      .filter(name => name.endsWith(".ts") && readFileSync(new URL(name, directory), "utf8").includes("requestGovernedEvaluation("))
      .map(name => name.slice(0, -".ts".length))
      .sort();
    // The nine scripts stage 16 contained, all back through the transport in stage 17.
    expect(governed).toHaveLength(9);
    expect(Object.keys(evaluationFamilies).sort()).toEqual(governed);
    expect(Object.isFrozen(evaluationFamilies)).toBe(true);
  });
});
