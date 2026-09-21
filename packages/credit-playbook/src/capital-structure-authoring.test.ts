import {compileReviewedCapital as compileMethodDocument} from "./reviewed-capital.test-support";
import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import { methodMayRunInStaging} from "./procedure-markdown";
import {specialistMethodApprovalManifest, specialistMethodRuntimeManifest} from "./method-runtime-manifest";

const sourcePath = "capital/prepare-capital-structure-decision.md";
const source = readFileSync(join(import.meta.dirname, "../knowledge/procedures", sourcePath), "utf8");

describe("capital structure authoring boundary", () => {
  it("compiles the actual candidate with recorded review without authorizing a task", () => {
    const method = compileMethodDocument(source, sourcePath);
    expect(method.procedure.maturity).toBe("tested");
    expect(method.procedure.implementation!.executor.exportName).toBe("prepareCapitalProcedurePacketV2");
    expect(method.frontmatter.task_specs).toEqual([]);
    expect(methodMayRunInStaging(method)).toBe(true);
    expect(specialistMethodRuntimeManifest.some((entry) => entry.procedure.id === method.procedure.id)).toBe(false);
    expect(specialistMethodApprovalManifest.some((entry) => entry.procedure.id === method.procedure.id)).toBe(false);
  });

  it("rejects promotion by changing only the candidate maturity label", () => {
    const withoutImplementation = source.replace(/^(implementation_module|implementation_export|result_contract|persistence_mode|persistence_target):.*\n/gm, "");
    expect(() => compileMethodDocument(withoutImplementation.replace("maturity: tested", "maturity: implemented"), sourcePath)).toThrow(/implementation evidence/);
    for (const maturity of ["tested", "production"]) {
      expect(() => compileMethodDocument(source.replace(/^review_ids:.*\n/m, "").replace("maturity: tested", `maturity: ${maturity}`), sourcePath))
        .toThrow(/independent review/);
    }
    expect(() => compileMethodDocument(source.replace("maturity: tested", "maturity: production"), sourcePath))
      .toThrow(/founder's approval/);
  });
});
