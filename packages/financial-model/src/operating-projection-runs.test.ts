import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildOperatingProjectionRuns, operatingProjectionRunIds} from "./operating-projection-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded operating projection evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildOperatingProjectionRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers calibration, base, budget, sensitivities, scenarios, data and assumptions, questions and the second turn", () => {
    expect(records.get(operatingProjectionRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "first-version-in-the-first-turn", "reproduces-the-last-audited-year", "base-by-driver-2026-to-2028", "ebitda-within-five-percent-of-the-answer-key",
      "cash-available-near-sixty-percent-of-ebitda", "budget-and-revision-side-by-side-with-the-cause", "sensitivities-in-reais-2027",
      "wheat-shock-with-six-month-pass-through", "wheat-shock-without-pass-through-in-the-year", "volume-two-percent-lower", "assumptions-kept-apart-from-data",
      "at-most-three-questions-volume-pass-through-receivable-days", "turn-two-informed-drivers", "turn-two-sixty-day-receivables-drain-cash",
      "turn-two-wheat-shock-with-four-month-pass-through", "projection-withheld-when-the-last-year-is-not-reproduced", "unexplained-difference-is-an-open-question",
      "absent-driver-is-a-gap-not-a-default"]);
    expect(records.get(operatingProjectionRunIds.adversarial)!.cases).toHaveLength(14);
    expect(records.get(operatingProjectionRunIds.consistency)!.cases).toHaveLength(6);
  });
});
