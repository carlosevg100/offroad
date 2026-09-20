import {describe, expect, it} from "vitest";
import {runCapitalPlanningFixture} from "./capital-planning.test-support";
let counterfactualRequest: unknown;
describe("capital planning executor", () => {
  it.each(["cfo", "credit_analyst", "financial_advisor", null])("%s: persists the full bounded DAG and abstains from invented transaction terms", async (profile) => {
    const {outcome, artifacts, completed, requests, taskIds} = await runCapitalPlanningFixture(profile);
    if (counterfactualRequest === undefined) counterfactualRequest = requests;
    expect(requests).toEqual(counterfactualRequest);
    expect(outcome.status).toBe("succeeded");
    expect(artifacts).toHaveLength(taskIds.length);
    expect(artifacts.at(-1)).toMatchObject({taskId: "S11", type: "alternative_map", status: "pending_confirmation"});
    expect(JSON.stringify(artifacts.at(-1)?.content)).not.toMatch(/R\$\s*\d|\d+(?:[.,]\d+)?\s*%/);
    expect(completed).toMatchObject({alternative_map_artifact_id: artifacts.at(-1) ? expect.any(String) : ""});
  });
});
