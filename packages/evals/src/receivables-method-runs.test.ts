import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";

import {buildReceivablesMethodRuns, receivablesAdversarialRunCaseIds, receivablesMethodRunIds} from "./receivables-method-runs";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const records = loadDeterministicMethodRuns(resolve(here, "../../credit-playbook/knowledge/reviews/runs"));

describe("recorded R01 deterministic runs", () => {
  it("reproduces every committed run exactly, with no model in the loop", () => {
    for (const evidence of buildReceivablesMethodRuns()) {
      const record = records.get(evidence.runId);
      expect(record, `${evidence.runId} is not on record`).toBeDefined();
      expect(record!.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record!.cases).toEqual(evidence.cases);
      expect(record!.result).toBe("pass");
      expect(record!.modelCalls).toBe(0);
      expect(runCountsForPromotion(record!)).toBe(true);
    }
  });

  it("covers the frozen gold case, the declared adversarial ids and twenty permutations", () => {
    expect(records.get(receivablesMethodRunIds.gold)!.cases.map((entry) => entry.id)).toEqual(["gc03-assessor-recebiveis"]);
    expect(records.get(receivablesMethodRunIds.adversarial)!.cases.map((entry) => entry.id)).toEqual([...receivablesAdversarialRunCaseIds]);
    expect(records.get(receivablesMethodRunIds.consistency)!.cases).toHaveLength(20);
  });

  it("fails a run whose observation stops matching the declared expectation", () => {
    const consistency = records.get(receivablesMethodRunIds.consistency)!;
    const tampered = {...consistency, cases: consistency.cases.map((entry, index) => index === 0 ? {...entry, passed: false} : entry)};
    expect(runCountsForPromotion({...tampered, result: "pass"})).toBe(false);
    expect(runCountsForPromotion({...consistency, evidenceFingerprint: "0".repeat(64)})).toBe(false);
  });
});
