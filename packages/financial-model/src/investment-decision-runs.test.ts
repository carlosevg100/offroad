import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildInvestmentDecisionRuns, investmentDecisionRunIds} from "./investment-decision-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded investment decision evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildInvestmentDecisionRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 30_000);
  it("covers value, timing, gaps and the boundaries a sensitivity must respect", () => {
    expect(records.get(investmentDecisionRunIds.gold)!.cases.map(c => c.id)).toEqual([
      "c32-five-cases-independent-oracle", "startup-working-capital-of-verticalization",
      "eleven-annual-flows-after-tax-maintenance-and-working-capital", "premises-that-change-the-conclusion",
      "cash-consumed-before-payback", "return-near-cost-of-capital-is-marginal", "company-minimum-includes-opening-balance",
      "opening-balance-is-the-minimum-when-every-close-is-higher", "company-cash-with-and-without-the-project",
      "absent-cost-of-capital-is-a-gap-not-a-default", "unrounded-precision-is-the-default"]);
    expect(records.get(investmentDecisionRunIds.adversarial)!.cases).toHaveLength(9);
    expect(records.get(investmentDecisionRunIds.consistency)!.cases).toHaveLength(6);
    expect(records.get(investmentDecisionRunIds.gold)!.notes).toContain("do not constitute independent review");
  });
});
