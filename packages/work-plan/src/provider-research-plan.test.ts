import {describe, expect, it} from "vitest";
import {compileProviderResearchBrief, isProviderResearchRequest, providerResearchPlanSnapshot} from "./provider-research-plan";
describe("approved provider research plan", () => {
  it("uses only the canonical universe and mandate tasks without comparable transactions or matching", () => {
    const plan = providerResearchPlanSnapshot();
    expect(plan.taskSpecs.map(task => task.id)).toEqual(["M01", "K01", "K02"]);
    expect(plan.job.inputPolicy.company).toBe("not_applicable");
    const brief = compileProviderResearchBrief({plan, revisionContext: "job-1", locale: "pt-BR", objective: "Pesquisar mandatos de fundos"});
    expect(brief.workstreams.flatMap(stream => stream.sourceTaskIds)).toEqual(["M01", "K01", "K02"]);
    expect(() => compileProviderResearchBrief({plan: {...plan, taskSpecs: plan.taskSpecs.slice(0, 2)}, revisionContext: "job-1", locale: "pt-BR", objective: "Pesquisar mandatos"})).toThrow("provider_research_plan_scope_mismatch");
  });
  it("requires an explicit research request and refuses contact or shortlist instructions", () => {
    expect(isProviderResearchRequest("Pesquisar mandatos de fundos de crédito")).toBe(true);
    expect(isProviderResearchRequest("Research lender mandates")).toBe(true);
    for (const message of ["Analyze our refinancing", "Pesquisar fundos e enviar teaser", "List investors and contact them", "Make a shortlist of funds", "Pesquisar fundos e calcular a capacidade de dívida", "Research funds and prepare a pitch"]) expect(isProviderResearchRequest(message)).toBe(false);
  });
});

it("shows the exact public snapshot as a mixed research source before approval while retaining the private v1 plan", async () => {
  const {providerResearchPlanSnapshotV1} = await import("./provider-research-plan");
  const publicPlan = providerResearchPlanSnapshot();
  const brief = compileProviderResearchBrief({plan: publicPlan, revisionContext: "job-1", locale: "en-US", objective: "Research lenders"});
  expect(JSON.stringify(brief)).toContain("br-capital-2026-09-10.v1:f158ac09fc2a44a77d608cc57a1fbb074f7de8b88d558ce9d29bff917429f235");
  expect(publicPlan.job.inputPolicy.publicResearch).toBe("allowed");
  const legacyPlan = providerResearchPlanSnapshotV1();
  expect(legacyPlan.registryVersion).toBe("2026.09.10-v14");
  expect(legacyPlan.job.inputPolicy.publicResearch).toBe("not_applicable");
  const legacy = compileProviderResearchBrief({plan: legacyPlan, revisionContext: "job-1", locale: "en-US", objective: "Research lenders"});
  expect(JSON.stringify(legacy)).not.toContain("br-capital");
});
