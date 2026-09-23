import {describe, expect, it} from "vitest";
import {residualInformationRequests, runCapitalPlanningFixture} from "./capital-planning.test-support";
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

  it("asks the whole residual batch and forces no comparison when the base is insufficient", async () => {
    const {outcome, artifacts, assessments, completed, taskIds} = await runCapitalPlanningFixture(null, false, "insufficient");
    expect(outcome.status).toBe("succeeded");
    expect(artifacts).toHaveLength(taskIds.length);
    expect(completed).toMatchObject({alternative_map_artifact_id: expect.any(String)});

    const final = artifacts.at(-1)?.content as {alternatives: unknown[]; comparison: unknown[]; informationRequests: unknown[]; evidenceCoverage: {status: string}; directionalRecommendation: {status: string; alternativeId: string | null}};
    expect(final.evidenceCoverage.status).toBe("insufficient");
    expect(final.alternatives).toEqual([]);
    expect(final.comparison).toEqual([]);
    expect(final.directionalRecommendation).toMatchObject({status: "not_ready", alternativeId: null});
    expect(final.informationRequests).toHaveLength(7);
    for (const taskId of ["M04", "S02", "S05", "S10"]) {
      expect(artifacts.find((artifact) => artifact.taskId === taskId)?.content)
        .toEqual({status: "insufficient_base", reason: expect.any(String), informationRequestCount: 7});
    }

    expect(assessments).toHaveLength(1);
    const assessment = assessments[0]!;
    expect(assessment.requests).toHaveLength(7);
    expect(new Set(assessment.requests.map((request) => request.requirementKey)).size).toBe(7);
    for (const [index, request] of assessment.requests.entries()) {
      expect(request.whyItMatters).toBe(residualInformationRequests[index]!.whyItMatters);
      expect(request.decisionImpact).toBe(residualInformationRequests[index]!.decisionImpact);
      expect(request.status).toBe("open");
    }
    expect(assessment.decisions).toHaveLength(1);
    expect(assessment.decisions[0]).toMatchObject({status: "open", confidence: "insufficient", recommendation: null, alternatives: []});
  });
});
