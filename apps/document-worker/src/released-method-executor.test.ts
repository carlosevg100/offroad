import {describe, expect, it} from "vitest";
import {diversifiedReceivablesCase, receivablesParametricScenarios, underwriteReceivablesPool} from "@offroad/receivables-analysis";
import {loadReleasedReceivables, releasedMethodArtifact} from "./released-method-executor";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import gold from "./released-r01-gold.json";
import {releasedMethodArtifacts} from "./released-methods.generated";

describe("immutable published executor", () => {
  it("runs the released calculation with byte-identical gold and stressed results", () => {
    const released = loadReleasedReceivables();
    for (const caseInput of [diversifiedReceivablesCase("release-gold"), ...receivablesParametricScenarios.map(s => s.input)]) {
      const input = {currency: "BRL" as const, case: caseInput};
      const result = JSON.stringify(released.underwriteReceivablesPool(input));
      expect(createHash("sha256").update(result).digest("hex")).toBe((gold.results as Record<string, string>)[caseInput.id]);
    }
    // Separate module closure, not a reference to today's workspace implementation.
    expect(released.underwriteReceivablesPool).not.toBe(underwriteReceivablesPool);
  });
  it("keeps input and output validation inside the released artifact", () => {
    const released = loadReleasedReceivables();
    expect(released.receivablesPoolUnderwritingInputSchema.safeParse({currency: "BRL", case: {}}).success).toBe(false);
    expect(released.receivablesPoolUnderwritingSchema.safeParse({schema_version: "method.underwrite-receivables-pool.v1"}).success).toBe(false);
    expect(() => released.underwriteReceivablesPool({} as never)).toThrow();
  });
  it("rejects a missing version and a substituted manifest without latest-version fallback", () => {
    const release = releasedMethodArtifacts[0];
    expect(() => releasedMethodArtifact({...release, methodVersion: "unpublished"})).toThrow("published_method_executor_unavailable");
    expect(() => releasedMethodArtifact({...release, manifestHash: "0".repeat(64)})).toThrow("published_method_executor_unavailable");
  });
  it("ships exactly the artifact named by the manifest-bound registry", () => {
    const release = releasedMethodArtifacts[0];
    const bytes = readFileSync(new URL(`../released-methods/${release.artifactHash}.cjs`, import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(release.artifactHash);
  });
});
