import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildProjectionChallengeRuns, projectionChallengeRunIds} from "./projection-challenge-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded projection challenge evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildProjectionChallengeRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers the gap, each assumption, capacity, cash, evidence, the recommendation and the ficha's failures", () => {
    expect(records.get(projectionChallengeRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "plan-about-27-million-above-the-reference-in-2028", "margin-to-16-2-without-a-stated-cause", "price-above-cost-is-the-largest-effect-with-margin-per-kg",
      "assumptions-in-order-of-isolated-effect", "volume-above-the-118-thousand-tonne-capacity-in-2028-without-capex", "fixed-costs-below-inflation",
      "receivable-days-and-maintenance-capex-in-cash", "evidence-that-would-sustain-each-assumption", "interaction-between-assumptions-shown-not-absorbed",
      "effects-from-the-plan-under-the-second-convention", "present-the-current-plan-as-the-upside-case", "no-scenario-no-rebuilt-model-no-material",
      "turn-two-premium-line-needs-mix-share", "documented-price-leaves-the-conditions", "capacity-not-informed-is-a-gap-and-a-question", "absent-plan-figure-is-a-gap-not-a-default"]);
    expect(records.get(projectionChallengeRunIds.adversarial)!.cases).toHaveLength(14);
    expect(records.get(projectionChallengeRunIds.consistency)!.cases).toHaveLength(6);
  });
});
