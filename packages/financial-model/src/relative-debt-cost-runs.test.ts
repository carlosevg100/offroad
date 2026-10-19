import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildRelativeDebtCostRuns, relativeDebtCostRunIds} from "./relative-debt-cost-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded relative debt cost evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildRelativeDebtCostRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 120_000);
  it("covers decomposition, lens, notches, levers, gaps and the boundaries of the comparison", () => {
    expect(records.get(relativeDebtCostRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "c03-decomposition-independent-oracle", "more-than-half-is-not-company-risk", "leverage-is-not-the-driver", "committee-lens-weighs-scale-conversion-and-debt-profile",
      "qualitative-rows-keep-the-adopted-judgment", "residual-read-as-about-two-notches", "prepaying-only-for-the-rate-does-not-pay", "rating-breaks-even-on-spread",
      "absent-market-adjustment-is-a-gap", "absent-indicator-is-a-gap-not-neutral"]);
    expect(records.get(relativeDebtCostRunIds.adversarial)!.cases).toHaveLength(10);
    expect(records.get(relativeDebtCostRunIds.consistency)!.cases).toHaveLength(6);
  });
});
