import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildCapitalProcedureV2Runs, capitalProcedureV2RunIds} from "./capital-procedure-v2-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded capital procedure v2 evaluations", () => {
  it("reexecutes every gold adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of [...buildCapitalProcedureV2Runs(), ...buildCapitalProcedureV2Runs("2026.09.21-v4")]) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass");
      expect(record.modelCalls).toBe(0);
      expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 30_000); // Whole-suite replay under concurrent CI load; latency is measured separately.
  it("covers the full packet including contract divergence negative cash framing and missing evidence", () => {
    const gold = records.get(capitalProcedureV2RunIds.gold)!;
    expect(gold.cases.map(c => c.id)).toEqual([
      "cash-identity-maintain-change-adverse", "contractual-definition-and-adopted-basis",
      "no-projection-no-fabricated-company", "absent-source-is-not-zero",
      "contribution-does-not-overwrite-adoption", "interest-amortization-without-implied-cash-adoption",
      "negative-cash-does-not-consume-restricted-balance",
      "indexed-amortization-coupon-independent-oracle", "known-indexed-contract-remains-unresolved",
    ]);
    expect(records.get(capitalProcedureV2RunIds.adversarial)!.cases).toHaveLength(8);
    expect(records.get(capitalProcedureV2RunIds.consistency)!.cases).toHaveLength(9);
  });
  it("rejects a stale or failed record without converting numerical evidence into approval", () => {
    const record = records.get(capitalProcedureV2RunIds.gold)!;
    expect(runCountsForPromotion({...record, evidenceFingerprint: "0".repeat(64)})).toBe(false);
    expect(runCountsForPromotion({...record, cases: record.cases.map((c, i) => i ? c : {...c, passed: false})})).toBe(false);
    expect(record.notes).toContain("do not constitute independent review");
  });
});
