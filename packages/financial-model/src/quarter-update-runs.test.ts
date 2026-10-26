import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildQuarterUpdateRuns, quarterUpdateRunIds} from "./quarter-update-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded quarter update evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildQuarterUpdateRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers the bridges, the classification, December, the action, the covenant, what did not change and the question", () => {
    expect(records.get(quarterUpdateRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "bridges-sum-exactly-to-the-deviations", "each-cause-in-the-oracle-bridge", "stock-is-calendar-terms-and-wheat-structural-until-december",
      "worst-december-week-near-4-2", "december-need-above-the-overdraft-limit", "action-within-what-is-approved",
      "december-covenant-by-each-definition", "oracle-second-absorption-kept-as-contrast", "projection-2026-ebitda-propagated", "decisions-that-change-are-named",
      "what-did-not-change-in-one-line", "question-negotiated-terms-or-late-payment", "stale-material-offered-never-sent", "prior-version-kept-as-released",
      "deviation-without-cause-is-a-named-residual", "structural-cause-without-weekly-effect-is-a-gap", "persistence-date-bounds-every-effect",
      "open-diagnosis-without-question-is-a-gap", "updated-only-for-results-this-packet-computes", "identity-transform-with-noise-is-no-propagation",
      "managerial-reading-not-updated-by-the-indenture-result",
      "token-weekly-propagation-keeps-the-weekly-cash-affected", "inconsistent-weekly-propagation-keeps-the-weekly-cash-affected",
      "named-dependent-owned-elsewhere-makes-the-packet-partial", "absent-actual-is-a-gap-not-a-default"]);
    expect(records.get(quarterUpdateRunIds.adversarial)!.cases).toHaveLength(17);
    expect(records.get(quarterUpdateRunIds.consistency)!.cases).toHaveLength(6);
  });
});
