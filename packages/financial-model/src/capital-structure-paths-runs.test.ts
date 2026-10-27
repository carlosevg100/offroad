import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildCapitalPathsRuns, capitalPathsRunIds} from "./capital-structure-paths-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded capital structure paths", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildCapitalPathsRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 1_800_000);
  it("covers the status quo, the paths, the gates, the basket, the amortization, the cost, the fallback and what would change", () => {
    expect(records.get(capitalPathsRunIds.gold)!.cases.map((c) => c.id)).toEqual(["first-shortfall-in-december-2026-without-action", "cash-at-the-end-of-2027-without-action", "2027-service-against-cash-available-before-the-project", "seven-paths-and-two-companions-on-the-same-base", "recommended-path-comes-from-the-gates", "leverage-on-the-indenture-definition-in-december", "oracle-paths-on-the-same-base", "three-year-ccb-adds-to-2027-and-leaves-bradesco-open", "taxes-recomputed-per-path", "aggregate-basket-with-bradesco-inside", "five-year-amortization-fails-in-2029-seven-passes", "effective-cost-of-the-issue-over-its-life", "bradesco-only-extension-leaves-a-gap", "dated-alternative-before-the-bradesco-maturity", "issue-target-apart-from-the-floor-inside-the-gates", "wheat-sensitivity-at-the-c24-level", "seasonal-line-leaves-the-test-only-with-a-verified-settlement", "cost-flows-are-the-cash-flows", "what-would-change-the-recommendation", "facts-readings-recommendations-apart-without-verdict", "minimum-cash-of-policy-changes-the-order", "absent-minimum-cash-is-a-gap-not-zero"]);
    expect(records.get(capitalPathsRunIds.adversarial)!.cases).toHaveLength(19);
    expect(records.get(capitalPathsRunIds.consistency)!.cases).toHaveLength(6);
  });
});
