import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {describe, expect, it} from "vitest";

import {loadDeterministicMethodRuns, runCountsForPromotion, deterministicRunEvidenceFingerprint} from "./method-run-record";
import {loadMethodLibrary} from "./procedure-markdown";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const library = loadMethodLibrary(resolve(here, "../knowledge/procedures"), resolve(here, "../knowledge/reviews"));
const runs = loadDeterministicMethodRuns(resolve(here, "../knowledge/reviews/runs"));

describe("recorded deterministic runs behind a maturity rung", () => {
  it("resolves every declared gold, adversarial and consistency run to a passing record of this method", () => {
    const declared = library.methods.flatMap((method) => (
      (["gold", "adversarial", "consistency"] as const).flatMap((kind) => (
        method.procedure.testRuns[kind].map((runId) => ({method, kind, runId}))
      ))
    ));
    expect(declared.length).toBeGreaterThan(0);
    for (const {method, kind, runId} of declared) {
      const record = runs.get(runId);
      expect(record, `${method.procedure.id} declares run ${runId} which is not on record`).toBeDefined();
      expect(record!.kind).toBe(kind);
      expect(record!.method).toEqual({id: method.procedure.id, version: method.procedure.version});
      expect(record!.executor.module).toBe(method.procedure.implementation?.executor.module);
      expect(record!.executor.exportName).toBe(method.procedure.implementation?.executor.exportName);
      expect(runCountsForPromotion(record!)).toBe(true);
    }
  });

  it("keeps a rung above ai_reviewed impossible without the three kinds on record", () => {
    for (const method of library.methods) {
      if (!["tested", "ready_for_founder", "production"].includes(method.procedure.maturity)) continue;
      for (const kind of ["gold", "adversarial", "consistency"] as const) {
        expect(method.procedure.testRuns[kind].length, `${method.procedure.id} has no ${kind} run`).toBeGreaterThan(0);
      }
    }
  });

  it("refuses a record whose evidence no longer reproduces its fingerprint", () => {
    const [record] = [...runs.values()];
    expect(record).toBeDefined();
    expect(deterministicRunEvidenceFingerprint(record!)).toBe(record!.evidenceFingerprint);
    expect(runCountsForPromotion({...record!, cases: record!.cases.map((entry) => ({...entry, passed: false}))})).toBe(false);
    expect(runCountsForPromotion({...record!, result: "fail"})).toBe(false);
  });
});
