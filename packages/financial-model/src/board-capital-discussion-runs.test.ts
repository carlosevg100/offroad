import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {boardCapitalDiscussionRunIds, buildBoardCapitalDiscussionRuns} from "./board-capital-discussion-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded board capital discussion evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildBoardCapitalDiscussionRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers the outline, the deliberations, the titles, the identity check, the pending items, the questions and the omission rule", () => {
    expect(records.get(boardCapitalDiscussionRunIds.gold)!.cases).toHaveLength(54);
    expect(records.get(boardCapitalDiscussionRunIds.adversarial)!.cases).toHaveLength(104);
    expect(records.get(boardCapitalDiscussionRunIds.consistency)!.cases).toHaveLength(6);
  });
});
