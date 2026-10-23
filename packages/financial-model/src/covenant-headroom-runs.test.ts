import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildCovenantHeadroomRuns, covenantHeadroomRunIds} from "./covenant-headroom-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded covenant headroom evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildCovenantHeadroomRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers the test, the policy, scenarios, contrasts, consequence and the open question", () => {
    expect(records.get(covenantHeadroomRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "december-by-the-indenture-definition", "headroom-in-ebitda-and-net-debt-to-the-covenant", "reverse-test-on-the-unrealized-second-half",
      "board-policy-binds-first", "adverse-case-in-december", "a-larger-season-in-december", "season-weighs-half-a-turn-at-the-test-date",
      "december-2027-base-and-adverse", "managerial-june-reading-is-a-contrast", "original-indenture-limit-is-superseded",
      "breach-is-not-automatic-and-the-chain-is-named", "unwritten-policy-definition-is-a-question", "turn-two-policy-on-managerial-ebitda", "absent-cash-is-a-gap-not-a-default"]);
    expect(records.get(covenantHeadroomRunIds.adversarial)!.cases).toHaveLength(10);
    expect(records.get(covenantHeadroomRunIds.consistency)!.cases).toHaveLength(6);
  });
});
