import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {compileMethodDocument, methodMayRunInStaging} from "./procedure-markdown";
import {specialistMethodApprovalManifest, specialistMethodRuntimeManifest} from "./method-runtime-manifest";

const sourcePath = "capital/prepare-capital-structure-decision.md";
const source = readFileSync(join(import.meta.dirname, "../knowledge/procedures", sourcePath), "utf8");

describe("capital structure authoring boundary", () => {
  it("compiles the actual candidate without authorizing a task or staging execution", () => {
    const method = compileMethodDocument(source, sourcePath);
    expect(method.procedure.maturity).toBe("candidate");
    expect(method.procedure.implementation!.executor.exportName).toBe("prepareCapitalProcedurePacketV2");
    expect(method.frontmatter.task_specs).toEqual([]);
    expect(methodMayRunInStaging(method)).toBe(false);
    expect(specialistMethodRuntimeManifest.some((entry) => entry.procedure.id === method.procedure.id)).toBe(false);
    expect(specialistMethodApprovalManifest.some((entry) => entry.procedure.id === method.procedure.id)).toBe(false);
  });

  it("rejects promotion by changing only the candidate maturity label", () => {
    const withoutImplementation = source.replace(/^(implementation_module|implementation_export|result_contract|persistence_mode|persistence_target):.*\n/gm, "");
    expect(() => compileMethodDocument(withoutImplementation.replace("maturity: candidate", "maturity: implemented"), sourcePath)).toThrow(/implementation evidence/);
    for (const maturity of ["tested", "production"]) {
      expect(() => compileMethodDocument(source.replace("maturity: candidate", `maturity: ${maturity}`), sourcePath))
        .toThrow(/independent review/);
    }
    expect(() => compileMethodDocument(source.replace("maturity: candidate", "maturity: production"), sourcePath))
      .toThrow(/founder's approval/);
  });
});
