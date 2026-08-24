import {generateCase, receivablesScenario} from "@offroad/case-factory";
import {
  analyzeReceivables,
  receivablesParametricScenarios,
  toReceivablesCaseFromSimpleTape,
} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

describe("receivables vertical on the governed case factory", () => {
  it("promotes the factory loan tape into a deterministic portfolio analysis without changing its economics", () => {
    const generated = generateCase(receivablesScenario);
    const input = toReceivablesCaseFromSimpleTape({
      id: "factory-receivables-vertical",
      referenceDate: generated.scenario.referenceDate,
      cedentName: generated.scenario.company.legalName,
      tape: generated.loanTape,
    });
    const result = analyzeReceivables(input);
    expect(result.metrics.portfolio.totalOutstanding).toBe("48000000.00");
    expect(result.metrics.portfolio.topDebtorShare).toBe("0.12000000");
    expect(result.reconciliation.tapeToAccounting.status).toBe("tied");
    expect(result.decision.externalDirectionAllowed).toBe(false);
  });

  it("covers at least twenty independent parametric scenarios including correct refusal", () => {
    expect(receivablesParametricScenarios.length).toBeGreaterThanOrEqual(20);
    const results = receivablesParametricScenarios.map((scenario) => ({
      id: scenario.id,
      expected: scenario.expected,
      actual: analyzeReceivables(scenario.input).decision.status,
    }));
    expect(results.every((result) => result.actual === result.expected)).toBe(true);
    expect(results).toContainEqual({id: "r19-no-eligible-base", expected: "not_viable", actual: "not_viable"});
    expect(new Set(results.map((result) => result.actual))).toEqual(new Set(["ready_for_structuring", "needs_remediation", "not_viable"]));
  });
});
