import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildFinancingComparisonRuns, financingComparisonRunIds} from "./financing-comparison-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded financing comparison evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildFinancingComparisonRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 300_000);
  it("covers cost, cash, covenants, collateral, gaps and the boundaries a stress must respect", () => {
    expect(records.get(financingComparisonRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "c02-three-proposals-independent-oracle", "bank-stress-independent-oracle", "lowest-nominal-spread-is-not-the-lowest-cost",
      "cash-below-zero-eliminates-before-preference", "below-policy-minimum-conditions-without-eliminating", "covenant-test-frequency-per-year",
      "each-covenant-on-its-own-definition-and-limit", "collateral-consumed-reduces-free-receivables", "debt-service-in-2028",
      "cheapest-and-safest-shown-side-by-side", "negotiated-variants-move-the-cost", "an-empty-pool-under-a-cap-eliminates-any-collateral", "collateral-above-company-rule-eliminates", "absent-fee-is-a-gap-not-zero",
      "recurring-fee-enters-lifetime-cost", "contract-dates-and-business-days", "a-fee-paid-after-the-draw-is-paid-on-its-date", "contract-dates-in-the-company-view"]);
    expect(records.get(financingComparisonRunIds.adversarial)!.cases).toHaveLength(20);
    expect(records.get(financingComparisonRunIds.consistency)!.cases).toHaveLength(6);
    expect(records.get(financingComparisonRunIds.gold)!.notes).toContain("do not constitute independent review");
  });
});
