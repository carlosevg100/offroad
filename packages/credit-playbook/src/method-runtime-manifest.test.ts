import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {describe, expect, it} from "vitest";

import {loadMethodLibrary} from "./procedure-markdown";
import {specialistMethodRuntimeManifest, specialistMethodRuntimeManifestHash} from "./method-runtime-manifest";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));

describe("specialist method runtime manifest", () => {
  it("is an exact bundled projection of specialization-bound Markdown methods", () => {
    const library = loadMethodLibrary(
      resolve(here, "../knowledge/procedures"),
      resolve(here, "../knowledge/reviews"),
    );
    const expected = library.methods.flatMap((method) => {
      const implementation = method.procedure.implementation;
      if (!implementation || method.frontmatter.required_depth_pack_ids.length === 0 || method.frontmatter.task_specs.length === 0) return [];
      return [{
        procedure: {id: method.procedure.id, version: method.procedure.version, maturity: method.procedure.maturity},
        taskIds: [...method.frontmatter.task_specs].sort(),
        requiredPackIds: [...method.frontmatter.required_depth_pack_ids].sort(),
        bindingPriority: method.frontmatter.binding_priority,
        executor: implementation.executor,
        resultContract: implementation.resultContract,
        sourcePath: method.sourcePath,
        sourceHash: method.sourceHash,
      }];
    });
    expect(specialistMethodRuntimeManifest).toEqual(expected);
    expect(specialistMethodRuntimeManifestHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
