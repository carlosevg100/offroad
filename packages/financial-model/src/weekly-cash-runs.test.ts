import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildWeeklyCashRuns, weeklyCashRunIds} from "./weekly-cash-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded weekly cash evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildWeeklyCashRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers the week, the causes, the calendar, the actions and the sensitivities", () => {
    expect(records.get(weeklyCashRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "tightest-week-is-the-week-of-21-december", "two-weeks-under-the-minimum", "causes-named-across-the-weeks-under-the-minimum",
      "december-closing-reconciles-with-the-projection", "closing-hides-the-week", "calendar-of-what-falls-due-by-31-december",
      "actions-costed-for-the-time-in-use", "two-actions-in-one-case-prove-neither-covers-alone", "cheapest-covering-action-is-the-existing-overdraft", "overdraft-open-at-the-covenant-test-nets-to-zero",
      "a-harvest-of-30-million", "harvest-delayed-two-weeks", "without-the-harvest-line", "absent-minimum-is-a-gap-not-a-default"]);
    expect(records.get(weeklyCashRunIds.adversarial)!.cases).toHaveLength(13);
    expect(records.get(weeklyCashRunIds.consistency)!.cases).toHaveLength(6);
  });
});
