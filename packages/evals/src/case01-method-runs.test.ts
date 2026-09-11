import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";

import {buildCase01MethodRuns, case01MethodIds, case01MethodRunId} from "./case01-method-runs";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const records = loadDeterministicMethodRuns(resolve(here, "../../credit-playbook/knowledge/reviews/runs"));

describe("recorded Case 01 deterministic runs", () => {
  it("reproduces every committed run exactly, with no model in the loop", () => {
    const evidence = buildCase01MethodRuns();
    expect(evidence).toHaveLength(case01MethodIds.length * 3);
    for (const entry of evidence) {
      const record = records.get(entry.runId);
      expect(record, `${entry.runId} is not on record`).toBeDefined();
      expect(record!.evidenceFingerprint).toBe(entry.evidenceFingerprint);
      expect(record!.cases).toEqual(entry.cases);
      expect(record!.method).toEqual(entry.method);
      expect(record!.executor).toEqual(entry.executor);
      expect(record!.result).toBe("pass");
      expect(record!.modelCalls).toBe(0);
      expect(runCountsForPromotion(record!)).toBe(true);
    }
  });

  it("covers the frozen gold case, the adversarial ids of each method and ten permutations", () => {
    for (const methodId of case01MethodIds) {
      expect(records.get(case01MethodRunId(methodId, "gold"))!.cases.map((entry) => entry.id)).toEqual(["gc01-analista-ib-camil"]);
      const adversarial = records.get(case01MethodRunId(methodId, "adversarial"))!;
      expect(adversarial.cases.length, methodId).toBeGreaterThan(0);
      for (const entry of adversarial.cases) expect(entry.id, methodId).toMatch(/^adversarial:gc01:/);
      expect(records.get(case01MethodRunId(methodId, "consistency"))!.cases, methodId).toHaveLength(10);
    }
  });

  it("records exactly the adversarial ids the methods declare in their frontmatter", async () => {
    const {loadMethodLibrary} = await import("@offroad/credit-playbook");
    const knowledge = resolve(here, "../../credit-playbook/knowledge");
    const library = loadMethodLibrary(resolve(knowledge, "procedures"), resolve(knowledge, "reviews"));
    for (const methodId of case01MethodIds) {
      const method = library.methods.find((entry) => entry.procedure.id === methodId)!;
      const recorded = records.get(case01MethodRunId(methodId, "adversarial"))!.cases.map((entry) => entry.id);
      expect([...recorded].sort(), methodId).toEqual([...method.frontmatter.adversarial_case_ids].sort());
    }
  });

  it("fails a run whose observation stops matching the declared expectation", () => {
    const consistency = records.get(case01MethodRunId("build-debt-ledger", "consistency"))!;
    const tampered = {...consistency, cases: consistency.cases.map((entry, index) => (index === 0 ? {...entry, passed: false} : entry))};
    expect(runCountsForPromotion({...tampered, result: "pass"})).toBe(false);
    expect(runCountsForPromotion({...consistency, evidenceFingerprint: "0".repeat(64)})).toBe(false);
  });
});
