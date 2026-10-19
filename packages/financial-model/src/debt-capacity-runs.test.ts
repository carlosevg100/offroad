import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildDebtCapacityRuns, debtCapacityRunIds} from "./debt-capacity-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded debt capacity evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildDebtCapacityRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers size by limit, profile, plan and the boundaries of the question", () => {
    expect(records.get(debtCapacityRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "c04-capacity-by-limit-independent-oracle", "phased-capacity-independent-oracle", "covenant-with-headroom-binds",
      "sixty-breaks-the-covenant-in-the-adverse-case-as-informed", "phasing-makes-sixty-fit-in-size",
      "size-fits-but-a-five-year-profile-runs-out-of-cash-in-the-adverse-case", "bndes-eight-years-keeps-cash-positive",
      "plan-pays-scheduled-principal-without-refinancing", "window-ends-with-the-seasonal-line-open", "absent-threshold-is-a-gap-not-a-default"]);
    expect(records.get(debtCapacityRunIds.adversarial)!.cases).toHaveLength(10);
    expect(records.get(debtCapacityRunIds.consistency)!.cases).toHaveLength(6);
  });
});
