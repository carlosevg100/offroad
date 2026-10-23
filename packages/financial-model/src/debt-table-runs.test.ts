import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildDebtTableRuns, debtTableRunIds} from "./debt-table-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded debt table evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildDebtTableRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers reconciliation, definitions, profile, security and the boundaries of the question", () => {
    expect(records.get(debtTableRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "principal-and-accounting-balance-reconcile-exactly", "credit-line-is-a-limit-not-debt", "four-definitions-with-the-bridge",
      "bank-guarantee-stays-outside-every-balance", "schedule-by-year-independent-oracle", "tenor-due-in-twelve-months-and-concentration",
      "average-nominal-cost-under-the-adopted-curve", "basket-occupied-by-the-bradesco-security", "cross-default-chain-from-the-lowest-threshold",
      "leverage-in-the-bank-and-indenture-definitions", "completeness-asks-for-the-external-register", "drawn-line-counts-in-the-contractual-view",
      "schedule-short-of-principal-is-a-gap", "absent-cash-is-a-gap-not-a-default"]);
    expect(records.get(debtTableRunIds.adversarial)!.cases).toHaveLength(10);
    expect(records.get(debtTableRunIds.consistency)!.cases).toHaveLength(6);
  });
});
