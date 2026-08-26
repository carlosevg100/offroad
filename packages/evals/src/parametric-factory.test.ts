import Decimal from "decimal.js";
import {executeCaseEngine} from "@offroad/case-engine";
import {
  corporateGrowthAdversarialScenario,
  corporateGrowthEligibilityNegativeScenario,
  corporateGrowthScenario,
  dirtyWorkingCapitalScenario,
  generateCase,
  receivablesScenario,
  type FactoryScenario,
} from "@offroad/case-factory";
import {supportedSemanticAudit} from "@offroad/case-understanding";
import {toReceivablesCaseFromSimpleTape} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

const stages = ["extraction", "reconciliation", "metrics", "gaps", "structure", "red_flags", "claims", "materials", "matching", "outcome"];

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
    ...(generated.loanTape.length > 0 ? {
      receivablesCase: toReceivablesCaseFromSimpleTape({
        id: `${scenario.id}-receivables`,
        referenceDate: scenario.referenceDate,
        cedentName: scenario.company.legalName,
        tape: generated.loanTape,
      }),
    } : {}),
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

      expect(result.state.reconciliation.financialTruth.procedureCoverage).toHaveLength(18);
      expect(result.state.reconciliation.financialTruth.procedureCoverage.map((entry) => entry.procedureId)).toEqual(
        Array.from({length: 18}, (_, index) => `Q-${String(index + 1).padStart(2, "0")}`),
      );
      expect(result.state.reconciliation.debtTruth.procedureCoverage).toHaveLength(31);
      expect(result.state.reconciliation.debtTruth.procedureCoverage.map((entry) => entry.procedureId)).toEqual(
        Array.from({length: 31}, (_, index) => `D-${String(index + 1).padStart(2, "0")}`),
      );
      expect(result.state.operationTruth.procedureCoverage).toHaveLength(14);
      expect(result.state.operationTruth.procedureCoverage.map((entry) => entry.procedureId)).toEqual(
        Array.from({length: 14}, (_, index) => `OP-${String(index + 1).padStart(2, "0")}`),
      );
      expect(result.state.structureTruth.procedureCoverage).toHaveLength(45);
      expect(result.state.structureTruth.procedureCoverage.map((entry) => entry.procedureId)).toEqual(
        Array.from({length: 45}, (_, index) => `ES-${String(index + 1).padStart(2, "0")}`),
      );
      expect(result.state.pricingTruth.procedureCoverage).toHaveLength(13);
      expect(result.state.pricingTruth.procedureCoverage.map((entry) => entry.procedureId)).toEqual(
        Array.from({length: 13}, (_, index) => `PR-${String(index + 1).padStart(2, "0")}`),
      );
      expect(result.state.pricingTruth.decision).toBe("abstain");
      expect(result.state.pricingTruth.indicativePrice).toBeNull();
      expect(result.state.materialTruth.procedureCoverage).toHaveLength(32);
      expect(result.state.materialTruth.procedureCoverage.map((entry)=>entry.procedureId)).toEqual(
        Array.from({length:32},(_,index)=>`MA-${String(index+1).padStart(2,"0")}`),
      );
      expect(result.state.materialTruth.releaseDecision).toBe("internal_only");
      expect(result.state.matching.marketTruth.procedureCoverage).toHaveLength(28);
      expect(result.state.matching.marketTruth.procedureCoverage.map((entry)=>entry.procedureId)).toEqual(
        Array.from({length:28},(_,index)=>`MK-${String(index+1).padStart(2,"0")}`),
      );
      expect(result.state.matching.marketTruth.procedureCoverage.slice(18).every((entry)=>entry.status==="not_applicable")).toBe(true);
      expect(result.state.matching.marketTruth.boundary).toBe("qualified_introduction");
      expect(result.state.reconciliation.financialTruth.procedureCoverage.every((entry) =>
        ["completed", "partial", "blocked", "not_computable"].includes(entry.status),
      )).toBe(true);
      expect(result.state.reconciliation.debtTruth.procedureCoverage.every((entry) =>
        ["completed", "partial", "blocked", "not_computable", "not_applicable"].includes(entry.status),
      )).toBe(true);

      for (const expected of generated.gold.calculations) {
        const actual = result.state.reconciliation.calculations.find((calculation) => calculation.id === expected.id)?.value;
        expect(actual, `missing calculation ${expected.id}`).toBeDefined();
        expect(new Decimal(actual!).eq(expected.value), `${expected.id}: expected ${expected.value}, got ${actual}`).toBe(true);
      }

      const fits = new Map(result.state.matching.fits.map((fit) => [fit.fundId, fit.verdict]));
      for (const expected of generated.gold.expectedMatches) expect(fits.get(expected.capitalProviderId)).toBe(expected.expected);
      expect(result.state.outcome.qualifiedIntroductionAllowed).toBe(false);
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

  it("runs the growth-capex adversarial room on the same governed rail and refuses unsupported material", async () => {
    const {result} = await runScenario(corporateGrowthAdversarialScenario);
    expect(result.report.status).toBe("succeeded");
    const debt = result.state.reconciliation.facts.find((fact) => fact.key.fieldPath === "debt.total_gross");
    // The audited value governs, but the material difference keeps the fact disputed and the
    // losing management value remains available for the debt-bridge procedure to explain.
    expect(debt).toMatchObject({value: "45000000", disputed: true});
    expect(debt?.conflicts).toContainEqual(expect.objectContaining({candidate: expect.objectContaining({normalizedValue: "38000000"})}));
    expect(JSON.stringify(result.state.reconciliation.facts)).not.toMatch(/ignore all prior|approve this transaction/i);
    expect(result.state.brief).toBeNull();
    expect(result.state.briefBlockedBy).toContain("factory-collateral: support_anchor_unverified");
  });

  it("keeps the growth need but closes the debenture path for a limitada", async () => {
    const {result} = await runScenario(corporateGrowthEligibilityNegativeScenario);
    expect(result.report.status).toBe("succeeded");
    const debenture = result.state.instruments.find((instrument) => instrument.instrument.id === "debenture_476");
    expect(debenture).toMatchObject({eligible: false});
    const ccb = result.state.instruments.find((instrument) => instrument.instrument.id === "ccb");
    expect(ccb).toMatchObject({eligible: true});
  });

  it("keeps economic truth identical across Portuguese and English generation", () => {
    const portuguese = generateCase(corporateGrowthScenario);
    const english = generateCase({...corporateGrowthScenario, id: "corporate-growth-clean-en", locale: "en"});
    expect(english.gold.fields).toEqual(portuguese.gold.fields);
    expect(english.gold.calculations).toEqual(portuguese.gold.calculations);
    expect(english.gold.expectedMatches).toEqual(portuguese.gold.expectedMatches);
    expect(english.gold.expectedStructures).toEqual(portuguese.gold.expectedStructures);
  });

  it("runs the receivables vertical inside the governed nine-stage engine", async () => {
    const {result} = await runScenario(receivablesScenario);
    expect(result.state.receivables?.metrics.portfolio.totalOutstanding).toBe("48000000.00");
    expect(result.state.receivables?.metrics.portfolio.topDebtorShare).toBe("0.12000000");
    expect(result.state.receivables?.reconciliation.tapeToAccounting.status).toBe("tied");
    expect(result.state.receivables?.decision.externalDirectionAllowed).toBe(false);
  });

  it("keeps handcrafted anchors separate from parametric cases", () => {
    expect(generateCase(corporateGrowthScenario).gold.origin).toBe("parametric");
    expect(corporateGrowthScenario.id).not.toMatch(/rede-horizonte|aurora|nimbus|camil|cogna/i);
  });
});
