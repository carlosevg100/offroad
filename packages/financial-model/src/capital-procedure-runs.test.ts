import {financialCoreVersion} from "@offroad/financial-core";
import {loadHistoricalCapitalRuns} from "../scripts/historical-capital-runs.mjs";
import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildCapitalProcedureRuns, capitalProcedureRunIds} from "./capital-procedure-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded capital procedure evaluations", () => {
  it("reexecutes every gold adversarial and consistency case and reproduces its recorded fingerprint", async () => {
    const historical = await loadHistoricalCapitalRuns();
    expect(historical.fixtureFinancialCoreVersion).toBe("2026.09.20-v24");
    for (const evidence of historical.buildCapitalProcedureRuns()) {
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
  it("evaluates current prospective calculations without relabeling historical evidence", () => {
    expect(financialCoreVersion).toBe("2026.10.07-v26");
    for (const evidence of buildCapitalProcedureRuns()) {
      const record = records.get(evidence.runId)!;
      expect(evidence.result).toBe("pass");
      expect(evidence.cases.map(c => ({id:c.id,expectation:c.expectation,observed:c.observed,passed:c.passed})))
        .toEqual(record.cases.map(c => ({id:c.id,expectation:c.expectation,observed:c.observed,passed:c.passed})));
      expect(evidence.evidenceFingerprint).not.toBe(record.evidenceFingerprint);
    }
  }, 30_000);
  it("covers the full packet including contract divergence negative cash framing and missing evidence", () => {
    const gold = records.get(capitalProcedureRunIds.gold)!;
    expect(gold.cases.map(c => c.id)).toEqual([
      "cash-identity-maintain-change-adverse", "contractual-definition-and-adopted-basis",
      "no-projection-no-fabricated-company", "absent-source-is-not-zero",
      "contribution-does-not-overwrite-adoption", "interest-amortization-without-implied-cash-adoption",
      "negative-cash-does-not-consume-restricted-balance",
    ]);
    expect(records.get(capitalProcedureRunIds.adversarial)!.cases).toHaveLength(8);
    expect(records.get(capitalProcedureRunIds.consistency)!.cases).toHaveLength(6);
  });
  it("rejects a stale or failed record without converting numerical evidence into approval", () => {
    const record = records.get(capitalProcedureRunIds.gold)!;
    expect(runCountsForPromotion({...record, evidenceFingerprint: "0".repeat(64)})).toBe(false);
    expect(runCountsForPromotion({...record, cases: record.cases.map((c, i) => i ? c : {...c, passed: false})})).toBe(false);
    expect(record.notes).toContain("do not constitute independent review");
  });
});
