import Decimal from "decimal.js";
import {executeCaseEngine} from "@offroad/case-engine";
import {
  corporateGrowthScenario,
  dirtyWorkingCapitalScenario,
  generateCase,
  receivablesScenario,
  type FactoryScenario,
} from "@offroad/case-factory";
import {supportedSemanticAudit} from "@offroad/case-understanding";
import {describe, expect, it} from "vitest";

const stages = ["extraction", "reconciliation", "metrics", "gaps", "structure", "claims", "materials", "matching", "outcome"];

async function runScenario(scenario: FactoryScenario) {
  const generated = generateCase(scenario);
  const result = await executeCaseEngine({
    runId: `factory-${scenario.id}`,
    caseId: scenario.id,
    archetypeId: scenario.archetypeId,
    locale: scenario.locale,
    referenceDate: scenario.referenceDate,
    candidates: generated.candidates,
    documents: generated.classifiedDocuments,
    roomDocuments: generated.roomDocuments,
    dealBrief: generated.dealBrief,
    resolvedMandates: generated.mandates,
    externalReleaseApproved: false,
    writeBrief: async () => ({brief: generated.brief, blockedBy: []}),
    verifyBrief: async ({brief}) => ({audit: supportedSemanticAudit(brief)}),
  });
  return {generated, result};
}

describe("parametric cases on the governed rail", () => {
  it.each([corporateGrowthScenario, dirtyWorkingCapitalScenario, receivablesScenario])(
    "runs $id through all nine governed stages and preserves the answer key",
    async (scenario) => {
      const {generated, result} = await runScenario(scenario);
      expect(result.report.status).toBe("succeeded");
      expect(result.report.stages.map((stage) => stage.stage)).toEqual(stages);
      expect(result.report.stages.every((stage) => stage.status === "succeeded")).toBe(true);

      for (const expected of generated.gold.calculations) {
        const actual = result.state.reconciliation.calculations.find((calculation) => calculation.id === expected.id)?.value;
        expect(actual, `missing calculation ${expected.id}`).toBeDefined();
        expect(new Decimal(actual!).eq(expected.value), `${expected.id}: expected ${expected.value}, got ${actual}`).toBe(true);
      }

      const fits = new Map(result.state.matching.fits.map((fit) => [fit.fundId, fit.verdict]));
      for (const expected of generated.gold.expectedMatches) expect(fits.get(expected.capitalProviderId)).toBe(expected.expected);
      expect(result.state.outcome.externalDirectionAllowed).toBe(false);
    },
  );

  it("keeps contradictory evidence visible and hostile document text outside reconciled facts", async () => {
    const {result} = await runScenario(dirtyWorkingCapitalScenario);
    const request = result.state.reconciliation.facts.find((fact) => fact.key.fieldPath === "transaction.requested_amount");
    expect(request).toMatchObject({value: "32000000", disputed: true});
    expect(request?.conflicts).toContainEqual(expect.objectContaining({candidate: expect.objectContaining({normalizedValue: "28000000"})}));
    expect(JSON.stringify(result.state.reconciliation.facts)).not.toMatch(/ignore all prior|hyperlink|other-tenant/i);
    expect(result.state.reconciliation.facts.find((fact) => fact.key.fieldPath === "collateral.total_capacity")?.accepted.anchorVerified).toBe(false);
    expect(result.state.brief).toBeNull();
    expect(result.state.briefBlockedBy).toContain("factory-collateral: support_anchor_unverified");
  });

  it("keeps economic truth identical across Portuguese and English generation", () => {
    const portuguese = generateCase(corporateGrowthScenario);
    const english = generateCase({...corporateGrowthScenario, id: "corporate-growth-clean-en", locale: "en"});
    expect(english.gold.fields).toEqual(portuguese.gold.fields);
    expect(english.gold.calculations).toEqual(portuguese.gold.calculations);
    expect(english.gold.expectedMatches).toEqual(portuguese.gold.expectedMatches);
    expect(english.gold.expectedStructures).toEqual(portuguese.gold.expectedStructures);
  });

  it("keeps handcrafted anchors separate from parametric cases", () => {
    expect(generateCase(corporateGrowthScenario).gold.origin).toBe("parametric");
    expect(corporateGrowthScenario.id).not.toMatch(/rede-horizonte|aurora|nimbus|camil|cogna/i);
  });
});
