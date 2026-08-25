import {describe, expect, it} from "vitest";
import Decimal from "decimal.js";
import {
  corporateGrowthAdversarialScenario,
  corporateGrowthEligibilityNegativeScenario,
  corporateGrowthScenario,
  dirtyWorkingCapitalScenario,
  generateCase,
  receivablesScenario,
} from "./index";

describe("parametric case factory", () => {
  it("derives documents, evidence and gold from one declarative economic scenario", () => {
    const first = generateCase(corporateGrowthScenario);
    const second = generateCase(corporateGrowthScenario);
    expect(first.gold.origin).toBe("parametric");
    expect(first.gold).toEqual(second.gold);
    expect(first.documents).toEqual(second.documents);
    expect(first.gold.calculations).toContainEqual({id: "net_debt", value: "34000000"});
    expect(first.gold.expectedStructures).toContainEqual(expect.objectContaining({instrument: "debenture", classification: "viable"}));
    expect(first.gold.expectedMatches).toEqual([
      {capitalProviderId: "fund-aligned", expected: "possible"},
      {capitalProviderId: "fund-misaligned", expected: "excluded"},
    ]);
  });

  it("embodies dirty-room and hostile-input perturbations without promoting document instructions to facts", () => {
    const generated = generateCase(dirtyWorkingCapitalScenario);
    expect(generated.documents.find((document) => document.name === "capital-request.md")?.format).toBe("scanned_image");
    expect(generated.candidates.filter((candidate) => candidate.fieldPath === "transaction.requested_amount")).toHaveLength(2);
    expect(generated.candidates.find((candidate) => candidate.fieldPath === "collateral.total_capacity")?.anchorVerified).toBe(false);
    expect(generated.gold.fields).toContainEqual(expect.objectContaining({fieldPath: "collateral.total_capacity", value: "57000000"}));
    expect(generated.gold.expectedStructures).toContainEqual(expect.objectContaining({instrument: "debenture", classification: "ineligible"}));
    expect(generated.documents.some((document) => document.securityFixtures.includes("prompt_injection"))).toBe(true);
    expect(generated.candidates.some((candidate) => /ignore all prior|hyperlink/i.test(candidate.normalizedValue))).toBe(false);
  });

  it("generates a deterministic loan tape that ties exactly to the declared balance", () => {
    const generated = generateCase(receivablesScenario);
    expect(generated.loanTape).toHaveLength(250);
    const balance = generated.loanTape.reduce((sum, row) => sum.plus(row.balance), new Decimal(0));
    const overdue = generated.loanTape.filter((row) => row.daysPastDue > 0).reduce((sum, row) => sum.plus(row.balance), new Decimal(0));
    const topDebtor = generated.loanTape.filter((row) => row.debtorId === "DEBTOR-TOP").reduce((sum, row) => sum.plus(row.balance), new Decimal(0));
    expect(balance.toFixed(2)).toBe("48000000.00");
    expect(overdue.div(balance).toNumber()).toBe(0.07);
    expect(topDebtor.div(balance).toNumber()).toBe(0.12);
    expect(generated.documents.find((document) => document.name === "receivables-aging.csv")?.content).toContain("receivable_id");
  });

  it("keeps growth-capex adversarial truth in gold while exposing conflicts and unsafe text to the rail", () => {
    const generated = generateCase(corporateGrowthAdversarialScenario);
    expect(generated.gold.fields).toContainEqual(expect.objectContaining({fieldPath: "debt.total_gross", value: "45000000"}));
    expect(generated.candidates.filter((candidate) => candidate.fieldPath === "debt.total_gross")).toHaveLength(2);
    expect(generated.candidates.find((candidate) => candidate.fieldPath === "collateral.total_capacity")?.anchorVerified).toBe(false);
    expect(generated.documents.find((document) => document.name === "capital-request.md")?.securityFixtures).toContain("prompt_injection");
    expect(generated.gold.expectedExceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({kind: "conflict", fieldPath: "debt.total_gross"}),
      expect.objectContaining({kind: "evidence", fieldPath: "collateral.total_capacity"}),
      expect.objectContaining({kind: "security"}),
    ]));
  });

  it("closes the debenture path for a limitada without changing the capital need archetype", () => {
    const generated = generateCase(corporateGrowthEligibilityNegativeScenario);
    expect(generated.scenario.archetypeId).toBe("growth_expansion");
    expect(generated.gold.expectedStructures).toContainEqual(expect.objectContaining({instrument: "debenture", classification: "ineligible"}));
    expect(generated.gold.expectedStructures).toContainEqual(expect.objectContaining({instrument: "ccb", classification: "preferred"}));
  });
});
