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
