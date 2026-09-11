import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {describe, expect, it} from "vitest";

import {projectCapability} from "@offroad/work-plan";

import {loadMethodLibrary} from "./procedure-markdown";
import {
  specialistMethodApprovalManifest,
  specialistMethodRuntimeManifest,
  specialistMethodRuntimeManifestHash,
  specialistTaskCapabilityRuntimeManifest,
  specialistTaskCapabilityRuntimeManifestHash,
} from "./method-runtime-manifest";

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

  it("is an exact bundled projection of each method's execution accreditation", () => {
    const library = loadMethodLibrary(
      resolve(here, "../knowledge/procedures"),
      resolve(here, "../knowledge/reviews"),
    );
    const expected = library.methods.flatMap((method) => {
      const frontmatter = method.frontmatter;
      if (frontmatter.capability_availability === undefined) return [];
      return frontmatter.task_specs.map((taskId) => ({
        taskId,
        executorKey: `${frontmatter.implementation_module}#${frontmatter.implementation_export}`,
        executorVersion: frontmatter.version,
        procedure: {id: frontmatter.id, version: frontmatter.version},
        availability: frontmatter.capability_availability,
        exposure: frontmatter.capability_exposure,
        allowedUses: frontmatter.capability_allowed_uses,
        allowedEvidenceRegimes: frontmatter.capability_allowed_evidence_regimes,
        allowedDataClasses: frontmatter.capability_allowed_data_classes,
        allowedSourceClasses: frontmatter.capability_allowed_source_classes,
        allowedProviderIds: frontmatter.capability_allowed_provider_ids,
        allowedToolIds: frontmatter.capability_allowed_tool_ids,
        providerRequired: frontmatter.capability_provider_required,
        maximumEffect: frontmatter.capability_maximum_effect,
        allowlistedTenantIds: [],
        allowlistedProjectIds: [],
      }));
    });
    expect(specialistTaskCapabilityRuntimeManifest).toEqual(expected);
    expect(specialistTaskCapabilityRuntimeManifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("projects the founder approval of every method that reached production", () => {
    const library = loadMethodLibrary(
      resolve(here, "../knowledge/procedures"),
      resolve(here, "../knowledge/reviews"),
    );
    const expected = library.methods
      .filter((method) => method.procedure.maturity === "production")
      .map((method) => ({
        procedure: {id: method.procedure.id, version: method.procedure.version},
        approvedBy: method.procedure.owner.approvedBy,
        approvedAt: method.procedure.owner.approvedAt,
        approvalSource: method.procedure.owner.approvalSource,
      }));
    expect(specialistMethodApprovalManifest).toEqual(expected);
    // The contract already refuses a name without a date and a source; the projection keeps all three.
    for (const approval of specialistMethodApprovalManifest) {
      expect(approval.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(approval.approvalSource.length).toBeGreaterThan(0);
    }
    // A method that spends a model call never reaches production: its prose step has no recorded run.
    for (const approval of specialistMethodApprovalManifest) {
      const method = library.methods.find((entry) => entry.procedure.id === approval.procedure.id)!;
      expect(method.frontmatter.max_model_calls, approval.procedure.id).toBe(0);
    }
  });

  it("keeps the project entry's debt capability on exactly the methods that reached production", () => {
    const library = loadMethodLibrary(
      resolve(here, "../knowledge/procedures"),
      resolve(here, "../knowledge/reviews"),
    );
    // The project work entry names the methods it executes. It lives in work-plan, which cannot
    // import this package, so the projection is pinned here instead: promoting a method, demoting
    // one or bumping a version fails this test rather than drifting from the entry.
    const declared = projectCapability("debt_structure_analysis").methods ?? [];
    const production = library.methods
      .filter((method) => method.procedure.maturity === "production")
      .map((method) => ({id: method.procedure.id, version: method.procedure.version}));
    expect(declared).toEqual(production);
  });
});
