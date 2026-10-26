import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildReceivablesFundingRuns, receivablesFundingRunIds} from "./receivables-funding-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded receivables funding evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildReceivablesFundingRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers the portfolio, the options, the costs, the effects, the timing and the process", () => {
    expect(records.get(receivablesFundingRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "gross-portfolio-is-not-assignable", "every-exclusion-carries-its-reason", "options-sized-by-eligibility-and-sublimit", "cost-for-the-time-in-use-against-the-bank-line",
      "iof-where-it-applies", "discount-iof-on-whole-draws", "monthly-rates-converted-before-comparing", "recourse-on-the-balance-sheet-and-the-covenant", "sale-is-not-a-guarantee-under-the-negative-pledge",
      "asks-about-retailer-a-program", "fifteen-to-thirty-days-with-registration-as-condition-precedent", "several-buyers-and-the-bank-line-as-reserve",
      "no-dedicated-vehicle-for-a-seasonal-need", "retailer-a-program-reorders-the-plan", "one-debtor-split-across-lots-shares-the-sublimit", "unsold-balance-goes-to-the-next-buyer", "encumbered-bucket-released-under-the-same-sublimit",
      "largest-debtor-unknown-is-a-gap-not-a-default", "absent-peak-is-a-gap-not-a-default"]);
    expect(records.get(receivablesFundingRunIds.adversarial)!.cases).toHaveLength(17);
    expect(records.get(receivablesFundingRunIds.consistency)!.cases).toHaveLength(6);
  });
});
